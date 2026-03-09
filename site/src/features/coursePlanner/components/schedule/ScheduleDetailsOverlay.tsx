import { useMemo } from "react";
import type { ScheduleSelection } from "../../types/coursePlanner";
import { getInstructorMeta } from "../../services/courseSearchService";
import { useCoursePlannerStore } from "../../state/coursePlannerStore";
import { ProfessorLink } from "../common/ProfessorLink";
import { BottomSheet } from "../common/BottomSheet";
import {
  buildTestudoCourseLink,
  buildUmdMapLink,
  formatClassDayTime,
  formatCredits,
  formatLocation,
  isMappableBuildingCode,
  sanitizeNullableText,
} from "../../utils/courseDetails";

interface ScheduleDetailsOverlayProps {
  selectedSectionKey: string | null;
  onClose: () => void;
}

export function ScheduleDetailsOverlay({ selectedSectionKey, onClose }: ScheduleDetailsOverlayProps) {
  const selections = useCoursePlannerStore((state) => state.selections);
  const instructorLookup = useCoursePlannerStore((state) => state.instructorLookup);

  const selection: ScheduleSelection | null = useMemo(() => {
    if (!selectedSectionKey) return null;
    return selections[selectedSectionKey] ?? null;
  }, [selectedSectionKey, selections]);

  if (!selection) return null;

  return (
    <BottomSheet
      open={Boolean(selection)}
      onClose={onClose}
      title={`${selection.course.courseCode} ${selection.section.sectionCode}`}
    >
      <div className="cp-overlay-grid">
        <p>
          {selection.course.courseCode} - {selection.course.name}{" "}
          <a
            href={buildTestudoCourseLink(selection.course.courseCode, `${selection.course.year}${selection.course.term}`)}
            target="_blank"
            rel="noreferrer"
          >
            (view on Testudo)
          </a>
        </p>
        <p>{formatCredits(selection.course.minCredits, selection.course.maxCredits)} | Section {selection.section.sectionCode}</p>

        {(selection.section.instructors.length > 0 ? selection.section.instructors : [selection.section.instructor || "Staff"]).map((name) => {
          const meta = getInstructorMeta(instructorLookup, name);
          return (
            <ProfessorLink
              key={`${selection.section.sectionCode}-${name}`}
              name={name}
              slug={meta?.slug}
              rating={meta?.averageRating}
              className="cp-prof-link"
            />
          );
        })}

        {selection.section.meetings.map((meeting, idx) => (
          <p key={`${selection.section.sectionCode}-meeting-${idx}`}>
            {formatClassDayTime(meeting)} in {" "}
            {isMappableBuildingCode(meeting.building) ? (
              <a href={buildUmdMapLink(meeting.building ?? "")} target="_blank" rel="noreferrer">
                {formatLocation(meeting)}
              </a>
            ) : (
              formatLocation(meeting)
            )}
          </p>
        ))}

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
      </div>
    </BottomSheet>
  );
}
