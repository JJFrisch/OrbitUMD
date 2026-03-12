import { compareAcademicTerms } from "@/lib/scheduling/termProgress";
import type { PriorCreditSource } from "@/lib/types/requirements";

export const UMD_GRADE_QUALITY_POINTS: Record<string, number> = {
  "A+": 4.0,
  A: 4.0,
  "A-": 3.7,
  "B+": 3.3,
  B: 3.0,
  "B-": 2.7,
  "C+": 2.3,
  C: 2.0,
  "C-": 1.7,
  "D+": 1.3,
  D: 1.0,
  "D-": 0.7,
  F: 0.0,
};

const NON_GPA_GRADES = new Set(["P", "S", "U", "I", "W", "AUD", "NGR", "IP", "NG", "NC", "CR", "WP", "WF"]);

export interface GPACourseInput {
  credits: number;
  grade: string;
}

export interface SemesterGPAResult {
  semesterGPA: number | null;
  semesterAttemptedCredits: number;
  semesterQualityPoints: number;
}

export interface CumulativeGPAResult {
  newCumulativeGPA: number | null;
  newAttemptedCredits: number;
  newQualityPoints: number;
}

export interface DesiredGPAScenario {
  extraCredits: number;
  requiredTermGPA: number;
}

export interface TranscriptPriorCreditLike {
  sourceType: PriorCreditSource | string;
  termAwarded?: string;
  grade?: string;
  credits: number;
}

export interface TranscriptTermGPA {
  termLabel: string;
  semesterGPA: number | null;
  attemptedCredits: number;
  qualityPoints: number;
  cumulativeGPA: number | null;
}

export interface TranscriptGPAHistory {
  overallGPA: number | null;
  attemptedCredits: number;
  qualityPoints: number;
  terms: TranscriptTermGPA[];
}

function normalizeGrade(rawGrade: string): string {
  return String(rawGrade ?? "").trim().toUpperCase();
}

