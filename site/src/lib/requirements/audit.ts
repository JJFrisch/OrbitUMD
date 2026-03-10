import { fetchProgramRequirements } from "@/lib/repositories/degreeRequirementsRepository";
import type { UserDegreeProgram } from "@/lib/repositories/degreeProgramsRepository";
import type { RequirementNode, RequirementSection } from "@/lib/types/requirements";
import requirementsCatalog from "@/lib/data/umd_program_requirements.json";
import csRequirements from "@/lib/data/cs_major_requirements.json";

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
  specializationId?: string; // For tracking which specialization a section belongs to
}

export interface ProgramRequirementBundle {
  programId: string;
  programName: string;
  programCode: string;
  kind: "major" | "minor" | "program";
  source: "db" | "scraped" | "cs-specialized";
  specializations: string[];
  sections: RequirementSectionBundle[];
  specializationOptions?: Array<{ id: string; name: string }>; // For CS major
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
    items?: Array<{ type?: "OR" | "AND"; code?: string; items?: Array<{ code?: string }> }>;
  }>;
  requirementCourseBlocks?: Array<{
    kind?: string;
    courses?: Array<{ code?: string; courseCode?: string; name?: string; credits?: number }>;
    builderSections?: Array<{
      title: string;
      requirementType: "all" | "choose";
      chooseCount?: number;
      courses?: Array<{ code?: string; courseCode?: string; name?: string; credits?: number }>;
    }>;
  }>;
}

const BIOLOGY_SPECIALIZATION_ORDER = [
  { id: "bio-cell-biology-genetics", name: "Cell Biology and Genetics" },
  { id: "bio-ecology-evolution", name: "Ecology and Evolution" },
  { id: "bio-general-biology", name: "General Biology" },
  { id: "bio-microbiology", name: "Microbiology" },
  { id: "bio-physiology-neurobiology", name: "Physiology and Neurobiology" },
  { id: "bio-individualized-studies", name: "Individualized Studies" },
] as const;

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
    id: section.id ?? createId(),
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

