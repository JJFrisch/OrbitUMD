import { useMemo } from "react";
import { useCoursePlannerStore } from "../../state/coursePlannerStore";
import { Timeline } from "./Timeline";
import { ScheduleGrid } from "./ScheduleGrid";

export function CalendarView() {
  const meetings = useCoursePlannerStore((state) => state.calendarMeetings());
  const bounds = useCoursePlannerStore((state) => state.calendarBounds());
  const readOnly = useCoursePlannerStore((state) => state.readOnly);
  const visibilityMode = useCoursePlannerStore((state) => state.visibilityMode);
  const toggleInfoPanel = useCoursePlannerStore((state) => state.toggleInfoPanel);
  const removeSelection = useCoursePlannerStore((state) => state.removeSelection);

  const showDetails = useMemo(() => visibilityMode === "full", [visibilityMode]);

  return (
    <section className="cp-calendar" data-testid="calendar-view">
      <Timeline startHour={bounds.startHour} endHour={bounds.endHour} />
      <ScheduleGrid
        meetings={meetings}
        bounds={bounds}
        readOnly={readOnly}
        showDetails={showDetails}
        onOpenInfo={toggleInfoPanel}
        onRemove={removeSelection}
      />
    </section>
  );
}
