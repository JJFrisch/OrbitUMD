import type { CalendarMeeting } from "../types/coursePlanner";

export const COURSE_PALETTE = [
  "#D94949",
  "#3B82F6",
  "#0EA5A4",
  "#8B5CF6",
  "#F59E0B",
  "#10B981",
  "#EC4899",
  "#6366F1",
  "#06B6D4",
  "#E11D48",
  "#22C55E",
  "#0EA5E9",
  "#F97316",
  "#14B8A6",
  "#A855F7",
  "#F43F5E",
  "#84CC16",
  "#EF4444",
  "#06B6D4",
  "#F59E0B",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalizeCourseCode(courseCode: string): string {
  return courseCode.trim().toUpperCase();
}

export function getCourseColor(courseCode: string): string {
  const normalized = normalizeCourseCode(courseCode);
  const idx = hashString(normalized) % COURSE_PALETTE.length;
  return COURSE_PALETTE[idx];
}

function generatedColor(index: number): string {
  const hue = (index * 137.508) % 360;
  return `hsl(${Math.round(hue)} 70% 52%)`;
}

export function buildSectionColorMap(meetings: CalendarMeeting[]): Record<string, string> {
  const colorBySection: Record<string, string> = {};
  const seen = new Set<string>();
  const sectionOrder: string[] = [];

  for (const meeting of meetings) {
    if (seen.has(meeting.sectionKey)) continue;
    seen.add(meeting.sectionKey);
    sectionOrder.push(meeting.sectionKey);
  }

  sectionOrder.forEach((sectionKey, idx) => {
    colorBySection[sectionKey] = COURSE_PALETTE[idx] ?? generatedColor(idx);
  });

  return colorBySection;
}

export function getReadableTextColor(backgroundHex: string): string {
  const clean = backgroundHex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111827" : "#F9FAFB";
}
