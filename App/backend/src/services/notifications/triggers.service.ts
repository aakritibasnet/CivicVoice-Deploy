import { pool } from "@/db/pool";
import { createNotification } from "./notifications.service";
import { getFollowerIds } from "@/services/reports/followers.service";

function prettyStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getOfficerTaskLink(reportId: string): string {
  return `/officer-task/${reportId}`;
}

async function getCommentAuthorName(commenterId: string): Promise<string> {
  const result = await pool.query<{ name: string | null }>(
    `SELECT COALESCE(u.name, o.first_name || ' ' || o.last_name, 'Someone') AS name
     FROM (SELECT $1::uuid AS id) ref
     LEFT JOIN users u ON u.id = ref.id
     LEFT JOIN officers o ON o.id = ref.id`,
    [commenterId],
  );

  return result.rows[0]?.name || "Someone";
}

export async function notifyStatusChange(
  reportId: string,
  newStatus: string,
): Promise<void> {
  const { rows } = await pool.query<{
    user_id: string | null;
    title: string | null;
    assigned_field_officer_id: string | null;
  }>(
    `SELECT user_id, title, assigned_field_officer_id
     FROM reports
     WHERE id = $1`,
    [reportId],
  );

  const row = rows[0];
  if (!row) return;

  const statusLabel = prettyStatus(newStatus);
  const reportTitle = row.title || "Untitled";

  let ownerTitle: string;
  let ownerMessage: string;

  switch (newStatus) {
    case "in_progress":
      ownerTitle = "Your task is in progress";
      ownerMessage = `Your report "${reportTitle}" is now being worked on. Click here to see details.`;
      break;
    case "completed":
    case "resolved":
      ownerTitle = "Your task is completed";
      ownerMessage = `Your report "${reportTitle}" has been resolved. Click here to see details.`;
      break;
    case "invalid":
    case "closed":
      ownerTitle = "Your task is invalid";
      ownerMessage = `Your report "${reportTitle}" was marked as invalid. Click here to see details.`;
      break;
    default:
      ownerTitle = `Report Update: ${statusLabel}`;
      ownerMessage = `Your report "${reportTitle}" was updated to ${statusLabel}.`;
      break;
  }

  if (row.user_id) {
    await createNotification({
      userId: row.user_id,
      reportId,
      type: "status_change",
      title: ownerTitle,
      message: ownerMessage,
    });
  }

  try {
    const followerIds = await getFollowerIds(reportId);
    const followersToNotify = followerIds.filter((id) => id !== row.user_id);

    await Promise.all(
      followersToNotify.map((followerId) =>
        createNotification({
          userId: followerId,
          reportId,
          type: "status_change",
          title: `Followed report: ${statusLabel}`,
          message: `A report you follow "${reportTitle}" was updated to ${statusLabel}. Click here to see details.`,
        }),
      ),
    );
  } catch (err) {
    console.error("notifyFollowers error:", err);
  }

  if (!row.assigned_field_officer_id) {
    return;
  }

  let officerTitle = `Task status updated: ${statusLabel}`;
  let officerMessage = `Task "${reportTitle}" assigned to you is now ${statusLabel}.`;
  let officerType: Parameters<typeof createNotification>[0]["type"] =
    "task_status_updated";

  switch (newStatus) {
    case "returned":
      officerTitle = "Task returned which was assigned to you";
      officerMessage = `Task "${reportTitle}" assigned to you was returned. Click to see full details.`;
      officerType = "task_returned";
      break;
    case "invalid":
      officerTitle = "Task assigned to you was marked invalid";
      officerMessage = `Task "${reportTitle}" assigned to you was marked invalid. Click to see full details.`;
      officerType = "task_invalidated";
      break;
    case "completed":
      officerTitle = "Task assigned to you was marked completed";
      officerMessage = `Task "${reportTitle}" assigned to you was marked completed. Click to see full details.`;
      officerType = "task_completed";
      break;
    case "in_progress":
      officerTitle = "Task assigned to you moved to in progress";
      officerMessage = `Task "${reportTitle}" assigned to you is now in progress. Click to see full details.`;
      break;
    default:
      break;
  }

  await createNotification({
    userId: row.assigned_field_officer_id,
    recipientRole: "officer",
    reportId,
    type: officerType,
    title: officerTitle,
    message: officerMessage,
    link: getOfficerTaskLink(reportId),
    metadata: {
      eventType: officerType.toUpperCase(),
      taskId: reportId,
      reportId,
      status: newStatus,
    },
  });

  if (newStatus === "completed" || newStatus === "resolved") {
    try {
      await notifyNearbyResolved({ reportId });
    } catch (err) {
      console.error("notifyNearbyResolved error:", err);
    }
  }
}

