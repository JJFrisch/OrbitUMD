export type AcademicProgressStatus = "completed" | "in_progress" | "planned";

export interface AcademicTermRef {
  termCode: string;
  termYear: number;
}

const TERM_ORDER: Record<string, number> = {
  "12": 0, // winter
  "01": 1, // spring
  "05": 2, // summer
  "08": 3, // fall
};

function normalizeTermCode(termCode: string): string {
  return termCode.padStart(2, "0");
}

function termRank(term: AcademicTermRef): number {
  const code = normalizeTermCode(term.termCode);
  const seasonOrder = TERM_ORDER[code] ?? 99;
  return term.termYear * 10 + seasonOrder;
}

export function compareAcademicTerms(left: AcademicTermRef, right: AcademicTermRef): number {
  return termRank(left) - termRank(right);
}

export function getCurrentAcademicTerm(now: Date = new Date()): AcademicTermRef {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (month === 1) {
    return { termCode: "12", termYear: year };
  }

  if (month >= 2 && month <= 5) {
    return { termCode: "01", termYear: year };
  }

  if (month >= 6 && month <= 8) {
    return { termCode: "05", termYear: year };
  }

  return { termCode: "08", termYear: year };
}

export function getAcademicProgressStatus(term: AcademicTermRef, now: Date = new Date()): AcademicProgressStatus {
  const current = getCurrentAcademicTerm(now);
  const comparison = compareAcademicTerms(term, current);

  if (comparison < 0) {
    return "completed";
  }

  if (comparison === 0) {
    return "in_progress";
  }

  return "planned";
}
