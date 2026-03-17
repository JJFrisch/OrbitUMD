import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { addCourseToSchedule, listAvailableScheduleChoices, type ScheduleChoice } from "@/lib/scheduling/quickAddToSchedule";

type AddToScheduleDropdownProps = {
  courseCode: string;
  courseTitle: string;
  credits: number;
  genEds?: string[];
  buttonLabel?: string;
  compact?: boolean;
  onMessage?: (message: string) => void;
};

const TERM_LABEL: Record<string, string> = {
  "01": "Spring",
  "05": "Summer",
  "08": "Fall",
  "12": "Winter",
};

export function AddToScheduleDropdown({
  courseCode,
  courseTitle,
  credits,
  genEds,
  buttonLabel = "Add to schedule",
  compact = false,
  onMessage,
}: AddToScheduleDropdownProps) {
  const [open, setOpen] = useState(false);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [schedules, setSchedules] = useState<ScheduleChoice[]>([]);
  const [pendingScheduleId, setPendingScheduleId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || schedules.length > 0 || loadingSchedules) return;

    let active = true;
    const run = async () => {
      setLoadingSchedules(true);
      try {
        const choices = await listAvailableScheduleChoices();
        if (!active) return;
        setSchedules(choices);
      } catch (error) {
        if (!active) return;
        setSchedules([]);
        onMessage?.(error instanceof Error ? error.message : "Unable to load schedules.");
      } finally {
        if (active) setLoadingSchedules(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [loadingSchedules, onMessage, open, schedules.length]);

  const isBusy = useMemo(() => pendingScheduleId !== null, [pendingScheduleId]);

  const handleAdd = async (schedule: ScheduleChoice) => {
    setPendingScheduleId(schedule.id);
    try {
      const result = await addCourseToSchedule({
        courseCode,
        courseTitle,
        credits,
        genEds,
        scheduleId: schedule.id,
      });

      if (result.added) {
        onMessage?.(`Added ${courseCode.toUpperCase()} to ${result.scheduleName}.`);
      } else {
        onMessage?.(result.reason ?? `${courseCode.toUpperCase()} is already in ${result.scheduleName}.`);
      }
      setOpen(false);
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : "Unable to add course to schedule.");
    } finally {
      setPendingScheduleId(null);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size={compact ? "sm" : "default"}
          variant="outline"
          className="border-border"
          disabled={isBusy}
          aria-label={buttonLabel}
          title={buttonLabel}
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{buttonLabel}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Select a schedule</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loadingSchedules ? (
          <DropdownMenuItem disabled>Loading schedules...</DropdownMenuItem>
        ) : schedules.length === 0 ? (
          <DropdownMenuItem disabled>No schedules available</DropdownMenuItem>
        ) : (
          schedules.map((schedule) => (
            <DropdownMenuItem
              key={schedule.id}
              disabled={isBusy}
              onSelect={(event) => {
                event.preventDefault();
                void handleAdd(schedule);
              }}
              className="flex flex-col items-start gap-0"
            >
              <span>{schedule.name}</span>
              <span className="text-xs text-muted-foreground">
                {(TERM_LABEL[schedule.termCode] ?? "Term")} {schedule.termYear}
                {schedule.isPrimary ? " · MAIN" : ""}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
