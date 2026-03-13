import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowUpDown, Calendar, CheckCircle2, ChevronDown, ChevronUp, Clock3, GraduationCap } from "lucide-react";
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
import { plannerApi } from "@/lib/api/planner";
import type { ScheduleWithSelections } from "@/lib/repositories/userSchedulesRepository";
import type { ScheduleSelection } from "@/features/coursePlanner/types/coursePlanner";
import { listUserDegreePrograms } from "@/lib/repositories/degreeProgramsRepository";
import { listUserPriorCredits, updatePriorCredit } from "@/lib/repositories/priorCreditsRepository";
import { getAcademicProgressStatus, compareAcademicTerms, type AcademicProgressStatus } from "@/lib/scheduling/termProgress";
import { calculateTranscriptGPAHistory } from "@/lib/transcripts/gpa";
import {
  buildCourseContributionMap,
  getContributionLabelsForCourseCode,
  loadProgramRequirementBundles,
  type ProgramRequirementBundle,
} from "@/lib/requirements/audit";
import { useTheme } from "../contexts/ThemeContext";

type SortOrder = "current" | "ascending" | "descending";

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
  if (status === "completed") return "border-green-600/30";
  if (status === "in_progress") return "border-blue-600/35 shadow-lg shadow-blue-900/10";
  return "border-border";
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
    const creditCodes = String(credit.umdCourseCode ?? "")
      .split(/[|,]/)
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    const normalizedCodes = creditCodes.length > 0
      ? creditCodes
      : [`NO UMD CREDIT ${String(credit.id).slice(0, 8).toUpperCase()}`];

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