export async function notifyNewComment(
  reportId: string,
  commenterId: string,
  content: string,
): Promise<void> {
  const reportRes = await pool.query<{
    user_id: string | null;
    title: string | null;
    assigned_field_officer_id: string | null;
  }>(
    `SELECT user_id, title, assigned_field_officer_id
     FROM reports
     WHERE id = $1`,
    [reportId],
  );

  const report = reportRes.rows[0];
  if (!report) return;

  const commenterName = await getCommentAuthorName(commenterId);
  const preview = content.length > 80 ? `${content.slice(0, 77)}...` : content;
  const reportTitle = report.title || "Untitled";

  if (report.user_id && report.user_id !== commenterId) {
    await createNotification({
      userId: report.user_id,
      reportId,
      type: "comment",
      title: "New Comment",
      message: `${commenterName} commented on your report "${reportTitle}": ${preview}`,
    });
  }

  if (
    report.assigned_field_officer_id &&
    report.assigned_field_officer_id !== commenterId
  ) {
    await createNotification({
      userId: report.assigned_field_officer_id,
      recipientRole: "officer",
      reportId,
      type: "task_comment",
      title: "New comment on your task",
      message: `${commenterName} commented on task "${reportTitle}": ${preview}`,
      link: getOfficerTaskLink(reportId),
      metadata: {
        eventType: "TASK_COMMENT",
        taskId: reportId,
        reportId,
        commenterId,
        commenterName,
      },
    });
  }
}

export async function notifyReportPostComment(
  postId: string,
  commenterId: string,
  content: string,
): Promise<void> {
  const postRes = await pool.query<{
    title: string | null;
    source_user_id: string | null;
    report_owner_id: string | null;
    completed_by_user_id: string | null;
    completed_by_officer_id: string | null;
  }>(
    `SELECT
       rp.title,
       rp.source_user_id,
       r.user_id AS report_owner_id,
       tc.completed_by_user_id,
       tc.completed_by_officer_id
     FROM report_posts rp
     LEFT JOIN reports r ON r.id = rp.task_id
     LEFT JOIN task_completions tc ON tc.id = rp.completion_id
     WHERE rp.id = $1`,
    [postId],
  );

  const post = postRes.rows[0];
  if (!post) return;

  const commenterName = await getCommentAuthorName(commenterId);
  const preview = content.length > 80 ? `${content.slice(0, 77)}...` : content;
  const postTitle = post.title || "Untitled update";
  const link = `/report-post/${postId}`;

  const sent = new Set<string>();
  const notify = async (
    recipientId: string | null,
    recipientRole: "citizen" | "officer",
    title: string,
    message: string,
  ) => {
    if (!recipientId || recipientId === commenterId) {
      return;
    }

    const key = `${recipientRole}:${recipientId}`;
    if (sent.has(key)) {
      return;
    }
    sent.add(key);

    await createNotification({
      userId: recipientId,
      recipientRole,
      type: "report_post_comment",
      title,
      message,
      link,
      metadata: {
        eventType: "REPORT_POST_COMMENT",
        postId,
        commenterId,
        commenterName,
      },
    });
  };

  await notify(
    post.source_user_id,
    "citizen",
    "New comment on an update for your report",
    `${commenterName} commented on "${postTitle}": ${preview}`,
  );

  await notify(
    post.report_owner_id,
    "citizen",
    "New comment on an update for your report",
    `${commenterName} commented on "${postTitle}": ${preview}`,
  );

  await notify(
    post.completed_by_user_id,
    "citizen",
    "New comment on your completion post",
    `${commenterName} commented on "${postTitle}": ${preview}`,
  );

  await notify(
    post.completed_by_officer_id,
    "officer",
    "New comment on your completion post",
    `${commenterName} commented on "${postTitle}": ${preview}`,
  );
}

