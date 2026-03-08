import { useMemo } from "react";
import type { Course, Section } from "../../types/coursePlanner";
import { getSectionIdentityKey } from "../../utils/formatting";
import { useCoursePlannerStore } from "../../state/coursePlannerStore";

interface SectionRowProps {
  course: Course;
  section: Section;
}

export function SectionRow({ course, section }: SectionRowProps) {
  const selections = useCoursePlannerStore((state) => state.selections);
  const toggleSection = useCoursePlannerStore((state) => state.toggleSection);
  const setHoveredSection = useCoursePlannerStore((state) => state.setHoveredSection);
  const readOnly = useCoursePlannerStore((state) => state.readOnly);

  const key = useMemo(() => getSectionIdentityKey(course.courseCode, section.sectionCode), [course.courseCode, section.sectionCode]);
  const isSelected = Boolean(selections[key]);
  const isOpen = section.openSeats > 0;

  return (
    <button
      type="button"
      className={`cp-section-row ${isSelected ? "is-selected" : ""} ${!isOpen ? "is-closed" : ""}`}
      onClick={() => {
        if (!readOnly) {
          toggleSection(course, section);
        }
      }}
      onMouseEnter={() => setHoveredSection(course, section)}
      onMouseLeave={() => setHoveredSection(course, null)}
      onFocus={() => setHoveredSection(course, section)}
      onBlur={() => setHoveredSection(course, null)}
      aria-label={`section ${section.sectionCode}`}
    >
      <div>
        <strong>{section.sectionCode}</strong>
        <span>{section.instructor || "Staff"}</span>
      </div>
      <div>
        <span>{section.openSeats}/{section.totalSeats} seats</span>
        <span>{section.meetings[0]?.days || "Other"}</span>
      </div>
    </button>
  );
}
