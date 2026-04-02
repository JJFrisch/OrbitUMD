import { getAuthenticatedUserId, getSupabaseClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/demo/demoMode";
import type { PriorCreditImportOrigin, PriorCreditSource, UserPriorCreditRecord } from "@/lib/types/requirements";

type PriorCreditRow = {
  id: string;
  user_id: string;
  source_type: PriorCreditSource;
  import_origin: PriorCreditImportOrigin;
  original_name: string;
  umd_course_code: string | null;
  course_id: string | null;
  credits: number | null;
  gen_ed_codes: string[] | null;
  term_awarded: string | null;
  grade: string | null;
  counts_toward_progress: boolean | null;
  created_at: string;
};

function mapPriorCreditRow(row: PriorCreditRow): UserPriorCreditRecord {
  return {
    id: row.id,
    userId: row.user_id,
    sourceType: row.source_type,
    importOrigin: row.import_origin,
    originalName: row.original_name,
    umdCourseCode: row.umd_course_code ?? undefined,
    courseId: row.course_id ?? undefined,
    credits: Number(row.credits ?? 0) || 0,
    genEdCodes: Array.isArray(row.gen_ed_codes) ? row.gen_ed_codes.map(String) : [],
    termAwarded: row.term_awarded ?? undefined,
    grade: row.grade ?? undefined,
    countsTowardProgress: row.counts_toward_progress !== false,
    createdAt: row.created_at,
  };
}

export async function listUserPriorCredits(): Promise<UserPriorCreditRecord[]> {
  if (isDemoMode()) {
    const { DEMO_PRIOR_CREDITS } = await import("@/lib/demo/demoData");
    return DEMO_PRIOR_CREDITS;
  }

  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("user_prior_credits")
    .select("id, user_id, source_type, import_origin, original_name, umd_course_code, course_id, credits, gen_ed_codes, term_awarded, grade, counts_toward_progress, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => mapPriorCreditRow(row as PriorCreditRow));
}

export interface SavePriorCreditInput {
  sourceType: PriorCreditSource;
  importOrigin?: PriorCreditImportOrigin;
  originalName: string;
  umdCourseCode?: string;
  credits: number;
  genEdCodes?: string[];
  termAwarded?: string;
  grade?: string;
  countsTowardProgress?: boolean;
}

export async function replacePriorCreditsBySource(
  sourceType: PriorCreditSource,
  credits: SavePriorCreditInput[],
): Promise<void> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { error: deleteError } = await supabase
    .from("user_prior_credits")
    .delete()
    .eq("user_id", userId)
    .eq("source_type", sourceType);

  if (deleteError) throw deleteError;

  if (credits.length === 0) return;

  const payload = credits.map((credit) => ({
    user_id: userId,
    source_type: credit.sourceType,
    import_origin: credit.importOrigin ?? "manual",
    original_name: credit.originalName,
    umd_course_code: credit.umdCourseCode ?? null,
    credits: credit.credits,
    gen_ed_codes: credit.genEdCodes ?? [],
    term_awarded: credit.termAwarded ?? null,
    grade: credit.grade ?? null,
    counts_toward_progress: credit.countsTowardProgress ?? true,
  }));

  const { error: insertError } = await supabase.from("user_prior_credits").insert(payload);
  if (insertError) throw insertError;
}

export async function replacePriorCreditsByImportOrigin(
  importOrigin: PriorCreditImportOrigin,
  credits: SavePriorCreditInput[],
): Promise<void> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { error: deleteError } = await supabase
    .from("user_prior_credits")
    .delete()
    .eq("user_id", userId)
    .eq("import_origin", importOrigin);

  if (deleteError) throw deleteError;

  if (credits.length === 0) return;

  const payload = credits.map((credit) => ({
    user_id: userId,
    source_type: credit.sourceType,
    import_origin: credit.importOrigin ?? importOrigin,
    original_name: credit.originalName,
    umd_course_code: credit.umdCourseCode ?? null,
    credits: credit.credits,
    gen_ed_codes: credit.genEdCodes ?? [],
    term_awarded: credit.termAwarded ?? null,
    grade: credit.grade ?? null,
    counts_toward_progress: credit.countsTowardProgress ?? true,
  }));

  const { error: insertError } = await supabase.from("user_prior_credits").insert(payload);
  if (insertError) throw insertError;
}

