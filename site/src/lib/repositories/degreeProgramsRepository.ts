import { getAuthenticatedUserId, getSupabaseClient } from "../supabase/client";

export interface UserDegreeProgram {
  id: string;
  userId: string;
  programId: string;
  isPrimary: boolean;
  startedTermId?: string;
  expectedGraduationTermId?: string;
  createdAt: string;
  // Joined from degree_programs
  programCode: string;
  programName: string;
  college?: string;
  degreeType?: string;
  catalogYear?: string;
}

export interface DegreeProgram {
  id: string;
  programCode: string;
  name: string;
  college?: string;
  degreeType?: string;
  catalogYear?: string;
  active: boolean;
}

/**
 * List all programs the current user has declared (with joined program details).
 */
export async function listUserDegreePrograms(): Promise<UserDegreeProgram[]> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("user_degree_programs")
    .select(
      `
      id,
      user_id,
      program_id,
      is_primary,
      started_term_id,
      expected_graduation_term_id,
      created_at,
      degree_programs (
        program_code,
        name,
        college,
        degree_type,
        catalog_year
      )
    `,
    )
    .eq("user_id", userId)
    .order("is_primary", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    programId: row.program_id,
    isPrimary: row.is_primary,
    startedTermId: row.started_term_id ?? undefined,
    expectedGraduationTermId: row.expected_graduation_term_id ?? undefined,
    createdAt: row.created_at,
    programCode: row.degree_programs.program_code,
    programName: row.degree_programs.name,
    college: row.degree_programs.college ?? undefined,
    degreeType: row.degree_programs.degree_type ?? undefined,
    catalogYear: row.degree_programs.catalog_year ?? undefined,
  }));
}

/**
 * List all available degree programs (for program selection UI).
 */
export async function listDegreePrograms(): Promise<DegreeProgram[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("degree_programs")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    programCode: row.program_code,
    name: row.name,
    college: row.college ?? undefined,
    degreeType: row.degree_type ?? undefined,
    catalogYear: row.catalog_year ?? undefined,
    active: row.active,
  }));
}

/**
 * Declare a program for the current user.
 */
export async function addUserDegreeProgram(
  programId: string,
  isPrimary: boolean = false,
): Promise<void> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { error } = await supabase.from("user_degree_programs").insert({
    user_id: userId,
    program_id: programId,
    is_primary: isPrimary,
  });

  if (error) throw error;
}

/**
 * Remove a program declaration for the current user.
 */
export async function removeUserDegreeProgram(
  userDegreeProgramId: string,
): Promise<void> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("user_degree_programs")
    .delete()
    .eq("id", userDegreeProgramId)
    .eq("user_id", userId);

  if (error) throw error;
}
