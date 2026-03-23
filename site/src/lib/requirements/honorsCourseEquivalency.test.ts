import { describe, expect, it } from "vitest";
import {
  buildCourseContributionMap,
  evaluateRequirementSection,
  getContributionLabelsForCourseCode,
  type ProgramRequirementBundle,
  type RequirementSectionBundle,
} from "@/lib/requirements/audit";
import { buildNeededClassItems } from "@/lib/requirements/neededClassesAdvisor";
import { buildEvalContextV2, evaluateProgramRequirementsV2 } from "@/lib/requirements/v2Evaluator";
import type { RequirementBlockV2, RequirementItemV2, StudentCourseV2 } from "@/lib/types/requirements";

function makeSection(courseCodes: string[]): RequirementSectionBundle {
  return {
    id: "section-1",
    title: "Core Physics",
    requirementType: "all",
    notes: [],
    special: false,
    courseCodes,
    optionGroups: [],
    standaloneCodes: courseCodes,
    logicBlocks: courseCodes.map((code) => ({ type: "AND" as const, codes: [code] })),
  };
}

describe("honors course equivalency", () => {
  it("treats PHYS272H as satisfying PHYS272 requirements", () => {
    const section = makeSection(["PHYS272"]);
    const byCourseCode = new Map([["PHYS272H", "completed" as const]]);

    const result = evaluateRequirementSection(section, byCourseCode);
    expect(result.status).toBe("completed");
    expect(result.completedSlots).toBe(1);
  });

  it("maps contribution labels for honors/base course variants", () => {
    const bundles: ProgramRequirementBundle[] = [
      {
        programId: "physics-major",
        programName: "Physics Major",
        programCode: "PHYS",
        kind: "major",
        source: "scraped",
        specializations: [],
        sections: [makeSection(["PHYS272"])],
      },
    ];

    const contributionMap = buildCourseContributionMap(bundles);
    const labels = getContributionLabelsForCourseCode("PHYS272H", contributionMap);

    expect(labels).toEqual(expect.arrayContaining(["Major: Physics Major"]));
  });

  it("does not suggest needed class when honors version is already completed", () => {
    const bundles: ProgramRequirementBundle[] = [
      {
        programId: "physics-major",
        programName: "Physics Major",
        programCode: "PHYS",
        kind: "major",
        source: "scraped",
        specializations: [],
        sections: [makeSection(["PHYS272"])],
      },
    ];

    const items = buildNeededClassItems({
      bundles,
      byCourseCode: new Map([["PHYS272H", "completed" as const]]),
      byCourseTags: new Map(),
    });

    expect(items.some((item) => item.courseCode === "PHYS272")).toBe(false);
  });

  it("v2 evaluator matches honors and base course numbers", () => {
    const block: RequirementBlockV2 = {
      id: "block-1",
      programId: "physics-major",
      parentRequirementId: null,
      sourceNodeId: null,
      type: "ALL_OF",
      params: {},
      humanLabel: "Required Physics",
      sortOrder: 0,
    };

    const item: RequirementItemV2 = {
      id: "item-1",
      requirementBlockId: "block-1",
      itemType: "COURSE",
      payload: { subject: "PHYS", number: "272" },
      sortOrder: 0,
    };

    const course: StudentCourseV2 = {
      id: "course-1",
      studentUid: "student-1",
      subject: "PHYS",
      number: "272H",
      title: "Physics II Honors",
      credits: 4,
      grade: "A",
      term: "2025 Fall",
      isPlanned: false,
    };

    const ctx = buildEvalContextV2([block], [item]);
    const [result] = evaluateProgramRequirementsV2(ctx, [course]);

    expect(result.satisfied).toBe(true);
    expect(result.usedCourses).toHaveLength(1);
  });
});
