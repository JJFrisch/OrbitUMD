import { Loader2, Printer, Save, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

interface CatalogTermOption {
  id: string;
  label: string;
}

interface ScheduleBuilderHeaderProps {
  scheduleName: string;
  onScheduleNameChange: (value: string) => void;
  courseCount: number;
  credits: number;
  termLabel: string;
  termOptions: CatalogTermOption[];
  selectedTermId: string;
  onSelectedTermChange: (termId: string) => void;
  onExportPrint: () => void;
  onViewAllSchedules: () => void;
  onSave: () => void;
  onSaveShortcut?: () => void;
  savePending: boolean;
  saveMessage?: string;
  extraControlActionLabel?: string;
  extraControlActionIcon?: ReactNode;
  onExtraControlActionClick?: () => void;
  saveStatusText?: string;
  saveStatusTone?: "saving" | "saved" | "autosaved" | "error";
  showProjectedTimesNote?: boolean;
}

export function ScheduleBuilderHeader({
  scheduleName,
  onScheduleNameChange,
  courseCount,
  credits,
  termLabel,
  termOptions,
  selectedTermId,
  onSelectedTermChange,
  onExportPrint,
  onViewAllSchedules,
  onSave,
  onSaveShortcut,
  savePending,
  saveMessage,
  extraControlActionLabel,
  extraControlActionIcon,
  onExtraControlActionClick,
  saveStatusText,
  saveStatusTone = "autosaved",
  showProjectedTimesNote = false,
}: ScheduleBuilderHeaderProps) {
  const [showProjectedInfo, setShowProjectedInfo] = useState(false);
  const projectedInfoRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!showProjectedInfo) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!projectedInfoRef.current?.contains(event.target as Node)) {
        setShowProjectedInfo(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowProjectedInfo(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [showProjectedInfo]);

  return (
    <header className="cp-builder-header">
      <div className="cp-builder-top-row">
        <div className="cp-builder-top-title-wrap">
          <h1>Edit Schedule</h1>
          {showProjectedTimesNote && (
            <span ref={projectedInfoRef} className="cp-projected-times-note">
              Projected Times
              <button
                type="button"
                className="cp-projected-times-info"
                aria-label="What projected times means"
                onClick={() => setShowProjectedInfo((current) => !current)}
              >
                i
              </button>
              {showProjectedInfo && (
                <span className="cp-projected-times-popover" role="dialog" aria-label="Projected times information">
                  <button
                    type="button"
                    className="cp-projected-times-popover-close"
                    aria-label="Close projected times information"
                    onClick={() => setShowProjectedInfo(false)}
                  >
                    <X size={12} />
                  </button>
                  <strong>Projected Times</strong>
                  <span>
                    This term is using projected catalog data based on current and historical patterns.
                    Actual classes and meeting times may change when the official schedule is released.
                  </span>
                </span>
              )}
            </span>
          )}
          {saveStatusText && (
            <span className={`cp-builder-save-status is-${saveStatusTone}`}>
              {saveStatusTone === "saving" && <Loader2 size={12} className="animate-spin" />}
              {saveStatusText}
            </span>
          )}
        </div>
        <div className="cp-builder-actions">
          <button type="button" className="cp-builder-action-btn" onClick={onViewAllSchedules}>View All Schedules</button>
        </div>
      </div>

      <div className="cp-builder-controls">
        <input
          value={scheduleName}
          onChange={(event) => onScheduleNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            (onSaveShortcut ?? onSave)();
          }}
          placeholder="Schedule name..."
        />

        <label>
          Term:
          <select
            aria-label="Catalog term"
            value={selectedTermId}
            onChange={(event) => onSelectedTermChange(event.target.value)}
          >
            {termOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="cp-builder-stats">
          <span>{termLabel}</span>
          <span>{courseCount} courses</span>
          <span>{credits} credits</span>
        </div>

        <button type="button" className="cp-builder-action-btn" onClick={onExportPrint}>
          <Printer size={13} /> Export / Print
        </button>

        <button type="button" className="cp-builder-save-btn" onClick={onSave} disabled={savePending}>
          {savePending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {savePending ? "Saving…" : "Save"}
        </button>

        <div className="cp-builder-controls-spacer" />

        {extraControlActionLabel && onExtraControlActionClick && (
          <button type="button" className="cp-builder-action-btn is-accent" onClick={onExtraControlActionClick}>
            {extraControlActionIcon}
            {extraControlActionLabel}
          </button>
        )}
      </div>

      {saveMessage && (
        <div className={saveMessage.toLowerCase().includes("already exists") ? "cp-error-text" : "cp-builder-subtitle"}>
          {saveMessage}
        </div>
      )}
    </header>
  );
}
