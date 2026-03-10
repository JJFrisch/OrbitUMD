import { getAuthenticatedUserId, getSupabaseClient } from "../supabase/client";

let termCodeColumnsSupported: boolean | null = null;

const TERM_CODE_TO_SEASON: Record<string, string> = {
  "01": "spring",
  "05": "summer",
  "08": "fall",
  "12": "winter",
};

function messageFromUnknownError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    const message = typeof errorRecord.message === "string" ? errorRecord.message.trim() : "";
    const details = typeof errorRecord.details === "string" ? errorRecord.details.trim() : "";
    const hint = typeof errorRecord.hint === "string" ? errorRecord.hint.trim() : "";
    const code = typeof errorRecord.code === "string" ? errorRecord.code.trim() : "";

    const parts = [message, details, hint].filter((part) => part.length > 0);
    if (parts.length > 0) {
      const combined = parts.join(" | ");
      return code ? `${combined} (code: ${code})` : combined;
    }

    try {
      return JSON.stringify(errorRecord);
    } catch {
      return "Unknown error";
    }
  }

  return "Unknown error";
}

function normalizeScheduleError(error: unknown): never {
  const message = messageFromUnknownError(error);
  if (message.toLowerCase().includes("auth session missing")) {
    throw new Error("Please sign in to save and load schedules.");
  }

  if (message.toLowerCase().includes("duplicate key value") && message.includes("user_schedules_user_id_term_id_name_key")) {
    throw new Error("A schedule with this name already exists for this term. Please rename it or open the existing one.");
  }

  throw new Error(message);
}

function errorCode(error: unknown): string | null {
  if (error && typeof error === "object") {
    const code = (error as Record<string, unknown>).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

function mapScheduleRowWithDerivedTerm(row: any): ScheduleWithSelections {
  const umdTermCode = typeof row?.terms?.umd_term_code === "string" ? row.terms.umd_term_code : null;
  const derivedTermCode = umdTermCode && umdTermCode.length >= 2 ? umdTermCode.slice(-2) : null;
  const derivedTermYear = typeof row?.terms?.year === "number" ? row.terms.year : null;

  return {
    ...(row as UserScheduleRecord),
    term_code: row?.term_code ?? derivedTermCode,
    term_year: row?.term_year ?? derivedTermYear,
    selections_json: row?.selections_json ?? [],
  };
}

async function supportsTermCodeColumns(): Promise<boolean> {
  if (termCodeColumnsSupported !== null) {
    return termCodeColumnsSupported;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("user_schedules")
    .select("term_code")
    .limit(1);

  if (!error) {
    termCodeColumnsSupported = true;
    return true;
  }

  if (errorCode(error) === "42703") {
    termCodeColumnsSupported = false;
    return false;
  }

  normalizeScheduleError(error);
}

async function resolveTermIdWithFallback(input: SaveScheduleInput): Promise<string | null> {
  const supabase = getSupabaseClient();
  const umdTermCode = `${input.termYear}${input.termCode}`;
  const season = TERM_CODE_TO_SEASON[input.termCode] ?? "fall";

  const { data: exactTerm, error: exactTermError } = await supabase
    .from("terms")
    .select("id")
    .eq("umd_term_code", umdTermCode)
    .maybeSingle();

  if (exactTermError) normalizeScheduleError(exactTermError);
  if (exactTerm?.id) return exactTerm.id;

  const { data: yearSeasonTerm, error: yearSeasonErr } = await supabase
    .from("terms")
    .select("id")
    .eq("year", input.termYear)
    .eq("season", season)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (yearSeasonErr) normalizeScheduleError(yearSeasonErr);
  if (yearSeasonTerm?.id) return yearSeasonTerm.id;

  const { data: fallbackTerm, error: fallbackErr } = await supabase
    .from("terms")
    .select("id")
    .eq("season", season)
    .order("year", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fallbackErr) normalizeScheduleError(fallbackErr);
  if (fallbackTerm?.id) return fallbackTerm.id;

  // Last resort: ask the DB to create the requested term row via SECURITY DEFINER RPC.
  // This keeps client RLS intact while eliminating save failures on new environments.
  const { data: createdTermId, error: createTermError } = await supabase.rpc("ensure_term_row", {
    p_year: input.termYear,
    p_term_code: input.termCode,
  });

  if (createTermError) {
    // Keep compatibility with older DBs where the RPC migration has not run yet.
    if (errorCode(createTermError) === "42883") {
      return null;
    }
    normalizeScheduleError(createTermError);
  }

  if (typeof createdTermId === "string" && createdTermId.trim().length > 0) {
    return createdTermId;
  }

  return null;
}

export interface UserScheduleRecord {
  id: string;
  user_id: string;
  term_id: string;
  name: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduleSectionRecord {
  schedule_id: string;
  section_id: string;
  pinned: boolean;
  created_at: string;
}

export interface UpsertUserScheduleInput {
  id?: string;
  termId: string;
  name: string;
  isPrimary?: boolean;
}

export async function listUserSchedules(): Promise<UserScheduleRecord[]> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("user_schedules")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    normalizeScheduleError(error);
  }

  return (data ?? []) as UserScheduleRecord[];
}

export async function upsertUserSchedule(input: UpsertUserScheduleInput): Promise<UserScheduleRecord> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const payload = {
    id: input.id,
    user_id: userId,
    term_id: input.termId,
    name: input.name,
    is_primary: input.isPrimary ?? false,
  };

  const { data, error } = await supabase
    .from("user_schedules")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .maybeSingle();

  if (error) {
    normalizeScheduleError(error);
  }

  if (!data) {
    throw new Error("Schedule was saved but could not be fetched for this user. Please check row-level security policies and try again.");
  }

  return data as UserScheduleRecord;
}

export async function deleteUserSchedule(scheduleId: string): Promise<void> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("user_schedules")
    .delete()
    .eq("id", scheduleId)
    .eq("user_id", userId);

  if (error) {
    normalizeScheduleError(error);
  }
}

