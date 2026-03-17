import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AlertCircle, CheckCircle2, Cloud } from "lucide-react";
import { NeededClassesPanel } from "@/app/components/NeededClassesPanel";
import { Button } from "@/app/components/ui/button";
import { CourseSearchPanel } from "./components/search/CourseSearchPanel";
import { CalendarView } from "./components/schedule/CalendarView";
import { ScheduleDetailsOverlay } from "./components/schedule/ScheduleDetailsOverlay";
import { ScheduleBuilderHeader } from "./components/ScheduleBuilderHeader";
import { useCoursePlannerStore } from "./state/coursePlannerStore";
import { listUserDegreePrograms } from "@/lib/repositories/degreeProgramsRepository";
import { listUserPriorCredits } from "@/lib/repositories/priorCreditsRepository";
import { loadProgramRequirementBundles, type AuditCourseStatus } from "@/lib/requirements/audit";
import { lookupCourseDetails } from "@/lib/requirements/courseDetailsLoader";
import { plannerApi } from "@/lib/api/planner";
import { resolvePriorCreditCourseCodes } from "@/lib/requirements/priorCreditLabels";
import { compareAcademicTerms, getAcademicProgressStatus } from "@/lib/scheduling/termProgress";
import {
  buildNeededClassItems,
  generateRecommendationPlan,
  type NeededClassItem,
} from "@/lib/requirements/neededClassesAdvisor";
import "./styles/coursePlanner.css";

const DEFAULT_SCHEDULE_NAME = "Default Schedule";
const SCHEDULE_BUILDER_AUTOSAVE_KEY = "orbitumd:schedule-builder:draft:v1";

function buildScheduleFingerprint(
  activeScheduleId: string | null,
  scheduleName: string,
  selections: Record<string, { section: { id?: string }; sectionKey: string }>,
): string {
  const selectionKeys = Object.values(selections)
    .map((selection) => selection.section.id || selection.sectionKey)
    .sort()
    .join("|");
  const scheduleKey = activeScheduleId ?? "__new";
  const normalizedName = scheduleName.trim();
  return `${scheduleKey}::${normalizedName}::${selectionKeys}`;
}

