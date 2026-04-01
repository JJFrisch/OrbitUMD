import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronDown, ChevronUp, Info, MoreHorizontal, Search, Sparkles, X } from "lucide-react";
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
  evaluateRequirementSection,
  getContributionLabelsForCourseCode,
  loadProgramRequirementBundles,
  type AuditCourseStatus,
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
import { fetchCourseSections, searchCourses } from "@/lib/api/umdCourses";
import type { UmdCourseSummary, UmdSection } from "@/lib/types/course";
import { isUnspecifiedSectionCode } from "@/features/coursePlanner/utils/sectionLabels";
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

function acronymFromLabel(label: string): string {
  const cleaned = label.replace(/[^A-Za-z0-9\s]/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter((part) => part.length > 0);
  if (parts.length === 0) return label.slice(0, 3).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("").slice(0, 4);
}

function buildTagPresentation(label: string, isGenEd: boolean) {
  if (isGenEd) {
    return {
      shortLabel: label,
      fullLabel: `Gen Ed ${label} Requirement`,
    };
  }

  if (label.startsWith("Major:")) {
    const majorName = label.replace("Major:", "").replace(/\bmajor\b/ig, "").trim();
    return {
      shortLabel: acronymFromLabel(majorName),
      fullLabel: `Major (${majorName})`,
    };
  }

  if (label.startsWith("Minor:")) {
    const minorName = label.replace("Minor:", "").replace(/\bminor\b/ig, "").trim();
    return {
      shortLabel: acronymFromLabel(minorName),
      fullLabel: `Minor (${minorName})`,
    };
  }

  if (/\bmajor\b/i.test(label)) {
    const majorName = label.replace(/\bmajor\b/ig, "").trim();
    return {
      shortLabel: acronymFromLabel(majorName),
      fullLabel: `Major (${majorName})`,
    };
  }

  if (/\bminor\b/i.test(label)) {
    const minorName = label.replace(/\bminor\b/ig, "").trim();
    return {
      shortLabel: acronymFromLabel(minorName),
      fullLabel: `Minor (${minorName})`,
    };
  }

  return {
    shortLabel: acronymFromLabel(label),
    fullLabel: label,
  };
}

function toSectionDisplay(sectionCode: string): string {
  const normalized = String(sectionCode ?? "").trim().toUpperCase();
  if (normalized === "TRANSCRIPT") {
    return "Transcript";
  }
  if (isUnspecifiedSectionCode(sectionCode)) {
    return "Section Undetermined";
  }
  return `Section ${sectionCode}`;
}

function formatMinutesAsClock(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    return "TBA";
  }
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")}${suffix}`;
}

function toPlannerSectionFromUmdSection(section: UmdSection, sectionKey: string): ScheduleSelection["section"] {
  return {
    id: section.id || sectionKey,
    courseCode: section.courseId,
    sectionCode: section.sectionCode,
    instructor: section.instructor ?? "",
    instructors: section.instructor ? [section.instructor] : [],
    totalSeats: Number(section.totalSeats ?? 0),
    openSeats: Number(section.openSeats ?? 0),
    meetings: section.meetings.map((meeting) => ({
      days: meeting.days.length > 0 ? meeting.days.join("") : "TBA",
      startTime: formatMinutesAsClock(meeting.startMinutes),
      endTime: formatMinutesAsClock(meeting.endMinutes),
      location: meeting.location,
    })),
  };
}

