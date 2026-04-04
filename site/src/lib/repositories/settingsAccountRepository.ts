import { getSupabaseClient } from "@/lib/supabase/client";

export const SETTINGS_BACKUP_KEY = "orbitumd_settings_backup_v1";

export interface SettingsAccountBackup {
  fullName?: string;
  email?: string;
  uid?: string;
  defaultTerm?: string;
  scheduleView?: string;
  expectedGraduationTermId?: string | null;
  expectedGraduationSeason?: string | null;
  expectedGraduationYear?: string | null;
  notifyRegistrationWindow?: boolean;
  notifySeatAvailability?: boolean;
  notifyWaitlistMovement?: boolean;
  notifyGraduationGaps?: boolean;
  notifyDropDeadlines?: boolean;
  notifyFeatureAnnouncements?: boolean;
  notifyEmail?: boolean;
  notifyPush?: boolean;
  shareAnonymousUsage?: boolean;
  storeScheduleHistory?: boolean;
  googleCalendarConnected?: boolean;
  outlookConnected?: boolean;
  canvasConnected?: boolean;
  updatedAt?: string;
}

export function readSettingsAccountBackupFromUser(authUser: any): SettingsAccountBackup {
  const candidate = authUser?.user_metadata?.[SETTINGS_BACKUP_KEY];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return {};
  }
  return candidate as SettingsAccountBackup;
}

export async function loadSettingsAccountBackup(authUser?: any): Promise<SettingsAccountBackup> {
  if (authUser) {
    return readSettingsAccountBackupFromUser(authUser);
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return readSettingsAccountBackupFromUser(data.user);
}

export async function saveSettingsAccountBackup(patch: Partial<SettingsAccountBackup>): Promise<void> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  const authUser = data.user;
  if (!authUser) return;

  const current = readSettingsAccountBackupFromUser(authUser);
  const nextBackup: SettingsAccountBackup = {
    ...current,
    ...patch,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  };

  const { error: updateError } = await supabase.auth.updateUser({
    data: {
      [SETTINGS_BACKUP_KEY]: nextBackup,
    },
  });

  if (updateError) throw updateError;
}