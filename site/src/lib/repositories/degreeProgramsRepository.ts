import { getAuthenticatedUserId, getSupabaseClient } from "../supabase/client";
import requirementsCatalog from "@/lib/data/umd_program_requirements.json";

const LOCAL_SELECTED_PROGRAMS_KEY = "orbitumd-local-selected-programs";

type LocalSelectedProgram = {
  id: string;
  userId?: string;
  programId: string;
  isPrimary: boolean;
  sortOrder?: number;
  startedTermId?: string;
  expectedGraduationTermId?: string;
  createdAt: string;
  programCode: string;
  programName: string;
  college?: string;
  degreeType?: string;
  catalogYear?: string;
};

export interface CatalogProgramOption {
  key: string;
  name: string;
  type: "major" | "minor";
  programCode: string;
  source: "db" | "catalog" | "api";
  dbProgramId?: string;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function safeReadLocalSelectedPrograms(): LocalSelectedProgram[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(LOCAL_SELECTED_PROGRAMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LocalSelectedProgram[]) : [];
  } catch {
    return [];
  }
}

function safeWriteLocalSelectedPrograms(programs: LocalSelectedProgram[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_SELECTED_PROGRAMS_KEY, JSON.stringify(programs));
}

function toUserDegreeProgramFromLocal(row: LocalSelectedProgram): UserDegreeProgram {
  return {
    id: row.id,
    userId: row.userId ?? "local-user",
    programId: row.programId,
    isPrimary: row.isPrimary,
    startedTermId: row.startedTermId,
    expectedGraduationTermId: row.expectedGraduationTermId,
    createdAt: row.createdAt,
    programCode: row.programCode,
    programName: row.programName,
    college: row.college,
    degreeType: row.degreeType,
    catalogYear: row.catalogYear,
  };
}

export interface UserDegreeProgram {
  id: string;
  userId: string;
  programId: string;
  isPrimary: boolean;
  sortOrder?: number;
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
  const localPrograms = safeReadLocalSelectedPrograms().map(toUserDegreeProgramFromLocal);

