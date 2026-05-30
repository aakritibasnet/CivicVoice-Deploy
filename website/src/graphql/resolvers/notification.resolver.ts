import type { GQLContext } from "../context";
import { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/src/lib/prisma";

const NOTIFICATION_CHANNEL = "notification_events";

type NotificationRecipientRole = "user" | "officer";

type CreatedNotificationRow = {
  id: string;
  user_id: string | null;
  officer_id: string | null;
  report_id: string | null;
  title: string;
  message: string;
  type: string;
  link: string | null;
  metadata: Prisma.JsonValue | null;
  is_read: boolean;
  created_at: Date;
};

function toRealtimeMetadata(
  value: Prisma.JsonValue | Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export const notificationResolvers = {
  Query: {
    notifications: async (_: unknown, __: unknown, context: GQLContext) => {
      if (!context.user) {
        throw new Error("Unauthorized: Please log in");
      }

      const notifications = await context.prisma.notifications.findMany({
        where: {
          user_id: context.user.id,
        },
        orderBy: {
          created_at: "desc",
        },
      });

      return notifications;
    },

    unreadNotificationCount: async (
      _: unknown,
      __: unknown,
      context: GQLContext
    ) => {
      if (!context.user) {
        throw new Error("Unauthorized: Please log in");
      }

      const count = await context.prisma.notifications.count({
        where: {
          user_id: context.user.id,
          is_read: false,
        },
      });

      return count;
    },
  },

  Mutation: {
    markNotificationAsRead: async (
      _: unknown,
      { id }: { id: string },
      context: GQLContext
    ) => {
      if (!context.user) {
        throw new Error("Unauthorized: Please log in");
      }

      const notification = await context.prisma.notifications.findUnique({
        where: { id },
      });

      if (!notification) {
        throw new Error("Notification not found");
      }

      if (notification.user_id !== context.user.id) {
        throw new Error("Forbidden: You can only update your own notifications");
      }

      const updatedNotification = await context.prisma.notifications.update({
        where: { id },
        data: { is_read: true },
      });

      return updatedNotification;
    },

    markAllNotificationsAsRead: async (
      _: unknown,
      __: unknown,
      context: GQLContext
    ) => {
      if (!context.user) {
        throw new Error("Unauthorized: Please log in");
      }

      await context.prisma.notifications.updateMany({
        where: {
          user_id: context.user.id,
          is_read: false,
        },
        data: { is_read: true },
      });

      return true;
    },

    deleteNotification: async (
      _: unknown,
      { id }: { id: string },
      context: GQLContext
    ) => {
      if (!context.user) {
        throw new Error("Unauthorized: Please log in");
      }

      const notification = await context.prisma.notifications.findUnique({
        where: { id },
      });

      if (!notification) {
        throw new Error("Notification not found");
      }

      if (notification.user_id !== context.user.id) {
        throw new Error("Forbidden: You can only delete your own notifications");
      }

      await context.prisma.notifications.delete({
        where: { id },
      });

      return true;
    },
  },
};

// Helper function to create a notification (can be called from other resolvers)
export async function createNotification({
  user_id,
  recipient_role = "user",
  report_id,
  title,
  message,
  type = "info",
  link,
  metadata,
}: {
  user_id: string;
  recipient_role?: NotificationRecipientRole;
  report_id?: string | null;
  title: string;
  message: string;
  type?:
    | "info"
    | "success"
    | "warning"
    | "error"
    | "status_change"
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
  link?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const resolvedLink =
    link !== undefined
      ? link
      : report_id
        ? `/reports/${report_id}`
        : null;

  const metadataJson = JSON.stringify(metadata ?? {});
  const recipientUserId = recipient_role === "officer" ? null : user_id;
  const recipientOfficerId = recipient_role === "officer" ? user_id : null;

  const rows = await prisma.$queryRaw<CreatedNotificationRow[]>(Prisma.sql`
    INSERT INTO notifications (
      user_id,
      officer_id,
      report_id,
      title,
      message,
      type,
      link,
      metadata,
      is_read
    )
    VALUES (
      CAST(${recipientUserId} AS UUID),
      CAST(${recipientOfficerId} AS UUID),
      CAST(${report_id ?? null} AS UUID),
      ${title},
      ${message},
      ${type},
      ${resolvedLink},
      CAST(${metadataJson} AS JSONB),
      FALSE
    )
    RETURNING
      id,
      user_id,
      officer_id,
      report_id,
      title,
      message,
      type,
      link,
      metadata,
      is_read,
      created_at
  `);

  const created = rows[0];

  if (!created) {
    throw new Error("Failed to create notification");
  }

  await prisma.$executeRaw(Prisma.sql`
    SELECT pg_notify(
      ${NOTIFICATION_CHANNEL},
      ${JSON.stringify({
        action: "created",
        notification: {
          id: created.id,
          user_id: created.user_id,
          officer_id: created.officer_id,
          report_id: created.report_id,
          title: created.title,
          message: created.message,
          type: created.type,
          link: created.link,
          metadata: toRealtimeMetadata(created.metadata),
          is_read: created.is_read,
          created_at: created.created_at.toISOString(),
        },
      })}
    )
  `);

  return created;
}
