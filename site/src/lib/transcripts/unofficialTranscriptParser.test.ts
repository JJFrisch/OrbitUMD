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
    expect(result.fields.college).toBe("College of Computer, Mathematical, and Natural Sciences");
    expect(result.courses).toEqual([]);
  });

  it("extracts transcript course history and AP rows from Testudo-style sections", () => {
    const text = `
UNOFFICIAL TRANSCRIPT
** Transfer Credit Information ** ** Equivalences **
Advanced Placement Exam
CALCULUS AB/SCR 4 P 4.00 MATH140
Historic Course Information is listed in the order:
Fall 2024
CMSC131 OBJECT-ORIENTED PROG I A 4.00 4.00 16.00
MATH141 CALCULUS II B+ 4.00 4.00 13.20 FSAR
ENGL101 ACADEMIC WRITING W 3.00 0.00 0.00 FSAW
UG Cumulative: 11.00; 8.00; 29.20; 3.65
Credits Earned: 8.0
Credits Attempted: 11.0
`;

    const result = parseUnofficialTranscriptText(text, "history.pdf", 2);

    expect(result.transfers).toHaveLength(1);
    expect(result.historicTerms).toHaveLength(1);
    expect(result.currentTerm).toBeNull();
    expect(result.summary.totalParsedCourses).toBe(4);
    expect(result.summary.totalPassingCourses).toBe(3);
    expect(result.summary.apCredits).toBe(4);
    expect(result.summary.apEquivalencyCount).toBe(1);
    expect(result.summary.historicCourseCount).toBe(3);
    expect(result.summary.totalCreditsEarned).toBe(8);
    expect(result.summary.totalCreditsAttempted).toBe(11);
    expect(result.courses[0]).toMatchObject({ sourceType: "AP", courseCode: "MATH140", credits: 4, termLabel: "Prior to UMD" });
    expect(result.courses[1]).toMatchObject({ sourceType: "transcript", courseCode: "CMSC131", grade: "A", termLabel: "Fall 2024", countsTowardProgress: true, genEdCodes: [] });
    expect(result.courses[3]).toMatchObject({ sourceType: "transcript", courseCode: "ENGL101", grade: "W", countsTowardProgress: false, genEdCodes: ["FSAW"] });
  });

  it("parses real Testudo-style sections and ignores current course rows", () => {
    const text = `
UNIVERSITY OF MARYLAND
COLLEGE PARK
UNOFFICIAL TRANSCRIPT
As of: 03/12/26
Frischmann, Jake
E-Mail: jfrischm@terpmail.umd.edu
Major: Computer Science
Freshman - First Time Undergraduate Degree Seeking
Double Degree: PHYSICS
** Transfer Credit Information ** ** Equivalences **
Advanced Placement Exam
2201 COMP SCI A/SCR 5 P 4.00 CMSC131
Villanova University
2305 DISCRETE STRUCTURES A 3.00 L1
Applicable UG Inst. Credits: 3.00
Historic Course Information is listed in the order:
Fall 2025
MAJOR: COMPUTER SCIENCE COLLEGE: COMP, MATH, & NAT SCI
CMSC216 INTRO TO CMPTR SYSTEMS A 4.00 4.00 16.00
ENES210 ENT OPPORTUNITY ANALYSIS A 3.00 3.00 12.00 DSSP, SCIS
UG Cumulative: 18.00; 18.00; 69.20; 3.844
UG Cumulative Credit : 71.00
UG Cumulative GPA : 3.844
** Current Course Information **
Spring 2026 Course Sec Credits Grd/ Drop Add Drop Modified GenEd
CMSC330 0201 3.00 REG A 11/24/25 11/24/25
`;

    const result = parseUnofficialTranscriptText(text, "testudo.pdf", 2);

    expect(result.fields.fullName).toBe("Frischmann, Jake");
    expect(result.fields.email).toBe("jfrischm@terpmail.umd.edu");
    expect(result.fields.major).toBe("Computer Science");
    expect(result.fields.degree).toBe("Double Degree");
    expect(result.fields.classStanding).toBe("Freshman");
    expect(result.fields.college).toBe("University of Maryland College Park");
    expect(result.fields.cumulativeGpa).toBe("3.844");
    expect(result.summary.totalCreditsEarned).toBe(71);
    expect(result.summary.totalCreditsAttempted).toBe(18);
    expect(result.summary.apCredits).toBe(4);
    expect(result.summary.totalParsedCourses).toBe(4);
    expect(result.summary.historicTermCount).toBe(1);
    expect(result.summary.currentCourseCount).toBe(1);
    expect(result.transfers).toHaveLength(2);
    expect(result.historicTerms).toHaveLength(1);
    expect(result.currentTerm?.courses).toHaveLength(1);
    expect(result.courses.some((course) => course.rawLine.includes("CMSC330 0201"))).toBe(false);
    expect(result.courses.some((course) => course.sourceType === "AP" && course.courseCode === "CMSC131")).toBe(true);
    expect(result.courses.some((course) => course.sourceType === "transfer" && course.title === "DISCRETE STRUCTURES")).toBe(true);
    expect(result.courses.some((course) => course.sourceType === "transcript" && course.courseCode === "CMSC216")).toBe(true);
    expect(result.courses.some((course) => course.sourceType === "transcript" && course.courseCode === "ENES210" && course.genEdCodes.join(",") === "DSSP,SCIS")).toBe(true);
  });
});
