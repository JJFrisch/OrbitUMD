const UNSPECIFIED_SECTION_CODES = new Set(["UNCHOOSEN", "UNSPECIFIED", "PLANNED"]);

export function isUnspecifiedSectionCode(sectionCode: string | null | undefined): boolean {
  const normalized = String(sectionCode ?? "").trim().toUpperCase();
  if (!normalized) return true;
  return UNSPECIFIED_SECTION_CODES.has(normalized);
}

export function formatSectionLabel(sectionCode: string | null | undefined): string {
  if (isUnspecifiedSectionCode(sectionCode)) {
    return "Section unspecified";
  }
  return `Section ${String(sectionCode ?? "").trim()}`;
}
