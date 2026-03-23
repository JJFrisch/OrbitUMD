import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Calendar, CheckCircle2, ChevronDown, ChevronUp, Clock3, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  buildCourseContributionMap,
  getContributionLabelsForCourseCode,
  loadProgramRequirementBundles,
  type ProgramRequirementBundle,
} from "@/lib/requirements/audit";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { plannerApi } from "@/lib/api/planner";
import type { ScheduleWithSelections } from "@/lib/repositories/userSchedulesRepository";
import type { ScheduleSelection } from "@/features/coursePlanner/types/coursePlanner";
import { listUserDegreePrograms } from "@/lib/repositories/degreeProgramsRepository";
import { listUserPriorCredits, updatePriorCredit } from "@/lib/repositories/priorCreditsRepository";
import { getAcademicProgressStatus, compareAcademicTerms, type AcademicProgressStatus } from "@/lib/scheduling/termProgress";
import { calculateTranscriptGPAHistory } from "@/lib/transcripts/gpa";
import { lookupCourseDetails, type CourseDetails } from "@/lib/requirements/courseDetailsLoader";
import { resolvePriorCreditCourseCodes } from "@/lib/requirements/priorCreditLabels";

interface PlannedCourse {
  sectionKey: string;
  sourceRecordId?: string;
  code: string;
  title: string;
  sectionCode: string;
  credits: number;
  tags: string[];
  status: AcademicProgressStatus;
  grade?: string;
  countsTowardProgress: boolean;
}


interface PlannedTerm {
  id: string;
  termCode: string;
  termYear: number;
  termLabel: string;
  credits: number;
  status: AcademicProgressStatus;
  source: "schedule" | "prior_credit";
  scheduleId: string;
  scheduleName: string;
  updatedAt: string;
  courses: PlannedCourse[];
  semesterGPA?: number | null;
  cumulativeGPA?: number | null;
}

const TERM_NAME: Record<string, string> = {
  "01": "Spring",
  "05": "Summer",
  "08": "Fall",
  "12": "Winter",
};

const GRADE_OPTIONS = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F", "P", "S", "U", "I", "W", "AUD", "NGR", "IP", "NG", "NC", "CR", "WP", "WF"] as const;

function parseSelections(stored: unknown): ScheduleSelection[] {
  const payload = (stored ?? []) as { selections?: ScheduleSelection[] } | ScheduleSelection[];
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.selections) ? payload.selections : [];
}

function buildSelectionsPayload(selections: ScheduleSelection[]) {
  return {
    sectionIds: selections.map((selection) => selection.section.id || selection.sectionKey),
    selections,
  };
}

function normalizeGradeValue(grade: string | undefined): string | undefined {
  const normalized = String(grade ?? "").trim().toUpperCase();
  return normalized.length > 0 ? normalized : undefined;
}

function formatTermLabel(termCode: string, termYear: number): string {
  return `${TERM_NAME[termCode] ?? "Term"} ${termYear}`;
}

function statusBadge(status: AcademicProgressStatus) {
  if (status === "completed") {
    return <Badge className="bg-green-100 text-green-900 border border-green-300 dark:bg-green-600/20 dark:text-green-300 dark:border-green-600/30">Completed</Badge>;
  }
  if (status === "in_progress") {
    return <Badge className="bg-blue-100 text-blue-900 border border-blue-300 dark:bg-blue-600/20 dark:text-blue-300 dark:border-blue-600/30">In Progress</Badge>;
  }
  return <Badge variant="outline" className="border-border">Planned</Badge>;
}

function termCardAccent(status: AcademicProgressStatus): string {
  if (status === "completed") return "border-green-600/30 bg-green-500/5";
  if (status === "in_progress") return "border-blue-600/35 bg-blue-500/5 shadow-lg shadow-blue-900/10";
  return "border-border bg-amber-500/5";
}

