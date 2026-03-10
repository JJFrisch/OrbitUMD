import { useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { CourseDetailsPopup } from "./CourseDetailsPopup";
import type { AuditCourseStatus } from "@/lib/requirements/audit";

interface CourseRowDisplayProps {
  courseCode: string;
  courseTitle: string;
  credits: number;
  genEds: string[];
  status: AuditCourseStatus;
}

function statusBadge(status: AuditCourseStatus) {
  if (status === "completed") {
    return <Badge className="bg-green-600/20 text-green-400 border border-green-600/30">Completed</Badge>;
  }
  if (status === "in_progress") {
    return <Badge className="bg-blue-600/20 text-blue-400 border border-blue-600/30">In Progress</Badge>;
  }
  if (status === "planned") {
    return <Badge className="bg-amber-600/20 text-amber-300 border border-amber-600/30">Planned</Badge>;
  }
  return <Badge variant="outline" className="border-border">Not Started</Badge>;
}

export function CourseRowDisplay({
  courseCode,
  courseTitle,
  credits,
  genEds,
  status,
}: CourseRowDisplayProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between py-3 px-4 border-b border-border/50 last:border-b-0 hover:bg-accent/30 transition-colors">
        <div className="flex-1 min-w-0">
          <Button
            variant="link"
            className="h-auto p-0 text-base font-medium text-red-500 hover:text-red-600 justify-start"
            onClick={() => setShowDetails(true)}
          >
            {courseCode}
          </Button>
          <p className="text-sm text-muted-foreground mt-1">{courseTitle}</p>
          {genEds.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {genEds.map((genEd) => (
                <Badge key={genEd} variant="outline" className="border-border text-xs">
                  {genEd}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 ml-4">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">{credits} cr</span>
          {statusBadge(status)}
        </div>
      </div>

      <CourseDetailsPopup
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
        courseCode={courseCode}
        courseTitle={courseTitle}
        credits={credits}
        genEds={genEds}
        status={status}
      />
    </>
  );
}
