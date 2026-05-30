import { prisma } from "@/lib/prisma";
import { pool } from "@/db/pool";
const NOTIFICATION_CHANNEL = "notification_events";
function isOfficerRole(role) {
    return role === "officer";
}
function toMetadataObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value;
}
function toNotificationRow(row, report) {
    return {
        id: row.id,
        user_id: row.user_id,
        officer_id: row.officer_id,
        report_id: row.report_id,
        type: row.type,
        title: row.title,
        message: row.message,
        link: row.link,
        metadata: toMetadataObject(row.metadata),
        is_read: row.is_read,
        created_at: row.created_at,
        report_title: report?.title ?? null,
        report_status: report?.status ?? null,
    };
}
function buildRecipientWhere(userId, role) {
    return isOfficerRole(role) ? { officer_id: userId } : { user_id: userId };
}
async function publishNotificationEvent(payload) {
    await pool.query("SELECT pg_notify($1, $2)", [
        NOTIFICATION_CHANNEL,
        JSON.stringify(payload),
    ]);
}
async function getOrCreatePreferences(userId) {
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
function isTypeEnabled(prefs, type) {
    switch (type) {
        case "status_change":
            return prefs.notify_status_changes;
        case "comment":
        case "comment_reply":
        case "report_post_comment":
        case "report_post_reply":
            return prefs.notify_comments;
        case "upvote_milestone":
            return prefs.notify_upvote_milestones;
        case "badge_earned":
        case "leaderboard_rank":
            return prefs.notify_badge_earned;
        case "nearby_resolved":
            return prefs.notify_nearby_resolved;
        case "report_escalated":
        case "report_returned":
            return prefs.notify_status_changes;
        case "report_assigned":
        case "task_assigned":
        case "task_returned":
        case "task_invalidated":
        case "task_escalated":
        case "task_completed":
        case "task_reassigned":
        case "task_comment":
        case "task_status_updated":
            return true;
        // Chat notifications: presence/mute suppression is decided upstream in
        // chat-notify.service; if we reach here the message is meant to land.
        case "chat_message":
        case "chat_mention":
        case "chat_escalated":
        case "chat_announcement":
        case "chat_sla_overdue":
        case "chat_closed":
            return true;
        default:
            return true;
    }
}
export async function createNotification(params) {
    const recipientRole = params.recipientRole ?? "citizen";
    const isOfficerRecipient = isOfficerRole(recipientRole);
    if (!isOfficerRecipient) {
        const prefs = await getOrCreatePreferences(params.userId);
        if (!isTypeEnabled(prefs, params.type)) {
            return null;
        }
    }
    const link = params.link !== undefined
        ? params.link
        : params.reportId
            ? `/reports/${params.reportId}`
            : null;
    const created = await prisma.notifications.create({
        data: {
            user_id: isOfficerRecipient ? null : params.userId,
            officer_id: isOfficerRecipient ? params.userId : null,
            report_id: params.reportId ?? null,
            type: params.type,
            title: params.title,
            message: params.message,
            link,
            metadata: (params.metadata ?? {}),
        },
    });
    const row = toNotificationRow(created);
    try {
        await publishNotificationEvent({
            action: "created",
            notification: row,
        });
    }
    catch (error) {
        console.error("Failed to publish notification event:", error);
    }
    return row;
}
export async function getNotificationsForUser(params) {
    const { userId, recipientRole, unreadOnly, limit = 50 } = params;
    const rows = await prisma.notifications.findMany({
        where: {
            ...buildRecipientWhere(userId, recipientRole),
            ...(unreadOnly ? { is_read: false } : {}),
        },
        include: {
            reports: {
                select: {
                    title: true,
                    status: true,
                },
            },
        },
        orderBy: { created_at: "desc" },
        take: limit,
    });
    return rows.map((row) => toNotificationRow(row, {
        title: row.reports?.title ?? null,
        status: row.reports?.status ?? null,
    }));
}
export async function getUnreadCountForUser(userId, recipientRole) {
    return prisma.notifications.count({
        where: {
            ...buildRecipientWhere(userId, recipientRole),
            is_read: false,
        },
    });
}
export async function markNotificationAsRead(params) {
    const { id, userId, recipientRole } = params;
    const result = await prisma.notifications.updateMany({
        where: {
            id,
            ...buildRecipientWhere(userId, recipientRole),
            is_read: false,
        },
        data: {
            is_read: true,
        },
    });
    return result.count > 0;
}
export async function markAllNotificationsAsRead(userId, recipientRole) {
    const result = await prisma.notifications.updateMany({
        where: {
            ...buildRecipientWhere(userId, recipientRole),
            is_read: false,
        },
        data: {
            is_read: true,
        },
    });
    return result.count;
}
export async function deleteOldNotifications() {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await prisma.notifications.deleteMany({
        where: {
            created_at: {
                lt: cutoff,
            },
        },
    });
    return result.count;
}
export async function clearAllNotifications(userId, recipientRole) {
    const result = await prisma.notifications.deleteMany({
        where: buildRecipientWhere(userId, recipientRole),
    });
    return result.count;
}
