import { useEffect, useMemo, useState } from "react";
import { CourseSearchPanel } from "./components/search/CourseSearchPanel";
import { CalendarView } from "./components/schedule/CalendarView";
import { ScheduleDetailsOverlay } from "./components/schedule/ScheduleDetailsOverlay";
import { ScheduleBuilderHeader } from "./components/ScheduleBuilderHeader";
import { useCoursePlannerStore } from "./state/coursePlannerStore";
import "./styles/coursePlanner.css";

export function CoursePlannerPage() {
  const [scheduleName, setScheduleName] = useState("Default schedule");
  const visibilityMode = useCoursePlannerStore((state) => state.visibilityMode);
  const selectedInfoKey = useCoursePlannerStore((state) => state.selectedInfoKey);
  const selections = useCoursePlannerStore((state) => state.selections);
  const resolvedTerm = useCoursePlannerStore((state) => state.resolvedTerm);
  const resolvedYear = useCoursePlannerStore((state) => state.resolvedYear);
  const setVisibilityMode = useCoursePlannerStore((state) => state.setVisibilityMode);
  const setPrintMode = useCoursePlannerStore((state) => state.setPrintMode);
  const toggleInfoPanel = useCoursePlannerStore((state) => state.toggleInfoPanel);

  const termLabel = useMemo(() => {
    const termMap: Record<string, string> = {
      "01": "Spring",
      "05": "Summer",
      "08": "Fall",
      "12": "Winter",
    };
    return `${termMap[resolvedTerm] ?? "Term"} ${resolvedYear}`;
  }, [resolvedTerm, resolvedYear]);

  const stats = useMemo(() => {
    const activeSelections = Object.values(selections);
    const courseCount = activeSelections.length;
    const credits = activeSelections.reduce((sum, selection) => sum + (selection.course.maxCredits || 0), 0);
    return { courseCount, credits };
  }, [selections]);

  useEffect(() => {
    void useCoursePlannerStore.getState().executeSearch();
  }, []);

  return (
    <div className="course-planner-root">
      <ScheduleBuilderHeader
        scheduleName={scheduleName}
        onScheduleNameChange={setScheduleName}
        courseCount={stats.courseCount}
        credits={stats.credits}
        termLabel={termLabel}
        visibilityMode={visibilityMode}
        onToggleVisibility={() => setVisibilityMode(visibilityMode === "full" ? "busy_free" : "full")}
        onExportPrint={() => {
          setPrintMode(true);
          requestAnimationFrame(() => {
            window.print();
            setTimeout(() => setPrintMode(false), 200);
          });
        }}
      />

      <div className="course-planner-layout">
        <CourseSearchPanel />
        <CalendarView />
      </div>

      <ScheduleDetailsOverlay
        selectedSectionKey={selectedInfoKey}
        onClose={() => {
          if (selectedInfoKey) {
            toggleInfoPanel(selectedInfoKey);
          }
        }}
      />
    </div>
  );
}
