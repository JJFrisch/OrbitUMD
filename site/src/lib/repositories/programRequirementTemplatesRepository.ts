import { getAuthenticatedUserId, getSupabaseClient } from "../supabase/client";
import requirementsCatalog from "@/lib/data/umd_program_requirements.json";

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

export interface ProgramRequirementTemplatePayload {
  sections: any[];
  specializations: string[];
  catalogVersion?: string;
}

const CURRENT_CATALOG_VERSION = String((requirementsCatalog as any)?.meta?.generatedAt ?? "unknown");

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
  const payload = await fetchProgramRequirementTemplatePayloadByKey(programKey);
  if (!payload) return null;
  return payload.sections;
}

export async function fetchProgramRequirementTemplatePayloadByKey(
  programKey: string,
): Promise<ProgramRequirementTemplatePayload | null> {
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

  // Backward compatible format:
  // 1) array -> sections only
  // 2) object { sections: [...], specializations: [...] }
  if (Array.isArray(data.sections_json)) {
    return {
      sections: data.sections_json as any[],
      specializations: [],
      catalogVersion: "legacy",
    };
  }

  if (data.sections_json && typeof data.sections_json === "object") {
    const json = data.sections_json as Record<string, unknown>;
    const sections = Array.isArray(json.sections) ? (json.sections as any[]) : [];
    const specializations = Array.isArray(json.specializations)
      ? json.specializations.map((entry) => String(entry ?? "")).filter((entry) => entry.length > 0)
      : [];
    const catalogVersion = typeof json.catalogVersion === "string" ? json.catalogVersion : "legacy";
    return { sections, specializations, catalogVersion };
  }

  return { sections: [], specializations: [], catalogVersion: "legacy" };
}

export async function saveProgramRequirementTemplate(programKey: string, sections: any[]): Promise<void> {
  await saveProgramRequirementTemplatePayload(programKey, {
    sections,
    specializations: [],
  });
}

export async function saveProgramRequirementTemplatePayload(
  programKey: string,
  payload: ProgramRequirementTemplatePayload,
): Promise<void> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("program_requirement_templates")
    .upsert(
      {
        program_key: programKey,
        sections_json: {
          sections: payload.sections,
          specializations: payload.specializations,
          catalogVersion: payload.catalogVersion ?? CURRENT_CATALOG_VERSION,
        },
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "program_key" },
    );

  if (error) throw error;
}