function toPlannedTerm(schedule: ScheduleWithSelections): PlannedTerm | null {
  if (!schedule.term_code || !schedule.term_year) {
    return null;
  }

  const termStatus = getAcademicProgressStatus({ termCode: schedule.term_code, termYear: schedule.term_year });
  const selections = parseSelections(schedule.selections_json);

  const dedupedByCourse = new Map<string, PlannedCourse>();
  for (const selection of selections) {
    const code = selection?.course?.courseCode;
    if (!code || dedupedByCourse.has(code)) {
      continue;
    }

    const genEds = Array.isArray(selection?.course?.genEds) ? selection.course.genEds : [];
    const credits = Number(selection?.course?.maxCredits ?? selection?.course?.credits ?? 0);

    dedupedByCourse.set(code, {
      sectionKey: String(selection?.sectionKey ?? code),
      code,
      title: String(selection?.course?.name ?? "Untitled Course"),
      sectionCode: String(selection?.section?.sectionCode ?? "TBA"),
      credits: Number.isFinite(credits) ? credits : 0,
      tags: genEds,
      status: termStatus,
      grade: normalizeGradeValue(selection?.grade),
      countsTowardProgress: true,
    });
  }

  const courses = Array.from(dedupedByCourse.values());

  return {
    id: `${schedule.term_code}-${schedule.term_year}`,
    termCode: schedule.term_code,
    termYear: schedule.term_year,
    termLabel: formatTermLabel(schedule.term_code, schedule.term_year),
    credits: courses.reduce((sum, course) => sum + course.credits, 0),
    status: termStatus,
    source: "schedule",
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    updatedAt: schedule.updated_at,
    courses,
  };
}

function parseTermLabel(termLabel: string | undefined): { termCode: string; termYear: number } | null {
  const match = String(termLabel ?? "").match(/^(Spring|Summer|Fall|Winter)\s+(20\d{2})$/i);
  if (!match) return null;
  const season = match[1].toLowerCase();
  const year = Number(match[2]);
  const termCode = season === "spring" ? "01" : season === "summer" ? "05" : season === "fall" ? "08" : "12";
  return { termCode, termYear: year };
}

function buildPriorCreditTerms(priorCredits: Awaited<ReturnType<typeof listUserPriorCredits>>): PlannedTerm[] {
  const grouped = new Map<string, PlannedCourse[]>();

  for (const credit of priorCredits) {
    const termLabel = credit.termAwarded ?? "Prior to UMD";
    const normalizedCodes = resolvePriorCreditCourseCodes(credit);

    for (const code of normalizedCodes) {
      const entries = grouped.get(termLabel) ?? [];
      entries.push({
        sectionKey: `${credit.id}-${code}`,
        sourceRecordId: credit.id,
        code,
        title: credit.originalName,
        sectionCode: credit.importOrigin === "testudo_transcript" ? "Transcript" : "Prior Credit",
        credits: Number(credit.credits ?? 0) || 0,
        tags: Array.isArray(credit.genEdCodes) ? credit.genEdCodes : [],
        status: "completed",
        grade: credit.grade,
        countsTowardProgress: credit.countsTowardProgress !== false,
      });
      grouped.set(termLabel, entries);
    }
  }

  return Array.from(grouped.entries()).map(([termLabel, courses], index) => {
    const parsedTerm = parseTermLabel(termLabel);
    return {
      id: parsedTerm ? `${parsedTerm.termCode}-${parsedTerm.termYear}-prior` : `prior-${index}`,
      termCode: parsedTerm?.termCode ?? "00",
      termYear: parsedTerm?.termYear ?? 0,
      termLabel,
      credits: courses.filter((course) => course.countsTowardProgress).reduce((sum, course) => sum + course.credits, 0),
      status: "completed",
      source: "prior_credit",
      scheduleId: "prior-credit",
      scheduleName: "Imported History",
      updatedAt: new Date().toISOString(),
      courses,
      semesterGPA: null,
      cumulativeGPA: null,
    } satisfies PlannedTerm;
  });
}

function statusRank(status: AcademicProgressStatus): number {
  if (status === "completed") return 3;
  if (status === "in_progress") return 2;
  return 1;
}

function formatStatusLabel(status: AcademicProgressStatus): string {
  return status === "in_progress" ? "In Progress" : status === "completed" ? "Completed" : "Planned";
}

function statusTextClass(status: AcademicProgressStatus): string {
  if (status === "completed") return "text-green-700 dark:text-green-300";
  if (status === "in_progress") return "text-blue-700 dark:text-blue-300";
  return "text-amber-700 dark:text-amber-300";
}

