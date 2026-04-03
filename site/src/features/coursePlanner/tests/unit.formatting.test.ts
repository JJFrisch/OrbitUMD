import { describe, expect, it } from "vitest";
import {
  EXACT_COURSE_CODE_REGEX,
  NUMBER_SEARCH_REGEX,
  extractDeptPrefix,
  normalizeSearchInput,
} from "../utils/formatting";
import {
  buildPlanetTerpProfessorLink,
  buildTestudoCourseLink,
  buildUmdMapLink,
  dedupeMeetings,
  convertRatingToPercent,
  formatClassDayTime,
  formatCredits,
  formatLocation,
  sanitizeNullableText,
} from "../utils/courseDetails";

describe("search parser", () => {
  it("normalizes by stripping spaces and uppercasing", () => {
    expect(normalizeSearchInput(" cmsc 131 ")).toBe("CMSC131");
  });

  it("supports exact course code regex", () => {
    expect(EXACT_COURSE_CODE_REGEX.test("CMSC131")).toBe(true);
    expect(EXACT_COURSE_CODE_REGEX.test("CMS131")).toBe(false);
  });

  it("supports number search regex", () => {
    expect(NUMBER_SEARCH_REGEX.test("131")).toBe(true);
    expect(NUMBER_SEARCH_REGEX.test("13")).toBe(false);
  });

  it("extracts dept prefix from first 1-4 letters", () => {
    expect(extractDeptPrefix("CMSC131")).toBe("CMSC");
    expect(extractDeptPrefix("MATH")).toBe("MATH");
  });
});

describe("course detail utilities", () => {
  it("sanitizes null-like values", () => {
    expect(sanitizeNullableText("null")).toBeNull();
    expect(sanitizeNullableText(" undefined ")).toBeNull();
    expect(sanitizeNullableText("  prereqs here  ")).toBe("prereqs here");
  });

  it("formats credit ranges", () => {
    expect(formatCredits(3, 3)).toBe("3 credits");
    expect(formatCredits(1, 3)).toBe("1 - 3 credits");
  });

  it("formats class day/time and location", () => {
    expect(formatClassDayTime({ days: "M", startTime: "2:00pm", endTime: "2:50pm" })).toBe("M 2:00pm - 2:50pm");
    expect(formatLocation({ building: "PHY", room: "1402" })).toBe("PHY 1402");
  });

  it("dedupes identical meetings before rendering", () => {
    const meetings = dedupeMeetings([
      { days: "Tu", startTime: "9:00am", endTime: "11:50am", location: "PHY 3310" },
      { days: "Tu", startTime: "9:00am", endTime: "11:50am", location: "PHY 3310" },
      { days: "Tu", startTime: "9:00am", endTime: "11:50am", location: "phy 3310 " },
    ]);

    expect(meetings).toHaveLength(1);
    expect(meetings[0]).toMatchObject({ days: "Tu", startTime: "9:00am", endTime: "11:50am" });
  });

  it("builds deterministic outbound links", () => {
    expect(buildTestudoCourseLink("PHYS487", "202608")).toContain("courseId=PHYS487");
    expect(buildPlanetTerpProfessorLink("sarah-eno")).toBe("https://planetterp.com/professor/sarah-eno");
    expect(buildUmdMapLink("PHY")).toContain("search=PHY");
  });

  it("converts ratings to star fill percent", () => {
    expect(convertRatingToPercent(5)).toBe(100);
    expect(convertRatingToPercent("2.5")).toBe(50);
    expect(convertRatingToPercent("NaN")).toBe(0);
  });
});
