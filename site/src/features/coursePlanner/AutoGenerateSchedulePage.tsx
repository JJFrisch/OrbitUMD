import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { CalendarDays, GripVertical, Info, Loader2, Plus, Sparkles, Star, X } from "lucide-react";
import { fetchTerms } from "@/lib/api/umdCourses";
import { saveScheduleWithSelections } from "@/lib/repositories/userSchedulesRepository";
import { compareAcademicTerms } from "@/lib/scheduling/termProgress";
import { getSectionsForCourse, searchCoursesWithStrategy } from "./services/courseSearchService";
import { useCoursePlannerStore } from "./state/coursePlannerStore";
import { getSectionIdentityKey, normalizeSearchInput } from "./utils/formatting";
import {
  assignConflictIndexes,
  buildCalendarMeetings,
  computeVisibleHourBounds,
  parseMeetingDays,
  parseTimeToHour,
} from "./utils/scheduleLayout";
import { Timeline } from "./components/schedule/Timeline";
import { ScheduleGrid } from "./components/schedule/ScheduleGrid";
import { ProjectedTimesPopover } from "./components/schedule/ProjectedTimesPopover";
import type {
  CalendarMeeting,
  Course,
  ScheduleSelection,
  SearchFilters,
  Section,
  Weekday,
} from "./types/coursePlanner";
import "./styles/coursePlanner.css";

type Season = "01" | "05" | "08" | "12";
type DeliveryMode = "face_to_face" | "blended" | "online";
type CourseKind = "required" | "optional";
type ResultsSortMode = "best" | "credits" | "spread";

interface CoursePlan {
  course: Course;
  sections: Section[];
}

interface CoursePreference {
  code: string;
  kind: CourseKind;
}

interface CourseLookupEntry {
  status: "loading" | "found" | "missing" | "error";
  termKey: string;
  course?: Course;
  message?: string;
}

interface TimeConstraint {
  startHour: number;
  endHour: number;
  excludedDays: Set<Exclude<Weekday, "Other">>;
}

interface GeneratedSchedule {
  id: string;
  selections: ScheduleSelection[];
  credits: number;
}

interface GenerationOutcome {
  schedules: GeneratedSchedule[];
  missingOptionalCodes: string[];
  bestOptionalCount: number;
  totalOptionalCount: number;
}

interface ScheduleSummary {
  classCount: number;
  earliestLabel: string;
  latestLabel: string;
}

interface CatalogTermOption {
  season: Season;
  year: number;
  label: string;
}

interface DraftPayloadV2 {
  season: Season;
  year: number;
  coursePreferences: CoursePreference[];
  minCredits: number;
  maxCredits: number;
  onlyOpen: boolean;
  allowFaceToFace: boolean;
  allowBlended: boolean;
  allowOnline: boolean;
  constraintStart: string;
  constraintEnd: string;
  excludedDays: Array<Exclude<Weekday, "Other">>;
}

const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  genEds: [],
  instructorInput: "",
  instructor: undefined,
  minCredits: null,
  maxCredits: null,
  onlyOpen: false,
  searchTerm: "",
};

const TERM_LABEL: Record<Season, string> = {
  "01": "Spring",
  "05": "Summer",
  "08": "Fall",
  "12": "Winter",
};

const COURSE_CODE_PATTERN = /^[A-Z]{4}[0-9]{3}[A-Z]{0,2}$/;
const WEEKDAYS: Array<Exclude<Weekday, "Other">> = ["M", "Tu", "W", "Th", "F"];
const GENERATE_SCHEDULE_AUTOSAVE_KEY = "orbitumd:generate-schedule:draft:v2";

