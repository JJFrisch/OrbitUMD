import { Calendar, Eye, EyeOff, Loader2, Printer, Save } from "lucide-react";
import type { VisibilityMode } from "../types/coursePlanner";

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
  visibilityMode: VisibilityMode;
  onToggleVisibility: () => void;
  onExportPrint: () => void;
  onViewAllSchedules: () => void;
  savedSchedules: SavedScheduleOption[];
  activeScheduleId: string | null;
  onSave: () => void;
  onSaveShortcut?: () => void;
  onScheduleSelect: (scheduleId: string | "__new") => void;
  savePending: boolean;
  saveMessage?: string;
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
  visibilityMode,
  onToggleVisibility,
  onExportPrint,
  onViewAllSchedules,
  savedSchedules,
  activeScheduleId,
  onSave,
  onSaveShortcut,
  onScheduleSelect,
  savePending,
  saveMessage,
}: ScheduleBuilderHeaderProps) {
  return (
    <header className="cp-builder-header">
      <div className="cp-builder-top-row">
        <div>
          <h1>Schedule Builder</h1>
          <p>Create and manage multiple schedule options for each semester.</p>
        </div>
        <div className="cp-builder-actions">
          <button type="button" className="cp-builder-action-btn is-primary">Build Schedules</button>
          <button type="button" className="cp-builder-action-btn" onClick={onViewAllSchedules}>View All Schedules</button>
        </div>
      </div>

      <div className="cp-builder-controls">
        <label>
          Schedule:
          <select
            value={activeScheduleId ?? "__new"}
            onChange={(event) => {
              const val = event.target.value;
              onScheduleSelect(val === "__new" ? "__new" : val);
            }}
          >
            <option value="__new">+ New Schedule</option>
            {savedSchedules.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>

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

        <button type="button" className="cp-builder-action-btn" onClick={onToggleVisibility}>
          {visibilityMode === "full" ? <EyeOff size={13} /> : <Eye size={13} />}
          {visibilityMode === "full" ? "Busy/Free" : "Full"}
        </button>

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
