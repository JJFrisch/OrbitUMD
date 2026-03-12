import { describe, expect, it } from "vitest";
import { parseUnofficialTranscriptText } from "./unofficialTranscriptParser";

describe("parseUnofficialTranscriptText", () => {
  it("extracts profile fields from typical transcript text", () => {
    const text = `
UNIVERSITY OF MARYLAND COLLEGE PARK
UNOFFICIAL TRANSCRIPT
Student Name: Jane Q. Doe
Email: jdoe@umd.edu
UID: 123456789
College: College of Computer, Mathematical, and Natural Sciences
Primary Major: Computer Science BS
Class Standing: Junior
Admit Term: Fall 2023
Expected Graduation: Spring 2027
Cumulative GPA: 3.81
`;

    const result = parseUnofficialTranscriptText(text, "sample.pdf", 1);

    expect(result.fileName).toBe("sample.pdf");
    expect(result.pageCount).toBe(1);
    expect(result.fields.fullName).toBe("Jane Q. Doe");
    expect(result.fields.email).toBe("jdoe@umd.edu");
    expect(result.fields.universityUid).toBe("123456789");
    expect(result.fields.major).toBe("Computer Science");
    expect(result.fields.degree).toBe("BS");
    expect(result.fields.classStanding).toBe("Junior");
    expect(result.fields.admitTerm).toBe("Fall 2023");
    expect(result.fields.graduationYear).toBe("2027");
    expect(result.fields.cumulativeGpa).toBe("3.81");
    expect(result.courses).toEqual([]);
  });

  it("extracts transcript course history and AP rows", () => {
    const text = `
ADVANCED PLACEMENT
MATH140 Calculus I 4.0
Fall 2024
CMSC131 Object-Oriented Programming I A 4.0
MATH141 Calculus II B+ 4.0
ENGL101 Academic Writing W 3.0
Credits Earned: 8.0
Credits Attempted: 11.0
`;

    const result = parseUnofficialTranscriptText(text, "history.pdf", 2);

    expect(result.summary.totalParsedCourses).toBe(4);
    expect(result.summary.totalPassingCourses).toBe(3);
    expect(result.summary.apCredits).toBe(4);
    expect(result.summary.totalCreditsEarned).toBe(8);
    expect(result.summary.totalCreditsAttempted).toBe(11);
    expect(result.courses[0]).toMatchObject({ sourceType: "AP", courseCode: "MATH140", credits: 4, termLabel: "Prior to UMD" });
    expect(result.courses[1]).toMatchObject({ sourceType: "transcript", courseCode: "CMSC131", grade: "A", termLabel: "Fall 2024", countsTowardProgress: true });
    expect(result.courses[3]).toMatchObject({ sourceType: "transcript", courseCode: "ENGL101", grade: "W", countsTowardProgress: false });
  });
});
