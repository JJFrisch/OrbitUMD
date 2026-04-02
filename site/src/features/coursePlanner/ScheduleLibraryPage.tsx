import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ArrowUpDown, BookOpen, Calendar, Check, Clock, Edit2, Info, Plus, Star, Trash2, X } from "lucide-react";
import { plannerApi } from "@/lib/api/planner";
import { compareAcademicTerms, getAcademicProgressStatus } from "@/lib/scheduling/termProgress";
import { fetchTerms } from "@/lib/api/umdCourses";
import { assignConflictIndexes, buildCalendarMeetings, computeVisibleHourBounds } from "./utils/scheduleLayout";
import { getCourseColor } from "./utils/colorPalette";
import { Timeline } from "./components/schedule/Timeline";
import { ScheduleGrid } from "./components/schedule/ScheduleGrid";
import { ProjectedTimesPopover } from "./components/schedule/ProjectedTimesPopover";
import type { ScheduleSelection } from "./types/coursePlanner";
import type { ScheduleWithSelections } from "@/lib/repositories/userSchedulesRepository";
import "./styles/coursePlanner.css";

type SortOrder = "asc" | "desc";
type SortBy = "name" | "lastEdited" | "credits" | "courses";

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

function parseTermFromSchedule(schedule: ScheduleWithSelections): { termCode: string; termYear: number } | null {
  if (schedule.term_code && schedule.term_year) {
    return { termCode: schedule.term_code, termYear: schedule.term_year };
  }
  return null;
}

function totalCreditsForSchedule(schedule: ScheduleWithSelections): number {
  return parseSelections(schedule.selections_json).reduce(
    (sum, selection) => sum + (selection.course.maxCredits || selection.course.credits || 0),
    0
  );
}

