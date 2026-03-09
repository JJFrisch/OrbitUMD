import { create } from "zustand";
import { buildCalendarMeetings, assignConflictIndexes, computeVisibleHourBounds } from "../utils/scheduleLayout";
import { extractDeptPrefix, getSectionIdentityKey, normalizeSearchInput } from "../utils/formatting";
import { getActiveInstructors, getDepartments, getInstructorLookup, getSectionsForCourse, searchCoursesWithStrategy } from "../services/courseSearchService";
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

  calendarMeetings: () => CalendarMeeting[];
  calendarBounds: () => { startHour: number; endHour: number };
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

      const instructors = await getActiveInstructors(resolved.term, resolved.year).catch(() => []);
      const instructorLookup = await getInstructorLookup(resolved.term, resolved.year).catch(() => ({ byName: {} }));
      if (get().latestRequestToken === token) {
        set({ instructors, instructorLookup });
      }

      let instructor: string | undefined;
      if (filters.instructorInput.trim()) {
        const normalizedNeedle = filters.instructorInput.toLowerCase();
        const matches = instructors.filter((name) => name.toLowerCase().includes(normalizedNeedle));
        if (matches.length === 1) {
          instructor = matches[0];
        }
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
        searchResults: results,
        searchPending: false,
        filters: { ...state.filters, instructor },
        suggestions: computeSuggestions(state.normalizedInput, state.departments),
      }));
    } catch (error) {
      if (get().latestRequestToken !== token) return;
      set({
        searchPending: false,
        searchError: error instanceof Error ? error.message : "Search failed",
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

    if (hoveredSelection) {
      meetings.push(
        ...buildCalendarMeetings({
          sectionKey: hoveredSelection.sectionKey,
          courseCode: hoveredSelection.course.courseCode,
          sectionCode: hoveredSelection.section.sectionCode,
          title: hoveredSelection.course.name,
          instructor: hoveredSelection.section.instructor,
          meetings: hoveredSelection.section.meetings,
          isHoverPreview: true,
        })
      );
    }

    return assignConflictIndexes(meetings);
  },

  calendarBounds: () => {
    const meetings = get().calendarMeetings().filter((meeting) => meeting.day !== "Other");
    return computeVisibleHourBounds(meetings, { printMode: get().printMode });
  },
}));
