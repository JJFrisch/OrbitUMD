import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Grid2X2, Pencil, Plus, Sparkles } from "lucide-react";
import { plannerApi } from "@/lib/api/planner";
import { compareAcademicTerms } from "@/lib/scheduling/termProgress";
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

export function SchedulesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = isTab(searchParams.get("tab")) ? (searchParams.get("tab") as Tab) : "view";
  const termFilter = searchParams.get("termFilter") ?? "";

  const [schedules, setSchedules] = useState<ScheduleWithSelections[]>([]);
  const [selectedSchedulesByTerm, setSelectedSchedulesByTerm] = useState<Record<string, string>>(readSelectedSchedulesByTerm);
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);

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

    if (next === "edit" && activeSchedule) {
      const term = `${activeSchedule.term_code}-${activeSchedule.term_year}`;
      params.set("scheduleId", activeSchedule.id);
      params.set("term", term);
      params.delete("new");
      params.delete("generated");
      params.delete("generatedIndex");
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
              const params = new URLSearchParams();
              params.set("tab", "edit");
              params.set("new", "1");
              setSearchParams(params, { replace: true });
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
        {tab === "generate" && <AutoGenerateSchedulePage hideHeader />}
      </div>
    </div>
  );
}
