import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ChevronDown, GripVertical, GraduationCap, Info, Mail, Menu, MessageSquare, Minus, Pencil, Plus, Printer, Save, X, ExternalLink } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { CourseRowDisplay } from "../components/CourseRowDisplay";
import { AddToScheduleDropdown } from "../components/AddToScheduleDropdown";
import { toast } from "sonner";
import { plannerApi } from "@/lib/api/planner";
import {
  addUserDegreeProgramFromCatalogOption,
  listProgramCatalogOptions,
  listUserDegreePrograms,
  loadCsSpecializationPreference,
  removeLocalCatalogProgramSelection,
  removeUserDegreeProgram,
  saveCsSpecializationPreference,
  type CatalogProgramOption,
  type UserDegreeProgram,
} from "@/lib/repositories/degreeProgramsRepository";
import { listUserPriorCredits } from "@/lib/repositories/priorCreditsRepository";
import { listUserRequirementSectionEdits, saveUserRequirementSectionEdit } from "@/lib/repositories/userRequirementSectionEditsRepository";
import { getAcademicProgressStatus } from "@/lib/scheduling/termProgress";
import { lookupCourseDetails, type CourseDetails } from "@/lib/requirements/courseDetailsLoader";
import requirementsCatalog from "@/lib/data/umd_program_requirements.json";
import { calculateTranscriptGPAHistory } from "@/lib/transcripts/gpa";
import {
  buildCourseContributionMap,
  evaluateRequirementSection,
  getContributionLabelsForCourseCode,
  getCsRequirementSectionsForSpecialization,
  loadProgramRequirementBundles,
  type AuditCourseStatus,
  type ProgramRequirementBundle,
} from "@/lib/requirements/audit";
import { resolvePriorCreditCourseCodes } from "@/lib/requirements/priorCreditLabels";
import { canonicalCourseCode, getEquivalentCourseCodes, normalizeCourseCode } from "@/lib/requirements/courseCodeEquivalency";
import "./degree-audit-v2.css";

interface AuditCourse {
  code: string;
  title: string;
  credits: number;
  genEds: string[];
  status: AuditCourseStatus;
}

interface EditableLogicBlock {
  id: string;
  type: "AND" | "OR";
  title?: string;
  codes: string[];
  children?: EditableLogicBlock[];
}

interface SectionDraft {
  id?: string;
  title: string;
  requirementType: "all" | "choose";
  chooseCount?: number;
  notesText: string;
  sectionCodes: string[];
  blocks: EditableLogicBlock[];
}

interface CourseSearchResult {
  id?: string;
  code: string;
  title: string;
}

type BlockDropPosition = "before" | "inside" | "after";
type BlockDropHint = { blockId: string; position: BlockDropPosition };
type CodeDropHint = { blockId: string; index: number };

type SectionEditSyncState = "idle" | "saving" | "synced" | "local";

const CUSTOM_AUDIT_SECTIONS_KEY = "orbitumd:audit-custom-sections:v1";
const WILDCARD_SELECTIONS_KEY = "orbitumd:audit-wildcard-selections:v1";
const REQUIREMENTS_CATALOG_VERSION_KEY = "orbitumd:requirements-catalog-version";
const REQUIREMENTS_CATALOG_RESET_KEY = "orbitumd:requirements-catalog-reset-pending";
const SPECIALIZATION_SELECTIONS_KEY = "orbitumd:specialization-selections:v1";
const DEGREE_DECLARATION_MODE_KEY = "orbitumd:degree-declaration-mode:v1";
const CURRENT_REQUIREMENTS_CATALOG_VERSION = String((requirementsCatalog as any)?.meta?.generatedAt ?? "unknown");

type DegreeDeclarationMode = "single" | "dual-major" | "double-degree";

const DEPTH_INDENT_CLASSES = [
  "ml-0",
  "ml-[12px]",
  "ml-[24px]",
  "ml-[36px]",
  "ml-[48px]",
  "ml-[60px]",
  "ml-[72px]",
  "ml-[84px]",
  "ml-[96px]",
  "ml-[108px]",
  "ml-[120px]",
] as const;

function getDepthIndentClass(depth: number): string {
  const safeDepth = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 0;
  return DEPTH_INDENT_CLASSES[Math.min(safeDepth, DEPTH_INDENT_CLASSES.length - 1)];
}

const WILDCARD_TOKEN_PATTERN = /^(?:[A-Z]{4}(?:[:/][A-Z]{4})*)?(?:XXX|[1-8]XX)$/;

