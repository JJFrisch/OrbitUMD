import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parseProgramFromHtml } from "@/lib/scraper/umdCatalog";

const thisDir = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  const filePath = path.join(thisDir, "fixtures", name);
  return fs.readFileSync(filePath, "utf8");
}

describe("UMD catalog parser real-major behavior: Marketing", () => {
  test("detects SELECT_N=3 marketing electives and BMGT484", () => {
    const html = loadFixture("marketing-major.html");
    const url = "https://academiccatalog.umd.edu/undergraduate/business/marketing/marketing-major/";
    const { program, blocks, items } = parseProgramFromHtml(html, url);

    expect(program.title).toMatch(/Marketing Major/);
    expect(program.college).toMatch(/Smith School of Business/i);

    const electivesBlock = blocks.find(
      (block) => /Select three of the following/i.test(block.label) || /Marketing Electives/i.test(block.label),
    );
    expect(electivesBlock).toBeDefined();
    expect(electivesBlock?.type).toBe("SELECT_N");
    expect(electivesBlock?.params.nCourses).toBe(3);

    const bmgt484 = items.find(
      (item) =>
        item.block_id === electivesBlock?.id &&
        item.item_type === "COURSE" &&
        item.payload.subject === "BMGT" &&
        item.payload.number === "484",
    );
    expect(bmgt484).toBeDefined();
  });
});

describe("UMD catalog parser real-major behavior: CCJS", () => {
  test("creates core, select-two, theory, and math gateway blocks", () => {
    const html = loadFixture("ccjs-major.html");
    const url = "https://academiccatalog.umd.edu/undergraduate/behavioral-social-sciences/criminology-criminal-justice/criminology-criminal-justice-major/";
    const { program, blocks, items } = parseProgramFromHtml(html, url);

    expect(program.title).toMatch(/Criminology and Criminal Justice Major/);

    const coreBlock = blocks.find((block) => /Required CCJS Courses/i.test(block.label));
    expect(coreBlock).toBeDefined();
    const coreItems = items.filter((item) => item.block_id === coreBlock?.id && item.item_type === "COURSE");
    const coreNumbers = coreItems.map((item) => String(item.payload.number)).sort();
    expect(coreNumbers).toEqual(["100", "105", "200", "230", "300"]);

    const cjBlock = blocks.find((block) => /CCJS Criminal Justice Courses/i.test(block.label));
    expect(cjBlock).toBeDefined();
    expect(cjBlock?.type).toBe("SELECT_N");
    expect(Number(cjBlock?.params.nCourses)).toBeGreaterThanOrEqual(2);

    const theoryBlock = blocks.find((block) => /Criminology\/Theory/i.test(block.label));
    expect(theoryBlock).toBeDefined();
    expect(theoryBlock?.type).toBe("SELECT_N");

    const mathBlock = blocks.find((block) => /Math Courses Gateway/i.test(block.label));
    expect(mathBlock).toBeDefined();
    const mathItems = items.filter((item) => item.block_id === mathBlock?.id && item.item_type === "COURSE");
    const mathSubjects = new Set(mathItems.map((item) => String(item.payload.subject)));
    expect(mathSubjects).toEqual(new Set(["MATH", "STAT"]));
  });
});

describe("UMD catalog parser real-major behavior: NEUR (CMNS)", () => {
  test("extracts NEUR core and Track Courses sections", () => {
    const html = loadFixture("neur-cmns.html");
    const url = "https://academiccatalog.umd.edu/undergraduate/computer-mathematical-natural-sciences/biology/neuroscience-major-cmns/";
    const { program, blocks, items } = parseProgramFromHtml(html, url);

    expect(program.title).toMatch(/Neuroscience Major \(CMNS\)/);

    const neurCoreBlock = blocks.find((block) => /NEUR Required Courses/i.test(block.label));
    expect(neurCoreBlock).toBeDefined();

    const neurCoreItems = items.filter(
      (item) => item.block_id === neurCoreBlock?.id && item.item_type === "COURSE",
    );

    const coreNeur = neurCoreItems
      .filter((item) => item.payload.subject === "NEUR")
      .map((item) => String(item.payload.number))
      .sort();

    expect(coreNeur).toEqual(["200", "305", "306", "405"]);

    const trackBlock = blocks.find((block) => /Track Courses/i.test(block.label));
    expect(trackBlock).toBeDefined();

    const trackItems = items.filter((item) => item.block_id === trackBlock?.id);
    expect(trackItems.length).toBeGreaterThan(0);
  });
});

describe("UMD catalog parser broad coverage for pasted majors", () => {
  const fixtures = [
    ["middle-school-education.html", /Middle School Education Major/, ["BSCI160", "BSCI170"]],
    ["public-policy-major.html", /Public Policy Major/, ["PLCY100", "PLCY201"]],
    ["american-studies-major.html", /American Studies Major/, ["AMST101"]],
    ["journalism-major.html", /Journalism Major/, ["JOUR201", "STAT100"]],
    ["architecture-major.html", /Architecture Major/, ["ARCH171", "ARCH401"]],
    ["aerospace-major.html", /Aerospace Engineering Major/, ["ENAE100", "ENAE423"]],
    ["public-health-practice.html", /Public Health Practice Major/, ["SPHL100", "EPIB301"]],
    ["tech-info-design.html", /Technology and Information Design Major/, ["INST104", "STAT100"]],
    ["arec-major.html", /Agricultural and Resource Economics Major/, ["ECON200", "AREC460", "AREC440"]],
  ] as const;

  for (const [fixtureName, titlePattern, requiredCodes] of fixtures) {
    test(`parses ${fixtureName}`, () => {
      const html = loadFixture(fixtureName);
      const { program, items } = parseProgramFromHtml(html, "https://academiccatalog.umd.edu/undergraduate/mock");

      expect(program.title).toMatch(titlePattern);

      const seen = new Set(
        items
          .filter((item) => item.item_type === "COURSE")
          .map((item) => `${String(item.payload.subject)}${String(item.payload.number)}`),
      );

      for (const courseCode of requiredCodes) {
        expect(seen.has(courseCode)).toBe(true);
      }
    });
  }
});
