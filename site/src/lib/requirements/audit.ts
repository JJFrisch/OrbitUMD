import { fetchProgramRequirements } from "@/lib/repositories/degreeRequirementsRepository";
import type { UserDegreeProgram } from "@/lib/repositories/degreeProgramsRepository";
import type { RequirementNode, RequirementSection } from "@/lib/types/requirements";
import requirementsCatalog from "@/lib/data/umd_program_requirements.json";

export type AuditCourseStatus = "completed" | "in_progress" | "planned" | "not_started";

export interface RequirementSectionBundle {
  id: string;
  title: string;
  requirementType: "all" | "choose";
  chooseCount?: number;
  notes: string[];
  special: boolean;
  courseCodes: string[];
  optionGroups: string[][];
  standaloneCodes: string[];
  logicBlocks: Array<{ type: "AND" | "OR"; codes: string[] }>;
}

export interface ProgramRequirementBundle {
  programId: string;
  programName: string;
  programCode: string;
  kind: "major" | "minor" | "program";
  source: "db" | "scraped";
  specializations: string[];
  sections: RequirementSectionBundle[];
}

interface ScrapedProgram {
  name: string;
  type?: string;
  specializations?: string[];
  builderSections?: Array<{
    title: string;
    requirementType: "all" | "choose";
    chooseCount?: number;
    rules?: string[];
    items?: Array<{ type?: "OR" | "AND"; items?: Array<{ code?: string }> }>;
  }>;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(bachelor|science|arts|bs|ba|major|minor|program|concentration)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeCodes(codes: string[]): string[] {
  return Array.from(new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean)));
}

function flattenNodeCourseCodes(nodes: RequirementNode[]): string[] {
  const out: string[] = [];
  const visit = (node: RequirementNode) => {
    if (node.nodeType === "COURSE" && node.courseCode) {
      out.push(node.courseCode);
    }
    for (const child of node.children) visit(child);
  };
  nodes.forEach(visit);
  return dedupeCodes(out);
}

function collectOptionGroups(nodes: RequirementNode[]): string[][] {
  const groups: string[][] = [];

  const visit = (node: RequirementNode, parentType?: RequirementNode["nodeType"]) => {
    if (node.nodeType === "OR_GROUP") {
      const groupCodes = dedupeCodes(flattenNodeCourseCodes(node.children));
      if (groupCodes.length > 0) groups.push(groupCodes);
    }

    if (node.nodeType === "COURSE" && node.courseCode && parentType !== "OR_GROUP") {
      groups.push([node.courseCode.toUpperCase()]);
    }

    for (const child of node.children) {
      visit(child, node.nodeType);
    }
  };

  nodes.forEach((node) => visit(node));
  return groups;
}

function isSpecialSection(title: string, notes: string[]): boolean {
  const haystack = `${title} ${notes.join(" ")}`.toLowerCase();
  return /specialization|track|select one|choose|concentration|option/.test(haystack);
}

function mapDbSection(section: RequirementSection): RequirementSectionBundle {
  const courseCodes = flattenNodeCourseCodes(section.nodes);
  const optionGroups = collectOptionGroups(section.nodes);
  const optionCodeSet = new Set(optionGroups.flat());
  const standaloneCodes = courseCodes.filter((code) => !optionCodeSet.has(code));
  const logicBlocks = [
    ...optionGroups.map((codes) => ({ type: "OR" as const, codes })),
    ...standaloneCodes.map((code) => ({ type: "AND" as const, codes: [code] })),
  ];

  return {
    id: section.id ?? crypto.randomUUID(),
    title: section.title,
    requirementType: section.sectionType === "choose_n" ? "choose" : "all",
    chooseCount: section.minCount,
    notes: [],
    special: isSpecialSection(section.title, []),
    courseCodes,
    optionGroups,
    standaloneCodes,
    logicBlocks,
  };
}

function mapScrapedSection(section: NonNullable<ScrapedProgram["builderSections"]>[number]): RequirementSectionBundle {
  const optionGroups: string[][] = [];
  const standalone: string[] = [];
  const logicBlocks: Array<{ type: "AND" | "OR"; codes: string[] }> = [];

  for (const item of section.items ?? []) {
    const itemCodes = dedupeCodes((item.items ?? []).map((row) => row.code ?? ""));
    if (item.type === "OR" && itemCodes.length > 0) {
      optionGroups.push(itemCodes);
      logicBlocks.push({ type: "OR", codes: itemCodes });
    } else {
      itemCodes.forEach((code) => standalone.push(code));
      if (itemCodes.length > 0) {
        logicBlocks.push({ type: "AND", codes: itemCodes });
      }
    }
  }

  const courseCodes = dedupeCodes([...optionGroups.flat(), ...standalone]);

  return {
    id: crypto.randomUUID(),
    title: section.title,
    requirementType: section.requirementType,
    chooseCount: section.chooseCount,
    notes: section.rules ?? [],
    special: isSpecialSection(section.title, section.rules ?? []),
    courseCodes,
    optionGroups,
    standaloneCodes: dedupeCodes(standalone),
    logicBlocks,
  };
}

function resolveProgramKind(program: UserDegreeProgram): "major" | "minor" | "program" {
  const text = `${program.programName} ${program.degreeType ?? ""}`.toLowerCase();
  if (text.includes("minor")) return "minor";
  if (text.includes("major") || text.includes("b.s") || text.includes("b.a")) return "major";
  return "program";
}

