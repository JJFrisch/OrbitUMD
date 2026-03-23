import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  ProgramV2,
  RequirementBlockV2,
  RequirementItemV2,
  StudentCourseV2,
  StudentRequirementOverrideV2,
  BlockEvaluationResultV2,
  RequirementDslNodeV2,
} from "@/lib/types/requirements";
import { buildEvalContextV2, evaluateProgramRequirementsV2 } from "@/lib/requirements/v2Evaluator";
import { coursePartsAreEquivalent } from "@/lib/requirements/courseCodeEquivalency";

interface ProgramRow {
  id: string;
  code: string;
  title: string;
  college: string | null;
  degree_type: string | null;
  catalog_year_start: number;
  catalog_year_end: number | null;
  min_credits: number | null;
  source_url: string;
  requirement_tree: RequirementDslNodeV2[] | null;
}

interface BlockRow {
  id: string;
  program_id: string;
  parent_requirement_id: string | null;
  source_node_id: string | null;
  type: string;
  params: Record<string, unknown> | null;
  human_label: string;
  sort_order: number;
}

interface ItemRow {
  id: string;
  requirement_block_id: string;
  item_type: string;
  payload: Record<string, unknown> | null;
  sort_order: number;
}

interface StudentCourseRow {
  id: string;
  student_uid: string;
  subject: string;
  number: string;
  title: string;
  credits: number;
  grade: string | null;
  term: string | null;
  is_planned: boolean;
}

interface OverrideRow {
  id: string;
  student_uid: string;
  block_id: string;
  override_type: "WAIVED" | "MANUALLY_SATISFIED" | "COURSE_SUBSTITUTION";
  details: Record<string, unknown> | null;
}

function mapProgram(row: ProgramRow): ProgramV2 {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    college: row.college,
    degreeType: row.degree_type,
    catalogYearStart: row.catalog_year_start,
    catalogYearEnd: row.catalog_year_end,
    minCredits: row.min_credits,
    sourceUrl: row.source_url,
    requirementTree: row.requirement_tree,
  };
}

function mapBlock(row: BlockRow): RequirementBlockV2 {
  return {
    id: row.id,
    programId: row.program_id,
    parentRequirementId: row.parent_requirement_id,
    sourceNodeId: row.source_node_id,
    type: row.type,
    params: row.params ?? {},
    humanLabel: row.human_label,
    sortOrder: row.sort_order,
  };
}

function mapItem(row: ItemRow): RequirementItemV2 {
  return {
    id: row.id,
    requirementBlockId: row.requirement_block_id,
    itemType: row.item_type,
    payload: row.payload ?? {},
    sortOrder: row.sort_order,
  };
}

function mapStudentCourse(row: StudentCourseRow): StudentCourseV2 {
  return {
    id: row.id,
    studentUid: row.student_uid,
    subject: row.subject,
    number: row.number,
    title: row.title,
    credits: Number(row.credits) || 0,
    grade: row.grade,
    term: row.term,
    isPlanned: row.is_planned,
  };
}

function mapOverride(row: OverrideRow): StudentRequirementOverrideV2 {
  return {
    id: row.id,
    studentUid: row.student_uid,
    blockId: row.block_id,
    overrideType: row.override_type,
    details: row.details ?? {},
  };
}

function applyOverrides(
  results: BlockEvaluationResultV2[],
  overrides: StudentRequirementOverrideV2[],
  studentCourses: StudentCourseV2[],
): BlockEvaluationResultV2[] {
  const overrideByBlock = new Map<string, StudentRequirementOverrideV2[]>();
  for (const override of overrides) {
    const current = overrideByBlock.get(override.blockId) ?? [];
    current.push(override);
    overrideByBlock.set(override.blockId, current);
  }

  const applyRecursive = (node: BlockEvaluationResultV2): BlockEvaluationResultV2 => {
    const childResults = node.children.map(applyRecursive);
    const localOverrides = overrideByBlock.get(node.block.id) ?? [];

    let nextNode: BlockEvaluationResultV2 = {
      ...node,
      children: childResults,
    };

    for (const override of localOverrides) {
      if (override.overrideType === "WAIVED" || override.overrideType === "MANUALLY_SATISFIED") {
        nextNode = {
          ...nextNode,
          satisfied: true,
          overrideApplied: true,
          messages: [...nextNode.messages, `Override applied: ${override.overrideType}`],
          remainingCourses: 0,
          remainingCredits: 0,
        };
      }

      if (override.overrideType === "COURSE_SUBSTITUTION") {
        const substitute = override.details.substituteCourse;
        if (substitute && typeof substitute === "object") {
          const obj = substitute as Record<string, unknown>;
          const subject = String(obj.subject ?? "").toUpperCase();
          const number = String(obj.number ?? "").toUpperCase();
          const matched = studentCourses.find(
            (course) =>
              coursePartsAreEquivalent(course.subject, course.number, subject, number),
          );

          if (matched) {
            nextNode = {
              ...nextNode,
              satisfied: true,
              overrideApplied: true,
              usedCourses: [...nextNode.usedCourses, matched],
              messages: [
                ...nextNode.messages,
                `Substitution applied: ${subject}${number}`,
              ],
              remainingCourses: 0,
            };
          }
        }
      }
    }

    return nextNode;
  };

  return results.map(applyRecursive);
}

export async function loadProgramAndEvaluate(
  studentUid: string,
  programCode: string,
): Promise<{ program: ProgramV2; results: BlockEvaluationResultV2[] }> {
  const supabase = getSupabaseClient();

  const { data: programData, error: programError } = await supabase
    .from("programs")
    .select("id, code, title, college, degree_type, catalog_year_start, catalog_year_end, min_credits, source_url, requirement_tree")
    .eq("code", programCode)
    .single();

  if (programError || !programData) {
    throw new Error(`Program not found for code ${programCode}`);
  }

  const program = mapProgram(programData as ProgramRow);

  const [{ data: blockRows, error: blockError }, { data: itemRows, error: itemError }, { data: courseRows, error: courseError }, { data: overrideRows, error: overrideError }] = await Promise.all([
    supabase
      .from("requirement_blocks")
      .select("id, program_id, parent_requirement_id, source_node_id, type, params, human_label, sort_order")
      .eq("program_id", program.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("requirement_items")
      .select("id, requirement_block_id, item_type, payload, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("student_courses")
      .select("id, student_uid, subject, number, title, credits, grade, term, is_planned")
      .eq("student_uid", studentUid),
    supabase
      .from("student_requirement_overrides")
      .select("id, student_uid, block_id, override_type, details")
      .eq("student_uid", studentUid),
  ]);

  if (blockError) throw blockError;
  if (itemError) throw itemError;
  if (courseError) throw courseError;
  if (overrideError) throw overrideError;

  const blocks = (blockRows ?? []).map((row) => mapBlock(row as BlockRow));
  const blockIds = new Set(blocks.map((block) => block.id));

  const items = (itemRows ?? [])
    .map((row) => mapItem(row as ItemRow))
    .filter((item) => blockIds.has(item.requirementBlockId));

  const studentCourses = (courseRows ?? []).map((row) => mapStudentCourse(row as StudentCourseRow));
  const overrides = (overrideRows ?? []).map((row) => mapOverride(row as OverrideRow));

  const ctx = buildEvalContextV2(blocks, items);
  const evaluated = evaluateProgramRequirementsV2(ctx, studentCourses);
  const withOverrides = applyOverrides(evaluated, overrides, studentCourses);

  return {
    program,
    results: withOverrides,
  };
}
