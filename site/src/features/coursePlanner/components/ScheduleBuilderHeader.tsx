import { Calendar, Loader2, Printer, Save } from "lucide-react";

interface CatalogTermOption {
  id: string;
  label: string;
}

interface SavedScheduleOption {
  id: string;
  name: string;
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
  extraHeaderActionLabel?: string;
  onExtraHeaderActionClick?: () => void;
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
  extraHeaderActionLabel,
  onExtraHeaderActionClick,
}: ScheduleBuilderHeaderProps) {
  return (
    <header className="cp-builder-header">
      <div className="cp-builder-top-row">
        <div>
          <h1>Edit Schedule</h1>
          <p>Edit and save your schedule for the selected term.</p>
        </div>
        <div className="cp-builder-actions">
          <button type="button" className="cp-builder-action-btn is-primary">Edit Schedule</button>
          {extraHeaderActionLabel && onExtraHeaderActionClick && (
            <button type="button" className="cp-builder-action-btn" onClick={onExtraHeaderActionClick}>{extraHeaderActionLabel}</button>
          )}
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
      </div>

      {saveMessage && <div className="cp-builder-subtitle">{saveMessage}</div>}

      <div className="cp-builder-subtitle">
        <Calendar size={14} /> Weekly Schedule
      </div>
    </header>
  );
}
