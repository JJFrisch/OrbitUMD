import { X } from "lucide-react";
import type { CalendarMeeting } from "../../types/coursePlanner";
import { getBlockGeometry } from "../../utils/scheduleLayout";
import { formatHourDecimal } from "../../utils/scheduleFormatting";

interface ClassBlockProps {
  meeting: CalendarMeeting;
  color: string;
  textColor: string;
  bounds: { startHour: number; endHour: number };
  readOnly: boolean;
  showDetails: boolean;
  onOpenInfo: (sectionKey: string) => void;
  onRemove: (sectionKey: string) => void;
}

export function ClassBlock({ meeting, color, textColor, bounds, readOnly, showDetails, onOpenInfo, onRemove }: ClassBlockProps) {
  const geometry = getBlockGeometry(meeting, bounds);

  return (
    <div
      className={`cp-class-block ${meeting.isHoverPreview ? "is-preview" : ""}`}
      style={{
        top: `${geometry.topPct}%`,
        height: `${geometry.heightPct}%`,
        left: `${geometry.leftPct}%`,
        width: `${geometry.widthPct}%`,
        background: color,
        color: textColor,
      }}
      onClick={() => onOpenInfo(meeting.sectionKey)}
      role="button"
      tabIndex={0}
      data-testid={`class-block-${meeting.sectionKey}`}
    >
      {!readOnly && !meeting.isHoverPreview && (
        <button
          type="button"
          className="cp-class-remove"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(meeting.sectionKey);
          }}
          aria-label="remove class"
        >
          <X size={12} />
        </button>
      )}

      {showDetails ? (
        <>
          <strong>{meeting.courseCode}</strong>
          <span>{formatHourDecimal(meeting.startHour)} - {formatHourDecimal(meeting.endHour)}</span>
          <span>Section {meeting.sectionCode}</span>
        </>
      ) : (
        <strong>Busy</strong>
      )}
    </div>
  );
}
