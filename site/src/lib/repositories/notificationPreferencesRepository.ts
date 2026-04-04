import { getAuthenticatedUserId, getSupabaseClient } from "@/lib/supabase/client";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@/lib/notifications/types";
import {
  readSettingsAccountBackupFromUser,
  saveSettingsAccountBackup,
  type SettingsAccountBackup,
} from "@/lib/repositories/settingsAccountRepository";

function readBooleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizePreferences(raw: Partial<NotificationPreferences>): NotificationPreferences {
  return {
    notifyRegistrationWindow: readBooleanSetting(raw.notifyRegistrationWindow, DEFAULT_NOTIFICATION_PREFERENCES.notifyRegistrationWindow),
    notifySeatAvailability: readBooleanSetting(raw.notifySeatAvailability, DEFAULT_NOTIFICATION_PREFERENCES.notifySeatAvailability),
    notifyWaitlistMovement: readBooleanSetting(raw.notifyWaitlistMovement, DEFAULT_NOTIFICATION_PREFERENCES.notifyWaitlistMovement),
    notifyGraduationGaps: readBooleanSetting(raw.notifyGraduationGaps, DEFAULT_NOTIFICATION_PREFERENCES.notifyGraduationGaps),
    notifyDropDeadlines: readBooleanSetting(raw.notifyDropDeadlines, DEFAULT_NOTIFICATION_PREFERENCES.notifyDropDeadlines),
    notifyFeatureAnnouncements: readBooleanSetting(raw.notifyFeatureAnnouncements, DEFAULT_NOTIFICATION_PREFERENCES.notifyFeatureAnnouncements),
    notifyEmail: readBooleanSetting(raw.notifyEmail, DEFAULT_NOTIFICATION_PREFERENCES.notifyEmail),
    notifyPush: readBooleanSetting(raw.notifyPush, DEFAULT_NOTIFICATION_PREFERENCES.notifyPush),
    updatedAt: typeof raw.updatedAt === "string" && raw.updatedAt.trim().length > 0
      ? raw.updatedAt
      : new Date().toISOString(),
  };
}

function metadataToPreferences(metadata: SettingsAccountBackup): NotificationPreferences {
  return normalizePreferences({
    notifyRegistrationWindow: metadata.notifyRegistrationWindow,
    notifySeatAvailability: metadata.notifySeatAvailability,
    notifyWaitlistMovement: metadata.notifyWaitlistMovement,
    notifyGraduationGaps: metadata.notifyGraduationGaps,
    notifyDropDeadlines: metadata.notifyDropDeadlines,
    notifyFeatureAnnouncements: metadata.notifyFeatureAnnouncements,
    notifyEmail: metadata.notifyEmail,
    notifyPush: metadata.notifyPush,
  });
}

export async function loadNotificationPreferences(): Promise<NotificationPreferences> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const [{ data: authData, error: authError }, { data: row, error: rowError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("notification_preferences")
      .select("notify_registration_window, notify_seat_availability, notify_waitlist_movement, notify_graduation_gaps, notify_drop_deadlines, notify_feature_announcements, delivery_email, delivery_push, updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (authError) throw authError;
  if (rowError) throw rowError;

  if (row) {
    return normalizePreferences({
      notifyRegistrationWindow: row.notify_registration_window,
      notifySeatAvailability: row.notify_seat_availability,
      notifyWaitlistMovement: row.notify_waitlist_movement,
      notifyGraduationGaps: row.notify_graduation_gaps,
      notifyDropDeadlines: row.notify_drop_deadlines,
      notifyFeatureAnnouncements: row.notify_feature_announcements,
      notifyEmail: row.delivery_email,
      notifyPush: row.delivery_push,
      updatedAt: row.updated_at,
    });
  }

  const metadataBackup = readSettingsAccountBackupFromUser(authData.user);
  const bootstrap = metadataToPreferences(metadataBackup);

  const { error: upsertError } = await supabase.from("notification_preferences").upsert({
    user_id: userId,
    notify_registration_window: bootstrap.notifyRegistrationWindow,
    notify_seat_availability: bootstrap.notifySeatAvailability,
    notify_waitlist_movement: bootstrap.notifyWaitlistMovement,
    notify_graduation_gaps: bootstrap.notifyGraduationGaps,
    notify_drop_deadlines: bootstrap.notifyDropDeadlines,
    notify_feature_announcements: bootstrap.notifyFeatureAnnouncements,
    delivery_email: bootstrap.notifyEmail,
    delivery_push: bootstrap.notifyPush,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (upsertError) throw upsertError;
  return bootstrap;
}

export async function saveNotificationPreferences(preferences: NotificationPreferences): Promise<void> {
  const userId = await getAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const normalized = normalizePreferences(preferences);
  const { error } = await supabase.from("notification_preferences").upsert({
    user_id: userId,
    notify_registration_window: normalized.notifyRegistrationWindow,
    notify_seat_availability: normalized.notifySeatAvailability,
    notify_waitlist_movement: normalized.notifyWaitlistMovement,
    notify_graduation_gaps: normalized.notifyGraduationGaps,
    notify_drop_deadlines: normalized.notifyDropDeadlines,
    notify_feature_announcements: normalized.notifyFeatureAnnouncements,
    delivery_email: normalized.notifyEmail,
    delivery_push: normalized.notifyPush,
    updated_at: normalized.updatedAt,
  }, { onConflict: "user_id" });

  if (error) throw error;

  await saveSettingsAccountBackup({
    notifyRegistrationWindow: normalized.notifyRegistrationWindow,
    notifySeatAvailability: normalized.notifySeatAvailability,
    notifyWaitlistMovement: normalized.notifyWaitlistMovement,
    notifyGraduationGaps: normalized.notifyGraduationGaps,
    notifyDropDeadlines: normalized.notifyDropDeadlines,
    notifyFeatureAnnouncements: normalized.notifyFeatureAnnouncements,
    notifyEmail: normalized.notifyEmail,
    notifyPush: normalized.notifyPush,
    updatedAt: normalized.updatedAt,
  });
}