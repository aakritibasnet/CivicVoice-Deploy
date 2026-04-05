import { prisma } from "@/lib/prisma";
export async function getNotificationPreferences(userId) {
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
export async function updateNotificationPreferences(userId, // ✅ Changed to string
patch) {
    const entries = Object.entries(patch).filter(([, value]) => typeof value === "boolean");
    if (!entries.length) {
        return getNotificationPreferences(userId);
    }
    const data = {};
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