export async function listSectionsForSchedule(scheduleId: string): Promise<ScheduleSectionRecord[]> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("schedule_sections")
    .select("schedule_id, section_id, pinned, created_at, user_schedules!inner(user_id)")
    .eq("schedule_id", scheduleId)
    .eq("user_schedules.user_id", userId);

  if (error) {
    normalizeScheduleError(error);
  }

  return (data ?? []).map((row: any) => ({
    schedule_id: row.schedule_id,
    section_id: row.section_id,
    pinned: row.pinned,
    created_at: row.created_at,
  }));
}

export async function replaceScheduleSections(scheduleId: string, sectionIds: string[]): Promise<void> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { data: ownedSchedule, error: ownershipError } = await supabase
    .from("user_schedules")
    .select("id")
    .eq("id", scheduleId)
    .eq("user_id", userId)
    .maybeSingle();

  if (ownershipError) {
    normalizeScheduleError(ownershipError);
  }

  if (!ownedSchedule) {
    throw new Error("Schedule not found for current user");
  }

  const { error: deleteError } = await supabase.from("schedule_sections").delete().eq("schedule_id", scheduleId);
  if (deleteError) {
    normalizeScheduleError(deleteError);
  }

  if (sectionIds.length === 0) {
    return;
  }

  const payload = sectionIds.map((sectionId) => ({
    schedule_id: scheduleId,
    section_id: sectionId,
    pinned: false,
  }));

  const { error: insertError } = await supabase.from("schedule_sections").insert(payload);
  if (insertError) {
    normalizeScheduleError(insertError);
  }
}

// ──────────────────────────────────────────────
// JSON-based schedule persistence
// (Works without catalog sync populating public.sections)
// ──────────────────────────────────────────────

export interface SaveScheduleInput {
  id?: string;
  name: string;
  termCode: string;
  termYear: number;
  isPrimary?: boolean;
  selectionsJson: unknown; // Array of ScheduleSelection objects
}

export interface ScheduleWithSelections extends UserScheduleRecord {
  term_code: string | null;
  term_year: number | null;
  selections_json: unknown;
}

export async function saveScheduleWithSelections(input: SaveScheduleInput): Promise<ScheduleWithSelections> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  // We need a term_id for the FK. Terms are read-only for clients under RLS,
  // so resolve from existing rows instead of trying to insert/upsert.
  const termId = await resolveTermIdWithFallback(input);

  if (!termId) {
    throw new Error(
      "Unable to resolve a valid term for this schedule. Sync catalog terms or run the latest DB migrations and try again.",
    );
  }

  const payload: Record<string, unknown> = {
    user_id: userId,
    term_id: termId,
    name: input.name,
    is_primary: input.isPrimary ?? false,
    selections_json: input.selectionsJson,
  };

  if (await supportsTermCodeColumns()) {
    payload.term_code = input.termCode;
    payload.term_year = input.termYear;
  }

  if (input.id) {
    payload.id = input.id;
  } else {
    // Keep create idempotent by name within a term instead of failing
    // on unique(user_id, term_id, name).
    const { data: existingByName, error: existingByNameError } = await supabase
      .from("user_schedules")
      .select("id")
      .eq("user_id", userId)
      .eq("term_id", termId)
      .eq("name", input.name)
      .maybeSingle();

    if (existingByNameError) normalizeScheduleError(existingByNameError);
    if (existingByName?.id) payload.id = existingByName.id;
  }

  const { data, error } = await supabase
    .from("user_schedules")
    .upsert(payload, { onConflict: "id" })
    .select("*, terms(umd_term_code, year)")
    .maybeSingle();

  if (error) normalizeScheduleError(error);

  if (!data) {
    throw new Error("Schedule was saved but could not be read back. Please verify RLS policies and try again.");
  }

  return mapScheduleRowWithDerivedTerm(data);
}

export async function listSchedulesForTerm(
  termCode: string,
  termYear: number,
): Promise<ScheduleWithSelections[]> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();
  const umdTermCode = `${termYear}${termCode}`;

  const { data, error } = await supabase
    .from("user_schedules")
    .select("*, terms!inner(umd_term_code, year)")
    .eq("user_id", userId)
    .eq("terms.umd_term_code", umdTermCode)
    .order("updated_at", { ascending: false });

  if (error) normalizeScheduleError(error);
  return (data ?? []).map(mapScheduleRowWithDerivedTerm);
}

export async function loadScheduleById(scheduleId: string): Promise<ScheduleWithSelections | null> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("user_schedules")
    .select("*, terms(umd_term_code, year)")
    .eq("id", scheduleId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) normalizeScheduleError(error);
  return data ? mapScheduleRowWithDerivedTerm(data) : null;
}

export async function listAllSchedulesWithSelections(): Promise<ScheduleWithSelections[]> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("user_schedules")
    .select("*, terms(umd_term_code, year)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: true });

  if (error) normalizeScheduleError(error);
  return (data ?? []).map(mapScheduleRowWithDerivedTerm);
}
