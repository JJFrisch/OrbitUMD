import * as cheerio from "cheerio";

export type BlockType =
  | "ALL_OF"
  | "SELECT_N"
  | "CREDITS_MIN"
  | "TRACK_GROUP"
  | "POLICY"
  | "BENCHMARK"
  | "NOTE";

export type ItemType =
  | "COURSE"
  | "COURSE_GROUP"
  | "ATTRIBUTE"
  | "LEVEL_CONSTRAINT"
  | "SUBJECT_CONSTRAINT"
  | "TEXT_RULE";

export interface ParsedProgram {
  code: string;
  title: string;
  college: string;
  degreeType: string;
  sourceUrl: string;
  catalogYearStart: number;
  minCredits: number | null;
  blocks: ParsedBlock[];
}

export interface ParsedBlock {
  tempId: string;
  parentTempId: string | null;
  humanLabel: string;
  type: BlockType;
  params: Record<string, unknown>;
  sortOrder: number;
  sourceNote?: string;
  sourceUrl?: string;
}

export interface ParsedItem {
  blockTempId: string;
  itemType: ItemType;
  payload: Record<string, unknown>;
  sortOrder: number;
}

const SITEMAP_URL = "https://academiccatalog.umd.edu/sitemap.xml";

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseCatalogYear(): number {
  return new Date().getUTCFullYear();
}

function parseDegreeType(text: string): string {
  if (/Bachelor of Science/i.test(text)) return "BS";
  if (/Bachelor of Arts/i.test(text)) return "BA";
  if (/Bachelor of Science in Engineering/i.test(text)) return "BSE";
  return "UNKNOWN";
}

function parseMinCredits(text: string): number | null {
  const minMatch = text.match(/minimum of\s+(\d+)\s+credits/i);
  if (minMatch) return Number.parseInt(minMatch[1], 10);

  const totalMatch = text.match(/total credits\s*(\d+)(?:\s*[\-–]\s*(\d+))?/i);
  if (totalMatch) {
    const first = Number.parseInt(totalMatch[1], 10);
    const second = totalMatch[2] ? Number.parseInt(totalMatch[2], 10) : null;
    return second ? Math.max(first, second) : first;
  }

  return null;
}

function parseCollegeFromUrl(url: string): string {
  const parts = url.split("/").filter(Boolean);
  const idx = parts.findIndex((part) => part === "colleges-schools");
  if (idx >= 0 && idx + 1 < parts.length) {
    return parts[idx + 1]
      .split("-")
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ");
  }
  return "Unknown";
}

function parseCourseCode(text: string): { subject: string; number: string } | null {
  const normalized = normalizeText(text).toUpperCase();
  const match = normalized.match(/([A-Z]{2,6}(?:\/[A-Z]{2,6})?)\s*(\d{3}[A-Z]?)/);
  if (!match) return null;
  return { subject: match[1], number: match[2] };
}

function parseChooseCount(text: string): number | null {
  const normalized = normalizeText(text).toLowerCase();
  const digit = normalized.match(/\b(select|choose|take|complete)\s+(\d+)\b/);
  if (digit) return Number.parseInt(digit[2], 10);

  const word = normalized.match(
    /\b(select|choose|take|complete)\s+(one|two|three|four|five|six|seven|eight|nine|ten)\b/,
  );

  if (!word) return null;
  return NUMBER_WORDS[word[2]] ?? null;
}

function parseCreditMinimum(text: string): number | null {
  const match = text.match(/(\d+)\s*(?:-|–)?\s*(\d+)?\s*credits/i);
  if (!match) return null;
  const first = Number.parseInt(match[1], 10);
  const second = match[2] ? Number.parseInt(match[2], 10) : null;
  return second ? Math.max(first, second) : first;
}

function looksLikeTotalCredits(text: string): boolean {
  return /^total credits/i.test(normalizeText(text));
}

function looksLikeTrackHeader(text: string): boolean {
  return /\b(track|concentration|specialization|option)\b/i.test(text) && !/select\s+\d+/i.test(text);
}

function looksLikeBenchmarkHeader(text: string): boolean {
  return /\bbenchmark\b/i.test(text);
}

function rowCells($row: cheerio.Cheerio<cheerio.Element>): string[] {
  const out: string[] = [];
  $row.find("th, td").each((_i, cell) => {
    out.push(normalizeText(cheerio.load(cell).text()));
  });
  return out;
}

function extractProgramUrlsFromSitemap(xml: string): string[] {
  const urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
  return urls.filter((url) => {
    const lower = url.toLowerCase();
    if (!lower.startsWith("https://academiccatalog.umd.edu/undergraduate/")) return false;
    if (!lower.includes("/colleges-schools/")) return false;
    return lower.includes("-major/") || lower.includes("-minor/");
  });
}

export async function discoverProgramRequirementUrls(maxPrograms = 0): Promise<string[]> {
  const response = await fetch(SITEMAP_URL);
  if (!response.ok) {
    throw new Error(`Failed to load sitemap: HTTP ${response.status}`);
  }

  const xml = await response.text();
  const urls = extractProgramUrlsFromSitemap(xml);
  return maxPrograms > 0 ? urls.slice(0, maxPrograms) : urls;
}

function addTextRule(
  items: ParsedItem[],
  blockTempId: string,
  text: string,
  sortOrder: number,
): void {
  const normalized = normalizeText(text);
  if (!normalized) return;

  items.push({
    blockTempId,
    itemType: "TEXT_RULE",
    payload: { text: normalized },
    sortOrder,
  });
}

