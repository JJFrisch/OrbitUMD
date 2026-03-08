import { getAuthenticatedUserId, getSupabaseClient } from "../supabase/client";

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
    throw error;
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
    throw error;
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
    throw error;
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
    throw error;
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
    throw ownershipError;
  }

  if (!ownedSchedule) {
    throw new Error("Schedule not found for current user");
  }

  const { error: deleteError } = await supabase.from("schedule_sections").delete().eq("schedule_id", scheduleId);
  if (deleteError) {
    throw deleteError;
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
    throw insertError;
  }
}
