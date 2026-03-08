import { getAuthenticatedUserId, getSupabaseClient } from "../supabase/client";

export interface FourYearPlanRecord {
  id: string;
  user_id: string;
  name: string;
  start_term_id: string | null;
  target_graduation_term_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanTermRecord {
  id: string;
  plan_id: string;
  term_id: string;
  position: number;
  notes: string | null;
}

export interface PlanTermCourseRecord {
  id: string;
  plan_term_id: string;
  course_id: string;
  planned_credits: number | null;
  source_schedule_id: string | null;
  position: number | null;
  status: "planned" | "in_progress" | "completed" | "dropped";
}

export async function listFourYearPlans(): Promise<FourYearPlanRecord[]> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("four_year_plans")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as FourYearPlanRecord[];
}

export async function createFourYearPlan(input: {
  name: string;
  startTermId?: string;
  targetGraduationTermId?: string;
}): Promise<FourYearPlanRecord> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("four_year_plans")
    .insert({
      user_id: userId,
      name: input.name,
      start_term_id: input.startTermId ?? null,
      target_graduation_term_id: input.targetGraduationTermId ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as FourYearPlanRecord;
}

export async function deleteFourYearPlan(planId: string): Promise<void> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { error } = await supabase.from("four_year_plans").delete().eq("id", planId).eq("user_id", userId);
  if (error) {
    throw error;
  }
}

export async function upsertPlanTerm(input: {
  id?: string;
  planId: string;
  termId: string;
  position: number;
  notes?: string;
}): Promise<PlanTermRecord> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("plan_terms")
    .upsert(
      {
        id: input.id,
        plan_id: input.planId,
        term_id: input.termId,
        position: input.position,
        notes: input.notes ?? null,
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as PlanTermRecord;
}

export async function replacePlanTermCourses(
  planTermId: string,
  courses: Array<{
    courseId: string;
    plannedCredits?: number;
    sourceScheduleId?: string;
    position?: number;
    status?: PlanTermCourseRecord["status"];
  }>
): Promise<void> {
  const supabase = getSupabaseClient();

  const { error: deleteError } = await supabase.from("plan_term_courses").delete().eq("plan_term_id", planTermId);
  if (deleteError) {
    throw deleteError;
  }

  if (courses.length === 0) {
    return;
  }

  const payload = courses.map((course) => ({
    plan_term_id: planTermId,
    course_id: course.courseId,
    planned_credits: course.plannedCredits ?? null,
    source_schedule_id: course.sourceScheduleId ?? null,
    position: course.position ?? null,
    status: course.status ?? "planned",
  }));

  const { error: insertError } = await supabase.from("plan_term_courses").insert(payload);
  if (insertError) {
    throw insertError;
  }
}
