const COURSE_PALETTE = [
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

export function getReadableTextColor(backgroundHex: string): string {
  const clean = backgroundHex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111827" : "#F9FAFB";
}
