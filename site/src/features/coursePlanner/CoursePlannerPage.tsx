import { useEffect } from "react";
import { Calendar, Eye, EyeOff, Printer } from "lucide-react";
import { CourseSearchPanel } from "./components/search/CourseSearchPanel";
import { CalendarView } from "./components/schedule/CalendarView";
import { CourseInfoPanel } from "./components/schedule/CourseInfoPanel";
import { useCoursePlannerStore } from "./state/coursePlannerStore";
import "./styles/coursePlanner.css";

export function CoursePlannerPage() {
  const visibilityMode = useCoursePlannerStore((state) => state.visibilityMode);
  const setVisibilityMode = useCoursePlannerStore((state) => state.setVisibilityMode);
  const setPrintMode = useCoursePlannerStore((state) => state.setPrintMode);

  useEffect(() => {
    void useCoursePlannerStore.getState().executeSearch();
  }, []);

  return (
    <div className="course-planner-root">
      <div className="course-planner-topbar">
        <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <Calendar size={16} color="#E21833" />
          <strong>Course Planner</strong>
        </div>

        <div style={{ display: "inline-flex", gap: 8 }}>
          <button
            className="cp-toolbar-btn"
            type="button"
            onClick={() => setVisibilityMode(visibilityMode === "full" ? "busy_free" : "full")}
          >
            {visibilityMode === "full" ? <EyeOff size={14} /> : <Eye size={14} />}
            {visibilityMode === "full" ? "Busy/Free" : "Full"}
          </button>
          <button
            className="cp-toolbar-btn"
            type="button"
            onClick={() => {
              setPrintMode(true);
              requestAnimationFrame(() => {
                window.print();
                setTimeout(() => setPrintMode(false), 200);
              });
            }}
          >
            <Printer size={14} /> Export / Print
          </button>
        </div>
      </div>

      <div className="course-planner-layout">
        <CourseSearchPanel />
        <CalendarView />
        <CourseInfoPanel />
      </div>
    </div>
  );
}
