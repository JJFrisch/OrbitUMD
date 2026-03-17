import { useMemo, useState } from "react";
import { Info, SlidersHorizontal, X } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import type { NeededClassItem } from "@/lib/requirements/neededClassesAdvisor";

type NeededSort = "category" | "recommended" | "code";
type NeededFilter = "all" | "major_minor" | "gened" | "elective";

interface NeededClassesPanelProps {
  open: boolean;
  title: string;
  subtitle?: string;
  items: NeededClassItem[];
  defaultSort?: NeededSort;
  onClose: () => void;
  onApplyGenEdFilter?: (genEdCode: string) => void;
  onAddCourse?: (item: NeededClassItem) => void;
  draggable?: boolean;
}

export function NeededClassesPanel({
  open,
  title,
  subtitle,
  items,
  defaultSort = "category",
  onClose,
  onApplyGenEdFilter,
  onAddCourse,
  draggable = true,
}: NeededClassesPanelProps) {
  const [sortBy, setSortBy] = useState<NeededSort>(defaultSort);
  const [filterBy, setFilterBy] = useState<NeededFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visibleItems = useMemo(() => {
    const filtered = filterBy === "all" ? items : items.filter((item) => item.category === filterBy);

    const sorted = [...filtered].sort((left, right) => {
      if (sortBy === "recommended") {
        return right.recommendationScore - left.recommendationScore;
      }
      if (sortBy === "code") {
        return String(left.courseCode ?? left.genEdCode ?? left.title).localeCompare(String(right.courseCode ?? right.genEdCode ?? right.title));
      }
      const categoryOrder = { major_minor: 0, gened: 1, elective: 2 } as const;
      const categoryDelta = categoryOrder[left.category] - categoryOrder[right.category];
      if (categoryDelta !== 0) return categoryDelta;
      return left.sortableProgram.localeCompare(right.sortableProgram);
    });

    return sorted;
  }, [filterBy, items, sortBy]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-border bg-card shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-border bg-card/95 p-4 backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg text-foreground">{title}</h2>
              {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
            </div>
            <Button type="button" size="icon" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Sort
            </div>
            <Button type="button" size="sm" variant={sortBy === "category" ? "default" : "outline"} onClick={() => setSortBy("category")}>Category</Button>
            <Button type="button" size="sm" variant={sortBy === "recommended" ? "default" : "outline"} onClick={() => setSortBy("recommended")}>Recommended</Button>
            <Button type="button" size="sm" variant={sortBy === "code" ? "default" : "outline"} onClick={() => setSortBy("code")}>Code</Button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant={filterBy === "all" ? "default" : "outline"} onClick={() => setFilterBy("all")}>All</Button>
            <Button type="button" size="sm" variant={filterBy === "major_minor" ? "default" : "outline"} onClick={() => setFilterBy("major_minor")}>Major / Minor</Button>
            <Button type="button" size="sm" variant={filterBy === "gened" ? "default" : "outline"} onClick={() => setFilterBy("gened")}>Gen Ed</Button>
            <Button type="button" size="sm" variant={filterBy === "elective" ? "default" : "outline"} onClick={() => setFilterBy("elective")}>Elective</Button>
          </div>
        </div>

        <div className="space-y-2 p-4">
          {visibleItems.map((item) => {
            const detailOpen = expandedId === item.id;
            return (
              <div
                key={item.id}
                className="rounded-lg border border-border bg-input-background p-3"
                draggable={draggable && item.draggable}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData("text/plain", JSON.stringify({
                    type: "needed-course",
                    courseCode: item.courseCode,
                    title: item.title,
                    credits: item.credits,
                    genEdCode: item.genEdCode,
                  }));
                }}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm text-foreground">
                      {item.courseCode ? `${item.courseCode} - ` : ""}
                      {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.programLabel ?? (item.category === "gened" ? "General Education" : "Elective")}
                      {item.recommendedTermLabel ? ` · Suggested: ${item.recommendedTermLabel}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className="border-border text-foreground/80">
                    {Math.max(0, Math.round(item.recommendationScore))}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {item.category === "gened" && item.genEdCode && onApplyGenEdFilter && (
                    <Button type="button" size="sm" variant="outline" onClick={() => onApplyGenEdFilter(item.genEdCode!)}>
                      Apply Filter
                    </Button>
                  )}
                  {item.courseCode && onAddCourse && (
                    <Button type="button" size="sm" variant="outline" onClick={() => onAddCourse(item)}>
                      Add
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpandedId((current) => (current === item.id ? null : item.id))}
                  >
                    <Info className="h-3.5 w-3.5 mr-1" />
                    {detailOpen ? "Hide Advice" : "Info"}
                  </Button>
                </div>

                {detailOpen && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {item.rationale.map((reason, index) => (
                      <li key={`${item.id}-reason-${index}`}>• {reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          {visibleItems.length === 0 && <p className="text-sm text-muted-foreground">No remaining items for this filter.</p>}
        </div>
      </aside>
    </div>
  );
}
