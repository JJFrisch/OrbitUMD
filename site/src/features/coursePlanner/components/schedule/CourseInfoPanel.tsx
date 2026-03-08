import { useMemo } from "react";
import { useCoursePlannerStore } from "../../state/coursePlannerStore";

export function CourseInfoPanel() {
  const selectedInfoKey = useCoursePlannerStore((state) => state.selectedInfoKey);
  const selections = useCoursePlannerStore((state) => state.selections);
  const visibilityMode = useCoursePlannerStore((state) => state.visibilityMode);

  const selection = useMemo(() => {
    if (!selectedInfoKey) return null;
    return selections[selectedInfoKey] ?? null;
  }, [selectedInfoKey, selections]);

  if (!selection || visibilityMode === "off") {
    return null;
  }

  return (
    <aside className="cp-info-panel" data-testid="course-info-panel">
      <h4>{selection.course.courseCode} · {selection.section.sectionCode}</h4>
      <p>{selection.course.name}</p>
      <p><strong>Instructor:</strong> {selection.section.instructor || "Staff"}</p>
      <ul>
        {selection.section.meetings.map((meeting, idx) => (
          <li key={`${selection.section.sectionCode}-${idx}`}>
            {meeting.days} {meeting.startTime && meeting.endTime
              ? `${meeting.startTime} - ${meeting.endTime}`
              : "No time"}
            {meeting.location ? ` · ${meeting.location}` : ""}
          </li>
        ))}
      </ul>
    </aside>
  );
}
