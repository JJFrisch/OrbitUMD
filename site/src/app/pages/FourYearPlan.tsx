import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Calendar, CheckCircle2, ChevronDown, ChevronUp, Clock3, GraduationCap, Info, X } from "lucide-react";
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
import { canonicalCourseCode } from "@/lib/requirements/courseCodeEquivalency";
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
import "./four-year-plan-template.css";

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

function genEdLabels(tags: string[]): string[] {
  return Array.from(new Set((tags ?? [])
    .map((tag) => String(tag ?? "").trim().toUpperCase())
    .filter((tag) => tag.length > 0)
    .map((tag) => tag)));
}

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
    return <span className="fyp-status-pill is-completed">Completed</span>;
  }
  if (status === "in_progress") {
    return <span className="fyp-status-pill is-in-progress">In Progress</span>;
  }
  return <span className="fyp-status-pill is-planned">Planned</span>;
}

function termCardAccent(status: AcademicProgressStatus): string {
  if (status === "completed") return "is-completed";
  if (status === "in_progress") return "is-in-progress";
  return "is-planned";
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
  if (status === "completed") return "fyp-status-text is-completed";
  if (status === "in_progress") return "fyp-status-text is-in-progress";
  return "fyp-status-text is-planned";
}

function getOfficialStanding(earnedCredits: number): "Freshman" | "Sophomore" | "Junior" | "Senior" {
  if (earnedCredits <= 29) return "Freshman";
  if (earnedCredits <= 59) return "Sophomore";
  if (earnedCredits <= 89) return "Junior";
  return "Senior";
}

