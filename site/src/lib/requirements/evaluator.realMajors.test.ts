import { describe, expect, test } from "vitest";
import { buildEvalContextV2, evaluateProgramRequirementsV2 } from "@/lib/requirements/v2Evaluator";
import type { RequirementBlockV2, RequirementItemV2, StudentCourseV2 } from "@/lib/types/requirements";

function evaluate(blocks: RequirementBlockV2[], items: RequirementItemV2[], courses: StudentCourseV2[]) {
  const ctx = buildEvalContextV2(blocks, items);
  return evaluateProgramRequirementsV2(ctx, courses);
}

function mkCourse(subject: string, number: string, term: string, title = "Course", credits = 3): StudentCourseV2 {
  return {
    id: `${subject}-${number}-${term}`,
    studentUid: "student-1",
    subject,
    number,
    title,
    credits,
    grade: "A",
    term,
    isPlanned: false,
  };
}

describe("Evaluator real-major behavior: Marketing", () => {
  test("Marketing electives enforces Select 3 of BMGT list", () => {
    const block: RequirementBlockV2 = {
      id: "b-marketing-electives",
      programId: "prog-marketing",
      parentRequirementId: null,
      humanLabel: "Marketing Electives (Select three of the following)",
      type: "SELECT_N",
      params: { nCourses: 3 },
      sortOrder: 0,
    };

    const options = ["456", "453", "357", "372", "450", "454", "455", "458", "484"];
    const items: RequirementItemV2[] = options.map((number, i) => ({
      id: `i-${number}`,
      requirementBlockId: block.id,
      itemType: "COURSE",
      payload: { subject: "BMGT", number, credits: 3 },
      sortOrder: i,
    }));

    const passCourses = [
      mkCourse("BMGT", "450", "2025 Spring", "Integrated Marketing Communications"),
      mkCourse("BMGT", "454", "2025 Fall", "Global Marketing"),
      mkCourse("BMGT", "484", "2026 Spring", "Digital Marketing"),
    ];

    const [pass] = evaluate([block], items, passCourses);
    expect(pass.satisfied).toBe(true);
    expect(pass.usedCourses.map((course) => course.number).sort()).toEqual(["450", "454", "484"]);

    const [fail] = evaluate([block], items, passCourses.slice(0, 2));
    expect(fail.satisfied).toBe(false);
    expect(fail.remainingCourses).toBe(1);
  });
});

describe("Evaluator real-major behavior: CCJS", () => {
  test("CCJS core requires ALL_OF 100/105/200/230/300", () => {
    const block: RequirementBlockV2 = {
      id: "b-ccjs-core",
      programId: "prog-ccjs",
      parentRequirementId: null,
      humanLabel: "Required CCJS Courses",
      type: "ALL_OF",
      params: {},
      sortOrder: 0,
    };

    const required = ["100", "105", "200", "230", "300"];
    const items: RequirementItemV2[] = required.map((number, i) => ({
      id: `i-${number}`,
      requirementBlockId: block.id,
      itemType: "COURSE",
      payload: { subject: "CCJS", number, credits: 3 },
      sortOrder: i,
    }));

    const allCourses = required.map((number, i) => mkCourse("CCJS", number, `202${i} Fall`, "CCJS core"));
    const [pass] = evaluate([block], items, allCourses);
    expect(pass.satisfied).toBe(true);

    const [fail] = evaluate([block], items, allCourses.filter((course) => course.number !== "300"));
    expect(fail.satisfied).toBe(false);
    expect(fail.messages.some((message) => message.includes("CCJS300"))).toBe(true);
  });

  test("CCJS criminal justice block enforces Select 2 of 340/345/342", () => {
    const block: RequirementBlockV2 = {
      id: "b-ccjs-cj",
      programId: "prog-ccjs",
      parentRequirementId: null,
      humanLabel: "CCJS Criminal Justice Courses",
      type: "SELECT_N",
      params: { nCourses: 2 },
      sortOrder: 1,
    };

    const items: RequirementItemV2[] = ["340", "345", "342"].map((number, i) => ({
      id: `i-${number}`,
      requirementBlockId: block.id,
      itemType: "COURSE",
      payload: { subject: "CCJS", number, credits: 3 },
      sortOrder: i,
    }));

    const [r1] = evaluate([block], items, [mkCourse("CCJS", "340", "2025 Fall")]);
    expect(r1.satisfied).toBe(false);
    expect(r1.remainingCourses).toBe(1);

    const [r2] = evaluate([block], items, [
      mkCourse("CCJS", "340", "2025 Fall"),
      mkCourse("CCJS", "345", "2026 Spring"),
    ]);
    expect(r2.satisfied).toBe(true);
    expect(r2.usedCourses).toHaveLength(2);
  });

  test("CCJS courses-of-choice honors minCredits + minLevel filtering", () => {
    const block: RequirementBlockV2 = {
      id: "b-ccjs-choice",
      programId: "prog-ccjs",
      parentRequirementId: null,
      humanLabel: "CCJS Courses of Choice",
      type: "CREDITS_MIN",
      params: { minCredits: 12, subjects: ["CCJS"], minLevel: 400 },
      sortOrder: 2,
    };

    const courses: StudentCourseV2[] = [
      mkCourse("CCJS", "325", "2025 Fall"),
      mkCourse("CCJS", "360", "2026 Spring"),
      mkCourse("CCJS", "418", "2026 Fall"),
      mkCourse("CCJS", "451", "2027 Spring"),
    ];

    const [result] = evaluate([block], [], courses);
    expect(result.satisfied).toBe(false);
    expect(result.remainingCredits).toBe(6);
    expect(result.usedCourses.map((course) => course.number).sort()).toEqual(["418", "451"]);
  });
});

