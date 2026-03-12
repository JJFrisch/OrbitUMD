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
  isOtherDay?: boolean;
}

export function ClassBlock({ meeting, color, textColor, bounds, readOnly, showDetails, onOpenInfo, onRemove, isOtherDay = false }: ClassBlockProps) {
  const geometry = getBlockGeometry(meeting, bounds);

  return (
    <div
      className={`cp-class-block ${meeting.isHoverPreview ? "is-preview" : ""}`}
      style={{
        top: isOtherDay ? undefined : `${geometry.topPct}%`,
        height: isOtherDay ? undefined : `${geometry.heightPct}%`,
        left: isOtherDay ? undefined : `${geometry.leftPct}%`,
        width: isOtherDay ? undefined : `${geometry.widthPct}%`,
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
          <strong className="cp-class-title">{meeting.displayCourseCode ?? meeting.courseCode}</strong>
          {isOtherDay ? (
            <span className="cp-class-time">Asynchronous / TBA Time</span>
          ) : (
            <span className="cp-class-time">{formatHourDecimal(meeting.startHour)} - {formatHourDecimal(meeting.endHour)}</span>
          )}
          <span className="cp-class-line">Section {meeting.sectionCode}</span>
          {meeting.instructor && <span className="cp-class-line">{meeting.instructor}</span>}
          {meeting.location && <span className="cp-class-line">{meeting.location}</span>}
        </>
      ) : (
        <strong>Busy</strong>
      )}
    </div>
  );
}