export function CoursePlannerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const lastProcessedDeepLink = useRef<string>("");
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
  const setFilters = useCoursePlannerStore((state) => state.setFilters);
  const executeSearch = useCoursePlannerStore((state) => state.executeSearch);
  const addPlannedCourseByCode = useCoursePlannerStore((state) => state.addPlannedCourseByCode);

  const activeScheduleId = useCoursePlannerStore((state) => state.activeScheduleId);
  const savedSchedules = useCoursePlannerStore((state) => state.savedSchedules);
  const savePending = useCoursePlannerStore((state) => state.savePending);
  const saveSchedule = useCoursePlannerStore((state) => state.saveSchedule);
  const loadSchedule = useCoursePlannerStore((state) => state.loadSchedule);
  const refreshScheduleList = useCoursePlannerStore((state) => state.refreshScheduleList);
  const startNewSchedule = useCoursePlannerStore((state) => state.startNewSchedule);
  const saveError = useCoursePlannerStore((state) => state.saveError);
  const [lastSavedFingerprint, setLastSavedFingerprint] = useState(() =>
    buildScheduleFingerprint(null, DEFAULT_SCHEDULE_NAME, {}),
  );
  const [lastAutosavedAt, setLastAutosavedAt] = useState<number | null>(null);
  const [showNeededPanel, setShowNeededPanel] = useState(false);
  const [neededItems, setNeededItems] = useState<NeededClassItem[]>([]);
  const [strictPriorPrereqs, setStrictPriorPrereqs] = useState<boolean>(() => {
    const stored = localStorage.getItem("orbitumd:advisor:strict-prior-prereqs");
    return stored === null ? true : stored === "true";
  });
  const [creditTarget, setCreditTarget] = useState<number>(() => {
    const stored = Number(localStorage.getItem("orbitumd:advisor:credit-target") ?? 15);
    return [12, 15, 18].includes(stored) ? stored : 15;
  });

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

  const currentFingerprint = useMemo(
    () => buildScheduleFingerprint(activeScheduleId, scheduleName, selections),
    [activeScheduleId, scheduleName, selections],
  );
  const hasUnsavedChanges = currentFingerprint !== lastSavedFingerprint;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const payload = {
        savedAt: Date.now(),
        scheduleName,
        activeScheduleId,
        term: baseTerm,
        year: baseYear,
        selections: Object.values(selections),
      };

      localStorage.setItem(SCHEDULE_BUILDER_AUTOSAVE_KEY, JSON.stringify(payload));
      setLastAutosavedAt(payload.savedAt);
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [activeScheduleId, baseTerm, baseYear, scheduleName, selections]);

  const confirmLeaveWithoutSaving = useCallback(() => {
    if (!hasUnsavedChanges) return true;
    return window.confirm("Do you want to save your work? Select No to discard your unsaved changes.");
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    void useCoursePlannerStore.getState().executeSearch();
  }, []);

  useEffect(() => {
    const genEd = searchParams.get("gened");
    if (!genEd) return;
    const normalized = genEd.toUpperCase().trim();
    setFilters((current) => ({
      ...current,
      genEds: current.genEds.includes(normalized) ? current.genEds : [...current.genEds, normalized],
    }));
    void executeSearch();
  }, [executeSearch, searchParams, setFilters]);

  // Load saved schedules for the current term
  useEffect(() => {
    void refreshScheduleList();
  }, [resolvedTerm, resolvedYear, refreshScheduleList]);

  // Support deep-linking from the Schedule Library, e.g.
  // /schedule-builder?scheduleId=<id>&term=08-2026
  useEffect(() => {
    const rawTerm = searchParams.get("term");
    const scheduleId = searchParams.get("scheduleId");
    const shouldStartNew = searchParams.get("new") === "1";
    const key = `${rawTerm ?? ""}|${scheduleId ?? ""}|${shouldStartNew ? "new" : "existing"}`;

    if (lastProcessedDeepLink.current === key) {
      return;
    }
    lastProcessedDeepLink.current = key;

    if (shouldStartNew) {
      if (!confirmLeaveWithoutSaving()) {
        return;
      }
      startNewSchedule();
      setScheduleName(DEFAULT_SCHEDULE_NAME);
      setLastSavedFingerprint(buildScheduleFingerprint(null, DEFAULT_SCHEDULE_NAME, {}));
      return;
    }

    if (!rawTerm && !scheduleId) {
      return;
    }

    if (rawTerm) {
      const [termCode, termYearRaw] = rawTerm.split("-");
      const termYear = Number(termYearRaw);
      if (termCode && Number.isFinite(termYear)) {
        setCatalogTerm(termCode, termYear);
      }
    }

    if (scheduleId) {
      if (!confirmLeaveWithoutSaving()) {
        return;
      }
      void loadSchedule(scheduleId).then(() => {
        const state = useCoursePlannerStore.getState();
        const match = state.savedSchedules.find((s) => s.id === scheduleId);
        if (match) {
          setScheduleName(match.name);
          setLastSavedFingerprint(buildScheduleFingerprint(scheduleId, match.name, state.selections));
        }
      });
    }
  }, [confirmLeaveWithoutSaving, loadSchedule, searchParams, setCatalogTerm, startNewSchedule]);

  const handleSaveClick = useCallback(() => {
    if (!activeScheduleId && scheduleName.trim().toLowerCase() === DEFAULT_SCHEDULE_NAME.toLowerCase()) {
      setSaveMessage("Consider renaming this schedule so it is easier to recognize later.");
      window.setTimeout(() => setSaveMessage(undefined), 5000);
    }

    void saveSchedule(scheduleName).then(() => {
      const state = useCoursePlannerStore.getState();
      setLastSavedFingerprint(buildScheduleFingerprint(state.activeScheduleId, scheduleName, state.selections));
    });
  }, [activeScheduleId, saveSchedule, scheduleName]);

  const handleScheduleSelect = useCallback((scheduleId: string | "__new") => {
    if (!confirmLeaveWithoutSaving()) {
      return;
    }

    if (scheduleId === "__new") {
      startNewSchedule();
      setScheduleName(DEFAULT_SCHEDULE_NAME);
      setLastSavedFingerprint(buildScheduleFingerprint(null, DEFAULT_SCHEDULE_NAME, {}));
      return;
    }

    void loadSchedule(scheduleId).then(() => {
      const state = useCoursePlannerStore.getState();
      const match = savedSchedules.find((s) => s.id === scheduleId);
      if (match) {
        setScheduleName(match.name);
        setLastSavedFingerprint(buildScheduleFingerprint(scheduleId, match.name, state.selections));
      }
    });
  }, [confirmLeaveWithoutSaving, loadSchedule, savedSchedules, startNewSchedule]);

  const scheduleOptions = useMemo(
    () => savedSchedules.map((s) => ({ id: s.id, name: s.name })),
    [savedSchedules],
  );

  useEffect(() => {
    localStorage.setItem("orbitumd:advisor:strict-prior-prereqs", String(strictPriorPrereqs));
  }, [strictPriorPrereqs]);

  useEffect(() => {
    localStorage.setItem("orbitumd:advisor:credit-target", String(creditTarget));
  }, [creditTarget]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const [programs, priorCredits, schedules] = await Promise.all([
          listUserDegreePrograms(),
          listUserPriorCredits(),
          plannerApi.listAllSchedulesWithSelections(),
        ]);
        const bundles = await loadProgramRequirementBundles(programs);
        if (!active) return;

        const byCourseCode = new Map<string, AuditCourseStatus>();
        const byCourseTags = new Map<string, string[]>();
        const timelineTerms = schedules
          .filter((item) => item.is_primary && item.term_code && item.term_year)
          .sort((left, right) => compareAcademicTerms(
            { termCode: left.term_code!, termYear: left.term_year! },
            { termCode: right.term_code!, termYear: right.term_year! },
          ))
          .map((item) => {
            const label = `${item.term_code}-${item.term_year}`;
            const status = getAcademicProgressStatus({ termCode: item.term_code!, termYear: item.term_year! });
            return {
              id: label,
              label,
              status,
              schedule: item,
            };
          });

        for (const entry of timelineTerms) {
          const schedule = entry.schedule;
          const status = entry.status;
          const payload = (schedule.selections_json ?? {}) as { selections?: Array<any> };
          const selectionsList = Array.isArray(payload) ? payload : (Array.isArray(payload.selections) ? payload.selections : []);

          for (const selection of selectionsList) {
            const code = String(selection?.course?.courseCode ?? "").toUpperCase();
            if (!code) continue;
            const current = byCourseCode.get(code) ?? "not_started";
            const nextRank = status === "completed" ? 4 : status === "in_progress" ? 3 : status === "planned" ? 2 : 1;
            const currentRank = current === "completed" ? 4 : current === "in_progress" ? 3 : current === "planned" ? 2 : 1;
            byCourseCode.set(code, nextRank > currentRank ? status : current);
            byCourseTags.set(code, Array.isArray(selection?.course?.genEds) ? selection.course.genEds : []);
          }
        }

        for (const credit of priorCredits) {
          if (credit.countsTowardProgress === false) continue;
          for (const code of resolvePriorCreditCourseCodes(credit)) {
            byCourseCode.set(code, "completed");
            byCourseTags.set(code, Array.isArray(credit.genEdCodes) ? credit.genEdCodes : []);
          }
        }

        const currentPlannerSelections = Object.values(useCoursePlannerStore.getState().selections);
        for (const selection of currentPlannerSelections) {
          const code = String(selection?.course?.courseCode ?? "").toUpperCase();
          if (!code) continue;
          const current = byCourseCode.get(code) ?? "not_started";
          if (current === "not_started") byCourseCode.set(code, "planned");
          byCourseTags.set(code, Array.isArray(selection?.course?.genEds) ? selection.course.genEds : []);
        }

        const neededCodes = Array.from(new Set(bundles.flatMap((bundle) => bundle.sections.flatMap((section) => section.courseCodes ?? []))))
          .map((code) => String(code).toUpperCase())
          .filter(Boolean);
        const details = neededCodes.length > 0 ? await lookupCourseDetails(neededCodes) : new Map();
        if (!active) return;

        const timelineLabels = timelineTerms.map((term) => term.label);
        const targetTermLabel = `${resolvedTerm}-${resolvedYear}`;
        const items = buildNeededClassItems({
          bundles,
          byCourseCode,
          byCourseTags,
          courseDetails: details,
          timelineTermLabels: timelineLabels,
          targetTermLabel,
        });

        const recommendation = generateRecommendationPlan({
          items,
          timeline: timelineTerms.filter((term) => term.status !== "completed").map((term) => ({ id: term.id, label: term.label })),
          strictPriorTermsOnly: strictPriorPrereqs,
          preferredCreditsPerTerm: creditTarget,
        });

        const recommendedTermByCourse = new Map<string, { label: string; index: number }>();
        recommendation.assignments.forEach((assignment, termIndex) => {
          assignment.courseCodes.forEach((code) => {
            recommendedTermByCourse.set(code, { label: assignment.termLabel, index: termIndex });
          });
        });

        const enriched = items.map((item) => {
          if (!item.courseCode) return item;
          const placement = recommendedTermByCourse.get(item.courseCode);
          if (!placement) return item;
          const proximityBoost = placement.label === targetTermLabel ? 40 : Math.max(0, 30 - placement.index * 4);
          return {
            ...item,
            recommendedTermLabel: placement.label,
            recommendationScore: item.recommendationScore + proximityBoost,
            rationale: [
              ...item.rationale,
              `Prerequisite and load-balanced sequence suggests ${placement.label}.`,
            ],
          };
        });

        setNeededItems(enriched);
      } catch {
        if (!active) return;
        setNeededItems([]);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [creditTarget, resolvedTerm, resolvedYear, selections, strictPriorPrereqs]);

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
        onViewAllSchedules={() => {
          if (!confirmLeaveWithoutSaving()) return;
          navigate("/schedules");
        }}
        savedSchedules={scheduleOptions}
        activeScheduleId={activeScheduleId}
        onSave={handleSaveClick}
        onSaveShortcut={handleSaveClick}
        onScheduleSelect={handleScheduleSelect}
        savePending={savePending}
        saveMessage={saveMessage}
      />

      {saveError && <p className="cp-error-text">{saveError}</p>}
      <div className="mb-2 flex justify-end gap-2 flex-wrap">
        <Button
          type="button"
          variant={strictPriorPrereqs ? "default" : "outline"}
          className={strictPriorPrereqs ? "bg-red-600 hover:bg-red-700" : "border-border"}
          onClick={() => setStrictPriorPrereqs((current) => !current)}
        >
          {strictPriorPrereqs ? "Prereqs: Prior Terms Only" : "Prereqs: Co-Term Allowed"}
        </Button>
        <Button
          type="button"
          variant={creditTarget === 12 ? "default" : "outline"}
          className={creditTarget === 12 ? "bg-red-600 hover:bg-red-700" : "border-border"}
          onClick={() => setCreditTarget(12)}
        >
          12 cr
        </Button>
        <Button
          type="button"
          variant={creditTarget === 15 ? "default" : "outline"}
          className={creditTarget === 15 ? "bg-red-600 hover:bg-red-700" : "border-border"}
          onClick={() => setCreditTarget(15)}
        >
          15 cr
        </Button>
        <Button
          type="button"
          variant={creditTarget === 18 ? "default" : "outline"}
          className={creditTarget === 18 ? "bg-red-600 hover:bg-red-700" : "border-border"}
          onClick={() => setCreditTarget(18)}
        >
          18 cr
        </Button>
        <Button type="button" variant="outline" className="border-border" onClick={() => setShowNeededPanel(true)}>
          What's Needed
        </Button>
      </div>
      <div className={`cp-status-banner ${hasUnsavedChanges ? "is-unsaved" : "is-saved"}`} role="status" aria-live="polite">
        {hasUnsavedChanges ? <AlertCircle className="cp-status-banner-icon" /> : <CheckCircle2 className="cp-status-banner-icon" />}
        <span>
          {hasUnsavedChanges ? "Unsaved changes in this schedule." : "All schedule changes are saved."}
          {lastAutosavedAt ? ` Autosaved ${new Date(lastAutosavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.` : ""}
        </span>
        <Cloud className="cp-status-banner-cloud" />
      </div>

      <div
        className="course-planner-layout"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          let payload: { type?: string; courseCode?: string; title?: string; credits?: number; genEdCode?: string } | null = null;
          try {
            payload = JSON.parse(event.dataTransfer.getData("text/plain"));
          } catch {
            payload = null;
          }
          if (!payload || payload.type !== "needed-course" || !payload.courseCode) return;
          addPlannedCourseByCode({
            courseCode: payload.courseCode,
            title: payload.title ?? payload.courseCode,
            credits: Number(payload.credits ?? 3) || 3,
            genEds: payload.genEdCode ? [payload.genEdCode] : [],
          });
        }}
      >
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

      <NeededClassesPanel
        open={showNeededPanel}
        title="What's Needed"
        subtitle="Auto-sorted for this semester. Drag a class into the schedule area to add it."
        items={neededItems}
        defaultSort="recommended"
        onClose={() => setShowNeededPanel(false)}
        onApplyGenEdFilter={(genEdCode) => {
          setFilters((current) => ({
            ...current,
            genEds: current.genEds.includes(genEdCode) ? current.genEds : [...current.genEds, genEdCode],
          }));
          void executeSearch();
        }}
        onAddCourse={(item) => {
          if (!item.courseCode) return;
          addPlannedCourseByCode({
            courseCode: item.courseCode,
            title: item.title,
            credits: item.credits,
            genEds: item.genEdCode ? [item.genEdCode] : [],
          });
        }}
      />
    </div>
  );
}
