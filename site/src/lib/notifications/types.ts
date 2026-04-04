export type NotificationType =
  | "registration_window"
  | "seat_availability"
  | "waitlist_movement"
  | "graduation_gaps"
  | "drop_deadlines"
  | "feature_announcements";

export interface NotificationPreferences {
  notifyRegistrationWindow: boolean;
  notifySeatAvailability: boolean;
  notifyWaitlistMovement: boolean;
  notifyGraduationGaps: boolean;
  notifyDropDeadlines: boolean;
  notifyFeatureAnnouncements: boolean;
  notifyEmail: boolean;
  notifyPush: boolean;
  updatedAt: string;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  notifyRegistrationWindow: true,
  notifySeatAvailability: true,
  notifyWaitlistMovement: true,
  notifyGraduationGaps: true,
  notifyDropDeadlines: true,
  notifyFeatureAnnouncements: false,
  notifyEmail: true,
  notifyPush: false,
  updatedAt: new Date().toISOString(),
};