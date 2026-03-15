import { describe, expect, it } from "vitest";
import requirementsCatalog from "@/lib/data/umd_program_requirements.json";

type ScrapedProgram = {
  name?: string;
  builderSections?: Array<{
    title?: string;
    items?: Array<{ type?: string; code?: string; items?: Array<{ code?: string }> }>;
  }>;
  requirementCourseBlocks?: Array<{
    builderSections?: Array<{
      title?: string;
      items?: Array<{ type?: string; code?: string; items?: Array<{ code?: string }> }>;
    }>;
    courses?: Array<{ courseCode?: string }>;
  }>;
};

function collectSectionCodes(section: {
  items?: Array<{ code?: string; items?: Array<{ code?: string }> }>;
}): string[] {
  const codes = new Set<string>();
  for (const item of section.items ?? []) {
    if (item.code) codes.add(item.code.toUpperCase());
    for (const nested of item.items ?? []) {
      if (nested.code) codes.add(nested.code.toUpperCase());
    }
  }
  return [...codes];
}

describe("requirements data integrity", () => {
  it("does not include legacy MATH130/MATH131 structured entries", () => {
    const programs = ((requirementsCatalog as any)?.programs ?? []) as ScrapedProgram[];

    const badCodes: Array<{ programName: string; code: string }> = [];

    for (const program of programs) {
      const blocks = program.requirementCourseBlocks ?? [];
      for (const block of blocks) {
        for (const section of block.builderSections ?? []) {
          for (const code of collectSectionCodes(section)) {
            if (code === "MATH130" || code === "MATH131") {
              badCodes.push({ programName: program.name ?? "unknown", code });
            }
          }
        }

        for (const course of block.courses ?? []) {
          const code = String(course.courseCode ?? "").toUpperCase();
          if (code === "MATH130" || code === "MATH131") {
            badCodes.push({ programName: program.name ?? "unknown", code });
          }
        }
      }
    }

    expect(badCodes).toEqual([]);
  });

  it("keeps architecture foundation as one math OR pair plus required courses", () => {
    const programs = ((requirementsCatalog as any)?.programs ?? []) as ScrapedProgram[];
    const architecture = programs.find((program) => String(program.name ?? "") === "Architecture Major");

    expect(architecture).toBeTruthy();

    const firstSection = architecture?.builderSections?.[0];
    expect(firstSection).toBeTruthy();

    const firstItem = firstSection?.items?.[0];
    expect(firstItem?.type).toBe("OR");
    expect((firstItem?.items ?? []).map((item) => item.code)).toEqual(["MATH120", "MATH140"]);

    const directCodes = (firstSection?.items ?? [])
      .filter((item) => typeof item.code === "string")
      .map((item) => item.code?.toUpperCase());

    expect(directCodes).toEqual([
      "PHYS121",
      "ARCH171",
      "ARCH225",
      "ARCH200",
      "ARCH226",
      "ARCH300",
      "ARCH201",
      "ARCH462",
      "ARCH400",
      "ARCH463",
    ]);
  });

  it("keeps Biology at Shady Grove ecology/evolution math sequence as MATH135/MATH136", () => {
    const programs = ((requirementsCatalog as any)?.programs ?? []) as ScrapedProgram[];
    const biologyAtShadyGrove = programs.find((program) =>
      String(program.name ?? "").toLowerCase().includes("biological sciences major at shady grove"),
    );

    expect(biologyAtShadyGrove).toBeTruthy();

    const ecologySections = (biologyAtShadyGrove?.requirementCourseBlocks ?? [])
      .flatMap((block) => block.builderSections ?? [])
      .filter((section) => String(section.title ?? "").toLowerCase().includes("ecology and evolution"));

    expect(ecologySections.length).toBeGreaterThan(0);

    for (const section of ecologySections) {
      const codes = collectSectionCodes(section);
      expect(codes.includes("MATH135") || codes.includes("MATH136")).toBe(true);
      expect(codes.includes("MATH130")).toBe(false);
      expect(codes.includes("MATH131")).toBe(false);
    }
  });
});
