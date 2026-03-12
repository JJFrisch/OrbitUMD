import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { CalendarDays, Loader2, Sparkles } from "lucide-react";
import { getSectionsForCourse, searchCoursesWithStrategy } from "./services/courseSearchService";
import { useCoursePlannerStore } from "./state/coursePlannerStore";
import { getSectionIdentityKey, normalizeSearchInput } from "./utils/formatting";
import { assignConflictIndexes, buildCalendarMeetings, computeVisibleHourBounds, parseMeetingDays, parseTimeToHour } from "./utils/scheduleLayout";
import { Timeline } from "./components/schedule/Timeline";
import { ScheduleGrid } from "./components/schedule/ScheduleGrid";
import type { CalendarMeeting, Course, ScheduleSelection, SearchFilters, Section, Weekday } from "./types/coursePlanner";
import "./styles/coursePlanner.css";

type Season = "01" | "05" | "08" | "12";

type DeliveryMode = "face_to_face" | "blended" | "online";

interface CoursePlan {
  course: Course;
  sections: Section[];
}

interface TimeExclusion {
  allDay: boolean;
  days: Set<Weekday>;
  startHour: number;
  endHour: number;
}

interface GeneratedSchedule {
  id: string;
  selections: ScheduleSelection[];
  credits: number;
}

interface ScheduleSummary {
  classCount: number;
  earliestLabel: string;
  latestLabel: string;
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

const WEEKDAYS: Weekday[] = ["M", "Tu", "W", "Th", "F"];

function parseCourseCodes(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,]+/)
        .map((value) => normalizeSearchInput(value))
        .filter((value) => /^[A-Z]{4}[0-9]{3}[A-Z]{0,2}$/.test(value))
    )
  );
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

