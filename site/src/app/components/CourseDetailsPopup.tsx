import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, ExternalLink, GraduationCap, Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import type { AuditCourseStatus } from "@/lib/requirements/audit";
import { lookupCourseDetails, type CourseDetails } from "@/lib/requirements/courseDetailsLoader";
import { AddToScheduleDropdown } from "./AddToScheduleDropdown";
import "./course-details-popup.css";

interface CourseDetailsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  courseCode: string;
  courseTitle: string;
  credits: number;
  genEds: string[];
  status: AuditCourseStatus;
}

function statusStyle(status: AuditCourseStatus): { tone: string; label: string } {
  if (status === "completed") return { tone: "cdp-tone-completed", label: "Completed" };
  if (status === "in_progress") return { tone: "cdp-tone-progress", label: "In Progress" };
  if (status === "planned") return { tone: "cdp-tone-planned", label: "Planned" };
  return { tone: "cdp-tone-default", label: "Not Started" };
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
        className="cdp-course-link"
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
      <DialogContent className="cdp-dialog">
        <div className={`cdp-hero ${st.tone}`}>
          <DialogHeader className="cdp-header">
            <div className="cdp-headline-row">
              <div className="cdp-headline-copy">
                <div className="cdp-meta-row">
                  <span className="cdp-dept-pill">{dept}</span>
                  {level && <span className="cdp-meta-separator">•</span>}
                  {level && <span className="cdp-level-label">{level}</span>}
                </div>
                <DialogTitle className="cdp-title">
                  {displayCode}
                </DialogTitle>
                <DialogDescription className="cdp-subtitle">
                  {shownTitle}
                </DialogDescription>
              </div>
              <div className="cdp-history-actions">
                <Button type="button" size="icon" variant="ghost" className="cdp-history-btn" onClick={goBack} disabled={historyIndex <= 0} title="Go back">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="cdp-history-btn" onClick={goForward} disabled={historyIndex >= history.length - 1} title="Go forward">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="cdp-chip-row">
              <span className={`cdp-status-pill ${st.tone}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDot(shownStatus)}`} />
                {st.label}
              </span>
              <span className="cdp-chip-pill">
                <BookOpen className="h-3 w-3" />
                {shownCredits} credit{shownCredits !== 1 ? "s" : ""}
              </span>
              {shownGenEds.map((ge) => (
                <span
                  key={ge}
                  className="cdp-chip-pill"
                  title={GEN_ED_NAMES[ge] ?? ge}
                >
                  <GraduationCap className="h-3 w-3" />
                  {ge}
                </span>
              ))}
            </div>
          </DialogHeader>
        </div>

        <div className="cdp-body">
          <div className="cdp-section">
            <div className="cdp-section-label-row">
              <Info className="h-3.5 w-3.5 text-muted-foreground/60" />
              <h3 className="cdp-section-label">Description</h3>
            </div>
            {loading ? (
              <div className="cdp-loading-row">
                <div className="cdp-loading-spinner" />
                <span className="cdp-loading-copy">Loading course details...</span>
              </div>
            ) : splitDetails.description ? (
              <p className="cdp-section-body">
                {renderLinkedText(splitDetails.description, selectCourse)}
              </p>
            ) : (
              <p className="cdp-empty-copy">No description available for this course.</p>
            )}
          </div>

          {(loading || prerequisitesText) && (
            <div className="cdp-section">
              <div className="cdp-section-label-row">
                <svg className="h-3.5 w-3.5 text-muted-foreground/60" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3 8h10M10 5l3 3-3 3" />
                </svg>
                <h3 className="cdp-section-label">Prerequisites</h3>
              </div>
              {loading ? (
                <p className="cdp-loading-copy">Loading...</p>
              ) : prerequisitesText ? (
                <div className="cdp-prereq-box">
                  {renderLinkedText(prerequisitesText, selectCourse)}
                </div>
              ) : null}
            </div>
          )}

          {!loading && !prerequisitesText && !splitDetails.description && (
            <p className="cdp-empty-copy">
              No additional details available. This course may not be in the current catalog.
            </p>
          )}

          {shownGenEds.length > 0 && (
            <div className="cdp-section">
              <div className="cdp-section-label-row">
                <GraduationCap className="h-3.5 w-3.5 text-muted-foreground/60" />
                <h3 className="cdp-section-label">General Education</h3>
              </div>
              <div className="cdp-gened-list">
                {shownGenEds.map((ge) => (
                  <div key={ge} className="cdp-gened-row">
                    <Badge variant="outline" className="cdp-gened-tag">{ge}</Badge>
                    <span className="cdp-gened-copy">{GEN_ED_NAMES[ge] ?? "General Education"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="cdp-footer">
          <div className="cdp-footer-left">
            <AddToScheduleDropdown
              courseCode={activeCourseCode}
              courseTitle={shownTitle}
              credits={Number(shownCredits ?? 0) || 0}
              genEds={shownGenEds}
              onMessage={setAddMessage}
            />
            {addMessage && <span className="cdp-footer-message">{addMessage}</span>}
          </div>
          <a
            href={`https://app.testudo.umd.edu/soc/search?courseId=${activeCourseCode}&sectionId=&termId=&_openSectionsOnly=on&creditCompare=&credits=&courseLevelFilter=ALL&instructor=&_face498to498=on&courseStartCompare=&courseStartHour=&courseStartMin=&courseStartAM=&courseEndHour=&courseEndMin=&courseEndAM=&teachingCenter=ALL&_classDay1=on&_classDay2=on&_classDay3=on&_classDay4=on&_classDay5=on`}
            target="_blank"
            rel="noopener noreferrer"
            className="cdp-testudo-link"
          >
            <ExternalLink className="h-3 w-3" />
            Testudo
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
