import { api } from "@/lib/api";
import { debugWarn } from "@/lib/debug";
import { getFriendlyErrorMessage } from "@/lib/feedback";

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
  | "task_status_updated"
  | (string & {});

export type Notification = {
  id: string;
  user_id: string | null;
  officer_id?: string | null;
  report_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
  report_title?: string | null;
  report_status?: string | null;
};

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function extractError(err: any, fallback: string) {
  return getFriendlyErrorMessage(err, fallback);
}

export async function getUnreadCountApi(): Promise<number> {
  try {
    const res = await api.get<ApiResponse<{ count: number }>>(
      "/notifications/unread-count",
    );

    if (!res.data.success) throw new Error(res.data.error);
    return res.data.data.count;
  } catch (err: any) {
    debugWarn(
      "Failed to load unread notification count",
      extractError(err, "Failed"),
    );
    return 0;
  }
}

export async function getNotificationsApi(params?: {
  unreadOnly?: boolean;
  limit?: number;
}): Promise<Notification[]> {
  try {
    const res = await api.get<ApiResponse<{ notifications: Notification[] }>>(
      "/notifications",
      {
        params: {
          unread_only: params?.unreadOnly,
          limit: params?.limit,
        },
      },
    );

    if (!res.data.success) throw new Error(res.data.error);
    return res.data.data.notifications;
  } catch (err: any) {
    throw new Error(extractError(err, "Failed to load notifications"));
  }
}

export async function markNotificationReadApi(id: string): Promise<void> {
  try {
    const res = await api.patch<ApiResponse<{ success: boolean }>>(
      `/notifications/${id}/read`,
      {},
    );

    if (!res.data.success) throw new Error(res.data.error);
  } catch (err: any) {
    throw new Error(extractError(err, "Failed to mark as read"));
  }
}

export async function markAllNotificationsReadApi(): Promise<void> {
  try {
    const res = await api.patch<ApiResponse<{ updated: number }>>(
      "/notifications/mark-all-read",
      {},
    );

    if (!res.data.success) throw new Error(res.data.error);
  } catch (err: any) {
    throw new Error(extractError(err, "Failed to mark all as read"));
  }
}

export async function clearAllNotificationsApi(): Promise<void> {
  try {
    const res = await api.delete<ApiResponse<{ deleted: number }>>(
      "/notifications/clear-all",
    );
    if (!res.data.success) throw new Error(res.data.error);
  } catch (err: any) {
    throw new Error(extractError(err, "Failed to clear notifications"));
  }
}

export type NotificationPreferences = {
  notify_status_changes: boolean;
  notify_comments: boolean;
  notify_upvote_milestones: boolean;
  notify_badge_earned: boolean;
  notify_nearby_resolved: boolean;
};

export async function getNotificationPreferencesApi(): Promise<NotificationPreferences> {
  try {
    const res = await api.get<
      ApiResponse<{ preferences: NotificationPreferences }>
    >("/notification-preferences");
    if (!res.data.success) throw new Error(res.data.error);
    return res.data.data.preferences;
  } catch (err: any) {
    throw new Error(extractError(err, "Failed to load preferences"));
  }
}

export async function updateNotificationPreferencesApi(
  prefs: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  try {
    const res = await api.put<
      ApiResponse<{ preferences: NotificationPreferences }>
    >("/notification-preferences", prefs);
    if (!res.data.success) throw new Error(res.data.error);
    return res.data.data.preferences;
  } catch (err: any) {
    throw new Error(extractError(err, "Failed to update preferences"));
  }
}
