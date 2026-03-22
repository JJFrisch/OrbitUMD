import { describe, expect, it, vi } from "vitest";
import { loadProgramRequirementBundles } from "@/lib/requirements/audit";
import type { UserDegreeProgram } from "@/lib/repositories/degreeProgramsRepository";

vi.mock("@/lib/repositories/degreeRequirementsRepository", () => ({
  fetchProgramRequirements: vi.fn(async () => []),
}));

vi.mock("@/lib/repositories/programRequirementTemplatesRepository", () => ({
  buildProgramTemplateKey: vi.fn(() => "test-key"),
  fetchProgramRequirementTemplatePayloadByKey: vi.fn(async () => null),
}));

describe("requirements data integrity", () => {
  it("does not include legacy MATH130/MATH131 in loaded Biology bundle", async () => {
    const programs: UserDegreeProgram[] = [
      {
        id: "biology-shady-grove",
        userId: "user-1",
        programId: "biological-sciences-major-at-shady-grove",
        programCode: "BSCI",
        programName: "Biological Sciences Major at Shady Grove",
        degreeType: "BS",
        college: "CMNS",
        isPrimary: true,
        createdAt: new Date().toISOString(),
      },
    ];

    const bundles = await loadProgramRequirementBundles(programs);
    const biology = bundles[0];
    const allCodes = new Set(biology.sections.flatMap((section) => section.courseCodes));

    expect(allCodes.has("MATH130")).toBe(false);
    expect(allCodes.has("MATH131")).toBe(false);
  });

  it("keeps architecture foundation with MATH120/MATH140 as an OR choice", async () => {
    const programs: UserDegreeProgram[] = [
      {
        id: "architecture-major",
        userId: "user-1",
        programId: "architecture-major",
        programCode: "ARCH",
        programName: "Architecture Major",
        degreeType: "BS",
        college: "ARCH",
        isPrimary: true,
        createdAt: new Date().toISOString(),
      },
    ];

    const bundles = await loadProgramRequirementBundles(programs);
    const architecture = bundles[0];

    const hasMathChoice = architecture.sections.some((section) =>
      section.logicBlocks.some(
        (block) =>
          block.type === "OR" &&
          block.codes.includes("MATH120") &&
          block.codes.includes("MATH140"),
      ),
    );

    expect(hasMathChoice).toBe(true);
  });

  it("keeps Biology at Shady Grove math sequence as MATH135/MATH136 in loaded sections", async () => {
    const programs: UserDegreeProgram[] = [
      {
        id: "biology-shady-grove-math",
        userId: "user-1",
        programId: "biological-sciences-major-at-shady-grove",
        programCode: "BSCI",
        programName: "Biological Sciences Major at Shady Grove",
        degreeType: "BS",
        college: "CMNS",
        isPrimary: true,
        createdAt: new Date().toISOString(),
      },
    ];

    const bundles = await loadProgramRequirementBundles(programs);
    const biology = bundles[0];
    const allCodes = new Set(biology.sections.flatMap((section) => section.courseCodes));

    expect(allCodes.has("MATH135") || allCodes.has("MATH136")).toBe(true);
    expect(allCodes.has("MATH130")).toBe(false);
    expect(allCodes.has("MATH131")).toBe(false);
  });
});
