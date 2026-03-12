import { describe, expect, it } from "vitest";
import { calculateDesiredGPAScenarios, calculateSemesterGPA, calculateTranscriptGPAHistory } from "./gpa";

describe("gpa utilities", () => {
  it("calculates semester GPA using UMD quality points", () => {
    const result = calculateSemesterGPA([
      { credits: 4, grade: "A" },
      { credits: 3, grade: "B+" },
      { credits: 1, grade: "P" },
    ]);

    expect(result.semesterAttemptedCredits).toBe(7);
    expect(result.semesterQualityPoints).toBe(25.9);
    expect(result.semesterGPA).toBe(3.7);
  });

  it("builds transcript GPA history from transcript-only UMD terms", () => {
    const result = calculateTranscriptGPAHistory([
      { sourceType: "AP", termAwarded: "Prior to UMD", grade: "P", credits: 4 },
      { sourceType: "transcript", termAwarded: "Fall 2024", grade: "A", credits: 4 },
      { sourceType: "transcript", termAwarded: "Fall 2024", grade: "B+", credits: 3 },
      { sourceType: "transcript", termAwarded: "Spring 2025", grade: "A-", credits: 3 },
      { sourceType: "transcript", termAwarded: "Spring 2025", grade: "W", credits: 1 },
    ]);

    expect(result.attemptedCredits).toBe(10);
    expect(result.overallGPA).toBe(3.7);
    expect(result.terms).toEqual([
      {
        termLabel: "Fall 2024",
        semesterGPA: 3.7,
        attemptedCredits: 7,
        qualityPoints: 25.9,
        cumulativeGPA: 3.7,
      },
      {
        termLabel: "Spring 2025",
        semesterGPA: 3.7,
        attemptedCredits: 3,
        qualityPoints: 11.1,
        cumulativeGPA: 3.7,
      },
    ]);
  });

  it("returns feasible desired GPA scenarios in 3-credit increments", () => {
    const result = calculateDesiredGPAScenarios(30, 3.2, 3.3);

    expect(result[0]).toEqual({ extraCredits: 6, requiredTermGPA: 3.8 });
    expect(result.some((scenario) => scenario.extraCredits === 6 && scenario.requiredTermGPA < 4)).toBe(true);
  });
});