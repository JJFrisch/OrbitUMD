import { describe, expect, it, vi } from "vitest";
import requirementsCatalog from "@/lib/data/umd_program_requirements.json";
import { loadProgramRequirementBundles } from "@/lib/requirements/audit";
import type { UserDegreeProgram } from "@/lib/repositories/degreeProgramsRepository";

vi.mock("@/lib/repositories/degreeRequirementsRepository", () => ({
  fetchProgramRequirements: vi.fn(async () => []),
}));

vi.mock("@/lib/repositories/programRequirementTemplatesRepository", () => ({
  buildProgramTemplateKey: vi.fn(() => "test-key"),
  fetchProgramRequirementTemplatePayloadByKey: vi.fn(async () => null),
}));

describe("audit all-majors sanity", () => {
  it("loads major bundles without duplicate section signatures or malformed course-list titles", async () => {
    const majors = ((requirementsCatalog as any).programs ?? []).filter(
      (program: any) => String(program.type ?? "").toLowerCase() === "major"
    );

    const programs: UserDegreeProgram[] = majors.map((program: any, index: number) => ({
      id: `major-${index}-${program.id}`,
      userId: "user-1",
      programId: program.id,
      programCode: String(program.id ?? "UNK").slice(0, 4).toUpperCase(),
      programName: program.name,
      degreeType: "BS",
      college: "UMD",
      isPrimary: index === 0,
      createdAt: new Date().toISOString(),
    }));

    const bundles = await loadProgramRequirementBundles(programs);
    const courseTitlePattern = /^([A-Z]{4}\d{3}[A-Z]?)(\s*&\s*[A-Z]{4}\d{3}[A-Z]?)+\b/;

    const malformed: Array<{ programName: string; title: string }> = [];
    const duplicateSectionPrograms: Array<{ programName: string; duplicates: number }> = [];

    for (const bundle of bundles) {
      for (const section of bundle.sections) {
        if (courseTitlePattern.test(String(section.title ?? ""))) {
          malformed.push({
            programName: bundle.programName,
            title: section.title,
          });
        }
      }

      const signatures = bundle.sections.map((section) => {
        const codes = Array.from(new Set(section.courseCodes ?? []))
          .map((code) => code.toUpperCase())
          .sort()
          .join("|");
        return `${section.title.toLowerCase()}::${section.requirementType}::${section.chooseCount ?? ""}::${section.specializationId ?? ""}::${codes}`;
      });

      const duplicateCount = signatures.length - new Set(signatures).size;
      if (duplicateCount > 0) {
        duplicateSectionPrograms.push({
          programName: bundle.programName,
          duplicates: duplicateCount,
        });
      }
    }

    expect(malformed).toEqual([]);
    expect(duplicateSectionPrograms).toEqual([]);
  });
});
