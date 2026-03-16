import { getAuthenticatedUserId, getSupabaseClient } from "@/lib/supabase/client";

export type FeedbackType = "feature" | "bug" | "other";

export interface UserFeedbackSubmission {
  id: string;
  userId: string;
  feedbackType: FeedbackType;
  title: string;
  details: string;
  contact?: string;
  pagePath?: string;
  status: "new" | "reviewing" | "resolved" | "closed";
  createdAt: string;
  updatedAt: string;
}

type UserFeedbackRow = {
  id: string;
  user_id: string;
  feedback_type: FeedbackType;
  title: string;
  details: string;
  contact: string | null;
  page_path: string | null;
  status: UserFeedbackSubmission["status"];
  created_at: string;
  updated_at: string;
};

function mapFeedbackRow(row: UserFeedbackRow): UserFeedbackSubmission {
  return {
    id: row.id,
    userId: row.user_id,
    feedbackType: row.feedback_type,
    title: row.title,
    details: row.details,
    contact: row.contact ?? undefined,
    pagePath: row.page_path ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listUserFeedbackSubmissions(): Promise<UserFeedbackSubmission[]> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("user_feedback_submissions")
    .select("id, user_id, feedback_type, title, details, contact, page_path, status, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  return (data ?? []).map((row) => mapFeedbackRow(row as UserFeedbackRow));
}

export async function createUserFeedbackSubmission(input: {
  feedbackType: FeedbackType;
  title: string;
  details: string;
  contact?: string;
  pagePath?: string;
}): Promise<UserFeedbackSubmission> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("user_feedback_submissions")
    .insert({
      user_id: userId,
      feedback_type: input.feedbackType,
      title: input.title,
      details: input.details,
      contact: input.contact ?? null,
      page_path: input.pagePath ?? null,
    })
    .select("id, user_id, feedback_type, title, details, contact, page_path, status, created_at, updated_at")
    .single();

  if (error) throw error;
  return mapFeedbackRow(data as UserFeedbackRow);
}