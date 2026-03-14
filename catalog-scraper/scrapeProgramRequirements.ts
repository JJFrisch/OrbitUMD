import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

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

export interface ParsedDslNode {
  id: string;
  label: string;
  nodeType: "requireAll" | "requireAny" | "course" | "courseGroup" | "note";
  minCount?: number;
  minCredits?: number;
  subject?: string;
  number?: string;
  text?: string;
  courses?: Array<{ subject: string; number: string }>;
  children: ParsedDslNode[];
}

export interface ParsedProgram {
  code: string;
  title: string;
  college: string;
  degreeType: string;
  sourceUrl: string;
  catalogYearStart: number;
  minCredits: number | null;
  rootNodes: ParsedDslNode[];
  blocks: ParsedBlock[];
  items: ParsedItem[];
  diagnostics: ParsedProgramDiagnostics;
}

export interface ParsedProgramDiagnostics {
  parseMode: "table" | "non-table";
  tableCount: number;
  listCount: number;
  paragraphCount: number;
  headingCount: number;
}

export interface ParsedBlock {
  tempId: string;
  parentTempId: string | null;
  sourceNodeId: string;
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
  if (/Bachelor of Science in Engineering/i.test(text)) return "BSE";
  if (/Bachelor of Science/i.test(text)) return "BS";
  if (/Bachelor of Arts/i.test(text)) return "BA";
  return "UNKNOWN";
}

function parseMinCredits(text: string): number | null {
  const match =
    text.match(/total credits\s*:?\s*(\d+)(?:\s*[-–]\s*(\d+))?/i) ||
    text.match(/minimum of\s+(\d+)\s+credits/i) ||
    text.match(/\((\d+)\s+credits\)/i);
  if (!match) return null;
  const first = Number.parseInt(match[1], 10);
  const second = match[2] ? Number.parseInt(match[2], 10) : null;
  return second ? Math.max(first, second) : first;
}

function parseCollege(url: string, bodyText: string): string {
  const parts = url.split("/").filter(Boolean);
  const idx = parts.findIndex((value) => value === "colleges-schools");
  if (idx >= 0 && idx + 1 < parts.length) {
    return parts[idx + 1]
      .split("-")
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ");
  }

  const crumbs =
    bodyText.match(/College of[^.\n]+/i) ?? bodyText.match(/[A-Z][A-Za-z.&\-\s]+School of [A-Z][A-Za-z.&\-\s]+/i);
  if (crumbs) return normalizeText(crumbs[0]);

  return "Unknown";
}

