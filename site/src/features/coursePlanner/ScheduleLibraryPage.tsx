import { useEffect, useMemo, useState } from "react";
import { plannerApi } from "@/lib/api/planner";
import { assignConflictIndexes, buildCalendarMeetings, computeVisibleHourBounds } from "./utils/scheduleLayout";
import { Timeline } from "./components/schedule/Timeline";
import { ScheduleGrid } from "./components/schedule/ScheduleGrid";
import type { ScheduleSelection } from "./types/coursePlanner";
import type { ScheduleWithSelections } from "@/lib/repositories/userSchedulesRepository";
import "./styles/coursePlanner.css";

type SortOrder = "asc" | "desc";

function parseSelections(stored: unknown): ScheduleSelection[] {
  const payload = (stored ?? []) as { selections?: ScheduleSelection[] } | ScheduleSelection[];
  if (Array.isArray(payload)) {
    return payload;
  }
  return Array.isArray(payload.selections) ? payload.selections : [];
}

function formatTermLabel(termCode: string | null, termYear: number | null): string {
  const termMap: Record<string, string> = {
    "01": "Spring",
    "05": "Summer",
    "08": "Fall",
    "12": "Winter",
  };

  const code = termCode ?? "";
  const year = termYear ?? 0;
  if (!termMap[code] || !year) {
    return "Unknown Term";
  }

  return `${termMap[code]} ${year}`;
}

function ScheduleSnapshot({ selections }: { selections: ScheduleSelection[] }) {
  const selectionMap = useMemo(() => {
    const map: Record<string, ScheduleSelection> = {};
    for (const selection of selections) {
      map[selection.sectionKey] = selection;
    }
    return map;
  }, [selections]);

  const meetings = useMemo(() => {
    const raw = Object.values(selectionMap).flatMap((selection) =>
      buildCalendarMeetings({
        sectionKey: selection.sectionKey,
        courseCode: selection.course.courseCode,
        sectionCode: selection.section.sectionCode,
        title: selection.course.name,
        instructor: selection.section.instructor,
        meetings: selection.section.meetings,
      })
    );
    return assignConflictIndexes(raw);
  }, [selectionMap]);

  const bounds = useMemo(
    () => computeVisibleHourBounds(meetings.filter((meeting) => meeting.day !== "Other"), { printMode: false }),
    [meetings]
  );

  return (
    <section className="cp-calendar cp-calendar-preview">
      <Timeline startHour={bounds.startHour} endHour={bounds.endHour} />
      <ScheduleGrid
        meetings={meetings}
        bounds={bounds}
        readOnly
        showDetails={false}
        onOpenInfo={() => {}}
        onRemove={() => {}}
      />
    </section>
  );
}

export function ScheduleLibraryPage() {
  const [schedules, setSchedules] = useState<ScheduleWithSelections[]>([]);
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [termFilter, setTermFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const results = await plannerApi.listAllSchedulesWithSelections();
        if (!active) return;
        setSchedules(results);
        setErrorMessage(null);
      } catch (error) {
        if (!active) return;
        const msg = error instanceof Error ? error.message : "Failed to load schedules.";
        setErrorMessage(msg);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, []);

  const ordered = useMemo(() => {
    const needle = searchInput.trim().toLowerCase();

    const filtered = schedules.filter((schedule) => {
      const termId = `${schedule.term_code ?? ""}-${schedule.term_year ?? ""}`;
      if (termFilter !== "all" && termId !== termFilter) {
        return false;
      }

      if (!needle) {
        return true;
      }

      const selections = parseSelections(schedule.selections_json);
      const classesText = selections
        .map((selection) => `${selection.course.courseCode} ${selection.course.name} ${selection.section.sectionCode}`)
        .join(" ")
        .toLowerCase();

      return schedule.name.toLowerCase().includes(needle) || classesText.includes(needle);
    });

    const copy = [...filtered];
    copy.sort((a, b) => {
      const aTime = new Date(a.updated_at).getTime();
      const bTime = new Date(b.updated_at).getTime();
      return sortOrder === "asc" ? aTime - bTime : bTime - aTime;
    });
    return copy;
  }, [schedules, sortOrder, searchInput, termFilter]);

  const termOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const schedule of schedules) {
      if (schedule.term_code && schedule.term_year) {
        keys.add(`${schedule.term_code}-${schedule.term_year}`);
      }
    }

    return Array.from(keys)
      .map((value) => {
        const [termCode, yearText] = value.split("-");
        return {
          value,
          label: formatTermLabel(termCode ?? null, Number(yearText)),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [schedules]);

  return (
    <div className="cp-library-root">
      <div className="cp-library-header">
        <h1>All Schedules</h1>
        <div className="cp-library-controls">
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by schedule name or class..."
          />
          <select value={termFilter} onChange={(event) => setTermFilter(event.target.value)}>
            <option value="all">All Terms</option>
            {termOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button
            type="button"
            className="cp-builder-action-btn"
            onClick={() => setSortOrder((current) => (current === "asc" ? "desc" : "asc"))}
          >
            Sort by Last Edited: {sortOrder === "asc" ? "Ascending" : "Descending"}
          </button>
        </div>
      </div>

      {loading && <p className="cp-muted-text">Loading schedules...</p>}

      {!loading && errorMessage && <p className="cp-error-text">{errorMessage}</p>}

      {!loading && !errorMessage && ordered.length === 0 && <p className="cp-muted-text">No saved schedules yet.</p>}

      <div className="cp-library-list">
        {ordered.map((schedule) => {
          const selections = parseSelections(schedule.selections_json);

          return (
            <article key={schedule.id} className="cp-library-card">
              <div className="cp-library-info">
                <h2>{schedule.name}</h2>
                <p>Term: {formatTermLabel(schedule.term_code, schedule.term_year)}</p>
                <p>Last edited: {new Date(schedule.updated_at).toLocaleString()}</p>
                <p>Classes: {selections.length}</p>
                <ul className="cp-library-classes">
                  {selections.map((selection) => (
                    <li key={selection.sectionKey}>
                      {selection.course.courseCode} - {selection.section.sectionCode}
                    </li>
                  ))}
                </ul>
              </div>
              <ScheduleSnapshot selections={selections} />
            </article>
          );
        })}
      </div>
    </div>
  );
}
