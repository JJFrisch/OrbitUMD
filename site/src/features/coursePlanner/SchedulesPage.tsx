import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Grid2X2, Pencil, Plus, Sparkles, X } from "lucide-react";
import { plannerApi } from "@/lib/api/planner";
import { compareAcademicTerms } from "@/lib/scheduling/termProgress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { ScheduleLibraryPage } from "./ScheduleLibraryPage";
import { CoursePlannerPage } from "./CoursePlannerPage";
import { AutoGenerateSchedulePage } from "./AutoGenerateSchedulePage";
import type { ScheduleWithSelections } from "@/lib/repositories/userSchedulesRepository";
import "./styles/coursePlanner.css";

type Tab = "view" | "edit" | "generate";

const LAST_TERM_FILTER_KEY = "orbitumd:schedules:last-term-filter";
const SELECTED_SCHEDULES_BY_TERM_KEY = "orbitumd:schedules:selected-by-term";

const TABS: { key: Tab; label: string; icon: typeof Grid2X2 }[] = [
  { key: "view", label: "View Schedules", icon: Grid2X2 },
  { key: "edit", label: "Edit Schedule", icon: Pencil },
  { key: "generate", label: "Generate", icon: Sparkles },
];

function isTab(value: string | null): value is Tab {
  return value === "view" || value === "edit" || value === "generate";
}

function formatTermLabel(termCode: string | null, termYear: number | null): string {
  const termMap: Record<string, string> = { "01": "Spring", "05": "Summer", "08": "Fall", "12": "Winter" };
  const code = termCode ?? "";
  const year = termYear ?? 0;
  if (!termMap[code] || !year) return "Unknown";
  return `${termMap[code]} ${year}`;
}

function formatShortTermLabel(termCode: string, termYear: number): string {
  const map: Record<string, string> = { "01": "Sp", "05": "Su", "08": "Fa", "12": "Wi" };
  return `${map[termCode] ?? "?"} '${String(termYear).slice(-2)}`;
}

function getCurrentAcademicTerm(now: Date = new Date()): { termCode: string; termYear: number } {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month === 1) return { termCode: "12", termYear: year };
  if (month >= 2 && month <= 5) return { termCode: "01", termYear: year };
  if (month >= 6 && month <= 8) return { termCode: "05", termYear: year };
  return { termCode: "08", termYear: year };
}

