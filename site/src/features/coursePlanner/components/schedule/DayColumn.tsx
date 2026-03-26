import type { CalendarMeeting, Weekday } from "../../types/coursePlanner";
import { getCourseColor, getReadableTextColor } from "../../utils/colorPalette";
import { isUnspecifiedSectionCode } from "../../utils/sectionLabels";
import { ClassBlock } from "./ClassBlock";

interface DayColumnProps {
  day: Weekday;
  label: string;
  meetings: CalendarMeeting[];
  bounds: { startHour: number; endHour: number };
  readOnly: boolean;
  showDetails: boolean;
  colorBySection: Record<string, string>;
  onOpenInfo: (sectionKey: string) => void;
  onRemove: (sectionKey: string) => void;
}

const CALENDAR_HOUR_HEIGHT_PX = 112;

export function DayColumn({
  day,
  label,
  meetings,
  bounds,
  readOnly,
  showDetails,
  colorBySection,
  onOpenInfo,
  onRemove,
}: DayColumnProps) {
  const dayMeetings = meetings.filter((meeting) => meeting.day === day);
  const isOtherDay = day === "Other";
  const orderedMeetings = isOtherDay
    ? [...dayMeetings].sort((left, right) => {
      const leftUnspecified = isUnspecifiedSectionCode(left.sectionCode);
      const rightUnspecified = isUnspecifiedSectionCode(right.sectionCode);
      if (leftUnspecified === rightUnspecified) return 0;
      return leftUnspecified ? 1 : -1;
    })
    : dayMeetings;
  const hourRows = Math.max(1, bounds.endHour - bounds.startHour);
  const trackHeight = `${hourRows * CALENDAR_HOUR_HEIGHT_PX}px`;

  return (
    <div className="cp-day-column" data-day={day}>
      <div className="cp-day-header">{label}</div>
      <div
        className={`cp-day-track ${isOtherDay ? "cp-day-track-other" : ""}`}
        style={isOtherDay ? { minHeight: trackHeight } : { height: trackHeight }}
      >
        {orderedMeetings.map((meeting) => {
          const color = colorBySection[meeting.sectionKey] ?? getCourseColor(meeting.courseCode);
          const textColor = getReadableTextColor(color);

          return (
            <ClassBlock
              key={meeting.id}
              meeting={meeting}
              color={color}
              textColor={textColor}
              bounds={bounds}
              readOnly={readOnly}
              showDetails={showDetails}
              onOpenInfo={onOpenInfo}
              onRemove={onRemove}
              isOtherDay={isOtherDay}
            />
          );
        })}
      </div>
    </div>
  );
}
