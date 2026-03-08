import { describe, expect, it } from "vitest";
import {
  EXACT_COURSE_CODE_REGEX,
  NUMBER_SEARCH_REGEX,
  extractDeptPrefix,
  normalizeSearchInput,
} from "../utils/formatting";

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
