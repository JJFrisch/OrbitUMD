const COURSE_CODE_PATTERN = /^([A-Z]{4})(\d{3})([A-Z]?)$/;

function compactUpper(value: string): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeCourseCode(raw: string): string {
  return compactUpper(raw);
}

export function normalizeSubjectCode(raw: string): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z]/g, "");
}

export function normalizeCourseNumber(raw: string): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function canonicalCourseCode(raw: string): string {
  const normalized = normalizeCourseCode(raw);
  const parsed = normalized.match(COURSE_CODE_PATTERN);
  if (!parsed) {
    return normalized;
  }

  const [, subject, number, suffix] = parsed;
  if (suffix === "H") {
    return `${subject}${number}`;
  }

  return normalized;
}

export function canonicalCourseNumber(raw: string): string {
  const normalized = normalizeCourseNumber(raw);
  const honorsMatch = normalized.match(/^(\d{3})H$/);
  if (honorsMatch) {
    return honorsMatch[1];
  }
  return normalized;
}

export function getEquivalentCourseCodes(raw: string): string[] {
  const normalized = normalizeCourseCode(raw);
  const parsed = normalized.match(COURSE_CODE_PATTERN);
  if (!parsed) {
    return normalized ? [normalized] : [];
  }

  const [, subject, number, suffix] = parsed;
  const base = `${subject}${number}`;
  if (suffix === "" || suffix === "H") {
    return [base, `${base}H`];
  }

  return [normalized];
}

export function areEquivalentCourseCodes(leftRaw: string, rightRaw: string): boolean {
  const leftSet = new Set(getEquivalentCourseCodes(leftRaw));
  const rightSet = getEquivalentCourseCodes(rightRaw);
  return rightSet.some((code) => leftSet.has(code));
}

export function areEquivalentCourseNumbers(leftRaw: string, rightRaw: string): boolean {
  const left = normalizeCourseNumber(leftRaw);
  const right = normalizeCourseNumber(rightRaw);
  if (left === right) {
    return true;
  }

  const leftCanonical = canonicalCourseNumber(left);
  const rightCanonical = canonicalCourseNumber(right);
  if (leftCanonical !== rightCanonical) {
    return false;
  }

  return left.endsWith("H") || right.endsWith("H");
}

export function coursePartsAreEquivalent(
  leftSubjectRaw: string,
  leftNumberRaw: string,
  rightSubjectRaw: string,
  rightNumberRaw: string,
): boolean {
  const leftSubject = normalizeSubjectCode(leftSubjectRaw);
  const rightSubject = normalizeSubjectCode(rightSubjectRaw);
  if (!leftSubject || !rightSubject || leftSubject !== rightSubject) {
    return false;
  }

  return areEquivalentCourseNumbers(leftNumberRaw, rightNumberRaw);
}
