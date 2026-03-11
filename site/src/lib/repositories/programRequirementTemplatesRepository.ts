import { getAuthenticatedUserId, getSupabaseClient } from "../supabase/client";

export interface ProgramTemplateProgramLike {
  programId?: string;
  programCode?: string;
  programName: string;
  degreeType?: string;
}

export interface ProgramRequirementTemplateRow {
  id: string;
  program_key: string;
  sections_json: unknown;
  updated_by: string | null;
  updated_at: string;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function errorCode(error: unknown): string | null {
  if (error && typeof error === "object") {
    const { code } = error as Record<string, unknown>;
    return typeof code === "string" ? code : null;
  }
  return null;
}

export function buildProgramTemplateKey(program: ProgramTemplateProgramLike): string {
  const idPart = typeof program.programId === "string" && program.programId.trim().length > 0
    ? normalizeText(program.programId)
    : "no-id";
  const codePart = normalizeText(program.programCode ?? "");
  const typePart = normalizeText(program.degreeType ?? "");
  const namePart = normalizeText(program.programName);
  return [idPart, codePart || "no-code", typePart || "no-type", namePart || "no-name"].join("::");
}

export async function fetchProgramRequirementTemplateByKey(programKey: string): Promise<any[] | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("program_requirement_templates")
    .select("program_key, sections_json")
    .eq("program_key", programKey)
    .maybeSingle();

  if (error) {
    if (errorCode(error) === "42P01") return null;
    throw error;
  }

  if (!data) return null;
  return Array.isArray(data.sections_json) ? (data.sections_json as any[]) : [];
}

export async function saveProgramRequirementTemplate(programKey: string, sections: any[]): Promise<void> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("program_requirement_templates")
    .upsert(
      {
        program_key: programKey,
        sections_json: sections,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "program_key" },
    );

  if (error) throw error;
}
