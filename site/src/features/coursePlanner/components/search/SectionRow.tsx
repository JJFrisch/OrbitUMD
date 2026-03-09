import { useMemo } from "react";
import type { Course, Section } from "../../types/coursePlanner";
import { getInstructorMeta } from "../../services/courseSearchService";
import { ProfessorLink } from "../common/ProfessorLink";
import {
  buildUmdMapLink,
  formatClassDayTime,
  formatLocation,
  isMappableBuildingCode,
} from "../../utils/courseDetails";
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
  const instructorLookup = useCoursePlannerStore((state) => state.instructorLookup);
  const readOnly = useCoursePlannerStore((state) => state.readOnly);

  const key = useMemo(() => getSectionIdentityKey(course.courseCode, section.sectionCode), [course.courseCode, section.sectionCode]);
  const isSelected = Boolean(selections[key]);
  const isOpen = section.openSeats > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      className={`cp-section-row ${isSelected ? "is-selected" : ""} ${!isOpen ? "is-closed" : ""}`}
      onClick={() => {
        if (!readOnly) {
          toggleSection(course, section);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!readOnly) {
            toggleSection(course, section);
          }
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
        {(section.instructors.length > 0 ? section.instructors : [section.instructor || "Staff"]).map((name) => {
          const meta = getInstructorMeta(instructorLookup, name);

          return (
            <ProfessorLink
              key={`${section.sectionCode}-${name}`}
              name={name}
              slug={meta?.slug}
              rating={meta?.averageRating}
              className="cp-prof-link"
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
            />
          );
        })}

        {section.meetings.map((meeting, index) => {
          const locationText = formatLocation(meeting);
          const line = `${formatClassDayTime(meeting)} in`;
          const canMap = isMappableBuildingCode(meeting.building);

          return (
            <span key={`${section.sectionCode}-meeting-${index}`}>
              {line}{" "}
              {canMap ? (
                <a
                  href={buildUmdMapLink(meeting.building ?? "")}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  {locationText}
                </a>
              ) : (
                locationText
              )}
            </span>
          );
        })}

        <span>{section.openSeats}/{section.totalSeats} seats available</span>
        {section.openSeats === 0 && section.waitlist !== undefined && <span>Waitlist: {section.waitlist}</span>}
        {section.holdfile !== undefined && <span>Holdfile: {section.holdfile}</span>}
      </div>
      <div>
        <span>{section.meetings[0]?.days || "Other"}</span>
      </div>
    </div>
  );
}