function findScrapedProgram(program: UserDegreeProgram): ScrapedProgram | null {
  const entries = ((requirementsCatalog as any)?.programs ?? []) as ScrapedProgram[];
  const target = normalizeName(program.programName);
  const programKind = resolveProgramKind(program);

  const kindMatches = entries.filter((entry) => {
    if (!entry.type) return true;
    if (programKind === "major") return entry.type === "major";
    if (programKind === "minor") return entry.type === "minor";
    return true;
  });

  let best: ScrapedProgram | null = null;
  let bestScore = -1;

  for (const entry of kindMatches) {
    const normalized = normalizeName(entry.name);
    if (!normalized) continue;

    let score = 0;
    if (normalized === target) score += 100;
    if (normalized.includes(target) || target.includes(normalized)) score += 40;

    const targetTokens = new Set(target.split(" "));
    const normalizedTokens = new Set(normalized.split(" "));
    let overlap = 0;
    for (const token of targetTokens) {
      if (normalizedTokens.has(token)) overlap += 1;
    }
    score += overlap;

    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return bestScore >= 8 ? best : null;
}

export async function loadProgramRequirementBundles(programs: UserDegreeProgram[]): Promise<ProgramRequirementBundle[]> {
  const bundles: ProgramRequirementBundle[] = [];

  for (const program of programs) {
    const dbSections = await fetchProgramRequirements(program.programId);
    if (dbSections.length > 0) {
      bundles.push({
        programId: program.programId,
        programName: program.programName,
        programCode: program.programCode,
        kind: resolveProgramKind(program),
        source: "db",
        specializations: [],
        sections: dbSections.map(mapDbSection),
      });
      continue;
    }

    const scraped = findScrapedProgram(program);
    bundles.push({
      programId: program.programId,
      programName: program.programName,
      programCode: program.programCode,
      kind: resolveProgramKind(program),
      source: "scraped",
      specializations: scraped?.specializations ?? [],
      sections: (scraped?.builderSections ?? []).map(mapScrapedSection),
    });
  }

  return bundles;
}

export interface RequirementSectionAudit {
  sectionId: string;
  status: AuditCourseStatus;
  requiredSlots: number;
  completedSlots: number;
  inProgressSlots: number;
  plannedSlots: number;
}

function statusRank(status: AuditCourseStatus): number {
  if (status === "completed") return 3;
  if (status === "in_progress") return 2;
  if (status === "planned") return 1;
  return 0;
}

function bestStatusForCodes(codes: string[], byCourseCode: Map<string, AuditCourseStatus>): AuditCourseStatus {
  let best: AuditCourseStatus = "not_started";
  for (const code of codes) {
    const status = byCourseCode.get(code.toUpperCase()) ?? "not_started";
    if (statusRank(status) > statusRank(best)) {
      best = status;
    }
  }
  return best;
}

export function evaluateRequirementSection(
  section: RequirementSectionBundle,
  byCourseCode: Map<string, AuditCourseStatus>
): RequirementSectionAudit {
  const slotStatuses: AuditCourseStatus[] = [];

  for (const group of section.optionGroups) {
    slotStatuses.push(bestStatusForCodes(group, byCourseCode));
  }
  for (const code of section.standaloneCodes) {
    slotStatuses.push(bestStatusForCodes([code], byCourseCode));
  }

  if (slotStatuses.length === 0) {
    for (const code of section.courseCodes) {
      slotStatuses.push(bestStatusForCodes([code], byCourseCode));
    }
  }

  const requiredSlotsBase = slotStatuses.length > 0 ? slotStatuses.length : section.courseCodes.length;
  const requiredSlots = Math.max(1, section.requirementType === "choose" ? section.chooseCount ?? 1 : requiredSlotsBase);

  const sorted = [...slotStatuses].sort((a, b) => statusRank(b) - statusRank(a));
  const relevant = sorted.slice(0, requiredSlots);

  const completedSlots = relevant.filter((status) => status === "completed").length;
  const inProgressSlots = relevant.filter((status) => status === "in_progress").length;
  const plannedSlots = relevant.filter((status) => status === "planned").length;

  let status: AuditCourseStatus = "not_started";
  if (completedSlots >= requiredSlots) {
    status = "completed";
  } else if (completedSlots + inProgressSlots >= requiredSlots) {
    status = "in_progress";
  } else if (completedSlots + inProgressSlots + plannedSlots >= requiredSlots) {
    status = "planned";
  }

  return {
    sectionId: section.id,
    status,
    requiredSlots,
    completedSlots,
    inProgressSlots,
    plannedSlots,
  };
}

export function buildCourseContributionMap(bundles: ProgramRequirementBundle[]): Map<string, string[]> {
  const map = new Map<string, Set<string>>();

  for (const bundle of bundles) {
    const label = `${bundle.kind}: ${bundle.programName}`;
    for (const section of bundle.sections) {
      for (const code of section.courseCodes) {
        const normalized = code.toUpperCase();
        if (!map.has(normalized)) {
          map.set(normalized, new Set());
        }
        map.get(normalized)!.add(label);
      }
    }
  }

  const collapsed = new Map<string, string[]>();
  for (const [code, labels] of map.entries()) {
    collapsed.set(code, Array.from(labels));
  }
  return collapsed;
}