function LinkedCourseText({ text, onCourseClick }: { text: string; onCourseClick: (code: string) => void }) {
  const COURSE_RE = /([A-Z]{4}\d{3}[A-Z]?)/g;
  const parts: Array<{ type: "text" | "code"; value: string }> = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = COURSE_RE.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: "text", value: text.slice(last, match.index) });
    parts.push({ type: "code", value: match[1] });
    last = match.index + match[1].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });

  return (
    <>
      {parts.map((part, index) => part.type === "code" ? (
        <button
          key={`${part.value}-${index}`}
          type="button"
          className="font-medium text-red-500 hover:underline"
          onClick={() => onCourseClick(part.value)}
        >
          {part.value}
        </button>
      ) : (
        <span key={`text-${index}`}>{part.value}</span>
      ))}
    </>
  );
}

export default function FourYearPlan() {
  const navigate = useNavigate();
  const [showGpaDetails, setShowGpaDetails] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingGradeKey, setSavingGradeKey] = useState<string | null>(null);
  const [mainSchedules, setMainSchedules] = useState<ScheduleWithSelections[]>([]);
  const [priorCredits, setPriorCredits] = useState<Awaited<ReturnType<typeof listUserPriorCredits>>>([]);
  const [requirementBundles, setRequirementBundles] = useState<ProgramRequirementBundle[]>([]);
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<CourseDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const [all, selectedPrograms, loadedPriorCredits] = await Promise.all([
          plannerApi.listAllSchedulesWithSelections(),
          listUserDegreePrograms(),
          listUserPriorCredits(),
        ]);
        const bundles = await loadProgramRequirementBundles(selectedPrograms);
        if (!active) return;

        setMainSchedules(all.filter((schedule) => schedule.is_primary));
        setPriorCredits(loadedPriorCredits);
        setRequirementBundles(bundles);
        setErrorMessage(null);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Unable to load four-year plan data.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!detailCode) {
      setDetailData(null);
      setDetailLoading(false);
      return;
    }

    let active = true;
    setDetailLoading(true);
    void lookupCourseDetails([detailCode]).then((result) => {
      if (!active) return;
      setDetailData(result.get(detailCode.toUpperCase()) ?? null);
      setDetailLoading(false);
    }).catch(() => {
      if (!active) return;
      setDetailData(null);
      setDetailLoading(false);
    });

    return () => {
      active = false;
    };
  }, [detailCode]);

  const academicGpaHistory = useMemo(() => {
    const completedScheduleGrades = mainSchedules.flatMap((schedule) => {
      if (!schedule.term_code || !schedule.term_year) {
        return [];
      }

      const termStatus = getAcademicProgressStatus({ termCode: schedule.term_code, termYear: schedule.term_year });
      if (termStatus !== "completed") {
        return [];
      }

      const termLabel = formatTermLabel(schedule.term_code, schedule.term_year);
      return parseSelections(schedule.selections_json)
        .map((selection) => {
          const grade = normalizeGradeValue(selection?.grade);
          if (!grade) return null;
          const credits = Number(selection?.course?.maxCredits ?? selection?.course?.credits ?? 0);
          return {
            sourceType: "transcript",
            termAwarded: termLabel,
            grade,
            credits: Number.isFinite(credits) ? credits : 0,
          };
        })
        .filter((entry): entry is { sourceType: string; termAwarded: string; grade: string; credits: number } => Boolean(entry));
    });

    return calculateTranscriptGPAHistory([...priorCredits, ...completedScheduleGrades]);
  }, [mainSchedules, priorCredits]);

  const terms = useMemo(() => {
    const transformed = mainSchedules
      .map(toPlannedTerm)
      .filter((term): term is PlannedTerm => term !== null)
      .filter((term) => term.courses.length > 0);

    const priorTerms = buildPriorCreditTerms(priorCredits);
    const combined = [...transformed, ...priorTerms];
    const gpaByTerm = new Map(academicGpaHistory.terms.map((term) => [term.termLabel, term]));

    combined.sort((a, b) => compareAcademicTerms(
      { termCode: a.termCode === "00" ? "01" : a.termCode, termYear: a.termYear || 0 },
      { termCode: b.termCode === "00" ? "01" : b.termCode, termYear: b.termYear || 0 }
    ));

    return combined.map((term) => {
      const termGpa = gpaByTerm.get(term.termLabel);
      return {
        ...term,
        semesterGPA: termGpa?.semesterGPA ?? null,
        cumulativeGPA: termGpa?.cumulativeGPA ?? null,
      };
    });
  }, [academicGpaHistory.terms, mainSchedules, priorCredits]);

  const visibleTerms = useMemo(() => {
    const current = terms.filter((term) => term.status === "in_progress");
    const future = terms.filter((term) => term.status === "planned");
    const completed = terms.filter((term) => term.status === "completed");
    const priorToUmd = completed.filter((term) => term.termLabel === "Prior to UMD");
    const completedRegular = completed.filter((term) => term.termLabel !== "Prior to UMD");
    return [...current, ...future, ...completedRegular, ...priorToUmd];
  }, [terms]);

  const duplicateScheduleSectionKeys = useMemo(() => {
    const earnedCourseCodes = new Set(
      terms
        .filter((term) => term.status === "completed")
        .flatMap((term) => term.courses)
        .filter((course) => course.countsTowardProgress)
        .map((course) => course.code.toUpperCase()),
    );

    return new Set(
      terms
        .filter((term) => term.source === "schedule" && term.status !== "completed")
        .flatMap((term) => term.courses)
        .filter((course) => course.countsTowardProgress && earnedCourseCodes.has(course.code.toUpperCase()))
        .map((course) => course.sectionKey),
    );
  }, [terms]);

  const summary = useMemo(() => {
    const countedCourses = terms
      .flatMap((term) => term.courses)
      .filter((course) => course.countsTowardProgress)
      .filter((course) => !duplicateScheduleSectionKeys.has(course.sectionKey));

    const completedCredits = countedCourses
      .filter((course) => course.status === "completed")
      .reduce((sum, course) => sum + course.credits, 0);
    const inProgressCredits = countedCourses
      .filter((course) => course.status === "in_progress")
      .reduce((sum, course) => sum + course.credits, 0);
    const plannedCredits = countedCourses
      .filter((course) => course.status === "planned")
      .reduce((sum, course) => sum + course.credits, 0);

    return {
      totalCredits: completedCredits + inProgressCredits + plannedCredits,
      completedCredits,
      inProgressCredits,
      plannedCredits,
      duplicateCourseCount: duplicateScheduleSectionKeys.size,
      overallGPA: academicGpaHistory.overallGPA,
    };
  }, [academicGpaHistory.overallGPA, duplicateScheduleSectionKeys, terms]);

  const contributionMap = useMemo(() => buildCourseContributionMap(requirementBundles), [requirementBundles]);

  const contributionPalette = [
    {
      borderClass: "border-sky-500",
      bgClass: "bg-sky-500/10",
      textClass: "text-sky-700 dark:text-sky-300",
    },
    {
      borderClass: "border-orange-500",
      bgClass: "bg-orange-500/10",
      textClass: "text-orange-700 dark:text-orange-300",
    },
    {
      borderClass: "border-emerald-500",
      bgClass: "bg-emerald-500/10",
      textClass: "text-emerald-700 dark:text-emerald-300",
    },
    {
      borderClass: "border-rose-500",
      bgClass: "bg-rose-500/10",
      textClass: "text-rose-700 dark:text-rose-300",
    },
    {
      borderClass: "border-amber-500",
      bgClass: "bg-amber-500/10",
      textClass: "text-amber-700 dark:text-amber-300",
    },
  ] as const;

  const contributionBadgeClass = (label: string) => {
    const index = Math.abs(label.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0)) % contributionPalette.length;
    const entry = contributionPalette[index];
    return `border ${entry.borderClass} ${entry.bgClass} ${entry.textClass}`;
  };

  const contributionRowClass = (labels: string[]) => {
    if (labels.length === 0) return "";
    const index = Math.abs(labels[0].split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0)) % contributionPalette.length;
    const entry = contributionPalette[index];
    return `${entry.bgClass} ${entry.borderClass} border-l-4`;
  };

  const handleScheduleGradeChange = async (term: PlannedTerm, course: PlannedCourse, nextGradeValue: string) => {
    if (term.status !== "completed") {
      return;
    }

    if (term.source === "prior_credit") {
      if (!course.sourceRecordId) {
        toast.error("Unable to update the saved grade for this class.");
        return;
      }

      const normalizedGrade = nextGradeValue === "__none__" ? undefined : normalizeGradeValue(nextGradeValue);
      const previousPriorCredits = priorCredits;

      setSavingGradeKey(course.sectionKey);
      setPriorCredits((current) => current.map((credit) => (
        credit.id === course.sourceRecordId
          ? { ...credit, grade: normalizedGrade }
          : credit
      )));

      try {
        const updated = await updatePriorCredit(course.sourceRecordId, { grade: normalizedGrade });
        setPriorCredits((current) => current.map((credit) => (credit.id === updated.id ? updated : credit)));
      } catch (error) {
        setPriorCredits(previousPriorCredits);
        toast.error(error instanceof Error ? error.message : "Unable to save class grade.");
      } finally {
        setSavingGradeKey((current) => (current === course.sectionKey ? null : current));
      }
      return;
    }

    const schedule = mainSchedules.find((entry) => entry.id === term.scheduleId);
    if (!schedule || !schedule.term_code || !schedule.term_year) {
      toast.error("Unable to update the saved grade for this class.");
      return;
    }

    const previousSchedules = mainSchedules;
    const normalizedGrade = nextGradeValue === "__none__" ? undefined : normalizeGradeValue(nextGradeValue);
    const nextSelections = parseSelections(schedule.selections_json).map((selection) =>
      selection.sectionKey === course.sectionKey ? { ...selection, grade: normalizedGrade } : selection,
    );

    const optimisticSchedule: ScheduleWithSelections = {
      ...schedule,
      updated_at: new Date().toISOString(),
      selections_json: buildSelectionsPayload(nextSelections),
    };

    setSavingGradeKey(course.sectionKey);
    setMainSchedules((current) => current.map((entry) => (entry.id === schedule.id ? optimisticSchedule : entry)));

    try {
      const saved = await plannerApi.saveScheduleWithSelections({
        id: schedule.id,
        name: schedule.name,
        termCode: schedule.term_code,
        termYear: schedule.term_year,
        isPrimary: schedule.is_primary,
        selectionsJson: buildSelectionsPayload(nextSelections),
      });
      setMainSchedules((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)));
    } catch (error) {
      setMainSchedules(previousSchedules);
      toast.error(error instanceof Error ? error.message : "Unable to save class grade.");
    } finally {
      setSavingGradeKey((current) => (current === course.sectionKey ? null : current));
    }
  };

  const openScheduleInBuilder = (term: PlannedTerm) => {
    if (term.source !== "schedule") return;
    navigateToScheduleBuilder(term.scheduleId, term.termCode, term.termYear);
  };

  const navigateToScheduleBuilder = (scheduleId: string, termCode: string, termYear: number) => {
    navigate(`/schedule-builder?scheduleId=${encodeURIComponent(scheduleId)}&term=${termCode}-${termYear}`);
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl text-foreground mb-2">Four-Year Plan</h1>
            <p className="text-muted-foreground">
              Built from your saved MAIN schedules. Past terms count as completed, current term as in progress, and future terms as planned.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/schedules" data-tour-target="four-year-manage-main">
              <Button className="bg-red-600 hover:bg-red-700">Manage MAIN Schedules</Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6" data-tour-target="four-year-summary">
          <Card className="p-4 bg-card border-border">
            <div className="flex items-center gap-2 mb-2">
              <GraduationCap className="w-5 h-5 text-red-400" />
              <h3 className="text-sm text-muted-foreground">Total Credits</h3>
            </div>
            <p className="text-3xl text-foreground">{summary.totalCredits}</p>
          </Card>

          <Card className="p-4 bg-card border-border">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <h3 className="text-sm text-muted-foreground">Completed</h3>
            </div>
            <p className="text-3xl text-foreground">{summary.completedCredits}</p>
          </Card>

          <Card className="p-4 bg-card border-border">
            <div className="flex items-center gap-2 mb-2">
              <Clock3 className="w-5 h-5 text-blue-400" />
              <h3 className="text-sm text-muted-foreground">In Progress</h3>
            </div>
            <p className="text-3xl text-foreground">{summary.inProgressCredits}</p>
          </Card>

          <Card className="p-4 bg-card border-border">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <h3 className="text-sm text-muted-foreground">Planned</h3>
            </div>
            <p className="text-3xl text-foreground">{summary.plannedCredits}</p>
          </Card>

          <Card className="p-4 bg-card border-border">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm text-muted-foreground">Overall GPA</h3>
            </div>
            <p className="text-3xl text-foreground">{summary.overallGPA?.toFixed(3) ?? "-"}</p>
          </Card>
        </div>

        {academicGpaHistory.terms.length > 0 && (
          <Card className="p-4 bg-card border-border mb-6">
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <h2 className="text-base text-foreground">UMD GPA Details</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  Attempted: {academicGpaHistory.attemptedCredits.toFixed(2)} | Quality Points: {academicGpaHistory.qualityPoints.toFixed(3)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-border"
                  onClick={() => setShowGpaDetails((current) => !current)}
                >
                  {showGpaDetails ? (
                    <>
                      <ChevronUp className="w-4 h-4 mr-1" /> Hide
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4 mr-1" /> Show
                    </>
                  )}
                </Button>
              </div>
            </div>

            {showGpaDetails && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-border">
                      <th className="py-2 pr-3 text-muted-foreground font-medium">Term</th>
                      <th className="py-2 pr-3 text-muted-foreground font-medium">Attempted</th>
                      <th className="py-2 pr-3 text-muted-foreground font-medium">Quality Points</th>
                      <th className="py-2 pr-3 text-muted-foreground font-medium">Semester GPA</th>
                      <th className="py-2 text-muted-foreground font-medium">Cumulative GPA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {academicGpaHistory.terms.map((term) => (
                      <tr key={term.termLabel} className="border-b border-border/60 last:border-b-0">
                        <td className="py-2 pr-3 text-foreground">{term.termLabel}</td>
                        <td className="py-2 pr-3 text-foreground/90">{term.attemptedCredits.toFixed(2)}</td>
                        <td className="py-2 pr-3 text-foreground/90">{term.qualityPoints.toFixed(3)}</td>
                        <td className="py-2 pr-3 text-foreground/90">{term.semesterGPA?.toFixed(3) ?? "-"}</td>
                        <td className="py-2 text-foreground/90">{term.cumulativeGPA?.toFixed(3) ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {!loading && summary.duplicateCourseCount > 0 && (
          <Card className="p-3 mb-6 bg-amber-100 border-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30">
            <p className="text-sm text-amber-900 dark:text-amber-300">
              Duplicate credit notice: {summary.duplicateCourseCount} planned or in-progress course{summary.duplicateCourseCount === 1 ? "" : "s"} repeat credit you already earned.
              These repeated scheduled courses are flagged below and excluded from total credits.
            </p>
          </Card>
        )}

        {loading && <p className="text-muted-foreground">Loading four-year plan...</p>}
        {!loading && errorMessage && <p className="text-red-400">{errorMessage}</p>}

        {!loading && !errorMessage && visibleTerms.length === 0 && (
          <Card className="p-8 bg-card border-border text-center">
            <h2 className="text-xl text-foreground mb-2">No MAIN schedules yet</h2>
            <p className="text-muted-foreground mb-4">
              Set one schedule as MAIN for each term in All Schedules to build your four-year plan automatically.
            </p>
            <Link to="/schedules">
              <Button className="bg-red-600 hover:bg-red-700">Go To All Schedules</Button>
            </Link>
          </Card>
        )}

        <div className="space-y-5" data-tour-target="four-year-timeline">
          {visibleTerms.map((term) => {
            return (
              <Card key={term.id} className={`bg-card ${termCardAccent(term.status)}`}>
                <div className="px-5 pt-5 pb-3 border-b border-border/60 flex items-center justify-between gap-3 flex-wrap text-base md:text-lg">
                  <p className="text-foreground text-xl md:text-2xl">
                    {term.termLabel}
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="text-foreground/90">{term.credits} credits</span>
                    <span className={statusTextClass(term.status)}>{formatStatusLabel(term.status)}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-border"
                      onClick={() => openScheduleInBuilder(term)}
                      disabled={term.source !== "schedule"}
                    >
                      View
                    </Button>
                  </div>
                </div>

                <div className="px-5 pb-5">
                  {term.courses.length === 0 ? (
                    <p className="text-muted-foreground">No classes in this MAIN schedule.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left border-b border-border">
                            <th className="py-2 pr-3 text-muted-foreground font-medium">Course Code</th>
                            <th className="py-2 pr-3 text-muted-foreground font-medium">Section</th>
                            <th className="py-2 pr-3 text-muted-foreground font-medium">Course Full Name</th>
                            <th className="py-2 pr-3 text-muted-foreground font-medium">Credits</th>
                            <th className="py-2 pr-3 text-muted-foreground font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {term.courses.map((course) => {
                            const isDuplicate = duplicateScheduleSectionKeys.has(course.sectionKey);
                            const contributionLabels = getContributionLabelsForCourseCode(course.code, contributionMap);
                            const rowClass = contributionRowClass(contributionLabels);
                            return (
                              <tr
                                key={course.sectionKey}
                                className={`border-b border-border/60 hover:bg-popover/60 cursor-pointer ${rowClass}`}
                                onClick={() => setDetailCode(course.code)}
                              >
                                <td className="py-2 pr-3 text-foreground font-medium">{course.code}</td>
                                <td className="py-2 pr-3 text-foreground/90">{course.sectionCode}</td>
                                <td className="py-2 pr-3 text-foreground/90">{course.title}</td>
                                <td className="py-2 pr-3 text-foreground/90">{course.credits}</td>
                                <td className="py-2 pr-3">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {statusBadge(course.status)}
                                    {isDuplicate && (
                                      <Badge className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-600/20 dark:text-amber-300 dark:border-amber-500/40">
                                        Duplicate credit
                                      </Badge>
                                    )}
                                    {contributionLabels.slice(0, 2).map((label) => {
                                      return (
                                        <Badge
                                          key={`${course.sectionKey}-${label}`}
                                          className={`text-[10px] ${contributionBadgeClass(label)}`}
                                        >
                                          {label}
                                        </Badge>
                                      );
                                    })}
                                    {course.status === "completed" && (
                                      <Select
                                        value={course.grade ?? "__none__"}
                                        onValueChange={(value) => void handleScheduleGradeChange(term, course, value)}
                                        disabled={savingGradeKey === course.sectionKey}
                                      >
                                        <SelectTrigger
                                          className="h-7 w-[118px] bg-input-background border-border text-[11px]"
                                          onClick={(event) => event.stopPropagation()}
                                        >
                                          <SelectValue placeholder="Add grade" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__none__">No grade</SelectItem>
                                          {GRADE_OPTIONS.map((grade) => (
                                            <SelectItem key={grade} value={grade}>{grade}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="mt-3 text-right">
                    <span className="text-xs text-muted-foreground">
                      Last updated {new Date(term.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog open={Boolean(detailCode)} onOpenChange={(open) => {
        if (!open) setDetailCode(null);
      }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailData?.code ?? detailCode ?? "Course Details"}</DialogTitle>
            <DialogDescription>{detailData?.title ?? "Loading course details..."}</DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <p className="text-sm text-muted-foreground">Loading details...</p>
          ) : !detailData ? (
            <p className="text-sm text-muted-foreground">No detailed data found for this course.</p>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="p-3 bg-input-background border-border">
                  <p className="text-xs text-muted-foreground mb-1">Credits</p>
                  <p className="text-foreground">{detailData.credits || "-"}</p>
                </Card>
                <Card className="p-3 bg-input-background border-border sm:col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Gen Eds</p>
                  <p className="text-foreground">{detailData.genEds.length > 0 ? detailData.genEds.join(", ") : "None listed"}</p>
                </Card>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Description</p>
                <p className="text-foreground whitespace-pre-wrap">
                  <LinkedCourseText
                    text={detailData.description || "No description available."}
                    onCourseClick={(code) => setDetailCode(code.toUpperCase())}
                  />
                </p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Prerequisites</p>
                <p className="text-foreground whitespace-pre-wrap">
                  <LinkedCourseText
                    text={detailData.prereqs || "None listed."}
                    onCourseClick={(code) => setDetailCode(code.toUpperCase())}
                  />
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
