import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import type { AuditCourseStatus } from "@/lib/requirements/audit";

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

export function CourseDetailsPopup({
  isOpen,
  onClose,
  courseCode,
  courseTitle,
  credits,
  genEds,
  status,
}: CourseDetailsPopupProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">{courseCode}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-2">
            {courseTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Credits */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Credits:</span>
            <span className="text-foreground font-semibold">{credits}</span>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Status:</span>
            <Badge className={statusColor(status)}>{statusLabel(status)}</Badge>
          </div>

          {/* Gen Eds */}
          {genEds.length > 0 && (
            <div>
              <span className="text-sm font-medium text-muted-foreground block mb-2">General Education:</span>
              <div className="flex flex-wrap gap-2">
                {genEds.map((genEd) => (
                  <Badge key={genEd} variant="outline" className="border-border">
                    {genEd}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Course Code for reference */}
          <div className="pt-4 mt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">Course Code: {courseCode}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
