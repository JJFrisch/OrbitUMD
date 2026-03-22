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

describe("public health science normalization", () => {
  it("normalizes malformed section titles and removes duplicate scraped sections", async () => {
    const programs: UserDegreeProgram[] = [
      {
        id: "public-health-science-major",
        userId: "user-1",
        programId: "public-health-science-major",
        programCode: "PHSC",
        programName: "Public Health Science Major",
        degreeType: "BS",
        college: "SPH",
        isPrimary: true,
        createdAt: new Date().toISOString(),
      },
    ];

    const bundles = await loadProgramRequirementBundles(programs);
    expect(bundles).toHaveLength(1);

    const publicHealth = bundles[0];
    const titles = publicHealth.sections.map((section) => section.title);

    // Malformed "course list" titles should no longer appear as section headers.
    expect(
      titles.some((title) =>
        title.includes("BSCI170 & BSCI171 Principles of Molecular & Cellular Biology")
      )
    ).toBe(false);

    // Scientific Foundation section should include the title-embedded courses.
    const scientificFoundation = publicHealth.sections.find((section) =>
      /scientific foundation courses/i.test(section.title)
    );

    expect(scientificFoundation).toBeTruthy();
    expect(scientificFoundation?.courseCodes).toEqual(
      expect.arrayContaining(["MATH120", "BSCI170", "BSCI171", "BSCI201", "BSCI202"])
    );

    // Sections should be deduped by structural signature.
    const signatures = publicHealth.sections.map((section) => {
      const codes = Array.from(new Set(section.courseCodes)).sort().join("|");
      return `${section.title}::${section.requirementType}::${section.chooseCount ?? ""}::${codes}`;
    });

    expect(new Set(signatures).size).toBe(signatures.length);
  });
});