// ─── Comment Reply ──────────────────────────────────────────────────
export async function notifyCommentReply(
  reportId: string,
  parentCommentId: string,
  replierId: string,
  content: string,
): Promise<void> {
  // Find the parent comment author
  const parentRes = await pool.query<{
    user_id: string | null;
    officer_id: string | null;
  }>(
    `SELECT user_id, officer_id FROM comments WHERE id = $1`,
    [parentCommentId],
  );

  const parent = parentRes.rows[0];
  if (!parent) return;

  const parentAuthorId = parent.user_id ?? parent.officer_id;
  if (!parentAuthorId || parentAuthorId === replierId) return;

  const replierName = await getCommentAuthorName(replierId);
  const preview = content.length > 80 ? `${content.slice(0, 77)}...` : content;

  const reportRes = await pool.query<{ title: string | null }>(
    `SELECT title FROM reports WHERE id = $1`,
    [reportId],
  );
  const reportTitle = reportRes.rows[0]?.title || "Untitled";

  const isOfficerRecipient = !!parent.officer_id && !parent.user_id;

  await createNotification({
    userId: parentAuthorId,
    recipientRole: isOfficerRecipient ? "officer" : "citizen",
    reportId,
    type: "comment_reply",
    title: "Someone replied to your comment",
    message: `${replierName} replied to your comment on "${reportTitle}": ${preview}`,
    link: isOfficerRecipient ? getOfficerTaskLink(reportId) : undefined,
  });
}

// ─── Report Post Comment Reply ──────────────────────────────────────
export async function notifyReportPostReply(
  postId: string,
  parentCommentId: string,
  replierId: string,
  content: string,
): Promise<void> {
  const parentRes = await pool.query<{
    user_id: string | null;
  }>(
    `SELECT user_id FROM report_comments WHERE id = $1`,
    [parentCommentId],
  );

  const parent = parentRes.rows[0];
  if (!parent?.user_id || parent.user_id === replierId) return;

  const replierName = await getCommentAuthorName(replierId);
  const preview = content.length > 80 ? `${content.slice(0, 77)}...` : content;

  const postRes = await pool.query<{ title: string | null }>(
    `SELECT title FROM report_posts WHERE id = $1`,
    [postId],
  );
  const postTitle = postRes.rows[0]?.title || "Untitled";

  await createNotification({
    userId: parent.user_id,
    type: "report_post_reply",
    title: "Someone replied to your comment",
    message: `${replierName} replied to your comment on "${postTitle}": ${preview}`,
    link: `/report-post/${postId}`,
  });
}

const UPVOTE_MILESTONES = [10, 50, 100, 500];

export async function notifyUpvoteMilestone(
  reportId: string,
  newCount: number,
): Promise<void> {
  if (!UPVOTE_MILESTONES.includes(newCount)) return;

  const { rows } = await pool.query<{
    user_id: string | null;
    title: string | null;
  }>(
    `SELECT user_id, title
     FROM reports
     WHERE id = $1`,
    [reportId],
  );

  const report = rows[0];
  if (!report || report.user_id == null) return;

  const title = `Milestone Reached: ${newCount} upvotes`;
  const message = `Your report "${report.title || "Untitled"}" has reached ${newCount} upvotes. The community appreciates your voice!`;

  await createNotification({
    userId: report.user_id,
    reportId,
    type: "upvote_milestone",
    title,
    message,
  });
}

export async function notifyBadgeEarned(
  userId: string,
  badge: { name: string; description: string; icon_name?: string | null },
): Promise<void> {
  const title = `Badge Unlocked: ${badge.name}`;
  const message = badge.description;

  await createNotification({
    userId,
    reportId: null,
    type: "badge_earned",
    title,
    message,
    iconName: badge.icon_name || "ribbon-outline",
  });
}

