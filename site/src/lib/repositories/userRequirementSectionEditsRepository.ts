import { getAuthenticatedUserId, getSupabaseClient } from "../supabase/client";

export interface UserRequirementSectionEditRow {
  id: string;
  user_id: string;
  program_key: string;
  sections_json: unknown;
  updated_at: string;
}

function errorCode(error: unknown): string | null {
  if (error && typeof error === "object") {
    const { code } = error as Record<string, unknown>;
    return typeof code === "string" ? code : null;
  }
  return null;
}

function toProgramSectionsMap(rows: UserRequirementSectionEditRow[]): Record<string, any[]> {
  const out: Record<string, any[]> = {};
  for (const row of rows) {
    if (!row.program_key) continue;
    const sections = Array.isArray(row.sections_json) ? row.sections_json : [];
    out[row.program_key] = sections as any[];
  }
  return out;
}

export async function listUserRequirementSectionEdits(): Promise<Record<string, any[]>> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("user_requirement_section_edits")
    .select("id, user_id, program_key, sections_json, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    // Table not deployed yet; fail soft and use local fallback.
    if (errorCode(error) === "42P01") {
      return {};
    }
    throw error;
  }

  return toProgramSectionsMap((data ?? []) as UserRequirementSectionEditRow[]);
}

export async function saveUserRequirementSectionEdit(programKey: string, sections: any[]): Promise<void> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("user_requirement_section_edits")
    .upsert(
      {
        user_id: userId,
        program_key: programKey,
        sections_json: sections,
      },
      { onConflict: "user_id,program_key" },
    );

  if (error) {
    if (errorCode(error) === "42P01") {
      // Migration not applied yet; caller can still persist locally.
      return;
    }
    throw error;
  }
}