function readSelectedSchedulesByTerm(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SELECTED_SCHEDULES_BY_TERM_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function generateNextDraftName(existingSchedules: ScheduleWithSelections[]): string {
  let draftCount = 0;
  for (const schedule of existingSchedules) {
    if (schedule.name.match(/^Draft\s+[A-Z]$/)) {
      draftCount++;
    }
  }
  const nextLetter = String.fromCharCode("A".charCodeAt(0) + draftCount);
  return `Draft ${nextLetter}`;
}

export function SchedulesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = isTab(searchParams.get("tab")) ? (searchParams.get("tab") as Tab) : "view";
  const termFilter = searchParams.get("termFilter") ?? "";
  const requestedScheduleId = searchParams.get("scheduleId");

  const [schedules, setSchedules] = useState<ScheduleWithSelections[]>([]);
  const [selectedSchedulesByTerm, setSelectedSchedulesByTerm] = useState<Record<string, string>>(readSelectedSchedulesByTerm);
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  
  // New Schedule Dialog state
  const [showNewScheduleDialog, setShowNewScheduleDialog] = useState(false);
  const [newScheduleName, setNewScheduleName] = useState("");
  const [newScheduleNotes, setNewScheduleNotes] = useState("");
  const [newScheduleYear, setNewScheduleYear] = useState(new Date().getFullYear());
  const [newScheduleTerm, setNewScheduleTerm] = useState("01");

  useEffect(() => {
    plannerApi.listAllSchedulesWithSelections().then(setSchedules).catch(() => {});
  }, []);

  const termOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const s of schedules) {
      if (s.term_code && s.term_year) keys.add(`${s.term_code}-${s.term_year}`);
    }
    return Array.from(keys)
      .map((v) => {
        const [tc, ty] = v.split("-");
        return { value: v, termCode: tc!, termYear: Number(ty), label: formatShortTermLabel(tc!, Number(ty)), fullLabel: formatTermLabel(tc!, Number(ty)) };
      })
      .sort((a, b) => compareAcademicTerms({ termCode: a.termCode, termYear: a.termYear }, { termCode: b.termCode, termYear: b.termYear }));
  }, [schedules]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SELECTED_SCHEDULES_BY_TERM_KEY, JSON.stringify(selectedSchedulesByTerm));
  }, [selectedSchedulesByTerm]);

  useEffect(() => {
    if (termOptions.length === 0) return;

    const hasCurrent = termFilter.length > 0 && termOptions.some((option) => option.value === termFilter);
    if (hasCurrent) return;

    const fromStored = typeof window !== "undefined" ? window.localStorage.getItem(LAST_TERM_FILTER_KEY) : null;
    const current = getCurrentAcademicTerm();
    const currentValue = `${current.termCode}-${current.termYear}`;
    const fallback =
      (fromStored && termOptions.some((option) => option.value === fromStored) ? fromStored : null)
      ?? (termOptions.some((option) => option.value === currentValue) ? currentValue : null)
      ?? termOptions[termOptions.length - 1]?.value
      ?? "";

    if (!fallback) return;

    const params = new URLSearchParams(searchParams);
    params.set("termFilter", fallback);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams, termFilter, termOptions]);

  const schedulesForTerm = useMemo(() => {
    if (!termFilter) return [];
    return schedules.filter((schedule) => `${schedule.term_code}-${schedule.term_year}` === termFilter);
  }, [schedules, termFilter]);

  useEffect(() => {
    if (!termFilter) return;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_TERM_FILTER_KEY, termFilter);
    }

    const persistedId = selectedSchedulesByTerm[termFilter];
    if (persistedId && schedulesForTerm.some((schedule) => schedule.id === persistedId)) {
      setActiveScheduleId(persistedId);
      return;
    }

    const mainSchedule = schedulesForTerm.find((schedule) => schedule.is_primary);
    const fallbackSchedule = mainSchedule ?? schedulesForTerm[0] ?? null;
    const nextScheduleId = fallbackSchedule?.id ?? null;
    setActiveScheduleId(nextScheduleId);

    if (nextScheduleId) {
      setSelectedSchedulesByTerm((current) => ({ ...current, [termFilter]: nextScheduleId }));
    }
  }, [schedulesForTerm, selectedSchedulesByTerm, termFilter]);

  const activeSchedule = useMemo(() => {
    if (!activeScheduleId) return null;
    return schedules.find((schedule) => schedule.id === activeScheduleId) ?? null;
  }, [activeScheduleId, schedules]);

  const editSchedule = useMemo(() => {
    if (requestedScheduleId) {
      const match = schedules.find((schedule) => schedule.id === requestedScheduleId);
      if (match) return match;
    }
    return activeSchedule;
  }, [requestedScheduleId, schedules, activeSchedule]);

  const editTermLabel = useMemo(() => {
    if (!editSchedule) return "Unknown";
    return formatTermLabel(editSchedule.term_code, editSchedule.term_year);
  }, [editSchedule]);

  const activeTermLabel = useMemo(() => {
    if (!termFilter) return "Unknown";
    return termOptions.find((o) => o.value === termFilter)?.fullLabel ?? "Unknown";
  }, [termFilter, termOptions]);

  const filteredCount = useMemo(() => {
    return schedulesForTerm.length;
  }, [schedulesForTerm]);

  const switchTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);

    // When switching to generate tab, preserve current term
    if (next === "generate") {
      if (termFilter) {
        params.set("termFilter", termFilter);
      }
    }

    // When switching to edit tab, set schedule and term from active selection
    if (next === "edit" && activeSchedule) {
      const term = `${activeSchedule.term_code}-${activeSchedule.term_year}`;
      params.set("scheduleId", activeSchedule.id);
      params.set("term", term);
      params.delete("new");
      params.delete("generated");
      params.delete("generatedIndex");
    } else if (next === "edit") {
      // If no active schedule, don't switch to edit without a selection
      return;
    }

    if (next !== "edit") {
      params.delete("scheduleId");
      params.delete("new");
      params.delete("generated");
      params.delete("generatedIndex");
    }
    if (next !== "edit" && next !== "generate") {
      params.delete("term");
    }
    setSearchParams(params, { replace: true });
  };

  const setTermFilter = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams);
      params.set("termFilter", value);
      params.set("tab", "view");
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handleSelectedScheduleChange = useCallback((scheduleId: string | null) => {
    setActiveScheduleId(scheduleId);
    if (!scheduleId || !termFilter) return;
    setSelectedSchedulesByTerm((current) => ({ ...current, [termFilter]: scheduleId }));
  }, [termFilter]);

  const handleCreateNewSchedule = useCallback(() => {
    const params = new URLSearchParams();
    params.set("tab", "edit");
    params.set("new", "1");
    params.set("scheduled_name", newScheduleName.trim() || generateNextDraftName(schedules));
    params.set("scheduled_year", String(newScheduleYear));
    params.set("scheduled_term", newScheduleTerm);
    if (newScheduleNotes.trim()) {
      params.set("scheduled_notes", newScheduleNotes.trim());
    }
    setShowNewScheduleDialog(false);
    setNewScheduleName("");
    setNewScheduleNotes("");
    setSearchParams(params, { replace: true });
  }, [newScheduleName, newScheduleNotes, newScheduleYear, newScheduleTerm, schedules, setSearchParams]);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear - 2; i <= currentYear + 4; i++) {
      years.push(i);
    }
    return years;
  }, []);

  return (
    <div className="course-planner-root cp-schedules-unified">
      <div className="cp-schedules-topbar">
        <div className="cp-seg-toggle">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`cp-seg-btn${tab === key ? " is-active" : ""}`}
              onClick={() => switchTab(key)}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {tab === "edit" && editSchedule && (
          <div className="cp-edit-meta">
            <span className="cp-edit-meta-name">{editSchedule.name}</span>
            <span className="cp-edit-meta-separator">•</span>
            <span className="cp-edit-meta-term">{editTermLabel}</span>
          </div>
        )}

        <div className="cp-schedules-topbar-right">
          {tab === "view" && (
            <>
              <span className="cp-topbar-meta">
                {activeTermLabel} · <strong>{filteredCount} schedule{filteredCount !== 1 ? "s" : ""}</strong>
              </span>
              {termOptions.length > 0 && (
                <label className="cp-term-select-wrap">
                  <span className="cp-term-select-label">Term</span>
                  <select
                    className="cp-term-select"
                    value={termFilter}
                    onChange={(event) => setTermFilter(event.target.value)}
                  >
                    {termOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.fullLabel}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          <button
            type="button"
            className="cp-topbar-new-btn"
            onClick={() => {
              setNewScheduleName(generateNextDraftName(schedules));
              setNewScheduleNotes("");
              setNewScheduleYear(new Date().getFullYear());
              setNewScheduleTerm("01");
              setShowNewScheduleDialog(true);
            }}
          >
            <Plus size={12} />
            New Schedule
          </button>
        </div>
      </div>

      <div className="cp-schedules-content">
        {tab === "view" && (
          <ScheduleLibraryPage
            hideHeader
            termFilter={termFilter}
            selectedScheduleId={activeScheduleId}
            onSelectedScheduleChange={handleSelectedScheduleChange}
          />
        )}
        {tab === "edit" && <CoursePlannerPage hideHeader />}
        {tab === "generate" && <AutoGenerateSchedulePage hideHeader defaultTerm={termFilter} />}
      </div>

      <Dialog open={showNewScheduleDialog} onOpenChange={setShowNewScheduleDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Schedule</DialogTitle>
            <DialogDescription>
              Set up a new schedule by providing a name, optional notes, and selecting the term.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label htmlFor="schedule-name" className="block text-sm font-medium mb-1">
                Schedule Name
              </label>
              <input
                id="schedule-name"
                type="text"
                className="w-full px-3 py-2 border border-border rounded-md bg-input-background text-foreground"
                placeholder="e.g., Draft A"
                value={newScheduleName}
                onChange={(e) => setNewScheduleName(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="schedule-notes" className="block text-sm font-medium mb-1">
                Notes <span className="text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="schedule-notes"
                className="w-full px-3 py-2 border border-border rounded-md bg-input-background text-foreground min-h-[80px]"
                placeholder="Add any notes about this schedule"
                value={newScheduleNotes}
                onChange={(e) => setNewScheduleNotes(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="schedule-year" className="block text-sm font-medium mb-1">
                  Year
                </label>
                <select
                  id="schedule-year"
                  className="w-full px-3 py-2 border border-border rounded-md bg-input-background text-foreground"
                  value={newScheduleYear}
                  onChange={(e) => setNewScheduleYear(Number(e.target.value))}
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="schedule-term" className="block text-sm font-medium mb-1">
                  Term
                </label>
                <select
                  id="schedule-term"
                  className="w-full px-3 py-2 border border-border rounded-md bg-input-background text-foreground"
                  value={newScheduleTerm}
                  onChange={(e) => setNewScheduleTerm(e.target.value)}
                >
                  <option value="01">Spring</option>
                  <option value="05">Summer</option>
                  <option value="08">Fall</option>
                  <option value="12">Winter</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                className="px-4 py-2 text-sm border border-border rounded-md hover:bg-secondary"
                onClick={() => setShowNewScheduleDialog(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                onClick={handleCreateNewSchedule}
              >
                Create Schedule
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
