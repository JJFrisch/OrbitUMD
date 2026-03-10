import { getAuthenticatedUserId, getSupabaseClient } from "@/lib/supabase/client";
import type { PriorCreditSource, UserPriorCreditRecord } from "@/lib/types/requirements";

export async function listUserPriorCredits(): Promise<UserPriorCreditRecord[]> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("user_prior_credits")
    .select("id, user_id, source_type, original_name, umd_course_code, course_id, credits, gen_ed_codes, term_awarded, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    sourceType: row.source_type,
    originalName: row.original_name,
    umdCourseCode: row.umd_course_code ?? undefined,
    courseId: row.course_id ?? undefined,
    credits: Number(row.credits ?? 0) || 0,
    genEdCodes: Array.isArray(row.gen_ed_codes) ? row.gen_ed_codes.map(String) : [],
    termAwarded: row.term_awarded ?? undefined,
    createdAt: row.created_at,
  })) as UserPriorCreditRecord[];
}

export interface SavePriorCreditInput {
  sourceType: PriorCreditSource;
  originalName: string;
  umdCourseCode?: string;
  credits: number;
  genEdCodes?: string[];
  termAwarded?: string;
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
    original_name: credit.originalName,
    umd_course_code: credit.umdCourseCode ?? null,
    credits: credit.credits,
    gen_ed_codes: credit.genEdCodes ?? [],
    term_awarded: credit.termAwarded ?? null,
  }));

  const { error: insertError } = await supabase.from("user_prior_credits").insert(payload);
  if (insertError) throw insertError;
}