describe("Evaluator real-major behavior: NEUR (CMNS)", () => {
  test("NEUR core requires 200/305/306/405", () => {
    const block: RequirementBlockV2 = {
      id: "b-neur-core",
      programId: "prog-neur-cmns",
      parentRequirementId: null,
      humanLabel: "NEUR Required Courses",
      type: "ALL_OF",
      params: {},
      sortOrder: 0,
    };

    const required = ["200", "305", "306", "405"];
    const items: RequirementItemV2[] = required.map((number, i) => ({
      id: `i-neur-${number}`,
      requirementBlockId: block.id,
      itemType: "COURSE",
      payload: { subject: "NEUR", number, credits: 3 },
      sortOrder: i,
    }));

    const allCourses = required.map((number, i) => mkCourse("NEUR", number, `202${i + 2} Fall`, "NEUR core"));
    const [pass] = evaluate([block], items, allCourses);
    expect(pass.satisfied).toBe(true);

    const [fail] = evaluate([block], items, allCourses.filter((course) => course.number !== "405"));
    expect(fail.satisfied).toBe(false);
    expect(fail.messages.some((message) => message.includes("NEUR405"))).toBe(true);
  });

  test("NEUR track block requires at least 5 track courses", () => {
    const block: RequirementBlockV2 = {
      id: "b-neur-track",
      programId: "prog-neur-cmns",
      parentRequirementId: null,
      humanLabel: "Track Courses",
      type: "SELECT_N",
      params: { nCourses: 5 },
      sortOrder: 1,
    };

    const trackList = [
      ["BSCI", "222"],
      ["BSCI", "330"],
      ["BSCI", "440"],
      ["BSCI", "441"],
      ["BSCI", "456"],
      ["BSCI", "452"],
    ] as const;

    const items: RequirementItemV2[] = trackList.map(([subject, number], i) => ({
      id: `i-${subject}-${number}`,
      requirementBlockId: block.id,
      itemType: "COURSE",
      payload: { subject, number, credits: 3 },
      sortOrder: i,
    }));

    const fourCourses = trackList.slice(0, 4).map(([subject, number], i) => mkCourse(subject, number, `202${i + 3} Spring`, "Track"));
    const [r1] = evaluate([block], items, fourCourses);
    expect(r1.satisfied).toBe(false);
    expect(r1.remainingCourses).toBe(1);

    const fiveCourses = trackList.slice(0, 5).map(([subject, number], i) => mkCourse(subject, number, `202${i + 3} Spring`, "Track"));
    const [r2] = evaluate([block], items, fiveCourses);
    expect(r2.satisfied).toBe(true);
  });
});