export async function replacePriorCreditsBySourceAndImportOrigin(
  sourceType: PriorCreditSource,
  importOrigin: PriorCreditImportOrigin,
  credits: SavePriorCreditInput[],
): Promise<void> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { error: deleteError } = await supabase
    .from("user_prior_credits")
    .delete()
    .eq("user_id", userId)
    .eq("source_type", sourceType)
    .eq("import_origin", importOrigin);

  if (deleteError) throw deleteError;

  if (credits.length === 0) return;

  const payload = credits.map((credit) => ({
    user_id: userId,
    source_type: credit.sourceType,
    import_origin: credit.importOrigin ?? importOrigin,
    original_name: credit.originalName,
    umd_course_code: credit.umdCourseCode ?? null,
    credits: credit.credits,
    gen_ed_codes: credit.genEdCodes ?? [],
    term_awarded: credit.termAwarded ?? null,
    grade: credit.grade ?? null,
    counts_toward_progress: credit.countsTowardProgress ?? true,
  }));

  const { error: insertError } = await supabase.from("user_prior_credits").insert(payload);
  if (insertError) throw insertError;
}

export async function insertPriorCredits(
  credits: SavePriorCreditInput[],
): Promise<UserPriorCreditRecord[]> {
  if (credits.length === 0) return [];

  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const payload = credits.map((credit) => ({
    user_id: userId,
    source_type: credit.sourceType,
    import_origin: credit.importOrigin ?? "manual",
    original_name: credit.originalName,
    umd_course_code: credit.umdCourseCode ?? null,
    credits: credit.credits,
    gen_ed_codes: credit.genEdCodes ?? [],
    term_awarded: credit.termAwarded ?? null,
    grade: credit.grade ?? null,
    counts_toward_progress: credit.countsTowardProgress ?? true,
  }));

  const { data, error } = await supabase
    .from("user_prior_credits")
    .insert(payload)
    .select("id, user_id, source_type, import_origin, original_name, umd_course_code, course_id, credits, gen_ed_codes, term_awarded, grade, counts_toward_progress, created_at");

  if (error) throw error;
  return (data ?? []).map((row) => mapPriorCreditRow(row as PriorCreditRow));
}

export interface UpdatePriorCreditInput {
  originalName?: string;
  umdCourseCode?: string;
  credits?: number;
  genEdCodes?: string[];
  termAwarded?: string;
  grade?: string;
  countsTowardProgress?: boolean;
}

export async function updatePriorCredit(
  priorCreditId: string,
  changes: UpdatePriorCreditInput,
): Promise<UserPriorCreditRecord> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const payload: Record<string, unknown> = {};
  if (changes.originalName !== undefined) payload.original_name = changes.originalName;
  if (changes.umdCourseCode !== undefined) payload.umd_course_code = changes.umdCourseCode || null;
  if (changes.credits !== undefined) payload.credits = changes.credits;
  if (changes.genEdCodes !== undefined) payload.gen_ed_codes = changes.genEdCodes;
  if (changes.termAwarded !== undefined) payload.term_awarded = changes.termAwarded || null;
  if (changes.grade !== undefined) payload.grade = changes.grade || null;
  if (changes.countsTowardProgress !== undefined) payload.counts_toward_progress = changes.countsTowardProgress;

  const { data, error } = await supabase
    .from("user_prior_credits")
    .update(payload)
    .eq("id", priorCreditId)
    .eq("user_id", userId)
    .select("id, user_id, source_type, import_origin, original_name, umd_course_code, course_id, credits, gen_ed_codes, term_awarded, grade, counts_toward_progress, created_at")
    .single();

  if (error) throw error;
  return mapPriorCreditRow(data as PriorCreditRow);
}

export async function deletePriorCredit(priorCreditId: string): Promise<void> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("user_prior_credits")
    .delete()
    .eq("id", priorCreditId)
    .eq("user_id", userId);

  if (error) throw error;
}