function getEarliestLatest(schedule: ScheduleWithSelections): { earliest: string; latest: string } {
  const selections = parseSelections(schedule.selections_json);
  const values: number[] = [];

  const parseClock = (raw: string | undefined) => {
    if (!raw) return Number.NaN;
    const normalized = raw.trim().toLowerCase().replace(/\s+/g, "");

    const ampmMatch = normalized.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
    if (ampmMatch) {
      const [, hourRaw, minuteRaw, suffix] = ampmMatch;
      let hour = Number(hourRaw);
      const minute = Number(minuteRaw);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.NaN;

      if (suffix === "am") {
        if (hour === 12) hour = 0;
      } else if (hour !== 12) {
        hour += 12;
      }

      return hour + minute / 60;
    }

    const twentyFourHourMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
    if (twentyFourHourMatch) {
      const [, hourRaw, minuteRaw] = twentyFourHourMatch;
      const hour = Number(hourRaw);
      const minute = Number(minuteRaw);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.NaN;
      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return Number.NaN;
      return hour + minute / 60;
    }

    return Number.NaN;
  };

  const toClock = (hourValue: number) => {
    const hour24 = Math.floor(hourValue);
    const minute = Math.round((hourValue - hour24) * 60);
    const suffix = hour24 >= 12 ? "pm" : "am";
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${hour12}:${String(minute).padStart(2, "0")}${suffix}`;
  };

  for (const selection of selections) {
    for (const meeting of selection.section.meetings) {
      const start = parseClock(meeting.startTime);
      const end = parseClock(meeting.endTime);
      if (Number.isFinite(start)) values.push(start);
      if (Number.isFinite(end)) values.push(end);
    }
  }

  if (values.length === 0) {
    return { earliest: "-", latest: "-" };
  }

  return {
    earliest: toClock(Math.min(...values)),
    latest: toClock(Math.max(...values)),
  };
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
        showDetails
        onOpenInfo={() => {}}
        onRemove={() => {}}
      />
    </section>
  );
}

export function ScheduleLibraryPage({
  hideHeader = false,
  termFilter: externalTermFilter,
  selectedScheduleId,
  onSelectedScheduleChange,
}: {
  hideHeader?: boolean;
  termFilter?: string;
  selectedScheduleId?: string | null;
  onSelectedScheduleChange?: (scheduleId: string | null) => void;
} = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedScheduleId = searchParams.get("scheduleId");
  const [schedules, setSchedules] = useState<ScheduleWithSelections[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>("lastEdited");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [internalTermFilter, setInternalTermFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [previewScheduleId, setPreviewScheduleId] = useState<string>("");
  const [renameScheduleId, setRenameScheduleId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showProjectedInfo, setShowProjectedInfo] = useState(false);
  const projectedInfoRef = useRef<HTMLButtonElement | null>(null);
  const [latestCatalogTerm, setLatestCatalogTerm] = useState<{ termCode: string; termYear: number } | null>(null);

  const termFilter = externalTermFilter ?? internalTermFilter;

  const refreshSchedules = async () => {
    const results = await plannerApi.listAllSchedulesWithSelections();
    const byRecent = [...results].sort((left, right) => (
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
    ));
    setSchedules(byRecent);
    setErrorMessage(null);
    setPreviewScheduleId((current) => {
      if (requestedScheduleId && byRecent.some((schedule) => schedule.id === requestedScheduleId)) {
        return requestedScheduleId;
      }
      if (current && byRecent.some((schedule) => schedule.id === current)) {
        return current;
      }
      return byRecent[0]?.id ?? "";
    });
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const results = await plannerApi.listAllSchedulesWithSelections();
        const byRecent = [...results].sort((left, right) => (
          new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
        ));
        if (!active) return;
        setSchedules(byRecent);
        setErrorMessage(null);
        if (requestedScheduleId && byRecent.some((schedule) => schedule.id === requestedScheduleId)) {
          setPreviewScheduleId(requestedScheduleId);
        } else {
          setPreviewScheduleId(byRecent[0]?.id ?? "");
        }
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
  }, [requestedScheduleId]);

  useEffect(() => {
    if (!requestedScheduleId) return;
    if (schedules.some((schedule) => schedule.id === requestedScheduleId)) {
      setPreviewScheduleId(requestedScheduleId);
    }
  }, [requestedScheduleId, schedules]);

  useEffect(() => {
    if (!selectedScheduleId) return;
    if (!schedules.some((schedule) => schedule.id === selectedScheduleId)) return;
    setPreviewScheduleId(selectedScheduleId);
  }, [selectedScheduleId, schedules]);

  const toggleSort = (key: SortBy) => {
    if (sortBy === key) {
      setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortBy(key);
    setSortOrder(key === "lastEdited" ? "desc" : "asc");
  };

  const filteredAndSorted = useMemo(() => {
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
      // Primary sort: main schedule is always at top
      if (a.is_primary !== b.is_primary) {
        return b.is_primary ? 1 : -1; // main schedule (b.is_primary=true) comes first
      }

      // Secondary sort: apply user's selected sort order
      let cmp = 0;
      if (sortBy === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortBy === "lastEdited") {
        cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      } else if (sortBy === "credits") {
        cmp = totalCreditsForSchedule(a) - totalCreditsForSchedule(b);
      } else if (sortBy === "courses") {
        cmp = parseSelections(a.selections_json).length - parseSelections(b.selections_json).length;
      }

      return sortOrder === "asc" ? cmp : -cmp;
    });

    return copy;
  }, [schedules, searchInput, sortBy, sortOrder, termFilter]);

  const groupedByTerm = useMemo(() => {
    const groupMap = new Map<string, ScheduleWithSelections[]>();
    for (const schedule of filteredAndSorted) {
      const key = formatTermLabel(schedule.term_code, schedule.term_year);
      const existing = groupMap.get(key) ?? [];
      existing.push(schedule);
      groupMap.set(key, existing);
    }

    const grouped = Array.from(groupMap.entries()).map(([term, groupSchedules]) => {
      const reference = groupSchedules[0];
      const termCode = reference?.term_code ?? null;
      const termYear = reference?.term_year ?? null;
      return {
        term,
        schedules: groupSchedules,
        termCode,
        termYear,
      };
    });

    const rank = (termCode: string | null, termYear: number | null) => {
      if (!termCode || !termYear) return 3;
      const status = getAcademicProgressStatus({ termCode, termYear });
      if (status === "in_progress") return 0;
      if (status === "planned") return 1;
      return 2;
    };

    grouped.sort((left, right) => {
      const leftRank = rank(left.termCode, left.termYear);
      const rightRank = rank(right.termCode, right.termYear);
      if (leftRank !== rightRank) return leftRank - rightRank;

      if (!left.termCode || !left.termYear || !right.termCode || !right.termYear) {
        return left.term.localeCompare(right.term);
      }

      return compareAcademicTerms(
        { termCode: left.termCode, termYear: left.termYear },
        { termCode: right.termCode, termYear: right.termYear },
      );
    });

    return grouped.map(({ term, schedules }) => ({ term, schedules }));
  }, [filteredAndSorted]);

  const previewSchedule = useMemo(
    () => schedules.find((schedule) => schedule.id === previewScheduleId) ?? null,
    [previewScheduleId, schedules]
  );

  const previewUsesProjectedTimes = useMemo(() => {
    if (!latestCatalogTerm) return false;
    const term = previewSchedule ? parseTermFromSchedule(previewSchedule) : null;
    if (!term) return false;
    return compareAcademicTerms({ termCode: term.termCode, termYear: term.termYear }, latestCatalogTerm) > 0;
  }, [previewSchedule, latestCatalogTerm]);

  useEffect(() => {
    let active = true;
    fetchTerms()
      .then((terms) => {
        if (!active || terms.length === 0) return;
        const sorted = terms
          .map((term) => ({ termCode: term.code.slice(-2), termYear: term.year }))
          .sort((left, right) => compareAcademicTerms(left, right));
        setLatestCatalogTerm(sorted[sorted.length - 1]);
      })
      .catch(() => {
        if (!active) return;
      });

    return () => {
      active = false;
    };
  }, []);

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
  }, [showProjectedInfo, projectedInfoRef]);

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

  const handleSetMain = async (schedule: ScheduleWithSelections) => {
    const term = parseTermFromSchedule(schedule);
    if (!term) {
      setErrorMessage("Cannot set MAIN because this schedule has no resolvable term.");
      return;
    }

    setActionPendingId(schedule.id);
    try {
      await plannerApi.saveScheduleWithSelections({
        id: schedule.id,
        name: schedule.name,
        termCode: term.termCode,
        termYear: term.termYear,
        isPrimary: true,
        selectionsJson: schedule.selections_json,
      });
      await refreshSchedules();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to set MAIN schedule.");
    } finally {
      setActionPendingId(null);
    }
  };

  const handleDelete = async (scheduleId: string) => {
    setActionPendingId(scheduleId);
    try {
      await plannerApi.deleteUserSchedule(scheduleId);
      await refreshSchedules();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete schedule.");
    } finally {
      setActionPendingId(null);
    }
  };

  const handleStartRename = (schedule: ScheduleWithSelections) => {
    setRenameScheduleId(schedule.id);
    setRenameDraft(schedule.name);
  };

  const handleCancelRename = () => {
    setRenameScheduleId(null);
    setRenameDraft("");
  };

  const handleSubmitRename = async (schedule: ScheduleWithSelections) => {
    const term = parseTermFromSchedule(schedule);
    if (!term) {
      setErrorMessage("Cannot rename because this schedule has no resolvable term.");
      return;
    }

    const nextName = renameDraft.trim();
    if (nextName.length === 0) {
      setErrorMessage("Schedule name cannot be empty.");
      return;
    }

    if (nextName === schedule.name) {
      handleCancelRename();
      return;
    }

    setActionPendingId(schedule.id);
    try {
      await plannerApi.saveScheduleWithSelections({
        id: schedule.id,
        name: nextName,
        termCode: term.termCode,
        termYear: term.termYear,
        isPrimary: schedule.is_primary,
        selectionsJson: schedule.selections_json,
      });
      await refreshSchedules();
      setRenameScheduleId(null);
      setRenameDraft("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to rename schedule.");
    } finally {
      setActionPendingId(null);
    }
  };

  const openInBuilder = (schedule: ScheduleWithSelections) => {
    const term = parseTermFromSchedule(schedule);
    const termParam = term ? `${term.termCode}-${term.termYear}` : "";
    if (hideHeader) {
      navigate(`/schedules?tab=edit&scheduleId=${schedule.id}&term=${termParam}`);
    } else {
      navigate(`/schedule-builder?scheduleId=${schedule.id}&term=${termParam}`);
    }
  };

  const previewSelections = previewSchedule ? parseSelections(previewSchedule.selections_json) : [];
  const previewCredits = previewSchedule ? totalCreditsForSchedule(previewSchedule) : 0;
  const previewStats = previewSchedule ? getEarliestLatest(previewSchedule) : null;

  return (
    <div className="course-planner-root cp-view-root">
      {!hideHeader && (
        <div className="cp-view-header">
          <div>
            <h1>
              All Schedules
              {previewUsesProjectedTimes && (
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
            <p>Compare and edit schedules.</p>
          </div>

          <div className="cp-view-actions">
            <button type="button" className="cp-builder-action-btn" onClick={() => navigate("/schedule-builder?new=1")}>
              <Plus size={13} /> New Schedule
            </button>
          </div>
        </div>
      )}

      {/* Subheader strip like HTML template */}
      <div className="cp-view-subheader">
        <div className="cp-view-subheader-left">
          <span className="cp-view-sh-title">My Schedules</span>
          <span className="cp-view-sh-count">{filteredAndSorted.length} saved</span>
        </div>
        <div className="cp-view-subheader-right">
          Click to preview · double-click to edit
        </div>
      </div>

      {/* Two-column layout */}
      <div className="cp-view-layout">
        {/* Left: schedule list */}
        <div className="cp-view-list-panel">
          {loading && <p className="cp-muted-text cp-view-list-msg">Loading schedules...</p>}
          {!loading && errorMessage && <p className="cp-error-text cp-view-list-msg">{errorMessage}</p>}
          {!loading && !errorMessage && filteredAndSorted.length === 0 && (
            <div className="cp-view-empty-state cp-view-empty-state--compact">
              <Calendar size={34} />
              <p>No schedules yet.</p>
            </div>
          )}

          {filteredAndSorted.map((schedule) => {
            const selections = parseSelections(schedule.selections_json);
            const totalCredits = totalCreditsForSchedule(schedule);
            const stats = getEarliestLatest(schedule);
            const selected = schedule.id === previewScheduleId;
            const busy = actionPendingId === schedule.id;
            const renaming = renameScheduleId === schedule.id;

            return (
              <div
                key={schedule.id}
                className={`cp-view-card${selected ? " is-selected" : ""}${schedule.is_primary ? " is-main" : ""}`}
                onClick={() => {
                  setPreviewScheduleId(schedule.id);
                  onSelectedScheduleChange?.(schedule.id);
                }}
                onDoubleClick={() => openInBuilder(schedule)}
              >
                <div className="cp-view-card-head">
                  <div className="cp-view-card-info">
                    <div className="cp-view-card-badges">
                      {schedule.is_primary && (
                        <span className="cp-view-card-badge badge-main">Main</span>
                      )}
                      {!schedule.is_primary && (
                        <span className="cp-view-card-badge badge-draft">Draft</span>
                      )}
                    </div>
                    {renaming ? (
                      <div className="cp-view-rename-row" onClick={(event) => event.stopPropagation()}>
                        <input
                          value={renameDraft}
                          onChange={(event) => setRenameDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void handleSubmitRename(schedule);
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              handleCancelRename();
                            }
                          }}
                          autoFocus
                          aria-label="Rename schedule"
                        />
                        <button
                          type="button"
                          className="cp-inline-link"
                          disabled={busy}
                          onClick={() => void handleSubmitRename(schedule)}
                          aria-label="Save schedule name"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          className="cp-inline-link"
                          disabled={busy}
                          onClick={handleCancelRename}
                          aria-label="Cancel rename"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="cp-view-card-title-row">
                        <button
                          type="button"
                          className="cp-view-title-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleStartRename(schedule);
                          }}
                          aria-label={`Rename ${schedule.name}`}
                        >
                          <h3>{schedule.name}</h3>
                        </button>
                      </div>
                    )}
                    <div className="cp-view-card-meta">
                      {totalCredits} cr · {selections.length} courses · {stats.earliest}–{stats.latest} · edited {new Date(schedule.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                  </div>

                  <div className="cp-view-card-actions" onClick={(event) => event.stopPropagation()}>
                    {!schedule.is_primary && (
                      <button
                        type="button"
                        className="cp-view-card-action-btn"
                        disabled={busy}
                        onClick={() => void handleSetMain(schedule)}
                        title="Set as MAIN"
                      >
                        <Star size={11} />
                      </button>
                    )}

                    <button
                      type="button"
                      className="cp-view-card-action-btn"
                      disabled={busy}
                      onClick={() => void handleDelete(schedule.id)}
                      title="Delete"
                    >
                      <Trash2 size={11} />
                    </button>

                    <button
                      type="button"
                      className="cp-view-card-action-btn is-edit"
                      onClick={() => openInBuilder(schedule)}
                      title="Edit this schedule"
                    >
                      <Edit2 size={11} />
                    </button>
                  </div>
                </div>

                {/* Course chips strip */}
                <div className="cp-view-card-chips">
                  {selections.map((selection) => (
                    <div key={selection.sectionKey} className="cp-view-card-chip">
                      <div
                        className="cp-view-chip-dot"
                        style={{ background: getCourseColor(selection.course.courseCode) }}
                      />
                      <span className="cp-view-chip-code">{selection.course.courseCode}</span>
                    </div>
                  ))}
                </div>

                <span className="cp-view-card-dbl-hint">double-click to open editor</span>
              </div>
            );
          })}
        </div>

        {/* Right: preview panel */}
        <section className="cp-view-preview-panel">
          {!previewSchedule ? (
            <div className="cp-view-empty-state">
              <div className="cp-view-empty-icon">
                <Calendar size={32} />
              </div>
              <div className="cp-view-empty-title">Select a schedule to preview</div>
              <div className="cp-view-empty-sub">
                Click any schedule on the left to see its full week calendar here. Double-click to open the editor.
              </div>
              <div className="cp-view-empty-hint">
                <Info size={12} />
                Your main schedule drives your Degree Audit
              </div>
            </div>
          ) : (
            <>
              <div className="cp-view-preview-head">
                <div className="cp-view-preview-title">
                  <h3>{previewSchedule.name}</h3>
                  <span className="cp-view-term-pill">{formatTermLabel(previewSchedule.term_code, previewSchedule.term_year)}</span>
                  {previewSchedule.is_primary && <span className="cp-view-main-pill"><Star size={11} /> MAIN</span>}
                </div>
                <div className="cp-view-preview-actions">
                  {!previewSchedule.is_primary && (
                    <button
                      type="button"
                      className="cp-view-preview-ghost-btn"
                      onClick={() => void handleSetMain(previewSchedule)}
                    >
                      Set as Main
                    </button>
                  )}
                  <button
                    type="button"
                    className="cp-view-preview-edit-btn"
                    onClick={() => openInBuilder(previewSchedule)}
                  >
                    <Edit2 size={12} /> Edit Schedule
                  </button>
                </div>
              </div>

              {/* Credits bar */}
              {previewSelections.length > 0 && (
                <div className="cp-view-credits-bar">
                  <span className="cp-view-cr-label"><strong>{previewCredits}</strong> / 18 credits</span>
                  <div className="cp-view-cr-track">
                    <div className="cp-view-cr-fill" style={{ width: `${Math.min(100, (previewCredits / 18) * 100)}%` }} />
                  </div>
                  <div className="cp-view-cr-chips">
                    {previewSelections.map((sel) => {
                      const color = getCourseColor(sel.course.courseCode);
                      return (
                        <span
                          key={sel.sectionKey}
                          className="cp-view-cr-chip"
                          style={{
                            background: `${color}18`,
                            color,
                            borderColor: `${color}40`,
                          }}
                        >
                          {sel.course.courseCode}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="cp-view-preview-body">
                {previewSelections.length === 0 ? (
                  <div className="cp-view-empty-state cp-view-empty-state--compact">
                    <Calendar size={36} />
                    <p>This schedule has no courses.</p>
                  </div>
                ) : (
                  <ScheduleSnapshot selections={previewSelections} />
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