function formatLastUpdated(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function defaultExpandedTermIds(terms: PlannedTerm[]): Set<string> {
  const defaults = new Set<string>();

  for (const term of terms) {
    if (term.status !== "completed") {
      defaults.add(term.id);
    }
  }

  const completedRegular = terms.filter((term) => term.status === "completed" && term.termLabel !== "Prior to UMD");
  const latestCompleted = completedRegular[completedRegular.length - 1];
  if (latestCompleted) {
    defaults.add(latestCompleted.id);
  }

  return defaults;
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
  const [showGpaInfo, setShowGpaInfo] = useState(false);
  const [showStandingInfo, setShowStandingInfo] = useState(false);
  const [hideDuplicateNotice, setHideDuplicateNotice] = useState(false);
  const [hideSubstitutionNotice, setHideSubstitutionNotice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingGradeKey, setSavingGradeKey] = useState<string | null>(null);
  const [mainSchedules, setMainSchedules] = useState<ScheduleWithSelections[]>([]);
  const [priorCredits, setPriorCredits] = useState<Awaited<ReturnType<typeof listUserPriorCredits>>>([]);
  const [requirementBundles, setRequirementBundles] = useState<ProgramRequirementBundle[]>([]);
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<CourseDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedTermIds, setExpandedTermIds] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    setExpandedTermIds((current) => {
      const availableIds = new Set(visibleTerms.map((term) => term.id));
      const retained = new Set(Array.from(current).filter((id) => availableIds.has(id)));

      if (retained.size > 0) {
        return retained;
      }

      return defaultExpandedTermIds(visibleTerms);
    });
  }, [visibleTerms]);

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

    const statusByCanonicalCode = new Map<string, AcademicProgressStatus>();
    for (const course of countedCourses) {
      const canonical = canonicalCourseCode(course.code);
      const existing = statusByCanonicalCode.get(canonical);
      if (!existing || statusRank(course.status) > statusRank(existing)) {
        statusByCanonicalCode.set(canonical, course.status);
      }
    }

    const math340Status = statusByCanonicalCode.get("MATH340");
    const math341Status = statusByCanonicalCode.get("MATH341");
    const hasMath340341Substitution = Boolean(math340Status && math341Status);
    const substitutionSuppressed = new Set(["MATH240", "MATH241", "MATH246"]);

    const coursesForTotals = hasMath340341Substitution
      ? countedCourses.filter((course) => !substitutionSuppressed.has(canonicalCourseCode(course.code)))
      : countedCourses;

    const completedCredits = coursesForTotals
      .filter((course) => course.status === "completed")
      .reduce((sum, course) => sum + course.credits, 0);
    const inProgressCredits = coursesForTotals
      .filter((course) => course.status === "in_progress")
      .reduce((sum, course) => sum + course.credits, 0);
    const plannedCredits = coursesForTotals
      .filter((course) => course.status === "planned")
      .reduce((sum, course) => sum + course.credits, 0);

    return {
      totalCredits: completedCredits + inProgressCredits + plannedCredits,
      completedCredits,
      inProgressCredits,
      plannedCredits,
      duplicateCourseCount: duplicateScheduleSectionKeys.size,
      mathSubstitutionActive: hasMath340341Substitution,
      mathSubstitutionSuppressedCount: hasMath340341Substitution
        ? countedCourses.filter((course) => substitutionSuppressed.has(canonicalCourseCode(course.code))).length
        : 0,
      overallGPA: academicGpaHistory.overallGPA,
    };
  }, [academicGpaHistory.overallGPA, duplicateScheduleSectionKeys, terms]);

  const officialStanding = useMemo(() => getOfficialStanding(summary.completedCredits), [summary.completedCredits]);

  const contributionMap = useMemo(() => buildCourseContributionMap(requirementBundles), [requirementBundles]);

  const primaryMajorLabel = useMemo(() => {
    const primaryMajorBundle = requirementBundles.find((bundle) => bundle.kind === "major");
    return primaryMajorBundle ? `Major: ${primaryMajorBundle.programName}` : null;
  }, [requirementBundles]);

  const getContributionCategory = (requirementLabels: string[], hasGenEd: boolean) => {
    const hasPrimaryMajor = Boolean(primaryMajorLabel && requirementLabels.includes(primaryMajorLabel));
    if (hasPrimaryMajor) return "primary_major" as const;
    if (requirementLabels.some((label) => label.startsWith("Major:"))) return "other_major" as const;
    if (requirementLabels.some((label) => label.startsWith("Minor:"))) return "minor" as const;
    if (hasGenEd) return "gen_ed" as const;
    return "none" as const;
  };

  const contributionBadgeClass = (label: string, isGenEdLabel = false) => {
    if (isGenEdLabel) {
      return "bg-yellow-100 text-yellow-900 dark:bg-yellow-500/20 dark:text-yellow-300";
    }

    if (label.startsWith("Minor:")) {
      return "border border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    }

    if (label.startsWith("Major:")) {
      if (primaryMajorLabel && label === primaryMajorLabel) {
        return "border border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300";
      }
      return "border border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300";
    }

    return "border border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  };

  const contributionRowClass = (requirementLabels: string[], hasGenEd: boolean) => {
    const category = getContributionCategory(requirementLabels, hasGenEd);
    if (category === "primary_major") return "bg-sky-500/10 border-l-4 border-sky-500";
    if (category === "other_major") return "bg-orange-500/10 border-l-4 border-orange-500";
    if (category === "minor") return "bg-emerald-500/10 border-l-4 border-emerald-500";
    if (category === "gen_ed") return "bg-yellow-100/60 dark:bg-yellow-500/10 border-l-4 border-slate-400";
    return "";
  };

  const getCourseSortRank = (course: PlannedCourse): number => {
    const requirementLabels = getContributionLabelsForCourseCode(course.code, contributionMap);
    const category = getContributionCategory(requirementLabels, genEdLabels(course.tags).length > 0);
    if (category === "primary_major") return 0;
    if (category === "other_major") return 1;
    if (category === "minor") return 2;
    if (category === "gen_ed") return 3;
    return 4;
  };

  const sortCoursesForDisplay = (courses: PlannedCourse[]): PlannedCourse[] => {
    return [...courses].sort((a, b) => {
      const rankDiff = getCourseSortRank(a) - getCourseSortRank(b);
      if (rankDiff !== 0) return rankDiff;
      return a.code.localeCompare(b.code);
    });
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

  const toggleTermExpanded = (termId: string) => {
    setExpandedTermIds((current) => {
      const next = new Set(current);
      if (next.has(termId)) {
        next.delete(termId);
      } else {
        next.add(termId);
      }
      return next;
    });
  };

  const navigateToScheduleBuilder = (scheduleId: string, termCode: string, termYear: number) => {
    navigate(`/schedule-builder?scheduleId=${encodeURIComponent(scheduleId)}&term=${termCode}-${termYear}`);
  };

  return (
    <div className="fyp-page">
      <div className="fyp-shell">
        <header className="fyp-header">
          <div>
            <h1 className="fyp-title">Four-Year Plan</h1>
            <p className="fyp-subtitle">
              Built from your saved MAIN schedules. Past terms are Completed, current term is In Progress, and future terms are Planned.
            </p>
          </div>

          <div className="fyp-actions">
            <Button
              type="button"
              variant="outline"
              className="border-border"
              onClick={() => setShowGpaInfo(true)}
              aria-label="Explain how UMD GPA is calculated"
            >
              <Info className="w-4 h-4 mr-1" />
              GPA Info
            </Button>
            <Link to="/schedules" data-tour-target="four-year-manage-main">
              <Button className="bg-red-600 hover:bg-red-700">Manage MAIN Schedules</Button>
            </Link>
          </div>

          <div className="fyp-badges">
            <span className="fyp-badge is-red">Source: MAIN schedules</span>
            <span className="fyp-badge">Standing: {officialStanding}</span>
            <span className="fyp-badge">Terms: {visibleTerms.length}</span>
            <span className="fyp-badge is-gold">Duplicates excluded: {summary.duplicateCourseCount}</span>
          </div>
        </header>

        <section className="fyp-section" data-tour-target="four-year-summary">
          <div className="fyp-section-head">
            <h2>Credit Summary</h2>
            <p>Totals are calculated from counted credits and exclude flagged duplicate-repeat credit.</p>
          </div>

          <div className="fyp-kpi-grid">
            <div className="fyp-kpi-card">
              <div className="fyp-kpi-label"><GraduationCap className="w-4 h-4" /> Total Credits</div>
              <div className="fyp-kpi-value">{summary.totalCredits}</div>
            </div>

            <div className="fyp-kpi-card">
              <div className="fyp-kpi-label"><CheckCircle2 className="w-4 h-4" /> Completed</div>
              <div className="fyp-kpi-value">{summary.completedCredits}</div>
              <div className="fyp-kpi-sub">
                Standing: {officialStanding}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => setShowStandingInfo(true)}
                  aria-label="Explain class standing thresholds"
                >
                  <Info className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="fyp-kpi-card">
              <div className="fyp-kpi-label"><Clock3 className="w-4 h-4" /> In Progress</div>
              <div className="fyp-kpi-value">{summary.inProgressCredits}</div>
            </div>

            <div className="fyp-kpi-card">
              <div className="fyp-kpi-label"><Calendar className="w-4 h-4" /> Planned</div>
              <div className="fyp-kpi-value">{summary.plannedCredits}</div>
            </div>

            <div className="fyp-kpi-card">
              <div className="fyp-kpi-label"><CheckCircle2 className="w-4 h-4" /> Overall GPA</div>
              <div className="fyp-kpi-value">{summary.overallGPA?.toFixed(3) ?? "-"}</div>
            </div>
          </div>
        </section>

        <section className="fyp-section">
          <div className="fyp-section-head">
            <h2>UMD GPA Details</h2>
            <div className="fyp-inline-actions">
              <span className="fyp-muted">
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

          {showGpaDetails && academicGpaHistory.terms.length > 0 && (
            <div className="fyp-table-wrap">
              <table className="fyp-table">
                <thead>
                  <tr>
                    <th scope="col">Term</th>
                    <th scope="col">Attempted</th>
                    <th scope="col">Quality Points</th>
                    <th scope="col">Semester GPA</th>
                    <th scope="col">Cumulative GPA</th>
                  </tr>
                </thead>
                <tbody>
                  {academicGpaHistory.terms.map((term) => (
                    <tr key={term.termLabel}>
                      <td>{term.termLabel}</td>
                      <td>{term.attemptedCredits.toFixed(2)}</td>
                      <td>{term.qualityPoints.toFixed(3)}</td>
                      <td>{term.semesterGPA?.toFixed(3) ?? "-"}</td>
                      <td>{term.cumulativeGPA?.toFixed(3) ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showGpaDetails && academicGpaHistory.terms.length === 0 && (
            <p className="fyp-muted">
              No graded completed courses are available yet. GPA details will appear after transcript or completed-term grades are present.
            </p>
          )}
        </section>

        {!loading && summary.duplicateCourseCount > 0 && !hideDuplicateNotice && (
          <section className="fyp-callout is-warning">
            <p>
              Duplicate credit notice: {summary.duplicateCourseCount} planned or in-progress course{summary.duplicateCourseCount === 1 ? "" : "s"} repeat credit already earned.
              These repeated scheduled courses are flagged below and excluded from total counted credits.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setHideDuplicateNotice(true)}
              aria-label="Dismiss duplicate credit notice"
            >
              <X className="h-4 w-4" />
            </Button>
          </section>
        )}

        {!loading && summary.mathSubstitutionActive && !hideSubstitutionNotice && (
          <section className="fyp-callout is-info">
            <p>
              Substitution notice: MATH340 + MATH341 satisfies the MATH240/241/246 sequence.
              {summary.mathSubstitutionSuppressedCount > 0
                ? ` ${summary.mathSubstitutionSuppressedCount} MATH240/241/246 course${summary.mathSubstitutionSuppressedCount === 1 ? " was" : "s were"} excluded from totals to avoid double counting.`
                : " MATH240/241/246 are excluded from totals when this substitution is active to avoid double counting."}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setHideSubstitutionNotice(true)}
              aria-label="Dismiss substitution notice"
            >
              <X className="h-4 w-4" />
            </Button>
          </section>
        )}

        {loading && <section className="fyp-section"><p className="fyp-muted">Loading four-year plan...</p></section>}
        {!loading && errorMessage && <section className="fyp-section"><p className="fyp-error">{errorMessage}</p></section>}

        {!loading && !errorMessage && visibleTerms.length === 0 && (
          <section className="fyp-section fyp-empty">
            <h2>No MAIN schedules yet</h2>
            <p className="fyp-muted">
              Set one schedule as MAIN for each term in All Schedules to build your four-year plan automatically.
            </p>
            <Link to="/schedules">
              <Button className="bg-red-600 hover:bg-red-700">Go To All Schedules</Button>
            </Link>
          </section>
        )}

        {!loading && !errorMessage && visibleTerms.length > 0 && (
          <section className="fyp-section" data-tour-target="four-year-timeline">
            <div className="fyp-section-head">
              <h2>Term Timeline</h2>
              <p>Course rows include status, major/minor/gen-ed tags, and duplicate credit flags.</p>
            </div>

            <div className="fyp-term-list">
              {visibleTerms.map((term) => {
                const isExpanded = expandedTermIds.has(term.id);
                const duplicateCount = term.courses.filter((course) => duplicateScheduleSectionKeys.has(course.sectionKey)).length;
                const countedCredits = term.courses
                  .filter((course) => course.countsTowardProgress && !duplicateScheduleSectionKeys.has(course.sectionKey))
                  .reduce((sum, course) => sum + course.credits, 0);

                return (
                  <article key={term.id} className={`fyp-term-card ${termCardAccent(term.status)}`}>
                    <header className="fyp-term-header">
                      <div className="fyp-term-title-wrap">
                        <h3 className="fyp-term-title">{term.termLabel}</h3>
                        <p className="fyp-term-meta">Last updated {formatLastUpdated(term.updatedAt)}</p>
                      </div>

                      <div className="fyp-term-right">
                        <span className="fyp-term-credits">{countedCredits} counted credits</span>
                        {duplicateCount > 0 && (
                          <Badge className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-600/20 dark:text-amber-300 dark:border-amber-500/40">
                            {duplicateCount} duplicate {duplicateCount === 1 ? "course" : "courses"} excluded
                          </Badge>
                        )}
                        <span className={statusTextClass(term.status)}>{formatStatusLabel(term.status)}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-border"
                          onClick={() => toggleTermExpanded(term.id)}
                          aria-expanded={isExpanded}
                          aria-controls={`term-panel-${term.id}`}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
                          {isExpanded ? "Hide" : "View"}
                        </Button>
                        {term.source === "schedule" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-border"
                            onClick={() => openScheduleInBuilder(term)}
                          >
                            Open
                          </Button>
                        )}
                      </div>
                    </header>

                    <div id={`term-panel-${term.id}`} className="fyp-term-panel">
                      {!isExpanded && (
                        <p className="fyp-muted">
                          {term.courses.length} course{term.courses.length === 1 ? "" : "s"} hidden. Choose View to inspect course-level tags, status, and duplicate flags.
                        </p>
                      )}

                      {isExpanded && (
                        <>
                          {term.courses.length === 0 ? (
                            <p className="fyp-muted">No classes in this MAIN schedule.</p>
                          ) : (
                            <div className="fyp-table-wrap">
                              <table className="fyp-table">
                                <thead>
                                  <tr>
                                    <th scope="col">Course Code</th>
                                    <th scope="col">Section</th>
                                    <th scope="col">Course Full Name</th>
                                    <th scope="col">Credits</th>
                                    <th scope="col">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sortCoursesForDisplay(term.courses).map((course) => {
                                    const isDuplicate = duplicateScheduleSectionKeys.has(course.sectionKey);
                                    const requirementLabels = getContributionLabelsForCourseCode(course.code, contributionMap);
                                    const genEdContributionLabels = genEdLabels(course.tags);
                                    const genEdLabelSet = new Set(genEdContributionLabels);
                                    const contributionLabels = [...requirementLabels, ...genEdContributionLabels];
                                    const rowClass = contributionRowClass(requirementLabels, genEdContributionLabels.length > 0);
                                    return (
                                      <tr
                                        key={course.sectionKey}
                                        className={`${rowClass} ${isDuplicate ? "opacity-70" : ""}`}
                                        onClick={() => setDetailCode(course.code)}
                                      >
                                        <td className="fyp-code-cell">{course.code}</td>
                                        <td>{course.sectionCode}</td>
                                        <td>{course.title}</td>
                                        <td>{course.credits}</td>
                                        <td>
                                          <div className="flex items-center gap-2 flex-wrap">
                                            {statusBadge(course.status)}
                                            {isDuplicate && (
                                              <Badge className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-600/20 dark:text-amber-300 dark:border-amber-500/40">
                                                Duplicate credit
                                              </Badge>
                                            )}
                                            {contributionLabels.slice(0, 2).map((label) => (
                                              <Badge
                                                key={`${course.sectionKey}-${label}`}
                                                className={`text-[10px] ${contributionBadgeClass(label, genEdLabelSet.has(label))}`}
                                              >
                                                {label}
                                              </Badge>
                                            ))}
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

                          <p className="fyp-term-footnote">
                            Term total: {term.credits} raw credits • Counted toward progress: {countedCredits}
                          </p>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
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

      <Dialog open={showStandingInfo} onOpenChange={setShowStandingInfo}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>UMD Class Standing Thresholds</DialogTitle>
            <DialogDescription>
              Official undergraduate standing is based on total earned credit hours.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <ul className="space-y-1 text-foreground">
              <li>0-29 credits: Freshman</li>
              <li>30-59 credits: Sophomore</li>
              <li>60-89 credits: Junior</li>
              <li>90+ credits: Senior</li>
            </ul>
            <p className="text-muted-foreground">
              CMNS/ELMS may split Seniors into 90-103 and 104+, but this page uses the official university-wide standing brackets.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showGpaInfo} onOpenChange={setShowGpaInfo}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>How UMD GPA Is Calculated Here</DialogTitle>
            <DialogDescription>
              OrbitUMD uses UMD-style grade points and transcript-quality points to compute GPA summaries.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm text-foreground">
            <p>
              UMD GPA is calculated as Quality Points divided by Attempted Credits for grade-bearing courses.
            </p>
            <p>
              Attempted Credits and Quality Points shown in this page come from imported prior/transcript credit plus completed-term schedule grades when available.
            </p>
            <p>
              Courses with non-GPA grades (for example P, S, W, I, AUD) are excluded from GPA point calculations under UMD policy.
            </p>
            <p className="text-muted-foreground">
              Use Show in the UMD GPA Details section to inspect term-by-term attempted credits, quality points, semester GPA, and cumulative GPA.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
