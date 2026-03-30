import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronDown, ChevronUp, Info, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../components/ui/card";
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

function getOfficialStanding(earnedCredits: number): "Freshman" | "Sophomore" | "Junior" | "Senior" {
  if (earnedCredits <= 29) return "Freshman";
  if (earnedCredits <= 59) return "Sophomore";
  if (earnedCredits <= 89) return "Junior";
  return "Senior";
}

const MAX_CREDITS = { past: 16, current: 15, future: 18 } as const;
const FILL_CLASS = { past: "fill-done", current: "fill-cur", future: "fill-plan" } as const;

function boardTermState(status: AcademicProgressStatus): "past" | "current" | "future" {
  if (status === "completed") return "past";
  if (status === "in_progress") return "current";
  return "future";
}

function boardCourseType(status: AcademicProgressStatus): "completed" | "in-progress" | "planned" {
  if (status === "completed") return "completed";
  if (status === "in_progress") return "in-progress";
  return "planned";
}

function boardCourseCodeColor(status: AcademicProgressStatus): "red" | "gold" | "gray" {
  if (status === "completed") return "red";
  if (status === "in_progress") return "gold";
  return "gray";
}

function creditLoadWidthClass(pct: number): "load-20" | "load-40" | "load-60" | "load-80" | "load-100" {
  if (pct >= 95) return "load-100";
  if (pct >= 75) return "load-80";
  if (pct >= 55) return "load-60";
  if (pct >= 35) return "load-40";
  return "load-20";
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
  const [courseTermOverrides, setCourseTermOverrides] = useState<Record<string, string>>({});
  const [draggingCourseKey, setDraggingCourseKey] = useState<string | null>(null);
  const [dragOverTermId, setDragOverTermId] = useState<string | null>(null);
  const [movingCourseKey, setMovingCourseKey] = useState<string | null>(null);

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

  const navigateToScheduleBuilder = (scheduleId: string, termCode: string, termYear: number) => {
    navigate(`/schedule-builder?scheduleId=${encodeURIComponent(scheduleId)}&term=${termCode}-${termYear}`);
  };

  const boardTerms = useMemo(() => {
    const priorToUmd = terms.filter((term) => term.termLabel === "Prior to UMD");
    const academicTerms = terms.filter((term) => term.termLabel !== "Prior to UMD");
    return [...academicTerms, ...priorToUmd];
  }, [terms]);

  const originalTermByCourseSectionKey = useMemo(() => {
    const mapping = new Map<string, PlannedTerm>();
    for (const term of boardTerms) {
      for (const course of term.courses) {
        mapping.set(course.sectionKey, term);
      }
    }
    return mapping;
  }, [boardTerms]);

  const termById = useMemo(() => {
    return new Map(boardTerms.map((term) => [term.id, term]));
  }, [boardTerms]);

  const mainScheduleById = useMemo(() => {
    return new Map(mainSchedules.map((schedule) => [schedule.id, schedule]));
  }, [mainSchedules]);

  useEffect(() => {
    setCourseTermOverrides((current) => {
      const validCourseKeys = new Set(originalTermByCourseSectionKey.keys());
      const validTermIds = new Set(boardTerms.map((term) => term.id));
      let hasChanges = false;
      const next: Record<string, string> = {};

      for (const [courseKey, termId] of Object.entries(current)) {
        if (validCourseKeys.has(courseKey) && validTermIds.has(termId)) {
          next[courseKey] = termId;
        } else {
          hasChanges = true;
        }
      }

      return hasChanges ? next : current;
    });
  }, [boardTerms, originalTermByCourseSectionKey]);

  const displayedCoursesByTerm = useMemo(() => {
    const grouped = new Map<string, PlannedCourse[]>();
    for (const term of boardTerms) {
      grouped.set(term.id, []);
    }

    for (const term of boardTerms) {
      for (const course of term.courses) {
        const targetTermId = courseTermOverrides[course.sectionKey] ?? term.id;
        if (!grouped.has(targetTermId)) {
          continue;
        }
        grouped.get(targetTermId)?.push(course);
      }
    }

    for (const [termId, courses] of grouped.entries()) {
      grouped.set(termId, sortCoursesForDisplay(courses));
    }

    return grouped;
  }, [boardTerms, courseTermOverrides, sortCoursesForDisplay]);

  const handleCourseDragStart = (event: DragEvent<HTMLElement>, sectionKey: string) => {
    if (movingCourseKey) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", sectionKey);
    setDraggingCourseKey(sectionKey);
  };

  const handleCourseDragEnd = () => {
    setDraggingCourseKey(null);
    setDragOverTermId(null);
  };

  const handleTermDragOver = (event: DragEvent<HTMLElement>, termId: string, canDrop: boolean) => {
    if (!draggingCourseKey || !canDrop || movingCourseKey) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverTermId(termId);
  };

  const handleTermDrop = async (event: DragEvent<HTMLElement>, targetTermId: string) => {
    event.preventDefault();
    if (movingCourseKey) {
      return;
    }

    const droppedSectionKey = event.dataTransfer.getData("text/plain") || draggingCourseKey;
    if (!droppedSectionKey) {
      return;
    }

    const baseSourceTerm = originalTermByCourseSectionKey.get(droppedSectionKey);
    if (!baseSourceTerm) {
      setDragOverTermId(null);
      setDraggingCourseKey(null);
      return;
    }

    const currentSourceTermId = courseTermOverrides[droppedSectionKey] ?? baseSourceTerm.id;
    if (currentSourceTermId === targetTermId) {
      setDragOverTermId(null);
      setDraggingCourseKey(null);
      return;
    }

    const sourceTerm = termById.get(currentSourceTermId);
    const targetTerm = termById.get(targetTermId);

    if (!sourceTerm || !targetTerm || sourceTerm.source !== "schedule" || targetTerm.source !== "schedule") {
      toast.error("Courses can only be moved between MAIN schedule terms.");
      setDragOverTermId(null);
      setDraggingCourseKey(null);
      return;
    }

    const sourceSchedule = mainScheduleById.get(sourceTerm.scheduleId);
    const targetSchedule = mainScheduleById.get(targetTerm.scheduleId);
    if (!sourceSchedule || !targetSchedule || !sourceSchedule.term_code || !sourceSchedule.term_year || !targetSchedule.term_code || !targetSchedule.term_year) {
      toast.error("Unable to move this course right now.");
      setDragOverTermId(null);
      setDraggingCourseKey(null);
      return;
    }

    const sourceSelections = parseSelections(sourceSchedule.selections_json);
    const targetSelections = parseSelections(targetSchedule.selections_json);
    const movedSelection = sourceSelections.find((selection) => selection.sectionKey === droppedSectionKey);

    if (!movedSelection) {
      toast.error("Unable to locate the selected course in its source term.");
      setDragOverTermId(null);
      setDraggingCourseKey(null);
      return;
    }

    const nextSourceSelections = sourceSelections.filter((selection) => selection.sectionKey !== droppedSectionKey);
    const nextTargetSelections = [
      ...targetSelections.filter((selection) => selection.sectionKey !== droppedSectionKey),
      movedSelection,
    ];

    const previousSchedules = mainSchedules;
    const previousOverrides = courseTermOverrides;

    setMovingCourseKey(droppedSectionKey);
    setCourseTermOverrides((current) => ({ ...current, [droppedSectionKey]: targetTermId }));
    setMainSchedules((current) => current.map((entry) => {
      if (entry.id === sourceSchedule.id) {
        return {
          ...entry,
          updated_at: new Date().toISOString(),
          selections_json: buildSelectionsPayload(nextSourceSelections),
        };
      }
      if (entry.id === targetSchedule.id) {
        return {
          ...entry,
          updated_at: new Date().toISOString(),
          selections_json: buildSelectionsPayload(nextTargetSelections),
        };
      }
      return entry;
    }));

    try {
      const [savedSource, savedTarget] = await Promise.all([
        plannerApi.saveScheduleWithSelections({
          id: sourceSchedule.id,
          name: sourceSchedule.name,
          termCode: sourceSchedule.term_code,
          termYear: sourceSchedule.term_year,
          isPrimary: sourceSchedule.is_primary,
          selectionsJson: buildSelectionsPayload(nextSourceSelections),
        }),
        plannerApi.saveScheduleWithSelections({
          id: targetSchedule.id,
          name: targetSchedule.name,
          termCode: targetSchedule.term_code,
          termYear: targetSchedule.term_year,
          isPrimary: targetSchedule.is_primary,
          selectionsJson: buildSelectionsPayload(nextTargetSelections),
        }),
      ]);

      setMainSchedules((current) => current.map((entry) => {
        if (entry.id === savedSource.id) return savedSource;
        if (entry.id === savedTarget.id) return savedTarget;
        return entry;
      }));

      setCourseTermOverrides((current) => {
        if (!(droppedSectionKey in current)) {
          return current;
        }
        const next = { ...current };
        delete next[droppedSectionKey];
        return next;
      });
    } catch (error) {
      setMainSchedules(previousSchedules);
      setCourseTermOverrides(previousOverrides);
      toast.error(error instanceof Error ? error.message : "Unable to move course between terms.");
    } finally {
      setMovingCourseKey((current) => (current === droppedSectionKey ? null : current));
      setDragOverTermId(null);
      setDraggingCourseKey(null);
    }
  };

  const remainingCredits = Math.max(0, 120 - summary.totalCredits);

  return (
    <div className="fyp-page">
      <div className="shell">
        <div className="main">
          <div className="topbar">
            <div className="topbar-left">
              <h2>Four-Year Plan</h2>
              <p>Drag-ready board view grouped by term. Courses are listed vertically inside each semester column.</p>
            </div>
            <div className="topbar-right">
              <button type="button" className="topbar-btn" onClick={() => setShowGpaInfo(true)} aria-label="Explain how UMD GPA is calculated">
                <Info size={13} />
                GPA Info
              </button>
              <button type="button" className="topbar-btn" onClick={() => setShowGpaDetails((current) => !current)}>
                {showGpaDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                {showGpaDetails ? "Hide GPA details" : "Show GPA details"}
              </button>
              <Link to="/schedules" className="topbar-btn primary" data-tour-target="four-year-manage-main">
                Manage MAIN schedules
              </Link>
            </div>
          </div>

          <div className="progress-strip" data-tour-target="four-year-summary">
            <div className="ps-item"><div className="ps-dot is-completed" /><span className="ps-label">Completed</span><span className="ps-val">{summary.completedCredits} cr</span></div>
            <div className="ps-divider" />
            <div className="ps-item"><div className="ps-dot is-progress" /><span className="ps-label">In Progress</span><span className="ps-val">{summary.inProgressCredits} cr</span></div>
            <div className="ps-divider" />
            <div className="ps-item"><div className="ps-dot is-planned" /><span className="ps-label">Planned</span><span className="ps-val">{summary.plannedCredits} cr</span></div>
            <div className="ps-divider" />
            <div className="ps-item"><div className="ps-dot is-remaining" /><span className="ps-label">Remaining</span><span className="ps-val">{remainingCredits} cr</span></div>
            <div className="ps-divider" />
            <div className="ps-item"><span className="ps-label">Total</span><span className="ps-val">{summary.totalCredits} / 120 cr</span></div>
            <button type="button" className="grad-badge" onClick={() => setShowStandingInfo(true)}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M6 1l1.5 3L11 4.5l-2.5 2.5.6 3.5L6 9l-3.1 1.5.6-3.5L1 4.5 4.5 4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              Standing: {officialStanding} · GPA {summary.overallGPA?.toFixed(3) ?? "-"}
            </button>
          </div>

          <div className="plan-alerts">
            {!loading && summary.duplicateCourseCount > 0 && !hideDuplicateNotice && (
              <section className="fyp-callout is-warning">
                <p>
                  Duplicate credit notice: {summary.duplicateCourseCount} planned or in-progress course{summary.duplicateCourseCount === 1 ? "" : "s"} repeat credit already earned.
                  These repeated scheduled courses are flagged in the board and excluded from counted totals.
                </p>
                <button type="button" className="callout-close" onClick={() => setHideDuplicateNotice(true)} aria-label="Dismiss duplicate credit notice">
                  <X size={16} />
                </button>
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
                <button type="button" className="callout-close" onClick={() => setHideSubstitutionNotice(true)} aria-label="Dismiss substitution notice">
                  <X size={16} />
                </button>
              </section>
            )}
          </div>

          <div className="plan-area">
            {showGpaDetails && (
              <section className="fyp-gpa-panel">
                <div className="fyp-gpa-head">
                  <h3>UMD GPA Details</h3>
                  <span className="fyp-muted">
                    Attempted: {academicGpaHistory.attemptedCredits.toFixed(2)} | Quality Points: {academicGpaHistory.qualityPoints.toFixed(3)}
                  </span>
                </div>
                {academicGpaHistory.terms.length > 0 ? (
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
                ) : (
                  <p className="fyp-muted">No graded completed courses are available yet. GPA details will appear after transcript or completed-term grades are present.</p>
                )}
              </section>
            )}

            {loading && <div className="board-empty">Loading four-year plan...</div>}
            {!loading && errorMessage && <div className="board-empty"><p className="fyp-error">{errorMessage}</p></div>}

            {!loading && !errorMessage && boardTerms.length === 0 && (
              <div className="board-empty">
                <p className="fyp-muted">
                  No MAIN schedules yet. Set one schedule as MAIN for each term in All Schedules to build your four-year plan automatically.
                </p>
                <div className="mt-3">
                  <Link to="/schedules" className="topbar-btn primary">Go to all schedules</Link>
                </div>
              </div>
            )}

            {!loading && !errorMessage && boardTerms.length > 0 && (
              <div className="plan-grid" data-tour-target="four-year-timeline">
                {boardTerms.map((term) => {
                  const termState = boardTermState(term.status);
                  const canDropIntoTerm = term.source === "schedule";
                  const statusText = termState === "past" ? "Done" : termState === "current" ? "Now" : "Plan";
                  const statusClass = termState === "past" ? "done" : termState === "current" ? "cur" : "plan";
                  const termCourses = displayedCoursesByTerm.get(term.id) ?? [];
                  const duplicateCount = termCourses.filter((course) => duplicateScheduleSectionKeys.has(course.sectionKey)).length;
                  const countedCredits = termCourses
                    .filter((course) => course.countsTowardProgress && !duplicateScheduleSectionKeys.has(course.sectionKey))
                    .reduce((sum, course) => sum + course.credits, 0);
                  const pct = countedCredits > 0 ? Math.min(100, (countedCredits / MAX_CREDITS[termState]) * 100) : 30;
                  const creditLoadClass = creditLoadWidthClass(pct);

                  return (
                    <article
                      key={term.id}
                      className={`term-col ${term.termCode === "05" ? "summer" : ""} ${canDropIntoTerm && dragOverTermId === term.id ? "is-drop-target" : ""}`}
                      onDragOver={(event) => handleTermDragOver(event, term.id, canDropIntoTerm)}
                      onDrop={(event) => handleTermDrop(event, term.id)}
                    >
                      <header className={`term-col-header ${termState}`}>
                        <div className={`term-name ${termState}`}>{term.termLabel}</div>
                        <div className="term-credits">{countedCredits} counted credits</div>
                        <div className="credit-load-bar"><div className={`credit-load-fill ${FILL_CLASS[termState]} ${creditLoadClass}`} /></div>
                        <div className={`term-status ${statusClass}`}>{statusText}</div>
                        {duplicateCount > 0 && (
                          <div className="term-warning">
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                              <path d="M5 1.5l4 7H1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                            </svg>
                            {duplicateCount} duplicate {duplicateCount === 1 ? "course" : "courses"}
                          </div>
                        )}
                      </header>

                      {termCourses.map((course) => {
                        const courseType = boardCourseType(course.status);
                        const isDuplicate = duplicateScheduleSectionKeys.has(course.sectionKey);
                        const requirementLabels = getContributionLabelsForCourseCode(course.code, contributionMap);
                        const genEdContributionLabels = genEdLabels(course.tags);
                        const genEdLabelSet = new Set(genEdContributionLabels);
                        const contributionLabels = [...requirementLabels, ...genEdContributionLabels].slice(0, 2);
                        const sourceTerm = originalTermByCourseSectionKey.get(course.sectionKey) ?? term;
                        const isDraggable = sourceTerm.source === "schedule" && movingCourseKey === null;
                        return (
                          <article
                            key={course.sectionKey}
                            className={`plan-course ${courseType}${genEdContributionLabels.length > 0 ? " gen-ed" : ""} ${draggingCourseKey === course.sectionKey ? "is-dragging" : ""}`}
                            draggable={isDraggable}
                            onDragStart={(event) => {
                              if (!isDraggable) {
                                event.preventDefault();
                                return;
                              }
                              handleCourseDragStart(event, course.sectionKey);
                            }}
                            onDragEnd={handleCourseDragEnd}
                          >
                            <button
                              type="button"
                              className="plan-course-button"
                              onClick={() => setDetailCode(course.code)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setDetailCode(course.code);
                                }
                              }}
                            >
                              <div className={`pc-code ${boardCourseCodeColor(course.status)}`}>{course.code}</div>
                              <div className="pc-name">{course.title}</div>
                              <div className="pc-meta">{course.credits} cr • {course.sectionCode} • {formatStatusLabel(course.status)}</div>

                              <div className="pc-badge-row">
                                {isDuplicate && <span className="pc-chip warn">Duplicate</span>}
                                {contributionLabels.map((label) => (
                                  <span key={`${course.sectionKey}-${label}`} className={`pc-chip ${genEdLabelSet.has(label) ? "warn" : ""}`}>
                                    {label}
                                  </span>
                                ))}
                              </div>
                            </button>

                            {course.status === "completed" && (
                              <div className="pc-grade" onClick={(event) => event.stopPropagation()}>
                                <Select
                                  value={course.grade ?? "__none__"}
                                  onValueChange={(value) => void handleScheduleGradeChange(sourceTerm, course, value)}
                                  disabled={savingGradeKey === course.sectionKey}
                                >
                                  <SelectTrigger className="pc-grade-trigger">
                                    <SelectValue placeholder="Add grade" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">No grade</SelectItem>
                                    {GRADE_OPTIONS.map((grade) => (
                                      <SelectItem key={grade} value={grade}>{grade}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </article>
                        );
                      })}

                      {term.source === "schedule" && (
                        <button type="button" className="plan-course-add" onClick={() => openScheduleInBuilder(term)}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                            <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                          Open in schedule builder
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
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
