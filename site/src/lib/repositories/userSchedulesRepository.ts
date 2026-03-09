import { getAuthenticatedUserId, getSupabaseClient } from "../supabase/client";

function normalizeScheduleError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  if (message.toLowerCase().includes("auth session missing")) {
    throw new Error("Please sign in to save and load schedules.");
  }
  throw error;
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
    .single();

  if (error) {
    normalizeScheduleError(error);
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

  // We need a term_id for the FK. Try to resolve one, or create a placeholder.
  const { data: term } = await supabase
    .from("terms")
    .select("id")
    .eq("umd_term_code", `${input.termYear}${input.termCode}`)
    .maybeSingle();

  // If no term row exists, try a looser match or insert one
  let termId: string;
  if (term) {
    termId = term.id;
  } else {
    const seasonMap: Record<string, string> = {
      "01": "spring", "05": "summer", "08": "fall", "12": "winter",
    };
    const { data: newTerm, error: termInsertErr } = await supabase
      .from("terms")
      .upsert({
        umd_term_code: `${input.termYear}${input.termCode}`,
        year: input.termYear,
        season: seasonMap[input.termCode] ?? "fall",
      }, { onConflict: "umd_term_code" })
      .select("id")
      .single();

    if (termInsertErr) normalizeScheduleError(termInsertErr);
    termId = newTerm.id;
  }

  const payload: Record<string, unknown> = {
    user_id: userId,
    term_id: termId,
    name: input.name,
    is_primary: input.isPrimary ?? false,
    term_code: input.termCode,
    term_year: input.termYear,
    selections_json: input.selectionsJson,
  };

  if (input.id) {
    payload.id = input.id;
  }

  const { data, error } = await supabase
    .from("user_schedules")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) normalizeScheduleError(error);
  return data as ScheduleWithSelections;
}

export async function listSchedulesForTerm(
  termCode: string,
  termYear: number,
): Promise<ScheduleWithSelections[]> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("user_schedules")
    .select("*")
    .eq("user_id", userId)
    .eq("term_code", termCode)
    .eq("term_year", termYear)
    .order("updated_at", { ascending: false });

  if (error) normalizeScheduleError(error);
  return (data ?? []) as ScheduleWithSelections[];
}

export async function loadScheduleById(scheduleId: string): Promise<ScheduleWithSelections | null> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("user_schedules")
    .select("*")
    .eq("id", scheduleId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) normalizeScheduleError(error);
  return data as ScheduleWithSelections | null;
}

export async function listAllSchedulesWithSelections(): Promise<ScheduleWithSelections[]> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("user_schedules")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: true });

  if (error) normalizeScheduleError(error);
  return (data ?? []) as ScheduleWithSelections[];
}
