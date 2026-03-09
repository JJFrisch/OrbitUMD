import type { Meeting } from "../types/coursePlanner";

const MAP_BUILDING_CODE_REGEX = /^[A-Z]{2,6}$/;

export function sanitizeNullableText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  if (lowered === "null" || lowered === "undefined") {
    return null;
  }

  return trimmed;
}

export function formatCredits(minCredits?: number | null, maxCredits?: number | null): string {
  const min = Number(minCredits);
  const max = Number(maxCredits);

  if (Number.isFinite(min) && Number.isFinite(max)) {
    if (min === max) return `${max} credits`;
    return `${min} - ${max} credits`;
  }

  if (Number.isFinite(max)) return `${max} credits`;
  if (Number.isFinite(min)) return `${min} credits`;
  return "Credits unavailable";
}

export function formatClassDayTime(classtime: Pick<Meeting, "days" | "startTime" | "endTime">): string {
  const days = sanitizeNullableText(classtime.days) ?? "TBA";
  const start = sanitizeNullableText(classtime.startTime);
  const end = sanitizeNullableText(classtime.endTime);

  if (start && end) return `${days} ${start} - ${end}`;
  if (start) return `${days} ${start}`;
  return days;
}

function normalizeLocationText(value: string): string {
  const lowered = value.toLowerCase();
  if (lowered.includes("online") && lowered.includes("async")) return "Online Async";
  if (lowered.includes("online")) return "Online";
  if (lowered === "tba") return "TBA";
  return value;
}

export function formatLocation(location: Pick<Meeting, "building" | "room" | "location" | "classtype">): string {
  const building = sanitizeNullableText(location.building);
  const room = sanitizeNullableText(location.room);

  if (building && room) {
    return `${building} ${room}`;
  }

  const rawLocation = sanitizeNullableText(location.location);
  if (rawLocation) {
    return normalizeLocationText(rawLocation);
  }

  const classtype = sanitizeNullableText(location.classtype);
  if (classtype) {
    return normalizeLocationText(classtype);
  }

  return "TBA";
}

export function buildTestudoCourseLink(courseCode: string, termYear: string): string {
  const normalizedCode = encodeURIComponent(courseCode.trim().toUpperCase());
  const normalizedTerm = encodeURIComponent(termYear.trim());
  return `https://app.testudo.umd.edu/soc/search?courseId=${normalizedCode}&sectionId=&termId=${normalizedTerm}`;
}

export function buildPlanetTerpProfessorLink(slug: string): string {
  return `https://planetterp.com/professor/${encodeURIComponent(slug.trim())}`;
}

export function buildUmdMapLink(buildingCode: string): string {
  return `https://maps.umd.edu/map/?search=${encodeURIComponent(buildingCode.trim().toUpperCase())}`;
}

export function convertRatingToPercent(rating: number | string): number {
  const parsed = typeof rating === "number" ? rating : Number(rating);
  if (!Number.isFinite(parsed)) return 0;
  const clamped = Math.min(5, Math.max(0, parsed));
  return (clamped / 5) * 100;
}

export function isMappableBuildingCode(buildingCode: string | undefined): boolean {
  if (!buildingCode) return false;
  return MAP_BUILDING_CODE_REGEX.test(buildingCode.trim().toUpperCase());
}
