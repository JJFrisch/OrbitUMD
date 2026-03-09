import { useMemo } from "react";
import { useCoursePlannerStore } from "../../state/coursePlannerStore";
import { getInstructorMeta } from "../../services/courseSearchService";
import { ProfessorLink } from "../common/ProfessorLink";
import {
  buildTestudoCourseLink,
  buildUmdMapLink,
  formatClassDayTime,
  formatCredits,
  formatLocation,
  isMappableBuildingCode,
  sanitizeNullableText,
} from "../../utils/courseDetails";

export function CourseInfoPanel() {
  const selectedInfoKey = useCoursePlannerStore((state) => state.selectedInfoKey);
  const selections = useCoursePlannerStore((state) => state.selections);
  const instructorLookup = useCoursePlannerStore((state) => state.instructorLookup);
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
      <h4>
        {selection.course.courseCode} - {selection.course.name}{" "}
        <a
          href={buildTestudoCourseLink(selection.course.courseCode, `${selection.course.year}${selection.course.term}`)}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          (view on Testudo)
        </a>
      </h4>
      <p>{formatCredits(selection.course.minCredits, selection.course.maxCredits)} | Section {selection.section.sectionCode}</p>

      <div className="cp-info-lines">
        {(selection.section.instructors.length > 0 ? selection.section.instructors : [selection.section.instructor || "Staff"]).map((name) => {
          const meta = getInstructorMeta(instructorLookup, name);

          return (
            <ProfessorLink
              key={`${selection.section.sectionCode}-${name}`}
              name={name}
              rating={!meta?.ambiguous ? meta?.averageRating : undefined}
              className="cp-prof-link"
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
            />
          );
        })}
      </div>

      <ul className="cp-info-lines">
        {selection.section.meetings.map((meeting, idx) => (
          <li key={`${selection.section.sectionCode}-${idx}`}>
            {formatClassDayTime(meeting)} in {" "}
            {isMappableBuildingCode(meeting.building) ? (
              <a
                href={buildUmdMapLink(meeting.building ?? "")}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
              >
                {formatLocation(meeting)}
              </a>
            ) : (
              formatLocation(meeting)
            )}
          </li>
        ))}
      </ul>

      <p>{selection.section.openSeats} / {selection.section.totalSeats} seats available</p>
      {selection.section.openSeats === 0 && selection.section.waitlist !== undefined && <p>Waitlist: {selection.section.waitlist}</p>}
      {selection.section.holdfile !== undefined && <p>Holdfile: {selection.section.holdfile}</p>}

      {sanitizeNullableText(selection.course.conditions?.prereqs) && <p>prereqs: {selection.course.conditions?.prereqs}</p>}
      {sanitizeNullableText(selection.course.conditions?.restrictions) && <p>restrictions: {selection.course.conditions?.restrictions}</p>}
      {sanitizeNullableText(selection.course.conditions?.additionalInfo) && <p>additional_info: {selection.course.conditions?.additionalInfo}</p>}
      {sanitizeNullableText(selection.course.conditions?.creditGrantedFor) && <p>credit_granted_for: {selection.course.conditions?.creditGrantedFor}</p>}

      {selection.course.conditions?.rawConditions
        ?.map((condition) => sanitizeNullableText(condition))
        .filter(Boolean)
        .map((condition) => (
          <p key={condition}>{condition}</p>
        ))}

      {sanitizeNullableText(selection.course.description) && <p>{selection.course.description}</p>}
    </aside>
  );
}