function mapScrapedSection(
  section:
    | NonNullable<ScrapedProgram["builderSections"]>[number]
    | NonNullable<NonNullable<ScrapedProgram["requirementCourseBlocks"]>[number]["builderSections"]>[number]
): RequirementSectionBundle {
  const optionGroups: string[][] = [];
  const standalone: string[] = [];
  const logicBlocks: Array<{ type: "AND" | "OR"; codes: string[] }> = [];

  // Some scraped sections are represented as a direct course list instead of items[] blocks.
  const sectionCourseCodes = dedupeCodes(
    ((section as { courses?: Array<{ code?: string; courseCode?: string }> }).courses ?? []).map((c) => c?.code ?? c?.courseCode ?? "")
  );
  if (sectionCourseCodes.length > 0) {
    optionGroups.push(sectionCourseCodes);
    logicBlocks.push({ type: "OR", codes: sectionCourseCodes });
  }

  for (const item of (section as { items?: Array<{ type?: "OR" | "AND"; code?: string; items?: Array<{ code?: string }> }> }).items ?? []) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const directCode = typeof (item as { code?: string }).code === "string" ? (item as { code?: string }).code : "";
    const nestedCodes = Array.isArray((item as { items?: Array<{ code?: string }> }).items)
      ? (item as { items?: Array<{ code?: string }> }).items ?? []
      : [];

    const itemCodes = dedupeCodes([
      directCode,
      ...nestedCodes.map((row) => row?.code ?? ""),
    ]);

    // Treat items with nested items as option groups (OR logic), even if type is not explicitly set
    const isOptionGroup = item.type === "OR" || (nestedCodes.length > 0 && !directCode);

    if (isOptionGroup && itemCodes.length > 0) {
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
  const notes = (section as { rules?: string[] }).rules ?? [];

  return {
    id: createId(),
    title: section.title,
    requirementType: section.requirementType,
    chooseCount: section.chooseCount,
    notes,
    special: isSpecialSection(section.title, notes),
    courseCodes,
    optionGroups,
    standaloneCodes: dedupeCodes(standalone),
    logicBlocks,
  };
}

/**
 * Convert CS Major requirements structure to RequirementSectionBundle[].
 * Handles both base requirements and specialization-specific requirements.
 */
function mapCsRequirementsToSections(
  csReq: typeof csRequirements,
  selectedSpecializationId?: string
): RequirementSectionBundle[] {
  const sections: RequirementSectionBundle[] = [];

  // Always include base requirements
  for (const req of csReq.baseRequirements) {
    const courseCodes = extractCoursesFromCsRequirement(req);
    const optionGroups = extractOptionGroupsFromCsRequirement(req);

    sections.push({
      id: req.id,
      title: req.title,
      requirementType: req.type === "CHOOSE_N" ? "choose" : "all",
      chooseCount: (req as any).count,
      notes: (req as any).notes || [],
      special: false,
      courseCodes,
      optionGroups,
      standaloneCodes: courseCodes.filter((c) => !optionGroups.some((og) => og.includes(c))),
      logicBlocks: [],
    });
  }

  // If specialization is selected, add specialization requirements
  if (selectedSpecializationId) {
    const spec = csReq.specializations.find((s) => s.id === selectedSpecializationId);
    if (spec) {
      for (const req of spec.requirements) {
        // Skip REFERENCE types (they're already in base)
        if ((req as any).type === "REFERENCE") continue;

        const courseCodes = extractCoursesFromCsRequirement(req);
        const optionGroups = extractOptionGroupsFromCsRequirement(req);

        sections.push({
          id: req.id,
          title: req.title,
          requirementType: req.type === "CHOOSE_N" ? "choose" : "all",
          chooseCount: (req as any).count,
          notes: (req as any).notes || [],
          special: false,
          courseCodes,
          optionGroups,
          standaloneCodes: courseCodes.filter((c) => !optionGroups.some((og) => og.includes(c))),
          logicBlocks: [],
          specializationId: selectedSpecializationId,
        });
      }
    }
  }

  return sections;
}

/**
 * Extract all course codes from a CS requirement object
 */
function extractCoursesFromCsRequirement(req: any): string[] {
  const codes = new Set<string>();

  if (req.courses && Array.isArray(req.courses)) {
    for (const course of req.courses) {
      if (course.code) codes.add(course.code.toUpperCase());
    }
  }

  if (req.areas && Array.isArray(req.areas)) {
    for (const area of req.areas) {
      if (area.courses && Array.isArray(area.courses)) {
        for (const course of area.courses) {
          if (course.code) codes.add(course.code.toUpperCase());
        }
      }
    }
  }

  if (req.items && Array.isArray(req.items)) {
    for (const item of req.items) {
      if (item.courses && Array.isArray(item.courses)) {
        for (const course of item.courses) {
          if (course.code) codes.add(course.code.toUpperCase());
        }
      }
      if (item.options && Array.isArray(item.options)) {
        for (const option of item.options) {
          if (option.code) codes.add(option.code.toUpperCase());
        }
      }
    }
  }

  return Array.from(codes);
}

/**
 * Extract option groups (OR groups) from a CS requirement
 */
function extractOptionGroupsFromCsRequirement(req: any): string[][] {
  const groups: string[][] = [];

  if (req.courses && Array.isArray(req.courses)) {
    const codes = req.courses
      .filter((c: any) => c.code)
      .map((c: any) => c.code.toUpperCase());
    if (codes.length > 0) groups.push(codes);
  }

  if (req.areas && Array.isArray(req.areas)) {
    for (const area of req.areas) {
      if (area.courses && Array.isArray(area.courses)) {
        const codes = area.courses
          .filter((c: any) => c.code)
          .map((c: any) => c.code.toUpperCase());
        if (codes.length > 0) groups.push(codes);
      }
    }
  }

  if (req.items && Array.isArray(req.items)) {
    for (const item of req.items) {
      if (item.courses && Array.isArray(item.courses)) {
        const codes = item.courses
          .filter((c: any) => c.code)
          .map((c: any) => c.code.toUpperCase());
        if (codes.length > 0) groups.push(codes);
      }
      if (item.options && Array.isArray(item.options)) {
        const codes = item.options
          .filter((o: any) => o.code)
          .map((o: any) => o.code.toUpperCase());
        if (codes.length > 0) groups.push(codes);
      }
    }
  }

  return groups;
}

function resolveProgramKind(program: UserDegreeProgram): "major" | "minor" | "program" {
  const text = `${program.programName} ${program.degreeType ?? ""}`.toLowerCase();
  if (text.includes("minor")) return "minor";
  if (text.includes("major") || text.includes("b.s") || text.includes("b.a")) return "major";
  return "program";
}

function isBiologicalSciencesMajor(program: UserDegreeProgram): boolean {
  return normalizeName(program.programName).includes("biological sciences");
}

function mapBiologyScrapedSections(scraped: ScrapedProgram): {
  sections: RequirementSectionBundle[];
  specializationOptions: Array<{ id: string; name: string }>;
} {
  const sections: RequirementSectionBundle[] = [];
  const blocks = scraped.requirementCourseBlocks ?? [];

  if (blocks.length > 0) {
    // Block 0 is shared core requirements shown before specialization tracks.
    const baseSections = blocks[0]?.builderSections ?? [];
    sections.push(...baseSections.map((section) => mapScrapedSection(section)));

    // Remaining blocks map to specialization tracks in catalog order.
    const mappedTrackBlocks = blocks.slice(1, 6);
    mappedTrackBlocks.forEach((block, idx) => {
      const spec = BIOLOGY_SPECIALIZATION_ORDER[idx];
      if (!spec || !block?.builderSections) return;

      const specSections = block.builderSections.map((section) => ({
        ...mapScrapedSection(section),
        specializationId: spec.id,
      }));
      sections.push(...specSections);
    });
  } else {
    // Fallback when course blocks are unavailable.
    sections.push(...(scraped.builderSections ?? []).map(mapScrapedSection));
  }

  return {
    sections,
    specializationOptions: BIOLOGY_SPECIALIZATION_ORDER.map((spec) => ({ id: spec.id, name: spec.name })),
  };
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

/**
 * Load sections for a CS major specialization.
 * Returns base sections + specialization sections for the selected specialization.
 */
export function getCsRequirementSectionsForSpecialization(
  specializationId: string | undefined
): RequirementSectionBundle[] {
  return mapCsRequirementsToSections(csRequirements, specializationId);
}

export async function loadProgramRequirementBundles(programs: UserDegreeProgram[]): Promise<ProgramRequirementBundle[]> {
  const bundles: ProgramRequirementBundle[] = [];

  for (const program of programs) {
    // Check if this is Computer Science Major - use specialized structure
    if (program.programName.toLowerCase().includes("computer science")) {
      const specializationOptions = csRequirements.specializations.map((s) => ({
        id: s.id,
        name: s.name,
      }));

      bundles.push({
        programId: program.programId,
        programName: program.programName,
        programCode: program.programCode,
        kind: "major",
        source: "cs-specialized",
        specializations: csRequirements.specializations.map((s) => s.name),
        sections: mapCsRequirementsToSections(csRequirements, undefined),
        specializationOptions,
      });
      continue;
    }

    let dbSections: RequirementSection[] = [];
    try {
      dbSections = await fetchProgramRequirements(program.programId);
    } catch {
      // Fall back to scraped catalog data when DB requirements are unavailable.
      dbSections = [];
    }

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

    let sections: RequirementSectionBundle[] = [];
    let specializationOptions: Array<{ id: string; name: string }> | undefined;

    if (scraped && isBiologicalSciencesMajor(program)) {
      const mapped = mapBiologyScrapedSections(scraped);
      sections = mapped.sections;
      specializationOptions = mapped.specializationOptions;
    } else {
      // Generic scraped path: combine available section sources.
      if (scraped?.builderSections) {
        sections.push(...scraped.builderSections.map(mapScrapedSection));
      }

      if (scraped?.requirementCourseBlocks) {
        for (const block of scraped.requirementCourseBlocks) {
          if (block.builderSections) {
            sections.push(...block.builderSections.map(mapScrapedSection));
          }
          if (!block.builderSections && block.courses) {
            const courseCodes = dedupeCodes(block.courses.map((c) => c.code ?? c.courseCode ?? ""));
            if (courseCodes.length > 0) {
              sections.push({
                id: createId(),
                title: `Course Block ${sections.length + 1}`,
                requirementType: "all",
                chooseCount: undefined,
                notes: [],
                special: false,
                courseCodes,
                optionGroups: [courseCodes],
                standaloneCodes: courseCodes,
                logicBlocks: [{ type: "AND", codes: courseCodes }],
              });
            }
          }
        }
      }
    }

    bundles.push({
      programId: program.programId,
      programName: program.programName,
      programCode: program.programCode,
      kind: resolveProgramKind(program),
      source: "scraped",
      specializations: scraped?.specializations ?? [],
      specializationOptions,
      sections: sections.length > 0 ? sections : [],
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
