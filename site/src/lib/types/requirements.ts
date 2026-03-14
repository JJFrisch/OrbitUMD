/* ---------------------------------------------------
 *  Shared types for the degree-requirements subsystem
 * --------------------------------------------------- */

// ── Node types (matches DB enum) ──

export type RequirementNodeType =
  | "AND_GROUP"
  | "OR_GROUP"
  | "COURSE"
  | "GEN_ED"
  | "WILDCARD";

// ── Section types (matches DB enum) ──

export type RequirementSectionType = "all_required" | "choose_n";

// ── Client-side tree models ──

export interface RequirementNode {
  id?: string;
  sectionId?: string;
  parentId?: string | null;
  nodeType: RequirementNodeType;
  // COURSE
  courseCode?: string;
  courseId?: string;
  // GEN_ED
  genEdCode?: string;
  // WILDCARD
  wildcardDept?: string;
  wildcardLevel?: string;
  // GROUP semantics
  minCount?: number;
  minCredits?: number;
  label?: string;
  position: number;
  children: RequirementNode[];
}

export interface RequirementSection {
  id?: string;
  programId: string;
  title: string;
  sectionType: RequirementSectionType;
  minCount?: number;
  minCredits?: number;
  position: number;
  nodes: RequirementNode[];
  updatedAt?: string;
}

// ── DB row shapes (snake_case, matching Supabase select) ──

export interface RequirementSectionRow {
  id: string;
  program_id: string;
  title: string;
  section_type: RequirementSectionType;
  min_count: number | null;
  min_credits: number | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface RequirementNodeRow {
  id: string;
  section_id: string;
  parent_id: string | null;
  node_type: RequirementNodeType;
  course_code: string | null;
  course_id: string | null;
  gen_ed_code: string | null;
  wildcard_dept: string | null;
  wildcard_level: string | null;
  min_count: number | null;
  min_credits: number | null;
  position: number;
  label: string | null;
  created_at: string;
}

// ── Degree audit evaluation types ──

export type SatisfactionStatus =
  | "satisfied"
  | "in_progress"
  | "planned"
  | "not_started";

export type CourseStatus = "completed" | "in_progress" | "planned";

export interface UserCourseRecord {
  courseCode: string;
  courseId?: string;
  credits: number;
  genEdCodes: string[];
  deptId: string;
  courseNumber: string;
  status: CourseStatus;
  term?: string;
  source: "schedule" | "plan" | "prior_credit";
}

export interface NodeEvaluation {
  nodeId: string;
  nodeType: RequirementNodeType;
  status: SatisfactionStatus;
  satisfiedBy: UserCourseRecord[];
  childEvaluations: NodeEvaluation[];
  satisfiedCount: number;
  requiredCount: number;
  satisfiedCredits: number;
  requiredCredits?: number;
}

export interface SectionEvaluation {
  sectionId: string;
  title: string;
  sectionType: RequirementSectionType;
  status: SatisfactionStatus;
  satisfiedCount: number;
  requiredCount: number;
  satisfiedCredits: number;
  requiredCredits?: number;
  nodeEvaluations: NodeEvaluation[];
}

export interface ProgramAudit {
  programId: string;
  programName: string;
  sections: SectionEvaluation[];
  overallStatus: SatisfactionStatus;
  totalRequiredCredits: number;
  totalSatisfiedCredits: number;
}

export interface OverrideRecord {
  id: string;
  userId: string;
  requirementId?: string;
  sectionId?: string;
  nodeId?: string;
  isWaived: boolean;
  note?: string;
}

// ── Prior credit record ──

export type PriorCreditSource = "AP" | "IB" | "transfer" | "exemption" | "other" | "transcript";

export type PriorCreditImportOrigin = "manual" | "testudo_transcript";

export interface UserPriorCreditRecord {
  id: string;
  userId: string;
  sourceType: PriorCreditSource;
  importOrigin: PriorCreditImportOrigin;
  originalName: string;
  umdCourseCode?: string;
  courseId?: string;
  credits: number;
  genEdCodes: string[];
  termAwarded?: string;
  grade?: string;
  countsTowardProgress: boolean;
  createdAt: string;
}

// ── Versioned requirement schema (programs/blocks/items) ──

export type RequirementBlockTypeV2 =
  | "ALL_OF"
  | "SELECT_N"
  | "CREDITS_MIN"
  | "TRACK_GROUP"
  | "POLICY"
  | "BENCHMARK"
  | "NOTE";

export type RequirementItemTypeV2 =
  | "COURSE"
  | "COURSE_GROUP"
  | "ATTRIBUTE"
  | "LEVEL_CONSTRAINT"
  | "SUBJECT_CONSTRAINT"
  | "TEXT_RULE";

export interface RequirementDslNodeV2 {
  id: string;
  label: string;
  nodeType: "requireAll" | "requireAny" | "course" | "courseGroup" | "note";
  minCount?: number;
  minCredits?: number;
  subject?: string;
  number?: string;
  text?: string;
  courses?: Array<{ subject: string; number: string }>;
  children: RequirementDslNodeV2[];
}

export interface ProgramV2 {
  id: string;
  code: string;
  title: string;
  college: string | null;
  degreeType: string | null;
  catalogYearStart: number;
  catalogYearEnd: number | null;
  minCredits: number | null;
  sourceUrl: string;
  requirementTree: RequirementDslNodeV2[] | null;
}

export interface RequirementBlockV2 {
  id: string;
  programId: string;
  parentRequirementId: string | null;
  sourceNodeId?: string | null;
  type: string;
  params: Record<string, unknown>;
  humanLabel: string;
  sortOrder: number;
}

export interface RequirementItemV2 {
  id: string;
  requirementBlockId: string;
  itemType: string;
  payload: Record<string, unknown>;
  sortOrder: number;
}

export interface StudentCourseV2 {
  id: string;
  studentUid: string;
  subject: string;
  number: string;
  title: string;
  credits: number;
  grade: string | null;
  term: string | null;
  isPlanned: boolean;
}

export interface StudentRequirementOverrideV2 {
  id: string;
  studentUid: string;
  blockId: string;
  overrideType: "WAIVED" | "MANUALLY_SATISFIED" | "COURSE_SUBSTITUTION";
  details: Record<string, unknown>;
}

export interface BlockEvaluationResultV2 {
  block: RequirementBlockV2;
  satisfied: boolean;
  usedCourses: StudentCourseV2[];
  remainingCourses: number | null;
  remainingCredits: number | null;
  messages: string[];
  children: BlockEvaluationResultV2[];
  overrideApplied: boolean;
}
