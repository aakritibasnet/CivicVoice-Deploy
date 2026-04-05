import { prisma } from "@/lib/prisma";
import type { NotificationPreferencesRow } from "./notifications.service";

export async function getNotificationPreferences(
  userId: string, // ✅ Changed to string
): Promise<NotificationPreferencesRow> {
  return prisma.notification_preferences.upsert({
    where: { user_id: userId },
    update: {},
    create: {
      user_id: userId,
      notify_status_changes: true,
      notify_comments: true,
      notify_upvote_milestones: true,
      notify_badge_earned: true,
      notify_nearby_resolved: false,
    },
  });
}

type PreferencesUpdate = Partial<
  Pick<
    NotificationPreferencesRow,
    | "notify_status_changes"
    | "notify_comments"
    | "notify_upvote_milestones"
    | "notify_badge_earned"
    | "notify_nearby_resolved"
  >
>;

export async function updateNotificationPreferences(
  userId: string, // ✅ Changed to string
  patch: PreferencesUpdate,
): Promise<NotificationPreferencesRow> {
  const entries = Object.entries(patch).filter(
    ([, value]) => typeof value === "boolean",
  ) as [keyof PreferencesUpdate, boolean][];

  if (!entries.length) {
    return getNotificationPreferences(userId);
  }

  const data: Record<string, boolean | Date> = {};
  for (const [key, value] of entries) {
    data[key] = value;
  }
  data.updated_at = new Date();

  return prisma.notification_preferences.upsert({
    where: { user_id: userId },
    update: data,
    create: {
      user_id: userId,
      notify_status_changes: patch.notify_status_changes ?? true,
      notify_comments: patch.notify_comments ?? true,
      notify_upvote_milestones: patch.notify_upvote_milestones ?? true,
      notify_badge_earned: patch.notify_badge_earned ?? true,
      notify_nearby_resolved: patch.notify_nearby_resolved ?? false,
      updated_at: new Date(),
    },
  });
}
