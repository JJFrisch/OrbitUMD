import { Calendar, Eye, EyeOff, Printer, Save } from "lucide-react";
import type { VisibilityMode } from "../types/coursePlanner";

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
  visibilityMode: VisibilityMode;
  onToggleVisibility: () => void;
  onExportPrint: () => void;
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
          <button type="button" className="cp-builder-action-btn">View All Schedules</button>
        </div>
      </div>

      <div className="cp-builder-controls">
        <label>
          Schedule:
          <select defaultValue="default">
            <option value="default">Default schedule</option>
            <option value="new">+ Create New Schedule</option>
          </select>
        </label>

        <input
          value={scheduleName}
          onChange={(event) => onScheduleNameChange(event.target.value)}
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

        <button type="button" className="cp-builder-save-btn">
          <Save size={13} /> Save
        </button>
      </div>

      <div className="cp-builder-subtitle">
        <Calendar size={14} /> Weekly Schedule
      </div>
    </header>
  );
}
