import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, ExternalLink, GraduationCap, Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import type { AuditCourseStatus } from "@/lib/requirements/audit";
import { lookupCourseDetails, type CourseDetails } from "@/lib/requirements/courseDetailsLoader";
import { AddToScheduleDropdown } from "./AddToScheduleDropdown";

interface CourseDetailsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  courseCode: string;
  courseTitle: string;
  credits: number;
  genEds: string[];
  status: AuditCourseStatus;
}

function statusStyle(status: AuditCourseStatus): { bg: string; text: string; label: string } {
  if (status === "completed") return { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", label: "Completed" };
  if (status === "in_progress") return { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-400", label: "In Progress" };
  if (status === "planned") return { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-400", label: "Planned" };
  return { bg: "bg-slate-100 dark:bg-slate-800/40", text: "text-slate-500 dark:text-slate-400", label: "Not Started" };
}

function statusDot(status: AuditCourseStatus): string {
  if (status === "completed") return "bg-emerald-500";
  if (status === "in_progress") return "bg-amber-500";
  if (status === "planned") return "bg-blue-500";
  return "bg-slate-400";
}

function splitDescriptionAndPrerequisites(raw?: string): { description?: string; prerequisites?: string } {
  const source = String(raw ?? "").trim();
  if (!source) return {};

  const prereqMatch = source.match(/\bPrerequisites?\s*:/i);
  if (!prereqMatch || prereqMatch.index === undefined) {
    return { description: source };
  }

  const prereqStart = prereqMatch.index;
  const description = source.slice(0, prereqStart).trim();
  const prerequisites = source.slice(prereqStart).trim();
  return {
    description: description || undefined,
    prerequisites: prerequisites || undefined,
  };
}

function normalizeCourseCode(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

function formatCourseCodeForDisplay(code: string): string {
  const match = code.match(/^([A-Z]+)(\d.*)$/);
  if (!match) return code;
  return `${match[1]} ${match[2]}`;
}

function renderLinkedText(
  text: string,
  onSelectCourse: (courseCode: string) => void,
): Array<string | JSX.Element> {
  const coursePattern = /\b([A-Z]{2,4}\s?\d{3}[A-Z]?)\b/g;
  const parts: Array<string | JSX.Element> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = coursePattern.exec(text)) !== null) {
    const matched = match[0];
    const start = match.index;
    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start));
    }

    const normalized = normalizeCourseCode(matched);
    parts.push(
      <button
        key={`${normalized}-${start}`}
        type="button"
        className="font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 underline underline-offset-2 decoration-red-300/50 hover:decoration-red-400 transition-colors"
        title={`View ${matched}`}
        onClick={() => onSelectCourse(normalized)}
      >
        {matched}
      </button>,
    );

    lastIndex = start + matched.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

const GEN_ED_NAMES: Record<string, string> = {
  FSAR: "Analytic Reasoning",
  FSAW: "Academic Writing",
  FSMA: "Math",
  FSOC: "Oral Communication",
  FSPW: "Professional Writing",
  DSHS: "History & Social Sciences",
  DSHU: "Humanities",
  DSNL: "Natural Sciences (Lab)",
  DSNS: "Natural Sciences",
  DSSP: "Scholarship in Practice",
  SCIS: "I-Series",
  DVUP: "Understanding Plural Societies",
  DVCC: "Cultural Competence",
};

export function CourseDetailsPopup({
  isOpen,
  onClose,
  courseCode,
  courseTitle,
  credits,
  genEds,
  status,
}: CourseDetailsPopupProps) {
  const [activeCourseCode, setActiveCourseCode] = useState(courseCode);
  const [activeDetails, setActiveDetails] = useState<CourseDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([courseCode]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [addMessage, setAddMessage] = useState<string | null>(null);

  const selectCourse = (courseCodeToOpen: string) => {
    const normalized = normalizeCourseCode(courseCodeToOpen);
    setHistory((prev) => {
      const base = prev.slice(0, historyIndex + 1);
      if (base[base.length - 1] === normalized) return base;
      const next = [...base, normalized];
      setHistoryIndex(next.length - 1);
      return next;
    });
    setActiveCourseCode(normalized);
  };

  const goBack = () => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setActiveCourseCode(history[nextIndex]);
  };

  const goForward = () => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setActiveCourseCode(history[nextIndex]);
  };

  useEffect(() => {
    if (!isOpen) return;
    setHistory([courseCode]);
    setHistoryIndex(0);
    setActiveCourseCode(courseCode);
    setAddMessage(null);
  }, [courseCode, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    const run = async () => {
      setLoading(true);
      try {
        const detailsByCode = await lookupCourseDetails([activeCourseCode]);
        if (!active) return;
        setActiveDetails(detailsByCode.get(activeCourseCode) ?? null);
      } catch {
        if (!active) return;
        setActiveDetails(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [activeCourseCode, isOpen]);

  const shownTitle = activeDetails?.title ?? (activeCourseCode === courseCode ? courseTitle : activeCourseCode);
  const shownCredits = activeDetails?.credits ?? (activeCourseCode === courseCode ? credits : 0);
  const shownGenEds = activeDetails?.genEds ?? (activeCourseCode === courseCode ? genEds : []);
  const isOriginalCourse = activeCourseCode === courseCode;
  const shownStatus = isOriginalCourse ? status : "not_started";
  const st = statusStyle(shownStatus);
  const displayCode = formatCourseCodeForDisplay(activeCourseCode);

  const splitDetails = useMemo(
    () => splitDescriptionAndPrerequisites(activeDetails?.description),
    [activeDetails?.description],
  );
  const prerequisitesText = activeDetails?.prereqs?.trim() || splitDetails.prerequisites;

  const dept = activeCourseCode.match(/^[A-Z]+/)?.[0] ?? "";
  const courseNum = activeCourseCode.match(/\d+/)?.[0] ?? "";
  const level = courseNum ? `${courseNum[0]}00-level` : "";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className={`${st.bg} px-6 pt-5 pb-4`}>
          <DialogHeader className="space-y-1">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground/70">{dept}</span>
                  {level && <span className="text-xs text-muted-foreground/50">·</span>}
                  {level && <span className="text-xs text-muted-foreground/50">{level}</span>}
                </div>
                <DialogTitle className="text-xl font-bold leading-tight">
                  {displayCode}
                </DialogTitle>
                <DialogDescription className="text-sm mt-1 text-foreground/70 font-medium">
                  {shownTitle}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 pt-1">
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={goBack} disabled={historyIndex <= 0} title="Go back">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={goForward} disabled={historyIndex >= history.length - 1} title="Go forward">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Quick stats row */}
            <div className="flex items-center gap-2 pt-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${st.bg} ${st.text} ring-1 ring-inset ring-current/15`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDot(shownStatus)}`} />
                {st.label}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-background/60 px-2.5 py-1 rounded-full ring-1 ring-inset ring-border/50">
                <BookOpen className="h-3 w-3" />
                {shownCredits} credit{shownCredits !== 1 ? "s" : ""}
              </span>
              {shownGenEds.map((ge) => (
                <span
                  key={ge}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-background/60 px-2.5 py-1 rounded-full ring-1 ring-inset ring-border/50"
                  title={GEN_ED_NAMES[ge] ?? ge}
                >
                  <GraduationCap className="h-3 w-3" />
                  {ge}
                </span>
              ))}
            </div>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Description */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Info className="h-3.5 w-3.5 text-muted-foreground/60" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Description</h3>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 py-3">
                <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60 animate-spin" />
                <span className="text-sm text-muted-foreground">Loading course details...</span>
              </div>
            ) : splitDetails.description ? (
              <p className="text-sm leading-relaxed text-foreground/85">
                {renderLinkedText(splitDetails.description, selectCourse)}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No description available for this course.</p>
            )}
          </div>

          {/* Prerequisites */}
          {(loading || prerequisitesText) && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <svg className="h-3.5 w-3.5 text-muted-foreground/60" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3 8h10M10 5l3 3-3 3" />
                </svg>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Prerequisites</h3>
              </div>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : prerequisitesText ? (
                <div className="text-sm leading-relaxed text-foreground/85 bg-muted/30 rounded-lg p-3 border border-border/50">
                  {renderLinkedText(prerequisitesText, selectCourse)}
                </div>
              ) : null}
            </div>
          )}

          {!loading && !prerequisitesText && !splitDetails.description && (
            <p className="text-sm text-muted-foreground italic py-2">
              No additional details available. This course may not be in the current catalog.
            </p>
          )}

          {/* Gen Ed details (expanded) */}
          {shownGenEds.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <GraduationCap className="h-3.5 w-3.5 text-muted-foreground/60" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">General Education</h3>
              </div>
              <div className="flex flex-col gap-1.5">
                {shownGenEds.map((ge) => (
                  <div key={ge} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="font-mono text-xs min-w-[52px] justify-center">{ge}</Badge>
                    <span className="text-muted-foreground">{GEN_ED_NAMES[ge] ?? "General Education"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/50 bg-muted/20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AddToScheduleDropdown
              courseCode={activeCourseCode}
              courseTitle={shownTitle}
              credits={Number(shownCredits ?? 0) || 0}
              genEds={shownGenEds}
              onMessage={setAddMessage}
            />
            {addMessage && <span className="text-xs text-muted-foreground">{addMessage}</span>}
          </div>
          <a
            href={`https://app.testudo.umd.edu/soc/search?courseId=${activeCourseCode}&sectionId=&termId=&_openSectionsOnly=on&creditCompare=&credits=&courseLevelFilter=ALL&instructor=&_face498to498=on&courseStartCompare=&courseStartHour=&courseStartMin=&courseStartAM=&courseEndHour=&courseEndMin=&courseEndAM=&teachingCenter=ALL&_classDay1=on&_classDay2=on&_classDay3=on&_classDay4=on&_classDay5=on`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Testudo
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