  try {
    const userId = await getAuthenticatedUserId();
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
    sortOrder: row.sortOrder,
      .from("user_degree_programs")
      .select(
        `
        id,
        user_id,
        program_id,
        is_primary,
        sort_order,
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
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) throw error;

    const remotePrograms: UserDegreeProgram[] = (data ?? []).map((row: any) => ({
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
      sortOrder: row.sort_order ?? undefined,
    }));

    const merged = [...remotePrograms];
    const existing = new Set(remotePrograms.map((program) => normalizeName(program.programName)));
    for (const local of localPrograms) {
      if (!existing.has(normalizeName(local.programName))) {
        merged.push(local);
      }
    }

    return merged;
  } catch {
    return localPrograms;
  }
}

export async function listProgramCatalogOptions(): Promise<CatalogProgramOption[]> {
  const options = new Map<string, CatalogProgramOption>();

  const addOption = (option: CatalogProgramOption) => {
    const key = `${normalizeName(option.name)}::${option.type}`;
    if (!options.has(key)) {
      options.set(key, option);
    }
  };

  try {
    const dbPrograms = await listDegreePrograms();
    for (const program of dbPrograms) {
      addOption({
        key: `db:${program.id}`,
        name: program.name,
        type: String(program.degreeType ?? "").toLowerCase().includes("minor") ? "minor" : "major",
        programCode: program.programCode,
        source: "db",
        dbProgramId: program.id,
      });
    }
  } catch {
    // DB catalog can be unavailable; fall back to local static/API sources.
  }

  const catalogPrograms = ((requirementsCatalog as any)?.programs ?? []) as Array<{ id: string; name: string; type?: string }>;
  for (const program of catalogPrograms) {
    const type = program.type === "minor" ? "minor" : "major";
    addOption({
      key: `catalog:${program.id}`,
      name: program.name,
      type,
      programCode: program.id,
      source: "catalog",
    });
  }

  try {
    const response = await fetch("https://api.umd.io/v1/majors/list");
    if (response.ok) {
      const payload = (await response.json()) as Array<{ major: string }>;
      for (const row of payload) {
        const name = String(row.major ?? "").trim();
        if (!name) continue;
        addOption({
          key: `api:${name}`,
          name,
          type: "major",
          programCode: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          source: "api",
        });
      }
    }
  } catch {
    // API unavailability should not block settings.
  }

  return Array.from(options.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function addLocalCatalogProgramSelection(option: CatalogProgramOption): Promise<void> {
  const current = safeReadLocalSelectedPrograms();
  const normalized = normalizeName(option.name);
  if (current.some((row) => normalizeName(row.programName) === normalized)) {
    return;
  }

  const next: LocalSelectedProgram = {
    id: `local-link:${crypto.randomUUID()}`,
    programId: option.key,
    isPrimary: current.length === 0,
    sortOrder: current.length + 1,
    createdAt: new Date().toISOString(),
    programCode: option.programCode,
    programName: option.name,
    degreeType: option.type,
  };

  safeWriteLocalSelectedPrograms([...current, next]);
}

export async function removeLocalCatalogProgramSelection(userDegreeProgramId: string): Promise<void> {
  const current = safeReadLocalSelectedPrograms();
  const filtered = current.filter((row) => row.id !== userDegreeProgramId);
  if (filtered.length > 0 && filtered.every((row) => !row.isPrimary)) {
    filtered[0].isPrimary = true;
  }
  safeWriteLocalSelectedPrograms(filtered);
}

export async function setLocalCatalogPrimaryProgram(userDegreeProgramId: string): Promise<void> {
  const current = safeReadLocalSelectedPrograms();
  const next = current.map((row) => ({ ...row, isPrimary: row.id === userDegreeProgramId }));
  safeWriteLocalSelectedPrograms(next);
}

export async function setLocalCatalogExpectedGraduationTerm(userDegreeProgramId: string, termId: string | null): Promise<void> {
  const current = safeReadLocalSelectedPrograms();
  const next = current.map((row) =>
    row.id === userDegreeProgramId
      ? { ...row, expectedGraduationTermId: termId ?? undefined }
      : row,
  );
  safeWriteLocalSelectedPrograms(next);
}

export async function reorderUserDegreePrograms(orderedProgramIds: string[]): Promise<void> {
  if (orderedProgramIds.length === 0) return;

  const rank = new Map(orderedProgramIds.map((id, index) => [id, index + 1]));

  const localRows = safeReadLocalSelectedPrograms();
  if (localRows.length > 0) {
    const nextLocal = localRows
      .map((row) => ({ ...row, sortOrder: rank.get(row.id) ?? row.sortOrder }))
      .sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER));
    safeWriteLocalSelectedPrograms(nextLocal);
  }

  const remoteIds = orderedProgramIds.filter((id) => !id.startsWith("local-link:"));
  if (remoteIds.length === 0) return;

  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const updates = await Promise.all(
    remoteIds.map((id, index) =>
      supabase
        .from("user_degree_programs")
        .update({ sort_order: index + 1 })
        .eq("id", id)
        .eq("user_id", userId)
    )
  );

  const error = updates.find((result) => result.error)?.error;
  if (error) throw error;
}

/**
 * Attempt to declare a program in DB, and if DB cannot accept new links/programs,
 * persist as local catalog selection so requirements pages still work.
 */
export async function addUserDegreeProgramFromCatalogOption(option: CatalogProgramOption): Promise<void> {
  if (option.dbProgramId) {
    const existing = await listUserDegreePrograms();
    await addUserDegreeProgram(option.dbProgramId, existing.length === 0);
    return;
  }

  await addLocalCatalogProgramSelection(option);
}

/**
 * Keep legacy typed mapping in one place for DB-backed list function.
 */
function _mapDbRow(row: any): UserDegreeProgram {
  return {
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
    sortOrder: row.sort_order ?? undefined,
  };
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
