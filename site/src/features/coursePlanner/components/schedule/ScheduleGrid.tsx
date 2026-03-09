import { useMemo } from "react";
import type { CalendarMeeting, Weekday } from "../../types/coursePlanner";
import { buildSectionColorMap } from "../../utils/colorPalette";
import { DayColumn } from "./DayColumn";

const DAYS: Array<{ key: Weekday; label: string }> = [
  { key: "M", label: "Mon" },
  { key: "Tu", label: "Tue" },
  { key: "W", label: "Wed" },
  { key: "Th", label: "Thu" },
  { key: "F", label: "Fri" },
  { key: "Other", label: "Other" },
];

interface ScheduleGridProps {
  meetings: CalendarMeeting[];
  bounds: { startHour: number; endHour: number };
  readOnly: boolean;
  showDetails: boolean;
  onOpenInfo: (sectionKey: string) => void;
  onRemove: (sectionKey: string) => void;
}

export function ScheduleGrid({ meetings, bounds, readOnly, showDetails, onOpenInfo, onRemove }: ScheduleGridProps) {
  const colorBySection = useMemo(() => buildSectionColorMap(meetings), [meetings]);

  return (
    <div className="cp-grid">
      {DAYS.map((day) => (
        <DayColumn
          key={day.key}
          day={day.key}
          label={day.label}
          meetings={meetings}
          bounds={bounds}
          readOnly={readOnly}
          showDetails={showDetails}
          colorBySection={colorBySection}
          onOpenInfo={onOpenInfo}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