export async function notifyNearbyResolved(params: {
  reportId: string;
}): Promise<void> {
  const { rows } = await pool.query<{
    id: string;
    user_id: string | null;
    location_lat: number | null;
    location_lng: number | null;
  }>(
    `SELECT id, user_id, location_lat, location_lng
     FROM reports
     WHERE id = $1 AND status = 'completed'`,
    [params.reportId],
  );

  const resolved = rows[0];
  if (
    !resolved ||
    resolved.location_lat == null ||
    resolved.location_lng == null
  ) {
    return;
  }

  const lat = resolved.location_lat;
  const lng = resolved.location_lng;
  const ownerUserId = resolved.user_id;

  const usersRes = await pool.query<{ user_id: string }>(
    `SELECT DISTINCT r.user_id
    FROM reports r
    WHERE r.user_id IS NOT NULL
      AND r.is_public = TRUE
      AND r.created_at >= NOW() - INTERVAL '90 days'
      AND r.location_lat IS NOT NULL
      AND r.location_lng IS NOT NULL
      AND 6371000 * acos(least(1, greatest(-1,
        cos(radians($1)) * cos(radians(r.location_lat)) *
        cos(radians(r.location_lng) - radians($2)) +
        sin(radians($1)) * sin(radians(r.location_lat))
      ))) <= 500`,
    [lat, lng],
  );

  const title = "Issue Resolved Nearby";
  const message =
    "An issue near one of your recent reports has been resolved. Your reports are helping improve your area!";

  await Promise.all(
    usersRes.rows
      .filter((row) => row.user_id !== ownerUserId)
      .map((row) =>
      createNotification({
        userId: row.user_id,
        reportId: params.reportId,
        type: "nearby_resolved",
        title,
        message,
      }),
      ),
  );
}

// ─── Leaderboard Rank Achievement ───────────────────────────────────
const LEADERBOARD_RANK_MILESTONES = [1, 3, 5, 10];

export async function notifyLeaderboardRank(
  userId: string,
): Promise<void> {
  // Get user's current all-time rank
  const { rows } = await pool.query<{ rank: number; total_users: number }>(
    `WITH ranked AS (
       SELECT
         u.id,
         ROW_NUMBER() OVER (
           ORDER BY s.total_reports DESC, s.total_upvotes_received DESC, u.id ASC
         ) AS rank,
         COUNT(*) OVER () AS total_users
       FROM users u
       JOIN user_stats s ON s.user_id = u.id
       WHERE s.total_reports > 0
     )
     SELECT rank::int, total_users::int FROM ranked WHERE id = $1`,
    [userId],
  );

  const row = rows[0];
  if (!row) return;

  const rank = row.rank;

  if (!LEADERBOARD_RANK_MILESTONES.includes(rank)) return;

  // Check if we already sent this exact rank notification recently (last 7 days)
  const dupeCheck = await pool.query(
    `SELECT 1 FROM notifications
     WHERE user_id = $1
       AND type = 'leaderboard_rank'
       AND metadata->>'rank' = $2
       AND created_at >= NOW() - INTERVAL '7 days'
     LIMIT 1`,
    [userId, String(rank)],
  );

  if (dupeCheck.rows.length > 0) return;

  const title =
    rank === 1
      ? "You're #1 on the Leaderboard!"
      : `You're in the Top ${rank} on the Leaderboard!`;
  const message =
    rank === 1
      ? "Congratulations! You've reached the top of the community leaderboard. Your civic engagement is truly outstanding!"
      : `Great work! You've climbed to #${rank} on the community leaderboard. Keep it up!`;

  await createNotification({
    userId,
    type: "leaderboard_rank",
    title,
    message,
    metadata: { rank, totalUsers: row.total_users },
  });
}

export async function notifyWardUsersOfNewReport(
  reportId: string,
): Promise<void> {
  const { rows } = await pool.query<{
    title: string | null;
    ward_id: string | null;
  }>(
    `SELECT title, ward_id
     FROM reports
     WHERE id = $1`,
    [reportId],
  );

  const report = rows[0];
  if (!report?.ward_id) return;

  const wardUsers = await pool.query<{ id: string }>(
    `SELECT id
     FROM users
     WHERE role = 'ward'
       AND ward_id = $1
       AND is_active = TRUE
       AND deleted_at IS NULL`,
    [report.ward_id],
  );

  if (wardUsers.rows.length === 0) return;

  const title = "New task assigned to your ward";
  const message = `A new task "${report.title || "Untitled"}" has been assigned to your ward.`;

  await Promise.all(
    wardUsers.rows.map((wardUser) =>
      createNotification({
        userId: wardUser.id,
        reportId,
        type: "report_assigned",
        title,
        message,
      }),
    ),
  );
}
