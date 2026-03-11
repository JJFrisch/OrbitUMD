import { useMemo, useRef } from "react";
import type { CalendarMeeting, Weekday } from "../../types/coursePlanner";
import { COURSE_PALETTE, getCourseColor } from "../../utils/colorPalette";
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
  const colorMapRef = useRef<Record<string, string>>({});

  const colorBySection = useMemo(() => {
    const next = { ...colorMapRef.current };
    const persistentSectionKeys = Array.from(new Set(
      meetings
        .filter((meeting) => !meeting.isHoverPreview)
        .map((meeting) => meeting.sectionKey)
    ));

    const used = new Set(Object.values(next));
    let paletteCursor = 0;

    for (const sectionKey of persistentSectionKeys) {
      if (next[sectionKey]) continue;

      let assigned: string | undefined;
      for (let i = 0; i < COURSE_PALETTE.length; i += 1) {
        const candidate = COURSE_PALETTE[(paletteCursor + i) % COURSE_PALETTE.length];
        if (!used.has(candidate)) {
          assigned = candidate;
          paletteCursor = (paletteCursor + i + 1) % COURSE_PALETTE.length;
          break;
        }
      }

      if (!assigned) {
        assigned = getCourseColor(sectionKey);
      }

      next[sectionKey] = assigned;
      used.add(assigned);
    }

    colorMapRef.current = next;

    const withPreview = { ...next };
    for (const meeting of meetings) {
      if (!withPreview[meeting.sectionKey]) {
        withPreview[meeting.sectionKey] = getCourseColor(meeting.courseCode);
      }
    }

    return withPreview;
  }, [meetings]);

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
