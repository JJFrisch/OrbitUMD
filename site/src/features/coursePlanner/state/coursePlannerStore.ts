import { create } from "zustand";
import { buildCalendarMeetings, assignConflictIndexes, computeVisibleHourBounds } from "../utils/scheduleLayout";
import { extractDeptPrefix, getSectionIdentityKey, normalizeSearchInput } from "../utils/formatting";
import { getActiveInstructors, getDepartments, getInstructorLookup, getSectionsForCourse, searchCoursesWithStrategy } from "../services/courseSearchService";
import {
  saveScheduleWithSelections,
  listSchedulesForTerm,
  loadScheduleById,
  type ScheduleWithSelections,
} from "../../../lib/repositories/userSchedulesRepository";
import type {
  CalendarMeeting,
  Course,
  Department,
  InstructorLookup,
  ScheduleSelection,
  SearchFilters,
  VisibilityMode,
} from "../types/coursePlanner";

type RequestToken = number;

interface CoursePlannerState {
  term: string;
  year: number;
  resolvedTerm: string;
  resolvedYear: number;
  readOnly: boolean;
  printMode: boolean;
  visibilityMode: VisibilityMode;

  searchInput: string;
  normalizedInput: string;
  searchPending: boolean;
  searchError?: string;
  searchResults: Course[];
  departments: Department[];
  instructors: string[];
  instructorLookup: InstructorLookup;
  suggestions: string[];
  highlightedSuggestionIndex: number;

  filters: SearchFilters;

  selections: Record<string, ScheduleSelection>;
  hoveredSelection: ScheduleSelection | null;
  selectedInfoKey: string | null;

  latestRequestToken: RequestToken;

  setSearchInput: (input: string) => void;
  highlightSuggestion: (direction: 1 | -1) => void;
  applyHighlightedSuggestion: () => void;
  setFilters: (updater: (current: SearchFilters) => SearchFilters) => void;
  resetFilters: () => void;
  setVisibilityMode: (mode: VisibilityMode) => void;
  setPrintMode: (enabled: boolean) => void;
  setTermOverride: (term: SearchFilters["searchTerm"]) => void;
  setCatalogTerm: (term: string, year: number) => void;

  executeSearch: () => Promise<void>;
  loadSectionsForCourse: (course: Course) => Promise<void>;

  toggleSection: (course: Course, section: ScheduleSelection["section"]) => void;
  setHoveredSection: (course: Course, section: ScheduleSelection["section"] | null) => void;
  toggleInfoPanel: (sectionKey: string) => void;
  removeSelection: (sectionKey: string) => void;
  replaceSelections: (selections: ScheduleSelection[]) => void;
  addPlannedCourseByCode: (input: { courseCode: string; title: string; credits?: number; genEds?: string[] }) => void;

  calendarMeetings: () => CalendarMeeting[];
  calendarBounds: () => { startHour: number; endHour: number };

  // Schedule persistence
  activeScheduleId: string | null;
  savedSchedules: ScheduleWithSelections[];
  savePending: boolean;
  saveError?: string;

  saveSchedule: (name: string) => Promise<void>;
  loadSchedule: (scheduleId: string) => Promise<ScheduleWithSelections | null>;
  refreshScheduleList: () => Promise<void>;
  startNewSchedule: () => void;
}

const DEFAULT_FILTERS: SearchFilters = {
  genEds: [],
  instructorInput: "",
  instructor: undefined,
  minCredits: null,
  maxCredits: null,
  onlyOpen: false,
  searchTerm: "",
};

function resolveTermYear(term: string, year: number, override: SearchFilters["searchTerm"]): { term: string; year: number } {
  if (!override) return { term, year };

  const mapping: Record<NonNullable<SearchFilters["searchTerm"]>, string> = {
    Winter: "12",
    Spring: "01",
    Summer: "05",
    Fall: "08",
    "": "08",
  };

  const resolved = mapping[override] ?? term;
  return { term: resolved, year };
}

function computeSuggestions(input: string, departments: Department[]): string[] {
  if (!input) return [];
  const prefix = extractDeptPrefix(input);
  if (!prefix) return [];
  const matches = departments.filter((dept) => dept.code.startsWith(prefix));
  if (matches.length <= 1) return [];
  return matches.slice(0, 8).map((dept) => dept.code);
}

interface StoredScheduleSelectionsPayload {
  sectionIds?: string[];
  selections?: ScheduleSelection[];
}

function getSelectionId(selection: ScheduleSelection): string {
  return selection.section.id || selection.sectionKey;
}

