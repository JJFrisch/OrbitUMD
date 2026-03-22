import { describe, expect, it, vi } from "vitest";
import { loadProgramRequirementBundles } from "@/lib/requirements/audit";
import type { UserDegreeProgram } from "@/lib/repositories/degreeProgramsRepository";
import { fetchProgramRequirementTemplatePayloadByKey } from "@/lib/repositories/programRequirementTemplatesRepository";

vi.mock("@/lib/repositories/degreeRequirementsRepository", () => ({
  fetchProgramRequirements: vi.fn(async () => []),
}));

vi.mock("@/lib/repositories/programRequirementTemplatesRepository", () => ({
  buildProgramTemplateKey: vi.fn(() => "test-key"),
  fetchProgramRequirementTemplatePayloadByKey: vi.fn(async () => null),
}));

describe("audit specialization mapping", () => {
  it("maps Physics Major specialization tracks and preserves MATH243 vs MATH240+MATH246 choice logic", async () => {
    const programs: UserDegreeProgram[] = [
      {
        id: "physics-major-test",
        userId: "user-1",
        programId: "physics-major-test",
        programCode: "PHYS",
        programName: "Physics Major",
        degreeType: "BS",
        college: "CMNS",
        isPrimary: true,
        createdAt: new Date().toISOString(),
      },
    ];

    const bundles = await loadProgramRequirementBundles(programs);
    expect(bundles).toHaveLength(1);

    const physics = bundles[0];
    expect(physics.specializationOptions).toEqual([
      { id: "physics-track-major", name: "The Physics Major" },
      { id: "physics-track-education", name: "Physics Education" },
      { id: "physics-track-biophysics", name: "Bio-Physics" },
      { id: "physics-track-applied", name: "Applied Physics" },
    ]);

    const specIds = new Set(physics.sections.map((section) => section.specializationId).filter(Boolean));
    expect(specIds).toEqual(
      new Set([
        "physics-track-major",
        "physics-track-education",
        "physics-track-biophysics",
        "physics-track-applied",
      ]),
    );

    const baseSection = physics.sections.find((section) => !section.specializationId && section.courseCodes.includes("MATH243"));
    expect(baseSection).toBeTruthy();
    expect(baseSection?.courseCodes).toEqual(expect.arrayContaining(["MATH243", "MATH240", "MATH246"]));

    const mathChoice = baseSection?.logicBlocks.find((block) => block.type === "OR" && block.codes.includes("MATH243"));
    expect(mathChoice).toBeTruthy();
    expect(mathChoice?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "AND", codes: ["MATH240", "MATH246"] }),
      ]),
    );
  });

  it("maps specialization options for non-Physics majors with specialized mapping", async () => {
    const programs: UserDegreeProgram[] = [
      {
        id: "biological-sciences-major-test",
        userId: "user-1",
        programId: "biological-sciences-major-test",
        programCode: "BSCI",
        programName: "Biological Sciences Major",
        degreeType: "BS",
        college: "CMNS",
        isPrimary: true,
        createdAt: new Date().toISOString(),
      },
    ];

    const bundles = await loadProgramRequirementBundles(programs);
    expect(bundles).toHaveLength(1);

    const biology = bundles[0];
    expect((biology.specializationOptions?.length ?? 0)).toBeGreaterThan(0);

    const specIds = new Set(
      biology.sections.map((section) => section.specializationId).filter((value): value is string => Boolean(value)),
    );

    expect(specIds.size).toBeGreaterThan(0);
  });

  it("restores Physics specialization options when official template has only base sections", async () => {
    const templateFetchMock = vi.mocked(fetchProgramRequirementTemplatePayloadByKey);
    templateFetchMock.mockResolvedValueOnce({
      sections: [
        {
          id: "official-base-physics",
          title: "Official Physics Core",
          requirementType: "all",
          special: false,
          notes: [],
          courseCodes: ["PHYS170", "PHYS171"],
          optionGroups: [],
          standaloneCodes: ["PHYS170", "PHYS171"],
          logicBlocks: [{ type: "AND", codes: ["PHYS170", "PHYS171"] }],
        },
      ],
      specializations: [],
    } as any);

    const programs: UserDegreeProgram[] = [
      {
        id: "physics-major-official-template",
        userId: "user-1",
        programId: "physics-major-official-template",
        programCode: "PHYS",
        programName: "Physics Major",
        degreeType: "BS",
        college: "CMNS",
        isPrimary: true,
        createdAt: new Date().toISOString(),
      },
    ];

    const bundles = await loadProgramRequirementBundles(programs);
    expect(bundles).toHaveLength(1);

    const physics = bundles[0];
    expect(physics.source).toBe("official");
    expect(physics.specializationOptions).toEqual([
      { id: "physics-track-major", name: "The Physics Major" },
      { id: "physics-track-education", name: "Physics Education" },
      { id: "physics-track-biophysics", name: "Bio-Physics" },
      { id: "physics-track-applied", name: "Applied Physics" },
    ]);

    const specializationSectionCount = physics.sections.filter((section) => Boolean(section.specializationId)).length;
    expect(specializationSectionCount).toBeGreaterThan(0);
  });
});