export default function FourYearPlan() {
  const { theme } = useTheme();
  const [sortOrder, setSortOrder] = useState<SortOrder>("current");
  const [collapsedTerms, setCollapsedTerms] = useState<Set<string>>(new Set());
  const [showContributionHighlight, setShowContributionHighlight] = useState(true);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingGradeKey, setSavingGradeKey] = useState<string | null>(null);
  const [mainSchedules, setMainSchedules] = useState<ScheduleWithSelections[]>([]);
  const [priorCredits, setPriorCredits] = useState<Awaited<ReturnType<typeof listUserPriorCredits>>>([]);
  const [requirementBundles, setRequirementBundles] = useState<ProgramRequirementBundle[]>([]);

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
      .filter((term): term is PlannedTerm => term !== null);

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
    if (sortOrder === "ascending") {
      return [...terms];
    }

    if (sortOrder === "descending") {
      return [...terms].reverse();
    }

    const current = terms.filter((term) => term.status === "in_progress");
    const future = terms.filter((term) => term.status === "planned");
    const completed = terms.filter((term) => term.status === "completed");
    return [...current, ...future, ...completed];
  }, [sortOrder, terms]);

  const contributionMap = useMemo(() => buildCourseContributionMap(requirementBundles), [requirementBundles]);

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

  const toggleTerm = (termId: string) => {
    const next = new Set(collapsedTerms);
    if (next.has(termId)) {
      next.delete(termId);
    } else {
      next.add(termId);
    }
    setCollapsedTerms(next);
  };

  const contributionPalette = theme === "dark"
    ? [
        { border: "#0ea5e9", bg: "rgba(14,165,233,0.16)", text: "#7dd3fc" },
        { border: "#f97316", bg: "rgba(249,115,22,0.16)", text: "#fdba74" },
        { border: "#22c55e", bg: "rgba(34,197,94,0.16)", text: "#86efac" },
        { border: "#e11d48", bg: "rgba(225,29,72,0.16)", text: "#fda4af" },
        { border: "#f59e0b", bg: "rgba(245,158,11,0.16)", text: "#fcd34d" },
      ] as const
    : [
        { border: "#0284c7", bg: "#e0f2fe", text: "#0c4a6e" },
        { border: "#ea580c", bg: "#ffedd5", text: "#7c2d12" },
        { border: "#16a34a", bg: "#dcfce7", text: "#14532d" },
        { border: "#e11d48", bg: "#ffe4e6", text: "#881337" },
        { border: "#d97706", bg: "#fef3c7", text: "#78350f" },
      ] as const;

  const contributionBadgeStyle = (label: string) => {
    const index = Math.abs(label.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0)) % contributionPalette.length;
    return contributionPalette[index];
  };

  const contributionCardStyle = (labels: string[]) => {
    if (!showContributionHighlight || labels.length === 0) return {};
    const styles = labels.map((label) => contributionBadgeStyle(label));

    if (styles.length === 1) {
      return {
        borderColor: styles[0].border,
        backgroundColor: styles[0].bg,
      };
    }

    const segments = styles.map((style, idx) => {
      const start = Math.round((idx / styles.length) * 100);
      const end = Math.round(((idx + 1) / styles.length) * 100);
      return `${style.border} ${start}% ${end}%`;
    });

    return {
      borderColor: "transparent",
      borderImage: `linear-gradient(90deg, ${segments.join(", ")}) 1`,
      backgroundColor: theme === "dark" ? "rgba(38, 38, 38, 0.92)" : "#f8fafc",
    };
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

          <Link to="/schedules">
            <Button className="bg-red-600 hover:bg-red-700">Manage MAIN Schedules</Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
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
              <span className="text-xs text-muted-foreground">
                Attempted: {academicGpaHistory.attemptedCredits.toFixed(2)} | Quality Points: {academicGpaHistory.qualityPoints.toFixed(3)}
              </span>
            </div>

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

        <Card className="p-4 bg-card border-border mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground/80">Sort Terms</span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className={`border-border ${showContributionHighlight ? "bg-cyan-100 text-cyan-900 dark:bg-transparent dark:text-cyan-300" : "text-foreground/80"}`}
                onClick={() => setShowContributionHighlight((current) => !current)}
              >
                {showContributionHighlight ? "Contribution Highlight: On" : "Contribution Highlight: Off"}
              </Button>

              <Select value={sortOrder} onValueChange={(value: SortOrder) => setSortOrder(value)}>
                <SelectTrigger className="w-56 bg-input-background border-border">
                <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Current First</SelectItem>
                  <SelectItem value="ascending">Ascending (Oldest First)</SelectItem>
                  <SelectItem value="descending">Descending (Newest First)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

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

        <div className="space-y-5">
          {visibleTerms.map((term) => {
            const isCollapsed = collapsedTerms.has(term.id);
            return (
              <Card key={term.id} className={`bg-card ${termCardAccent(term.status)}`}>
                <div
                  className="p-5 cursor-pointer hover:bg-popover transition-colors"
                  onClick={() => toggleTerm(term.id)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-xl text-foreground">{term.termLabel}</h3>
                      <Badge variant="outline" className="border-border">{term.credits} credits</Badge>
                      {statusBadge(term.status)}
                      <Badge variant="outline" className="border-border text-foreground/80">{term.source === "schedule" ? `MAIN: ${term.scheduleName}` : term.scheduleName}</Badge>
                      {typeof term.semesterGPA === "number" && (
                        <Badge variant="outline" className="border-border text-foreground/80">Semester GPA {term.semesterGPA.toFixed(3)}</Badge>
                      )}
                      {typeof term.cumulativeGPA === "number" && (
                        <Badge variant="outline" className="border-border text-foreground/80">Cumulative GPA {term.cumulativeGPA.toFixed(3)}</Badge>
                      )}
                    </div>
                    {isCollapsed ? (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronUp className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="px-5 pb-5">
                    {term.courses.length === 0 ? (
                      <p className="text-muted-foreground">No classes in this MAIN schedule.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                        {term.courses.map((course) => (
                          (() => {
                            const contributionLabels = getContributionLabelsForCourseCode(course.code, contributionMap);
                            const isDuplicate = duplicateScheduleSectionKeys.has(course.sectionKey);
                            const countsTowardProgress = course.countsTowardProgress && !isDuplicate;
                            const visibleContributionLabels = countsTowardProgress ? contributionLabels : [];
                            const cardStyle = contributionCardStyle(visibleContributionLabels);
                            return (
                          <Card
                            key={course.sectionKey}
                            className={`p-2 border ${
                              course.status === "completed"
                                ? "border-green-600/40 bg-green-600/10"
                                : course.status === "in_progress"
                                  ? "border-blue-600/40 bg-blue-600/10"
                                  : "border-border bg-accent/40"
                            }`}
                            style={cardStyle}
                          >
                            <div className="flex items-start justify-between gap-2 mb-0.5">
                              <h4 className="text-foreground font-medium text-sm leading-tight">{course.code} - {course.sectionCode}</h4>
                              <Badge variant="outline" className="border-border text-xs">{course.credits}cr</Badge>
                            </div>
                            <p className="text-[11px] text-foreground/80 mb-0.5 leading-tight line-clamp-1">{course.title}</p>
                            {course.status === "completed" ? (
                              <div className="mb-1 flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground">Grade</span>
                                <Select
                                  value={course.grade ?? "__none__"}
                                  onValueChange={(value) => void handleScheduleGradeChange(term, course, value)}
                                  disabled={savingGradeKey === course.sectionKey}
                                >
                                  <SelectTrigger className="h-7 w-[118px] bg-input-background border-border text-[11px]">
                                    <SelectValue placeholder="Add grade" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">No grade</SelectItem>
                                    {GRADE_OPTIONS.map((grade) => (
                                      <SelectItem key={grade} value={grade}>{grade}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {savingGradeKey === course.sectionKey && <span className="text-[10px] text-muted-foreground">Saving...</span>}
                              </div>
                            ) : course.grade ? (
                              <p className="text-[10px] text-muted-foreground mb-1 leading-tight">Grade {course.grade}</p>
                            ) : null}

                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex flex-wrap gap-1">
                                {isDuplicate && (
                                  <Badge className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-600/20 dark:text-amber-300 dark:border-amber-500/40">
                                    Duplicate credit
                                  </Badge>
                                )}
                                {!countsTowardProgress && (
                                  <Badge className="text-[10px] bg-slate-200 text-slate-900 border border-slate-300 dark:bg-slate-600/20 dark:text-slate-300 dark:border-slate-500/40">
                                    Does not count
                                  </Badge>
                                )}
                                {course.tags.slice(0, 2).map((tag) => (
                                  <Badge key={`${course.sectionKey}-${tag}`} className="bg-red-100 text-red-900 border border-red-300 text-xs dark:bg-red-600/20 dark:text-red-300 dark:border-red-600/30">
                                    {tag}
                                  </Badge>
                                ))}

                                {showContributionHighlight && visibleContributionLabels.slice(0, 2).map((label) => {
                                  const palette = contributionBadgeStyle(label);
                                  return (
                                    <Badge
                                      key={`${course.sectionKey}-${label}`}
                                      className="text-xs border"
                                      style={{
                                        color: palette.text,
                                        borderColor: palette.border,
                                        backgroundColor: palette.bg,
                                      }}
                                    >
                                      {label}
                                    </Badge>
                                  );
                                })}
                              </div>
                              {statusBadge(course.status)}
                            </div>
                          </Card>
                            );
                          })()
                        ))}
                      </div>
                    )}

                    <div className="mt-3 text-right">
                      <span className="text-xs text-muted-foreground">
                        Last updated {new Date(term.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