function normalizeCatalogProgramName(value: string): string {
  return value
    .toLowerCase()
    .replace(/bachelor of science|bachelor of arts|double degree|second major|b\.\s*s\.?|b\.\s*a\.?|bs|ba/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function createLocalId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function draftFromSection(section: any): SectionDraft {
  const normalizeDraftBlock = (block: any, idx: number): EditableLogicBlock => ({
    id: createLocalId(`blk-${idx}`),
    type: block?.type === "OR" ? "OR" : "AND",
    title: typeof block?.title === "string" ? block.title : undefined,
    codes: [...new Set(((block?.codes ?? []) as string[]).map((code) => String(code).toUpperCase().trim()).filter(Boolean))],
    children: Array.isArray(block?.children)
      ? block.children.map((child: any, childIdx: number) => normalizeDraftBlock(child, childIdx))
      : undefined,
  });

  const sourceBlocks = section.logicBlocks?.length
    ? section.logicBlocks
    : section.optionGroups?.map((codes: string[]) => ({ type: "OR", codes })) ?? [];

  const blocks = sourceBlocks.map((block: any, idx: number) => normalizeDraftBlock(block, idx));
  const blockCodeSet = new Set<string>();
  const collectCodes = (items: EditableLogicBlock[]) => {
    for (const item of items) {
      for (const code of item.codes) blockCodeSet.add(String(code).toUpperCase());
      if (Array.isArray(item.children) && item.children.length > 0) collectCodes(item.children);
    }
  };
  collectCodes(blocks);

  const sectionCodes = Array.from(
    new Set([
      ...(section.standaloneCodes ?? []),
      ...(section.courseCodes ?? []),
    ].map((code: string) => String(code).toUpperCase()).filter((code: string) => code && !blockCodeSet.has(code))),
  );

  return {
    id: section.id,
    title: section.title ?? "",
    requirementType: section.requirementType ?? "all",
    chooseCount: section.chooseCount,
    notesText: (section.notes ?? []).join("\n"),
    sectionCodes,
    blocks,
  };
}

function sectionFromDraft(draft: SectionDraft, existingSectionId?: string) {
  const normalizeBlock = (block: EditableLogicBlock): { type: "AND" | "OR"; title?: string; codes: string[]; children?: any[] } => {
    const children = Array.isArray(block.children)
      ? block.children.map((child) => normalizeBlock(child))
      : [];

    return {
      type: block.type,
      title: block.title?.trim() || undefined,
      codes: [...new Set(block.codes.map((code) => code.toUpperCase().trim()).filter(Boolean))],
      children: children.length > 0 ? children : undefined,
    };
  };

  const normalizedBlocks = draft.blocks.map(normalizeBlock);

  const collectBlocks = (blocks: Array<{ type: "AND" | "OR"; codes: string[]; children?: any[] }>) => {
    const all: Array<{ type: "AND" | "OR"; codes: string[] }> = [];
    for (const block of blocks) {
      all.push({ type: block.type, codes: block.codes });
      if (Array.isArray(block.children) && block.children.length > 0) {
        all.push(...collectBlocks(block.children));
      }
    }
    return all;
  };

  const flattened = collectBlocks(normalizedBlocks);
  const optionGroups = flattened.filter((b) => b.type === "OR").map((b) => b.codes);
  const standaloneCodes = [...new Set([
    ...flattened.filter((b) => b.type === "AND").flatMap((b) => b.codes),
    ...(draft.sectionCodes ?? []).map((code) => String(code).toUpperCase()).filter(Boolean),
  ])];
  const courseCodes = [...new Set([...optionGroups.flat(), ...standaloneCodes])];
  const notes = draft.notesText.split("\n").map((line) => line.trim()).filter(Boolean);

  return {
    id: existingSectionId ?? draft.id ?? createLocalId("section"),
    title: draft.title.trim() || "Untitled Section",
    requirementType: draft.requirementType,
    chooseCount: draft.requirementType === "choose" ? Math.max(1, Number(draft.chooseCount ?? 1)) : undefined,
    notes,
    special: normalizedBlocks.some((b) => b.type === "OR") || draft.requirementType === "choose",
    courseCodes,
    optionGroups,
    standaloneCodes,
      logicBlocks: normalizedBlocks,
  };
}

function mutateSectionWithDraft(section: any, mutateDraft: (draft: SectionDraft) => void) {
  const draft = draftFromSection(section);
  mutateDraft(draft);
  const normalized = sectionFromDraft(draft, section.id);
  return {
    ...section,
    ...normalized,
    specializationId: section.specializationId,
  };
}

function mapDraftBlocksRecursively(
  blocks: EditableLogicBlock[],
  mapper: (block: EditableLogicBlock) => EditableLogicBlock,
): EditableLogicBlock[] {
  return blocks.map((block) => {
    const withChildren = Array.isArray(block.children)
      ? { ...block, children: mapDraftBlocksRecursively(block.children, mapper) }
      : block;
    return mapper(withChildren);
  });
}

function parseSelections(stored: unknown): Array<any> {
  const payload = (stored ?? []) as { selections?: any[] } | any[];
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.selections) ? payload.selections : [];
}

function rank(status: AuditCourseStatus): number {
  if (status === "completed") return 3;
  if (status === "in_progress") return 2;
  if (status === "planned") return 1;
  return 0;
}

function mergeStatus(a: AuditCourseStatus, b: AuditCourseStatus): AuditCourseStatus {
  return rank(a) >= rank(b) ? a : b;
}

function statusFromPair(left: AuditCourseStatus, right: AuditCourseStatus): AuditCourseStatus {
  const leftRank = rank(left);
  const rightRank = rank(right);
  if (leftRank === 0 || rightRank === 0) return "not_started";
  return leftRank <= rightRank ? left : right;
}

function statusBadge(status: AuditCourseStatus) {
  if (status === "completed") {
    return <Badge className="da2-status-badge done">Completed</Badge>;
  }
  if (status === "in_progress") {
    return <Badge className="da2-status-badge progress">In Progress</Badge>;
  }
  return <Badge className="da2-status-badge open">Planned</Badge>;
}

function sectionHeaderClass(sectionEval: { requiredSlots: number; completedSlots: number; inProgressSlots: number }): string {
  if (sectionEval.requiredSlots > 0 && sectionEval.completedSlots >= sectionEval.requiredSlots) {
    return "text-red-700 dark:text-red-400";
  }
  if (sectionEval.completedSlots > 0 || sectionEval.inProgressSlots > 0) {
    return "text-amber-700 dark:text-amber-300";
  }
  return "text-foreground";
}

interface WildcardRule {
  token: string;
  departments: string[];
  anyDept?: boolean;
  minLevel?: number;
  maxLevel?: number;
}

interface WildcardSlotOption {
  code: string;
  title: string;
  status: AuditCourseStatus;
}

interface WildcardSlotMeta {
  key: string;
  token: string;
  options: WildcardSlotOption[];
  selectedCode?: string;
  effectiveCode?: string;
}

function parseWildcardRule(raw: string): WildcardRule | null {
  const token = String(raw ?? "").toUpperCase().trim();

  // DEPT/DEPT/4XX (or DEPT:DEPT:4XX) — specific depts, level-band
  const levelRange = token.match(/^([A-Z]{4}(?:[:/][A-Z]{4})*)([1-8])XX$/);
  if (levelRange) {
    const levelBase = Number(levelRange[2]) * 100;
    return {
      token,
      departments: levelRange[1].split(/[:/]/).map((part) => part.toUpperCase()),
      minLevel: levelBase,
      maxLevel: levelBase + 99,
    };
  }

  // DEPT/DEPT/XXX (or DEPT:DEPT:XXX) — one or more specific depts, any level
  const anyLevel = token.match(/^([A-Z]{4}(?:[:/][A-Z]{4})*)XXX$/);
  if (anyLevel) {
    return {
      token,
      departments: anyLevel[1].split(/[:/]/).map((part) => part.toUpperCase()),
    };
  }

  // NXX alone — any dept, level-band (e.g. 3XX)
  const bareLevel = token.match(/^([1-8])XX$/);
  if (bareLevel) {
    const levelBase = Number(bareLevel[1]) * 100;
    return {
      token,
      departments: [],
      anyDept: true,
      minLevel: levelBase,
      maxLevel: levelBase + 99,
    };
  }

  // XXX alone — any dept, any level
  if (token === "XXX") {
    return {
      token,
      departments: [],
      anyDept: true,
    };
  }

  return null;
}

function parseCourseCode(raw: string): { department: string; level: number } | null {
  const normalized = String(raw ?? "").toUpperCase().trim();
  const match = normalized.match(/^([A-Z]{4})(\d{3})[A-Z]?$/);
  if (!match) return null;
  return {
    department: match[1],
    level: Number(match[2]),
  };
}

function courseMatchesWildcardRule(courseCode: string, rule: WildcardRule): boolean {
  const parsed = parseCourseCode(courseCode);
  if (!parsed) return false;
  if (!rule.anyDept && !rule.departments.includes(parsed.department)) return false;
  if (typeof rule.minLevel === "number" && parsed.level < rule.minLevel) return false;
  if (typeof rule.maxLevel === "number" && parsed.level > rule.maxLevel) return false;
  return true;
}

interface RequirementSectionCardProps {
  section: any; // RequirementSectionBundle
  sectionEval: any; // Section evaluation result
  wildcardSlots?: WildcardSlotMeta[];
  onSelectWildcardCourse?: (slotKey: string, courseCode: string) => void;
  allCourses: AuditCourse[]; // All available courses for lookup
  courseDetails: Map<string, CourseDetails>; // Course details from database
  byCourseCode: Map<string, AuditCourseStatus>; // Course code -> status map
  expandedSectionIds: Set<string>;
  setExpandedSectionIds: (prev: (s: Set<string>) => Set<string>) => void;
  expandedNotesSectionIds: Set<string>;
  setExpandedNotesSectionIds: (prev: (s: Set<string>) => Set<string>) => void;
  condensedView: boolean;
  onEdit?: (section: any) => void;
  onSaveSection?: (nextSection: any) => void;
}

/** Parse a prose string and render course-code mentions as clickable links. */
function LinkedCourseText({ text, onCourseClick }: { text: string; onCourseClick: (code: string) => void }) {
  const COURSE_RE = /([A-Z]{4}\d{3}[A-Z]?)/g;
  const parts: Array<{ type: "text" | "code"; value: string }> = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = COURSE_RE.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: "text", value: text.slice(last, match.index) });
    parts.push({ type: "code", value: match[1] });
    last = match.index + match[1].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return (
    <>
      {parts.map((part, i) =>
        part.type === "code" ? (
          <button
            key={i}
            type="button"
            className="font-medium text-red-500 hover:underline"
            onClick={() => onCourseClick(part.value)}
          >
            {part.value}
          </button>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </>
  );
}

function courseStatusBorderClass(status: AuditCourseStatus): string {
  if (status === "completed") return "border-green-500 bg-green-500/10 text-green-700 dark:text-green-300";
  if (status === "in_progress") return "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  if (status === "planned") return "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-border bg-input-background text-foreground/85";
}

type SectionRowType = "OR" | "AND" | "SINGLE";

function requiredSlotsFromLogicBlock(block: any): number {
  const codes = Array.isArray(block?.codes) ? block.codes.filter(Boolean) : [];
  const children = Array.isArray(block?.children) ? block.children : [];

  const childRequired = children.reduce((sum: number, child: any) => sum + requiredSlotsFromLogicBlock(child), 0);
  if (block?.type === "OR") {
    const alternatives: number[] = [];
    codes.forEach(() => alternatives.push(1));
    children.forEach((child: any) => alternatives.push(requiredSlotsFromLogicBlock(child)));
    if (alternatives.length === 0) return 0;
    return Math.min(...alternatives.filter((value) => value > 0));
  }
  return codes.length + childRequired;
}

function statusToCounts(status: AuditCourseStatus): { completed: number; inProgress: number; planned: number } {
  if (status === "completed") return { completed: 1, inProgress: 0, planned: 0 };
  if (status === "in_progress") return { completed: 0, inProgress: 1, planned: 0 };
  if (status === "planned") return { completed: 0, inProgress: 0, planned: 1 };
  return { completed: 0, inProgress: 0, planned: 0 };
}

function rankProgressAlternative(option: { required: number; completed: number; inProgress: number; planned: number }): number {
  return (option.completed * 1000) + (option.inProgress * 100) + (option.planned * 10) - option.required;
}

function evaluateLogicBlockCounts(
  block: any,
  byCourseCode: Map<string, AuditCourseStatus>,
): { required: number; completed: number; inProgress: number; planned: number } {
  const codes = (Array.isArray(block?.codes) ? block.codes : [])
    .map((code: string) => String(code).toUpperCase())
    .filter(Boolean);
  const children = Array.isArray(block?.children) ? block.children : [];

  if (block?.type === "OR") {
    const options = [
      ...codes.map((code: string) => {
        const status = byCourseCode.get(code) ?? "not_started";
        const counts = statusToCounts(status);
        return { required: 1, completed: counts.completed, inProgress: counts.inProgress, planned: counts.planned };
      }),
      ...children.map((child: any) => evaluateLogicBlockCounts(child, byCourseCode)),
    ].filter((option) => option.required > 0);

    if (options.length === 0) return { required: 0, completed: 0, inProgress: 0, planned: 0 };
    return options.sort((a, b) => rankProgressAlternative(b) - rankProgressAlternative(a))[0];
  }

  let required = 0;
  let completed = 0;
  let inProgress = 0;
  let planned = 0;

  for (const code of codes) {
    const status = byCourseCode.get(code) ?? "not_started";
    const counts = statusToCounts(status);
    required += 1;
    completed += counts.completed;
    inProgress += counts.inProgress;
    planned += counts.planned;
  }

  for (const child of children) {
    const childCounts = evaluateLogicBlockCounts(child, byCourseCode);
    required += childCounts.required;
    completed += childCounts.completed;
    inProgress += childCounts.inProgress;
    planned += childCounts.planned;
  }

  return { required, completed, inProgress, planned };
}

function collectCodesFromLogicBlocks(blocks: any[]): Set<string> {
  const codes = new Set<string>();
  const visit = (block: any) => {
    (Array.isArray(block?.codes) ? block.codes : []).forEach((code: string) => {
      const normalized = String(code).toUpperCase();
      if (normalized) codes.add(normalized);
    });
    (Array.isArray(block?.children) ? block.children : []).forEach((child: any) => visit(child));
  };
  blocks.forEach((block) => visit(block));
  return codes;
}

function collectWildcardTokensWithOccurrences(section: any): string[] {
  const tokens: string[] = [];

  const pushIfWildcard = (rawCode: string) => {
    const normalized = String(rawCode ?? "").toUpperCase().trim();
    if (!normalized) return;
    if (parseWildcardRule(normalized)) {
      tokens.push(normalized);
    }
  };

  if (Array.isArray(section.logicBlocks) && section.logicBlocks.length > 0) {
    const visit = (block: any) => {
      (Array.isArray(block?.codes) ? block.codes : []).forEach((code: string) => pushIfWildcard(code));
      (Array.isArray(block?.children) ? block.children : []).forEach((child: any) => visit(child));
    };
    section.logicBlocks.forEach((block: any) => visit(block));

    const logicCodes = collectCodesFromLogicBlocks(section.logicBlocks);
    (Array.isArray(section.standaloneCodes) ? section.standaloneCodes : [])
      .map((code: string) => String(code).toUpperCase())
      .filter((code: string) => code && !logicCodes.has(code))
      .forEach((code: string) => pushIfWildcard(code));

    (Array.isArray(section.courseCodes) ? section.courseCodes : [])
      .map((code: string) => String(code).toUpperCase())
      .filter((code: string) => code && !logicCodes.has(code))
      .forEach((code: string) => pushIfWildcard(code));

    return tokens;
  }

  (Array.isArray(section.optionGroups) ? section.optionGroups : []).forEach((group: string[]) => {
    (Array.isArray(group) ? group : []).forEach((code: string) => pushIfWildcard(code));
  });

  (Array.isArray(section.standaloneCodes) ? section.standaloneCodes : []).forEach((code: string) => pushIfWildcard(code));
  (Array.isArray(section.courseCodes) ? section.courseCodes : []).forEach((code: string) => pushIfWildcard(code));

  return tokens;
}

function mergeVisibleSectionsWithStoredCustom(
  visibleSections: any[],
  storedCustomSections: any[] | undefined,
  selectedSpecializationId?: string,
): any[] {
  if (!Array.isArray(storedCustomSections) || storedCustomSections.length === 0) {
    return visibleSections;
  }

  const customById = new Map(
    storedCustomSections
      .filter((section) => section?.id)
      .map((section) => [String(section.id), section]),
  );

  const mergedVisible = visibleSections.map((section) => customById.get(String(section.id)) ?? section);
  const visibleIds = new Set(visibleSections.map((section) => String(section.id)));

  const customExtras = storedCustomSections.filter((section) => {
    if (!section?.id) return false;
    const id = String(section.id);
    if (visibleIds.has(id)) return false;

    const specializationId = section.specializationId ? String(section.specializationId) : undefined;
    if (!specializationId) return true;
    return Boolean(selectedSpecializationId) && specializationId === selectedSpecializationId;
  });

  return [...mergedVisible, ...customExtras];
}

function mergeProgramCustomSections(existingSections: any[] | undefined, incomingSections: any[]): any[] {
  const existing = Array.isArray(existingSections) ? existingSections : [];
  const incoming = Array.isArray(incomingSections) ? incomingSections : [];

  const incomingIds = new Set(incoming.map((section) => String(section?.id ?? "")).filter(Boolean));
  const incomingSpecializations = new Set(
    incoming
      .map((section) => section?.specializationId ? String(section.specializationId) : "")
      .filter(Boolean),
  );
  const includesBaseSections = incoming.some((section) => !section?.specializationId);

  const kept = existing.filter((section) => {
    const sectionId = String(section?.id ?? "");
    if (sectionId && incomingIds.has(sectionId)) return false;

    const specializationId = section?.specializationId ? String(section.specializationId) : "";
    if (!specializationId) {
      return !includesBaseSections;
    }

    if (incomingSpecializations.has(specializationId)) {
      return false;
    }

    return true;
  });

  return [...kept, ...incoming];
}

function evaluateSectionCounts(
  section: any,
  byCourseCode: Map<string, AuditCourseStatus>,
): { requiredSlots: number; completedSlots: number; inProgressSlots: number; plannedSlots: number; status: AuditCourseStatus } {
  if (section.requirementType === "choose") {
    const baseEval = evaluateRequirementSection(section, byCourseCode);
    return {
      requiredSlots: baseEval.requiredSlots,
      completedSlots: baseEval.completedSlots,
      inProgressSlots: baseEval.inProgressSlots,
      plannedSlots: baseEval.plannedSlots,
      status: baseEval.status,
    };
  }

  const logicBlocks = Array.isArray(section.logicBlocks) ? section.logicBlocks : [];
  let required = 0;
  let completed = 0;
  let inProgress = 0;
  let planned = 0;

  if (logicBlocks.length > 0) {
    for (const block of logicBlocks) {
      const counts = evaluateLogicBlockCounts(block, byCourseCode);
      required += counts.required;
      completed += counts.completed;
      inProgress += counts.inProgress;
      planned += counts.planned;
    }
  } else {
    for (const group of section.optionGroups ?? []) {
      const normalizedGroup = (group ?? []).map((code: string) => String(code).toUpperCase()).filter(Boolean);
      if (normalizedGroup.length === 0) continue;
      const statuses = normalizedGroup.map((code: string) => byCourseCode.get(code) ?? "not_started");
      const bestStatus = statuses.sort((a, b) => rank(b) - rank(a))[0] ?? "not_started";
      const counts = statusToCounts(bestStatus);
      required += 1;
      completed += counts.completed;
      inProgress += counts.inProgress;
      planned += counts.planned;
    }
  }

  const logicCodes = collectCodesFromLogicBlocks(logicBlocks);
  const extraCodes = Array.from(new Set([
    ...(section.standaloneCodes ?? []),
    ...(section.courseCodes ?? []),
  ].map((code: string) => String(code).toUpperCase()).filter((code: string) => code && !logicCodes.has(code))));

  for (const code of extraCodes) {
    const counts = statusToCounts(byCourseCode.get(code) ?? "not_started");
    required += 1;
    completed += counts.completed;
    inProgress += counts.inProgress;
    planned += counts.planned;
  }

  let status: AuditCourseStatus = "not_started";
  if (required > 0 && completed >= required) status = "completed";
  else if (required > 0 && completed + inProgress >= required) status = "in_progress";
  else if (required > 0 && completed + inProgress + planned >= required) status = "planned";

  return {
    requiredSlots: required,
    completedSlots: completed,
    inProgressSlots: inProgress,
    plannedSlots: planned,
    status,
  };
}

function requiredSlotsForSection(section: any, baseRequiredSlots: number): number {
  if (section.requirementType === "choose") {
    return Math.max(1, Number(section.chooseCount ?? 1));
  }

  const logicBlocks = Array.isArray(section.logicBlocks) ? section.logicBlocks : [];
  if (logicBlocks.length > 0) {
    const structural = logicBlocks.reduce((sum: number, block: any) => sum + requiredSlotsFromLogicBlock(block), 0);
    return Math.max(baseRequiredSlots, structural);
  }

  const standalone = Array.isArray(section.standaloneCodes) ? section.standaloneCodes.length : 0;
  const optionGroups = Array.isArray(section.optionGroups) ? section.optionGroups.length : 0;
  const fallback = Array.isArray(section.courseCodes) ? section.courseCodes.length : 0;
  return Math.max(baseRequiredSlots, standalone + optionGroups, fallback);
}

function RequirementSectionTableCard({
  section,
  sectionEval,
  wildcardSlots = [],
  onSelectWildcardCourse,
  allCourses,
  courseDetails,
  byCourseCode,
  expandedSectionIds,
  setExpandedSectionIds,
  expandedNotesSectionIds,
  setExpandedNotesSectionIds,
  onEdit,
  onSaveSection,
}: RequirementSectionCardProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(section.title ?? "");
  const [editingRequirement, setEditingRequirement] = useState(false);
  const [requirementDraft, setRequirementDraft] = useState<"all" | "choose">(section.requirementType === "choose" ? "choose" : "all");
  const [chooseCountDraft, setChooseCountDraft] = useState<number>(Math.max(1, Number(section.chooseCount ?? 1)));
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState((section.notes ?? []).join("\n"));
  const [editingCode, setEditingCode] = useState<{ originalCode: string; query: string } | null>(null);
  const [codeSearchPending, setCodeSearchPending] = useState(false);
  const [codeSearchResults, setCodeSearchResults] = useState<CourseSearchResult[]>([]);
  const [openWildcardSlotKey, setOpenWildcardSlotKey] = useState<string | null>(null);
  // Add-course-directly state
  const [addingCourse, setAddingCourse] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addSearchPending, setAddSearchPending] = useState(false);
  const [addSearchResults, setAddSearchResults] = useState<CourseSearchResult[]>([]);
  // Course detail panel
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<CourseDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [addScheduleMessage, setAddScheduleMessage] = useState<string | null>(null);

  useEffect(() => {
    setTitleDraft(section.title ?? "");
    setRequirementDraft(section.requirementType === "choose" ? "choose" : "all");
    setChooseCountDraft(Math.max(1, Number(section.chooseCount ?? 1)));
    setNotesDraft((section.notes ?? []).join("\n"));
    setOpenWildcardSlotKey(null);
  }, [section]);

  useEffect(() => {
    if (!openWildcardSlotKey) return;

    const handleDocumentPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(`[data-wildcard-slot="${openWildcardSlotKey}"]`)) {
        return;
      }
      setOpenWildcardSlotKey(null);
    };

    document.addEventListener("mousedown", handleDocumentPointerDown);
    return () => document.removeEventListener("mousedown", handleDocumentPointerDown);
  }, [openWildcardSlotKey]);

  // Debounced search while editing a code
  useEffect(() => {
    if (!editingCode || !editingCode.query.trim()) {
      setCodeSearchResults([]);
      return;
    }
    let active = true;
    const timeout = window.setTimeout(() => {
      const run = async () => {
        setCodeSearchPending(true);
        try {
          const results = await plannerApi.searchCoursesAcrossRecentTerms(editingCode.query.trim());
          if (!active) return;
          const mapped = (results ?? [])
            .map((course) => ({ id: course.id, code: String(course.id ?? "").toUpperCase(), title: String(course.title ?? "Untitled") }))
            .filter((course) => course.code)
            .slice(0, 10);
          setCodeSearchResults(mapped);
        } catch {
          if (active) setCodeSearchResults([]);
        } finally {
          if (active) setCodeSearchPending(false);
        }
      };
      void run();
    }, 220);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [editingCode]);

  // Debounced search for add-course
  useEffect(() => {
    if (!addingCourse || !addQuery.trim()) {
      setAddSearchResults([]);
      return;
    }
    let active = true;
    const timeout = window.setTimeout(() => {
      const run = async () => {
        setAddSearchPending(true);
        try {
          const results = await plannerApi.searchCoursesAcrossRecentTerms(addQuery.trim());
          if (!active) return;
          const mapped = (results ?? [])
            .map((course) => ({ id: course.id, code: String(course.id ?? "").toUpperCase(), title: String(course.title ?? "Untitled") }))
            .filter((course) => course.code)
            .slice(0, 10);
          setAddSearchResults(mapped);
        } catch {
          if (active) setAddSearchResults([]);
        } finally {
          if (active) setAddSearchPending(false);
        }
      };
      void run();
    }, 220);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [addQuery, addingCourse]);

  // Load course detail when detailCode changes
  useEffect(() => {
    if (!detailCode) { setDetailData(null); return; }
    setAddScheduleMessage(null);
    // Check cached courseDetails first
    const cached = courseDetails.get(detailCode.toUpperCase());
    if (cached) { setDetailData(cached); return; }
    let active = true;
    setDetailLoading(true);
    setDetailData(null);
    const run = async () => {
      try {
        const { lookupCourseDetails: lookup } = await import("@/lib/requirements/courseDetailsLoader");
        const map = await lookup([detailCode.toUpperCase()]);
        if (active) setDetailData(map.get(detailCode.toUpperCase()) ?? null);
      } catch {
        if (active) setDetailData(null);
      } finally {
        if (active) setDetailLoading(false);
      }
    };
    void run();
    return () => { active = false; };
  }, [detailCode, courseDetails]);

  const sectionIsExpanded = expandedSectionIds.has(section.id);

  const wildcardMatchedCoursesByToken = useMemo(() => {
    const map = new Map<string, AuditCourse>();
    const allCoursesByCode = new Map(allCourses.map((course) => [course.code.toUpperCase(), course]));
    for (const slot of wildcardSlots) {
      const effectiveCode = String(slot.effectiveCode ?? "").toUpperCase();
      if (!effectiveCode) continue;
      const matched = allCoursesByCode.get(effectiveCode);
      if (!matched) continue;
      map.set(slot.token.toUpperCase(), {
        code: slot.token.toUpperCase(),
        title: `${matched.code} - ${matched.title}`,
        credits: matched.credits,
        genEds: matched.genEds,
        status: matched.status,
      });
    }
    return map;
  }, [allCourses, wildcardSlots]);

  const sectionCoursesByCode = useMemo(() => {
    const coursesByCode = new Map(allCourses.map((c) => [c.code.toUpperCase(), c]));
    const result = new Map<string, AuditCourse>();
    for (const code of section.courseCodes) {
      const baseCode = String(code).toUpperCase();
      const wildcardMatchedCourse = wildcardMatchedCoursesByToken.get(baseCode);
      if (wildcardMatchedCourse) { result.set(baseCode, wildcardMatchedCourse); continue; }
      const auditCourse = coursesByCode.get(baseCode);
      const details = courseDetails.get(baseCode);
      if (auditCourse && details) {
        result.set(baseCode, { ...auditCourse, title: details.title || auditCourse.title, credits: details.credits || auditCourse.credits, genEds: details.genEds || auditCourse.genEds });
      } else if (details) {
        const status = byCourseCode.get(baseCode) ?? "not_started";
        result.set(baseCode, { code: details.code, title: details.title, credits: details.credits, genEds: details.genEds, status });
      } else if (auditCourse) {
        result.set(baseCode, auditCourse);
      } else {
        const status = byCourseCode.get(baseCode) ?? "not_started";
        result.set(baseCode, { code: baseCode, title: baseCode, credits: 0, genEds: [], status });
      }
    }
    return result;
  }, [section, allCourses, courseDetails, byCourseCode, wildcardMatchedCoursesByToken]);

  const wildcardSlotsByToken = useMemo(() => {
    const map = new Map<string, WildcardSlotMeta[]>();
    for (const slot of wildcardSlots) {
      const token = String(slot.token ?? "").toUpperCase();
      if (!token) continue;
      const current = map.get(token) ?? [];
      current.push(slot);
      map.set(token, current);
    }
    return map;
  }, [wildcardSlots]);

  const classRows = useMemo(() => {
    const rows: Array<{ key: string; choices: string[][]; type: SectionRowType; depth: number; label?: string }> = [];
    const consumed = new Set<string>();

    const collectAndCodes = (block: any): string[] => {
      const ownCodes = (Array.isArray(block?.codes) ? block.codes : [])
        .map((code: string) => String(code).toUpperCase())
        .filter(Boolean);
      const childCodes = (Array.isArray(block?.children) ? block.children : []).flatMap((child: any) => {
        if (child?.type === "OR") {
          const childOptions = extractOptions(child);
          return childOptions.sort((a, b) => a.length - b.length)[0] ?? [];
        }
        return collectAndCodes(child);
      });
      return Array.from(new Set([...ownCodes, ...childCodes]));
    };

    const extractOptions = (block: any): string[][] => {
      if (!block) return [];
      if (block.type === "AND") {
        const andCodes = collectAndCodes(block);
        return andCodes.length > 0 ? [andCodes] : [];
      }

      const options: string[][] = [];
      const directCodes = (Array.isArray(block.codes) ? block.codes : [])
        .map((code: string) => String(code).toUpperCase())
        .filter(Boolean);
      directCodes.forEach((code: string) => options.push([code]));
      const children = Array.isArray(block.children) ? block.children : [];
      children.forEach((child: any) => {
        options.push(...extractOptions(child));
      });
      return options;
    };

    const pushFromBlock = (block: any, depth: number, path: string) => {
      const choices = extractOptions(block).map((choice) => Array.from(new Set(choice)));

      if (choices.length > 0) {
        choices.flat().forEach((code: string) => consumed.add(code));
        rows.push({
          key: `${path}-choices-${choices.map((choice) => choice.join("+")).join("|")}`,
          choices,
          type: block?.type === "OR" ? "OR" : "AND",
          depth,
          label: typeof block?.title === "string" && block.title.trim().length > 0 ? block.title.trim() : undefined,
        });
      }
    };

    if (Array.isArray(section.logicBlocks) && section.logicBlocks.length > 0) {
      section.logicBlocks.forEach((block: any, index: number) => {
        pushFromBlock(block, 0, `logic-${index}`);
      });
    } else {
      const optionGroups = Array.isArray(section.optionGroups) ? section.optionGroups : [];
      for (const group of optionGroups) {
        const cleaned = (group ?? []).map((code: string) => String(code).toUpperCase()).filter(Boolean);
        if (cleaned.length === 0) continue;
        cleaned.forEach((code: string) => consumed.add(code));
        rows.push({ key: `or-${cleaned.join("-")}`, choices: [cleaned], type: "OR", depth: 0 });
      }
    }

    const standaloneCodes = Array.isArray(section.standaloneCodes)
      ? section.standaloneCodes.map((code: string) => String(code).toUpperCase()).filter(Boolean)
      : [];

    for (const code of standaloneCodes) {
      if (consumed.has(code)) continue;
      consumed.add(code);
      rows.push({ key: `standalone-${code}`, choices: [[code]], type: "SINGLE", depth: 0 });
    }

    for (const rawCode of section.courseCodes ?? []) {
      const code = String(rawCode).toUpperCase();
      if (!code || consumed.has(code)) continue;
      rows.push({ key: `fallback-${code}`, choices: [[code]], type: "SINGLE", depth: 0 });
    }

    return rows;
  }, [section]);

  const wildcardSlotByRenderKey = useMemo(() => {
    const map = new Map<string, WildcardSlotMeta>();
    const tokenUsageCount = new Map<string, number>();

    const assignSlot = (tokenRaw: string, rowKey: string, codeIndex: number) => {
      const token = String(tokenRaw ?? "").toUpperCase();
      const slots = wildcardSlotsByToken.get(token) ?? [];
      if (slots.length === 0) return;

      const used = tokenUsageCount.get(token) ?? 0;
      const slot = slots[Math.min(used, slots.length - 1)];
      tokenUsageCount.set(token, used + 1);
      map.set(`${rowKey}-${token}-${codeIndex}`, slot);
    };

    for (const row of classRows) {
      if (row.type === "OR") {
        row.choices.forEach((choice, choiceIndex) => {
          const rowKey = `${row.key}-choice-${choiceIndex}`;
          choice.forEach((token, codeIndex) => assignSlot(token, rowKey, codeIndex));
        });
      } else {
        const primaryChoice = row.choices[0] ?? [];
        primaryChoice.forEach((token, codeIndex) => assignSlot(token, row.key, codeIndex));
      }
    }

    return map;
  }, [classRows, wildcardSlotsByToken]);

  const saveTitle = () => {
    const nextTitle = titleDraft.trim() || "Untitled Section";
    onSaveSection?.({ ...section, title: nextTitle });
    setEditingTitle(false);
  };

  const saveRequirement = () => {
    onSaveSection?.({ ...section, requirementType: requirementDraft, chooseCount: requirementDraft === "choose" ? Math.max(1, Number(chooseCountDraft || 1)) : undefined });
    setEditingRequirement(false);
  };

  const saveNotes = () => {
    onSaveSection?.({ ...section, notes: notesDraft.split("\n").map((line) => line.trim()).filter(Boolean) });
    setEditingNotes(false);
  };

  const saveCodeReplacement = (oldCode: string, newCodeRaw: string) => {
    const nextCode = String(newCodeRaw).toUpperCase().trim();
    if (!nextCode || nextCode === oldCode) { setEditingCode(null); return; }
    const nextSection = mutateSectionWithDraft(section, (draft) => {
      draft.blocks = mapDraftBlocksRecursively(draft.blocks, (block) => ({
        ...block,
        codes: block.codes.map((code) => (String(code).toUpperCase() === oldCode ? nextCode : String(code).toUpperCase())),
      }));
    });
    onSaveSection?.({
      ...nextSection,
      courseCodes: (nextSection.courseCodes ?? []).map((code: string) =>
        String(code).toUpperCase() === oldCode ? nextCode : String(code).toUpperCase(),
      ),
      standaloneCodes: (nextSection.standaloneCodes ?? []).map((code: string) =>
        String(code).toUpperCase() === oldCode ? nextCode : String(code).toUpperCase(),
      ),
    });
    setEditingCode(null);
    setCodeSearchResults([]);
  };

  const addCourseDirectly = (courseCode: string) => {
    const normalized = courseCode.toUpperCase().trim();
    if (!normalized) return;
    const existing: string[] = Array.from(
      new Set([...(section.courseCodes ?? []), ...(section.standaloneCodes ?? [])])
    ).map((c: string) => String(c).toUpperCase());
    if (existing.includes(normalized)) { setAddingCourse(false); setAddQuery(""); return; }
    const nextSection = {
      ...section,
      courseCodes: Array.from(new Set([...(section.courseCodes ?? []), normalized])),
      standaloneCodes: Array.from(new Set([...(section.standaloneCodes ?? []), normalized])),
    };
    onSaveSection?.(nextSection);
    setAddingCourse(false);
    setAddQuery("");
    setAddSearchResults([]);
  };

  const renderCourseButton = (token: string, rowKey: string, codeIndex: number, isLastInOr: boolean, rowType: SectionRowType) => {
    const renderKey = `${rowKey}-${token}-${codeIndex}`;
    const isEditing = editingCode?.originalCode === token;
    const wildcardSlot = wildcardSlotByRenderKey.get(renderKey);
    const wildcardMatchedCourse = wildcardSlot?.effectiveCode
      ? allCourses.find((course) => course.code.toUpperCase() === String(wildcardSlot.effectiveCode).toUpperCase())
      : undefined;
    const course = wildcardMatchedCourse ?? sectionCoursesByCode.get(token);
    const status: AuditCourseStatus = wildcardMatchedCourse?.status ?? course?.status ?? byCourseCode.get(token) ?? "not_started";
    const displayText = wildcardMatchedCourse
      ? `${token} · ${wildcardMatchedCourse.code} - ${wildcardMatchedCourse.title}`
      : course
        ? `${course.code} · ${course.title}`
        : token;
    const borderClass = courseStatusBorderClass(status);

    return (
      <div key={renderKey} className="flex items-center gap-2">
        {isEditing ? (
          <div className="rounded-md border border-border bg-input-background p-2 w-[360px] max-w-full z-10">
            <Input
              value={editingCode.query}
              onChange={(event) => setEditingCode({ ...editingCode, query: event.target.value })}
              placeholder="Search class code/title"
              className="h-8 mb-2"
              autoFocus
            />
            {codeSearchPending ? (
              <p className="text-[11px] text-muted-foreground">Searching…</p>
            ) : (
              <div className="max-h-28 overflow-y-auto space-y-1">
                {codeSearchResults.map((result) => (
                  <button
                    key={`${token}-${result.code}`}
                    type="button"
                    className="w-full rounded border border-border px-2 py-1 text-left text-xs hover:bg-accent"
                    onClick={() => saveCodeReplacement(token, result.code)}
                  >
                    <span className="font-medium text-foreground">{result.code}</span>
                    <span className="text-muted-foreground"> · {result.title}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setEditingCode(null)}>Cancel</Button>
              <Button type="button" size="sm" onClick={() => saveCodeReplacement(token, editingCode.query)}>Apply</Button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              className={`degree-audit-chip-button rounded border px-2 py-1 text-xs transition-colors hover:brightness-110 ${borderClass}`}
              onClick={() => setDetailCode(token)}
              onDoubleClick={(e) => { e.stopPropagation(); setEditingCode({ originalCode: token, query: token }); }}
              title="Click for details · Double-click to edit"
            >
              {displayText}
            </button>
            <span className="degree-audit-chip-print hidden text-[11px] leading-snug">{displayText}</span>
            {wildcardSlot && onSelectWildcardCourse && (
              <div className="relative" data-wildcard-slot={wildcardSlot.key}>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-6 w-6 border-border"
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenWildcardSlotKey((current) => {
                      return current === wildcardSlot.key ? null : wildcardSlot.key;
                    });
                  }}
                  title={`Select course for ${wildcardSlot.token}`}
                  aria-label={`Select course for ${wildcardSlot.token}`}
                >
                  {openWildcardSlotKey === wildcardSlot.key ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                </Button>
                {openWildcardSlotKey === wildcardSlot.key && (
                  <div className="absolute right-0 top-8 z-[120] w-80 rounded-md border border-border bg-card p-2 shadow-lg">
                    <p className="mb-1 text-[11px] text-muted-foreground">{wildcardSlot.token} wildcard</p>
                    <select
                      className="h-8 w-full rounded-md border border-input bg-input-background px-2 text-xs text-foreground"
                      value={wildcardSlot.selectedCode ?? ""}
                      onChange={(event) => {
                        onSelectWildcardCourse(wildcardSlot.key, event.target.value);
                        setOpenWildcardSlotKey(null);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Select course for ${wildcardSlot.token}`}
                      title={`Select course for ${wildcardSlot.token}`}
                    >
                      <option value="">Auto-select best match</option>
                      {wildcardSlot.options.map((option) => (
                        <option key={`${wildcardSlot.key}-${option.code}`} value={option.code}>
                          {option.code} - {option.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {rowType === "OR" && !isLastInOr && (
          <span className="text-[10px] font-medium tracking-wide text-amber-700 dark:text-amber-300">OR</span>
        )}
      </div>
    );
  };

  const sectionRequirementLabel = section.requirementType === "choose"
    ? `Choose ${section.chooseCount ?? 1}`
    : "All Required";
  const sectionFulfilledCount = Math.min(
    sectionEval.requiredSlots,
    sectionEval.completedSlots + sectionEval.inProgressSlots,
  );
  const sectionStatusVisual = sectionEval.status === "completed"
    ? "done"
    : sectionEval.status === "not_started"
      ? "empty"
      : "partial";

  const sectionCourseRows = useMemo(() => {
    type SectionCourseRow = {
      key: string;
      reqType: string;
      status: AuditCourseStatus;
      displayCode: string;
      displayTitle: string;
      detailCode: string;
      editableToken: string;
      wildcardSlot?: WildcardSlotMeta;
    };

    const rows: SectionCourseRow[] = [];

    const pushToken = (tokenRaw: string, rowKey: string, codeIndex: number, reqType: string) => {
      const token = String(tokenRaw).toUpperCase();
      const renderKey = `${rowKey}-${token}-${codeIndex}`;
      const wildcardSlot = wildcardSlotByRenderKey.get(renderKey);
      const wildcardMatchedCourse = wildcardSlot?.effectiveCode
        ? allCourses.find((course) => course.code.toUpperCase() === String(wildcardSlot.effectiveCode).toUpperCase())
        : undefined;
      const course = wildcardMatchedCourse ?? sectionCoursesByCode.get(token);
      const status: AuditCourseStatus = wildcardMatchedCourse?.status ?? course?.status ?? byCourseCode.get(token) ?? "not_started";
      const displayCode = wildcardMatchedCourse?.code ?? course?.code ?? token;
      const displayTitle = wildcardMatchedCourse?.title ?? course?.title ?? token;

      rows.push({
        key: renderKey,
        reqType,
        status,
        displayCode,
        displayTitle,
        detailCode: displayCode,
        editableToken: token,
        wildcardSlot,
      });
    };

    classRows.forEach((row) => {
      if (row.type === "OR") {
        row.choices.forEach((choice, choiceIndex) => {
          const rowKey = `${row.key}-choice-${choiceIndex}`;
          const reqType = `Option ${String.fromCharCode(65 + choiceIndex)}`;
          choice.forEach((token, codeIndex) => pushToken(token, rowKey, codeIndex, reqType));
        });
      } else {
        const reqType = row.type === "SINGLE" ? "Required" : "Required";
        (row.choices[0] ?? []).forEach((token, codeIndex) => pushToken(token, row.key, codeIndex, reqType));
      }
    });

    return rows;
  }, [allCourses, byCourseCode, classRows, sectionCoursesByCode, wildcardSlotByRenderKey]);

  const toggleSectionExpanded = () => {
    setExpandedSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(section.id)) next.delete(section.id);
      else next.add(section.id);
      return next;
    });
  };

  return (
    <>
      <Card className="da2-req-block bg-input-background border-border p-0 overflow-hidden">
        <div className="da2-rb-header">
          <div className="da2-rb-title-wrap" onDoubleClick={() => setEditingTitle(true)}>
            {editingTitle ? (
              <Input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveTitle();
                  }
                }}
                autoFocus
                className="h-8"
              />
            ) : (
              <>
                <p className="da2-rb-name">{section.title}</p>
                <div className="da2-rb-meta-row" onDoubleClick={() => setEditingRequirement(true)}>
                  {editingRequirement ? (
                    <div className="flex items-center gap-2">
                      <select
                        className="h-8 rounded-md border border-input bg-input-background px-2 text-xs"
                        value={requirementDraft}
                        onChange={(e) => setRequirementDraft(e.target.value === "choose" ? "choose" : "all")}
                        aria-label="Section requirement type"
                        title="Section requirement type"
                      >
                        <option value="all">All Required</option>
                        <option value="choose">Choose N</option>
                      </select>
                      {requirementDraft === "choose" && (
                        <Input
                          type="number"
                          min={1}
                          value={chooseCountDraft}
                          onChange={(e) => setChooseCountDraft(Math.max(1, Number(e.target.value) || 1))}
                          className="h-8 w-20"
                        />
                      )}
                      <Button type="button" size="sm" variant="outline" onClick={saveRequirement}>Save</Button>
                    </div>
                  ) : (
                    <p className="da2-rb-meta">{sectionRequirementLabel}</p>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="da2-rb-head-controls">
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" className="da2-rb-act" onClick={() => onEdit?.(section)}>
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="da2-rb-act"
                onClick={() => setExpandedNotesSectionIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(section.id)) next.delete(section.id);
                  else next.add(section.id);
                  return next;
                })}
              >
                {expandedNotesSectionIds.has(section.id) ? "Hide Info" : "Info"}
              </Button>
            </div>

            <div className="da2-rb-progress">
              <span className="da2-rb-prog-text"><strong>{sectionFulfilledCount}</strong> / {sectionEval.requiredSlots}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="da2-rb-toggle"
                onClick={toggleSectionExpanded}
                aria-label={sectionIsExpanded ? "Collapse section" : "Expand section"}
              >
                <div className={`da2-rb-status ${sectionStatusVisual}`}>
                  {sectionStatusVisual === "done" ? "\u2713" : sectionStatusVisual === "partial" ? "\u2212" : "\u25CB"}
                </div>
              </Button>
            </div>
          </div>
        </div>

        {sectionIsExpanded && (
          <div className="da2-rb-courses">
            {sectionCourseRows.map((row) => {
              const statusClass = row.status === "completed"
                ? "done"
                : row.status === "not_started"
                  ? "open"
                  : "progress";
              const statusLabel = row.status === "completed"
                ? "Completed"
                : row.status === "in_progress"
                  ? "In Progress"
                  : row.status === "planned"
                    ? "Planned"
                    : "Needed";

              return (
                <div key={row.key} className="da2-rb-course-row">
                  <div className={`da2-rb-course-check ${statusClass}`}>{statusClass === "done" ? "\u2713" : statusClass === "progress" ? "\u2212" : "\u25CB"}</div>
                  <div className="da2-rb-req-type">{row.reqType}</div>
                  <div className="da2-rb-course-code">{row.displayCode}</div>
                  <div className="da2-rb-course-name">{row.displayTitle}</div>
                  <div className={`da2-rb-course-status ${statusClass}`}>{statusLabel}</div>
                  <div className="da2-rb-course-actions">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="da2-rb-act"
                      onClick={() => setEditingCode({ originalCode: row.editableToken, query: row.displayCode })}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="da2-rb-act"
                      onClick={() => setDetailCode(row.detailCode)}
                    >
                      Info
                    </Button>
                    {row.wildcardSlot && onSelectWildcardCourse && (
                      <div className="relative" data-wildcard-slot={row.wildcardSlot.key}>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-6 w-6 border-border"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenWildcardSlotKey((current) => (current === row.wildcardSlot?.key ? null : row.wildcardSlot?.key ?? null));
                          }}
                          title={`Select course for ${row.wildcardSlot.token}`}
                          aria-label={`Select course for ${row.wildcardSlot.token}`}
                        >
                          {openWildcardSlotKey === row.wildcardSlot.key ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                        </Button>
                        {openWildcardSlotKey === row.wildcardSlot.key && (
                          <div className="absolute right-0 top-8 z-[120] w-80 rounded-md border border-border bg-card p-2 shadow-lg">
                            <p className="mb-1 text-[11px] text-muted-foreground">{row.wildcardSlot.token} wildcard</p>
                            <select
                              className="h-8 w-full rounded-md border border-input bg-input-background px-2 text-xs text-foreground"
                              value={row.wildcardSlot.selectedCode ?? ""}
                              onChange={(event) => {
                                onSelectWildcardCourse(row.wildcardSlot!.key, event.target.value);
                                setOpenWildcardSlotKey(null);
                              }}
                              onClick={(event) => event.stopPropagation()}
                              aria-label={`Select course for ${row.wildcardSlot.token}`}
                              title={`Select course for ${row.wildcardSlot.token}`}
                            >
                              <option value="">Auto-select best match</option>
                              {row.wildcardSlot.options.map((option) => (
                                <option key={`${row.wildcardSlot?.key}-${option.code}`} value={option.code}>
                                  {option.code} - {option.title}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {addingCourse ? (
              <div className="da2-rb-add-wrap">
                <div className="flex gap-2">
                  <Input
                    value={addQuery}
                    onChange={(e) => setAddQuery(e.target.value)}
                    placeholder="Search code or title (e.g. CMSC330 or algorithms)"
                    className="h-8 text-xs"
                    autoFocus
                  />
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setAddingCourse(false); setAddQuery(""); }}>
                    Cancel
                  </Button>
                </div>
                {addSearchPending && <p className="text-xs text-muted-foreground">Searching…</p>}
                {addSearchResults.length > 0 && (
                  <div className="max-h-32 overflow-y-auto border border-border rounded-md divide-y divide-border">
                    {addSearchResults.map((result) => (
                      <button
                        key={result.code}
                        type="button"
                        className="w-full px-3 py-1.5 text-left text-xs hover:bg-accent flex items-center justify-between gap-2"
                        onClick={() => addCourseDirectly(result.code)}
                      >
                        <span><span className="font-medium text-foreground">{result.code}</span><span className="text-muted-foreground"> · {result.title}</span></span>
                        <Plus className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
                {addQuery.trim() && !addSearchPending && addSearchResults.length === 0 && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground text-left"
                    onClick={() => addCourseDirectly(addQuery.trim())}
                  >
                    Press Enter or click to add "{addQuery.trim().toUpperCase()}" directly
                  </button>
                )}
              </div>
            ) : (
              <button type="button" className="da2-rb-add-row" onClick={() => setAddingCourse(true)}>
                <Plus className="h-3.5 w-3.5" /> Add course to section
              </button>
            )}

            {editingCode && (
              <div className="da2-rb-editing">
                <Input
                  value={editingCode.query}
                  onChange={(event) => setEditingCode({ ...editingCode, query: event.target.value })}
                  placeholder="Search class code/title"
                  className="h-8 mb-2"
                  autoFocus
                />
                {codeSearchPending ? (
                  <p className="text-[11px] text-muted-foreground">Searching…</p>
                ) : (
                  <div className="max-h-28 overflow-y-auto space-y-1">
                    {codeSearchResults.map((result) => (
                      <button
                        key={`${editingCode.originalCode}-${result.code}`}
                        type="button"
                        className="w-full rounded border border-border px-2 py-1 text-left text-xs hover:bg-accent"
                        onClick={() => saveCodeReplacement(editingCode.originalCode, result.code)}
                      >
                        <span className="font-medium text-foreground">{result.code}</span>
                        <span className="text-muted-foreground"> · {result.title}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex justify-end gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditingCode(null)}>Cancel</Button>
                  <Button type="button" size="sm" onClick={() => saveCodeReplacement(editingCode.originalCode, editingCode.query)}>Apply</Button>
                </div>
              </div>
            )}

            {expandedNotesSectionIds.has(section.id) && (
              <div className="da2-rb-notes" onDoubleClick={() => setEditingNotes(true)}>
                <p className="da2-rb-notes-title">Notes</p>
                {editingNotes ? (
                  <div className="space-y-2">
                    <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} className="min-h-[96px]" />
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditingNotes(false)}>Cancel</Button>
                      <Button type="button" size="sm" onClick={saveNotes}>Save Notes</Button>
                    </div>
                  </div>
                ) : section.notes.length > 0 ? (
                  <ul className="space-y-1">
                    {section.notes.map((note: string, idx: number) => (
                      <li key={`${section.id}-note-${idx}`} className="text-xs text-foreground/80">• {note}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No notes. Double-click to add notes.</p>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {detailCode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetailCode(null)}>
          <Card className="max-w-xl w-full p-5 bg-card border-border max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-xl text-foreground">{detailCode}</h3>
                {detailData && <p className="text-muted-foreground text-sm mt-0.5">{detailData.title}</p>}
              </div>
              <div className="flex items-center gap-2">
                <AddToScheduleDropdown
                  courseCode={detailCode}
                  courseTitle={detailData?.title ?? detailCode}
                  credits={Number(detailData?.credits ?? 0) || 0}
                  genEds={detailData?.genEds ?? []}
                  onMessage={setAddScheduleMessage}
                />
                <a href={`https://app.testudo.umd.edu/soc/search?courseId=${detailCode}&sectionId=&termId=&_openSectionsOnly=on&credits=ANY&courseLevelFilter=ALL&instructor=&_facetoface=on&_blended=on&_online=on&courseStartHour=0700&courseStartMin=00&courseStartAM=AM&courseEndHour=1200&courseEndMin=00&courseEndAM=AM&teachingCenter=ALL`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label={`Open ${detailCode} in Testudo`} title={`Open ${detailCode} in Testudo`}><ExternalLink className="h-4 w-4" /></a>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDetailCode(null)}><X className="h-4 w-4" /></Button>
              </div>
            </div>

            {addScheduleMessage && <p className="mb-3 text-xs text-muted-foreground">{addScheduleMessage}</p>}

            {detailLoading && <p className="text-muted-foreground text-sm">Loading…</p>}

            {detailData && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline" className="border-border">{detailData.credits} credits</Badge>
                  {(() => {
                    const status = byCourseCode.get(detailCode.toUpperCase()) ?? "not_started";
                    return statusBadge(status);
                  })()}
                  {detailData.genEds.map((g) => (
                    <Badge key={g} variant="outline" className="border-border">{g}</Badge>
                  ))}
                </div>

                {detailData.description && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                    <p className="text-sm text-foreground/90 leading-relaxed">
                      <LinkedCourseText text={detailData.description} onCourseClick={setDetailCode} />
                    </p>
                  </div>
                )}

                {detailData.prereqs && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Prerequisites</p>
                    <p className="text-sm text-foreground/90 leading-relaxed">
                      <LinkedCourseText text={detailData.prereqs} onCourseClick={setDetailCode} />
                    </p>
                  </div>
                )}
              </div>
            )}

            {!detailLoading && !detailData && (
              <p className="text-sm text-muted-foreground">No details available for {detailCode} in the current term catalog.</p>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function RequirementSectionCard({
  section,
  sectionEval,
  wildcardSlots = [],
  onSelectWildcardCourse,
  allCourses,
  courseDetails,
  byCourseCode,
  expandedSectionIds,
  setExpandedSectionIds,
  expandedNotesSectionIds,
  setExpandedNotesSectionIds,
  condensedView,
  onEdit,
}: RequirementSectionCardProps) {
  const wildcardMatchedCoursesByToken = useMemo(() => {
    const map = new Map<string, AuditCourse>();
    const allCoursesByCode = new Map(allCourses.map((course) => [course.code.toUpperCase(), course]));

    for (const slot of wildcardSlots) {
      const effectiveCode = String(slot.effectiveCode ?? "").toUpperCase();
      if (!effectiveCode) continue;
      const matched = allCoursesByCode.get(effectiveCode);
      if (!matched) continue;

      map.set(slot.token.toUpperCase(), {
        code: slot.token.toUpperCase(),
        title: `${matched.code} - ${matched.title}`,
        credits: matched.credits,
        genEds: matched.genEds,
        status: matched.status,
      });
    }

    return map;
  }, [allCourses, wildcardSlots]);

  // Get courses for this section, enriched with database details
  const sectionCourses = useMemo(() => {
    const coursesByCode = new Map(allCourses.map((c) => [c.code.toUpperCase(), c]));
    const courses: AuditCourse[] = [];

    // Add courses from the section's course list
    for (const code of section.courseCodes) {
      const baseCode = code.toUpperCase();
      const wildcardMatchedCourse = wildcardMatchedCoursesByToken.get(baseCode);
      if (wildcardMatchedCourse) {
        courses.push(wildcardMatchedCourse);
        continue;
      }

      const auditCourse = coursesByCode.get(baseCode);
      const details = courseDetails.get(baseCode);

      if (auditCourse && details) {
        // Merge audit course with database details
        courses.push({
          ...auditCourse,
          title: details.title || auditCourse.title,
          credits: details.credits || auditCourse.credits,
          genEds: details.genEds || auditCourse.genEds,
        });
      } else if (details) {
        // Use database details only
        const status = byCourseCode.get(baseCode) ?? "not_started";
        courses.push({
          code: details.code,
          title: details.title,
          credits: details.credits,
          genEds: details.genEds,
          status,
        });
      } else if (auditCourse) {
        // Use audit course
        courses.push(auditCourse);
      } else {
        // Placeholder course
        const status = byCourseCode.get(baseCode) ?? "not_started";
        courses.push({
          code: baseCode,
          title: `${baseCode}`,
          credits: 0,
          genEds: [],
          status,
        });
      }
    }

    return courses;
  }, [section, allCourses, courseDetails, byCourseCode, wildcardMatchedCoursesByToken]);

  const coursesByCode = useMemo(() => {
    return new Map(sectionCourses.map((course) => [course.code.toUpperCase(), course]));
  }, [sectionCourses]);

  const renderLogicBlock = (block: any, depth: number = 0) => {
    const blockCodes = Array.isArray(block?.codes) ? block.codes : [];
    const blockCourses = blockCodes.map((code: string) => {
      const normalized = String(code ?? "").toUpperCase();
      const wildcardMatchedCourse = wildcardMatchedCoursesByToken.get(normalized);
      if (wildcardMatchedCourse) {
        return wildcardMatchedCourse;
      }

      const existing = coursesByCode.get(normalized);
      if (existing) return existing;
      return {
        code: normalized,
        title: normalized,
        credits: 0,
        genEds: [],
        status: byCourseCode.get(normalized) ?? "not_started",
      } as AuditCourse;
    });

    return (
      <div
        key={`${section.id}-${depth}-${String(block?.title ?? "")}-${blockCodes.join("|")}`}
        className={`rounded-md border p-2 ${
          block?.type === "OR"
            ? "border-amber-300 bg-amber-50 dark:border-amber-600/40 dark:bg-amber-600/10"
            : "border-sky-300 bg-sky-50 dark:border-sky-600/40 dark:bg-sky-600/10"
        } ${getDepthIndentClass(depth)}`}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <Badge variant="outline" className="text-xs border-border">
            {block?.type === "OR" ? "OR" : "All Required"}
          </Badge>
          {block?.title ? <span className="text-xs text-foreground/80">{block.title}</span> : null}
        </div>

        {blockCourses.length > 0 && block?.type === "OR" && condensedView ? (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {blockCourses.map((course, index) => (
              <div key={`${section.id}-${depth}-${course.code}`} className="flex items-center gap-2">
                <Badge variant="outline" className="border-border text-xs text-foreground/80">
                  {course.code}
                </Badge>
                {index < blockCourses.length - 1 && (
                  <span className="text-[10px] font-medium tracking-wide text-amber-700 dark:text-amber-300">OR</span>
                )}
              </div>
            ))}
          </div>
        ) : blockCourses.length > 0 ? (
          <div className="border border-border/30 rounded-md overflow-hidden mb-2">
            {blockCourses.map((course, index) => (
              <div key={`${section.id}-${depth}-${course.code}`}>
                <CourseRowDisplay
                  courseCode={course.code}
                  courseTitle={course.title}
                  credits={course.credits}
                  genEds={course.genEds}
                  status={course.status}
                />
                {block?.type === "OR" && index < blockCourses.length - 1 && !condensedView && (
                  <div className="border-b border-border/30 bg-amber-100/40 py-1 text-center text-[10px] font-medium tracking-wide text-amber-800 dark:bg-amber-700/10 dark:text-amber-300">
                    OR
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {Array.isArray(block?.children) && block.children.length > 0 && (
          <div className="space-y-2">
            {block.children.map((child: any, idx: number) => (
              <div key={`${section.id}-${depth}-child-${idx}`}>{renderLogicBlock(child, depth + 1)}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="bg-input-background border-border p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className={sectionHeaderClass(sectionEval)}>{section.title}</h3>
          {section.special && (
            <Badge className="bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-600/20 dark:text-purple-300 dark:border-purple-600/30">Specialization/Choose</Badge>
          )}
          {section.requirementType === "choose" && (
            <Badge className="bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-600/20 dark:text-amber-300 dark:border-amber-600/30">Choose {section.chooseCount ?? 1}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onEdit && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-border text-foreground/80"
              onClick={() => onEdit(section)}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          )}
          {statusBadge(sectionEval.status)}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => {
              setExpandedSectionIds((prev) => {
                const next = new Set(prev);
                if (next.has(section.id)) next.delete(section.id);
                else next.add(section.id);
                return next;
              });
            }}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${expandedSectionIds.has(section.id) ? "rotate-180" : ""}`} />
          </Button>
        </div>
      </div>

      {wildcardSlots.length > 0 && (
        <div className="mb-3 rounded-md border border-border/40 bg-input-background p-3">
          <p className="text-xs text-muted-foreground mb-2">Wildcard requirement slots</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {wildcardSlots.map((slot) => (
              <label key={slot.key} className="text-xs text-muted-foreground flex flex-col gap-1">
                <span>{slot.token}</span>
                <select
                  className="h-8 rounded-md border border-input bg-input-background px-2 text-xs text-foreground"
                  value={slot.selectedCode ?? ""}
                  onChange={(event) => onSelectWildcardCourse?.(slot.key, event.target.value)}
                  aria-label={`Select course for wildcard slot ${slot.token}`}
                  title={`Select course for wildcard slot ${slot.token}`}
                >
                  <option value="">Auto-select best match</option>
                  {slot.options.map((option) => (
                    <option key={`${slot.key}-${option.code}`} value={option.code}>
                      {option.code} - {option.title}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      {expandedSectionIds.has(section.id) ? (
        <>
          {section.logicBlocks?.length > 0 ? (
            <div className="mt-3 mb-3 space-y-2">
              {section.logicBlocks.map((block: any, idx: number) => (
                <div key={`${section.id}-logic-${idx}`}>{renderLogicBlock(block, 0)}</div>
              ))}
            </div>
          ) : sectionCourses.length > 0 ? (
            // Show individual course rows
            <div className={`mt-3 border border-border/30 rounded-md overflow-hidden ${condensedView ? "max-h-64 overflow-y-auto" : ""}`}>
              {sectionCourses.map((course) => (
                <CourseRowDisplay
                  key={course.code}
                  courseCode={course.code}
                  courseTitle={course.title}
                  credits={course.credits}
                  genEds={course.genEds}
                  status={course.status}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-3">No courses in this section.</p>
          )}

          {section.notes.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/30">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setExpandedNotesSectionIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(section.id)) next.delete(section.id);
                    else next.add(section.id);
                    return next;
                  });
                }}
              >
                <Info className="h-3.5 w-3.5" />
                {expandedNotesSectionIds.has(section.id) ? "Hide Notes" : "Show Notes"}
              </button>
              {expandedNotesSectionIds.has(section.id) && (
                <ul className="space-y-1 mt-2">
                  {section.notes.map((note, idx) => (
                    <li key={`${section.id}-note-${idx}`} className="text-xs text-foreground/70">• {note}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Collapsed. Tap to expand course details.</p>
      )}
    </Card>
  );
}

export default function DegreeAudit() {
  const [programs, setPrograms] = useState<UserDegreeProgram[]>([]);
  const [bundles, setBundles] = useState<ProgramRequirementBundle[]>([]);
  const [courses, setCourses] = useState<AuditCourse[]>([]);
  const [priorCredits, setPriorCredits] = useState<Awaited<ReturnType<typeof listUserPriorCredits>>>([]);
  const [courseDetails, setCourseDetails] = useState<Map<string, CourseDetails>>(new Map());
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeProgramIndex, setActiveProgramIndex] = useState(0);
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(new Set());
  const [expandedNotesSectionIds, setExpandedNotesSectionIds] = useState<Set<string>>(new Set());
  const condensedAuditView = false;
  const [selectedSpecialization, setSelectedSpecialization] = useState<Map<number, string>>(() => {
    try {
      const stored = localStorage.getItem(SPECIALIZATION_SELECTIONS_KEY);
      if (!stored) return new Map();
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return new Map(parsed);
    } catch { /* noop */ }
    return new Map();
  });
  const [editingProgramIndex, setEditingProgramIndex] = useState<number | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionDraft, setSectionDraft] = useState<SectionDraft | null>(null);
  const [activeDraftBlockId, setActiveDraftBlockId] = useState<string | null>(null);
  const [courseSearchQuery, setCourseSearchQuery] = useState("");
  const [wildcardTokenInput, setWildcardTokenInput] = useState("");
  const [courseSearchPending, setCourseSearchPending] = useState(false);
  const [courseSearchResults, setCourseSearchResults] = useState<CourseSearchResult[]>([]);
  const [courseSearchMessage, setCourseSearchMessage] = useState<string | null>(null);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);
  const [blockDropHint, setBlockDropHint] = useState<BlockDropHint | null>(null);
  const [codeDropHint, setCodeDropHint] = useState<CodeDropHint | null>(null);
  const [customSectionsByProgram, setCustomSectionsByProgram] = useState<Record<string, any[]>>({});
  const [wildcardSelections, setWildcardSelections] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(WILDCARD_SELECTIONS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, string>;
    } catch { /* noop */ }
    return {};
  });
  const [sectionEditSyncState, setSectionEditSyncState] = useState<SectionEditSyncState>("idle");
  const [skipPersistedSectionEdits, setSkipPersistedSectionEdits] = useState<boolean>(() => {
    try {
      return localStorage.getItem(REQUIREMENTS_CATALOG_RESET_KEY) === CURRENT_REQUIREMENTS_CATALOG_VERSION;
    } catch {
      return false;
    }
  });
  const editorCardRef = useRef<HTMLDivElement | null>(null);
  const saveRequestIdRef = useRef(0);
  const hasUnsavedEditorDraft = sectionDraft !== null;
  const [programRefreshNonce, setProgramRefreshNonce] = useState(0);
  const [showEditProgramsModal, setShowEditProgramsModal] = useState(false);
  const [programEditBusy, setProgramEditBusy] = useState(false);
  const [programEditMessage, setProgramEditMessage] = useState<string | null>(null);
  const [allPrograms, setAllPrograms] = useState<CatalogProgramOption[]>([]);
  const [selectedProgramToAdd, setSelectedProgramToAdd] = useState("");
  const [degreeDeclarationMode, setDegreeDeclarationMode] = useState<DegreeDeclarationMode>(() => {
    try {
      const stored = localStorage.getItem(DEGREE_DECLARATION_MODE_KEY);
      if (stored === "dual-major" || stored === "double-degree" || stored === "single") {
        return stored;
      }
    } catch {
      // noop
    }
    return "single";
  });

  const confirmDiscardEditorDraft = useCallback(() => {
    if (!hasUnsavedEditorDraft) return true;
    return window.confirm("Do you want to save your work? Select No to discard your unsaved changes.");
  }, [hasUnsavedEditorDraft]);

  useEffect(() => {
    try {
      const lastSeenCatalogVersion = localStorage.getItem(REQUIREMENTS_CATALOG_VERSION_KEY);
      if (lastSeenCatalogVersion !== CURRENT_REQUIREMENTS_CATALOG_VERSION) {
        localStorage.setItem(REQUIREMENTS_CATALOG_VERSION_KEY, CURRENT_REQUIREMENTS_CATALOG_VERSION);
        localStorage.setItem(REQUIREMENTS_CATALOG_RESET_KEY, CURRENT_REQUIREMENTS_CATALOG_VERSION);
        localStorage.removeItem(CUSTOM_AUDIT_SECTIONS_KEY);
        setCustomSectionsByProgram({});
        setSkipPersistedSectionEdits(true);
        toast.info("Requirements have been updated", {
          description: "Degree requirements were refreshed from the latest UMD catalog. Your audit now uses the updated requirements.",
        });
      }
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    if (!skipPersistedSectionEdits) return;

    let active = true;
    const run = async () => {
      try {
        const existingEdits = await listUserRequirementSectionEdits();
        if (!active) return;

        const programKeys = Object.keys(existingEdits);
        await Promise.all(programKeys.map((programKey) => saveUserRequirementSectionEdit(programKey, [])));
        if (!active) return;

        setCustomSectionsByProgram({});
        localStorage.removeItem(CUSTOM_AUDIT_SECTIONS_KEY);
        localStorage.removeItem(REQUIREMENTS_CATALOG_RESET_KEY);
        setSkipPersistedSectionEdits(false);
      } catch {
        // Keep reset flag so we retry on next load.
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [skipPersistedSectionEdits]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedEditorDraft) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedEditorDraft]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_AUDIT_SECTIONS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, any[]>;
      if (parsed && typeof parsed === "object") {
        setCustomSectionsByProgram(parsed);
      }
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    let active = true;

    const run = async () => {
      const resetPending = (() => {
        try {
          return localStorage.getItem(REQUIREMENTS_CATALOG_RESET_KEY) === CURRENT_REQUIREMENTS_CATALOG_VERSION;
        } catch {
          return false;
        }
      })();

      if (resetPending) {
        setSectionEditSyncState("synced");
        return;
      }

      if (skipPersistedSectionEdits) {
        setSectionEditSyncState("synced");
        return;
      }
      try {
        const serverEdits = await listUserRequirementSectionEdits();
        if (!active) return;
        setCustomSectionsByProgram((prev) => ({
          ...prev,
          ...serverEdits,
        }));
        setSectionEditSyncState("synced");
      } catch {
        // Keep local fallback only if remote persistence is unavailable.
        if (active) setSectionEditSyncState("local");
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_AUDIT_SECTIONS_KEY, JSON.stringify(customSectionsByProgram));
    } catch {
      // noop
    }
  }, [customSectionsByProgram]);

  useEffect(() => {
    try {
      localStorage.setItem(WILDCARD_SELECTIONS_KEY, JSON.stringify(wildcardSelections));
    } catch {
      // noop
    }
  }, [wildcardSelections]);

  const resetDraftEditorForce = () => {
    setEditingSectionId(null);
    setSectionDraft(null);
    setActiveDraftBlockId(null);
    setCourseSearchQuery("");
    setCourseSearchResults([]);
    setCourseSearchMessage(null);
    setDragOverBlockId(null);
    setBlockDropHint(null);
    setCodeDropHint(null);
  };

  const resetDraftEditor = () => {
    if (!confirmDiscardEditorDraft()) {
      return;
    }
    resetDraftEditorForce();
  };

  const startEditingSection = (programIndex: number, section: any) => {
    if (!confirmDiscardEditorDraft()) {
      return;
    }
    const draft = draftFromSection(section);
    setEditingProgramIndex(programIndex);
    setEditingSectionId(section.id);
    setSectionDraft(draft);
    setActiveDraftBlockId(draft.blocks[0]?.id ?? null);
    setCourseSearchQuery("");
    setCourseSearchResults([]);
    setCourseSearchMessage(null);
  };

  const startAddingSection = (programIndex: number) => {
    if (!confirmDiscardEditorDraft()) {
      return;
    }
    const blockId = createLocalId("block");
    setEditingProgramIndex(programIndex);
    setEditingSectionId(null);
    setSectionDraft({
      title: "",
      requirementType: "all",
      chooseCount: 1,
      notesText: "",
      sectionCodes: [],
      blocks: [{ id: blockId, type: "AND", codes: [] }],
    });
    setActiveDraftBlockId(blockId);
    setCourseSearchQuery("");
    setCourseSearchResults([]);
    setCourseSearchMessage(null);
  };

  const changeActiveProgramIndex = (nextIndex: number) => {
    if (nextIndex === activeProgramIndex) return;
    if (!confirmDiscardEditorDraft()) return;
    resetDraftEditorForce();
    setActiveProgramIndex(nextIndex);
  };

  const persistProgramSections = (programId: string, sections: any[]) => {
    const mergedSections = mergeProgramCustomSections(customSectionsByProgram[programId], sections);

    setCustomSectionsByProgram((prev) => ({
      ...prev,
      [programId]: mergedSections,
    }));
    setBundles((prev) => prev.map((bundle) => (
      bundle.programId === programId
        ? { ...bundle, sections }
        : bundle
    )));

    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;
    setSectionEditSyncState("saving");

    void saveUserRequirementSectionEdit(programId, mergedSections)
      .then(() => {
        if (saveRequestIdRef.current === requestId) {
          setSectionEditSyncState("synced");
        }
      })
      .catch(() => {
        // Ignore remote save failures; local persistence still keeps edits.
        if (saveRequestIdRef.current === requestId) {
          setSectionEditSyncState("local");
        }
      });
  };

  const refreshAuditAfterProgramMutation = () => {
    setProgramRefreshNonce((prev) => prev + 1);
  };

  const refreshProgramCatalog = async () => {
    const options = await listProgramCatalogOptions();
    setAllPrograms(options);
  };

  const openEditProgramsModal = () => {
    if (!confirmDiscardEditorDraft()) return;
    resetDraftEditorForce();
    setShowEditProgramsModal(true);
    if (allPrograms.length === 0) {
      void refreshProgramCatalog();
    }
  };

  const closeEditProgramsModal = () => {
    setShowEditProgramsModal(false);
    setProgramEditMessage(null);
  };

  const handleAddProgramFromModal = async () => {
    if (!selectedProgramToAdd) return;

    try {
      setProgramEditBusy(true);
      setProgramEditMessage(null);
      const option = allPrograms.find((program) => program.key === selectedProgramToAdd);
      if (!option) {
        throw new Error("Selected program option could not be resolved.");
      }

      await addUserDegreeProgramFromCatalogOption(option);
      setSelectedProgramToAdd("");
      setProgramEditMessage("Program added.");
      refreshAuditAfterProgramMutation();
      void refreshProgramCatalog();
    } catch (error) {
      setProgramEditMessage(error instanceof Error ? error.message : "Unable to add program.");
    } finally {
      setProgramEditBusy(false);
    }
  };

  const handleRemoveProgramFromModal = async (userDegreeProgramId: string) => {
    try {
      setProgramEditBusy(true);
      setProgramEditMessage(null);
      if (userDegreeProgramId.startsWith("local-link:")) {
        await removeLocalCatalogProgramSelection(userDegreeProgramId);
      } else {
        await removeUserDegreeProgram(userDegreeProgramId);
      }

      setProgramEditMessage("Program removed.");
      refreshAuditAfterProgramMutation();
      void refreshProgramCatalog();
    } catch (error) {
      setProgramEditMessage(error instanceof Error ? error.message : "Unable to remove program.");
    } finally {
      setProgramEditBusy(false);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(DEGREE_DECLARATION_MODE_KEY, degreeDeclarationMode);
    } catch {
      // noop
    }
  }, [degreeDeclarationMode]);

  const runCourseSearch = async () => {
    if (!courseSearchQuery.trim()) {
      setCourseSearchResults([]);
      setCourseSearchMessage("Enter a course code or title to search.");
      return;
    }

    setCourseSearchPending(true);
    setCourseSearchMessage(null);
    try {
      const results = await plannerApi.searchCoursesAcrossRecentTerms(courseSearchQuery.trim());
      const mapped = (results ?? []).map((course) => ({
        id: course.id,
        code: String(course.id ?? "").toUpperCase(),
        title: String(course.title ?? "Untitled"),
      })).filter((course) => course.code);

      setCourseSearchResults(mapped.slice(0, 20));
      if (mapped.length === 0) {
        setCourseSearchMessage("No courses found across recent fall/spring/summer/winter terms.");
      }
    } catch {
      setCourseSearchMessage("Course search failed. Try again.");
      setCourseSearchResults([]);
    } finally {
      setCourseSearchPending(false);
    }
  };

  useEffect(() => {
    if (!sectionDraft) return;

    const handleEditorEnterShortcut = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!editorCardRef.current?.contains(target)) return;
      if (target.tagName === "TEXTAREA") return;

      const searchArea = target.closest("[data-audit-search-area='true']");
      if (searchArea) {
        const searchButton = searchArea.querySelector<HTMLButtonElement>("[data-audit-search-btn='true']");
        if (searchButton && !searchButton.disabled) {
          event.preventDefault();
          searchButton.click();
        }
        return;
      }

      const saveButton = editorCardRef.current.querySelector<HTMLButtonElement>("[data-audit-save-btn='true']");
      if (saveButton && !saveButton.disabled) {
        event.preventDefault();
        saveButton.click();
      }
    };

    document.addEventListener("keydown", handleEditorEnterShortcut);
    return () => document.removeEventListener("keydown", handleEditorEnterShortcut);
  }, [sectionDraft]);

  const addCodeToActiveBlock = (code: string): boolean => {
    if (!activeDraftBlockId) {
      setCourseSearchMessage("Create an AND or OR group first, then add classes or wildcard tokens.");
      return false;
    }
    const normalized = code.toUpperCase().trim();
    if (!normalized) return false;

    setSectionDraft((prev) => prev ? {
      ...prev,
      blocks: mapBlocksRecursively(prev.blocks, (block) => block.id === activeDraftBlockId
        ? { ...block, codes: Array.from(new Set([...block.codes, normalized])) }
        : block),
    } : prev);
    setCourseSearchMessage(null);
    return true;
  };

  const addCodeToSectionLevel = (code: string): boolean => {
    const normalized = code.toUpperCase().trim();
    if (!normalized) return false;

    setSectionDraft((prev) => {
      if (!prev) return prev;
      const inBlocks = flattenDraftBlocks(prev.blocks).some(({ block }) => block.codes.includes(normalized));
      if (inBlocks || (prev.sectionCodes ?? []).includes(normalized)) return prev;
      return {
        ...prev,
        sectionCodes: [...(prev.sectionCodes ?? []), normalized],
      };
    });
    setCourseSearchMessage(null);
    return true;
  };

  const addWildcardTokenToActiveBlock = () => {
    const normalized = wildcardTokenInput.toUpperCase().trim();
    if (!WILDCARD_TOKEN_PATTERN.test(normalized)) {
      setCourseSearchMessage("Wildcard format must look like BSCI1XX..BSCI8XX or CMSC/MATHXXX.");
      return;
    }

    const added = addCodeToActiveBlock(normalized);
    if (!added) {
      return;
    }
    setWildcardTokenInput("");
    setCourseSearchMessage(null);
  };

  const mapBlocksRecursively = (
    blocks: EditableLogicBlock[],
    mapper: (block: EditableLogicBlock) => EditableLogicBlock,
  ): EditableLogicBlock[] => {
    return blocks.map((block) => {
      const withChildren = Array.isArray(block.children)
        ? { ...block, children: mapBlocksRecursively(block.children, mapper) }
        : block;
      return mapper(withChildren);
    });
  };

  const removeBlockById = (
    blocks: EditableLogicBlock[],
    blockId: string,
  ): { blocks: EditableLogicBlock[]; removed: EditableLogicBlock | null } => {
    let removed: EditableLogicBlock | null = null;

    const nextBlocks = blocks
      .map((block) => {
        if (block.id === blockId) {
          removed = block;
          return null;
        }

        if (Array.isArray(block.children) && block.children.length > 0) {
          const childResult = removeBlockById(block.children, blockId);
          if (childResult.removed) {
            removed = childResult.removed;
            return { ...block, children: childResult.blocks };
          }
        }

        return block;
      })
      .filter((block): block is EditableLogicBlock => block !== null);

    return { blocks: nextBlocks, removed };
  };

  const addChildToBlock = (
    blocks: EditableLogicBlock[],
    targetId: string,
    child: EditableLogicBlock,
  ): EditableLogicBlock[] => {
    return blocks.map((block) => {
      if (block.id === targetId) {
        return {
          ...block,
          children: [...(block.children ?? []), child],
        };
      }

      if (Array.isArray(block.children) && block.children.length > 0) {
        return {
          ...block,
          children: addChildToBlock(block.children, targetId, child),
        };
      }

      return block;
    });
  };

  const insertBlockRelativeToTarget = (
    blocks: EditableLogicBlock[],
    targetId: string,
    moving: EditableLogicBlock,
    position: Exclude<BlockDropPosition, "inside">,
  ): { blocks: EditableLogicBlock[]; inserted: boolean } => {
    const next: EditableLogicBlock[] = [];
    let inserted = false;

    for (const block of blocks) {
      if (block.id === targetId) {
        if (position === "before") {
          next.push(moving, block);
        } else {
          next.push(block, moving);
        }
        inserted = true;
        continue;
      }

      if (Array.isArray(block.children) && block.children.length > 0) {
        const nested = insertBlockRelativeToTarget(block.children, targetId, moving, position);
        if (nested.inserted) {
          next.push({ ...block, children: nested.blocks });
          inserted = true;
          continue;
        }
      }

      next.push(block);
    }

    return { blocks: next, inserted };
  };

  const findBlockById = (blocks: EditableLogicBlock[], blockId: string): EditableLogicBlock | null => {
    for (const block of blocks) {
      if (block.id === blockId) return block;
      if (Array.isArray(block.children) && block.children.length > 0) {
        const match = findBlockById(block.children, blockId);
        if (match) return match;
      }
    }
    return null;
  };

  const blockContains = (block: EditableLogicBlock, targetId: string): boolean => {
    if (!Array.isArray(block.children) || block.children.length === 0) return false;
    for (const child of block.children) {
      if (child.id === targetId || blockContains(child, targetId)) {
        return true;
      }
    }
    return false;
  };

  const nestBlockIntoBlock = (sourceBlockId: string, targetBlockId: string, position: BlockDropPosition = "inside") => {
    if (sourceBlockId === targetBlockId) return;

    setSectionDraft((prev) => {
      if (!prev) return prev;
      const sourceBlock = findBlockById(prev.blocks, sourceBlockId);
      if (!sourceBlock) return prev;
      const targetBlock = findBlockById(prev.blocks, targetBlockId);
      if (!targetBlock) return prev;
      if (blockContains(sourceBlock, targetBlockId)) {
        return prev;
      }

      const removedResult = removeBlockById(prev.blocks, sourceBlockId);
      if (!removedResult.removed) return prev;

      if (position === "before" || position === "after") {
        const inserted = insertBlockRelativeToTarget(removedResult.blocks, targetBlockId, removedResult.removed, position);
        return {
          ...prev,
          blocks: inserted.inserted ? inserted.blocks : [...removedResult.blocks, removedResult.removed],
        };
      }

      return {
        ...prev,
        blocks: addChildToBlock(removedResult.blocks, targetBlockId, removedResult.removed),
      };
    });
  };

  const findCodeIndexInBlock = (blocks: EditableLogicBlock[], blockId: string, code: string): number => {
    const block = findBlockById(blocks, blockId);
    if (!block) return -1;
    return block.codes.findIndex((item) => item === code);
  };

  const moveCodeToBlockPosition = (
    sourceBlockId: string,
    code: string,
    targetBlockId: string,
    targetIndex: number,
  ) => {
    setSectionDraft((prev) => {
      if (!prev) return prev;

      const sourceIndex = findCodeIndexInBlock(prev.blocks, sourceBlockId, code);
      if (sourceIndex < 0) return prev;

      let adjustedTargetIndex = targetIndex;
      if (sourceBlockId === targetBlockId && Number.isFinite(adjustedTargetIndex) && sourceIndex < adjustedTargetIndex) {
        adjustedTargetIndex -= 1;
      }

      const withoutSource = mapBlocksRecursively(prev.blocks, (block) =>
        block.id === sourceBlockId
          ? { ...block, codes: block.codes.filter((value) => value !== code) }
          : block,
      );

      const nextBlocks = mapBlocksRecursively(withoutSource, (block) => {
        if (block.id !== targetBlockId) return block;
        const baseCodes = block.codes.filter((value) => value !== code);
        const insertAt = Number.isFinite(adjustedTargetIndex)
          ? Math.max(0, Math.min(baseCodes.length, adjustedTargetIndex))
          : baseCodes.length;
        const nextCodes = [...baseCodes];
        nextCodes.splice(insertAt, 0, code);
        return { ...block, codes: nextCodes };
      });

      return {
        ...prev,
        blocks: nextBlocks,
      };
    });
  };

  const moveCodeFromBlockToSection = (sourceBlockId: string, code: string) => {
    setSectionDraft((prev) => {
      if (!prev) return prev;
      const existsInSource = findCodeIndexInBlock(prev.blocks, sourceBlockId, code) >= 0;
      if (!existsInSource) return prev;

      const nextBlocks = mapBlocksRecursively(prev.blocks, (block) =>
        block.id === sourceBlockId
          ? { ...block, codes: block.codes.filter((value) => value !== code) }
          : block,
      );

      return {
        ...prev,
        blocks: nextBlocks,
        sectionCodes: Array.from(new Set([...(prev.sectionCodes ?? []), code])),
      };
    });
  };

  const moveCodeFromSectionToBlock = (
    code: string,
    targetBlockId: string,
    targetIndex: number,
  ) => {
    setSectionDraft((prev) => {
      if (!prev || !(prev.sectionCodes ?? []).includes(code)) return prev;

      const withoutSectionCode = {
        ...prev,
        sectionCodes: (prev.sectionCodes ?? []).filter((value) => value !== code),
      };

      const nextBlocks = mapBlocksRecursively(withoutSectionCode.blocks, (block) => {
        if (block.id !== targetBlockId) return block;
        const baseCodes = block.codes.filter((value) => value !== code);
        const insertAt = Number.isFinite(targetIndex)
          ? Math.max(0, Math.min(baseCodes.length, targetIndex))
          : baseCodes.length;
        const nextCodes = [...baseCodes];
        nextCodes.splice(insertAt, 0, code);
        return { ...block, codes: nextCodes };
      });

      return {
        ...withoutSectionCode,
        blocks: nextBlocks,
      };
    });
  };

  const getDropPositionForBlock = (clientY: number, element: HTMLElement): BlockDropPosition => {
    const rect = element.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const edgeBand = Math.max(20, Math.min(56, rect.height * 0.36));
    if (relativeY <= edgeBand) return "before";
    if (relativeY >= rect.height - edgeBand) return "after";
    return "inside";
  };

  const maybeAutoScrollDuringDrag = (clientY: number) => {
    const threshold = 90;
    const step = 20;
    if (clientY < threshold) {
      window.scrollBy({ top: -step, behavior: "auto" });
      return;
    }
    if (window.innerHeight - clientY < threshold) {
      window.scrollBy({ top: step, behavior: "auto" });
    }
  };

  const startBlockDrag = (event: DragEvent<HTMLElement>, blockId: string) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `BLOCK::${blockId}`);
    setDragOverBlockId(null);
    setBlockDropHint(null);
    setCodeDropHint(null);
  };

  const handleDropIntoBlock = (raw: string, targetBlockId: string, position: BlockDropPosition = "inside") => {
    if (raw.startsWith("BLOCK::")) {
      const sourceBlockId = raw.replace("BLOCK::", "");
      nestBlockIntoBlock(sourceBlockId, targetBlockId, position);
      setDragOverBlockId(null);
      setBlockDropHint(null);
      setCodeDropHint(null);
      return;
    }

    if (raw.startsWith("SECTION::")) {
      const code = raw.replace("SECTION::", "").toUpperCase().trim();
      if (!code) return;
      if (position === "before") {
        moveCodeFromSectionToBlock(code, targetBlockId, 0);
      } else {
        moveCodeFromSectionToBlock(code, targetBlockId, Number.POSITIVE_INFINITY);
      }
      setDragOverBlockId(null);
      setBlockDropHint(null);
      setCodeDropHint(null);
      return;
    }

    const [sourceBlockId, code] = raw.split("::");
    if (!sourceBlockId || !code) return;
    if (position === "inside") {
      moveCodeToBlockPosition(sourceBlockId, code, targetBlockId, Number.POSITIVE_INFINITY);
    } else {
      moveCodeFromBlockToSection(sourceBlockId, code);
    }
    setDragOverBlockId(null);
    setBlockDropHint(null);
    setCodeDropHint(null);
  };

  const flattenDraftBlocks = (
    blocks: EditableLogicBlock[],
    depth: number = 0,
    parentId: string | null = null,
  ): Array<{ block: EditableLogicBlock; depth: number; parentId: string | null }> => {
    const out: Array<{ block: EditableLogicBlock; depth: number; parentId: string | null }> = [];
    for (const block of blocks) {
      out.push({ block, depth, parentId });
      if (Array.isArray(block.children) && block.children.length > 0) {
        out.push(...flattenDraftBlocks(block.children, depth + 1, block.id));
      }
    }
    return out;
  };

  const deleteBlockById = (blockId: string) => {
    setSectionDraft((prev) => {
      if (!prev) return prev;
      const removedResult = removeBlockById(prev.blocks, blockId);
      const nextActiveId = removedResult.blocks[0]?.id ?? null;
      setActiveDraftBlockId((current) => (current === blockId ? nextActiveId : current));
      return {
        ...prev,
        blocks: removedResult.blocks,
      };
    });
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        // Load saved CS specialization preference.
        const savedSpecialization = await loadCsSpecializationPreference();
        if (active && savedSpecialization) {
          // Set to first CS major program (index 0 for now; could be enhanced).
          setSelectedSpecialization((prev) => {
            const next = new Map(prev);
            next.set(0, savedSpecialization);
            return next;
          });
        }
      } catch {
        // noop
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (bundles.length === 0) return;
    const ids = bundles.flatMap((bundle) => bundle.sections.map((section) => String(section.id)));
    setExpandedSectionIds(new Set(ids));
  }, [bundles]);

  useEffect(() => {
    if (editingProgramIndex === null || !sectionDraft) return;
    editorCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editingProgramIndex, sectionDraft]);

  // Persist specialization selection changes to localStorage
  useEffect(() => {
    try {
      if (selectedSpecialization.size === 0) {
        localStorage.removeItem(SPECIALIZATION_SELECTIONS_KEY);
      } else {
        localStorage.setItem(SPECIALIZATION_SELECTIONS_KEY, JSON.stringify(Array.from(selectedSpecialization.entries())));
      }
    } catch { /* noop */ }
  }, [selectedSpecialization]);

  // Handle specialization selection changes
  useEffect(() => {
    if (bundles.length === 0) return;

    const updatedBundles = bundles.map((bundle, index) => {
      if (bundle.source !== "cs-specialized") return bundle;

      const selectedSpecId = selectedSpecialization.get(index);
      const newSections = getCsRequirementSectionsForSpecialization(selectedSpecId);
      const customSections = customSectionsByProgram[bundle.programId];
      const mergedSections = mergeVisibleSectionsWithStoredCustom(newSections, customSections, selectedSpecId);

      return {
        ...bundle,
        sections: mergedSections,
      };
    });

    setBundles(updatedBundles);
    // Note: only depend on selectedSpecialization, not bundles, to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSpecialization, customSectionsByProgram]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const [selectedPrograms, schedules, priorCredits] = await Promise.all([
          listUserDegreePrograms(),
          plannerApi.listAllSchedulesWithSelections(),
          listUserPriorCredits(),
        ]);

        if (!active) return;

        const mainSchedules = schedules.filter((schedule) => schedule.is_primary && schedule.term_code && schedule.term_year);

        const byCode = new Map<string, AuditCourse>();
        for (const schedule of mainSchedules) {
          const scheduleStatus = getAcademicProgressStatus({
            termCode: schedule.term_code!,
            termYear: schedule.term_year!,
          });

          for (const selection of parseSelections(schedule.selections_json)) {
            const rawCode = String(selection?.course?.courseCode ?? "").toUpperCase();
            const normalizedCode = normalizeCourseCode(rawCode);
            const code = canonicalCourseCode(normalizedCode);
            if (!code) continue;

            const current: AuditCourse = {
              code,
              title: String(selection?.course?.name ?? "Untitled Course"),
              credits: Number(selection?.course?.maxCredits ?? selection?.course?.credits ?? 0) || 0,
              genEds: Array.isArray(selection?.course?.genEds) ? selection.course.genEds : [],
              status: scheduleStatus,
            };

            const existing = byCode.get(code);
            if (!existing) {
              byCode.set(code, current);
            } else {
              byCode.set(code, {
                ...existing,
                credits: Math.max(existing.credits, current.credits),
                title: existing.title || current.title,
                genEds: Array.from(new Set([...(existing.genEds ?? []), ...(current.genEds ?? [])])),
                status: mergeStatus(existing.status, current.status),
              });
            }
          }
        }

        for (const credit of priorCredits) {
          if (credit.countsTowardProgress === false) {
            continue;
          }

          const creditCodes = resolvePriorCreditCourseCodes(credit);

          for (const rawCode of creditCodes) {
            const normalizedCode = normalizeCourseCode(rawCode);
            const code = canonicalCourseCode(normalizedCode);
            const current: AuditCourse = {
              code,
              title: credit.originalName,
              credits: Number(credit.credits ?? 0) || 0,
              genEds: Array.isArray(credit.genEdCodes) ? credit.genEdCodes : [],
              status: "completed",
            };

            const existing = byCode.get(code);
            if (!existing) {
              byCode.set(code, current);
            } else {
              byCode.set(code, {
                ...existing,
                credits: Math.max(existing.credits, current.credits),
                title: existing.title || current.title,
                genEds: Array.from(new Set([...(existing.genEds ?? []), ...(current.genEds ?? [])])),
                status: mergeStatus(existing.status, current.status),
              });
            }
          }
        }

        const auditCourses = Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code));
        const loadedBundles = await loadProgramRequirementBundles(selectedPrograms);
        if (!active) return;

        const withCustomSections = loadedBundles.map((bundle, index) => {
          const customSections = customSectionsByProgram[bundle.programId];
          if (!customSections || customSections.length === 0) {
            return bundle;
          }

          if (bundle.source === "cs-specialized") {
            const selectedSpecId = selectedSpecialization.get(index);
            const generatedSections = getCsRequirementSectionsForSpecialization(selectedSpecId);
            const mergedSections = mergeVisibleSectionsWithStoredCustom(generatedSections, customSections, selectedSpecId);
            return { ...bundle, sections: mergedSections };
          }

          return { ...bundle, sections: customSections };
        });

        setPrograms(selectedPrograms);
        setBundles(withCustomSections);
        setCourses(auditCourses);
        setPriorCredits(priorCredits);
        setErrorMessage(null);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Unable to load degree audit.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [customSectionsByProgram, selectedSpecialization, programRefreshNonce]);

  useEffect(() => {
    if (bundles.length === 0) return;
    setBundles((prev) => prev.map((bundle, index) => {
      const customSections = customSectionsByProgram[bundle.programId];
      if (!customSections || customSections.length === 0) return bundle;

      if (bundle.source === "cs-specialized") {
        const selectedSpecId = selectedSpecialization.get(index);
        const generatedSections = getCsRequirementSectionsForSpecialization(selectedSpecId);
        const mergedSections = mergeVisibleSectionsWithStoredCustom(generatedSections, customSections, selectedSpecId);
        return { ...bundle, sections: mergedSections };
      }

      if (bundle.sections === customSections) return bundle;
      return { ...bundle, sections: customSections };
    }));
  }, [customSectionsByProgram, selectedSpecialization]);

  // Load course details from database
  useEffect(() => {
    let active = true;

    const run = async () => {
      // Collect all course codes from all bundles
      const allCourseCodes = new Set<string>();
      for (const bundle of bundles) {
        for (const section of bundle.sections) {
          for (const code of section.courseCodes) {
            allCourseCodes.add(code.toUpperCase());
          }
        }
      }

      if (allCourseCodes.size === 0) return;

      try {
        const details = await lookupCourseDetails(Array.from(allCourseCodes));
        if (active) {
          setCourseDetails(details);
        }
      } catch (error) {
        console.error("Failed to load course details:", error);
        // Continue without course details rather than failing
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [bundles]);

  const byCourseCode = useMemo(() => {
    const map = new Map<string, AuditCourseStatus>();

    for (const course of courses) {
      const canonical = canonicalCourseCode(course.code);
      for (const equivalentCode of getEquivalentCourseCodes(canonical)) {
        map.set(equivalentCode, mergeStatus(map.get(equivalentCode) ?? "not_started", course.status));
      }
    }

    const status340 = map.get("MATH340") ?? "not_started";
    const status341 = map.get("MATH341") ?? "not_started";
    const substitutionStatus = statusFromPair(status340, status341);

    if (substitutionStatus !== "not_started") {
      for (const equivalent of ["MATH240", "MATH241", "MATH246"]) {
        map.set(equivalent, mergeStatus(map.get(equivalent) ?? "not_started", substitutionStatus));
      }
    }

    return map;
  }, [courses]);

  const contributionMap = useMemo(() => buildCourseContributionMap(bundles), [bundles]);
  const transcriptGpaHistory = useMemo(() => calculateTranscriptGPAHistory(priorCredits), [priorCredits]);

  const summary = useMemo(() => {
    const mathSubstitutionActive = (byCourseCode.get("MATH340") ?? "not_started") !== "not_started"
      && (byCourseCode.get("MATH341") ?? "not_started") !== "not_started";
    const mathSubstitutionSuppressed = new Set(["MATH240", "MATH241", "MATH246"]);

    let completedCredits = 0;
    let inProgressCredits = 0;
    let plannedCredits = 0;

    for (const course of courses) {
      const canonical = canonicalCourseCode(course.code);
      if (mathSubstitutionActive && mathSubstitutionSuppressed.has(canonical)) {
        continue;
      }

      if (course.status === "completed") completedCredits += course.credits;
      else if (course.status === "in_progress") inProgressCredits += course.credits;
      else plannedCredits += course.credits;
    }

    const totalCredits = completedCredits + inProgressCredits + plannedCredits;
    const majorProgramCount = bundles.filter((bundle) => bundle.kind === "major").length;
    const requiredCredits = majorProgramCount >= 2 ? 150 : 120;

    return {
      totalCredits,
      completedCredits,
      inProgressCredits,
      plannedCredits,
      requiredCredits,
      overallGPA: transcriptGpaHistory.overallGPA,
      mathSubstitutionActive,
    };
  }, [courses, bundles, transcriptGpaHistory, byCourseCode]);

  const programAudits = useMemo(() => {
    return bundles.map((bundle) => {
      const explicitCodesInProgram = new Set(
        bundle.sections
          .flatMap((section) => section.courseCodes)
          .map((code) => String(code).toUpperCase())
          .filter((code) => !parseWildcardRule(code))
      );

      const statusOrder: AuditCourseStatus[] = ["completed", "in_progress", "planned", "not_started"];
      const rank = (status: AuditCourseStatus) => statusOrder.indexOf(status);
      const selectedCodesInProgram = new Set(
        Object.entries(wildcardSelections)
          .filter(([slotKey, courseCode]) => slotKey.startsWith(`${bundle.programId}:`) && String(courseCode ?? "").trim().length > 0)
          .map(([, courseCode]) => String(courseCode).toUpperCase()),
      );

      const sectionRows = bundle.sections.map((section) => {
        const wildcardTokens = collectWildcardTokensWithOccurrences(section);
        const wildcardSlotDescriptors = wildcardTokens
          .map((token, idx) => {
            const rule = parseWildcardRule(token);
            if (!rule) return null;
            return {
              rule,
              slotKey: `${bundle.programId}:${section.id}:${idx}:${rule.token}`,
            };
          })
          .filter((descriptor): descriptor is { rule: WildcardRule; slotKey: string } => Boolean(descriptor));

        const explicitCodesInSection = new Set(
          section.courseCodes
            .map((code) => String(code).toUpperCase())
            .filter((code) => !parseWildcardRule(code)),
        );

        const chooseCount = section.requirementType === "choose" ? Math.max(1, Number(section.chooseCount ?? 1)) : 0;
        const chooseSatisfiedExplicitCodes = new Set(
          Array.from(explicitCodesInSection).filter((code) => (byCourseCode.get(code) ?? "not_started") !== "not_started"),
        );

        const selectedExplicitSectionWildcardCodes = new Set(
          wildcardSlotDescriptors
            .map(({ slotKey }) => String(wildcardSelections[slotKey] ?? "").toUpperCase())
            .filter((code) => explicitCodesInSection.has(code)),
        );

        const canUseChooseOverflowCode = (candidateCode: string, currentSlotSelectedCode: string): boolean => {
          if (section.requirementType !== "choose") return false;
          if (!chooseSatisfiedExplicitCodes.has(candidateCode)) return false;

          const selectedWithoutCurrent = Array.from(selectedExplicitSectionWildcardCodes).filter(
            (code) => code !== currentSlotSelectedCode,
          );
          const wouldConsumeCount = selectedWithoutCurrent.includes(candidateCode)
            ? selectedWithoutCurrent.length
            : selectedWithoutCurrent.length + 1;

          return (chooseSatisfiedExplicitCodes.size - wouldConsumeCount) >= chooseCount;
        };

        const wildcardSlots: WildcardSlotMeta[] = wildcardSlotDescriptors.map(({ rule, slotKey }) => {
          const selectedCode = wildcardSelections[slotKey];
          const normalizedSelectedCode = String(selectedCode ?? "").toUpperCase();

          const options = courses
            .filter((course) => {
              const normalizedCode = course.code.toUpperCase();

              if (explicitCodesInProgram.has(normalizedCode)) {
                if (!canUseChooseOverflowCode(normalizedCode, normalizedSelectedCode)) {
                  return false;
                }
              }

              const selectedElsewhere = selectedCodesInProgram.has(normalizedCode) && normalizedCode !== normalizedSelectedCode;
              if (selectedElsewhere) return false;
              return courseMatchesWildcardRule(normalizedCode, rule);
            })
            .sort((a, b) => a.code.localeCompare(b.code))
            .map((course) => ({
              code: course.code.toUpperCase(),
              title: course.title,
              status: course.status,
            }));

          const best = [...options].sort((a, b) => rank(a.status) - rank(b.status))[0];
          const effectiveCode = options.some((option) => option.code === selectedCode)
            ? selectedCode
            : best?.code;

          return {
            key: slotKey,
            token: rule.token,
            options,
            selectedCode,
            effectiveCode,
          };
        });

        const byCourseCodeWithWildcards = new Map(byCourseCode);
        for (const slot of wildcardSlots) {
          const effectiveCode = String(slot.effectiveCode ?? "").toUpperCase();
          if (!effectiveCode) continue;
          const effectiveStatus = byCourseCode.get(effectiveCode) ?? "not_started";
          byCourseCodeWithWildcards.set(String(slot.token).toUpperCase(), effectiveStatus);
        }

        const baseCounts = evaluateSectionCounts(section, byCourseCodeWithWildcards);

        return {
          section,
          wildcardSlots,
          eval: {
            sectionId: section.id,
            status: baseCounts.status,
            requiredSlots: baseCounts.requiredSlots,
            completedSlots: baseCounts.completedSlots,
            inProgressSlots: baseCounts.inProgressSlots,
            plannedSlots: baseCounts.plannedSlots,
          },
        };
      });

      const requiredSlots = sectionRows.reduce((sum, row) => sum + row.eval.requiredSlots, 0);
      const completedSlots = sectionRows.reduce((sum, row) => sum + row.eval.completedSlots, 0);
      const inProgressSlots = sectionRows.reduce((sum, row) => sum + row.eval.inProgressSlots, 0);
      const plannedSlots = sectionRows.reduce((sum, row) => sum + row.eval.plannedSlots, 0);

      let status: AuditCourseStatus = "not_started";
      if (completedSlots >= requiredSlots) status = "completed";
      else if (completedSlots + inProgressSlots >= requiredSlots) status = "in_progress";
      else if (completedSlots + inProgressSlots + plannedSlots >= requiredSlots) status = "planned";

      return {
        bundle,
        sectionRows,
        requiredSlots,
        completedSlots,
        inProgressSlots,
        plannedSlots,
        status,
        progressPercent: requiredSlots === 0 ? 0 : Math.round(((completedSlots + inProgressSlots) / requiredSlots) * 100),
      };
    });
  }, [bundles, byCourseCode, courses, wildcardSelections]);

  const handleWildcardSelection = (slotKey: string, courseCode: string) => {
    const programId = slotKey.split(":")[0];
    const normalized = String(courseCode ?? "").toUpperCase();

    setWildcardSelections((prev) => {
      const next = { ...prev };

      if (normalized) {
        for (const [key, selected] of Object.entries(next)) {
          if (key !== slotKey && key.startsWith(`${programId}:`) && String(selected).toUpperCase() === normalized) {
            next[key] = "";
          }
        }
      }

      next[slotKey] = courseCode;
      return next;
    });
  };

  const electiveOverflow = useMemo(() => {
    return courses.filter((course) => {
      const contributes = getContributionLabelsForCourseCode(course.code, contributionMap).length > 0;
      const hasGenEdTags = Array.isArray(course.genEds) && course.genEds.some((code) => String(code ?? "").trim().length > 0);
      return !contributes && !hasGenEdTags;
    });
  }, [contributionMap, courses]);

  const electiveCredits = electiveOverflow.reduce((sum, course) => sum + course.credits, 0);

  const addablePrograms = useMemo(() => {
    const existingNames = new Set(programs.map((program) => normalizeCatalogProgramName(program.programName)));
    return allPrograms.filter((program) => !existingNames.has(normalizeCatalogProgramName(program.name)));
  }, [allPrograms, programs]);

  const degreeAuditShareText = useMemo(() => {
    const lines: string[] = [];
    lines.push("OrbitUMD Degree Audit Summary");
    lines.push(`Credits: ${summary.totalCredits}/${summary.requiredCredits}`);
    lines.push(`Completed: ${summary.completedCredits} | In Progress: ${summary.inProgressCredits} | Planned: ${summary.plannedCredits}`);
    lines.push("");
    for (const programAudit of programAudits) {
      const done = Math.min(
        programAudit.requiredSlots,
        programAudit.completedSlots + programAudit.inProgressSlots + programAudit.plannedSlots,
      );
      lines.push(`${programAudit.bundle.programName}: ${done}/${programAudit.requiredSlots} classes`);
    }
    if (typeof window !== "undefined") {
      lines.push("");
      lines.push(`View: ${window.location.href}`);
    }
    return lines.join("\n");
  }, [programAudits, summary]);

  const handlePrintDegreeAudit = () => {
    window.print();
  };

  const handleEmailDegreeAudit = () => {
    const subject = encodeURIComponent("OrbitUMD Degree Audit");
    const body = encodeURIComponent(degreeAuditShareText);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleTextDegreeAudit = () => {
    const body = encodeURIComponent(degreeAuditShareText);
    window.location.href = `sms:?&body=${body}`;
  };

  useEffect(() => {
    if (programAudits.length === 0) {
      if (activeProgramIndex !== 0) {
        setActiveProgramIndex(0);
      }
      return;
    }

    if (activeProgramIndex >= programAudits.length) {
      setActiveProgramIndex(programAudits.length - 1);
    }
  }, [activeProgramIndex, programAudits.length]);

  const selectedProgramIndex = programAudits.length > 0
    ? Math.min(activeProgramIndex, programAudits.length - 1)
    : 0;
  const selectedProgramAudit = programAudits[selectedProgramIndex] ?? null;
  const selectedSpecializationId = selectedSpecialization.get(selectedProgramIndex);
  const specializationPreviewById = useMemo(() => {
    const preview = new Map<string, string>();
    if (!selectedProgramAudit) return preview;

    (selectedProgramAudit.bundle.specializationOptions ?? []).forEach((spec) => {
      const codes = Array.from(new Set(
        selectedProgramAudit.sectionRows
          .filter(({ section }) => section.specializationId === spec.id)
          .flatMap(({ section }) => Array.isArray(section.courseCodes) ? section.courseCodes : [])
          .map((code) => String(code).toUpperCase())
          .filter((code) => /^[A-Z]{4}\d{3}[A-Z]?$/.test(code)),
      )).slice(0, 3);

      preview.set(spec.id, codes.length > 0 ? codes.join(", ") : "Track requirements");
    });

    return preview;
  }, [selectedProgramAudit]);

  const setProgramSpecialization = (programIndex: number, nextSpecId: string | null) => {
    const currentSpecId = selectedSpecialization.get(programIndex) ?? null;
    if (currentSpecId === nextSpecId) return;
    if (!confirmDiscardEditorDraft()) return;
    resetDraftEditorForce();

    setSelectedSpecialization((prev) => {
      const next = new Map(prev);
      if (nextSpecId) {
        next.set(programIndex, nextSpecId);
      } else {
        next.delete(programIndex);
      }
      return next;
    });

    const bundle = programAudits[programIndex]?.bundle;
    if (bundle?.source === "cs-specialized") {
      void saveCsSpecializationPreference(nextSpecId);
    }
  };

  const earnedOrInFlightCredits = Math.min(
    summary.requiredCredits,
    summary.completedCredits + summary.inProgressCredits + summary.plannedCredits,
  );
  const remainingCredits = Math.max(0, summary.requiredCredits - earnedOrInFlightCredits);
  const requiredCreditsSafe = Math.max(1, summary.requiredCredits);
  const completedForBar = Math.min(summary.completedCredits, summary.requiredCredits);
  const inProgressForBar = Math.min(summary.inProgressCredits, Math.max(0, summary.requiredCredits - completedForBar));
  const plannedForBar = Math.min(summary.plannedCredits, Math.max(0, summary.requiredCredits - completedForBar - inProgressForBar));
  const remainingForBar = Math.max(0, summary.requiredCredits - completedForBar - inProgressForBar - plannedForBar);

  const completedPct = (completedForBar / requiredCreditsSafe) * 100;
  const inProgressPct = (inProgressForBar / requiredCreditsSafe) * 100;
  const plannedPct = (plannedForBar / requiredCreditsSafe) * 100;
  const remainingPct = (remainingForBar / requiredCreditsSafe) * 100;

  useEffect(() => {
    const fills = Array.from(document.querySelectorAll<HTMLElement>(".da2-page .da2-ps-prog-fill, .da2-page .da2-credit-segment"));
    if (fills.length === 0) return;

    fills.forEach((el) => {
      el.style.width = "0%";
    });

    const timer = window.setTimeout(() => {
      fills.forEach((el) => {
        const raw = Number(el.dataset.pct ?? "0");
        const pct = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
        el.style.width = `${pct}%`;
      });
    }, 30);

    return () => window.clearTimeout(timer);
  }, [programAudits, completedPct, inProgressPct, plannedPct, remainingPct]);

  return (
    <div className="degree-audit-page da2-page">
      <div className="da2-main">
        <div className="da2-topbar">
          <div className="da2-topbar-lead">
            <h1>Degree Audit</h1>
            <p>
              Live audit powered by selected major/minor requirements and your MAIN schedules.
            </p>
          </div>
          <div className="da2-topbar-actions no-print">
            <Button
              type="button"
              variant="outline"
              className="da2-topbar-link-btn"
              onClick={openEditProgramsModal}
            >
              Edit Programs
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="da2-topbar-icon-btn"
                  aria-label="Audit actions"
                  title="Audit actions"
                  data-tour-target="degree-audit-actions"
                >
                  <Menu className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={(event) => { event.preventDefault(); handlePrintDegreeAudit(); }}>
                  <Printer className="w-4 h-4 mr-2" />
                  Print / PDF
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={(event) => { event.preventDefault(); handleEmailDegreeAudit(); }}>
                  <Mail className="w-4 h-4 mr-2" />
                  Email
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={(event) => { event.preventDefault(); handleTextDegreeAudit(); }}>
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Text
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="da2-content">
          <section className="da2-left-panel">
            {loading && <p className="text-muted-foreground">Running degree audit...</p>}
            {!loading && errorMessage && <p className="text-red-400">{errorMessage}</p>}

            {!loading && !errorMessage && (
              <>
                <Card className="da2-summary-card mb-6" data-tour-target="degree-audit-summary">
                  <div className="da2-summary-grid">
                    <div className="da2-summary-item">
                      <p className="da2-summary-label">Total Credits</p>
                      <p className="da2-summary-value da2-summary-value-red">{summary.totalCredits}</p>
                      <p className="da2-summary-sub">of {summary.requiredCredits} required</p>
                    </div>
                    <div className="da2-summary-item">
                      <p className="da2-summary-label">Completed</p>
                      <p className="da2-summary-value">{summary.completedCredits}</p>
                      <p className="da2-summary-sub">credits</p>
                    </div>
                    <div className="da2-summary-item">
                      <p className="da2-summary-label">In Progress</p>
                      <p className="da2-summary-value da2-summary-value-gold">{summary.inProgressCredits}</p>
                      <p className="da2-summary-sub">this term</p>
                    </div>
                    <div className="da2-summary-item">
                      <p className="da2-summary-label">Planned</p>
                      <p className="da2-summary-value da2-summary-value-slate">{summary.plannedCredits}</p>
                      <p className="da2-summary-sub">next terms</p>
                    </div>
                    <div className="da2-summary-item da2-summary-item-last">
                      <p className="da2-summary-label">Overall GPA</p>
                      <p className="da2-summary-value da2-summary-value-gold">{summary.overallGPA?.toFixed(3) ?? "-"}</p>
                      <p className="da2-summary-sub">cumulative</p>
                    </div>
                  </div>
                </Card>

                <div className="da2-credit-overview mb-6">
                  <div className="da2-credit-header">
                    <p className="da2-credit-title">Credit Progress</p>
                    <p className="da2-credit-detail">
                      {summary.completedCredits} complete · {summary.inProgressCredits} in progress · {summary.plannedCredits} planned · {remainingCredits} remaining
                    </p>
                  </div>
                  <div className="da2-credit-progress" role="presentation" aria-label="Credit progress">
                    <div className="da2-credit-segment da2-credit-segment-completed" data-pct={completedPct} />
                    <div className="da2-credit-segment da2-credit-segment-in-progress" data-pct={inProgressPct} />
                    <div className="da2-credit-segment da2-credit-segment-planned" data-pct={plannedPct} />
                    <div className="da2-credit-segment da2-credit-segment-remaining" data-pct={remainingPct} />
                  </div>
                  <div className="da2-credit-legend">
                    <span><i className="da2-legend-dot da2-legend-completed" />Completed</span>
                    <span><i className="da2-legend-dot da2-legend-in-progress" />In Progress</span>
                    <span><i className="da2-legend-dot da2-legend-planned" />Planned</span>
                    <span><i className="da2-legend-dot da2-legend-remaining" />Remaining</span>
                  </div>
                </div>

            {programAudits.length > 0 && (
                <div data-tour-target="degree-audit-programs" className="space-y-3 mb-6">
                  {programAudits
                    .filter((_, index) => index === selectedProgramIndex)
                    .map((programAudit) => {
                    const index = selectedProgramIndex;
                    const hasPriorMajor = programAudits
                      .slice(0, index)
                      .some((audit) => audit.bundle.kind === "major");
                    const printBreakClass = programAudit.bundle.kind === "major" && hasPriorMajor
                      ? "print-break-before"
                      : "";

                    return (
                    <div key={`${programAudit.bundle.programId}-${index}`} className="degree-audit-program-slide">
                      <Card className={`degree-audit-program-card da2-program-shell bg-card border-border p-5 ${printBreakClass}`}>
                        <div className="da2-program-header da2-ps-header">
                          <span className={`da2-ps-type ${programAudit.bundle.kind === "minor" ? "minor" : "major"}`}>
                            {programAudit.bundle.kind}
                          </span>
                          <h2 className="da2-program-title da2-ps-name text-2xl">{programAudit.bundle.programName}</h2>
                          <p className="da2-ps-progress">
                            <strong>{Math.min(programAudit.requiredSlots, programAudit.completedSlots + programAudit.inProgressSlots + programAudit.plannedSlots)} / {programAudit.requiredSlots}</strong> required classes
                          </p>
                          <ChevronDown className="da2-ps-toggle h-5 w-5 rotate-180" aria-hidden="true" />
                        </div>
                        <div className="da2-ps-prog-bar mb-5" role="presentation">
                          <div
                            className={`da2-ps-prog-fill ${programAudit.bundle.kind === "minor" ? "minor-fill" : ""}`}
                            data-pct={programAudit.progressPercent}
                          />
                        </div>

                        <div className="da2-req-blocks">
                          {(() => {
                            // Get selected specialization for this program
                            const selectedSpecId = selectedSpecialization.get(index);
                            const selectedSpec = programAudit.bundle.specializationOptions?.find(
                              (spec) => spec.id === selectedSpecId
                            );

                            // Separate base and specialization sections
                            const baseSections = programAudit.sectionRows.filter(
                              ({ section }) => !section.specializationId
                            );
                            const specializationSections = programAudit.sectionRows.filter(
                              ({ section }) => section.specializationId && section.specializationId === selectedSpecId
                            );

                            return (
                              <>
                                {/* Base requirements */}
                                {baseSections.map(({ section, eval: sectionEval, wildcardSlots }) => {
                                  const editingThisSection = editingProgramIndex === index && editingSectionId === section.id && sectionDraft;
                                  if (editingThisSection) {
                                    return (
                                      <Card key={section.id} ref={editorCardRef} className="bg-card border-2 border-border p-5 shadow-xl shadow-black/10 ring-1 ring-red-500/20">
                                        <div className="flex items-center justify-between gap-2 mb-3">
                                          <h4 className="text-foreground">Edit Section</h4>
                                          <Button type="button" size="sm" variant="ghost" onClick={resetDraftEditor}>
                                            <X className="h-4 w-4" />
                                          </Button>
                                        </div>

                                        <p className="text-xs font-medium text-muted-foreground mb-2">Title:  Section Type:  Section type count (if choose):</p>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                                          <Input
                                            value={sectionDraft.title}
                                            onChange={(event) => setSectionDraft((prev) => prev ? { ...prev, title: event.target.value } : prev)}
                                            placeholder="Title: section name"
                                            className="border-2 border-border bg-input-background shadow-sm focus-visible:border-red-500/50 focus-visible:ring-red-500/25"
                                          />
                                          <select
                                            className="h-9 rounded-md border-2 border-border bg-input-background px-3 text-sm shadow-sm outline-none focus-visible:border-red-500/50 focus-visible:ring-2 focus-visible:ring-red-500/25"
                                            value={sectionDraft.requirementType}
                                            onChange={(event) => setSectionDraft((prev) => prev ? {
                                              ...prev,
                                              requirementType: event.target.value === "choose" ? "choose" : "all",
                                            } : prev)}
                                            aria-label="Section requirement type"
                                            title="Section requirement type"
                                          >
                                            <option value="all">All Required</option>
                                            <option value="choose">Choose N</option>
                                          </select>
                                          <Input
                                            type="number"
                                            min={1}
                                            value={sectionDraft.chooseCount ?? 1}
                                            onChange={(event) => setSectionDraft((prev) => prev ? { ...prev, chooseCount: Number(event.target.value) || 1 } : prev)}
                                            placeholder="Section type count"
                                            disabled={sectionDraft.requirementType !== "choose"}
                                            className="border-2 border-border bg-input-background shadow-sm focus-visible:border-red-500/50 focus-visible:ring-red-500/25"
                                          />
                                        </div>

                                        <Textarea
                                          value={sectionDraft.notesText}
                                          onChange={(event) => setSectionDraft((prev) => prev ? { ...prev, notesText: event.target.value } : prev)}
                                          placeholder="Notes: one per line"
                                          className="mb-3 border-2 border-border bg-input-background shadow-sm focus-visible:border-red-500/50 focus-visible:ring-red-500/25"
                                        />

                                        <p className="text-xs font-medium text-muted-foreground mb-2">Classes Included:</p>
                                        <div
                                          className="mb-2 rounded-md border border-dashed border-border p-2"
                                          onDragOver={(event) => {
                                            event.preventDefault();
                                            maybeAutoScrollDuringDrag(event.clientY);
                                          }}
                                          onDrop={(event) => {
                                            event.preventDefault();
                                            const raw = event.dataTransfer.getData("text/plain");
                                            if (!raw || raw.startsWith("BLOCK::") || raw.startsWith("SECTION::")) return;
                                            const [sourceBlockId, code] = raw.split("::");
                                            if (!sourceBlockId || !code) return;
                                            moveCodeFromBlockToSection(sourceBlockId, code);
                                            setDragOverBlockId(null);
                                            setBlockDropHint(null);
                                            setCodeDropHint(null);
                                          }}
                                        >
                                          <p className="mb-1 text-[11px] text-muted-foreground">In Section (outside blocks)</p>
                                          <div className="flex flex-wrap gap-2">
                                            {(sectionDraft.sectionCodes ?? []).map((sectionCode) => (
                                              <Badge
                                                key={`section-level-${sectionCode}`}
                                                variant="outline"
                                                className="border-border text-foreground/80 cursor-move"
                                                draggable
                                                onDragStart={(event) => {
                                                  event.dataTransfer.effectAllowed = "move";
                                                  event.dataTransfer.setData("text/plain", `SECTION::${sectionCode}`);
                                                }}
                                              >
                                                {sectionCode}
                                                <button
                                                  type="button"
                                                  className="ml-2"
                                                  onMouseDown={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                  }}
                                                  onClick={() => setSectionDraft((prev) => prev ? {
                                                    ...prev,
                                                    sectionCodes: (prev.sectionCodes ?? []).filter((value) => value !== sectionCode),
                                                  } : prev)}
                                                >
                                                  x
                                                </button>
                                              </Badge>
                                            ))}
                                            {(sectionDraft.sectionCodes ?? []).length === 0 && (
                                              <span className="text-xs text-muted-foreground">Drop class chips here to keep them in the section (not inside a block).</span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="space-y-2 mb-3">
                                          {flattenDraftBlocks(sectionDraft.blocks).map(({ block, depth }) => (
                                            <div
                                              key={block.id}
                                              className={`relative p-3 border rounded-md transition-[box-shadow,background-color,border-color] duration-150 ${activeDraftBlockId === block.id ? "border-red-600/40" : "border-border"} ${dragOverBlockId === block.id && blockDropHint?.blockId === block.id && blockDropHint.position === "inside" ? "ring-2 ring-red-500/35 bg-red-500/5 shadow-[0_0_0_3px_rgba(239,68,68,0.14)]" : ""} ${getDepthIndentClass(depth)}`}
                                              onDragOver={(event) => {
                                                event.preventDefault();
                                                maybeAutoScrollDuringDrag(event.clientY);
                                                const position = getDropPositionForBlock(event.clientY, event.currentTarget);
                                                setDragOverBlockId(block.id);
                                                setBlockDropHint({ blockId: block.id, position });
                                              }}
                                              onDragLeave={() => {
                                                setDragOverBlockId((current) => current === block.id ? null : current);
                                                setBlockDropHint((current) => current?.blockId === block.id ? null : current);
                                              }}
                                              onDragEnd={() => {
                                                setDragOverBlockId(null);
                                                setBlockDropHint(null);
                                                setCodeDropHint(null);
                                              }}
                                              onDrop={(event) => {
                                                event.preventDefault();
                                                const position = getDropPositionForBlock(event.clientY, event.currentTarget);
                                                handleDropIntoBlock(event.dataTransfer.getData("text/plain"), block.id, position);
                                              }}
                                            >
                                              {blockDropHint?.blockId === block.id && blockDropHint.position === "before" && (
                                                <div className="pointer-events-none absolute -top-1 left-3 right-3 h-0.5 rounded bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.55)]" />
                                              )}
                                              {blockDropHint?.blockId === block.id && blockDropHint.position === "after" && (
                                                <div className="pointer-events-none absolute -bottom-1 left-3 right-3 h-0.5 rounded bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.55)]" />
                                              )}
                                              <button
                                                type="button"
                                                aria-label="Drag block"
                                                draggable
                                                onDragStart={(event) => startBlockDrag(event, block.id)}
                                                className="absolute left-0 top-1 bottom-1 w-2 rounded-l-md bg-red-500/20 hover:bg-red-500/35 cursor-grab active:cursor-grabbing"
                                              />
                                              <div className="flex items-center gap-2 mb-2">
                                                <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                                  <GripVertical className="h-3 w-3" />
                                                  Drag Block
                                                </span>
                                                <select
                                                  className="h-8 rounded-md border border-input bg-input-background px-2 text-xs"
                                                  value={block.type}
                                                  onChange={(event) => setSectionDraft((prev) => prev ? {
                                                    ...prev,
                                                    blocks: mapBlocksRecursively(prev.blocks, (item) => item.id === block.id ? {
                                                      ...item,
                                                      type: event.target.value === "OR" ? "OR" : "AND",
                                                    } : item),
                                                  } : prev)}
                                                  aria-label="Logic group type"
                                                  title="Logic group type"
                                                >
                                                  <option value="AND">AND</option>
                                                  <option value="OR">OR</option>
                                                </select>
                                                <Button type="button" size="sm" variant="outline" onClick={() => setActiveDraftBlockId(block.id)}>Classes Included</Button>
                                                <Input
                                                  value={block.title ?? ""}
                                                  onChange={(event) => setSectionDraft((prev) => prev ? {
                                                    ...prev,
                                                    blocks: mapBlocksRecursively(prev.blocks, (item) => item.id === block.id
                                                      ? { ...item, title: event.target.value }
                                                      : item),
                                                  } : prev)}
                                                  placeholder="Optional group title"
                                                  className="h-8 border-2 border-border bg-input-background text-xs shadow-sm focus-visible:border-red-500/50 focus-visible:ring-red-500/25"
                                                />
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={() => deleteBlockById(block.id)}
                                                >
                                                  Remove
                                                </Button>
                                              </div>
                                              {dragOverBlockId === block.id && (
                                                <p className="text-[11px] text-red-400 mb-2">
                                                  {blockDropHint?.blockId === block.id && blockDropHint.position === "before" && "Drop to move above this block (outside the block)."}
                                                  {blockDropHint?.blockId === block.id && blockDropHint.position === "after" && "Drop to move below this block (outside the block)."}
                                                  {(!blockDropHint || blockDropHint.blockId !== block.id || blockDropHint.position === "inside") && "Drop to nest inside this block."}
                                                </p>
                                              )}
                                              <div
                                                className="flex flex-wrap gap-2"
                                                onDragOver={(event) => {
                                                  event.preventDefault();
                                                  maybeAutoScrollDuringDrag(event.clientY);
                                                }}
                                                onDrop={(event) => {
                                                  event.preventDefault();
                                                  const position = getDropPositionForBlock(event.clientY, event.currentTarget);
                                                  handleDropIntoBlock(event.dataTransfer.getData("text/plain"), block.id, position);
                                                }}
                                              >
                                                {block.codes.map((badgeCode, badgeIndex) => (
                                                  <Badge
                                                    key={`${block.id}-${badgeCode}`}
                                                    variant="outline"
                                                    className={`border-border text-foreground/80 cursor-move transition-[box-shadow,background-color] duration-150 ${codeDropHint?.blockId === block.id && codeDropHint.index === badgeIndex ? "bg-red-500/10 shadow-[0_0_0_2px_rgba(239,68,68,0.35)]" : ""}`}
                                                    draggable
                                                    onDragStart={(event) => {
                                                      event.dataTransfer.effectAllowed = "move";
                                                      event.dataTransfer.setData("text/plain", `${block.id}::${badgeCode}`);
                                                      setCodeDropHint(null);
                                                    }}
                                                    onDragOver={(event) => {
                                                      event.preventDefault();
                                                      maybeAutoScrollDuringDrag(event.clientY);
                                                      setCodeDropHint({ blockId: block.id, index: badgeIndex });
                                                    }}
                                                    onDragLeave={() => {
                                                      setCodeDropHint((current) => current?.blockId === block.id && current.index === badgeIndex ? null : current);
                                                    }}
                                                    onDrop={(event) => {
                                                      event.preventDefault();
                                                      const raw = event.dataTransfer.getData("text/plain");
                                                      if (raw.startsWith("BLOCK::")) return;
                                                      const [sourceBlockId, draggedCode] = raw.split("::");
                                                      if (!sourceBlockId || !draggedCode) return;
                                                      moveCodeToBlockPosition(sourceBlockId, draggedCode, block.id, badgeIndex);
                                                      setDragOverBlockId(null);
                                                      setBlockDropHint(null);
                                                      setCodeDropHint(null);
                                                    }}
                                                  >
                                                    {badgeCode}
                                                    <button
                                                      type="button"
                                                      className="ml-2"
                                                      onMouseDown={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                      }}
                                                      onClick={() => setSectionDraft((prev) => prev ? {
                                                        ...prev,
                                                        blocks: mapBlocksRecursively(prev.blocks, (item) => item.id === block.id
                                                          ? { ...item, codes: item.codes.filter((value) => value !== badgeCode) }
                                                          : item),
                                                      } : prev)}
                                                    >
                                                      x
                                                    </button>
                                                  </Badge>
                                                ))}
                                                {block.codes.length === 0 && <span className="text-xs text-muted-foreground">Classes included: none yet.</span>}
                                              </div>
                                            </div>
                                          ))}
                                        </div>

                                        <div className="flex flex-wrap gap-2 mb-3">
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              const blockId = createLocalId("block");
                                              setSectionDraft((prev) => prev ? {
                                                ...prev,
                                                blocks: [...prev.blocks, { id: blockId, type: "AND", codes: [] }],
                                              } : prev);
                                              setActiveDraftBlockId(blockId);
                                            }}
                                          >
                                            <Plus className="h-3.5 w-3.5 mr-1" /> Add Required Group (AND)
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              const blockId = createLocalId("block");
                                              setSectionDraft((prev) => prev ? {
                                                ...prev,
                                                blocks: [...prev.blocks, { id: blockId, type: "OR", codes: [] }],
                                              } : prev);
                                              setActiveDraftBlockId(blockId);
                                            }}
                                          >
                                            <Plus className="h-3.5 w-3.5 mr-1" /> Add Option Group (OR)
                                          </Button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-3" data-audit-search-area="true">
                                          <Input
                                            value={courseSearchQuery}
                                            onChange={(event) => setCourseSearchQuery(event.target.value)}
                                            placeholder="Search courses (e.g. BSCI330 or genetics)"
                                            className="border-2 border-border bg-input-background shadow-sm focus-visible:border-red-500/50 focus-visible:ring-red-500/25"
                                          />
                                          <Button type="button" onClick={runCourseSearch} disabled={courseSearchPending} data-audit-search-btn="true">
                                            {courseSearchPending ? "Searching..." : "Search"}
                                          </Button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-3">
                                          <Input
                                            value={wildcardTokenInput}
                                            onChange={(event) => setWildcardTokenInput(event.target.value)}
                                            placeholder="Insert wildcard token (e.g. BSCI3XX, CMSC/MATHXXX)"
                                            className="border-2 border-border bg-input-background shadow-sm focus-visible:border-red-500/50 focus-visible:ring-red-500/25"
                                          />
                                          <Button type="button" variant="outline" onClick={addWildcardTokenToActiveBlock} disabled={!activeDraftBlockId}>
                                            Add Wildcard
                                          </Button>
                                        </div>

                                        {courseSearchMessage && <p className="text-xs text-muted-foreground mb-2">{courseSearchMessage}</p>}
                                        {courseSearchResults.length > 0 && (
                                          <div className="max-h-40 overflow-y-auto border border-border rounded-md p-2 space-y-1 mb-3">
                                            {courseSearchResults.map((course) => (
                                              <div key={`${course.code}-${course.title}`} className="flex items-center justify-between gap-2 p-1">
                                                <div>
                                                  <p className="text-sm text-foreground">{course.code}</p>
                                                  <p className="text-xs text-muted-foreground">{course.title}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={!activeDraftBlockId}
                                                    onClick={() => {
                                                      addCodeToActiveBlock(course.code);
                                                    }}
                                                  >
                                                    Add to Block
                                                  </Button>
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                      addCodeToSectionLevel(course.code);
                                                    }}
                                                  >
                                                    Add to Section
                                                  </Button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}

                                        <div className="flex gap-2 justify-end">
                                          <Button type="button" variant="outline" onClick={resetDraftEditor}>Cancel</Button>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            className="border-red-600/40 text-red-400"
                                            onClick={() => {
                                              const nextSections = programAudit.bundle.sections.filter((item) => item.id !== editingSectionId);
                                              persistProgramSections(programAudit.bundle.programId, nextSections);
                                              resetDraftEditorForce();
                                            }}
                                          >
                                            Delete Section
                                          </Button>
                                          <Button
                                            type="button"
                                            className="bg-red-600 hover:bg-red-700"
                                            data-audit-save-btn="true"
                                            onClick={() => {
                                              if (!sectionDraft) return;
                                              const updatedSection = sectionFromDraft(sectionDraft, editingSectionId ?? undefined);
                                              const nextSections = programAudit.bundle.sections.map((item) => item.id === editingSectionId ? {
                                                ...updatedSection,
                                                specializationId: item.specializationId,
                                              } : item);
                                              persistProgramSections(programAudit.bundle.programId, nextSections);
                                              resetDraftEditorForce();
                                            }}
                                          >
                                            <Save className="h-3.5 w-3.5 mr-1" /> Save Section
                                          </Button>
                                        </div>
                                      </Card>
                                    );
                                  }

                                  return (
                                    <div id={`audit-section-${index}-${section.id}`} key={section.id} className="da2-section-anchor">
                                      <RequirementSectionTableCard
                                        section={section}
                                        sectionEval={sectionEval}
                                        wildcardSlots={wildcardSlots}
                                        onSelectWildcardCourse={handleWildcardSelection}
                                        allCourses={courses}
                                        courseDetails={courseDetails}
                                        byCourseCode={byCourseCode}
                                        expandedSectionIds={expandedSectionIds}
                                        setExpandedSectionIds={setExpandedSectionIds}
                                        expandedNotesSectionIds={expandedNotesSectionIds}
                                        setExpandedNotesSectionIds={setExpandedNotesSectionIds}
                                        condensedView={condensedAuditView}
                                        onEdit={() => startEditingSection(index, section)}
                                        onSaveSection={(nextSection) => {
                                          const nextSections = programAudit.bundle.sections.map((item) => item.id === section.id ? {
                                            ...nextSection,
                                            specializationId: item.specializationId,
                                          } : item);
                                          persistProgramSections(programAudit.bundle.programId, nextSections);
                                        }}
                                      />
                                    </div>
                                  );
                                })}

                                {editingProgramIndex === index && sectionDraft && editingSectionId === null && (
                                  <Card ref={editorCardRef} className="bg-card border-2 border-border p-5 shadow-xl shadow-black/10 ring-1 ring-red-500/20">
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                      <h4 className="text-foreground">Add Section</h4>
                                      <Button type="button" size="sm" variant="ghost" onClick={resetDraftEditor}>
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>

                                    <p className="text-xs font-medium text-muted-foreground mb-2">Title:  Section Type:  Section type count (if choose):</p>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                                      <Input
                                        value={sectionDraft.title}
                                        onChange={(event) => setSectionDraft((prev) => prev ? { ...prev, title: event.target.value } : prev)}
                                        placeholder="Title: section name"
                                        className="border-2 border-border bg-input-background shadow-sm focus-visible:border-red-500/50 focus-visible:ring-red-500/25"
                                      />
                                      <select
                                        className="h-9 rounded-md border-2 border-border bg-input-background px-3 text-sm shadow-sm outline-none focus-visible:border-red-500/50 focus-visible:ring-2 focus-visible:ring-red-500/25"
                                        value={sectionDraft.requirementType}
                                        onChange={(event) => setSectionDraft((prev) => prev ? {
                                          ...prev,
                                          requirementType: event.target.value === "choose" ? "choose" : "all",
                                        } : prev)}
                                        aria-label="Section requirement type"
                                        title="Section requirement type"
                                      >
                                        <option value="all">All Required</option>
                                        <option value="choose">Choose N</option>
                                      </select>
                                      <Input
                                        type="number"
                                        min={1}
                                        value={sectionDraft.chooseCount ?? 1}
                                        onChange={(event) => setSectionDraft((prev) => prev ? { ...prev, chooseCount: Number(event.target.value) || 1 } : prev)}
                                        placeholder="Section type count"
                                        disabled={sectionDraft.requirementType !== "choose"}
                                        className="border-2 border-border bg-input-background shadow-sm focus-visible:border-red-500/50 focus-visible:ring-red-500/25"
                                      />
                                    </div>

                                    <Textarea
                                      value={sectionDraft.notesText}
                                      onChange={(event) => setSectionDraft((prev) => prev ? { ...prev, notesText: event.target.value } : prev)}
                                      placeholder="Notes: one per line"
                                      className="mb-3 border-2 border-border bg-input-background shadow-sm focus-visible:border-red-500/50 focus-visible:ring-red-500/25"
                                    />

                                    <p className="text-xs font-medium text-muted-foreground mb-2">Classes Included:</p>
                                    <div
                                      className="mb-2 rounded-md border border-dashed border-border p-2"
                                      onDragOver={(event) => {
                                        event.preventDefault();
                                        maybeAutoScrollDuringDrag(event.clientY);
                                      }}
                                      onDrop={(event) => {
                                        event.preventDefault();
                                        const raw = event.dataTransfer.getData("text/plain");
                                        if (!raw || raw.startsWith("BLOCK::") || raw.startsWith("SECTION::")) return;
                                        const [sourceBlockId, code] = raw.split("::");
                                        if (!sourceBlockId || !code) return;
                                        moveCodeFromBlockToSection(sourceBlockId, code);
                                        setDragOverBlockId(null);
                                        setBlockDropHint(null);
                                        setCodeDropHint(null);
                                      }}
                                    >
                                      <p className="mb-1 text-[11px] text-muted-foreground">In Section (outside blocks)</p>
                                      <div className="flex flex-wrap gap-2">
                                        {(sectionDraft.sectionCodes ?? []).map((sectionCode) => (
                                          <Badge
                                            key={`section-level-${sectionCode}`}
                                            variant="outline"
                                            className="border-border text-foreground/80 cursor-move"
                                            draggable
                                            onDragStart={(event) => {
                                              event.dataTransfer.effectAllowed = "move";
                                              event.dataTransfer.setData("text/plain", `SECTION::${sectionCode}`);
                                            }}
                                          >
                                            {sectionCode}
                                            <button
                                              type="button"
                                              className="ml-2"
                                              onMouseDown={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                              }}
                                              onClick={() => setSectionDraft((prev) => prev ? {
                                                ...prev,
                                                sectionCodes: (prev.sectionCodes ?? []).filter((value) => value !== sectionCode),
                                              } : prev)}
                                            >
                                              x
                                            </button>
                                          </Badge>
                                        ))}
                                        {(sectionDraft.sectionCodes ?? []).length === 0 && (
                                          <span className="text-xs text-muted-foreground">Drop class chips here to keep them in the section (not inside a block).</span>
                                        )}
                                      </div>
                                    </div>
                                        <div className="space-y-2 mb-3">
                                          {flattenDraftBlocks(sectionDraft.blocks).map(({ block, depth }) => (
                                            <div
                                              key={block.id}
                                              className={`relative p-3 border rounded-md transition-[box-shadow,background-color,border-color] duration-150 ${activeDraftBlockId === block.id ? "border-red-600/40" : "border-border"} ${dragOverBlockId === block.id && blockDropHint?.blockId === block.id && blockDropHint.position === "inside" ? "ring-2 ring-red-500/35 bg-red-500/5 shadow-[0_0_0_3px_rgba(239,68,68,0.14)]" : ""} ${getDepthIndentClass(depth)}`}
                                              onDragOver={(event) => {
                                                event.preventDefault();
                                                maybeAutoScrollDuringDrag(event.clientY);
                                                const position = getDropPositionForBlock(event.clientY, event.currentTarget);
                                                setDragOverBlockId(block.id);
                                                setBlockDropHint({ blockId: block.id, position });
                                              }}
                                              onDragLeave={() => {
                                                setDragOverBlockId((current) => current === block.id ? null : current);
                                                setBlockDropHint((current) => current?.blockId === block.id ? null : current);
                                              }}
                                              onDragEnd={() => {
                                                setDragOverBlockId(null);
                                                setBlockDropHint(null);
                                                setCodeDropHint(null);
                                              }}
                                              onDrop={(event) => {
                                                event.preventDefault();
                                                const position = getDropPositionForBlock(event.clientY, event.currentTarget);
                                                handleDropIntoBlock(event.dataTransfer.getData("text/plain"), block.id, position);
                                              }}
                                            >
                                          {blockDropHint?.blockId === block.id && blockDropHint.position === "before" && (
                                            <div className="pointer-events-none absolute -top-1 left-3 right-3 h-0.5 rounded bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.55)]" />
                                          )}
                                          {blockDropHint?.blockId === block.id && blockDropHint.position === "after" && (
                                            <div className="pointer-events-none absolute -bottom-1 left-3 right-3 h-0.5 rounded bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.55)]" />
                                          )}
                                          <button
                                            type="button"
                                            aria-label="Drag block"
                                            draggable
                                            onDragStart={(event) => startBlockDrag(event, block.id)}
                                            className="absolute left-0 top-1 bottom-1 w-2 rounded-l-md bg-red-500/20 hover:bg-red-500/35 cursor-grab active:cursor-grabbing"
                                          />
                                          <div className="flex items-center gap-2 mb-2">
                                                <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                                  <GripVertical className="h-3 w-3" />
                                                  Drag Block
                                                </span>
                                            <select
                                              className="h-8 rounded-md border border-input bg-input-background px-2 text-xs"
                                              value={block.type}
                                              onChange={(event) => setSectionDraft((prev) => prev ? {
                                                ...prev,
                                                blocks: mapBlocksRecursively(prev.blocks, (item) => item.id === block.id ? {
                                                  ...item,
                                                  type: event.target.value === "OR" ? "OR" : "AND",
                                                } : item),
                                              } : prev)}
                                              aria-label="Logic group type"
                                              title="Logic group type"
                                            >
                                              <option value="AND">AND</option>
                                              <option value="OR">OR</option>
                                            </select>
                                            <Button type="button" size="sm" variant="outline" onClick={() => setActiveDraftBlockId(block.id)}>Classes Included</Button>
                                            <Input
                                              value={block.title ?? ""}
                                              onChange={(event) => setSectionDraft((prev) => prev ? {
                                                ...prev,
                                                blocks: mapBlocksRecursively(prev.blocks, (item) => item.id === block.id
                                                  ? { ...item, title: event.target.value }
                                                  : item),
                                              } : prev)}
                                              placeholder="Optional group title"
                                              className="h-8 text-xs"
                                            />
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => deleteBlockById(block.id)}
                                            >
                                              Remove
                                            </Button>
                                          </div>
                                          {dragOverBlockId === block.id && (
                                            <p className="text-[11px] text-red-400 mb-2">
                                              {blockDropHint?.blockId === block.id && blockDropHint.position === "before" && "Drop to move above this block (outside the block)."}
                                              {blockDropHint?.blockId === block.id && blockDropHint.position === "after" && "Drop to move below this block (outside the block)."}
                                              {(!blockDropHint || blockDropHint.blockId !== block.id || blockDropHint.position === "inside") && "Drop to nest inside this block."}
                                            </p>
                                          )}
                                          <div
                                            className="flex flex-wrap gap-2"
                                            onDragOver={(event) => {
                                              event.preventDefault();
                                              maybeAutoScrollDuringDrag(event.clientY);
                                            }}
                                            onDrop={(event) => {
                                              event.preventDefault();
                                              const position = getDropPositionForBlock(event.clientY, event.currentTarget);
                                              handleDropIntoBlock(event.dataTransfer.getData("text/plain"), block.id, position);
                                            }}
                                          >
                                            {block.codes.map((badgeCode, badgeIndex) => (
                                              <Badge
                                                key={`${block.id}-${badgeCode}`}
                                                variant="outline"
                                                className={`border-border text-foreground/80 cursor-move transition-[box-shadow,background-color] duration-150 ${codeDropHint?.blockId === block.id && codeDropHint.index === badgeIndex ? "bg-red-500/10 shadow-[0_0_0_2px_rgba(239,68,68,0.35)]" : ""}`}
                                                draggable
                                                onDragStart={(event) => {
                                                  event.dataTransfer.effectAllowed = "move";
                                                  event.dataTransfer.setData("text/plain", `${block.id}::${badgeCode}`);
                                                  setCodeDropHint(null);
                                                }}
                                                onDragOver={(event) => {
                                                  event.preventDefault();
                                                  maybeAutoScrollDuringDrag(event.clientY);
                                                  setCodeDropHint({ blockId: block.id, index: badgeIndex });
                                                }}
                                                onDragLeave={() => {
                                                  setCodeDropHint((current) => current?.blockId === block.id && current.index === badgeIndex ? null : current);
                                                }}
                                                onDrop={(event) => {
                                                  event.preventDefault();
                                                  const raw = event.dataTransfer.getData("text/plain");
                                                  if (raw.startsWith("BLOCK::")) return;
                                                  const [sourceBlockId, draggedCode] = raw.split("::");
                                                  if (!sourceBlockId || !draggedCode) return;
                                                  moveCodeToBlockPosition(sourceBlockId, draggedCode, block.id, badgeIndex);
                                                  setDragOverBlockId(null);
                                                  setBlockDropHint(null);
                                                  setCodeDropHint(null);
                                                }}
                                              >
                                                {badgeCode}
                                                <button
                                                  type="button"
                                                  className="ml-2"
                                                  onMouseDown={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                  }}
                                                  onClick={() => setSectionDraft((prev) => prev ? {
                                                    ...prev,
                                                    blocks: mapBlocksRecursively(prev.blocks, (item) => item.id === block.id
                                                      ? { ...item, codes: item.codes.filter((value) => value !== badgeCode) }
                                                      : item),
                                                  } : prev)}
                                                >
                                                  x
                                                </button>
                                              </Badge>
                                            ))}
                                            {block.codes.length === 0 && <span className="text-xs text-muted-foreground">Classes included: none yet.</span>}
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    <div className="flex flex-wrap gap-2 mb-3">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          const blockId = createLocalId("block");
                                          setSectionDraft((prev) => prev ? {
                                            ...prev,
                                            blocks: [...prev.blocks, { id: blockId, type: "AND", codes: [] }],
                                          } : prev);
                                          setActiveDraftBlockId(blockId);
                                        }}
                                      >
                                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Required Group (AND)
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          const blockId = createLocalId("block");
                                          setSectionDraft((prev) => prev ? {
                                            ...prev,
                                            blocks: [...prev.blocks, { id: blockId, type: "OR", codes: [] }],
                                          } : prev);
                                          setActiveDraftBlockId(blockId);
                                        }}
                                      >
                                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Option Group (OR)
                                      </Button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-3" data-audit-search-area="true">
                                      <Input
                                        value={courseSearchQuery}
                                        onChange={(event) => setCourseSearchQuery(event.target.value)}
                                        placeholder="Search courses (e.g. BSCI330 or genetics)"
                                      />
                                      <Button type="button" onClick={runCourseSearch} disabled={courseSearchPending} data-audit-search-btn="true">
                                        {courseSearchPending ? "Searching..." : "Search"}
                                      </Button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-3">
                                      <Input
                                        value={wildcardTokenInput}
                                        onChange={(event) => setWildcardTokenInput(event.target.value)}
                                        placeholder="Insert wildcard token (e.g. BSCI3XX, CMSC/MATHXXX)"
                                      />
                                      <Button type="button" variant="outline" onClick={addWildcardTokenToActiveBlock} disabled={!activeDraftBlockId}>
                                        Add Wildcard
                                      </Button>
                                    </div>

                                    {courseSearchMessage && <p className="text-xs text-muted-foreground mb-2">{courseSearchMessage}</p>}
                                    {courseSearchResults.length > 0 && (
                                      <div className="max-h-40 overflow-y-auto border border-border rounded-md p-2 space-y-1 mb-3">
                                        {courseSearchResults.map((course) => (
                                          <div key={`${course.code}-${course.title}`} className="flex items-center justify-between gap-2 p-1">
                                            <div>
                                              <p className="text-sm text-foreground">{course.code}</p>
                                              <p className="text-xs text-muted-foreground">{course.title}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                disabled={!activeDraftBlockId}
                                                onClick={() => {
                                                  addCodeToActiveBlock(course.code);
                                                }}
                                              >
                                                Add to Block
                                              </Button>
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                  addCodeToSectionLevel(course.code);
                                                }}
                                              >
                                                Add to Section
                                              </Button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    <div className="flex gap-2 justify-end">
                                      <Button type="button" variant="outline" onClick={resetDraftEditor}>Cancel</Button>
                                      <Button
                                        type="button"
                                        className="bg-red-600 hover:bg-red-700"
                                        data-audit-save-btn="true"
                                        onClick={() => {
                                          if (!sectionDraft) return;
                                          const updatedSection = sectionFromDraft(sectionDraft, editingSectionId ?? undefined);
                                          let nextSections = programAudit.bundle.sections;
                                          nextSections = [...nextSections, updatedSection];
                                          persistProgramSections(programAudit.bundle.programId, nextSections);
                                          resetDraftEditorForce();
                                        }}
                                      >
                                        <Save className="h-3.5 w-3.5 mr-1" /> Save Section
                                      </Button>
                                    </div>
                                  </Card>
                                )}

                                {programAudit.bundle.specializationOptions && programAudit.bundle.specializationOptions.length > 0 && !selectedSpecId && (
                                  <Card className="bg-input-background border-border p-3">
                                    <p className="text-sm text-muted-foreground">
                                      Select a specialization above to view track-specific requirements.
                                    </p>
                                  </Card>
                                )}

                                {/* Specialization-specific sections */}
                                {specializationSections.length > 0 && selectedSpec && (
                                  <div className="mt-6 pt-4 border-t border-border">
                                    <h3 className="text-lg text-foreground mb-3 font-semibold">
                                      Specialization Requirements: {selectedSpec.name}
                                    </h3>
                                    <div className="da2-req-blocks">
                                      {specializationSections.map(({ section, eval: sectionEval, wildcardSlots }) => {
                                        const editingThisSection = editingProgramIndex === index && editingSectionId === section.id && sectionDraft;
                                        if (editingThisSection) {
                                          return (
                                            <Card key={section.id} ref={editorCardRef} className="bg-input-background border-border p-4">
                                              <div className="flex items-center justify-between gap-2 mb-3">
                                                <h4 className="text-foreground">Edit Section</h4>
                                                <Button type="button" size="sm" variant="ghost" onClick={resetDraftEditor}>
                                                  <X className="h-4 w-4" />
                                                </Button>
                                              </div>

                                              <p className="text-xs font-medium text-muted-foreground mb-2">Title:  Section Type:  Section type count (if choose):</p>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                                                <Input
                                                  value={sectionDraft.title}
                                                  onChange={(event) => setSectionDraft((prev) => prev ? { ...prev, title: event.target.value } : prev)}
                                                  placeholder="Title: section name"
                                                />
                                                <select
                                                  className="h-9 rounded-md border border-input bg-input-background px-3 text-sm"
                                                  value={sectionDraft.requirementType}
                                                  onChange={(event) => setSectionDraft((prev) => prev ? {
                                                    ...prev,
                                                    requirementType: event.target.value === "choose" ? "choose" : "all",
                                                  } : prev)}
                                                  aria-label="Section requirement type"
                                                  title="Section requirement type"
                                                >
                                                  <option value="all">All Required</option>
                                                  <option value="choose">Choose N</option>
                                                </select>
                                                <Input
                                                  type="number"
                                                  min={1}
                                                  value={sectionDraft.chooseCount ?? 1}
                                                  onChange={(event) => setSectionDraft((prev) => prev ? { ...prev, chooseCount: Number(event.target.value) || 1 } : prev)}
                                                  placeholder="Section type count"
                                                  disabled={sectionDraft.requirementType !== "choose"}
                                                />
                                              </div>

                                              <Textarea
                                                value={sectionDraft.notesText}
                                                onChange={(event) => setSectionDraft((prev) => prev ? { ...prev, notesText: event.target.value } : prev)}
                                                placeholder="Notes: one per line"
                                                className="mb-3"
                                              />

                                              <p className="text-xs font-medium text-muted-foreground mb-2">Classes Included:</p>
                                              <div
                                                className="mb-2 rounded-md border border-dashed border-border p-2"
                                                onDragOver={(event) => {
                                                  event.preventDefault();
                                                  maybeAutoScrollDuringDrag(event.clientY);
                                                }}
                                                onDrop={(event) => {
                                                  event.preventDefault();
                                                  const raw = event.dataTransfer.getData("text/plain");
                                                  if (!raw || raw.startsWith("BLOCK::") || raw.startsWith("SECTION::")) return;
                                                  const [sourceBlockId, code] = raw.split("::");
                                                  if (!sourceBlockId || !code) return;
                                                  moveCodeFromBlockToSection(sourceBlockId, code);
                                                  setDragOverBlockId(null);
                                                  setBlockDropHint(null);
                                                  setCodeDropHint(null);
                                                }}
                                              >
                                                <p className="mb-1 text-[11px] text-muted-foreground">In Section (outside blocks)</p>
                                                <div className="flex flex-wrap gap-2">
                                                  {(sectionDraft.sectionCodes ?? []).map((sectionCode) => (
                                                    <Badge
                                                      key={`section-level-${sectionCode}`}
                                                      variant="outline"
                                                      className="border-border text-foreground/80 cursor-move"
                                                      draggable
                                                      onDragStart={(event) => {
                                                        event.dataTransfer.effectAllowed = "move";
                                                        event.dataTransfer.setData("text/plain", `SECTION::${sectionCode}`);
                                                      }}
                                                    >
                                                      {sectionCode}
                                                      <button
                                                        type="button"
                                                        className="ml-2"
                                                        onMouseDown={(event) => {
                                                          event.preventDefault();
                                                          event.stopPropagation();
                                                        }}
                                                        onClick={() => setSectionDraft((prev) => prev ? {
                                                          ...prev,
                                                          sectionCodes: (prev.sectionCodes ?? []).filter((value) => value !== sectionCode),
                                                        } : prev)}
                                                      >
                                                        x
                                                      </button>
                                                    </Badge>
                                                  ))}
                                                  {(sectionDraft.sectionCodes ?? []).length === 0 && (
                                                    <span className="text-xs text-muted-foreground">Drop class chips here to keep them in the section (not inside a block).</span>
                                                  )}
                                                </div>
                                              </div>
                                              <div className="space-y-2 mb-3">
                                                {flattenDraftBlocks(sectionDraft.blocks).map(({ block, depth }) => (
                                                  <div
                                                    key={block.id}
                                                    className={`relative p-3 border rounded-md transition-[box-shadow,background-color,border-color] duration-150 ${activeDraftBlockId === block.id ? "border-red-600/40" : "border-border"} ${dragOverBlockId === block.id && blockDropHint?.blockId === block.id && blockDropHint.position === "inside" ? "ring-2 ring-red-500/35 bg-red-500/5 shadow-[0_0_0_3px_rgba(239,68,68,0.14)]" : ""} ${getDepthIndentClass(depth)}`}
                                                    onDragOver={(event) => {
                                                      event.preventDefault();
                                                      maybeAutoScrollDuringDrag(event.clientY);
                                                      const position = getDropPositionForBlock(event.clientY, event.currentTarget);
                                                      setDragOverBlockId(block.id);
                                                      setBlockDropHint({ blockId: block.id, position });
                                                    }}
                                                    onDragLeave={() => {
                                                      setDragOverBlockId((current) => current === block.id ? null : current);
                                                      setBlockDropHint((current) => current?.blockId === block.id ? null : current);
                                                    }}
                                                    onDragEnd={() => {
                                                      setDragOverBlockId(null);
                                                      setBlockDropHint(null);
                                                      setCodeDropHint(null);
                                                    }}
                                                    onDrop={(event) => {
                                                      event.preventDefault();
                                                      const position = getDropPositionForBlock(event.clientY, event.currentTarget);
                                                      handleDropIntoBlock(event.dataTransfer.getData("text/plain"), block.id, position);
                                                    }}
                                                  >
                                                    {blockDropHint?.blockId === block.id && blockDropHint.position === "before" && (
                                                      <div className="pointer-events-none absolute -top-1 left-3 right-3 h-0.5 rounded bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.55)]" />
                                                    )}
                                                    {blockDropHint?.blockId === block.id && blockDropHint.position === "after" && (
                                                      <div className="pointer-events-none absolute -bottom-1 left-3 right-3 h-0.5 rounded bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.55)]" />
                                                    )}
                                                    <button
                                                      type="button"
                                                      aria-label="Drag block"
                                                      draggable
                                                      onDragStart={(event) => startBlockDrag(event, block.id)}
                                                      className="absolute left-0 top-1 bottom-1 w-2 rounded-l-md bg-red-500/20 hover:bg-red-500/35 cursor-grab active:cursor-grabbing"
                                                    />
                                                    <div className="flex items-center gap-2 mb-2">
                                                      <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                                        <GripVertical className="h-3 w-3" />
                                                        Drag Block
                                                      </span>
                                                      <select
                                                        className="h-8 rounded-md border border-input bg-input-background px-2 text-xs"
                                                        value={block.type}
                                                        onChange={(event) => setSectionDraft((prev) => prev ? {
                                                          ...prev,
                                                          blocks: mapBlocksRecursively(prev.blocks, (item) => item.id === block.id ? {
                                                            ...item,
                                                            type: event.target.value === "OR" ? "OR" : "AND",
                                                          } : item),
                                                        } : prev)}
                                                        aria-label="Logic group type"
                                                        title="Logic group type"
                                                      >
                                                        <option value="AND">AND</option>
                                                        <option value="OR">OR</option>
                                                      </select>
                                                      <Button type="button" size="sm" variant="outline" onClick={() => setActiveDraftBlockId(block.id)}>Classes Included</Button>
                                                      <Input
                                                        value={block.title ?? ""}
                                                        onChange={(event) => setSectionDraft((prev) => prev ? {
                                                          ...prev,
                                                          blocks: mapBlocksRecursively(prev.blocks, (item) => item.id === block.id
                                                            ? { ...item, title: event.target.value }
                                                            : item),
                                                        } : prev)}
                                                        placeholder="Optional group title"
                                                        className="h-8 text-xs"
                                                      />
                                                      <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => deleteBlockById(block.id)}
                                                      >
                                                        Remove
                                                      </Button>
                                                    </div>
                                                    {dragOverBlockId === block.id && (
                                                      <p className="text-[11px] text-red-400 mb-2">
                                                        {blockDropHint?.blockId === block.id && blockDropHint.position === "before" && "Drop to move above this block (outside the block)."}
                                                        {blockDropHint?.blockId === block.id && blockDropHint.position === "after" && "Drop to move below this block (outside the block)."}
                                                        {(!blockDropHint || blockDropHint.blockId !== block.id || blockDropHint.position === "inside") && "Drop to nest inside this block."}
                                                      </p>
                                                    )}
                                                    <div
                                                      className="flex flex-wrap gap-2"
                                                      onDragOver={(event) => {
                                                        event.preventDefault();
                                                        maybeAutoScrollDuringDrag(event.clientY);
                                                      }}
                                                      onDrop={(event) => {
                                                        event.preventDefault();
                                                        const position = getDropPositionForBlock(event.clientY, event.currentTarget);
                                                        handleDropIntoBlock(event.dataTransfer.getData("text/plain"), block.id, position);
                                                      }}
                                                    >
                                                      {block.codes.map((badgeCode, badgeIndex) => (
                                                        <Badge
                                                          key={`${block.id}-${badgeCode}`}
                                                          variant="outline"
                                                          className={`border-border text-foreground/80 cursor-move transition-[box-shadow,background-color] duration-150 ${codeDropHint?.blockId === block.id && codeDropHint.index === badgeIndex ? "bg-red-500/10 shadow-[0_0_0_2px_rgba(239,68,68,0.35)]" : ""}`}
                                                          draggable
                                                          onDragStart={(event) => {
                                                            event.dataTransfer.effectAllowed = "move";
                                                            event.dataTransfer.setData("text/plain", `${block.id}::${badgeCode}`);
                                                            setCodeDropHint(null);
                                                          }}
                                                          onDragOver={(event) => {
                                                            event.preventDefault();
                                                            maybeAutoScrollDuringDrag(event.clientY);
                                                            setCodeDropHint({ blockId: block.id, index: badgeIndex });
                                                          }}
                                                          onDragLeave={() => {
                                                            setCodeDropHint((current) => current?.blockId === block.id && current.index === badgeIndex ? null : current);
                                                          }}
                                                          onDrop={(event) => {
                                                            event.preventDefault();
                                                            const raw = event.dataTransfer.getData("text/plain");
                                                            if (raw.startsWith("BLOCK::")) return;
                                                            const [sourceBlockId, draggedCode] = raw.split("::");
                                                            if (!sourceBlockId || !draggedCode) return;
                                                            moveCodeToBlockPosition(sourceBlockId, draggedCode, block.id, badgeIndex);
                                                            setDragOverBlockId(null);
                                                            setBlockDropHint(null);
                                                            setCodeDropHint(null);
                                                          }}
                                                        >
                                                          {badgeCode}
                                                          <button
                                                            type="button"
                                                            className="ml-2"
                                                            onMouseDown={(event) => {
                                                              event.preventDefault();
                                                              event.stopPropagation();
                                                            }}
                                                            onClick={() => setSectionDraft((prev) => prev ? {
                                                              ...prev,
                                                              blocks: mapBlocksRecursively(prev.blocks, (item) => item.id === block.id
                                                                ? { ...item, codes: item.codes.filter((value) => value !== badgeCode) }
                                                                : item),
                                                            } : prev)}
                                                          >
                                                            x
                                                          </button>
                                                        </Badge>
                                                      ))}
                                                      {block.codes.length === 0 && <span className="text-xs text-muted-foreground">Classes included: none yet.</span>}
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>

                                              <div className="flex flex-wrap gap-2 mb-3">
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  onClick={() => {
                                                    const blockId = createLocalId("block");
                                                    setSectionDraft((prev) => prev ? {
                                                      ...prev,
                                                      blocks: [...prev.blocks, { id: blockId, type: "AND", codes: [] }],
                                                    } : prev);
                                                    setActiveDraftBlockId(blockId);
                                                  }}
                                                >
                                                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Required Group (AND)
                                                </Button>
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  onClick={() => {
                                                    const blockId = createLocalId("block");
                                                    setSectionDraft((prev) => prev ? {
                                                      ...prev,
                                                      blocks: [...prev.blocks, { id: blockId, type: "OR", codes: [] }],
                                                    } : prev);
                                                    setActiveDraftBlockId(blockId);
                                                  }}
                                                >
                                                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Option Group (OR)
                                                </Button>
                                              </div>

                                              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-3" data-audit-search-area="true">
                                                <Input
                                                  value={courseSearchQuery}
                                                  onChange={(event) => setCourseSearchQuery(event.target.value)}
                                                  placeholder="Search courses (e.g. BSCI330 or genetics)"
                                                />
                                                <Button type="button" onClick={runCourseSearch} disabled={courseSearchPending} data-audit-search-btn="true">
                                                  {courseSearchPending ? "Searching..." : "Search"}
                                                </Button>
                                              </div>

                                              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-3">
                                                <Input
                                                  value={wildcardTokenInput}
                                                  onChange={(event) => setWildcardTokenInput(event.target.value)}
                                                  placeholder="Insert wildcard token (e.g. BSCI3XX, CMSC/MATHXXX)"
                                                />
                                                <Button type="button" variant="outline" onClick={addWildcardTokenToActiveBlock} disabled={!activeDraftBlockId}>
                                                  Add Wildcard
                                                </Button>
                                              </div>

                                              {courseSearchMessage && <p className="text-xs text-muted-foreground mb-2">{courseSearchMessage}</p>}
                                              {courseSearchResults.length > 0 && (
                                                <div className="max-h-40 overflow-y-auto border border-border rounded-md p-2 space-y-1 mb-3">
                                                  {courseSearchResults.map((course) => (
                                                    <div key={`${course.code}-${course.title}`} className="flex items-center justify-between gap-2 p-1">
                                                      <div>
                                                        <p className="text-sm text-foreground">{course.code}</p>
                                                        <p className="text-xs text-muted-foreground">{course.title}</p>
                                                      </div>
                                                      <div className="flex items-center gap-2">
                                                        <Button
                                                          type="button"
                                                          size="sm"
                                                          variant="outline"
                                                          disabled={!activeDraftBlockId}
                                                          onClick={() => {
                                                            addCodeToActiveBlock(course.code);
                                                          }}
                                                        >
                                                          Add to Block
                                                        </Button>
                                                        <Button
                                                          type="button"
                                                          size="sm"
                                                          variant="outline"
                                                          onClick={() => {
                                                            addCodeToSectionLevel(course.code);
                                                          }}
                                                        >
                                                          Add to Section
                                                        </Button>
                                                      </div>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}

                                              <div className="flex gap-2 justify-end">
                                                <Button type="button" variant="outline" onClick={resetDraftEditor}>Cancel</Button>
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  className="border-red-600/40 text-red-400"
                                                  onClick={() => {
                                                    const nextSections = programAudit.bundle.sections.filter((item) => item.id !== editingSectionId);
                                                    persistProgramSections(programAudit.bundle.programId, nextSections);
                                                    resetDraftEditorForce();
                                                  }}
                                                >
                                                  Delete Section
                                                </Button>
                                                <Button
                                                  type="button"
                                                  className="bg-red-600 hover:bg-red-700"
                                                  onClick={() => {
                                                    if (!sectionDraft) return;
                                                    const updatedSection = sectionFromDraft(sectionDraft, editingSectionId ?? undefined);
                                                    const nextSections = programAudit.bundle.sections.map((item) => item.id === editingSectionId ? {
                                                      ...updatedSection,
                                                      specializationId: item.specializationId,
                                                    } : item);
                                                    persistProgramSections(programAudit.bundle.programId, nextSections);
                                                    resetDraftEditorForce();
                                                  }}
                                                >
                                                  <Save className="h-3.5 w-3.5 mr-1" /> Save Section
                                                </Button>
                                              </div>
                                            </Card>
                                          );
                                        }

                                        return (
                                          <div id={`audit-section-${index}-${section.id}`} key={section.id} className="da2-section-anchor">
                                            <RequirementSectionTableCard
                                              section={section}
                                              sectionEval={sectionEval}
                                              wildcardSlots={wildcardSlots}
                                              onSelectWildcardCourse={handleWildcardSelection}
                                              allCourses={courses}
                                              courseDetails={courseDetails}
                                              byCourseCode={byCourseCode}
                                              expandedSectionIds={expandedSectionIds}
                                              setExpandedSectionIds={setExpandedSectionIds}
                                              expandedNotesSectionIds={expandedNotesSectionIds}
                                              setExpandedNotesSectionIds={setExpandedNotesSectionIds}
                                              condensedView={condensedAuditView}
                                              onEdit={() => startEditingSection(index, section)}
                                              onSaveSection={(nextSection) => {
                                                const nextSections = programAudit.bundle.sections.map((item) => item.id === section.id ? {
                                                  ...nextSection,
                                                  specializationId: item.specializationId,
                                                } : item);
                                                persistProgramSections(programAudit.bundle.programId, nextSections);
                                              }}
                                            />
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>

                        <div className="mt-4 flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-border text-foreground/80"
                            onClick={() => startAddingSection(index)}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Add Section
                          </Button>
                        </div>
                      </Card>
                    </div>
                  );
                })}
                </div>
            )}

            <Card className="da2-overflow-section bg-card border-border mt-6 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="da2-section-title text-2xl text-foreground">Elective Overflow</h2>
                <Badge variant="outline" className="border-border text-foreground/80">{electiveCredits} credits</Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Courses below currently do not map to selected major/minor requirements.
              </p>

              {electiveOverflow.length === 0 ? (
                <div className="p-3 rounded-lg bg-input-background border border-border text-foreground/80">
                  No overflow electives detected.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {electiveOverflow.map((course) => (
                    <Card key={course.code} className="da2-overflow-item bg-input-background border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-foreground">{course.code}</p>
                          <p className="text-xs text-muted-foreground">{course.title}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-foreground">{course.credits} cr</p>
                          <p className="text-xs text-muted-foreground">{course.status.replace("_", " ")}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Card>

            <Card className="da2-sidebar-note bg-card border-border mt-6 p-4">
              <div className="flex items-center gap-2 text-foreground/80">
                <Info className="w-4 h-4" />
                <p className="text-sm">
                  Audit status is driven by MAIN schedules only: past terms = completed, current term = in progress, future terms = planned.
                </p>
              </div>
            </Card>
              </>
            )}
          </section>

          <aside className="da2-right-panel">
            {!loading && !errorMessage && selectedProgramAudit && (
              <>
                <Card className="da2-sidebar-card da2-programs-card bg-card border-border p-6">
                  <h3 className="da2-sidebar-title">Programs</h3>
                  <div className="da2-sb-program-list">
                    {programAudits.map((programAudit, index) => {
                      const completeCount = Math.min(
                        programAudit.requiredSlots,
                        programAudit.completedSlots + programAudit.inProgressSlots + programAudit.plannedSlots,
                      );

                      return (
                        <button
                          key={`sidebar-program-${programAudit.bundle.programId}-${index}`}
                          type="button"
                          className={`da2-sb-program-row ${index === selectedProgramIndex ? "selected" : ""}`}
                          onClick={() => changeActiveProgramIndex(index)}
                        >
                          <span className={`da2-sb-program-dot ${programAudit.bundle.kind === "minor" ? "minor" : "major"}`} />
                          <span className="da2-sb-program-name">{programAudit.bundle.programName}</span>
                          <span className="da2-sb-program-progress">{completeCount}/{programAudit.requiredSlots}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="da2-sb-program-note">Audit status is driven by your MAIN schedule only.</p>
                </Card>

                {(selectedProgramAudit.bundle.specializationOptions?.length ?? 0) > 0 && (
                  <Card className="da2-sidebar-card da2-track-card bg-card border-border p-6 mt-4">
                    <h3 className="da2-sidebar-title">{selectedProgramAudit.bundle.programName.split(",")[0]} Specialization Track</h3>
                    <div className="da2-sb-track-list">
                      <button
                        type="button"
                        className={`da2-sb-track-option ${!selectedSpecializationId ? "selected" : ""}`}
                        onClick={() => setProgramSpecialization(selectedProgramIndex, null)}
                      >
                        <p className="da2-sb-track-name">General</p>
                        <p className="da2-sb-track-detail">
                          {selectedProgramAudit.bundle.source === "cs-specialized"
                            ? "No specialization - maximum flexibility"
                            : "Core requirements only"}
                        </p>
                      </button>

                      {(selectedProgramAudit.bundle.specializationOptions ?? []).map((spec) => (
                        <button
                          key={`sidebar-spec-${spec.id}`}
                          type="button"
                          className={`da2-sb-track-option ${selectedSpecializationId === spec.id ? "selected" : ""}`}
                          onClick={() => setProgramSpecialization(selectedProgramIndex, spec.id)}
                        >
                          <p className="da2-sb-track-name">{spec.name}</p>
                          <p className="da2-sb-track-detail">{specializationPreviewById.get(spec.id) ?? "Track requirements"}</p>
                        </button>
                      ))}
                    </div>
                  </Card>
                )}
              </>
            )}
          </aside>
        </div>

        {showEditProgramsModal && (
          <div className="da2-edit-programs-overlay no-print" onClick={closeEditProgramsModal}>
            <Card className="da2-edit-programs-modal bg-card border-border p-5" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-xl text-foreground">Edit Programs</h2>
                  <p className="text-xs text-muted-foreground mt-1">Add/remove majors or minors and set your declaration mode.</p>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={closeEditProgramsModal}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="da2-select-label">Declaration</p>
                  <select
                    className="da2-select"
                    aria-label="Degree declaration mode"
                    value={degreeDeclarationMode}
                    onChange={(event) => {
                      const next = event.target.value as DegreeDeclarationMode;
                      if (next === "single" || next === "dual-major" || next === "double-degree") {
                        setDegreeDeclarationMode(next);
                      }
                    }}
                  >
                    <option value="single">Single Major</option>
                    <option value="dual-major">Dual Major</option>
                    <option value="double-degree">Double Degree</option>
                  </select>
                </div>

                <div>
                  <p className="da2-select-label">Add Program</p>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                    <select
                      className="da2-select"
                      aria-label="Program to add"
                      value={selectedProgramToAdd}
                      onChange={(event) => setSelectedProgramToAdd(event.target.value)}
                      disabled={programEditBusy}
                    >
                      <option value="">Select a major/minor program</option>
                      {addablePrograms.map((program) => (
                        <option key={program.key} value={program.key}>
                          {program.name} ({program.type})
                        </option>
                      ))}
                    </select>
                    <Button type="button" variant="outline" onClick={handleAddProgramFromModal} disabled={programEditBusy || !selectedProgramToAdd}>
                      <Plus className="h-4 w-4 mr-1" /> Add
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="da2-select-label">Current Programs</p>
                  {programs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No declared programs yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {programs.map((program) => (
                        <div key={program.id} className="da2-program-item flex items-center justify-between gap-3 rounded-md border border-border bg-input-background px-3 py-2">
                          <div>
                            <p className="text-sm text-foreground">{program.programName}</p>
                            <p className="text-xs text-muted-foreground">{program.programCode} {program.degreeType ? `- ${program.degreeType}` : ""}</p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-red-400 text-red-800 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-600/10"
                            onClick={() => void handleRemoveProgramFromModal(program.id)}
                            disabled={programEditBusy}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {programEditMessage && (
                  <p className="text-xs text-muted-foreground">{programEditMessage}</p>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