function sectionConflictsWithExclusion(section: Section, exclusion: TimeExclusion): boolean {
  if (exclusion.days.size === 0) {
    return false;
  }

  for (const meeting of section.meetings) {
    const days = parseMeetingDays(meeting.days).filter((day) => day !== "Other");
    if (days.length === 0 || !days.some((day) => exclusion.days.has(day))) {
      continue;
    }

    if (exclusion.allDay) {
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

    const overlaps = start < exclusion.endHour && exclusion.startHour < end;
    if (overlaps) {
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

      const overlaps = leftStart < rightEnd && rightStart < leftEnd;
      if (overlaps) {
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
  exclusion: TimeExclusion
): Promise<CoursePlan> {
  const matches = await searchCoursesWithStrategy({
    normalizedInput: code,
    term,
    year,
    includeSections: false,
    filters: DEFAULT_SEARCH_FILTERS,
  });

  const exactMatch = matches.find((course) => normalizeSearchInput(course.courseCode) === code);
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

    if (sectionConflictsWithExclusion(section, exclusion)) {
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

function termId(term: Season, year: number): string {
  return `${term}-${year}`;
}

function formatHourLabel(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const wholeHour = Math.floor(normalized);
  const minutes = Math.round((normalized - wholeHour) * 60);
  const period = wholeHour >= 12 ? "PM" : "AM";
  const displayHour = wholeHour % 12 === 0 ? 12 : wholeHour % 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`;
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

export function AutoGenerateSchedulePage() {
  const navigate = useNavigate();
  const setCatalogTerm = useCoursePlannerStore((state) => state.setCatalogTerm);
  const replaceSelections = useCoursePlannerStore((state) => state.replaceSelections);

  const [season, setSeason] = useState<Season>("08");
  const [year, setYear] = useState(2026);
  const [requiredRaw, setRequiredRaw] = useState("");
  const [optionalRaw, setOptionalRaw] = useState("");

  const [minCredits, setMinCredits] = useState(12);
  const [maxCredits, setMaxCredits] = useState(20);
  const [onlyOpen, setOnlyOpen] = useState(true);

  const [allowFaceToFace, setAllowFaceToFace] = useState(true);
  const [allowBlended, setAllowBlended] = useState(true);
  const [allowOnline, setAllowOnline] = useState(true);

  const [excludeAllDay, setExcludeAllDay] = useState(true);
  const [excludeStart, setExcludeStart] = useState("09:00");
  const [excludeEnd, setExcludeEnd] = useState("17:00");
  const [excludedDays, setExcludedDays] = useState<Set<Weekday>>(new Set());

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedSchedule[]>([]);
  const [activeScheduleIndex, setActiveScheduleIndex] = useState(0);

  const requiredCodes = useMemo(() => parseCourseCodes(requiredRaw), [requiredRaw]);
  const optionalCodes = useMemo(() => parseCourseCodes(optionalRaw), [optionalRaw]);

  const creditsWarning = maxCredits < minCredits;

  const exclusion = useMemo<TimeExclusion>(() => {
    const [startHourRaw, startMinuteRaw] = excludeStart.split(":").map((value) => Number(value));
    const [endHourRaw, endMinuteRaw] = excludeEnd.split(":").map((value) => Number(value));

    return {
      allDay: excludeAllDay,
      days: excludedDays,
      startHour: (startHourRaw || 0) + (startMinuteRaw || 0) / 60,
      endHour: (endHourRaw || 0) + (endMinuteRaw || 0) / 60,
    };
  }, [excludeAllDay, excludeEnd, excludeStart, excludedDays]);

  const handleGenerate = async () => {
    setBusy(true);
    setError(null);
    setGenerated([]);

    try {
      if (requiredCodes.length === 0) {
        throw new Error("Enter at least one required course code to generate schedules.");
      }

      if (maxCredits < minCredits) {
        throw new Error("Maximum credits must be greater than or equal to minimum credits.");
      }

      const allowedDelivery = new Set<DeliveryMode>();
      if (allowFaceToFace) allowedDelivery.add("face_to_face");
      if (allowBlended) allowedDelivery.add("blended");
      if (allowOnline) allowedDelivery.add("online");

      const requiredPlans = await Promise.all(
        requiredCodes.map((code) => resolveCoursePlan(code, season, year, onlyOpen, allowedDelivery, exclusion))
      );

      const optionalPlans = await Promise.all(
        optionalCodes.map((code) => resolveCoursePlan(code, season, year, onlyOpen, allowedDelivery, exclusion))
      );

      const orderedRequired = [...requiredPlans].sort((a, b) => a.sections.length - b.sections.length);
      const results: GeneratedSchedule[] = [];

      const backtrackRequired = (idx: number, chosen: ScheduleSelection[]) => {
        if (results.length >= 8) return;

        if (idx >= orderedRequired.length) {
          const baseCredits = totalCredits(chosen);
          const optionalCandidates = [...optionalPlans];

          const tryOptional = (optIdx: number, acc: ScheduleSelection[]) => {
            if (results.length >= 8) return;

            const credits = totalCredits(acc);
            if (credits > maxCredits) {
              return;
            }

            if (optIdx >= optionalCandidates.length) {
              if (credits >= minCredits && credits <= maxCredits) {
                results.push({
                  id: `auto-${results.length + 1}`,
                  selections: [...acc],
                  credits,
                });
              }
              return;
            }

            // Option 1: skip this optional course.
            tryOptional(optIdx + 1, acc);

            // Option 2: include one valid section for this optional course.
            const optional = optionalCandidates[optIdx];
            for (const section of optional.sections) {
              if (totalCredits(acc) + (optional.course.maxCredits || optional.course.credits || 0) > maxCredits) {
                continue;
              }

              const conflict = acc.some((selection) => sectionsConflict(selection.section, section));
              if (conflict) {
                continue;
              }

              tryOptional(optIdx + 1, [...acc, buildSelection(optional.course, section)]);
            }
          };

          if (baseCredits <= maxCredits) {
            tryOptional(0, chosen);
          }
          return;
        }

        const currentCourse = orderedRequired[idx];
        for (const section of currentCourse.sections) {
          const conflict = chosen.some((selection) => sectionsConflict(selection.section, section));
          if (conflict) {
            continue;
          }

          backtrackRequired(idx + 1, [...chosen, buildSelection(currentCourse.course, section)]);
        }
      };

      backtrackRequired(0, []);

      if (results.length === 0) {
        throw new Error("No conflict-free schedules found for the selected criteria.");
      }

      setGenerated(results);
      setActiveScheduleIndex(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to generate schedules.";
      setError(message);
      setActiveScheduleIndex(0);
    } finally {
      setBusy(false);
    }
  };

  const activeSchedule = generated[activeScheduleIndex] ?? null;
  const activeSummary = activeSchedule ? buildScheduleSummary(activeSchedule) : null;
  const activeScheduleMeetings = useMemo<CalendarMeeting[]>(() => {
    if (!activeSchedule) {
      return [];
    }

    const rawMeetings = activeSchedule.selections.flatMap((selection) =>
      buildCalendarMeetings({
        sectionKey: selection.sectionKey,
        courseCode: selection.course.courseCode,
        sectionCode: selection.section.sectionCode,
        title: selection.course.name,
        instructor: selection.section.instructor,
        meetings: selection.section.meetings,
      })
    );

    return assignConflictIndexes(rawMeetings);
  }, [activeSchedule]);
  const activeScheduleBounds = useMemo(
    () => computeVisibleHourBounds(activeScheduleMeetings.filter((meeting) => meeting.day !== "Other")),
    [activeScheduleMeetings]
  );

  return (
    <div className="course-planner-root cp-generate-root">
      <header className="cp-generate-header">
        <div>
          <h1>Auto Generate Schedules</h1>
          <p>Set criteria, then generate conflict-free schedule options in OrbitUMD style.</p>
        </div>
        <button type="button" className="cp-builder-action-btn is-primary" onClick={handleGenerate} disabled={busy}>
          {busy ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
          {busy ? "Generating..." : "Generate Schedules"}
        </button>
      </header>

      <section className="cp-generate-layout">
        <div className="cp-generate-criteria">
          <article className="cp-generate-card">
            <h2>Term</h2>
            <div className="cp-filter-row">
              <label>
                Season
                <select value={season} onChange={(event) => setSeason(event.target.value as Season)}>
                  <option value="01">Spring</option>
                  <option value="05">Summer</option>
                  <option value="08">Fall</option>
                  <option value="12">Winter</option>
                </select>
              </label>
              <label>
                Year
                <input
                  type="number"
                  value={year}
                  min={2020}
                  max={2100}
                  onChange={(event) => setYear(Number(event.target.value) || 2026)}
                />
              </label>
            </div>
          </article>

          <article className="cp-generate-card">
            <h2>Courses</h2>
            <label>
              Required Courses
              <input
                value={requiredRaw}
                onChange={(event) => setRequiredRaw(event.target.value)}
                placeholder="CMSC131 MATH140"
              />
            </label>
            <label>
              Optional Courses
              <input
                value={optionalRaw}
                onChange={(event) => setOptionalRaw(event.target.value)}
                placeholder="ENGL101 COMM107"
              />
            </label>
            <p className="cp-muted-text">Parsed: {requiredCodes.length} required, {optionalCodes.length} optional.</p>
          </article>

          <article className="cp-generate-card">
            <h2>Advanced Criteria</h2>
            <div className="cp-filter-row">
              <label>
                Min Credits
                <input type="number" value={minCredits} min={1} max={30} onChange={(e) => setMinCredits(Number(e.target.value) || 1)} />
              </label>
              <label>
                Max Credits
                <input type="number" value={maxCredits} min={1} max={30} onChange={(e) => setMaxCredits(Number(e.target.value) || 1)} />
              </label>
            </div>
            <label className="cp-checkbox-label">
              <input type="checkbox" checked={onlyOpen} onChange={(event) => setOnlyOpen(event.target.checked)} />
              Open sections only
            </label>
            <div className="cp-generate-delivery-row">
              <label className="cp-checkbox-label">
                <input type="checkbox" checked={allowFaceToFace} onChange={(e) => setAllowFaceToFace(e.target.checked)} />
                Face-to-face
              </label>
              <label className="cp-checkbox-label">
                <input type="checkbox" checked={allowBlended} onChange={(e) => setAllowBlended(e.target.checked)} />
                Blended
              </label>
              <label className="cp-checkbox-label">
                <input type="checkbox" checked={allowOnline} onChange={(e) => setAllowOnline(e.target.checked)} />
                Online
              </label>
            </div>
            {creditsWarning && <p className="cp-error-text">Maximum credits must be at least minimum credits.</p>}
          </article>

          <article className="cp-generate-card">
            <h2>Time Exclusions</h2>
            <label className="cp-checkbox-label">
              <input type="checkbox" checked={excludeAllDay} onChange={(event) => setExcludeAllDay(event.target.checked)} />
              Exclude selected days all day
            </label>
            {!excludeAllDay && (
              <div className="cp-filter-row">
                <label>
                  Start
                  <input type="time" value={excludeStart} onChange={(e) => setExcludeStart(e.target.value)} />
                </label>
                <label>
                  End
                  <input type="time" value={excludeEnd} onChange={(e) => setExcludeEnd(e.target.value)} />
                </label>
              </div>
            )}
            <div className="cp-generate-days-row">
              {WEEKDAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  className={`cp-builder-action-btn ${excludedDays.has(day) ? "is-primary" : ""}`}
                  onClick={() => {
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
                >
                  {day}
                </button>
              ))}
            </div>
          </article>
        </div>

        <div className="cp-generate-results">
          <div className="cp-generate-results-header">
            <span className="cp-builder-subtitle"><CalendarDays size={14} /> Generated Schedules ({generated.length})</span>
            {generated.length > 0 && (
              <div className="cp-generate-nav-row">
                <button
                  type="button"
                  className="cp-builder-action-btn cp-generate-nav-btn"
                  onClick={() => setActiveScheduleIndex((current) => Math.max(0, current - 1))}
                  disabled={activeScheduleIndex <= 0}
                >
                  Previous
                </button>
                <span className="cp-muted-text">
                  Option {activeScheduleIndex + 1} of {generated.length}
                </span>
                <button
                  type="button"
                  className="cp-builder-action-btn cp-generate-nav-btn"
                  onClick={() => setActiveScheduleIndex((current) => Math.min(generated.length - 1, current + 1))}
                  disabled={activeScheduleIndex >= generated.length - 1}
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {error && <p className="cp-error-text">{error}</p>}
          {!error && generated.length === 0 && !busy && (
            <p className="cp-muted-text">No schedules generated yet. Add criteria and click Generate Schedules.</p>
          )}

          <div className="cp-generate-result-list">
            {activeSchedule && activeSummary && (
              <article key={activeSchedule.id} className="cp-generate-result-card" data-testid="generated-schedule-card">
                <header>
                  <h3>Option {activeScheduleIndex + 1}</h3>
                  <span>{activeSchedule.credits} credits</span>
                </header>

                <div className="cp-generate-stats-row" data-testid="generated-schedule-summary">
                  <span>Classes: {activeSummary.classCount}</span>
                  <span>Earliest: {activeSummary.earliestLabel}</span>
                  <span>Latest: {activeSummary.latestLabel}</span>
                </div>

                <section className="cp-calendar cp-calendar-preview" data-testid="generated-schedule-calendar">
                  <Timeline startHour={activeScheduleBounds.startHour} endHour={activeScheduleBounds.endHour} />
                  <ScheduleGrid
                    meetings={activeScheduleMeetings}
                    bounds={activeScheduleBounds}
                    readOnly
                    showDetails
                    onOpenInfo={() => {}}
                    onRemove={() => {}}
                  />
                </section>

                <button
                  type="button"
                  className="cp-builder-action-btn is-primary"
                  onClick={() => {
                    setCatalogTerm(season, year);
                    replaceSelections(activeSchedule.selections);
                    navigate(`/schedule-builder?term=${termId(season, year)}`);
                  }}
                >
                  Open In Schedule Builder
                </button>
              </article>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
