import { Prisma } from "@/generated/prisma-client";
import { prisma } from "@/lib/prisma";
import { pool } from "@/db/pool";

const NOTIFICATION_CHANNEL = "notification_events";

export type RecipientRole =
  | "citizen"
  | "ward"
  | "municipality"
  | "admin"
  | "officer";

export type NotificationType =
  | "status_change"
  | "comment"
  | "comment_reply"
  | "report_post_comment"
  | "report_post_reply"
  | "upvote_milestone"
  | "badge_earned"
  | "leaderboard_rank"
  | "nearby_resolved"
  | "report_assigned"
  | "report_escalated"
  | "report_returned"
  | "task_assigned"
  | "task_returned"
  | "task_invalidated"
  | "task_escalated"
  | "task_completed"
  | "task_reassigned"
  | "task_comment"
  | "task_status_updated";

export type NotificationRow = {
  id: string;
  user_id: string | null;
  officer_id: string | null;
  report_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: Date;
  report_title?: string | null;
  report_status?: string | null;
};

export type NotificationPreferencesRow = {
  user_id: string;
  notify_status_changes: boolean;
  notify_comments: boolean;
  notify_upvote_milestones: boolean;
  notify_badge_earned: boolean;
  notify_nearby_resolved: boolean;
  updated_at: Date;
};

function isOfficerRole(role?: string | null): boolean {
  return role === "officer";
}

function toMetadataObject(
  value: Prisma.JsonValue | Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toNotificationRow(
  row: {
    id: string;
    user_id: string | null;
    officer_id: string | null;
    report_id: string | null;
    type: string;
    title: string;
    message: string;
    link: string | null;
    metadata: Prisma.JsonValue | null;
    is_read: boolean;
    created_at: Date;
  },
  report?: { title: string | null; status: string | null } | null,
): NotificationRow {
  return {
    id: row.id,
    user_id: row.user_id,
    officer_id: row.officer_id,
    report_id: row.report_id,
    type: row.type as NotificationType,
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

function buildRecipientWhere(userId: string, role?: string | null) {
  return isOfficerRole(role) ? { officer_id: userId } : { user_id: userId };
}

async function publishNotificationEvent(payload: {
  action: "created";
  notification: NotificationRow;
}) {
  await pool.query("SELECT pg_notify($1, $2)", [
    NOTIFICATION_CHANNEL,
    JSON.stringify(payload),
  ]);
}

async function getOrCreatePreferences(
  userId: string,
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

function isTypeEnabled(
  prefs: NotificationPreferencesRow,
  type: NotificationType,
): boolean {
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
    default:
      return true;
  }
}

export async function createNotification(params: {
  userId: string;
  recipientRole?: RecipientRole;
  reportId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  iconName?: string;
  link?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<NotificationRow | null> {
  const recipientRole = params.recipientRole ?? "citizen";
  const isOfficerRecipient = isOfficerRole(recipientRole);

  if (!isOfficerRecipient) {
    const prefs = await getOrCreatePreferences(params.userId);
    if (!isTypeEnabled(prefs, params.type)) {
      return null;
    }
  }

  const link =
    params.link !== undefined
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
      metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });

  const row = toNotificationRow(created);

  try {
    await publishNotificationEvent({
      action: "created",
      notification: row,
    });
  } catch (error) {
    console.error("Failed to publish notification event:", error);
  }

  return row;
}

export async function getNotificationsForUser(params: {
  userId: string;
  recipientRole?: string | null;
  unreadOnly?: boolean;
  limit?: number;
}): Promise<NotificationRow[]> {
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

  return rows.map((row) =>
    toNotificationRow(row, {
      title: row.reports?.title ?? null,
      status: row.reports?.status ?? null,
    }),
  );
}

export async function getUnreadCountForUser(
  userId: string,
  recipientRole?: string | null,
): Promise<number> {
  return prisma.notifications.count({
    where: {
      ...buildRecipientWhere(userId, recipientRole),
      is_read: false,
    },
  });
}

export async function markNotificationAsRead(params: {
  id: string;
  userId: string;
  recipientRole?: string | null;
}): Promise<boolean> {
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

export async function markAllNotificationsAsRead(
  userId: string,
  recipientRole?: string | null,
): Promise<number> {
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

export async function deleteOldNotifications(): Promise<number> {
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

export async function clearAllNotifications(
  userId: string,
  recipientRole?: string | null,
): Promise<number> {
  const result = await prisma.notifications.deleteMany({
    where: buildRecipientWhere(userId, recipientRole),
  });

  return result.count;
}
