export interface Program {
  id: string;
  code: string;
  title: string;
  college: string;
  degree_type: string;
  catalog_year_start: number;
  catalog_year_end: number | null;
  min_credits: number | null;
  source_url: string;
}

export interface RequirementBlock {
  id: string;
  program_id: string;
  parent_block_id: string | null;
  label: string;
  type: "ALL_OF" | "SELECT_N" | "CREDITS_MIN" | "TRACK_GROUP" | "POLICY" | "BENCHMARK" | "NOTE";
  sort_order: number;
  params: Record<string, unknown>;
  is_major_core: boolean;
  is_track: boolean;
  is_specialization: boolean;
  is_benchmark: boolean;
  is_policy: boolean;
  source_note: string;
}

export interface RequirementItem {
  id: string;
  block_id: string;
  item_type: "COURSE" | "COURSE_GROUP" | "ATTRIBUTE" | "LEVEL_CONSTRAINT" | "SUBJECT_CONSTRAINT" | "TEXT_RULE";
  payload: Record<string, unknown>;
  sort_order: number;
}

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function detectDegreeType(text: string): string {
  if (/bachelor of science in engineering/i.test(text)) return "BSE";
  if (/bachelor of science/i.test(text)) return "BS";
  if (/bachelor of arts/i.test(text)) return "BA";
  return "UNKNOWN";
}

function parseMinCredits(text: string): number | null {
  const match = text.match(/total credits\s*(\d+)(?:\s*[-–]\s*(\d+))?/i) || text.match(/minimum of\s+(\d+)\s+credits/i);
  if (!match) return null;
  const first = Number.parseInt(match[1], 10);
  const second = match[2] ? Number.parseInt(match[2], 10) : null;
  return second ? Math.max(first, second) : first;
}

function parseCollege(url: string, bodyText: string): string {
  const crumbs = bodyText.match(/College of[^.\n]+/i) ?? bodyText.match(/[A-Z][A-Za-z.&\-\s]+School of [A-Z][A-Za-z.&\-\s]+/i);
  if (crumbs) return normalizeText(crumbs[0]);

  const parts = url.split("/").filter(Boolean);
  const idx = parts.findIndex((value) => value === "colleges-schools");
  if (idx >= 0 && idx + 1 < parts.length) {
    return parts[idx + 1]
      .split("-")
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ");
  }

  return "Unknown";
}

function parseCourse(codeText: string): { subject: string; number: string } | null {
  const cleaned = normalizeText(codeText).toUpperCase();
  const match = cleaned.match(/([A-Z]{2,6})\s*(\d{3}[A-Z]?)/);
  if (!match) return null;
  return { subject: match[1], number: match[2] };
}

function parseChooseCount(text: string): number | null {
  const cleaned = normalizeText(text).toLowerCase();
  const numeric = cleaned.match(/\b(select|choose|complete|take)\s+(\d+)\b/);
  if (numeric) return Number.parseInt(numeric[2], 10);

  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
  };

  const word = cleaned.match(/\b(select|choose|complete|take)\s+(one|two|three|four|five|six)\b/);
  if (!word) return null;
  return words[word[2]] ?? null;
}

function extractRows(table: Element): string[][] {
  const rows: string[][] = [];
  table.querySelectorAll("tr").forEach((row) => {
    const cells = Array.from(row.querySelectorAll("th, td")).map((cell) => normalizeText(cell.textContent ?? ""));
    if (cells.some(Boolean)) rows.push(cells);
  });
  return rows;
}

export function parseProgramFromHtml(
  html: string,
  url: string,
): { program: Program; blocks: RequirementBlock[]; items: RequirementItem[] } {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");

  const title = normalizeText(document.querySelector("h1")?.textContent ?? "Program");
  const bodyText = normalizeText(document.body.textContent ?? "");
  const programId = `prog-${slugify(title)}`;
  const program: Program = {
    id: programId,
    code: slugify(title).toUpperCase(),
    title,
    college: parseCollege(url, bodyText),
    degree_type: detectDegreeType(bodyText),
    catalog_year_start: 2025,
    catalog_year_end: null,
    min_credits: parseMinCredits(bodyText),
    source_url: url,
  };

  const blocks: RequirementBlock[] = [];
  const items: RequirementItem[] = [];

  const scope = document.querySelector("#requirementstextcontainer") ?? document.body;
  const tables = Array.from(scope.querySelectorAll("table"));

  let blockCounter = 0;
  let itemCounter = 0;
  let activeBlockId: string | null = null;

  const createBlock = (
    label: string,
    type: RequirementBlock["type"],
    params: Record<string, unknown>,
  ): string => {
    blockCounter += 1;
    const id = `block-${blockCounter}`;
    blocks.push({
      id,
      program_id: program.id,
      parent_block_id: null,
      label,
      type,
      sort_order: blockCounter,
      params,
      is_major_core: true,
      is_track: /track|concentration|specialization/i.test(label),
      is_specialization: /specialization/i.test(label),
      is_benchmark: /benchmark/i.test(label),
      is_policy: type === "POLICY" || type === "NOTE",
      source_note: "Parsed from catalog table",
    });
    activeBlockId = id;
    return id;
  };

  const ensureDefaultBlock = (): string => {
    if (activeBlockId) return activeBlockId;
    return createBlock("Requirements", "ALL_OF", {});
  };

  const pushItem = (
    blockId: string,
    itemType: RequirementItem["item_type"],
    payload: Record<string, unknown>,
  ): void => {
    itemCounter += 1;
    items.push({
      id: `item-${itemCounter}`,
      block_id: blockId,
      item_type: itemType,
      payload,
      sort_order: itemCounter,
    });
  };

  for (const table of tables) {
    activeBlockId = null;
    const rows = extractRows(table);

    for (const cells of rows) {
      const first = cells[0] ?? "";
      const second = cells[1] ?? "";
      const merged = normalizeText(`${first} ${second}`);
      if (!merged) continue;
      if (/^total credits/i.test(merged)) continue;

      const chooseCount = parseChooseCount(merged);
      if (chooseCount !== null) {
        const blockId = createBlock(first.replace(/:$/, "") || "Selection", "SELECT_N", { nCourses: chooseCount });
        if (merged !== first) {
          pushItem(blockId, "TEXT_RULE", { text: merged });
        }
        continue;
      }

      if (/:\s*$/.test(first) && !parseCourse(first)) {
        createBlock(first.replace(/:\s*$/, ""), "ALL_OF", {});
        continue;
      }

      if (/benchmark/i.test(first)) {
        createBlock(first.replace(/:$/, ""), "BENCHMARK", {});
        continue;
      }

      if (/track courses|track|specialization|concentration/i.test(first) && !parseCourse(first)) {
        const blockId = createBlock(first.replace(/:$/, ""), "TRACK_GROUP", {});
        if (merged !== first) {
          pushItem(blockId, "TEXT_RULE", { text: merged });
        }
        continue;
      }

      const firstCourse = parseCourse(first);
      const secondCourse = parseCourse(second);

      if (firstCourse && secondCourse && /and|&/i.test(second)) {
        const blockId = ensureDefaultBlock();
        pushItem(blockId, "COURSE_GROUP", {
          groupType: "PAIR",
          courses: [firstCourse, secondCourse],
        });
        continue;
      }

      if (firstCourse) {
        const blockId = ensureDefaultBlock();
        pushItem(blockId, "COURSE", firstCourse);
        continue;
      }

      const blockId = ensureDefaultBlock();
      pushItem(blockId, "TEXT_RULE", { text: merged });
    }
  }

  return { program, blocks, items };
}
