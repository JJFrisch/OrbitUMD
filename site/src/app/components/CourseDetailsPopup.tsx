import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import type { AuditCourseStatus } from "@/lib/requirements/audit";
import { lookupCourseDetails, type CourseDetails } from "@/lib/requirements/courseDetailsLoader";

interface CourseDetailsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  courseCode: string;
  courseTitle: string;
  credits: number;
  genEds: string[];
  status: AuditCourseStatus;
}

function statusColor(status: AuditCourseStatus): string {
  if (status === "completed") return "bg-green-600/20 text-green-400 border border-green-600/30";
  if (status === "in_progress") return "bg-blue-600/20 text-blue-400 border border-blue-600/30";
  if (status === "planned") return "bg-amber-600/20 text-amber-300 border border-amber-600/30";
  return "bg-slate-600/20 text-slate-400 border border-slate-600/30";
}

function statusLabel(status: AuditCourseStatus): string {
  if (status === "completed") return "Completed";
  if (status === "in_progress") return "In Progress";
  if (status === "planned") return "Planned";
  return "Not Started";
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
        className="text-red-500 hover:text-red-600 underline underline-offset-2"
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

  useEffect(() => {
    if (!isOpen) return;
    setActiveCourseCode(courseCode);
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

  const shownTitle = activeDetails?.title ?? (activeCourseCode === courseCode ? courseTitle : `${activeCourseCode} (Course details unavailable)`);
  const shownCredits = activeDetails?.credits ?? (activeCourseCode === courseCode ? credits : 0);
  const shownGenEds = activeDetails?.genEds ?? (activeCourseCode === courseCode ? genEds : []);
  const isOriginalCourse = activeCourseCode === courseCode;

  const splitDetails = useMemo(
    () => splitDescriptionAndPrerequisites(activeDetails?.description),
    [activeDetails?.description],
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">{activeCourseCode} {shownTitle} ({shownCredits} Credits)</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-2">
            Click any course code in the description or prerequisites to open it here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Credits */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Credits:</span>
            <span className="text-foreground font-semibold">{shownCredits}</span>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Status:</span>
            {isOriginalCourse ? (
              <Badge className={statusColor(status)}>{statusLabel(status)}</Badge>
            ) : (
              <Badge variant="outline" className="border-border text-muted-foreground">Not in current audit selection</Badge>
            )}
          </div>

          {/* Gen Eds */}
          {shownGenEds.length > 0 && (
            <div>
              <span className="text-sm font-medium text-muted-foreground block mb-2">General Education:</span>
              <div className="flex flex-wrap gap-2">
                {shownGenEds.map((genEd) => (
                  <Badge key={genEd} variant="outline" className="border-border">
                    {genEd}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div>
            <span className="text-sm font-medium text-muted-foreground block mb-2">Description:</span>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading course details...</p>
            ) : splitDetails.description ? (
              <p className="text-sm leading-6 text-foreground/90 whitespace-pre-wrap">
                {renderLinkedText(splitDetails.description, setActiveCourseCode)}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No description available.</p>
            )}
          </div>

          <div>
            <span className="text-sm font-medium text-muted-foreground block mb-2">Prerequisites:</span>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading prerequisites...</p>
            ) : splitDetails.prerequisites ? (
              <p className="text-sm leading-6 text-foreground/90 whitespace-pre-wrap">
                {renderLinkedText(splitDetails.prerequisites, setActiveCourseCode)}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No prerequisite information available.</p>
            )}
          </div>

          {/* Course Code for reference */}
          <div className="pt-4 mt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">Course Code: {activeCourseCode}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
