import type { CalendarMeeting, Meeting, Weekday } from "../types/coursePlanner";

const DAY_MAP: Record<string, Weekday[]> = {
  M: ["M"],
  W: ["W"],
  F: ["F"],
  Tu: ["Tu"],
  Th: ["Th"],
};

export function parseTimeToHour(time: string): number {
  const match = time.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  if (!match) return Number.NaN;
  const [, hourRaw, minRaw, suffix] = match;
  let hour = Number(hourRaw);
  const min = Number(minRaw);
  if (suffix === "am") {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }
  return hour + min / 60;
}

export function parseMeetingDays(rawDays: string): Weekday[] {
  if (!rawDays || rawDays === "TBA") return ["Other"];
  const days: Weekday[] = [];
  let i = 0;

  while (i < rawDays.length) {
    const two = rawDays.slice(i, i + 2);
    if (DAY_MAP[two]) {
      days.push(...DAY_MAP[two]);
      i += 2;
      continue;
    }

    const one = rawDays.slice(i, i + 1);
    if (DAY_MAP[one]) {
      days.push(...DAY_MAP[one]);
    }
    i += 1;
  }

  return days.length > 0 ? days : ["Other"];
}

export function computeVisibleHourBounds(
  meetings: CalendarMeeting[],
  options?: { printMode?: boolean }
): { startHour: number; endHour: number } {
  if (meetings.length === 0) {
    const start = options?.printMode ? 9 : 8;
    const end = options?.printMode ? 21 : 16;
    return { startHour: start, endHour: end };
  }

  let earliest = Math.min(...meetings.map((meeting) => meeting.startHour));
  let latest = Math.max(...meetings.map((meeting) => meeting.endHour));

  const span = latest - earliest;
  if (span < 8) {
    const pad = (8 - span) / 2;
    earliest -= pad;
    latest += pad;
  }

  earliest = Math.floor(earliest);
  latest = Math.ceil(latest);

  if (options?.printMode) {
    earliest = Math.min(earliest, 9);
    latest = Math.max(latest, 21);
  }

  return { startHour: earliest, endHour: latest };
}

export function assignConflictIndexes(meetings: CalendarMeeting[]): CalendarMeeting[] {
  const byDay = new Map<Weekday, CalendarMeeting[]>();
  for (const meeting of meetings) {
    const list = byDay.get(meeting.day) ?? [];
    list.push({ ...meeting, conflictIndex: 0, conflictTotal: 1 });
    byDay.set(meeting.day, list);
  }

  const updated: CalendarMeeting[] = [];
  for (const [, dayMeetings] of byDay.entries()) {
    if (dayMeetings.length === 0) {
      continue;
    }

    // Asynchronous/other-day items are rendered in a vertical list, not overlap lanes.
    if (dayMeetings[0].day === "Other") {
      dayMeetings.forEach((meeting) => {
        meeting.conflictIndex = 0;
        meeting.conflictTotal = 1;
      });
      updated.push(...dayMeetings);
      continue;
    }

    dayMeetings.sort((a, b) => a.startHour - b.startHour || a.endHour - b.endHour);

    const groups: CalendarMeeting[][] = [];
    let currentGroup: CalendarMeeting[] = [];
    let groupEnd = -Infinity;

    for (const meeting of dayMeetings) {
      if (currentGroup.length === 0 || meeting.startHour < groupEnd) {
        currentGroup.push(meeting);
        groupEnd = Math.max(groupEnd, meeting.endHour);
      } else {
        groups.push(currentGroup);
        currentGroup = [meeting];
        groupEnd = meeting.endHour;
      }
    }
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    for (const group of groups) {
      const active: Array<{ endHour: number; column: number }> = [];
      let maxColumns = 0;

      for (const meeting of group) {
        for (let i = active.length - 1; i >= 0; i -= 1) {
          if (active[i].endHour <= meeting.startHour) {
            active.splice(i, 1);
          }
        }

        const used = new Set(active.map((entry) => entry.column));
        let column = 0;
        while (used.has(column)) column += 1;

        meeting.conflictIndex = column;
        active.push({ endHour: meeting.endHour, column });
        maxColumns = Math.max(maxColumns, active.length);
      }

      const normalizedTotal = Math.max(1, maxColumns);
      for (const meeting of group) {
        meeting.conflictTotal = normalizedTotal;
      }
    }

    updated.push(...dayMeetings);
  }

  return updated;
}

export function getBlockGeometry(
  meeting: CalendarMeeting,
  bounds: { startHour: number; endHour: number }
): { topPct: number; heightPct: number; leftPct: number; widthPct: number } {
  const totalRange = Math.max(1, bounds.endHour - bounds.startHour);
  const topPct = ((meeting.startHour - bounds.startHour) / totalRange) * 100;
  const heightPct = ((meeting.endHour - meeting.startHour) / totalRange) * 100;
  const widthPct = 100 / meeting.conflictTotal;
  const leftPct = widthPct * meeting.conflictIndex;

  return {
    topPct: Math.max(0, topPct),
    heightPct: Math.max(1, heightPct),
    leftPct,
    widthPct,
  };
}

export function buildCalendarMeetings(params: {
  sectionKey: string;
  courseCode: string;
  displayCourseCode?: string;
  sectionCode: string;
  title: string;
  instructor: string;
  meetings: Meeting[];
  isHoverPreview?: boolean;
}): CalendarMeeting[] {
  const built: CalendarMeeting[] = [];

  for (const meeting of params.meetings) {
    const startHour = meeting.startTime ? parseTimeToHour(meeting.startTime) : Number.NaN;
    const endHour = meeting.endTime ? parseTimeToHour(meeting.endTime) : Number.NaN;
    const days = parseMeetingDays(meeting.days);

    if (!Number.isFinite(startHour) || !Number.isFinite(endHour) || days.includes("Other")) {
      built.push({
        id: `${params.sectionKey}-other-${built.length}`,
        sectionKey: params.sectionKey,
        courseCode: params.courseCode,
        displayCourseCode: params.displayCourseCode,
        sectionCode: params.sectionCode,
        title: params.title,
        instructor: params.instructor,
        day: "Other",
        startHour: 0,
        endHour: 0,
        location: meeting.location,
        conflictIndex: 0,
        conflictTotal: 1,
        isHoverPreview: params.isHoverPreview,
      });
      continue;
    }

    for (const day of days) {
      built.push({
        id: `${params.sectionKey}-${day}-${built.length}`,
        sectionKey: params.sectionKey,
        courseCode: params.courseCode,
        displayCourseCode: params.displayCourseCode,
        sectionCode: params.sectionCode,
        title: params.title,
        instructor: params.instructor,
        day,
        startHour,
        endHour,
        location: meeting.location,
        conflictIndex: 0,
        conflictTotal: 1,
        isHoverPreview: params.isHoverPreview,
      });
    }
  }

  return built;
}
