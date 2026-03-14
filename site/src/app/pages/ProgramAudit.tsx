import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { ChevronDown, ChevronRight, CheckCircle2, CircleDashed } from "lucide-react";
import { Card } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { getSupabaseClient } from "@/lib/supabase/client";
import { loadProgramAndEvaluate } from "@/lib/requirements/loadProgramAndEvaluate";
import type { BlockEvaluationResultV2, ProgramV2 } from "@/lib/types/requirements";

interface TreeNodeProps {
  node: BlockEvaluationResultV2;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  depth?: number;
}

function countSatisfied(nodes: BlockEvaluationResultV2[]): { total: number; satisfied: number } {
  let total = 0;
  let satisfied = 0;

  const visit = (node: BlockEvaluationResultV2) => {
    total += 1;
    if (node.satisfied) satisfied += 1;
    node.children.forEach(visit);
  };

  nodes.forEach(visit);
  return { total, satisfied };
}

function TreeNode({ node, expanded, onToggle, depth = 0 }: TreeNodeProps) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.block.id);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => onToggle(node.block.id)}
        className="w-full rounded-lg border border-border bg-card p-3 text-left"
        style={{ marginLeft: `${depth * 12}px` }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            {hasChildren ? (
              isOpen ? <ChevronDown className="h-4 w-4 mt-0.5" /> : <ChevronRight className="h-4 w-4 mt-0.5" />
            ) : (
              <span className="inline-block w-4" />
            )}
            {node.satisfied ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
            ) : (
              <CircleDashed className="h-4 w-4 text-amber-500 mt-0.5" />
            )}
            <div>
              <p className="text-sm text-foreground">{node.block.humanLabel}</p>
              {node.messages.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">{node.messages[0]}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {node.remainingCourses !== null && node.remainingCourses > 0 && (
              <Badge variant="outline">{node.remainingCourses} courses left</Badge>
            )}
            {node.remainingCredits !== null && node.remainingCredits > 0 && (
              <Badge variant="outline">{node.remainingCredits} credits left</Badge>
            )}
            {node.overrideApplied && (
              <Badge className="bg-blue-100 text-blue-900 border border-blue-300 dark:bg-blue-600/20 dark:text-blue-300 dark:border-blue-600/30">Override</Badge>
            )}
            <Badge className={node.satisfied ? "bg-green-100 text-green-900 border border-green-300 dark:bg-green-600/20 dark:text-green-300 dark:border-green-600/30" : "bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-600/20 dark:text-amber-300 dark:border-amber-600/30"}>
              {node.satisfied ? "Satisfied" : "Unsatisfied"}
            </Badge>
          </div>
        </div>

        {isOpen && node.usedCourses.length > 0 && (
          <div className="mt-3 rounded-md border border-border bg-muted/40 p-2 text-xs">
            <p className="text-muted-foreground mb-1">Used courses</p>
            <ul className="space-y-1">
              {node.usedCourses.map((course) => (
                <li key={`${node.block.id}-${course.id}`}>
                  {course.subject}{course.number} · {course.title} {course.term ? `(${course.term})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </button>

      {hasChildren && isOpen && (
        <div className="space-y-2">
          {node.children.map((child) => (
            <TreeNode key={child.block.id} node={child} expanded={expanded} onToggle={onToggle} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProgramAuditPage() {
  const { programCode = "" } = useParams();
  const [program, setProgram] = useState<ProgramV2 | null>(null);
  const [results, setResults] = useState<BlockEvaluationResultV2[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;

        const userId = data.user?.id;
        if (!userId) throw new Error("Please sign in to view your audit.");
        if (!programCode) throw new Error("Missing program code in route.");

        const payload = await loadProgramAndEvaluate(userId, programCode);
        if (!active) return;

        setProgram(payload.program);
        setResults(payload.results);

        const defaultExpanded = new Set<string>();
        for (const node of payload.results) {
          defaultExpanded.add(node.block.id);
        }
        setExpanded(defaultExpanded);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load program audit.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [programCode]);

  const stats = useMemo(() => countSatisfied(results), [results]);
  const completionPercent = useMemo(() => {
    if (stats.total === 0) return 0;
    return Math.round((stats.satisfied / stats.total) * 100);
  }, [stats]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading audit...</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <Card className="p-4 border-border bg-card">
        <h1 className="text-2xl text-foreground">{program?.title ?? programCode}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {program?.college ?? "Unknown college"} · {program?.degreeType ?? "Unknown degree"} · Catalog {program?.catalogYearStart ?? "n/a"}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Badge variant="outline">{completionPercent}% complete</Badge>
          <Badge variant="outline">{stats.satisfied}/{stats.total} blocks satisfied</Badge>
        </div>
      </Card>

      <div className="space-y-2">
        {results.map((node) => (
          <TreeNode key={node.block.id} node={node} expanded={expanded} onToggle={toggle} />
        ))}
      </div>
    </div>
  );
}
