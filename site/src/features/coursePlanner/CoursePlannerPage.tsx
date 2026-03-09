import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { CourseSearchPanel } from "./components/search/CourseSearchPanel";
import { CalendarView } from "./components/schedule/CalendarView";
import { ScheduleDetailsOverlay } from "./components/schedule/ScheduleDetailsOverlay";
import { ScheduleBuilderHeader } from "./components/ScheduleBuilderHeader";
import { useCoursePlannerStore } from "./state/coursePlannerStore";
import "./styles/coursePlanner.css";

const DEFAULT_SCHEDULE_NAME = "Default Schedule";

export function CoursePlannerPage() {
  const navigate = useNavigate();
  const [scheduleName, setScheduleName] = useState(DEFAULT_SCHEDULE_NAME);
  const [saveMessage, setSaveMessage] = useState<string | undefined>(undefined);
  const baseTerm = useCoursePlannerStore((state) => state.term);
  const baseYear = useCoursePlannerStore((state) => state.year);
  const visibilityMode = useCoursePlannerStore((state) => state.visibilityMode);
  const selectedInfoKey = useCoursePlannerStore((state) => state.selectedInfoKey);
  const selections = useCoursePlannerStore((state) => state.selections);
  const resolvedTerm = useCoursePlannerStore((state) => state.resolvedTerm);
  const resolvedYear = useCoursePlannerStore((state) => state.resolvedYear);
  const setVisibilityMode = useCoursePlannerStore((state) => state.setVisibilityMode);
  const setPrintMode = useCoursePlannerStore((state) => state.setPrintMode);
  const setCatalogTerm = useCoursePlannerStore((state) => state.setCatalogTerm);
  const toggleInfoPanel = useCoursePlannerStore((state) => state.toggleInfoPanel);

  const activeScheduleId = useCoursePlannerStore((state) => state.activeScheduleId);
  const savedSchedules = useCoursePlannerStore((state) => state.savedSchedules);
  const savePending = useCoursePlannerStore((state) => state.savePending);
  const saveSchedule = useCoursePlannerStore((state) => state.saveSchedule);
  const loadSchedule = useCoursePlannerStore((state) => state.loadSchedule);
  const refreshScheduleList = useCoursePlannerStore((state) => state.refreshScheduleList);
  const startNewSchedule = useCoursePlannerStore((state) => state.startNewSchedule);
  const saveError = useCoursePlannerStore((state) => state.saveError);

  const termCodeToLabel = useMemo<Record<string, string>>(() => ({
    "01": "Spring",
    "05": "Summer",
    "08": "Fall",
    "12": "Winter",
  }), []);

  const termOptions = useMemo(() => {
    const years = [baseYear - 1, baseYear, baseYear + 1, baseYear + 2];
    const orderedTerms: Array<{ term: string; label: string }> = [
      { term: "12", label: "Winter" },
      { term: "01", label: "Spring" },
      { term: "05", label: "Summer" },
      { term: "08", label: "Fall" },
    ];

    return years.flatMap((year) => orderedTerms.map((entry) => ({
      id: `${entry.term}-${year}`,
      label: `${entry.label} ${year}`,
      term: entry.term,
      year,
    })));
  }, [baseYear]);

  const selectedTermId = useMemo(() => `${baseTerm}-${baseYear}`, [baseTerm, baseYear]);

  const termLabel = useMemo(() => {
    return `${termCodeToLabel[resolvedTerm] ?? "Term"} ${resolvedYear}`;
  }, [resolvedTerm, resolvedYear, termCodeToLabel]);

  const stats = useMemo(() => {
    const activeSelections = Object.values(selections);
    const courseCount = activeSelections.length;
    const credits = activeSelections.reduce((sum, selection) => sum + (selection.course.maxCredits || 0), 0);
    return { courseCount, credits };
  }, [selections]);

  useEffect(() => {
    void useCoursePlannerStore.getState().executeSearch();
  }, []);

  // Load saved schedules for the current term
  useEffect(() => {
    void refreshScheduleList();
  }, [resolvedTerm, resolvedYear, refreshScheduleList]);

  const handleSaveClick = useCallback(() => {
    if (!activeScheduleId && scheduleName.trim().toLowerCase() === DEFAULT_SCHEDULE_NAME.toLowerCase()) {
      setSaveMessage("Consider renaming this schedule so it is easier to recognize later.");
      window.setTimeout(() => setSaveMessage(undefined), 5000);
    }

    void saveSchedule(scheduleName);
  }, [activeScheduleId, saveSchedule, scheduleName]);

  const handleScheduleSelect = useCallback((scheduleId: string | "__new") => {
    if (scheduleId === "__new") {
      startNewSchedule();
      setScheduleName(DEFAULT_SCHEDULE_NAME);
      return;
    }

    void loadSchedule(scheduleId).then(() => {
      const match = savedSchedules.find((s) => s.id === scheduleId);
      if (match) setScheduleName(match.name);
    });
  }, [loadSchedule, savedSchedules, startNewSchedule]);

  const scheduleOptions = useMemo(
    () => savedSchedules.map((s) => ({ id: s.id, name: s.name })),
    [savedSchedules],
  );

  return (
    <div className="course-planner-root">
      <ScheduleBuilderHeader
        scheduleName={scheduleName}
        onScheduleNameChange={setScheduleName}
        courseCount={stats.courseCount}
        credits={stats.credits}
        termLabel={termLabel}
        termOptions={termOptions}
        selectedTermId={selectedTermId}
        onSelectedTermChange={(termId) => {
          const [termCode, yearText] = termId.split("-");
          const parsedYear = Number(yearText);
          if (!termCode || !Number.isFinite(parsedYear)) return;
          setCatalogTerm(termCode, parsedYear);
        }}
        visibilityMode={visibilityMode}
        onToggleVisibility={() => setVisibilityMode(visibilityMode === "full" ? "busy_free" : "full")}
        onExportPrint={() => {
          setPrintMode(true);
          requestAnimationFrame(() => {
            window.print();
            setTimeout(() => setPrintMode(false), 200);
          });
        }}
        onViewAllSchedules={() => navigate("/schedules")}
        savedSchedules={scheduleOptions}
        activeScheduleId={activeScheduleId}
        onSave={handleSaveClick}
        onScheduleSelect={handleScheduleSelect}
        savePending={savePending}
        saveMessage={saveMessage}
      />

      {saveError && <p className="cp-error-text">{saveError}</p>}

      <div className="course-planner-layout">
        <CourseSearchPanel />
        <CalendarView />
      </div>

      <ScheduleDetailsOverlay
        selectedSectionKey={selectedInfoKey}
        onClose={() => {
          if (selectedInfoKey) {
            toggleInfoPanel(selectedInfoKey);
          }
        }}
      />
    </div>
  );
}
