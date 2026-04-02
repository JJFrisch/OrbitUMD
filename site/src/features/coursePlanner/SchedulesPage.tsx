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

export function SchedulesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = isTab(searchParams.get("tab")) ? (searchParams.get("tab") as Tab) : "view";
  const termFilterParam = searchParams.get("term") ?? "all";

  const [schedules, setSchedules] = useState<ScheduleWithSelections[]>([]);

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

  const activeTermLabel = useMemo(() => {
    if (termFilterParam === "all") return null;
    return termOptions.find((o) => o.value === termFilterParam)?.fullLabel ?? null;
  }, [termFilterParam, termOptions]);

  const filteredCount = useMemo(() => {
    if (termFilterParam === "all") return schedules.length;
    return schedules.filter((s) => `${s.term_code}-${s.term_year}` === termFilterParam).length;
  }, [schedules, termFilterParam]);

  const switchTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
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
      if (value === "all") {
        params.delete("termFilter");
      } else {
        params.set("termFilter", value);
      }
      params.set("tab", "view");
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const termFilter = searchParams.get("termFilter") ?? "all";

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
                {activeTermLabel ?? "All Terms"} · <strong>{filteredCount} schedule{filteredCount !== 1 ? "s" : ""}</strong>
              </span>
              {termOptions.length > 0 && (
                <div className="cp-term-pills">
                  <button
                    type="button"
                    className={`cp-term-pill-btn${termFilter === "all" ? " is-active" : ""}`}
                    onClick={() => setTermFilter("all")}
                  >
                    All
                  </button>
                  {termOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`cp-term-pill-btn${termFilter === opt.value ? " is-active" : ""}`}
                      onClick={() => setTermFilter(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
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
        {tab === "view" && <ScheduleLibraryPage hideHeader termFilter={termFilter} />}
        {tab === "edit" && <CoursePlannerPage hideHeader />}
        {tab === "generate" && <AutoGenerateSchedulePage hideHeader />}
      </div>
    </div>
  );
}
