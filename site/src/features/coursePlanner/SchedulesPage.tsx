import { useSearchParams } from "react-router";
import { Grid2X2, Pencil, Plus, Sparkles } from "lucide-react";
import { ScheduleLibraryPage } from "./ScheduleLibraryPage";
import { CoursePlannerPage } from "./CoursePlannerPage";
import { AutoGenerateSchedulePage } from "./AutoGenerateSchedulePage";
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

export function SchedulesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = isTab(searchParams.get("tab")) ? (searchParams.get("tab") as Tab) : "view";

  const switchTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    // Clear tab-specific params when switching
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
          <button
            type="button"
            className="cp-builder-action-btn"
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
        {tab === "view" && <ScheduleLibraryPage hideHeader />}
        {tab === "edit" && <CoursePlannerPage hideHeader />}
        {tab === "generate" && <AutoGenerateSchedulePage hideHeader />}
      </div>
    </div>
  );
}
