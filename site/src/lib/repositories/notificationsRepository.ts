import type { NotificationType } from "@/lib/notifications/types";
import { getAuthenticatedUserId, getSupabaseClient } from "@/lib/supabase/client";

export interface NotificationRecord {
  id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  metadata: Record<string, unknown>;
  dedupeKey: string | null;
  readAt: string | null;
  createdAt: string;
}

interface InsertNotificationInput {
  type: NotificationType;
  title: string;
  message?: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
}

function mapRowToRecord(row: any): NotificationRecord {
  return {
    id: String(row.id),
    type: row.notification_type as NotificationType,
    title: String(row.title ?? ""),
    message: row.message ? String(row.message) : null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {},
    dedupeKey: row.dedupe_key ? String(row.dedupe_key) : null,
    readAt: row.read_at ? String(row.read_at) : null,
    createdAt: String(row.created_at),
  };
}

export async function listNotifications(limit = 40): Promise<NotificationRecord[]> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("notifications")
    .select("id, notification_type, title, message, metadata, dedupe_key, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(mapRowToRecord);
}

export async function countUnreadNotifications(): Promise<number> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) throw error;
}

export async function insertNotification(input: InsertNotificationInput): Promise<{ created: boolean; notification: NotificationRecord | null }> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const payload = {
    user_id: userId,
    notification_type: input.type,
    title: input.title,
    message: input.message ?? null,
    metadata: input.metadata ?? {},
    dedupe_key: input.dedupeKey ?? null,
  };

  const { data, error } = await supabase
    .from("notifications")
    .insert(payload)
    .select("id, notification_type, title, message, metadata, dedupe_key, read_at, created_at")
    .maybeSingle();

  if (!error) {
    return {
      created: true,
      notification: data ? mapRowToRecord(data) : null,
    };
  }

  const isDuplicate = error.code === "23505";
  if (!isDuplicate || !input.dedupeKey) {
    throw error;
  }

  const { data: existing, error: existingError } = await supabase
    .from("notifications")
    .select("id, notification_type, title, message, metadata, dedupe_key, read_at, created_at")
    .eq("user_id", userId)
    .eq("dedupe_key", input.dedupeKey)
    .maybeSingle();

  if (existingError) throw existingError;

  return {
    created: false,
    notification: existing ? mapRowToRecord(existing) : null,
  };
}