function formatHourLabel(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const wholeHour = Math.floor(normalized);
  const minutes = Math.round((normalized - wholeHour) * 60);
  const period = wholeHour >= 12 ? "PM" : "AM";
  const displayHour = wholeHour % 12 === 0 ? 12 : wholeHour % 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`;
}

function normalizeCourseCode(raw: string): string {
  return normalizeSearchInput(raw);
}

function parseLegacyCourseCodes(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,]+/)
        .map((value) => normalizeCourseCode(value))
        .filter((value) => COURSE_CODE_PATTERN.test(value))
    )
  );
}

function dedupeCoursePreferences(items: CoursePreference[]): CoursePreference[] {
  const seen = new Set<string>();
  const deduped: CoursePreference[] = [];

  for (const item of items) {
    const code = normalizeCourseCode(item.code);
    if (!COURSE_CODE_PATTERN.test(code) || seen.has(code)) {
      continue;
    }

    deduped.push({ code, kind: item.kind === "optional" ? "optional" : "required" });
    seen.add(code);
  }

  return deduped;
}

function classifyDeliveryMode(section: Section): DeliveryMode {
  const onlineToken = /online|zoom|web|www|elms|asynch/i;
  const meetings = section.meetings ?? [];
  if (meetings.length === 0) {
    return "blended";
  }

  let onlineCount = 0;
  for (const meeting of meetings) {
    const location = `${meeting.location ?? ""} ${meeting.building ?? ""} ${meeting.room ?? ""}`.trim();
    if (onlineToken.test(location)) {
      onlineCount += 1;
    }
  }

  if (onlineCount === meetings.length) {
    return "online";
  }
  if (onlineCount === 0) {
    return "face_to_face";
  }
  return "blended";
}

function sectionViolatesConstraints(section: Section, constraint: TimeConstraint): boolean {
  for (const meeting of section.meetings) {
    const days = parseMeetingDays(meeting.days).filter((day): day is Exclude<Weekday, "Other"> => day !== "Other");

    if (days.some((day) => constraint.excludedDays.has(day))) {
      return true;
    }

    if (!meeting.startTime || !meeting.endTime) {
      continue;
    }

    const start = parseTimeToHour(meeting.startTime);
    const end = parseTimeToHour(meeting.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      continue;
    }

    if (start < constraint.startHour || end > constraint.endHour) {
      return true;
    }
  }

  return false;
}

function sectionsConflict(left: Section, right: Section): boolean {
  for (const leftMeeting of left.meetings) {
    const leftDays = parseMeetingDays(leftMeeting.days).filter((day) => day !== "Other");
    if (!leftMeeting.startTime || !leftMeeting.endTime || leftDays.length === 0) {
      continue;
    }

    const leftStart = parseTimeToHour(leftMeeting.startTime);
    const leftEnd = parseTimeToHour(leftMeeting.endTime);
    if (!Number.isFinite(leftStart) || !Number.isFinite(leftEnd)) {
      continue;
    }

    for (const rightMeeting of right.meetings) {
      const rightDays = parseMeetingDays(rightMeeting.days).filter((day) => day !== "Other");
      if (!rightMeeting.startTime || !rightMeeting.endTime || rightDays.length === 0) {
        continue;
      }

      const hasDayIntersection = leftDays.some((day) => rightDays.includes(day));
      if (!hasDayIntersection) {
        continue;
      }

      const rightStart = parseTimeToHour(rightMeeting.startTime);
      const rightEnd = parseTimeToHour(rightMeeting.endTime);
      if (!Number.isFinite(rightStart) || !Number.isFinite(rightEnd)) {
        continue;
      }

      if (leftStart < rightEnd && rightStart < leftEnd) {
        return true;
      }
    }
  }

  return false;
}

async function resolveCoursePlan(
  code: string,
  term: Season,
  year: number,
  onlyOpen: boolean,
  allowedDelivery: Set<DeliveryMode>,
  timeConstraint: TimeConstraint
): Promise<CoursePlan> {
  const matches = await searchCoursesWithStrategy({
    normalizedInput: code,
    term,
    year,
    includeSections: false,
    filters: DEFAULT_SEARCH_FILTERS,
  });

  const exactMatch = matches.find((course) => normalizeCourseCode(course.courseCode) === code);
  if (!exactMatch) {
    throw new Error(`Could not find course ${code} for ${TERM_LABEL[term]} ${year}.`);
  }

  const sections = await getSectionsForCourse(exactMatch.courseCode, term, year);
  const filtered = sections.filter((section) => {
    if (onlyOpen && (section.openSeats ?? 0) <= 0) {
      return false;
    }

    if (allowedDelivery.size > 0 && !allowedDelivery.has(classifyDeliveryMode(section))) {
      return false;
    }

    if (sectionViolatesConstraints(section, timeConstraint)) {
      return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    throw new Error(`No valid sections remain for ${code} after applying criteria.`);
  }

  return {
    course: exactMatch,
    sections: filtered,
  };
}

function buildSelection(course: Course, section: Section): ScheduleSelection {
  return {
    sectionKey: getSectionIdentityKey(course.courseCode, section.sectionCode),
    course,
    section,
  };
}

function totalCredits(selections: ScheduleSelection[]): number {
  return selections.reduce((sum, selection) => sum + (selection.course.maxCredits || selection.course.credits || 0), 0);
}

function buildOptionalWeights(optionalCodes: string[]): Map<string, number> {
  const total = optionalCodes.length;
  return new Map(optionalCodes.map((code, index) => [code, total - index]));
}

function generateSchedules(
  requiredPlans: CoursePlan[],
  optionalPlans: CoursePlan[],
  minCredits: number,
  maxCredits: number,
  optionalWeights: Map<string, number>
): GenerationOutcome {
  const orderedRequired = [...requiredPlans].sort((a, b) => a.sections.length - b.sections.length);
  const orderedOptional = [...optionalPlans].sort((a, b) => {
    const leftCode = normalizeCourseCode(a.course.courseCode);
    const rightCode = normalizeCourseCode(b.course.courseCode);
    const leftWeight = optionalWeights.get(leftCode) ?? 0;
    const rightWeight = optionalWeights.get(rightCode) ?? 0;
    if (leftWeight !== rightWeight) {
      return rightWeight - leftWeight;
    }
    return a.sections.length - b.sections.length;
  });

  const optionalCodeSet = new Set(orderedOptional.map((plan) => normalizeCourseCode(plan.course.courseCode)));

  const requiredCombinations: ScheduleSelection[][] = [];

  const buildRequiredCombinations = (idx: number, chosen: ScheduleSelection[]) => {
    if (idx >= orderedRequired.length) {
      requiredCombinations.push([...chosen]);
      return;
    }

    const currentCourse = orderedRequired[idx];
    for (const section of currentCourse.sections) {
      const conflict = chosen.some((selection) => sectionsConflict(selection.section, section));
      if (conflict) {
        continue;
      }

      buildRequiredCombinations(idx + 1, [...chosen, buildSelection(currentCourse.course, section)]);
    }
  };

  buildRequiredCombinations(0, []);

  if (requiredCombinations.length === 0) {
    return {
      schedules: [],
      missingOptionalCodes: [],
      bestOptionalCount: 0,
      totalOptionalCount: orderedOptional.length,
    };
  }

  const keyedResults = new Map<
    string,
    {
      selections: ScheduleSelection[];
      credits: number;
      optionalCount: number;
      optionalScore: number;
      includedOptionalCodes: Set<string>;
    }
  >();

  for (const requiredSelection of requiredCombinations) {
    const tryOptional = (
      optIdx: number,
      acc: ScheduleSelection[],
      includedOptionalCodes: Set<string>,
      optionalScore: number
    ) => {
      const credits = totalCredits(acc);
      if (credits > maxCredits) {
        return;
      }

      if (optIdx >= orderedOptional.length) {
        if (credits < minCredits || credits > maxCredits) {
          return;
        }

        const optionalCount = includedOptionalCodes.size;
        const key = acc.map((selection) => selection.sectionKey).sort().join("|");
        const existing = keyedResults.get(key);
        if (!existing || optionalScore > existing.optionalScore) {
          keyedResults.set(key, {
            selections: [...acc],
            credits,
            optionalCount,
            optionalScore,
            includedOptionalCodes: new Set(includedOptionalCodes),
          });
        }
        return;
      }

      tryOptional(optIdx + 1, acc, includedOptionalCodes, optionalScore);

      const optional = orderedOptional[optIdx];
      const optionalCode = normalizeCourseCode(optional.course.courseCode);
      const optionalCredits = optional.course.maxCredits || optional.course.credits || 0;
      const weight = optionalWeights.get(optionalCode) ?? 0;

      for (const section of optional.sections) {
        if (credits + optionalCredits > maxCredits) {
          continue;
        }

        const conflict = acc.some((selection) => sectionsConflict(selection.section, section));
        if (conflict) {
          continue;
        }

        const nextIncluded = new Set(includedOptionalCodes);
        nextIncluded.add(optionalCode);
        tryOptional(optIdx + 1, [...acc, buildSelection(optional.course, section)], nextIncluded, optionalScore + weight);
      }
    };

    tryOptional(0, requiredSelection, new Set(), 0);
  }

  const schedules = Array.from(keyedResults.values())
    .sort((left, right) => {
      if (left.optionalCount !== right.optionalCount) {
        return right.optionalCount - left.optionalCount;
      }
      if (left.optionalScore !== right.optionalScore) {
        return right.optionalScore - left.optionalScore;
      }
      if (left.selections.length !== right.selections.length) {
        return left.selections.length - right.selections.length;
      }
      return left.credits - right.credits;
    })
    .map((entry, index) => ({
      id: `auto-${index + 1}`,
      selections: entry.selections,
      credits: entry.credits,
    }));

  if (schedules.length === 0) {
    return {
      schedules: [],
      missingOptionalCodes: [],
      bestOptionalCount: 0,
      totalOptionalCount: orderedOptional.length,
    };
  }

  let bestOptionalCount = 0;
  for (const entry of keyedResults.values()) {
    bestOptionalCount = Math.max(bestOptionalCount, entry.optionalCount);
  }

  const optionalSeenInBest = new Set<string>();
  for (const entry of keyedResults.values()) {
    if (entry.optionalCount !== bestOptionalCount) {
      continue;
    }
    for (const optionalCode of entry.includedOptionalCodes) {
      optionalSeenInBest.add(optionalCode);
    }
  }

  const missingOptionalCodes = Array.from(optionalCodeSet)
    .filter((code) => !optionalSeenInBest.has(code))
    .sort();

  return {
    schedules,
    missingOptionalCodes,
    bestOptionalCount,
    totalOptionalCount: orderedOptional.length,
  };
}

function termId(term: Season, year: number): string {
  return `${term}-${year}`;
}

function buildScheduleSummary(schedule: GeneratedSchedule): ScheduleSummary {
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;

  for (const selection of schedule.selections) {
    for (const meeting of selection.section.meetings) {
      if (!meeting.startTime || !meeting.endTime) {
        continue;
      }

      const start = parseTimeToHour(meeting.startTime);
      const end = parseTimeToHour(meeting.endTime);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        continue;
      }

      earliest = Math.min(earliest, start);
      latest = Math.max(latest, end);
    }
  }

  return {
    classCount: schedule.selections.length,
    earliestLabel: Number.isFinite(earliest) ? formatHourLabel(earliest) : "N/A",
    latestLabel: Number.isFinite(latest) ? formatHourLabel(latest) : "N/A",
  };
}

function scheduleDayCount(schedule: GeneratedSchedule): number {
  const days = new Set<Exclude<Weekday, "Other">>();
  for (const selection of schedule.selections) {
    for (const meeting of selection.section.meetings) {
      for (const day of parseMeetingDays(meeting.days)) {
        if (day !== "Other") {
          days.add(day);
        }
      }
    }
  }
  return days.size;
}

function scheduleDayLabel(schedule: GeneratedSchedule): string {
  const days = new Set<Exclude<Weekday, "Other">>();
  for (const selection of schedule.selections) {
    for (const meeting of selection.section.meetings) {
      for (const day of parseMeetingDays(meeting.days)) {
        if (day !== "Other") {
          days.add(day);
        }
      }
    }
  }

  if (days.size === 0) {
    return "TBA";
  }

  return WEEKDAYS.filter((day) => days.has(day)).join("");
}

function formatMeetingSnippet(section: Section): string {
  const firstMeeting = section.meetings[0];
  if (!firstMeeting) {
    return "Meeting time TBA";
  }

  const days = firstMeeting.days || "TBA";
  const start = firstMeeting.startTime || "TBA";
  const end = firstMeeting.endTime || "TBA";
  return `${days} ${start}-${end}`;
}

function labelForSchedule(index: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const symbol = alphabet[index % alphabet.length];
  const cycle = Math.floor(index / alphabet.length);
  return cycle === 0 ? `Schedule ${symbol}` : `Schedule ${symbol}${cycle + 1}`;
}

function reorderByCode(items: CoursePreference[], sourceCode: string, targetCode: string): CoursePreference[] {
  const sourceIndex = items.findIndex((item) => item.code === sourceCode);
  const targetIndex = items.findIndex((item) => item.code === targetCode);

  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

function moveByStep(items: CoursePreference[], code: string, direction: -1 | 1): CoursePreference[] {
  const index = items.findIndex((item) => item.code === code);
  if (index < 0) {
    return items;
  }

  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

function fallbackTermOptions(currentSeason: Season, currentYear: number): CatalogTermOption[] {
  const seasons: Season[] = ["01", "05", "08", "12"];
  const years = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
  const options = years.flatMap((year) => seasons.map((season) => ({
    season,
    year,
    label: `${TERM_LABEL[season]} ${year}`,
  })));

  options.sort((left, right) => compareAcademicTerms(
    { termCode: left.season, termYear: left.year },
    { termCode: right.season, termYear: right.year }
  ));

  if (!options.some((option) => option.season === currentSeason && option.year === currentYear)) {
    options.push({
      season: currentSeason,
      year: currentYear,
      label: `${TERM_LABEL[currentSeason]} ${currentYear}`,
    });
  }

  return options;
}

function seasonCodeFromTerm(term: { code: string; season?: string }, fallback: Season): Season {
  const bySeasonName: Record<string, Season> = {
    spring: "01",
    summer: "05",
    fall: "08",
    winter: "12",
  };

  const seasonFromName = bySeasonName[String(term.season ?? "").toLowerCase()];
  if (seasonFromName) {
    return seasonFromName;
  }

  const parsedSeason = String(term.code ?? "").slice(-2) as Season;
  return parsedSeason in TERM_LABEL ? parsedSeason : fallback;
}

function mapDraftPayload(raw: unknown, fallbackSeason: Season, fallbackYear: number): DraftPayloadV2 | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const payload = raw as Record<string, unknown>;
  const draftRaw = payload.draft && typeof payload.draft === "object" ? (payload.draft as Record<string, unknown>) : payload;

  const seasonRaw = String(draftRaw.season ?? fallbackSeason) as Season;
  const season = seasonRaw in TERM_LABEL ? seasonRaw : fallbackSeason;
  const year = Number(draftRaw.year ?? fallbackYear) || fallbackYear;

  const coursePreferences = Array.isArray(draftRaw.coursePreferences)
    ? dedupeCoursePreferences(
      draftRaw.coursePreferences
        .filter((item): item is { code?: unknown; kind?: unknown } => Boolean(item && typeof item === "object"))
        .map((item) => ({
          code: String(item.code ?? ""),
          kind: item.kind === "optional" ? "optional" : "required",
        }))
    )
    : dedupeCoursePreferences([
      ...parseLegacyCourseCodes(String(draftRaw.requiredRaw ?? "")).map((code) => ({ code, kind: "required" as const })),
      ...parseLegacyCourseCodes(String(draftRaw.optionalRaw ?? "")).map((code) => ({ code, kind: "optional" as const })),
    ]);

  const excludedDaysRaw = Array.isArray(draftRaw.excludedDays)
    ? draftRaw.excludedDays
    : Array.isArray(draftRaw.constrainedDays)
      ? draftRaw.constrainedDays
      : [];

  const excludedDays = excludedDaysRaw
    .map((day) => String(day))
    .filter((day): day is Exclude<Weekday, "Other"> => WEEKDAYS.includes(day as Exclude<Weekday, "Other">));

  return {
    season,
    year,
    coursePreferences,
    minCredits: Number(draftRaw.minCredits ?? 12) || 12,
    maxCredits: Number(draftRaw.maxCredits ?? 20) || 20,
    onlyOpen: draftRaw.onlyOpen !== false,
    allowFaceToFace: draftRaw.allowFaceToFace !== false,
    allowBlended: draftRaw.allowBlended !== false,
    allowOnline: draftRaw.allowOnline !== false,
    constraintStart: String(draftRaw.constraintStart ?? "08:00"),
    constraintEnd: String(draftRaw.constraintEnd ?? "18:00"),
    excludedDays,
  };
}

interface TermSelectorSectionProps {
  season: Season;
  year: number;
  termOptions: CatalogTermOption[];
  onSeasonChange: (season: Season) => void;
  onYearChange: (year: number) => void;
}

function TermSelectorSection({ season, year, termOptions, onSeasonChange, onYearChange }: TermSelectorSectionProps) {
  const optionsBySeason = useMemo(() => {
    const grouped: Record<Season, CatalogTermOption[]> = {
      "01": [],
      "05": [],
      "08": [],
      "12": [],
    };

    for (const option of termOptions) {
      grouped[option.season].push(option);
    }

    for (const key of Object.keys(grouped) as Season[]) {
      grouped[key].sort((left, right) => right.year - left.year);
    }

    return grouped;
  }, [termOptions]);

  const yearOptions = optionsBySeason[season];

  return (
    <section className="cp-generate-section-block">
      <div className="cp-generate-section-head">
        <h2 className="cp-generate-section-title">Term</h2>
      </div>

      <div className="cp-generate-term-tabs" aria-label="Term season selector">
        {(Object.keys(TERM_LABEL) as Season[]).map((value) => (
          <button
            key={value}
            type="button"
            className={`cp-generate-term-tab ${season === value ? "is-active" : ""}`}
            onClick={() => onSeasonChange(value)}
          >
            {TERM_LABEL[value]}
          </button>
        ))}
      </div>

      <label className="cp-generate-field-label" htmlFor="generate-term-year">
        Academic year
      </label>
      <select
        id="generate-term-year"
        value={String(year)}
        className="cp-generate-select"
        onChange={(event) => onYearChange(Number(event.target.value))}
      >
        {yearOptions.map((option) => (
          <option key={`${option.season}-${option.year}`} value={option.year}>
            {option.label}
          </option>
        ))}
      </select>
    </section>
  );
}

interface CoursePrioritySectionProps {
  coursePreferences: CoursePreference[];
  courseLookup: Record<string, CourseLookupEntry>;
  addCourseQuery: string;
  addCourseKind: CourseKind;
  addCourseResults: Course[];
  addCourseBusy: boolean;
  addCourseError: string | null;
  expanded: boolean;
  draggingCode: string | null;
  onExpandedChange: (expanded: boolean) => void;
  onAddCourseQueryChange: (value: string) => void;
  onAddCourseKindChange: (kind: CourseKind) => void;
  onAddCourseByCode: (code: string, kind: CourseKind) => void;
  onRemoveCourse: (code: string) => void;
  onToggleCourseKind: (code: string) => void;
  onMoveByStep: (code: string, direction: -1 | 1) => void;
  onStartDrag: (code: string) => void;
  onDropOnCourse: (targetCode: string) => void;
}

function CoursePrioritySection({
  coursePreferences,
  courseLookup,
  addCourseQuery,
  addCourseKind,
  addCourseResults,
  addCourseBusy,
  addCourseError,
  expanded,
  draggingCode,
  onExpandedChange,
  onAddCourseQueryChange,
  onAddCourseKindChange,
  onAddCourseByCode,
  onRemoveCourse,
  onToggleCourseKind,
  onMoveByStep,
  onStartDrag,
  onDropOnCourse,
}: CoursePrioritySectionProps) {
  const requiredCount = coursePreferences.filter((item) => item.kind === "required").length;
  const optionalCount = coursePreferences.length - requiredCount;
  const unresolvedCount = coursePreferences.filter((item) => {
    const state = courseLookup[item.code];
    return !state || state.status === "missing" || state.status === "error";
  }).length;

  return (
    <section className="cp-generate-section-block">
      <div className="cp-generate-section-head">
        <h2 className="cp-generate-section-title">Courses</h2>
        <span className="cp-generate-section-hint">Drag to reorder priority</span>
      </div>

      <div className="cp-generate-course-list" aria-label="Course priority list">
        {coursePreferences.length === 0 && (
          <p className="cp-muted-text">Add at least one required course to generate schedules.</p>
        )}

        {coursePreferences.map((item, index) => {
          const lookup = courseLookup[item.code];
          const title = lookup?.course?.name ?? (lookup?.status === "loading" ? "Looking up course details..." : "Course details unavailable");
          const itemClass = item.kind === "required" ? "is-required" : "is-optional";

          return (
            <article
              key={item.code}
              className={`cp-generate-course-item ${itemClass} ${draggingCode === item.code ? "is-dragging" : ""}`}
              draggable
              onDragStart={() => onStartDrag(item.code)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDropOnCourse(item.code)}
              data-testid={`priority-item-${item.code}`}
            >
              <div className="cp-generate-course-drag" aria-hidden>
                <GripVertical size={14} />
              </div>
              <div className="cp-generate-course-meta">
                <div className="cp-generate-course-code">{item.code.slice(0, 4)} {item.code.slice(4)}</div>
                <div className="cp-generate-course-name">{title}</div>
              </div>
              <button
                type="button"
                className={`cp-generate-course-type ${item.kind === "required" ? "is-required" : "is-optional"}`}
                onClick={() => onToggleCourseKind(item.code)}
                aria-label={`Toggle ${item.code} between required and optional`}
              >
                {item.kind === "required" ? "Required" : "Optional"}
              </button>
              <div className="cp-generate-course-actions">
                <button
                  type="button"
                  className="cp-generate-course-icon-btn"
                  aria-label={`Move ${item.code} up`}
                  disabled={index === 0}
                  onClick={() => onMoveByStep(item.code, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="cp-generate-course-icon-btn"
                  aria-label={`Move ${item.code} down`}
                  disabled={index === coursePreferences.length - 1}
                  onClick={() => onMoveByStep(item.code, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="cp-generate-course-remove"
                  aria-label={`Remove ${item.code}`}
                  onClick={() => onRemoveCourse(item.code)}
                >
                  <X size={12} />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="cp-generate-parse-info">
        <Info size={12} />
        Parsed: <strong>{requiredCount} required</strong>, {optionalCount} optional · {unresolvedCount === 0 ? "All sections found." : `${unresolvedCount} courses need review.`}
      </div>

      <button
        type="button"
        className="cp-generate-add-course-btn"
        onClick={() => onExpandedChange(!expanded)}
      >
        <Plus size={14} />
        Add a course
      </button>

      {expanded && (
        <div className="cp-generate-add-panel">
          <label className="cp-generate-field-label" htmlFor="add-course-search">Search courses to add</label>
          <input
            id="add-course-search"
            className="cp-generate-input"
            placeholder="Example: CMSC4 or Software Engineering"
            value={addCourseQuery}
            onChange={(event) => onAddCourseQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && addCourseResults.length > 0) {
                event.preventDefault();
                onAddCourseByCode(addCourseResults[0].courseCode, addCourseKind);
              }
            }}
          />

          <label className="cp-generate-field-label" htmlFor="add-course-kind">Add as</label>
          <select
            id="add-course-kind"
            className="cp-generate-select"
            value={addCourseKind}
            onChange={(event) => onAddCourseKindChange(event.target.value === "optional" ? "optional" : "required")}
          >
            <option value="required">Required</option>
            <option value="optional">Optional</option>
          </select>

          {addCourseBusy && (
            <div className="cp-inline-loading">
              <Loader2 size={12} className="spin" /> Searching courses...
            </div>
          )}

          {addCourseError && <p className="cp-error-text">{addCourseError}</p>}

          <div className="cp-generate-add-results" aria-label="Course search results">
            {addCourseResults.map((course) => (
              <button
                type="button"
                key={course.id}
                className="cp-generate-add-result"
                onClick={() => onAddCourseByCode(course.courseCode, addCourseKind)}
              >
                <span className="cp-generate-add-result-code">{course.courseCode}</span>
                <span className="cp-generate-add-result-name">{course.name}</span>
                <span className="cp-generate-add-result-credits">{course.maxCredits || course.credits} cr</span>
              </button>
            ))}
            {!addCourseBusy && addCourseQuery.trim().length >= 2 && addCourseResults.length === 0 && (
              <p className="cp-muted-text">No matching courses for this term.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

interface AdvancedCriteriaSectionProps {
  minCredits: number;
  maxCredits: number;
  allowFaceToFace: boolean;
  allowBlended: boolean;
  allowOnline: boolean;
  onlyOpen: boolean;
  creditsWarning: boolean;
  onMinCreditsChange: (value: number) => void;
  onMaxCreditsChange: (value: number) => void;
  onAllowFaceToFaceChange: (value: boolean) => void;
  onAllowBlendedChange: (value: boolean) => void;
  onAllowOnlineChange: (value: boolean) => void;
  onOnlyOpenChange: (value: boolean) => void;
}

function AdvancedCriteriaSection({
  minCredits,
  maxCredits,
  allowFaceToFace,
  allowBlended,
  allowOnline,
  onlyOpen,
  creditsWarning,
  onMinCreditsChange,
  onMaxCreditsChange,
  onAllowFaceToFaceChange,
  onAllowBlendedChange,
  onAllowOnlineChange,
  onOnlyOpenChange,
}: AdvancedCriteriaSectionProps) {
  return (
    <section className="cp-generate-section-block">
      <div className="cp-generate-section-head">
        <h2 className="cp-generate-section-title">Advanced Criteria</h2>
        <span className="cp-generate-section-hint">Optional</span>
      </div>

      <div>
        <label className="cp-generate-field-label">Credit range</label>
        <div className="cp-generate-credit-range">
          <input
            className="cp-generate-credit-input"
            type="number"
            min={1}
            max={30}
            value={minCredits}
            onChange={(event) => onMinCreditsChange(Number(event.target.value) || 1)}
            aria-label="Minimum credits"
          />
          <span className="cp-generate-credit-sep">-</span>
          <input
            className="cp-generate-credit-input"
            type="number"
            min={1}
            max={30}
            value={maxCredits}
            onChange={(event) => onMaxCreditsChange(Number(event.target.value) || 1)}
            aria-label="Maximum credits"
          />
          <span className="cp-generate-credit-label">credits total</span>
        </div>
      </div>

      <div>
        <label className="cp-generate-field-label">Modality</label>
        <div className="cp-generate-pill-group">
          <button
            type="button"
            className={`cp-generate-pill ${allowFaceToFace ? "is-active" : ""}`}
            onClick={() => onAllowFaceToFaceChange(!allowFaceToFace)}
          >
            In-person
          </button>
          <button
            type="button"
            className={`cp-generate-pill ${allowBlended ? "is-active" : ""}`}
            onClick={() => onAllowBlendedChange(!allowBlended)}
          >
            Blended
          </button>
          <button
            type="button"
            className={`cp-generate-pill ${allowOnline ? "is-active" : ""}`}
            onClick={() => onAllowOnlineChange(!allowOnline)}
          >
            Online
          </button>
        </div>
      </div>

      <div className="cp-generate-toggle-row">
        <div>
          <div className="cp-generate-toggle-label">Open sections only</div>
          <div className="cp-generate-toggle-sub">Hide waitlisted and full sections</div>
        </div>
        <label className="cp-generate-switch">
          <input
            type="checkbox"
            checked={onlyOpen}
            onChange={(event) => onOnlyOpenChange(event.target.checked)}
            aria-label="Open sections only"
          />
          <span className="cp-generate-switch-track" />
          <span className="cp-generate-switch-thumb" />
        </label>
      </div>

      {creditsWarning && <p className="cp-error-text">Maximum credits must be greater than or equal to minimum credits.</p>}
    </section>
  );
}

interface TimeConstraintsSectionProps {
  constraintStart: string;
  constraintEnd: string;
  excludedDays: Set<Exclude<Weekday, "Other">>;
  onConstraintStartChange: (value: string) => void;
  onConstraintEndChange: (value: string) => void;
  onToggleExcludedDay: (day: Exclude<Weekday, "Other">) => void;
}

function TimeConstraintsSection({
  constraintStart,
  constraintEnd,
  excludedDays,
  onConstraintStartChange,
  onConstraintEndChange,
  onToggleExcludedDay,
}: TimeConstraintsSectionProps) {
  return (
    <section className="cp-generate-section-block">
      <div className="cp-generate-section-head">
        <h2 className="cp-generate-section-title">Time Constraints</h2>
        <span className="cp-generate-section-hint">Optional</span>
      </div>

      <div className="cp-generate-time-row">
        <label className="cp-generate-time-field">
          Earliest start
          <input
            type="time"
            value={constraintStart}
            onChange={(event) => onConstraintStartChange(event.target.value)}
            aria-label="Earliest start"
          />
        </label>
        <label className="cp-generate-time-field">
          Latest end
          <input
            type="time"
            value={constraintEnd}
            onChange={(event) => onConstraintEndChange(event.target.value)}
            aria-label="Latest end"
          />
        </label>
      </div>

      <div>
        <label className="cp-generate-field-label">Exclude days</label>
        <div className="cp-generate-day-pills">
          {WEEKDAYS.map((day) => (
            <button
              key={day}
              type="button"
              className={`cp-generate-day-pill ${excludedDays.has(day) ? "is-active" : ""}`}
              onClick={() => onToggleExcludedDay(day)}
            >
              {day}
            </button>
          ))}
        </div>
        <p className="cp-generate-day-hint">Active = excluded from generated schedules</p>
      </div>
    </section>
  );
}

interface ScheduleOptionCardProps {
  schedule: GeneratedSchedule;
  rank: number;
  pinned: boolean;
  saved: boolean;
  isMain: boolean;
  busyAction: string | null;
  onSave: () => void;
  onSetMain: () => void;
  onOpen: () => void;
}

function ScheduleOptionCard({
  schedule,
  rank,
  pinned,
  saved,
  isMain,
  busyAction,
  onSave,
  onSetMain,
  onOpen,
}: ScheduleOptionCardProps) {
  const summary = useMemo(() => buildScheduleSummary(schedule), [schedule]);
  const dayLabel = useMemo(() => scheduleDayLabel(schedule), [schedule]);

  const meetings = useMemo<CalendarMeeting[]>(() => {
    const raw = schedule.selections.flatMap((selection) =>
      buildCalendarMeetings({
        sectionKey: selection.sectionKey,
        courseCode: selection.course.courseCode,
        displayCourseCode: `${selection.course.courseCode} ${(selection.section.openSeats ?? 0)}/${selection.section.totalSeats ?? 0}`,
        sectionCode: selection.section.sectionCode,
        title: selection.course.name,
        instructor: selection.section.instructor,
        meetings: selection.section.meetings,
      })
    );

    return assignConflictIndexes(raw);
  }, [schedule]);

  const bounds = useMemo(
    () => computeVisibleHourBounds(meetings.filter((meeting) => meeting.day !== "Other")),
    [meetings]
  );

  return (
    <article className={`cp-generate-schedule-card ${pinned ? "is-pinned" : ""}`} data-testid={`generated-card-${rank + 1}`}>
      <header className="cp-generate-schedule-card-header">
        <div className="cp-generate-schedule-number">{rank + 1}</div>
        <div className="cp-generate-schedule-title-stack">
          <div className="cp-generate-schedule-name">
            {labelForSchedule(rank)}
            {pinned && (
              <span className="cp-generate-best-fit">
                <Star size={11} /> Best fit
              </span>
            )}
          </div>
          <div className="cp-generate-schedule-summary-row">
            <span>Classes: {summary.classCount}</span>
            <span>Earliest: {summary.earliestLabel}</span>
            <span>Latest: {summary.latestLabel}</span>
          </div>
        </div>
        <div className="cp-generate-schedule-credits">{schedule.credits} cr · {dayLabel}</div>
        <div className="cp-generate-schedule-actions">
          <button
            type="button"
            className="cp-generate-schedule-btn"
            onClick={onSave}
            disabled={busyAction === "save"}
          >
            {busyAction === "save" ? <Loader2 size={12} className="spin" /> : null}
            {saved ? "Saved" : "Save"}
          </button>
          <button
            type="button"
            className={`cp-generate-schedule-btn ${isMain ? "is-primary" : ""}`}
            onClick={onSetMain}
            disabled={busyAction === "main"}
          >
            {busyAction === "main" ? <Loader2 size={12} className="spin" /> : null}
            {isMain ? "Main" : "Set as Main"}
          </button>
          <button
            type="button"
            className="cp-generate-schedule-btn"
            onClick={onOpen}
          >
            Open
          </button>
        </div>
      </header>

      <div className="cp-calendar cp-generate-calendar-preview" data-testid={`generated-schedule-calendar-${rank + 1}`}>
        <Timeline startHour={bounds.startHour} endHour={bounds.endHour} />
        <ScheduleGrid
          meetings={meetings}
          bounds={bounds}
          readOnly
          showDetails
          onOpenInfo={() => {}}
          onRemove={() => {}}
        />
      </div>

      <div className="cp-generate-schedule-chips">
        {schedule.selections.map((selection) => {
          const seatsLabel = `${selection.section.openSeats ?? 0}/${selection.section.totalSeats ?? 0}`;
          const lowSeats = (selection.section.openSeats ?? 0) > 0 && (selection.section.openSeats ?? 0) <= 5;

          return (
            <div key={selection.sectionKey} className="cp-generate-schedule-chip">
              <span className="cp-generate-schedule-chip-code">{selection.course.courseCode}</span>
              <span>{formatMeetingSnippet(selection.section)}</span>
              <span className={`cp-generate-schedule-chip-seats ${lowSeats ? "is-low" : ""}`}>{seatsLabel}</span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

interface ResultsPanelProps {
  termLabel: string;
  generated: GeneratedSchedule[];
  busy: boolean;
  error: string | null;
  fitNotice: string | null;
  optionalFitStats: { best: number; total: number } | null;
  sortMode: ResultsSortMode;
  actionNotice: string | null;
  savedScheduleIds: string[];
  mainScheduleId: string | null;
  scheduleActionBusyKey: string | null;
  onSortModeChange: (mode: ResultsSortMode) => void;
  onSaveAll: () => void;
  onSaveSingle: (schedule: GeneratedSchedule, index: number) => void;
  onSetMain: (schedule: GeneratedSchedule, index: number) => void;
  onOpenInBuilder: (schedule: GeneratedSchedule, index: number) => void;
}

function ResultsPanel({
  termLabel,
  generated,
  busy,
  error,
  fitNotice,
  optionalFitStats,
  sortMode,
  actionNotice,
  savedScheduleIds,
  mainScheduleId,
  scheduleActionBusyKey,
  onSortModeChange,
  onSaveAll,
  onSaveSingle,
  onSetMain,
  onOpenInBuilder,
}: ResultsPanelProps) {
  const sorted = useMemo(() => {
    const items = [...generated];

    if (sortMode === "credits") {
      items.sort((left, right) => left.credits - right.credits);
    } else if (sortMode === "spread") {
      items.sort((left, right) => {
        const dayDiff = scheduleDayCount(left) - scheduleDayCount(right);
        if (dayDiff !== 0) {
          return dayDiff;
        }
        return left.credits - right.credits;
      });
    }

    return items;
  }, [generated, sortMode]);

  const showEmptyState = !busy && !error && generated.length === 0;

  return (
    <section className="cp-generate-results-panel">
      {showEmptyState && (
        <div className="cp-generate-empty-state" data-testid="generate-empty-state">
          <div className="cp-generate-empty-icon">
            <CalendarDays size={30} />
          </div>
          <h3 className="cp-generate-empty-title">Your schedules will appear here.</h3>
          <p className="cp-generate-empty-sub">Configure your courses and criteria on the left, then click Generate. OrbitUMD will find every conflict-free combination that fits your life.</p>
        </div>
      )}

      {(busy || error || generated.length > 0) && (
        <>
          <div className="cp-generate-results-header">
            <div>
              <h3 className="cp-generate-results-title">Generated Schedules</h3>
              <p className="cp-generate-results-count">{generated.length} conflict-free options for {termLabel}</p>
            </div>
            <div className="cp-generate-results-actions">
              <button
                type="button"
                className={`cp-generate-results-btn ${sortMode === "best" ? "is-active" : ""}`}
                onClick={() => onSortModeChange("best")}
              >
                Best fit
              </button>
              <button
                type="button"
                className={`cp-generate-results-btn ${sortMode === "spread" ? "is-active" : ""}`}
                onClick={() => onSortModeChange("spread")}
              >
                Fewer days
              </button>
              <button
                type="button"
                className={`cp-generate-results-btn ${sortMode === "credits" ? "is-active" : ""}`}
                onClick={() => onSortModeChange("credits")}
              >
                Lower credits
              </button>
              <button
                type="button"
                className="cp-generate-results-btn is-primary"
                onClick={onSaveAll}
                disabled={generated.length === 0 || scheduleActionBusyKey === "save-all"}
              >
                {scheduleActionBusyKey === "save-all" ? <Loader2 size={12} className="spin" /> : null}
                Save all
              </button>
            </div>
          </div>

          {optionalFitStats && optionalFitStats.total > 0 && (
            <div className="cp-generate-fit-meta">
              <span className="cp-generate-fit-badge">Max optional fit: {optionalFitStats.best}/{optionalFitStats.total}</span>
              <p className="cp-generate-fit-help">Schedules are ranked with your drag-and-drop course priority in mind.</p>
            </div>
          )}

          {actionNotice && <p className="cp-generate-action-note">{actionNotice}</p>}
          {fitNotice && <p className="cp-generate-fit-note">{fitNotice}</p>}

          {busy && (
            <p className="cp-inline-loading" data-testid="generate-loading-state">
              <Loader2 size={14} className="spin" /> Finding conflict-free options...
            </p>
          )}

          {error && <p className="cp-error-text" data-testid="generate-error-state">{error}</p>}

          {!busy && !error && sorted.length > 0 && (
            <div className="cp-generate-results-list">
              {sorted.map((schedule, index) => {
                const saveKey = `save-${schedule.id}`;
                const mainKey = `main-${schedule.id}`;

                return (
                  <ScheduleOptionCard
                    key={schedule.id}
                    schedule={schedule}
                    rank={index}
                    pinned={index === 0}
                    saved={savedScheduleIds.includes(schedule.id)}
                    isMain={mainScheduleId === schedule.id}
                    busyAction={scheduleActionBusyKey === saveKey ? "save" : scheduleActionBusyKey === mainKey ? "main" : null}
                    onSave={() => onSaveSingle(schedule, index)}
                    onSetMain={() => onSetMain(schedule, index)}
                    onOpen={() => onOpenInBuilder(schedule, index)}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function AutoGenerateSchedulePage() {
  const navigate = useNavigate();
  const setCatalogTerm = useCoursePlannerStore((state) => state.setCatalogTerm);
  const replaceSelections = useCoursePlannerStore((state) => state.replaceSelections);
  const storeTerm = useCoursePlannerStore((state) => state.term);
  const storeYear = useCoursePlannerStore((state) => state.year);

  const initialSeason: Season = storeTerm in TERM_LABEL ? (storeTerm as Season) : "08";
  const initialYear = Number.isFinite(storeYear) ? storeYear : 2026;

  const [season, setSeason] = useState<Season>(initialSeason);
  const [year, setYear] = useState(initialYear);
  const [termOptions, setTermOptions] = useState<CatalogTermOption[]>(fallbackTermOptions(initialSeason, initialYear));

  const [coursePreferences, setCoursePreferences] = useState<CoursePreference[]>([]);
  const [courseLookup, setCourseLookup] = useState<Record<string, CourseLookupEntry>>({});
  const [draggingCode, setDraggingCode] = useState<string | null>(null);

  const [minCredits, setMinCredits] = useState(12);
  const [maxCredits, setMaxCredits] = useState(20);
  const [onlyOpen, setOnlyOpen] = useState(true);

  const [allowFaceToFace, setAllowFaceToFace] = useState(true);
  const [allowBlended, setAllowBlended] = useState(true);
  const [allowOnline, setAllowOnline] = useState(true);

  const [constraintStart, setConstraintStart] = useState("08:00");
  const [constraintEnd, setConstraintEnd] = useState("18:00");
  const [excludedDays, setExcludedDays] = useState<Set<Exclude<Weekday, "Other">>>(new Set());

  const [showAddCourseSearch, setShowAddCourseSearch] = useState(false);
  const [addCourseQuery, setAddCourseQuery] = useState("");
  const [addCourseKind, setAddCourseKind] = useState<CourseKind>("required");
  const [addCourseResults, setAddCourseResults] = useState<Course[]>([]);
  const [addCourseBusy, setAddCourseBusy] = useState(false);
  const [addCourseError, setAddCourseError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fitNotice, setFitNotice] = useState<string | null>(null);
  const [optionalFitStats, setOptionalFitStats] = useState<{ best: number; total: number } | null>(null);
  const [generated, setGenerated] = useState<GeneratedSchedule[]>([]);

  const [resultSortMode, setResultSortMode] = useState<ResultsSortMode>("best");
  const [scheduleActionBusyKey, setScheduleActionBusyKey] = useState<string | null>(null);
  const [savedScheduleIds, setSavedScheduleIds] = useState<string[]>([]);
  const [mainScheduleId, setMainScheduleId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const [showProjectedInfo, setShowProjectedInfo] = useState(false);
  const projectedInfoRef = useRef<HTMLButtonElement | null>(null);

  const [lastAutosavedSnapshot, setLastAutosavedSnapshot] = useState<string>("");
  const [lastAutosavedAt, setLastAutosavedAt] = useState<number | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);

  const termKey = `${season}-${year}`;

  const draftSnapshot = useMemo(() => JSON.stringify({
    season,
    year,
    coursePreferences,
    minCredits,
    maxCredits,
    onlyOpen,
    allowFaceToFace,
    allowBlended,
    allowOnline,
    constraintStart,
    constraintEnd,
    excludedDays: Array.from(excludedDays).sort(),
  }), [
    allowBlended,
    allowFaceToFace,
    allowOnline,
    constraintEnd,
    constraintStart,
    coursePreferences,
    excludedDays,
    maxCredits,
    minCredits,
    onlyOpen,
    season,
    year,
  ]);

  const hasUnsavedCriteria = draftSnapshot !== lastAutosavedSnapshot;

  const requiredCodes = useMemo(
    () => coursePreferences.filter((item) => item.kind === "required").map((item) => item.code),
    [coursePreferences]
  );

  const optionalCodes = useMemo(
    () => coursePreferences.filter((item) => item.kind === "optional").map((item) => item.code),
    [coursePreferences]
  );

  const creditsWarning = maxCredits < minCredits;

  const latestCatalogTerm = useMemo(() => {
    if (termOptions.length === 0) {
      return null;
    }

    const sorted = [...termOptions].sort((left, right) => compareAcademicTerms(
      { termCode: left.season, termYear: left.year },
      { termCode: right.season, termYear: right.year },
    ));

    const latest = sorted[sorted.length - 1];
    return latest ? { termCode: latest.season, termYear: latest.year } : null;
  }, [termOptions]);

  const showProjectedTimesNote = useMemo(() => {
    if (!latestCatalogTerm) return false;
    return compareAcademicTerms({ termCode: season, termYear: year }, latestCatalogTerm) > 0;
  }, [latestCatalogTerm, season, year]);

  const activeTermLabel = `${TERM_LABEL[season]} ${year}`;

  const lookupCodes = useMemo(() => Array.from(new Set(coursePreferences.map((item) => item.code))), [coursePreferences]);

  const timeConstraint = useMemo<TimeConstraint>(() => {
    const [startHourRaw, startMinuteRaw] = constraintStart.split(":").map((value) => Number(value));
    const [endHourRaw, endMinuteRaw] = constraintEnd.split(":").map((value) => Number(value));

    return {
      startHour: (startHourRaw || 0) + (startMinuteRaw || 0) / 60,
      endHour: (endHourRaw || 0) + (endMinuteRaw || 0) / 60,
      excludedDays,
    };
  }, [constraintEnd, constraintStart, excludedDays]);

  useEffect(() => {
    let active = true;
    fetchTerms()
      .then((terms) => {
        if (!active || terms.length === 0) return;

        const mapped = terms
          .map((term) => {
            const parsedSeason = seasonCodeFromTerm(term, initialSeason);
            return {
              season: parsedSeason,
              year: term.year,
              label: term.label || `${TERM_LABEL[parsedSeason]} ${term.year}`,
            } satisfies CatalogTermOption;
          })
          .filter((option) => Number.isFinite(option.year));

        const deduped = Array.from(
          new Map(mapped.map((option) => [`${option.season}-${option.year}`, option])).values()
        );

        const fallback = fallbackTermOptions(initialSeason, initialYear);
        const merged = new Map<string, CatalogTermOption>(
          fallback.map((option) => [`${option.season}-${option.year}`, option])
        );
        for (const option of deduped) {
          merged.set(`${option.season}-${option.year}`, option);
        }

        const mergedOptions = Array.from(merged.values());

        mergedOptions.sort((left, right) => compareAcademicTerms(
          { termCode: left.season, termYear: left.year },
          { termCode: right.season, termYear: right.year }
        ));

        if (mergedOptions.length > 0) {
          setTermOptions(mergedOptions);
        }
      })
      .catch(() => {
        // Keep fallback options if term fetch fails.
      });

    return () => {
      active = false;
    };
  }, [initialSeason]);

  useEffect(() => {
    const raw = localStorage.getItem(GENERATE_SCHEDULE_AUTOSAVE_KEY);
    const mapped = mapDraftPayload(raw ? JSON.parse(raw) : null, initialSeason, initialYear);

    if (mapped) {
      setSeason(mapped.season);
      setYear(mapped.year);
      setCoursePreferences(mapped.coursePreferences);
      setMinCredits(mapped.minCredits);
      setMaxCredits(mapped.maxCredits);
      setOnlyOpen(mapped.onlyOpen);
      setAllowFaceToFace(mapped.allowFaceToFace);
      setAllowBlended(mapped.allowBlended);
      setAllowOnline(mapped.allowOnline);
      setConstraintStart(mapped.constraintStart);
      setConstraintEnd(mapped.constraintEnd);
      setExcludedDays(new Set(mapped.excludedDays));
      setLastAutosavedSnapshot(JSON.stringify(mapped));

      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { savedAt?: number };
          if (Number.isFinite(parsed.savedAt)) {
            setLastAutosavedAt(parsed.savedAt as number);
          }
        } catch {
          // ignore malformed savedAt metadata
        }
      }
    }

    setDraftHydrated(true);
  }, [initialSeason, initialYear]);

  useEffect(() => {
    if (!draftHydrated) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const savedAt = Date.now();
      const payload: DraftPayloadV2 = {
        season,
        year,
        coursePreferences,
        minCredits,
        maxCredits,
        onlyOpen,
        allowFaceToFace,
        allowBlended,
        allowOnline,
        constraintStart,
        constraintEnd,
        excludedDays: Array.from(excludedDays).sort(),
      };

      localStorage.setItem(
        GENERATE_SCHEDULE_AUTOSAVE_KEY,
        JSON.stringify({ savedAt, draft: payload })
      );

      setLastAutosavedSnapshot(JSON.stringify(payload));
      setLastAutosavedAt(savedAt);
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [
    allowBlended,
    allowFaceToFace,
    allowOnline,
    constraintEnd,
    constraintStart,
    coursePreferences,
    draftHydrated,
    excludedDays,
    maxCredits,
    minCredits,
    onlyOpen,
    season,
    year,
  ]);

  useEffect(() => {
    setCatalogTerm(season, year);
  }, [season, setCatalogTerm, year]);

  useEffect(() => {
    if (!showAddCourseSearch || addCourseQuery.trim().length < 2) {
      setAddCourseResults([]);
      setAddCourseBusy(false);
      setAddCourseError(null);
      return;
    }

    let active = true;
    const timeout = window.setTimeout(() => {
      setAddCourseBusy(true);
      setAddCourseError(null);

      searchCoursesWithStrategy({
        normalizedInput: normalizeCourseCode(addCourseQuery),
        term: season,
        year,
        includeSections: false,
        filters: DEFAULT_SEARCH_FILTERS,
      })
        .then((courses) => {
          if (!active) return;
          setAddCourseResults(courses.slice(0, 8));
        })
        .catch((err) => {
          if (!active) return;
          setAddCourseResults([]);
          setAddCourseError(err instanceof Error ? err.message : "Unable to search courses.");
        })
        .finally(() => {
          if (active) {
            setAddCourseBusy(false);
          }
        });
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [addCourseQuery, season, showAddCourseSearch, year]);

  useEffect(() => {
    const pendingCodes = lookupCodes.filter((code) => {
      const existing = courseLookup[code];
      return !existing || existing.termKey !== termKey || existing.status === "error";
    });

    if (pendingCodes.length === 0) {
      return;
    }

    let active = true;

    setCourseLookup((current) => {
      const next = { ...current };
      for (const code of pendingCodes) {
        next[code] = {
          status: "loading",
          termKey,
        };
      }
      return next;
    });

    void Promise.all(
      pendingCodes.map(async (code) => {
        try {
          const courses = await searchCoursesWithStrategy({
            normalizedInput: code,
            term: season,
            year,
            includeSections: false,
            filters: DEFAULT_SEARCH_FILTERS,
          });

          const exact = courses.find((course) => normalizeCourseCode(course.courseCode) === code);
          if (!active) return;

          setCourseLookup((current) => ({
            ...current,
            [code]: exact
              ? {
                status: "found",
                termKey,
                course: exact,
              }
              : {
                status: "missing",
                termKey,
                message: "Course not found for selected term",
              },
          }));
        } catch (err) {
          if (!active) return;
          setCourseLookup((current) => ({
            ...current,
            [code]: {
              status: "error",
              termKey,
              message: err instanceof Error ? err.message : "Course lookup failed",
            },
          }));
        }
      })
    );

    return () => {
      active = false;
    };
  }, [courseLookup, lookupCodes, season, termKey, year]);

  useEffect(() => {
    if (!showProjectedInfo) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!projectedInfoRef.current?.contains(event.target as Node)) {
        setShowProjectedInfo(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowProjectedInfo(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [showProjectedInfo]);

  const handleSeasonChange = (nextSeason: Season) => {
    setSeason(nextSeason);

    const seasonYears = termOptions
      .filter((option) => option.season === nextSeason)
      .sort((left, right) => right.year - left.year);

    if (seasonYears.length > 0 && !seasonYears.some((option) => option.year === year)) {
      setYear(seasonYears[0].year);
    }
  };

  const handleAddCourse = (rawCode: string, kind: CourseKind) => {
    const code = normalizeCourseCode(rawCode);
    if (!COURSE_CODE_PATTERN.test(code)) {
      setAddCourseError("Enter a valid course code, such as CMSC131.");
      return;
    }

    setCoursePreferences((current) => {
      const existingIndex = current.findIndex((item) => item.code === code);
      if (existingIndex >= 0) {
        const next = [...current];
        next[existingIndex] = { code, kind };
        return next;
      }

      return [...current, { code, kind }];
    });

    setAddCourseError(null);
    setAddCourseQuery("");
    setAddCourseResults([]);
  };

  const handleGenerate = async () => {
    setBusy(true);
    setError(null);
    setFitNotice(null);
    setOptionalFitStats(null);
    setActionNotice(null);
    setGenerated([]);
    setSavedScheduleIds([]);
    setMainScheduleId(null);

    try {
      if (requiredCodes.length === 0) {
        throw new Error("Add at least one required course to generate schedules.");
      }

      if (maxCredits < minCredits) {
        throw new Error("Maximum credits must be greater than or equal to minimum credits.");
      }

      if (timeConstraint.endHour <= timeConstraint.startHour) {
        throw new Error("Latest end time must be later than earliest start time.");
      }

      const allowedDelivery = new Set<DeliveryMode>();
      if (allowFaceToFace) allowedDelivery.add("face_to_face");
      if (allowBlended) allowedDelivery.add("blended");
      if (allowOnline) allowedDelivery.add("online");

      if (allowedDelivery.size === 0) {
        throw new Error("Select at least one allowed modality.");
      }

      const requiredPlans = await Promise.all(
        requiredCodes.map((code) => resolveCoursePlan(code, season, year, onlyOpen, allowedDelivery, timeConstraint))
      );

      const optionalPlans = await Promise.all(
        optionalCodes.map((code) => resolveCoursePlan(code, season, year, onlyOpen, allowedDelivery, timeConstraint))
      );

      const outcome = generateSchedules(
        requiredPlans,
        optionalPlans,
        minCredits,
        maxCredits,
        buildOptionalWeights(optionalCodes)
      );

      if (outcome.schedules.length === 0) {
        throw new Error("No conflict-free schedules found for required courses under current criteria.");
      }

      setGenerated(outcome.schedules);
      setOptionalFitStats({ best: outcome.bestOptionalCount, total: outcome.totalOptionalCount });
      if (outcome.missingOptionalCodes.length > 0) {
        setFitNotice(`Could not fit these optional courses without conflicts: ${outcome.missingOptionalCodes.join(", ")}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate schedules.");
    } finally {
      setBusy(false);
    }
  };

  const persistGeneratedSchedule = async (schedule: GeneratedSchedule, index: number, isPrimary: boolean) => {
    const actionKey = `${isPrimary ? "main" : "save"}-${schedule.id}`;
    setScheduleActionBusyKey(actionKey);

    try {
      const scheduleName = `Generated ${TERM_LABEL[season]} ${year} Option ${index + 1}`;
      await saveScheduleWithSelections({
        name: scheduleName,
        termCode: season,
        termYear: year,
        isPrimary,
        selectionsJson: {
          sectionIds: schedule.selections.map((selection) => selection.section.id || selection.sectionKey),
          selections: schedule.selections,
        },
      });

      setSavedScheduleIds((current) => (current.includes(schedule.id) ? current : [...current, schedule.id]));
      if (isPrimary) {
        setMainScheduleId(schedule.id);
      }
      setActionNotice(isPrimary ? `Set ${scheduleName} as MAIN for ${activeTermLabel}.` : `Saved ${scheduleName}.`);
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : "Unable to save generated schedule.");
    } finally {
      setScheduleActionBusyKey(null);
    }
  };

  const handleSaveAll = async () => {
    if (generated.length === 0) {
      return;
    }

    setScheduleActionBusyKey("save-all");

    try {
      for (let index = 0; index < generated.length; index += 1) {
        const schedule = generated[index];
        const scheduleName = `Generated ${TERM_LABEL[season]} ${year} Option ${index + 1}`;

        await saveScheduleWithSelections({
          name: scheduleName,
          termCode: season,
          termYear: year,
          selectionsJson: {
            sectionIds: schedule.selections.map((selection) => selection.section.id || selection.sectionKey),
            selections: schedule.selections,
          },
        });
      }

      setSavedScheduleIds(generated.map((schedule) => schedule.id));
      setActionNotice(`Saved ${generated.length} generated schedules for ${activeTermLabel}.`);
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : "Unable to save all generated schedules.");
    } finally {
      setScheduleActionBusyKey(null);
    }
  };

  const openScheduleInBuilder = (schedule: GeneratedSchedule, index: number) => {
    setCatalogTerm(season, year);
    replaceSelections(schedule.selections);
    navigate(`/schedule-builder?term=${termId(season, year)}&generated=1&generatedIndex=${index + 1}`);
  };

  return (
    <div className="course-planner-root cp-generate-root">
      <header className="cp-generate-topbar">
        <div className="cp-generate-topbar-left">
          <h1>
            Generate Schedule
            {showProjectedTimesNote && (
              <span className="cp-projected-times-note cp-projected-times-note-inline">
                Projected Times
                <button
                  ref={projectedInfoRef}
                  type="button"
                  className="cp-projected-times-info"
                  aria-label="What projected times means"
                  onClick={() => setShowProjectedInfo((current) => !current)}
                >
                  i
                </button>
                <ProjectedTimesPopover
                  anchorRef={projectedInfoRef}
                  visible={showProjectedInfo}
                  onClose={() => setShowProjectedInfo(false)}
                />
              </span>
            )}
          </h1>
          <p>Configure your criteria, then let OrbitUMD find every conflict-free combination.</p>
        </div>
        <div className="cp-generate-autosave">
          <div className="cp-generate-autosave-dot" />
          {hasUnsavedCriteria ? "Unsaved criteria changes" : "Criteria saved"}
          {lastAutosavedAt ? ` · ${new Date(lastAutosavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
        </div>
      </header>

      <div className="cp-generate-content">
        <form
          className="cp-generate-config-panel"
          onSubmit={(event) => {
            event.preventDefault();
            void handleGenerate();
          }}
        >
          <TermSelectorSection
            season={season}
            year={year}
            termOptions={termOptions}
            onSeasonChange={handleSeasonChange}
            onYearChange={setYear}
          />

          <div className="cp-generate-divider" />

          <CoursePrioritySection
            coursePreferences={coursePreferences}
            courseLookup={courseLookup}
            addCourseQuery={addCourseQuery}
            addCourseKind={addCourseKind}
            addCourseResults={addCourseResults}
            addCourseBusy={addCourseBusy}
            addCourseError={addCourseError}
            expanded={showAddCourseSearch}
            draggingCode={draggingCode}
            onExpandedChange={setShowAddCourseSearch}
            onAddCourseQueryChange={setAddCourseQuery}
            onAddCourseKindChange={setAddCourseKind}
            onAddCourseByCode={handleAddCourse}
            onRemoveCourse={(code) => {
              setCoursePreferences((current) => current.filter((item) => item.code !== code));
            }}
            onToggleCourseKind={(code) => {
              setCoursePreferences((current) => current.map((item) => (
                item.code === code
                  ? { ...item, kind: item.kind === "required" ? "optional" : "required" }
                  : item
              )));
            }}
            onMoveByStep={(code, direction) => {
              setCoursePreferences((current) => moveByStep(current, code, direction));
            }}
            onStartDrag={(code) => setDraggingCode(code)}
            onDropOnCourse={(targetCode) => {
              if (!draggingCode) return;
              setCoursePreferences((current) => reorderByCode(current, draggingCode, targetCode));
              setDraggingCode(null);
            }}
          />

          <div className="cp-generate-divider" />

          <AdvancedCriteriaSection
            minCredits={minCredits}
            maxCredits={maxCredits}
            allowFaceToFace={allowFaceToFace}
            allowBlended={allowBlended}
            allowOnline={allowOnline}
            onlyOpen={onlyOpen}
            creditsWarning={creditsWarning}
            onMinCreditsChange={setMinCredits}
            onMaxCreditsChange={setMaxCredits}
            onAllowFaceToFaceChange={setAllowFaceToFace}
            onAllowBlendedChange={setAllowBlended}
            onAllowOnlineChange={setAllowOnline}
            onOnlyOpenChange={setOnlyOpen}
          />

          <div className="cp-generate-divider" />

          <TimeConstraintsSection
            constraintStart={constraintStart}
            constraintEnd={constraintEnd}
            excludedDays={excludedDays}
            onConstraintStartChange={setConstraintStart}
            onConstraintEndChange={setConstraintEnd}
            onToggleExcludedDay={(day) => {
              setExcludedDays((current) => {
                const next = new Set(current);
                if (next.has(day)) {
                  next.delete(day);
                } else {
                  next.add(day);
                }
                return next;
              });
            }}
          />

          <button
            type="submit"
            className={`cp-generate-submit-btn ${busy ? "is-loading" : ""}`}
            disabled={busy}
          >
            {busy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
            {busy ? "Finding conflict-free options..." : "Generate Schedules"}
          </button>
        </form>

        <ResultsPanel
          termLabel={activeTermLabel}
          generated={generated}
          busy={busy}
          error={error}
          fitNotice={fitNotice}
          optionalFitStats={optionalFitStats}
          sortMode={resultSortMode}
          actionNotice={actionNotice}
          savedScheduleIds={savedScheduleIds}
          mainScheduleId={mainScheduleId}
          scheduleActionBusyKey={scheduleActionBusyKey}
          onSortModeChange={setResultSortMode}
          onSaveAll={() => {
            void handleSaveAll();
          }}
          onSaveSingle={(schedule, index) => {
            void persistGeneratedSchedule(schedule, index, false);
          }}
          onSetMain={(schedule, index) => {
            void persistGeneratedSchedule(schedule, index, true);
          }}
          onOpenInBuilder={openScheduleInBuilder}
        />
      </div>
    </div>
  );
}