function roundGPA(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

function validateCredits(rawCredits: number): number {
  const credits = Number(rawCredits);
  if (!Number.isFinite(credits) || credits < 0) {
    throw new Error("Credits must be a non-negative number.");
  }
  return credits;
}

function parseAcademicTermLabel(termLabel: string): { termCode: string; termYear: number } | null {
  const match = String(termLabel ?? "").match(/^(Spring|Summer|Fall|Winter)\s+(20\d{2})$/i);
  if (!match) return null;
  const season = match[1].toLowerCase();
  return {
    termCode: season === "spring" ? "01" : season === "summer" ? "05" : season === "fall" ? "08" : "12",
    termYear: Number(match[2]),
  };
}

function isGpaIncludedGrade(grade: string): boolean {
  return grade in UMD_GRADE_QUALITY_POINTS;
}

function validateGrade(grade: string): void {
  if (isGpaIncludedGrade(grade) || NON_GPA_GRADES.has(grade)) {
    return;
  }
  throw new Error(`Invalid grade: ${grade}`);
}

export function calculateSemesterGPA(courses: GPACourseInput[]): SemesterGPAResult {
  let semesterAttemptedCredits = 0;
  let semesterQualityPoints = 0;

  for (const course of courses) {
    const credits = validateCredits(course.credits);
    const grade = normalizeGrade(course.grade);
    validateGrade(grade);

    // UMD Testudo GPA rules: only A+ through F count toward GPA.
    if (!isGpaIncludedGrade(grade)) {
      continue;
    }

    semesterAttemptedCredits += credits;
    semesterQualityPoints += credits * UMD_GRADE_QUALITY_POINTS[grade];
  }

  return {
    semesterGPA: semesterAttemptedCredits > 0 ? roundGPA(semesterQualityPoints / semesterAttemptedCredits) : null,
    semesterAttemptedCredits,
    semesterQualityPoints: Math.round(semesterQualityPoints * 1000) / 1000,
  };
}

export function calculateNewCumulativeGPA(
  prevAttempted: number,
  prevGPA: number,
  semesterResult: SemesterGPAResult,
): CumulativeGPAResult {
  const previousAttemptedCredits = validateCredits(prevAttempted);
  const previousGPA = Number(prevGPA);
  if (!Number.isFinite(previousGPA) || previousGPA < 0 || previousGPA > 4) {
    throw new Error("Previous cumulative GPA must be between 0.0 and 4.0.");
  }

  const prevCumulativeQualityPoints = previousAttemptedCredits * previousGPA;
  const newAttemptedCredits = previousAttemptedCredits + semesterResult.semesterAttemptedCredits;
  const newQualityPoints = prevCumulativeQualityPoints + semesterResult.semesterQualityPoints;

  return {
    newCumulativeGPA: newAttemptedCredits > 0 ? roundGPA(newQualityPoints / newAttemptedCredits) : null,
    newAttemptedCredits,
    newQualityPoints: Math.round(newQualityPoints * 1000) / 1000,
  };
}

export function calculateDesiredGPAScenarios(
  currentAttempted: number,
  currentGPA: number,
  desiredGPA: number,
): DesiredGPAScenario[] {
  const attemptedCredits = validateCredits(currentAttempted);
  if (!Number.isFinite(currentGPA) || currentGPA < 0 || currentGPA > 4) {
    throw new Error("Current cumulative GPA must be between 0.0 and 4.0.");
  }
  if (!Number.isFinite(desiredGPA) || desiredGPA < 0 || desiredGPA > 4) {
    throw new Error("Desired GPA must be between 0.0 and 4.0.");
  }

  const currentTotalQP = attemptedCredits * currentGPA;
  const scenarios: DesiredGPAScenario[] = [];

  for (let extraCredits = 3; extraCredits <= 60; extraCredits += 3) {
    const requiredTermGPA = ((desiredGPA * (attemptedCredits + extraCredits)) - currentTotalQP) / extraCredits;
    if (!Number.isFinite(requiredTermGPA)) continue;
    if (requiredTermGPA < 0 || requiredTermGPA > 4) continue;
    scenarios.push({
      extraCredits,
      requiredTermGPA: roundGPA(requiredTermGPA) ?? 0,
    });
  }

  return scenarios;
}

export function calculateTranscriptGPAHistory(priorCredits: TranscriptPriorCreditLike[]): TranscriptGPAHistory {
  const grouped = new Map<string, GPACourseInput[]>();

  for (const credit of priorCredits) {
    if (credit.sourceType !== "transcript") continue;
    const termLabel = String(credit.termAwarded ?? "").trim();
    if (!parseAcademicTermLabel(termLabel)) continue;
    const grade = normalizeGrade(String(credit.grade ?? ""));
    if (!grade) continue;

    const entries = grouped.get(termLabel) ?? [];
    entries.push({ credits: credit.credits, grade });
    grouped.set(termLabel, entries);
  }

  const orderedTerms = Array.from(grouped.keys()).sort((left, right) => {
    const leftTerm = parseAcademicTermLabel(left);
    const rightTerm = parseAcademicTermLabel(right);
    if (!leftTerm || !rightTerm) return left.localeCompare(right);
    return compareAcademicTerms(leftTerm, rightTerm);
  });

  let cumulativeAttempted = 0;
  let cumulativeQualityPoints = 0;
  const terms: TranscriptTermGPA[] = [];

  for (const termLabel of orderedTerms) {
    const semesterResult = calculateSemesterGPA(grouped.get(termLabel) ?? []);
    cumulativeAttempted += semesterResult.semesterAttemptedCredits;
    cumulativeQualityPoints += semesterResult.semesterQualityPoints;

    terms.push({
      termLabel,
      semesterGPA: semesterResult.semesterGPA,
      attemptedCredits: semesterResult.semesterAttemptedCredits,
      qualityPoints: semesterResult.semesterQualityPoints,
      cumulativeGPA: cumulativeAttempted > 0 ? roundGPA(cumulativeQualityPoints / cumulativeAttempted) : null,
    });
  }

  return {
    overallGPA: cumulativeAttempted > 0 ? roundGPA(cumulativeQualityPoints / cumulativeAttempted) : null,
    attemptedCredits: cumulativeAttempted,
    qualityPoints: Math.round(cumulativeQualityPoints * 1000) / 1000,
    terms,
  };
}