export async function scrapeProgramRequirements(url: string): Promise<ParsedProgram | null> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const title = normalizeText($("h1.page-title, h1").first().text());
  if (!title) return null;

  const bodyText = normalizeText($("body").text());
  const college = parseCollegeFromUrl(url);
  const degreeType = parseDegreeType(bodyText);
  const minCredits = parseMinCredits(bodyText);

  const blocks: ParsedBlock[] = [];
  const items: ParsedItem[] = [];

  const requirementsContainer = $("#requirementstextcontainer").first();
  const root = requirementsContainer.length > 0 ? requirementsContainer : $("body");

  let blockCount = 0;
  let itemCount = 0;
  let currentBlockTempId: string | null = null;
  let currentTrackGroupTempId: string | null = null;

  const ensureDefaultBlock = (tableIndex: number): string => {
    if (currentBlockTempId) return currentBlockTempId;

    const tempId = `blk-${tableIndex}-${blockCount}`;
    blockCount += 1;

    blocks.push({
      tempId,
      parentTempId: null,
      humanLabel: `Requirement Block ${tableIndex + 1}`,
      type: "ALL_OF",
      params: {},
      sortOrder: blockCount,
      sourceNote: "Generated fallback block",
      sourceUrl: url,
    });

    currentBlockTempId = tempId;
    return tempId;
  };

  root.find("table").each((tableIndex, tableNode) => {
    currentBlockTempId = null;
    currentTrackGroupTempId = null;

    const $table = $(tableNode);

    $table.find("tr").each((_rowIndex, rowNode) => {
      const $row = $(rowNode);
      const cells = rowCells($row);
      if (cells.length === 0) return;

      const first = cells[0] ?? "";
      const second = cells[1] ?? "";
      const joined = normalizeText(`${first} ${second}`);
      if (!joined) return;
      if (looksLikeTotalCredits(joined)) return;

      const chooseCount = parseChooseCount(joined);
      const creditMin = parseCreditMinimum(joined);
      const courseFirst = parseCourseCode(first);
      const courseSecond = parseCourseCode(second);

      if (looksLikeTrackHeader(first)) {
        const trackGroupId = `blk-${tableIndex}-${blockCount}`;
        blockCount += 1;

        blocks.push({
          tempId: trackGroupId,
          parentTempId: null,
          humanLabel: first.replace(/:$/, ""),
          type: "TRACK_GROUP",
          params: creditMin ? { minCredits: creditMin } : {},
          sortOrder: blockCount,
          sourceNote: "Track/concentration heading row",
          sourceUrl: url,
        });

        currentTrackGroupTempId = trackGroupId;
        currentBlockTempId = null;

        if (joined.length > first.length) {
          addTextRule(items, trackGroupId, joined, itemCount);
          itemCount += 1;
        }
        return;
      }

      if (looksLikeBenchmarkHeader(first)) {
        const benchmarkId = `blk-${tableIndex}-${blockCount}`;
        blockCount += 1;

        blocks.push({
          tempId: benchmarkId,
          parentTempId: null,
          humanLabel: first.replace(/:$/, ""),
          type: "BENCHMARK",
          params: {},
          sortOrder: blockCount,
          sourceNote: "Benchmark heading row",
          sourceUrl: url,
        });
        currentBlockTempId = benchmarkId;
        currentTrackGroupTempId = null;
        return;
      }

      if (chooseCount !== null) {
        const selectId = `blk-${tableIndex}-${blockCount}`;
        blockCount += 1;

        blocks.push({
          tempId: selectId,
          parentTempId: currentTrackGroupTempId,
          humanLabel: first.replace(/:$/, ""),
          type: "SELECT_N",
          params: { nCourses: chooseCount },
          sortOrder: blockCount,
          sourceNote: "Select-N heading row",
          sourceUrl: url,
        });

        if (creditMin !== null) {
          addTextRule(items, selectId, `${joined} (min credits hint: ${creditMin})`, itemCount);
          itemCount += 1;
        }

        currentBlockTempId = selectId;
        return;
      }

      if (courseFirst && /^\s*(and|&)\s*$/i.test(second) && courseSecond) {
        const blockId = ensureDefaultBlock(tableIndex);
        items.push({
          blockTempId: blockId,
          itemType: "COURSE_GROUP",
          payload: {
            groupType: "PAIR",
            courses: [courseFirst, courseSecond],
          },
          sortOrder: itemCount,
        });
        itemCount += 1;
        return;
      }

      if (courseFirst && /\b(and|&)\b/i.test(second) && courseSecond) {
        const blockId = ensureDefaultBlock(tableIndex);
        items.push({
          blockTempId: blockId,
          itemType: "COURSE_GROUP",
          payload: {
            groupType: "PAIR",
            courses: [courseFirst, courseSecond],
          },
          sortOrder: itemCount,
        });
        itemCount += 1;
        return;
      }

      if (courseFirst) {
        const blockId = ensureDefaultBlock(tableIndex);
        items.push({
          blockTempId: blockId,
          itemType: "COURSE",
          payload: courseFirst,
          sortOrder: itemCount,
        });
        itemCount += 1;
        return;
      }

      const activeBlockId = ensureDefaultBlock(tableIndex);
      addTextRule(items, activeBlockId, joined, itemCount);
      itemCount += 1;
    });
  });

  if (blocks.length === 0) {
    return null;
  }

  return {
    code: slugify(title),
    title,
    college,
    degreeType,
    sourceUrl: url,
    catalogYearStart: parseCatalogYear(),
    minCredits,
    blocks,
    items,
  };
}
