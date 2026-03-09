import { useMemo } from "react";
import { useCoursePlannerStore } from "../../state/coursePlannerStore";
import { assignConflictIndexes, buildCalendarMeetings, computeVisibleHourBounds } from "../../utils/scheduleLayout";
import { Timeline } from "./Timeline";
import { ScheduleGrid } from "./ScheduleGrid";

export function CalendarView() {
  const selections = useCoursePlannerStore((state) => state.selections);
  const hoveredSelection = useCoursePlannerStore((state) => state.hoveredSelection);
  const printMode = useCoursePlannerStore((state) => state.printMode);
  const readOnly = useCoursePlannerStore((state) => state.readOnly);
  const visibilityMode = useCoursePlannerStore((state) => state.visibilityMode);
  const toggleInfoPanel = useCoursePlannerStore((state) => state.toggleInfoPanel);
  const removeSelection = useCoursePlannerStore((state) => state.removeSelection);

  const meetings = useMemo(() => {
    const selectedMeetings = Object.values(selections).flatMap((selection) =>
      buildCalendarMeetings({
        sectionKey: selection.sectionKey,
        courseCode: selection.course.courseCode,
        sectionCode: selection.section.sectionCode,
        title: selection.course.name,
        instructor: selection.section.instructor,
        meetings: selection.section.meetings,
      })
    );

    const laidOutSelectedMeetings = assignConflictIndexes(selectedMeetings);

    if (!hoveredSelection || selections[hoveredSelection.sectionKey]) {
      return laidOutSelectedMeetings;
    }

    const hoverPreviewMeetings = buildCalendarMeetings({
      sectionKey: hoveredSelection.sectionKey,
      courseCode: hoveredSelection.course.courseCode,
      sectionCode: hoveredSelection.section.sectionCode,
      title: hoveredSelection.course.name,
      instructor: hoveredSelection.section.instructor,
      meetings: hoveredSelection.section.meetings,
      isHoverPreview: true,
    }).map((meeting) => ({
      ...meeting,
      conflictIndex: 0,
      conflictTotal: 1,
    }));

    return [...laidOutSelectedMeetings, ...hoverPreviewMeetings];
  }, [hoveredSelection, selections]);

  const bounds = useMemo(
    () => computeVisibleHourBounds(meetings.filter((meeting) => meeting.day !== "Other"), { printMode }),
    [meetings, printMode]
  );

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
