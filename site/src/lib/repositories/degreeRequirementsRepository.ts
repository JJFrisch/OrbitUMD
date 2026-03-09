import { getSupabaseClient } from "../supabase/client";
import type {
  RequirementSection,
  RequirementSectionRow,
  RequirementNode,
  RequirementNodeRow,
} from "../types/requirements";

// ──────────────────────────────────────────────
// Read helpers
// ──────────────────────────────────────────────

export async function fetchSectionsForProgram(
  programId: string,
): Promise<RequirementSectionRow[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("degree_requirement_sections")
    .select("*")
    .eq("program_id", programId)
    .order("position", { ascending: true });

  if (error) throw error;
  return (data ?? []) as RequirementSectionRow[];
}

export async function fetchNodesForSection(
  sectionId: string,
): Promise<RequirementNodeRow[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("degree_requirement_nodes")
    .select("*")
    .eq("section_id", sectionId)
    .order("position", { ascending: true });

  if (error) throw error;
  return (data ?? []) as RequirementNodeRow[];
}

/**
 * Fetches all sections and their nodes for a program, then assembles them
 * into the client-side tree structure.
 */
export async function fetchProgramRequirements(
  programId: string,
): Promise<RequirementSection[]> {
  const sectionRows = await fetchSectionsForProgram(programId);

  const sections: RequirementSection[] = [];

  for (const row of sectionRows) {
    const nodeRows = await fetchNodesForSection(row.id);
    sections.push(sectionRowToModel(row, nodeRows));
  }

  return sections;
}

// ──────────────────────────────────────────────
// Write helpers
// ──────────────────────────────────────────────

/**
 * Saves an entire program's requirement tree.
 *
 * Strategy: delete all existing sections (cascade deletes nodes), then
 * insert sections + nodes fresh. This is simpler than diffing and safe
 * because requirement editing is a low-frequency operation.
 */
export async function saveProgramRequirements(
  programId: string,
  sections: RequirementSection[],
): Promise<void> {
  const supabase = getSupabaseClient();

  // 1. Delete existing sections (cascade removes nodes)
  const { error: deleteError } = await supabase
    .from("degree_requirement_sections")
    .delete()
    .eq("program_id", programId);

  if (deleteError) throw deleteError;

  // 2. Insert sections one by one (need IDs for node FK)
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const sectionPayload = {
      program_id: programId,
      title: section.title,
      section_type: section.sectionType,
      min_count: section.minCount ?? null,
      min_credits: section.minCredits ?? null,
      position: i,
    };

    const { data: insertedSection, error: sectionError } = await supabase
      .from("degree_requirement_sections")
      .insert(sectionPayload)
      .select("id")
      .single();

    if (sectionError) throw sectionError;

    const sectionId = insertedSection.id as string;

    // 3. Flatten and insert nodes depth-first
    const flatNodes = flattenNodes(section.nodes, sectionId, null);
    if (flatNodes.length > 0) {
      await insertNodesTopDown(supabase, flatNodes);
    }
  }
}

export async function deleteSection(sectionId: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("degree_requirement_sections")
    .delete()
    .eq("id", sectionId);

  if (error) throw error;
}

// ──────────────────────────────────────────────
// Internal utilities
// ──────────────────────────────────────────────

/** Row→Model conversion: turns flat node rows into a nested tree. */
function sectionRowToModel(
  row: RequirementSectionRow,
  nodeRows: RequirementNodeRow[],
): RequirementSection {
  return {
    id: row.id,
    programId: row.program_id,
    title: row.title,
    sectionType: row.section_type,
    minCount: row.min_count ?? undefined,
    minCredits: row.min_credits ?? undefined,
    position: row.position,
    updatedAt: row.updated_at,
    nodes: buildNodeTree(nodeRows),
  };
}

/** Builds a tree from flat rows using parent_id linkage. */
function buildNodeTree(rows: RequirementNodeRow[]): RequirementNode[] {
  const map = new Map<string, RequirementNode>();
  const roots: RequirementNode[] = [];

  // First pass: create model objects
  for (const row of rows) {
    map.set(row.id, nodeRowToModel(row));
  }

  // Second pass: link children
  for (const row of rows) {
    const node = map.get(row.id)!;
    if (row.parent_id && map.has(row.parent_id)) {
      map.get(row.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by position at each level
  const sortChildren = (nodes: RequirementNode[]) => {
    nodes.sort((a, b) => a.position - b.position);
    for (const n of nodes) sortChildren(n.children);
  };
  sortChildren(roots);

  return roots;
}

function nodeRowToModel(row: RequirementNodeRow): RequirementNode {
  return {
    id: row.id,
    sectionId: row.section_id,
    parentId: row.parent_id,
    nodeType: row.node_type,
    courseCode: row.course_code ?? undefined,
    courseId: row.course_id ?? undefined,
    genEdCode: row.gen_ed_code ?? undefined,
    wildcardDept: row.wildcard_dept ?? undefined,
    wildcardLevel: row.wildcard_level ?? undefined,
    minCount: row.min_count ?? undefined,
    minCredits: row.min_credits ?? undefined,
    label: row.label ?? undefined,
    position: row.position,
    children: [],
  };
}

/** Intermediate type used during insert (has temp ID for parent linkage). */
interface FlatNodeInsert {
  tempId: string;
  parentTempId: string | null;
  sectionId: string;
  node: RequirementNode;
  position: number;
}

/**
 * Flatten a tree of RequirementNodes into an ordered list suitable for
 * top-down insertion (parents before children).
 */
function flattenNodes(
  nodes: RequirementNode[],
  sectionId: string,
  parentTempId: string | null,
): FlatNodeInsert[] {
  const result: FlatNodeInsert[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const tempId = crypto.randomUUID();
    result.push({
      tempId,
      parentTempId,
      sectionId,
      node,
      position: i,
    });
    if (node.children.length > 0) {
      result.push(...flattenNodes(node.children, sectionId, tempId));
    }
  }
  return result;
}

/**
 * Insert nodes one-by-one in order (parents first) so that parent_id FK
 * can reference the real DB-generated UUID.
 */
async function insertNodesTopDown(
  supabase: ReturnType<typeof getSupabaseClient>,
  flatNodes: FlatNodeInsert[],
): Promise<void> {
  // Map tempId → real DB id
  const idMap = new Map<string, string>();

  for (const entry of flatNodes) {
    const realParentId =
      entry.parentTempId ? idMap.get(entry.parentTempId) ?? null : null;

    const payload = {
      section_id: entry.sectionId,
      parent_id: realParentId,
      node_type: entry.node.nodeType,
      course_code: entry.node.courseCode ?? null,
      course_id: entry.node.courseId ?? null,
      gen_ed_code: entry.node.genEdCode ?? null,
      wildcard_dept: entry.node.wildcardDept ?? null,
      wildcard_level: entry.node.wildcardLevel ?? null,
      min_count: entry.node.minCount ?? null,
      min_credits: entry.node.minCredits ?? null,
      position: entry.position,
      label: entry.node.label ?? null,
    };

    const { data, error } = await supabase
      .from("degree_requirement_nodes")
      .insert(payload)
      .select("id")
      .single();

    if (error) throw error;

    idMap.set(entry.tempId, data.id as string);
  }
}