function mapSelectionsToSectionIds(selections: Record<string, ScheduleSelection>): string[] {
  const deduped = new Set<string>();
  for (const selection of Object.values(selections)) {
    deduped.add(getSelectionId(selection));
  }
  return Array.from(deduped);
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message.trim() : "";
    const details = typeof record.details === "string" ? record.details.trim() : "";
    const hint = typeof record.hint === "string" ? record.hint.trim() : "";
    const parts = [message, details, hint].filter((part) => part.length > 0);
    if (parts.length > 0) {
      return parts.join(" | ");
    }
  }

  return fallback;
}

function mapStoredSelectionsToState(stored: unknown): Record<string, ScheduleSelection> {
  const payload = (stored ?? []) as StoredScheduleSelectionsPayload | ScheduleSelection[];
  const rawSelections = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.selections)
      ? payload.selections
      : [];

  const selectionsMap: Record<string, ScheduleSelection> = {};
  for (const sel of rawSelections) {
    if (sel?.sectionKey) {
      selectionsMap[sel.sectionKey] = sel;
    }
  }

  return selectionsMap;
}

export const useCoursePlannerStore = create<CoursePlannerState>((set, get) => ({
  term: "08",
  year: 2026,
  resolvedTerm: "08",
  resolvedYear: 2026,
  readOnly: false,
  printMode: false,
  visibilityMode: "full",

  searchInput: "",
  normalizedInput: "",
  searchPending: false,
  searchError: undefined,
  searchResults: [],
  departments: [],
  instructors: [],
  instructorLookup: { byName: {} },
  suggestions: [],
  highlightedSuggestionIndex: -1,

  filters: DEFAULT_FILTERS,

  selections: {},
  hoveredSelection: null,
  selectedInfoKey: null,

  activeScheduleId: null,
  savedSchedules: [],
  savePending: false,
  saveError: undefined,

  latestRequestToken: 0,

  setSearchInput: (input) => {
    const normalizedInput = normalizeSearchInput(input);
    const suggestions = computeSuggestions(normalizedInput, get().departments);
    set({
      searchInput: input,
      normalizedInput,
      suggestions,
      highlightedSuggestionIndex: suggestions.length > 0 ? 0 : -1,
    });
  },

  highlightSuggestion: (direction) => {
    const { suggestions, highlightedSuggestionIndex } = get();
    if (suggestions.length === 0) return;
    const next = (highlightedSuggestionIndex + direction + suggestions.length) % suggestions.length;
    set({ highlightedSuggestionIndex: next });
  },

  applyHighlightedSuggestion: () => {
    const { suggestions, highlightedSuggestionIndex } = get();
    if (highlightedSuggestionIndex < 0 || highlightedSuggestionIndex >= suggestions.length) return;
    const suggestion = suggestions[highlightedSuggestionIndex];
    get().setSearchInput(suggestion);
  },

  setFilters: (updater) => {
    set((state) => ({ filters: updater(state.filters) }));
  },

  resetFilters: () => {
    set({ filters: DEFAULT_FILTERS });
  },

  setVisibilityMode: (mode) => set({ visibilityMode: mode }),
  setPrintMode: (enabled) => set({ printMode: enabled }),

  setTermOverride: (termOverride) => {
    set((state) => ({
      filters: { ...state.filters, searchTerm: termOverride },
    }));
  },

  setCatalogTerm: (term, year) => {
    set((state) => ({
      term,
      year,
      resolvedTerm: term,
      resolvedYear: year,
      filters: {
        ...state.filters,
        searchTerm: "",
      },
    }));
  },

  executeSearch: async () => {
    const token = get().latestRequestToken + 1;
    set({ latestRequestToken: token, searchPending: true, searchError: undefined });

    try {
      if (get().departments.length === 0) {
        const departments = await getDepartments();
        if (get().latestRequestToken !== token) return;
        set({ departments });
      }

      const { term, year, filters, normalizedInput } = get();
      const resolved = resolveTermYear(term, year, filters.searchTerm);
      set({ resolvedTerm: resolved.term, resolvedYear: resolved.year });

      let instructor: string | undefined;
      if (filters.instructorInput.trim()) {
        const instructors = await getActiveInstructors(resolved.term, resolved.year).catch(() => []);
        const normalizedNeedle = filters.instructorInput.toLowerCase();
        const matches = instructors.filter((name) => name.toLowerCase().includes(normalizedNeedle));
        if (matches.length === 1) {
          instructor = matches[0];
        }

        if (get().latestRequestToken === token) {
          set({ instructors });
        }
      } else {
        void getActiveInstructors(resolved.term, resolved.year)
          .then((instructors) => {
            if (get().latestRequestToken === token) {
              set({ instructors });
            }
          })
          .catch(() => undefined);
      }

      void getInstructorLookup(resolved.term, resolved.year)
        .then((instructorLookup) => {
          if (get().latestRequestToken === token) {
            set({ instructorLookup });
          }
        })
        .catch(() => undefined);

      if (!filters.instructorInput.trim() && get().latestRequestToken === token && get().instructors.length === 0) {
        set({ instructors: [] });
      }

      const results = await searchCoursesWithStrategy({
        normalizedInput,
        term: resolved.term,
        year: resolved.year,
        includeSections: false,
        filters: {
          ...filters,
          instructor,
        },
      });

      if (get().latestRequestToken !== token) return;

      set((state) => ({
        searchResults: results.map((result) => {
          const existing = state.searchResults.find((course) => course.courseCode === result.courseCode);
          if ((result.sections?.length ?? 0) > 0) {
            return result;
          }
          if ((existing?.sections?.length ?? 0) > 0) {
            return {
              ...result,
              sections: existing.sections,
            };
          }
          return result;
        }),
        searchPending: false,
        filters: state.filters.instructor === instructor ? state.filters : { ...state.filters, instructor },
        suggestions: computeSuggestions(state.normalizedInput, state.departments),
      }));
    } catch (error) {
      if (get().latestRequestToken !== token) return;
      set({
        searchPending: false,
        searchError: errorMessage(error, "Search failed"),
      });
    }
  },

  loadSectionsForCourse: async (course) => {
    const sections = await getSectionsForCourse(course.courseCode, get().resolvedTerm, get().resolvedYear);
    set((state) => ({
      searchResults: state.searchResults.map((item) =>
        item.courseCode === course.courseCode ? { ...item, sections } : item
      ),
    }));
  },

  toggleSection: (course, section) => {
    const key = getSectionIdentityKey(course.courseCode, section.sectionCode);

    set((state) => {
      const existing = state.selections[key];
      if (!existing) {
        return {
          selections: {
            ...state.selections,
            [key]: { sectionKey: key, course, section },
          },
        };
      }

      const isSamePayload = JSON.stringify(existing.section) === JSON.stringify(section);
      if (isSamePayload) {
        const next = { ...state.selections };
        delete next[key];
        return { selections: next, selectedInfoKey: state.selectedInfoKey === key ? null : state.selectedInfoKey };
      }

      return {
        selections: {
          ...state.selections,
          [key]: { sectionKey: key, course, section },
        },
      };
    });
  },

  setHoveredSection: (course, section) => {
    if (!section) {
      set({ hoveredSelection: null });
      return;
    }

    const key = getSectionIdentityKey(course.courseCode, section.sectionCode);
    set({ hoveredSelection: { sectionKey: key, course, section } });
  },

  toggleInfoPanel: (sectionKey) => {
    set((state) => ({ selectedInfoKey: state.selectedInfoKey === sectionKey ? null : sectionKey }));
  },

  removeSelection: (sectionKey) => {
    set((state) => {
      const next = { ...state.selections };
      delete next[sectionKey];
      return {
        selections: next,
        selectedInfoKey: state.selectedInfoKey === sectionKey ? null : state.selectedInfoKey,
      };
    });
  },

  replaceSelections: (nextSelections) => {
    const selectionMap: Record<string, ScheduleSelection> = {};
    for (const selection of nextSelections) {
      if (selection?.sectionKey) {
        selectionMap[selection.sectionKey] = selection;
      }
    }

    set({
      selections: selectionMap,
      hoveredSelection: null,
      selectedInfoKey: null,
      activeScheduleId: null,
      saveError: undefined,
    });
  },

  addPlannedCourseByCode: ({ courseCode, title, credits = 3, genEds = [] }) => {
    const normalizedCode = String(courseCode).toUpperCase().replace(/\s+/g, "");
    if (!normalizedCode) return;
    const sectionCode = "NOT CHOSEN";
    const sectionKey = `${normalizedCode}-${sectionCode}`;

    set((state) => {
      if (Object.values(state.selections).some((selection) => (
        String(selection?.course?.courseCode ?? "").toUpperCase().replace(/\s+/g, "") === normalizedCode
      ))) {
        return state;
      }

      const selection: ScheduleSelection = {
        sectionKey,
        course: {
          courseCode: normalizedCode,
          name: title || normalizedCode,
          id: normalizedCode,
          deptId: normalizedCode.slice(0, 4),
          credits,
          minCredits: credits,
          maxCredits: credits,
          genEds,
          term: "",
          year: 0,
          sections: [],
        },
        section: {
          id: sectionKey,
          courseCode: normalizedCode,
          sectionCode,
          instructor: "",
          instructors: [],
          totalSeats: 0,
          openSeats: 0,
          meetings: [],
        },
      };

      return {
        selections: {
          ...state.selections,
          [sectionKey]: selection,
        },
      };
    });
  },

  calendarMeetings: () => {
    const { selections, hoveredSelection } = get();
    const meetings = Object.values(selections).flatMap((selection) =>
      buildCalendarMeetings({
        sectionKey: selection.sectionKey,
        courseCode: selection.course.courseCode,
        sectionCode: selection.section.sectionCode,
        title: selection.course.name,
        instructor: selection.section.instructor,
        meetings: selection.section.meetings,
      })
    );

    const laidOutSelections = assignConflictIndexes(meetings);

    if (!hoveredSelection || selections[hoveredSelection.sectionKey]) {
      return laidOutSelections;
    }

    const hoverPreviewMeetings = buildCalendarMeetings({
      sectionKey: hoveredSelection.sectionKey,
      courseCode: hoveredSelection.course.courseCode,
      sectionCode: hoveredSelection.section.sectionCode,
      title: hoveredSelection.course.name,
      instructor: hoveredSelection.section.instructor,
      meetings: hoveredSelection.section.meetings,
      isHoverPreview: true,
    }).map((meeting) => ({
      ...meeting,
      conflictIndex: 0,
      conflictTotal: 1,
    }));

    return [...laidOutSelections, ...hoverPreviewMeetings];
  },

  calendarBounds: () => {
    const meetings = get().calendarMeetings().filter((meeting) => meeting.day !== "Other");
    return computeVisibleHourBounds(meetings, { printMode: get().printMode });
  },

  refreshScheduleList: async () => {
    const { resolvedTerm, resolvedYear } = get();
    try {
      const schedules = await listSchedulesForTerm(resolvedTerm, resolvedYear);
      set({ savedSchedules: schedules, saveError: undefined });
    } catch (error) {
      set({
        saveError: errorMessage(error, "Failed to load schedules"),
      });
    }
  },

  startNewSchedule: () => {
    set({
      activeScheduleId: null,
      selections: {},
      hoveredSelection: null,
      selectedInfoKey: null,
      saveError: undefined,
    });
  },

  saveSchedule: async (name) => {
    const { selections, resolvedTerm, resolvedYear, activeScheduleId } = get();
    set({ savePending: true, saveError: undefined });
    try {
      const selectionsArray = Object.values(selections);
      const sectionIds = mapSelectionsToSectionIds(selections);
      const saved = await saveScheduleWithSelections({
        id: activeScheduleId ?? undefined,
        name,
        termCode: resolvedTerm,
        termYear: resolvedYear,
        selectionsJson: {
          sectionIds,
          selections: selectionsArray,
        },
      });

      set({
        activeScheduleId: saved.id,
        savedSchedules: [
          saved,
          ...get().savedSchedules.filter((schedule) => schedule.id !== saved.id),
        ],
        savePending: false,
      });

      await get().refreshScheduleList();
    } catch (error) {
      set({
        savePending: false,
        saveError: errorMessage(error, "Save failed"),
      });
    }
  },

  loadSchedule: async (scheduleId) => {
    set({ savePending: true, saveError: undefined });
    try {
      const record = await loadScheduleById(scheduleId);
      if (!record) {
        set({ savePending: false, saveError: "Schedule not found" });
        return null;
      }

      const selectionsMap = mapStoredSelectionsToState(record.selections_json);
      const nextTerm = record.term_code && typeof record.term_year === "number"
        ? { term: record.term_code, year: record.term_year }
        : null;

      set({
        activeScheduleId: record.id,
        selections: selectionsMap,
        hoveredSelection: null,
        selectedInfoKey: null,
        ...(nextTerm
          ? {
              term: nextTerm.term,
              year: nextTerm.year,
              resolvedTerm: nextTerm.term,
              resolvedYear: nextTerm.year,
              filters: {
                ...get().filters,
                searchTerm: "",
              },
            }
          : {}),
        savePending: false,
      });
      return record;
    } catch (error) {
      set({
        savePending: false,
        saveError: errorMessage(error, "Load failed"),
      });
      return null;
    }
  },
}));
