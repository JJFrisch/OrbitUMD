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

export interface RequirementDslNode {
  id: string;
  label: string;
  nodeType: "requireAll" | "requireAny" | "course" | "courseGroup" | "note";
  minCount?: number;
  minCredits?: number;
  subject?: string;
  number?: string;
  text?: string;
  courses?: Array<{ subject: string; number: string }>;
  metadata?: Record<string, unknown>;
  children: RequirementDslNode[];
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

function makeNode(
  id: string,
  label: string,
  nodeType: RequirementDslNode["nodeType"],
  extras: Partial<RequirementDslNode> = {},
): RequirementDslNode {
  return {
    id,
    label,
    nodeType,
    children: [],
    ...extras,
  };
}

function isPlainHeading(text: string): boolean {
  return /:\s*$/.test(text) && !parseCourse(text);
}

function isGenericChoiceLabel(text: string): boolean {
  return /^select\s+(one|two|three|four|five|six|\d+)\s+of the following/i.test(normalizeText(text));
}

function parseCourseTokens(text: string): Array<{ subject: string; number: string }> {
  const matches = Array.from(normalizeText(text).toUpperCase().matchAll(/([A-Z]{2,6})\s*(\d{3}[A-Z]?)/g));
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
  extras: Partial<RequirementDslNode> = {},
): RequirementDslNode {
  return makeNode(nextId("policy"), label, "requireAll", extras);
}

function includesRequirementLanguage(text: string): boolean {
  return /\b(require|required|requirements|credit|credits|must|choose|select|complete|course|track|major|minor|degree|curriculum|semester)\b/i.test(
    text,
  );
}

function parseListTextToNode(text: string, nextId: (prefix: string) => string): RequirementDslNode {
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
  document: Document,
  rootNodes: RequirementDslNode[],
  nextId: (prefix: string) => string,
): void {
  const requirementsContainer = document.querySelector("#requirementstextcontainer");
  const textContainer = document.querySelector("#textcontainer");
  const scope = requirementsContainer ?? textContainer ?? document.body;

  const fallbackRoot = makeNode(nextId("block"), "Requirements", "requireAll");
  let appended = false;
  let currentSection: RequirementDslNode | null = null;

  for (const heading of Array.from(scope.querySelectorAll("h2, h3, h4"))) {
    const label = normalizeText(heading.textContent ?? "");
    if (!label || !includesRequirementLanguage(label)) continue;
    const sectionNode = makeNode(nextId("section"), label.replace(/:\s*$/, ""), "requireAll");
    fallbackRoot.children.push(sectionNode);
    currentSection = sectionNode;
    appended = true;
  }

  for (const li of Array.from(scope.querySelectorAll("li"))) {
    const text = normalizeText(li.textContent ?? "");
    if (!text) continue;
    (currentSection ?? fallbackRoot).children.push(parseListTextToNode(text, nextId));
    appended = true;
  }

  if (!appended) {
    const paragraphs = Array.from(scope.querySelectorAll("p"))
      .map((p) => normalizeText(p.textContent ?? ""))
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

function inferNodeLabelFromUrl(url: string): string {
  const tail = url.split("/").filter(Boolean).pop() ?? "requirements";
  return tail.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function parseProgramDslFromHtml(
  html: string,
  url: string,
): { program: Program; rootNodes: RequirementDslNode[] } {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");

  const title = normalizeText(document.querySelector("h1")?.textContent ?? inferNodeLabelFromUrl(url));
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

  const rootNodes: RequirementDslNode[] = [];
  const scope = document.querySelector("#requirementstextcontainer") ?? document.body;
  const tables = Array.from(scope.querySelectorAll("table"));

  let nodeCounter = 0;
  const nextId = (prefix: string): string => {
    nodeCounter += 1;
    return `${prefix}-${nodeCounter}`;
  };

  for (const table of tables) {
    let currentRoot: RequirementDslNode | null = null;
    let currentSpecializationGroup: RequirementDslNode | null = null;
    let currentTrackGroup: RequirementDslNode | null = null;
    let currentChoiceNode: RequirementDslNode | null = null;

    for (const cells of extractRows(table)) {
      const first = cells[0] ?? "";
      const second = cells[1] ?? "";
      const merged = normalizeText(`${first} ${second}`);
      if (!merged) continue;

      if (/^total credits/i.test(first)) {
        const credits = parseMinCredits(first);
        if (credits !== null && currentRoot) {
          currentRoot.minCredits = credits;
        }
        continue;
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
        continue;
      }

      if (/specialization/i.test(first) && isPlainHeading(first)) {
        if (!currentSpecializationGroup) {
          currentSpecializationGroup = makeNode(nextId("specializations"), "Specialization Options", "requireAny", { minCount: 1 });
          rootNodes.push(currentSpecializationGroup);
        }

        const specializationNode = makeNode(nextId("specialization"), first.replace(/:\s*$/, ""), "requireAll");
        currentSpecializationGroup.children.push(specializationNode);
        currentRoot = specializationNode;
        currentChoiceNode = null;
        continue;
      }

      if (/track courses/i.test(first) && isPlainHeading(first)) {
        currentTrackGroup = makeNode(nextId("track-group"), first.replace(/:\s*$/, ""), "requireAny", { minCount: 1 });
        rootNodes.push(currentTrackGroup);
        currentRoot = currentTrackGroup;
        currentChoiceNode = null;
        continue;
      }

      if (/track/i.test(first) && isPlainHeading(first) && currentTrackGroup) {
        const trackNode = makeNode(nextId("track"), first.replace(/:\s*$/, ""), "requireAll");
        currentTrackGroup.children.push(trackNode);
        currentRoot = trackNode;
        currentChoiceNode = null;
        continue;
      }

      if (/benchmark/i.test(first) && isPlainHeading(first)) {
        const benchmarkNode = makeNode(nextId("benchmark"), first.replace(/:\s*$/, ""), "requireAll");
        rootNodes.push(benchmarkNode);
        currentRoot = benchmarkNode;
        currentChoiceNode = null;
        continue;
      }

      if (isPlainHeading(first)) {
        const node = makeNode(nextId("block"), first.replace(/:\s*$/, ""), "requireAll", {
          minCredits: parseMinCredits(merged) ?? undefined,
        });
        rootNodes.push(node);
        currentRoot = node;
        currentChoiceNode = null;
        currentSpecializationGroup = null;
        continue;
      }

      const courseTokens = parseCourseTokens(first);
      if (courseTokens.length >= 2 && /\b(and|&)\b/i.test(first)) {
        const pairNode = makeNode(nextId("pair"), first, "courseGroup", { courses: courseTokens });
        if (currentChoiceNode) {
          const optionNode = makeNode(nextId("option"), first, "requireAll");
          optionNode.children.push(pairNode);
          currentChoiceNode.children.push(optionNode);
        } else {
          (currentRoot ??= makeNode(nextId("block"), "Requirements", "requireAll"));
          if (!rootNodes.includes(currentRoot)) rootNodes.push(currentRoot);
          currentRoot.children.push(pairNode);
        }
        continue;
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
        continue;
      }

      const target = currentRoot ?? makeNode(nextId("block"), "Requirements", "requireAll");
      if (!rootNodes.includes(target)) rootNodes.push(target);
      currentRoot = target;
      target.children.push(makeNode(nextId("note"), merged, "note", { text: merged }));
    }
  }

  if (rootNodes.length === 0) {
    parseNonTableRootNodes(document, rootNodes, nextId);
  }

  return { program, rootNodes };
}

function flattenDslNodes(
  program: Program,
  rootNodes: RequirementDslNode[],
): { blocks: RequirementBlock[]; items: RequirementItem[] } {
  const blocks: RequirementBlock[] = [];
  const items: RequirementItem[] = [];
  let blockSort = 0;
  let itemSort = 0;

  const walk = (node: RequirementDslNode, parentBlockId: string | null): void => {
    if (node.nodeType === "course") {
      if (!parentBlockId) return;
      itemSort += 1;
      items.push({
        id: `${node.id}-item`,
        block_id: parentBlockId,
        item_type: "COURSE",
        payload: { subject: node.subject, number: node.number },
        sort_order: itemSort,
      });
      return;
    }

    if (node.nodeType === "courseGroup") {
      if (!parentBlockId) return;
      itemSort += 1;
      items.push({
        id: `${node.id}-item`,
        block_id: parentBlockId,
        item_type: "COURSE_GROUP",
        payload: { groupType: "PAIR", courses: node.courses ?? [] },
        sort_order: itemSort,
      });
      return;
    }

    if (node.nodeType === "note") {
      if (!parentBlockId) return;
      itemSort += 1;
      items.push({
        id: `${node.id}-item`,
        block_id: parentBlockId,
        item_type: "TEXT_RULE",
        payload: { text: node.text ?? node.label },
        sort_order: itemSort,
      });
      return;
    }

    blockSort += 1;
    const blockId = node.id;
    blocks.push({
      id: blockId,
      program_id: program.id,
      parent_block_id: parentBlockId,
      label: node.label,
      type: node.nodeType === "requireAny" ? "SELECT_N" : "ALL_OF",
      sort_order: blockSort,
      params: {
        ...(typeof node.minCount === "number" ? { nCourses: node.minCount } : {}),
        ...(typeof node.minCredits === "number" ? { minCredits: node.minCredits } : {}),
      },
      is_major_core: true,
      is_track: /track/i.test(node.label),
      is_specialization: /specialization/i.test(node.label),
      is_benchmark: /benchmark/i.test(node.label),
      is_policy: false,
      source_note: "Flattened from parsed DSL",
    });

    for (const child of node.children) {
      walk(child, blockId);
    }
  };

  for (const node of rootNodes) {
    walk(node, null);
  }

  return { blocks, items };
}

export function parseProgramFromHtml(
  html: string,
  url: string,
): { program: Program; blocks: RequirementBlock[]; items: RequirementItem[]; rootNodes: RequirementDslNode[] } {
  const { program, rootNodes } = parseProgramDslFromHtml(html, url);
  const { blocks, items } = flattenDslNodes(program, rootNodes);
  return { program, blocks, items, rootNodes };
}
