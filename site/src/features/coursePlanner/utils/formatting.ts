import type { Course, SearchFilters } from "../types/coursePlanner";

export const EXACT_COURSE_CODE_REGEX = /^[A-Z]{4}[0-9]{3}[A-Z]{0,2}$/;
export const NUMBER_SEARCH_REGEX = /^[0-9]{3}[A-Z]?$/;

export function normalizeSearchInput(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

export function extractDeptPrefix(normalizedInput: string): string {
  const match = normalizedInput.match(/^[A-Z]{1,4}/);
  return match ? match[0] : "";
}

export function getAppliedFilterCount(filters: SearchFilters): number {
  return [
    filters.genEds.length > 0,
    Boolean(filters.instructor),
    filters.minCredits !== null,
    filters.maxCredits !== null,
    filters.onlyOpen,
    Boolean(filters.searchTerm),
  ].filter(Boolean).length;
}

export function getSectionIdentityKey(courseCode: string, sectionCode: string): string {
  return `${courseCode}::${sectionCode}`;
}

export function fallbackTextMatch(course: Course, normalizedInput: string): boolean {
  const haystack = `${course.courseCode} ${course.name}`.toUpperCase();
  return haystack.includes(normalizedInput);
}
