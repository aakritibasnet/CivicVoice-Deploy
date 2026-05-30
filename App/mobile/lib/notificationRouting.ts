import { router } from "expo-router";

type NotificationNavigationInput = {
  link?: string | null;
  type?: string | null;
  reportId?: string | number | null;
  taskId?: string | number | null;
  metadata?: Record<string, unknown> | null;
};

function toId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return null;
}

export function navigateFromNotification(input: NotificationNavigationInput) {
  const metadata = input.metadata ?? {};
  const rawLink =
    typeof input.link === "string" && input.link.trim()
      ? input.link
      : typeof metadata.link === "string" && metadata.link.trim()
        ? metadata.link
        : null;

  // Chat notifications: prefer the explicit chatId, else parse a web link
  // like /dashboard/chat/<id>. Route to the mobile chat room.
  const chatId =
    toId(metadata.chatId) ??
    (rawLink ? rawLink.match(/\/chat\/([^/]+)$/)?.[1] ?? null : null);
  if (
    chatId &&
    (String(input.type ?? "").startsWith("chat_") ||
      (typeof rawLink === "string" && rawLink.includes("/chat/")))
  ) {
    router.push(`/officer-chat/${chatId}` as any);
    return;
  }

  const taskId =
    toId(input.taskId) ??
    toId(metadata.taskId) ??
    (String(input.type ?? "").startsWith("task_")
      ? toId(input.reportId) ?? toId(metadata.reportId)
      : null);

  const reportId =
    toId(input.reportId) ??
    toId(metadata.reportId) ??
    toId(metadata.related_report_id);

  const postId = toId(metadata.postId);

  if (rawLink) {
    if (rawLink.startsWith("/officer-task/")) {
      router.push(rawLink as any);
      return;
    }

    if (rawLink.startsWith("/officer-report/")) {
      router.push(rawLink as any);
      return;
    }

    if (rawLink.startsWith("/report-post/")) {
      router.push(rawLink as any);
      return;
    }

    const reportMatch = rawLink.match(/^\/reports\/([^/]+)$/);
    if (reportMatch?.[1]) {
      router.push({
        pathname: "/report/[id]",
        params: { id: reportMatch[1] },
      });
      return;
    }

    const mobileReportMatch = rawLink.match(/^\/report\/([^/]+)$/);
    if (mobileReportMatch?.[1]) {
      router.push({
        pathname: "/report/[id]",
        params: { id: mobileReportMatch[1] },
      });
      return;
    }
  }

  if (input.type === "badge_earned") {
    router.push("/(profile)/profile");
    return;
  }

  if (input.type === "leaderboard_rank") {
    router.push("/(profile)/profile");
    return;
  }

  if (postId) {
    router.push({
      pathname: "/report-post/[id]",
      params: { id: postId },
    });
    return;
  }

  if (taskId) {
    router.push(`/officer-task/${taskId}` as any);
    return;
  }

  if (reportId) {
    router.push({
      pathname: "/report/[id]",
      params: { id: reportId },
    });
  }
}
