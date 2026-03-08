import type { CalendarMeeting, Weekday } from "../../types/coursePlanner";
import { getPastelColor } from "../../utils/colorPalette";
import { ClassBlock } from "./ClassBlock";

interface DayColumnProps {
  day: Weekday;
  label: string;
  meetings: CalendarMeeting[];
  bounds: { startHour: number; endHour: number };
  readOnly: boolean;
  showDetails: boolean;
  onOpenInfo: (sectionKey: string) => void;
  onRemove: (sectionKey: string) => void;
}

export function DayColumn({ day, label, meetings, bounds, readOnly, showDetails, onOpenInfo, onRemove }: DayColumnProps) {
  const dayMeetings = meetings.filter((meeting) => meeting.day === day);

  return (
    <div className="cp-day-column" data-day={day}>
      <div className="cp-day-header">{label}</div>
      <div className="cp-day-track">
        {dayMeetings.map((meeting, idx) => (
          <ClassBlock
            key={meeting.id}
            meeting={meeting}
            color={getPastelColor(idx)}
            bounds={bounds}
            readOnly={readOnly}
            showDetails={showDetails}
            onOpenInfo={onOpenInfo}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
}
