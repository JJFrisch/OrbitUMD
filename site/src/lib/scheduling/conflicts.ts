import type { UmdSection } from "../types/course";

export interface MeetingBlock {
  sectionId: string;
  courseId: string;
  day: "M" | "Tu" | "W" | "Th" | "F";
  startMinutes: number;
  endMinutes: number;
}

export interface SectionConflict {
  day: MeetingBlock["day"];
  left: MeetingBlock;
  right: MeetingBlock;
}

export function toMeetingBlocks(sections: UmdSection[]): MeetingBlock[] {
  return sections.flatMap((section) =>
    section.meetings.flatMap((meeting) =>
      meeting.days.map((day) => ({
        sectionId: section.id,
        courseId: section.courseId,
        day,
        startMinutes: meeting.startMinutes,
        endMinutes: meeting.endMinutes,
      }))
    )
  );
}

export function detectScheduleConflicts(sections: UmdSection[]): SectionConflict[] {
  const blocks = toMeetingBlocks(sections);
  const conflicts: SectionConflict[] = [];

  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const left = blocks[i];
      const right = blocks[j];

      if (left.day !== right.day) {
        continue;
      }

      // Skip self-overlap if two meetings belong to the same section instance.
      if (left.sectionId === right.sectionId) {
        continue;
      }

      const overlaps = left.startMinutes < right.endMinutes && right.startMinutes < left.endMinutes;
      if (overlaps) {
        conflicts.push({ day: left.day, left, right });
      }
    }
  }

  return conflicts;
}
