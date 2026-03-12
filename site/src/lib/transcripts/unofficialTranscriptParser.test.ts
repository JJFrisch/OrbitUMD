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
  });
});