function parseChooseCount(text: string): number | null {
  const cleaned = normalizeText(text).toLowerCase();
  const numeric = cleaned.match(/\b(select|choose|complete|take)\s+(\d+)\b/);
  if (numeric) return Number.parseInt(numeric[2], 10);

  const word = cleaned.match(/\b(select|choose|complete|take)\s+(one|two|three|four|five|six)\b/);
  if (!word) return null;
  return NUMBER_WORDS[word[2]] ?? null;
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

function rowCells($row: cheerio.Cheerio<AnyNode>): string[] {
  const out: string[] = [];
  $row.find("th, td").each((_i, cell) => {
    out.push(normalizeText(cheerio.load(cell).text()));
  });
  return out;
}

function makeNode(
  id: string,
  label: string,
  nodeType: ParsedDslNode["nodeType"],
  extras: Partial<ParsedDslNode> = {},
): ParsedDslNode {
  return {
    id,
    label,
    nodeType,
    children: [],
    ...extras,
  };
}

function isPlainHeading(text: string): boolean {
  return /:\s*$/.test(text) && !parseCourseTokens(text).length;
}

function isGenericChoiceLabel(text: string): boolean {
  return /^select\s+(one|two|three|four|five|six|\d+)\s+of the following/i.test(normalizeText(text));
}

function parseCourseTokens(text: string): Array<{ subject: string; number: string }> {
  const matches = Array.from(normalizeText(text).toUpperCase().matchAll(/([A-Z]{2,6})\s*([1-9]\d{2}[A-Z]?)/g));
  return matches.map((match) => ({ subject: match[1], number: match[2] }));
}

function mentionsSelectionRule(text: string): boolean {
  return /\b(select|choose|complete|take)\b/i.test(text);
}

function mentionsCreditRule(text: string): boolean {
  return /\b(credit|credits|course|courses|field|fields|semester|semesters)\b/i.test(text);
}

function makePolicyNode(
  nextId: (prefix: string) => string,
  label: string,
  extras: Partial<ParsedDslNode> = {},
): ParsedDslNode {
  return makeNode(nextId("policy"), label, "requireAll", extras);
}

function includesRequirementLanguage(text: string): boolean {
  return /\b(require|required|requirements|credit|credits|must|choose|select|complete|course|track|major|minor|degree|curriculum|semester)\b/i.test(
    text,
  );
}

function parseListTextToNode(text: string, nextId: (prefix: string) => string): ParsedDslNode {
  const chooseCount = parseChooseCount(text);
  const courseTokens = parseCourseTokens(text);
  const minCredits = parseMinCredits(text);

  if (chooseCount !== null) {
    const choiceNode = makeNode(nextId("choice"), text, "requireAny", { minCount: chooseCount });
    for (const token of courseTokens) {
      choiceNode.children.push(makeNode(nextId("course"), `${token.subject}${token.number}`, "course", token));
    }
    return choiceNode;
  }

  if (courseTokens.length >= 2 && /\b(and|&|or)\b/i.test(text)) {
    return makeNode(nextId("group"), text, "courseGroup", { courses: courseTokens });
  }

  if (minCredits !== null || mentionsCreditRule(text)) {
    return makePolicyNode(nextId, text, {
      ...(minCredits !== null ? { minCredits } : {}),
    });
  }

  if (mentionsSelectionRule(text)) {
    return makeNode(nextId("choice"), text, "requireAny", { minCount: chooseCount ?? 1 });
  }

  if (courseTokens.length === 1) {
    const token = courseTokens[0];
    return makeNode(nextId("course"), `${token.subject}${token.number}`, "course", token);
  }

  return makeNode(nextId("note"), text, "note", { text });
}

function parseNonTableRootNodes(
  $: cheerio.CheerioAPI,
  rootNodes: ParsedDslNode[],
  nextId: (prefix: string) => string,
): void {
  const requirementsContainer = $("#requirementstextcontainer").first();
  const textContainer = $("#textcontainer").first();
  const scope = requirementsContainer.length > 0 ? requirementsContainer : textContainer.length > 0 ? textContainer : $("body");

  const fallbackRoot = makeNode(nextId("block"), "Requirements", "requireAll");
  let appended = false;
  let currentSection: ParsedDslNode | null = null;

  scope.find("h2, h3, h4").each((_i, heading) => {
    const label = normalizeText($(heading).text());
    if (!label || !includesRequirementLanguage(label)) return;
    const sectionNode = makeNode(nextId("section"), label.replace(/:\s*$/, ""), "requireAll");
    fallbackRoot.children.push(sectionNode);
    currentSection = sectionNode;
    appended = true;
  });

  scope.find("li").each((_i, li) => {
    const line = normalizeText($(li).text());
    if (!line) return;
    const hasCourseTokens = parseCourseTokens(line).length > 0;
    const hasChooseCount = parseChooseCount(line) !== null;
    const hasMinCredits = parseMinCredits(line) !== null;
    if (!includesRequirementLanguage(line) && !hasCourseTokens && !hasChooseCount && !hasMinCredits) {
      return;
    }
    (currentSection ?? fallbackRoot).children.push(parseListTextToNode(line, nextId));
    appended = true;
  });

  if (!appended) {
    const paragraphs = scope
      .find("p")
      .toArray()
      .map((p) => normalizeText($(p).text()))
      .filter((line) => line && includesRequirementLanguage(line))
      .slice(0, 8);

    for (const paragraph of paragraphs) {
      (currentSection ?? fallbackRoot).children.push(parseListTextToNode(paragraph, nextId));
      appended = true;
    }
  }

  if (appended) {
    rootNodes.push(fallbackRoot);
  }
}

function parseRootNodes(
  html: string,
  sourceUrl: string,
): { title: string; rootNodes: ParsedDslNode[]; bodyText: string; diagnostics: ParsedProgramDiagnostics } {
  const $ = cheerio.load(html);
  const title = normalizeText($("h1.page-title, h1").first().text()) || "Program";
  const bodyText = normalizeText($("body").text());

  const rootNodes: ParsedDslNode[] = [];
  const requirementsContainer = $("#requirementstextcontainer").first();
  const textContainer = $("#textcontainer").first();
  const root = requirementsContainer.length > 0 ? requirementsContainer : $("body");
  const nonTableScope = requirementsContainer.length > 0 ? requirementsContainer : textContainer.length > 0 ? textContainer : $("body");
  const diagnostics: ParsedProgramDiagnostics = {
    parseMode: "table",
    tableCount: root.find("table").length,
    listCount: nonTableScope.find("ul, ol").length,
    paragraphCount: nonTableScope.find("p").length,
    headingCount: nonTableScope.find("h2, h3, h4").length,
  };

  let nodeCounter = 0;
  const nextId = (prefix: string): string => {
    nodeCounter += 1;
    return `${prefix}-${nodeCounter}`;
  };

  root.find("table").each((_tableIndex, tableNode) => {
    let currentRoot: ParsedDslNode | null = null;
    let currentSpecializationGroup: ParsedDslNode | null = null;
    let currentTrackGroup: ParsedDslNode | null = null;
    let currentChoiceNode: ParsedDslNode | null = null;

    const $table = $(tableNode);
    $table.find("tr").each((_rowIndex, rowNode) => {
      const cells = rowCells($(rowNode));
      const first = cells[0] ?? "";
      const second = cells[1] ?? "";
      const merged = normalizeText(`${first} ${second}`);
      if (!merged) return;

      if (/^total credits/i.test(first)) {
        const credits = parseMinCredits(first);
        if (credits !== null && currentRoot) {
          currentRoot.minCredits = credits;
        }
        return;
      }

      const chooseCount = parseChooseCount(merged);
      if (chooseCount !== null) {
        const choiceNode = makeNode(
          nextId("choice"),
          first.replace(/:\s*$/, "") || `Choose ${chooseCount}`,
          "requireAny",
          { minCount: chooseCount },
        );

        const looksLikeSelection = /^\s*(select|choose|take|complete)\b/i.test(first);
        if (currentRoot && (isGenericChoiceLabel(first) || looksLikeSelection)) {
          currentRoot.children.push(choiceNode);
        } else {
          rootNodes.push(choiceNode);
          currentRoot = choiceNode;
        }

        currentChoiceNode = choiceNode;
        return;
      }

      if (/specialization/i.test(first) && isPlainHeading(first)) {
        if (!currentSpecializationGroup) {
          currentSpecializationGroup = makeNode(nextId("specializations"), "Specialization Options", "requireAny", {
            minCount: 1,
          });
          rootNodes.push(currentSpecializationGroup);
        }

        const specializationNode = makeNode(nextId("specialization"), first.replace(/:\s*$/, ""), "requireAll");
        currentSpecializationGroup.children.push(specializationNode);
        currentRoot = specializationNode;
        currentChoiceNode = null;
        return;
      }

      if (/track courses/i.test(first) && isPlainHeading(first)) {
        currentTrackGroup = makeNode(nextId("track-group"), first.replace(/:\s*$/, ""), "requireAny", {
          minCount: 1,
        });
        rootNodes.push(currentTrackGroup);
        currentRoot = currentTrackGroup;
        currentChoiceNode = null;
        return;
      }

      if (/track/i.test(first) && isPlainHeading(first) && currentTrackGroup) {
        const trackNode = makeNode(nextId("track"), first.replace(/:\s*$/, ""), "requireAll");
        currentTrackGroup.children.push(trackNode);
        currentRoot = trackNode;
        currentChoiceNode = null;
        return;
      }

      if (/benchmark/i.test(first) && isPlainHeading(first)) {
        const benchmarkNode = makeNode(nextId("benchmark"), first.replace(/:\s*$/, ""), "requireAll");
        rootNodes.push(benchmarkNode);
        currentRoot = benchmarkNode;
        currentChoiceNode = null;
        return;
      }

      if (isPlainHeading(first)) {
        const node = makeNode(nextId("block"), first.replace(/:\s*$/, ""), "requireAll", {
          minCredits: parseMinCredits(merged) ?? undefined,
        });
        rootNodes.push(node);
        currentRoot = node;
        currentChoiceNode = null;
        currentSpecializationGroup = null;
        return;
      }

      const courseTokens = parseCourseTokens(first);
      if (courseTokens.length >= 2 && /\b(and|&)\b/i.test(first)) {
        const pairNode = makeNode(nextId("pair"), first, "courseGroup", { courses: courseTokens });
        if (currentChoiceNode) {
          const optionNode = makeNode(nextId("option"), first, "requireAll");
          optionNode.children.push(pairNode);
          currentChoiceNode.children.push(optionNode);
        } else {
          currentRoot ??= makeNode(nextId("block"), "Requirements", "requireAll");
          if (!rootNodes.includes(currentRoot)) rootNodes.push(currentRoot);
          currentRoot.children.push(pairNode);
        }
        return;
      }

      if (courseTokens.length > 0) {
        const nestedChoiceAttach = Boolean(currentChoiceNode && currentRoot && currentRoot !== currentChoiceNode);
        let attachTo = currentChoiceNode ?? currentRoot;
        if (
          currentChoiceNode &&
          currentRoot &&
          currentRoot !== currentChoiceNode &&
          typeof currentRoot.minCredits === "number" &&
          currentChoiceNode.children.length >= 2
        ) {
          attachTo = currentRoot;
          currentChoiceNode = null;
        }

        const target = attachTo ?? makeNode(nextId("block"), "Requirements", "requireAll");
        if (!rootNodes.includes(target) && !(nestedChoiceAttach && target === currentChoiceNode)) {
          rootNodes.push(target);
        }
        if (target !== currentChoiceNode) {
          currentRoot = target;
        }

        for (const token of courseTokens) {
          target.children.push(makeNode(nextId("course"), `${token.subject}${token.number}`, "course", token));
        }
        return;
      }

      const target = currentRoot ?? makeNode(nextId("block"), "Requirements", "requireAll");
      if (!rootNodes.includes(target)) rootNodes.push(target);
      currentRoot = target;
      target.children.push(makeNode(nextId("note"), merged, "note", { text: merged }));
    });
  });

  if (rootNodes.length === 0) {
    parseNonTableRootNodes($, rootNodes, nextId);
    diagnostics.parseMode = "non-table";
  }

  return { title, rootNodes, bodyText, diagnostics };
}

function flattenDslNodes(rootNodes: ParsedDslNode[]): { blocks: ParsedBlock[]; items: ParsedItem[] } {
  const blocks: ParsedBlock[] = [];
  const items: ParsedItem[] = [];
  let blockSort = 0;
  let itemSort = 0;

  const walk = (node: ParsedDslNode, parentTempId: string | null): void => {
    if (node.nodeType === "course") {
      if (!parentTempId) return;
      itemSort += 1;
      items.push({
        blockTempId: parentTempId,
        itemType: "COURSE",
        payload: { subject: node.subject, number: node.number },
        sortOrder: itemSort,
      });
      return;
    }

    if (node.nodeType === "courseGroup") {
      if (!parentTempId) return;
      itemSort += 1;
      items.push({
        blockTempId: parentTempId,
        itemType: "COURSE_GROUP",
        payload: { groupType: "PAIR", courses: node.courses ?? [] },
        sortOrder: itemSort,
      });
      return;
    }

    if (node.nodeType === "note") {
      if (!parentTempId) return;
      itemSort += 1;
      items.push({
        blockTempId: parentTempId,
        itemType: "TEXT_RULE",
        payload: { text: node.text ?? node.label },
        sortOrder: itemSort,
      });
      return;
    }

    blockSort += 1;
    const tempId = `blk-${blockSort}`;
    blocks.push({
      tempId,
      parentTempId,
      sourceNodeId: node.id,
      humanLabel: node.label,
      type: node.nodeType === "requireAny" ? "SELECT_N" : "ALL_OF",
      params: {
        ...(typeof node.minCount === "number" ? { nCourses: node.minCount } : {}),
        ...(typeof node.minCredits === "number" ? { minCredits: node.minCredits } : {}),
      },
      sortOrder: blockSort,
      sourceNote: "Flattened from nested DSL",
    });

    for (const child of node.children) {
      walk(child, tempId);
    }
  };

  for (const rootNode of rootNodes) {
    walk(rootNode, null);
  }

  return { blocks, items };
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

export async function scrapeProgramRequirements(url: string): Promise<ParsedProgram | null> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }

  const html = await response.text();
  const { title, rootNodes, bodyText, diagnostics } = parseRootNodes(html, url);

  if (!title || rootNodes.length === 0) {
    return null;
  }

  const { blocks, items } = flattenDslNodes(rootNodes);

  return {
    code: slugify(title),
    title,
    college: parseCollege(url, bodyText),
    degreeType: parseDegreeType(bodyText),
    sourceUrl: url,
    catalogYearStart: parseCatalogYear(),
    minCredits: parseMinCredits(bodyText),
    rootNodes,
    blocks,
    items,
    diagnostics,
  };
}
