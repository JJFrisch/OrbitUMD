import { formatHourLabel } from "../../utils/scheduleFormatting";

interface TimelineProps {
  startHour: number;
  endHour: number;
}

export function Timeline({ startHour, endHour }: TimelineProps) {
  const hours = [];
  for (let h = startHour; h <= endHour; h += 1) {
    hours.push(h);
  }

  return (
    <div className="cp-timeline">
      {hours.map((hour) => (
        <div key={hour} className="cp-time-label">
          {formatHourLabel(hour)}
        </div>
      ))}
    </div>
  );
}
