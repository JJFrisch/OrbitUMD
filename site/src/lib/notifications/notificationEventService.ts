import {
  type NotificationPreferences,
  type NotificationType,
} from "@/lib/notifications/types";
import {
  insertNotification,
  type NotificationRecord,
} from "@/lib/repositories/notificationsRepository";
import { loadNotificationPreferences } from "@/lib/repositories/notificationPreferencesRepository";
import { toast } from "sonner";

const PREF_KEY_BY_TYPE: Record<NotificationType, keyof NotificationPreferences> = {
  registration_window: "notifyRegistrationWindow",
  seat_availability: "notifySeatAvailability",
  waitlist_movement: "notifyWaitlistMovement",
  graduation_gaps: "notifyGraduationGaps",
  drop_deadlines: "notifyDropDeadlines",
  feature_announcements: "notifyFeatureAnnouncements",
};

export interface NotificationEventInput {
  type: NotificationType;
  title: string;
  message?: string;
  metadata?: Record<string, unknown>;
  dedupeScope?: string;
  dedupeKey?: string;
  emitToast?: boolean;
}

export type NotificationEventStatus = "created" | "duplicate" | "skipped";

export interface NotificationEventResult {
  status: NotificationEventStatus;
  reason?: "preference_disabled" | "unauthenticated";
  dedupeKey: string;
  notification: NotificationRecord | null;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildDedupeKey(input: NotificationEventInput): string {
  if (input.dedupeKey && input.dedupeKey.trim().length > 0) {
    return input.dedupeKey.trim();
  }

  const metadataKey = input.metadata ? stableStringify(input.metadata) : "{}";
  const scope = input.dedupeScope?.trim() || "global";
  return [input.type, scope, input.title.trim(), input.message?.trim() ?? "", metadataKey].join("::");
}

function emitToastForNotification(type: NotificationType, title: string, message?: string): void {
  if (type === "drop_deadlines" || type === "registration_window") {
    toast.warning(title, { description: message });
    return;
  }

  if (type === "graduation_gaps" || type === "seat_availability" || type === "waitlist_movement") {
    toast.info(title, { description: message });
    return;
  }

  toast.success(title, { description: message });
}

export async function ingestNotificationEvent(input: NotificationEventInput): Promise<NotificationEventResult> {
  const dedupeKey = buildDedupeKey(input);

  let preferences: NotificationPreferences;
  try {
    preferences = await loadNotificationPreferences();
  } catch {
    return {
      status: "skipped",
      reason: "unauthenticated",
      dedupeKey,
      notification: null,
    };
  }

  const prefKey = PREF_KEY_BY_TYPE[input.type];
  if (!preferences[prefKey]) {
    return {
      status: "skipped",
      reason: "preference_disabled",
      dedupeKey,
      notification: null,
    };
  }

  const created = await insertNotification({
    type: input.type,
    title: input.title,
    message: input.message,
    metadata: input.metadata,
    dedupeKey,
  });

  if (created.created && input.emitToast !== false) {
    emitToastForNotification(input.type, input.title, input.message);
  }

  return {
    status: created.created ? "created" : "duplicate",
    dedupeKey,
    notification: created.notification,
  };
}