function ProgressBar({ done, cur, plan, total }: { done: number; cur: number; plan: number; total: number }) {
  const pctDone = Math.min(100, (done / total) * 100);
  const pctCur = Math.min(100 - pctDone, (cur / total) * 100);
  const pctPlan = Math.min(100 - pctDone - pctCur, (plan / total) * 100);
  return (
    <div
      className="ps-credit-bar"
      // CSS custom properties are not static styles — dynamic percentage widths
      // for a progress bar cannot be expressed as static CSS classes.
      // eslint-disable-next-line react/forbid-component-props
      style={
        {
          "--fill-done": `${pctDone.toFixed(1)}%`,
          "--fill-cur": `${pctCur.toFixed(1)}%`,
          "--fill-plan": `${pctPlan.toFixed(1)}%`,
        } as CSSProperties
      }
    >
      <div className="ps-credit-fill ps-credit-completed" />
      <div className="ps-credit-fill ps-credit-progress" />
      <div className="ps-credit-fill ps-credit-planned" />
    </div>
  );
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
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingGradeKey, setSavingGradeKey] = useState<string | null>(null);
  const [editingGradeKey, setEditingGradeKey] = useState<string | null>(null);
  const [tagDetail, setTagDetail] = useState<{ shortLabel: string; fullLabel: string } | null>(null);
  const [gpaInfoTermLabel, setGpaInfoTermLabel] = useState<string | null>(null);
  const [mainSchedules, setMainSchedules] = useState<ScheduleWithSelections[]>([]);
  const [priorCredits, setPriorCredits] = useState<Awaited<ReturnType<typeof listUserPriorCredits>>>([]);
  const [requirementBundles, setRequirementBundles] = useState<ProgramRequirementBundle[]>([]);
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<CourseDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [addCourseTerm, setAddCourseTerm] = useState<PlannedTerm | null>(null);
  const [addCourseQuery, setAddCourseQuery] = useState("");
  const [addCourseResults, setAddCourseResults] = useState<UmdCourseSummary[]>([]);
  const [addCourseSearchPending, setAddCourseSearchPending] = useState(false);
  const [addCoursePendingCode, setAddCoursePendingCode] = useState<string | null>(null);
  const [replaceCourseTarget, setReplaceCourseTarget] = useState<{ term: PlannedTerm; course: PlannedCourse } | null>(null);
  const [showAddTermDialog, setShowAddTermDialog] = useState(false);
  const [selectedAddTermValue, setSelectedAddTermValue] = useState<string>("");
  const [addingTerm, setAddingTerm] = useState(false);
  const [courseMenuTarget, setCourseMenuTarget] = useState<{ term: PlannedTerm; course: PlannedCourse } | null>(null);
  const [changeSectionTarget, setChangeSectionTarget] = useState<{ term: PlannedTerm; course: PlannedCourse } | null>(null);
  const [availableSections, setAvailableSections] = useState<UmdSection[]>([]);
  const [sectionLookupPending, setSectionLookupPending] = useState(false);
  const [updatingSectionCode, setUpdatingSectionCode] = useState<string | null>(null);
  const [draggingCourseKey, setDraggingCourseKey] = useState<string | null>(null);
  const [dragOverTermId, setDragOverTermId] = useState<string | null>(null);
  const [dragOverInsertIndex, setDragOverInsertIndex] = useState<number | null>(null);
  const [movingCourseKey, setMovingCourseKey] = useState<string | null>(null);
  const courseMenuRef = useRef<HTMLDivElement | null>(null);
  const addCourseLookupRequestIdRef = useRef(0);

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

  useEffect(() => {
    if (!courseMenuTarget) {
      return;
    }

    const closeOnOutside = (event: MouseEvent) => {
      if (!courseMenuRef.current) {
        setCourseMenuTarget(null);
        return;
      }
      if (!courseMenuRef.current.contains(event.target as Node)) {
        setCourseMenuTarget(null);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCourseMenuTarget(null);
      }
    };

    const closeOnViewportChange = () => {
      setCourseMenuTarget(null);
    };

    window.addEventListener("mousedown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", closeOnViewportChange, true);
    window.addEventListener("resize", closeOnViewportChange);

    return () => {
      window.removeEventListener("mousedown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", closeOnViewportChange, true);
      window.removeEventListener("resize", closeOnViewportChange);
    };
  }, [courseMenuTarget]);

  useEffect(() => {
    if (!editingGradeKey) {
      return;
    }

    const closeOnOutside = (event: MouseEvent) => {
      const { target } = event;
      if (!(target instanceof Element)) {
        setEditingGradeKey(null);
        return;
      }

      if (target.closest(".pc-grade-inline-editor") || target.closest(".pc-grade-select-content")) {
        return;
      }

      setEditingGradeKey(null);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditingGradeKey(null);
      }
    };

    window.addEventListener("mousedown", closeOnOutside, true);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("mousedown", closeOnOutside, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [editingGradeKey]);

  useEffect(() => {
    if (!changeSectionTarget || changeSectionTarget.term.source !== "schedule") {
      setAvailableSections([]);
      setSectionLookupPending(false);
      return;
    }

    let active = true;
    const run = async () => {
      setSectionLookupPending(true);
      try {
        const termCode = `${changeSectionTarget.term.termYear}${changeSectionTarget.term.termCode}`;
        const sections = await fetchCourseSections(termCode, changeSectionTarget.course.code);
        if (!active) return;
        setAvailableSections(sections);
      } catch (error) {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "Unable to load available sections.");
        setAvailableSections([]);
      } finally {
        if (active) {
          setSectionLookupPending(false);
        }
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [changeSectionTarget]);

  useEffect(() => {
    if (!addCourseTerm || addCourseTerm.source !== "schedule") {
      setAddCourseResults([]);
      setAddCourseSearchPending(false);
      return;
    }

    const query = addCourseQuery.trim();
    if (query.length < 2) {
      setAddCourseResults([]);
      setAddCourseSearchPending(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      const requestId = addCourseLookupRequestIdRef.current + 1;
      addCourseLookupRequestIdRef.current = requestId;
      const termCode = `${addCourseTerm.termYear}${addCourseTerm.termCode}`;
      setAddCourseSearchPending(true);

      void searchCourses({ termCode, query, pageSize: 60 })
        .then((results) => {
          if (addCourseLookupRequestIdRef.current !== requestId) {
            return;
          }
          setAddCourseResults(results.slice(0, 25));
        })
        .catch(() => {
          if (addCourseLookupRequestIdRef.current !== requestId) {
            return;
          }
          setAddCourseResults([]);
        })
        .finally(() => {
          if (addCourseLookupRequestIdRef.current === requestId) {
            setAddCourseSearchPending(false);
          }
        });
    }, 220);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [addCourseQuery, addCourseTerm]);

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

  const gpaTermBreakdown = useMemo(() => {
    return new Map(academicGpaHistory.terms.map((term) => [term.termLabel, term]));
  }, [academicGpaHistory.terms]);

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

  const requirementProgress = useMemo(() => {
    if (requirementBundles.length === 0) return null;

    const statusRankLocal = (s: AuditCourseStatus) =>
      s === "completed" ? 3 : s === "in_progress" ? 2 : s === "planned" ? 1 : 0;
    const byCourseCode = new Map<string, AuditCourseStatus>();
    for (const term of terms) {
      for (const course of term.courses) {
        if (!course.countsTowardProgress) continue;
        const existing = byCourseCode.get(course.code.toUpperCase());
        const next: AuditCourseStatus = course.status === "completed" ? "completed"
          : course.status === "in_progress" ? "in_progress"
          : "planned";
        if (!existing || statusRankLocal(next) > statusRankLocal(existing)) {
          byCourseCode.set(course.code.toUpperCase(), next);
        }
      }
    }

    let totalSections = 0;
    let completedSections = 0;
    let inProgressSections = 0;
    let plannedSections = 0;

    for (const bundle of requirementBundles) {
      for (const section of bundle.sections) {
        if (section.special) continue;
        const audit = evaluateRequirementSection(section, byCourseCode);
        totalSections += 1;
        if (audit.status === "completed") completedSections += 1;
        else if (audit.status === "in_progress") inProgressSections += 1;
        else if (audit.status === "planned") plannedSections += 1;
      }
    }

    return { totalSections, completedSections, inProgressSections, plannedSections };
  }, [requirementBundles, terms]);

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

  const openScheduleInLibrary = (term: PlannedTerm) => {
    if (term.source !== "schedule") return;
    navigate(`/schedules?scheduleId=${encodeURIComponent(term.scheduleId)}`);
  };

  const boardTerms = useMemo(() => {
    const priorToUmd = terms.filter((term) => term.termLabel === "Prior to UMD");
    const academicTerms = terms.filter((term) => term.termLabel !== "Prior to UMD");
    return [...academicTerms, ...priorToUmd];
  }, [terms]);

  const plannedTermsCount = useMemo(() => {
    return boardTerms.filter((term) => term.status === "planned" && term.source === "schedule").length;
  }, [boardTerms]);

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

  const lastScheduleTermId = useMemo(() => {
    const scheduleTerms = boardTerms.filter((term) => term.source === "schedule");
    return scheduleTerms[scheduleTerms.length - 1]?.id ?? null;
  }, [boardTerms]);

  const addableTermOptions = useMemo(() => {
    const existing = new Set(
      boardTerms
        .filter((term) => term.source === "schedule")
        .map((term) => `${term.termCode}-${term.termYear}`),
    );

    const currentYear = new Date().getFullYear();
    const years = boardTerms.filter((term) => term.source === "schedule").map((term) => term.termYear);
    const minYear = years.length > 0 ? Math.min(...years) : currentYear;
    const maxYear = years.length > 0 ? Math.max(...years) : currentYear;
    const options: Array<{ value: string; label: string; termCode: string; termYear: number }> = [];

    for (let year = minYear; year <= maxYear + 4; year += 1) {
      for (const termCode of ["01", "05", "08", "12"]) {
        const key = `${termCode}-${year}`;
        if (existing.has(key)) continue;
        options.push({
          value: key,
          label: formatTermLabel(termCode, year),
          termCode,
          termYear: year,
        });
      }
    }

    options.sort((left, right) => compareAcademicTerms(
      { termCode: left.termCode, termYear: left.termYear },
      { termCode: right.termCode, termYear: right.termYear },
    ));

    return options;
  }, [boardTerms]);

  const quickAddableTermOptions = useMemo(() => addableTermOptions.slice(0, 8), [addableTermOptions]);

  const displayedCoursesByTerm = useMemo(() => {
    const grouped = new Map<string, PlannedCourse[]>();
    for (const term of boardTerms) {
      grouped.set(term.id, []);
    }

    for (const term of boardTerms) {
      for (const course of term.courses) {
        if (!grouped.has(term.id)) {
          continue;
        }
        grouped.get(term.id)?.push(course);
      }
    }

    return grouped;
  }, [boardTerms]);

  const currentCourseLocationBySectionKey = useMemo(() => {
    const mapping = new Map<string, { termId: string; index: number }>();
    for (const term of boardTerms) {
      const courses = displayedCoursesByTerm.get(term.id) ?? [];
      courses.forEach((course, index) => {
        mapping.set(course.sectionKey, { termId: term.id, index });
      });
    }
    return mapping;
  }, [boardTerms, displayedCoursesByTerm]);

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
    setDragOverInsertIndex(null);
  };

  const handleInsertDragOver = (event: DragEvent<HTMLElement>, termId: string, insertIndex: number, canDrop: boolean) => {
    if (!draggingCourseKey || !canDrop || movingCourseKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragOverTermId(termId);
    setDragOverInsertIndex(insertIndex);
  };

  const handleTermDrop = async (event: DragEvent<HTMLElement>, targetTermId: string, requestedTargetIndex?: number) => {
    event.preventDefault();
    event.stopPropagation();
    if (movingCourseKey) {
      return;
    }

    const droppedSectionKey = event.dataTransfer.getData("text/plain") || draggingCourseKey;
    if (!droppedSectionKey) {
      return;
    }

    const sourceLocation = currentCourseLocationBySectionKey.get(droppedSectionKey);
    if (!sourceLocation) {
      setDragOverTermId(null);
      setDragOverInsertIndex(null);
      setDraggingCourseKey(null);
      return;
    }

    const currentSourceTermId = sourceLocation.termId;

    const sourceTerm = termById.get(currentSourceTermId);
    const targetTerm = termById.get(targetTermId);

    if (!sourceTerm || !targetTerm || sourceTerm.source !== "schedule" || targetTerm.source !== "schedule") {
      toast.error("Courses can only be moved between MAIN schedule terms.");
      setDragOverTermId(null);
      setDragOverInsertIndex(null);
      setDraggingCourseKey(null);
      return;
    }

    const sourceSchedule = mainScheduleById.get(sourceTerm.scheduleId);
    const targetSchedule = mainScheduleById.get(targetTerm.scheduleId);
    if (!sourceSchedule || !targetSchedule || !sourceSchedule.term_code || !sourceSchedule.term_year || !targetSchedule.term_code || !targetSchedule.term_year) {
      toast.error("Unable to move this course right now.");
      setDragOverTermId(null);
      setDragOverInsertIndex(null);
      setDraggingCourseKey(null);
      return;
    }

    const sourceSelections = parseSelections(sourceSchedule.selections_json);
    const targetSelections = parseSelections(targetSchedule.selections_json);
    const movedSelection = sourceSelections.find((selection) => selection.sectionKey === droppedSectionKey);

    if (!movedSelection) {
      toast.error("Unable to locate the selected course in its source term.");
      setDragOverTermId(null);
      setDragOverInsertIndex(null);
      setDraggingCourseKey(null);
      return;
    }

    const targetCourses = displayedCoursesByTerm.get(targetTermId) ?? [];
    const fallbackTargetIndex = targetCourses.length;
    const rawTargetIndex = typeof requestedTargetIndex === "number"
      ? requestedTargetIndex
      : (dragOverTermId === targetTermId && dragOverInsertIndex !== null ? dragOverInsertIndex : fallbackTargetIndex);

    const sourceIndex = sourceSelections.findIndex((selection) => selection.sectionKey === droppedSectionKey);

    let nextSourceSelections: ScheduleSelection[];
    let nextTargetSelections: ScheduleSelection[];

    if (sourceSchedule.id === targetSchedule.id) {
      if (sourceIndex < 0) {
        setDragOverTermId(null);
        setDragOverInsertIndex(null);
        setDraggingCourseKey(null);
        return;
      }

      const withoutMoved = sourceSelections.filter((selection) => selection.sectionKey !== droppedSectionKey);
      const adjustedTargetIndex = rawTargetIndex > sourceIndex ? rawTargetIndex - 1 : rawTargetIndex;
      const insertIndex = Math.max(0, Math.min(adjustedTargetIndex, withoutMoved.length));
      withoutMoved.splice(insertIndex, 0, movedSelection);

      const changed = sourceSelections.some((selection, index) => withoutMoved[index]?.sectionKey !== selection.sectionKey);
      if (!changed) {
        setDragOverTermId(null);
        setDragOverInsertIndex(null);
        setDraggingCourseKey(null);
        return;
      }

      nextSourceSelections = withoutMoved;
      nextTargetSelections = withoutMoved;
    } else {
      const sourceWithoutMoved = sourceSelections.filter((selection) => selection.sectionKey !== droppedSectionKey);
      const targetWithoutMoved = targetSelections.filter((selection) => selection.sectionKey !== droppedSectionKey);
      const insertIndex = Math.max(0, Math.min(rawTargetIndex, targetWithoutMoved.length));
      const nextTarget = [...targetWithoutMoved];
      nextTarget.splice(insertIndex, 0, movedSelection);

      nextSourceSelections = sourceWithoutMoved;
      nextTargetSelections = nextTarget;
    }

    const previousSchedules = mainSchedules;

    setMovingCourseKey(droppedSectionKey);
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
      if (sourceSchedule.id === targetSchedule.id) {
        const saved = await plannerApi.saveScheduleWithSelections({
          id: sourceSchedule.id,
          name: sourceSchedule.name,
          termCode: sourceSchedule.term_code,
          termYear: sourceSchedule.term_year,
          isPrimary: sourceSchedule.is_primary,
          selectionsJson: buildSelectionsPayload(nextSourceSelections),
        });

        setMainSchedules((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)));
      } else {
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
      }
    } catch (error) {
      setMainSchedules(previousSchedules);
      toast.error(error instanceof Error ? error.message : "Unable to move course between terms.");
    } finally {
      setMovingCourseKey((current) => (current === droppedSectionKey ? null : current));
      setDragOverTermId(null);
      setDragOverInsertIndex(null);
      setDraggingCourseKey(null);
    }
  };

  const handleAddCourseLookup = async (showErrorToast = true) => {
    if (!addCourseTerm || addCourseTerm.source !== "schedule") {
      return;
    }

    const query = addCourseQuery.trim();
    if (!query) {
      setAddCourseResults([]);
      return;
    }

    const requestId = addCourseLookupRequestIdRef.current + 1;
    addCourseLookupRequestIdRef.current = requestId;
    const termCode = `${addCourseTerm.termYear}${addCourseTerm.termCode}`;
    setAddCourseSearchPending(true);
    try {
      const results = await searchCourses({ termCode, query, pageSize: 60 });
      if (addCourseLookupRequestIdRef.current !== requestId) {
        return;
      }
      setAddCourseResults(results.slice(0, 25));
    } catch (error) {
      if (showErrorToast) {
        toast.error(error instanceof Error ? error.message : "Unable to search courses right now.");
      }
      setAddCourseResults([]);
    } finally {
      if (addCourseLookupRequestIdRef.current === requestId) {
        setAddCourseSearchPending(false);
      }
    }
  };

  const handleAddCourseToTerm = async (term: PlannedTerm, course: UmdCourseSummary) => {
    if (term.source !== "schedule") return;
    const schedule = mainSchedules.find((entry) => entry.id === term.scheduleId);
    if (!schedule || !schedule.term_code || !schedule.term_year) {
      toast.error("Unable to add course to this term right now.");
      return;
    }

    const normalizedCode = String(course.id ?? "").toUpperCase().replace(/\s+/g, "");
    if (!normalizedCode) {
      toast.error("Unable to add this course.");
      return;
    }

    const currentSelections = parseSelections(schedule.selections_json);
    const replaceSectionKey = replaceCourseTarget && replaceCourseTarget.term.id === term.id
      ? replaceCourseTarget.course.sectionKey
      : null;

    const workingSelections = replaceSectionKey
      ? currentSelections.filter((selection) => selection.sectionKey !== replaceSectionKey)
      : currentSelections;

    const alreadyInTerm = currentSelections.some((selection) => (
      String(selection?.course?.courseCode ?? "").toUpperCase().replace(/\s+/g, "") === normalizedCode
    ));

    if (alreadyInTerm && !(replaceCourseTarget && replaceCourseTarget.course.code.toUpperCase() === normalizedCode)) {
      toast.message(`${normalizedCode} is already in ${term.termLabel}.`);
      return;
    }

    const sectionCode = "NOT CHOSEN";
    let sectionKey = `${normalizedCode}-${sectionCode}`;
    let keySuffix = 1;
    while (workingSelections.some((selection) => selection.sectionKey === sectionKey)) {
      keySuffix += 1;
      sectionKey = `${normalizedCode}-${sectionCode}-${keySuffix}`;
    }

    const credits = Number.isFinite(Number(course.credits)) ? Number(course.credits) : 0;
    const nextSelections: ScheduleSelection[] = [
      ...workingSelections,
      {
        sectionKey,
        course: {
          id: normalizedCode,
          courseCode: normalizedCode,
          name: course.title || normalizedCode,
          deptId: course.deptId || normalizedCode.slice(0, 4),
          credits,
          minCredits: credits,
          maxCredits: credits,
          description: course.description,
          genEds: Array.isArray(course.genEdTags) ? course.genEdTags : [],
          term: term.termCode,
          year: term.termYear,
          sections: [],
        },
        section: {
          id: sectionKey,
          courseCode: normalizedCode,
          sectionCode,
          instructor: "",
          instructors: [],
          totalSeats: 0,
          openSeats: 0,
          meetings: [],
        },
      },
    ];

    const previousSchedules = mainSchedules;
    setAddCoursePendingCode(normalizedCode);

    const optimisticSchedule: ScheduleWithSelections = {
      ...schedule,
      updated_at: new Date().toISOString(),
      selections_json: buildSelectionsPayload(nextSelections),
    };

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
      if (replaceSectionKey) {
        toast.success(`${normalizedCode} replaced ${replaceCourseTarget?.course.code ?? "course"} in ${term.termLabel}.`);
      } else {
        toast.success(`${normalizedCode} added to ${term.termLabel}.`);
      }
      setCourseMenuTarget(null);
      setReplaceCourseTarget(null);
      setAddCourseTerm(null);
      setAddCourseQuery("");
      setAddCourseResults([]);
    } catch (error) {
      setMainSchedules(previousSchedules);
      toast.error(error instanceof Error ? error.message : "Unable to add course to this term.");
    } finally {
      setAddCoursePendingCode(null);
    }
  };

  const handleRemoveCourseFromTerm = async (term: PlannedTerm, course: PlannedCourse) => {
    if (term.source !== "schedule") return;
    const schedule = mainSchedules.find((entry) => entry.id === term.scheduleId);
    if (!schedule || !schedule.term_code || !schedule.term_year) {
      toast.error("Unable to remove this course right now.");
      return;
    }

    const currentSelections = parseSelections(schedule.selections_json);
    const nextSelections = currentSelections.filter((selection) => selection.sectionKey !== course.sectionKey);
    if (nextSelections.length === currentSelections.length) {
      setCourseMenuTarget(null);
      return;
    }

    const previousSchedules = mainSchedules;
    const optimisticSchedule: ScheduleWithSelections = {
      ...schedule,
      updated_at: new Date().toISOString(),
      selections_json: buildSelectionsPayload(nextSelections),
    };

    setMainSchedules((current) => current.map((entry) => (entry.id === schedule.id ? optimisticSchedule : entry)));
    setCourseMenuTarget(null);

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
      toast.success(`${course.code} removed from ${term.termLabel}.`);
    } catch (error) {
      setMainSchedules(previousSchedules);
      toast.error(error instanceof Error ? error.message : "Unable to remove course.");
    }
  };

  const handleApplySectionChange = async (target: { term: PlannedTerm; course: PlannedCourse }, section: UmdSection) => {
    if (target.term.source !== "schedule") return;
    const schedule = mainSchedules.find((entry) => entry.id === target.term.scheduleId);
    if (!schedule || !schedule.term_code || !schedule.term_year) {
      toast.error("Unable to change section right now.");
      return;
    }

    const currentSelections = parseSelections(schedule.selections_json);
    const sourceSelection = currentSelections.find((selection) => selection.sectionKey === target.course.sectionKey);
    if (!sourceSelection) {
      toast.error("Unable to locate this course in the selected term.");
      return;
    }

    let nextSectionKey = `${sourceSelection.course.courseCode}-${section.sectionCode}`;
    let suffix = 1;
    while (currentSelections.some((selection) => selection.sectionKey === nextSectionKey && selection.sectionKey !== sourceSelection.sectionKey)) {
      suffix += 1;
      nextSectionKey = `${sourceSelection.course.courseCode}-${section.sectionCode}-${suffix}`;
    }

    const nextSelection: ScheduleSelection = {
      ...sourceSelection,
      sectionKey: nextSectionKey,
      section: toPlannerSectionFromUmdSection(section, nextSectionKey),
    };

    const nextSelections = currentSelections.map((selection) => (
      selection.sectionKey === target.course.sectionKey ? nextSelection : selection
    ));

    const previousSchedules = mainSchedules;
    setUpdatingSectionCode(section.sectionCode);

    const optimisticSchedule: ScheduleWithSelections = {
      ...schedule,
      updated_at: new Date().toISOString(),
      selections_json: buildSelectionsPayload(nextSelections),
    };

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
      toast.success(`${target.course.code} updated to section ${section.sectionCode}.`);
      setChangeSectionTarget(null);
      setAvailableSections([]);
    } catch (error) {
      setMainSchedules(previousSchedules);
      toast.error(error instanceof Error ? error.message : "Unable to change section.");
    } finally {
      setUpdatingSectionCode(null);
    }
  };

  const handleAddTerm = async () => {
    const selected = addableTermOptions.find((option) => option.value === selectedAddTermValue);
    if (!selected) {
      toast.error("Select a term to add.");
      return;
    }

    setAddingTerm(true);
    try {
      const saved = await plannerApi.saveScheduleWithSelections({
        name: `MAIN ${TERM_NAME[selected.termCode] ?? "Term"}${selected.termYear}`,
        termCode: selected.termCode,
        termYear: selected.termYear,
        isPrimary: true,
        selectionsJson: [],
      });

      setMainSchedules((current) => {
        const withoutExisting = current.filter((entry) => entry.id !== saved.id);
        return [...withoutExisting, saved];
      });
      setShowAddTermDialog(false);
      setSelectedAddTermValue("");
      toast.success(`${formatTermLabel(selected.termCode, selected.termYear)} added.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to add term.");
    } finally {
      setAddingTerm(false);
    }
  };

  const remainingCredits = Math.max(0, 120 - summary.totalCredits);
  const activeGpaTermDetails = gpaInfoTermLabel ? gpaTermBreakdown.get(gpaInfoTermLabel) ?? null : null;

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
            {loading ? (
              <span className="ps-label" style={{ opacity: 0.5 }}>Loading plan data…</span>
            ) : (
              <>
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
              </>
            )}
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
                <div className="board-empty-action">
                  <Link to="/schedules" className="topbar-btn primary">Go to all schedules</Link>
                </div>
              </div>
            )}

            {!loading && !errorMessage && boardTerms.length > 0 && (
              <div className="plan-grid-scroll" data-tour-target="four-year-timeline">
                <div className="plan-grid">
                {boardTerms.map((term) => {
                  const termState = boardTermState(term.status);
                  const canDropIntoTerm = term.source === "schedule";
                  const isLastScheduleTerm = term.id === lastScheduleTermId;
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
                      onDragOver={(event) => {
                        if (!canDropIntoTerm || !draggingCourseKey || movingCourseKey) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragOverTermId(term.id);
                      }}
                      onDrop={(event) => handleTermDrop(event, term.id, termCourses.length)}
                    >
                      <header className={`term-col-header ${termState}`}>
                        {term.source === "schedule" && (
                          <div className="term-header-actions">
                            <button
                              type="button"
                              className="term-view-btn"
                              onClick={() => openScheduleInLibrary(term)}
                            >
                              View
                            </button>
                            {isLastScheduleTerm && (
                              <button
                                type="button"
                                className="term-add-btn"
                                onClick={() => {
                                  setSelectedAddTermValue(addableTermOptions[0]?.value ?? "");
                                  setShowAddTermDialog(true);
                                }}
                              >
                                Add Term
                              </button>
                            )}
                          </div>
                        )}
                        <div className={`term-name ${termState}`}>{term.termLabel}</div>
                        <div className="term-credits">{countedCredits} counted credits</div>
                        <div className="credit-load-bar"><div className={`credit-load-fill ${FILL_CLASS[termState]} ${creditLoadClass}`} /></div>
                        <div className={`term-status ${statusClass}`}>
                          {statusText}
                          {termState === "past" && typeof term.semesterGPA === "number" && (
                            <span className="term-gpa-inline">
                              <span> • GPA {term.semesterGPA.toFixed(3)}</span>
                              <button
                                type="button"
                                className="term-gpa-info-btn"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setGpaInfoTermLabel(term.termLabel);
                                }}
                                aria-label={`Explain semester GPA for ${term.termLabel}`}
                              >
                                <Info size={12} />
                              </button>
                            </span>
                          )}
                        </div>
                        {duplicateCount > 0 && (
                          <div className="term-warning">
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                              <path d="M5 1.5l4 7H1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                            </svg>
                            {duplicateCount} duplicate {duplicateCount === 1 ? "course" : "courses"}
                          </div>
                        )}
                      </header>

                      <div className="term-course-list">
                        {canDropIntoTerm && (
                          <div
                            className={`course-insert-slot ${(dragOverTermId === term.id && dragOverInsertIndex === 0) ? "active" : ""} ${termCourses.length === 0 ? "empty" : ""}`}
                            onDragOver={(event) => handleInsertDragOver(event, term.id, 0, canDropIntoTerm)}
                            onDrop={(event) => handleTermDrop(event, term.id, 0)}
                          />
                        )}

                        {termCourses.map((course, index) => {
                        const courseType = boardCourseType(course.status);
                        const isDuplicate = duplicateScheduleSectionKeys.has(course.sectionKey);
                        const requirementLabels = getContributionLabelsForCourseCode(course.code, contributionMap);
                        const genEdContributionLabels = genEdLabels(course.tags);
                        const genEdLabelSet = new Set(genEdContributionLabels);
                        const contributionLabels = [...requirementLabels, ...genEdContributionLabels].slice(0, 2);
                        const presentedTags = contributionLabels.map((label) => {
                          return {
                            originalLabel: label,
                            isGenEd: genEdLabelSet.has(label),
                            ...buildTagPresentation(label, genEdLabelSet.has(label)),
                          };
                        });
                        const sourceTerm = originalTermByCourseSectionKey.get(course.sectionKey) ?? term;
                        const isDraggable = sourceTerm.source === "schedule" && movingCourseKey === null;
                        return (
                          <Fragment key={course.sectionKey}>
                            <article
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
                              onContextMenu={(event) => {
                                if (sourceTerm.source !== "schedule") {
                                  return;
                                }
                                event.preventDefault();
                                event.stopPropagation();
                                setCourseMenuTarget({ term: sourceTerm, course });
                              }}
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
                                <div className="pc-title-line">
                                  <span className={`pc-code ${boardCourseCodeColor(course.status)}`}>{course.code}</span>
                                  <span className="pc-name-inline">{course.title}</span>
                                </div>
                                <div className="pc-meta" onClick={(event) => event.stopPropagation()}>
                                  <span>{course.credits} credits</span>
                                  <span className="pc-meta-sep">•</span>
                                  <span>{toSectionDisplay(course.sectionCode)}</span>
                                  <span className="pc-meta-sep">•</span>
                                  {course.status === "completed" && editingGradeKey === course.sectionKey ? (
                                    <div className="pc-grade-inline-editor">
                                      <Select
                                        value={course.grade ?? "__none__"}
                                        onValueChange={(value) => {
                                          void handleScheduleGradeChange(sourceTerm, course, value).finally(() => {
                                            setEditingGradeKey((current) => (current === course.sectionKey ? null : current));
                                          });
                                        }}
                                        disabled={savingGradeKey === course.sectionKey}
                                      >
                                        <SelectTrigger className="pc-grade-trigger inline">
                                          <SelectValue placeholder="Grade" />
                                        </SelectTrigger>
                                        <SelectContent className="pc-grade-select-content">
                                          <SelectItem value="__none__">No grade</SelectItem>
                                          {GRADE_OPTIONS.map((grade) => (
                                            <SelectItem key={grade} value={grade}>{grade}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      className={`pc-grade-label inline ${course.status === "completed" ? "editable" : ""}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (course.status === "completed") {
                                          setEditingGradeKey(course.sectionKey);
                                        }
                                      }}
                                      disabled={course.status !== "completed" || savingGradeKey === course.sectionKey}
                                    >
                                      {course.grade ?? "-"}
                                    </button>
                                  )}
                                  {isDuplicate && <>
                                    <span className="pc-meta-sep">•</span>
                                    <span className="pc-chip pc-chip-inline warn">Duplicate</span>
                                  </>}
                                  {presentedTags.map((tag) => (
                                    <Fragment key={`${course.sectionKey}-${tag.originalLabel}`}>
                                      <span className="pc-meta-sep">•</span>
                                      <button
                                        type="button"
                                        className={`pc-chip pc-chip-inline pc-chip-btn ${tag.isGenEd ? "warn" : ""}`}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setTagDetail({ shortLabel: tag.shortLabel, fullLabel: tag.fullLabel });
                                        }}
                                      >
                                        {tag.shortLabel}
                                      </button>
                                    </Fragment>
                                  ))}
                                </div>
                              </button>

                              {sourceTerm.source === "schedule" && (
                                <button
                                  type="button"
                                  className="pc-action-btn"
                                  aria-label={`Actions for ${course.code}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setCourseMenuTarget(
                                      courseMenuTarget?.course.sectionKey === course.sectionKey && courseMenuTarget.term.id === sourceTerm.id
                                        ? null
                                        : { term: sourceTerm, course }
                                    );
                                  }}
                                >
                                  <MoreHorizontal size={14} />
                                </button>
                              )}

                              {courseMenuTarget &&
                                courseMenuTarget.course.sectionKey === course.sectionKey &&
                                courseMenuTarget.term.id === sourceTerm.id && (
                                  <div className="pc-context-menu" ref={courseMenuRef} onClick={(event) => event.stopPropagation()}>
                                    <button
                                      type="button"
                                      className="pc-context-item"
                                      onClick={() => {
                                        setReplaceCourseTarget({ term: sourceTerm, course });
                                        setAddCourseTerm(sourceTerm);
                                        setAddCourseQuery(course.code);
                                        setAddCourseResults([]);
                                        setCourseMenuTarget(null);
                                      }}
                                    >
                                      Change course
                                    </button>
                                    <button
                                      type="button"
                                      className="pc-context-item"
                                      onClick={() => {
                                        setChangeSectionTarget({ term: sourceTerm, course });
                                        setCourseMenuTarget(null);
                                      }}
                                    >
                                      Change section
                                    </button>
                                    <button
                                      type="button"
                                      className="pc-context-item danger"
                                      onClick={() => {
                                        void handleRemoveCourseFromTerm(sourceTerm, course);
                                      }}
                                    >
                                      Remove course
                                    </button>
                                  </div>
                                )}
                            </article>

                            {canDropIntoTerm && (
                              <div
                                className={`course-insert-slot ${(dragOverTermId === term.id && dragOverInsertIndex === index + 1) ? "active" : ""}`}
                                onDragOver={(event) => handleInsertDragOver(event, term.id, index + 1, canDropIntoTerm)}
                                onDrop={(event) => handleTermDrop(event, term.id, index + 1)}
                              />
                            )}
                          </Fragment>
                        );
                      })}
                      </div>

                      {term.source === "schedule" && (
                        <button
                          type="button"
                          className="plan-course-add"
                          onClick={() => {
                            setReplaceCourseTarget(null);
                            setAddCourseTerm(term);
                            setAddCourseQuery("");
                            setAddCourseResults([]);
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                            <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                          Add course
                        </button>
                      )}
                    </article>
                  );
                })}
                </div>
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

      <Dialog open={Boolean(tagDetail)} onOpenChange={(open) => {
        if (!open) setTagDetail(null);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tagDetail?.shortLabel ?? "Requirement Tag"}</DialogTitle>
            <DialogDescription>
              {tagDetail?.fullLabel ?? "Requirement details"}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(gpaInfoTermLabel)} onOpenChange={(open) => {
        if (!open) setGpaInfoTermLabel(null);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{gpaInfoTermLabel ?? "Semester GPA"}</DialogTitle>
            <DialogDescription>
              Semester GPA is calculated as Quality Points divided by Attempted Credits for grade-bearing classes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-foreground">
            <p>
              Formula: GPA = Quality Points / Attempted Credits
            </p>
            <p>
              Attempted Credits: {activeGpaTermDetails?.attemptedCredits.toFixed(2) ?? "-"}
            </p>
            <p>
              Quality Points: {activeGpaTermDetails?.qualityPoints.toFixed(3) ?? "-"}
            </p>
            <p>
              Semester GPA: {activeGpaTermDetails?.semesterGPA?.toFixed(3) ?? "-"}
            </p>
            <p className="text-muted-foreground">
              OrbitUMD follows UMD transcript-style GPA rules; non-GPA grades (for example P, S, W, I, AUD) are excluded.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(addCourseTerm)} onOpenChange={(open) => {
        if (!open) {
          setAddCourseTerm(null);
          setAddCourseQuery("");
          setAddCourseResults([]);
          setAddCourseSearchPending(false);
          setReplaceCourseTarget(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {replaceCourseTarget ? "Change Course" : "Add Course"} for {addCourseTerm?.termLabel ?? "Term"}
            </DialogTitle>
            <DialogDescription>
              {replaceCourseTarget
                ? `Select a replacement for ${replaceCourseTarget.course.code}. The new course will be saved with an undetermined section.`
                : "Search by course code or title. Added courses will be saved to this MAIN schedule with an undetermined section."}
            </DialogDescription>
          </DialogHeader>

          <div className="add-course-lookup">
            <div className="add-course-lookup-row">
              <label className="add-course-input-wrap" htmlFor="add-course-query-input">
                <Search size={15} className="add-course-input-icon" />
                <input
                  id="add-course-query-input"
                  type="text"
                  className="add-course-input"
                  placeholder="Start typing course code or title"
                  value={addCourseQuery}
                  onChange={(event) => setAddCourseQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleAddCourseLookup();
                    }
                  }}
                />
                {addCourseSearchPending ? <span className="add-course-search-status">Searching...</span> : null}
              </label>
              <button
                type="button"
                className="topbar-btn add-course-refresh"
                onClick={() => {
                  void handleAddCourseLookup();
                }}
                disabled={addCourseSearchPending}
              >
                Refresh
              </button>
            </div>

            <div className="add-course-hint-row">
              <span className="add-course-hint">Instant search is enabled. Type at least 2 characters.</span>
              {addCourseQuery.trim().length >= 2 && !addCourseSearchPending ? (
                <span className="add-course-result-count">{addCourseResults.length} results</span>
              ) : null}
            </div>

            <div className="add-course-results">
              {addCourseResults.length === 0 ? (
                <p className="fyp-muted">
                  {addCourseSearchPending
                    ? "Searching courses..."
                    : addCourseQuery.trim().length < 2
                      ? "Type at least 2 characters to search courses."
                      : "No matching courses found for this query."}
                </p>
              ) : (
                addCourseResults.map((course) => {
                  const normalizedCode = String(course.id ?? "").toUpperCase().replace(/\s+/g, "");
                  const inFlight = addCoursePendingCode === normalizedCode;
                  return (
                    <div key={`${course.id}-${course.title}`} className="add-course-result-item">
                      <div>
                        <p className="add-course-result-code">{course.id}</p>
                        <p className="add-course-result-title">{course.title}</p>
                        <p className="add-course-result-meta">
                          {course.credits} credits{course.genEdTags.length > 0 ? ` • ${course.genEdTags.join(", ")}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="topbar-btn primary"
                        onClick={() => {
                          if (addCourseTerm) {
                            void handleAddCourseToTerm(addCourseTerm, course);
                          }
                        }}
                        disabled={inFlight}
                      >
                        {inFlight ? "Adding..." : replaceCourseTarget ? "Replace" : "Add to term"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(changeSectionTarget)} onOpenChange={(open) => {
        if (!open) {
          setChangeSectionTarget(null);
          setAvailableSections([]);
          setSectionLookupPending(false);
          setUpdatingSectionCode(null);
        }
      }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Change Section</DialogTitle>
            <DialogDescription>
              {changeSectionTarget
                ? `Choose a section for ${changeSectionTarget.course.code} in ${changeSectionTarget.term.termLabel}.`
                : "Choose a section."}
            </DialogDescription>
          </DialogHeader>

          <div className="change-section-list">
            {sectionLookupPending ? (
              <p className="fyp-muted">Loading sections...</p>
            ) : availableSections.length === 0 ? (
              <p className="fyp-muted">No sections were found for this course in the selected term.</p>
            ) : (
              availableSections.map((section) => {
                const isCurrent = changeSectionTarget?.course.sectionCode === section.sectionCode;
                const inFlight = updatingSectionCode === section.sectionCode;
                return (
                  <div key={section.id} className={`change-section-item${isCurrent ? " is-current" : ""}`}>
                    <div>
                      <p className="change-section-code">
                        Section {section.sectionCode}
                        {isCurrent && <span className="change-section-current-badge">current</span>}
                      </p>
                      <p className="change-section-meta">
                        {(section.instructor && section.instructor.length > 0) ? section.instructor : "Instructor TBA"}
                      </p>
                      {section.meetings.length > 0 && (
                        <div className="change-section-meetings">
                          {section.meetings.map((meeting, mi) => {
                            const days = meeting.days.length > 0 ? meeting.days.join("") : "TBA";
                            const timeStr = Number.isFinite(meeting.startMinutes) && Number.isFinite(meeting.endMinutes)
                              ? `${formatMinutesAsClock(meeting.startMinutes)} – ${formatMinutesAsClock(meeting.endMinutes)}`
                              : "Time TBA";
                            const loc = meeting.location ?? "";
                            return (
                              <span key={mi} className="change-section-meeting-row">
                                <span className="change-section-days">{days || "TBA"}</span>
                                <span className="change-section-time">{timeStr}</span>
                                {loc && <span className="change-section-loc">{loc}</span>}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <div className="change-section-seats">
                        {section.openSeats > 0
                          ? <span className="change-section-open">{section.openSeats} / {section.totalSeats} seats open</span>
                          : <span className="change-section-closed">Closed ({section.totalSeats} seats)</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`topbar-btn ${isCurrent ? "" : "primary"}`}
                      disabled={isCurrent || inFlight || !changeSectionTarget}
                      onClick={() => {
                        if (changeSectionTarget) {
                          void handleApplySectionChange(changeSectionTarget, section);
                        }
                      }}
                    >
                      {isCurrent ? "Current" : inFlight ? "Saving..." : "Select"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddTermDialog} onOpenChange={(open) => {
        setShowAddTermDialog(open);
        if (!open) {
          setSelectedAddTermValue("");
          setAddingTerm(false);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Term</DialogTitle>
            <DialogDescription>
              Add a new term column that is not already in your MAIN schedule timeline.
            </DialogDescription>
          </DialogHeader>

          {addableTermOptions.length === 0 ? (
            <p className="fyp-muted">No additional terms are currently available to add.</p>
          ) : (
            <div className="add-term-panel">
              <div className="add-term-quick-panel">
                <div className="add-term-quick-header">
                  <Sparkles size={14} />
                  <span>Suggested next semesters</span>
                </div>
                <div className="add-term-chip-row">
                  {quickAddableTermOptions.map((option) => (
                    <button
                      key={`quick-term-${option.value}`}
                      type="button"
                      className={`add-term-chip ${selectedAddTermValue === option.value ? "active" : ""}`}
                      onClick={() => setSelectedAddTermValue(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="add-term-select-row">
                <Select value={selectedAddTermValue} onValueChange={setSelectedAddTermValue}>
                  <SelectTrigger>
                    <SelectValue placeholder="Or browse all available terms" />
                  </SelectTrigger>
                  <SelectContent>
                    {addableTermOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <button
                  type="button"
                  className="topbar-btn primary add-term-confirm-btn"
                  disabled={!selectedAddTermValue || addingTerm}
                  onClick={() => {
                    void handleAddTerm();
                  }}
                >
                  {addingTerm ? "Adding..." : "Add semester"}
                </button>
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
