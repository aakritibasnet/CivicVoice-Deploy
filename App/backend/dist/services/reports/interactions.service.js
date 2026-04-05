import { pool } from "@/db/pool";
import { notifyNewComment, notifyUpvoteMilestone, } from "@/services/notifications/triggers.service";
async function syncReportUpvoteCount(reportId) {
    const { rows } = await pool.query(`WITH recalculated AS (
       SELECT COUNT(*)::int AS upvote_count
       FROM upvotes
       WHERE report_id = $1
     )
     UPDATE reports r
     SET upvote_count = recalculated.upvote_count
     FROM recalculated
     WHERE r.id = $1
     RETURNING r.upvote_count`, [reportId]);
    return rows[0]?.upvote_count ?? 0;
}
// ─── Report Detail ───────────────────────────────────────────────────
export async function getReportDetailService(reportId, // ✅ UUID string
actorId, // ✅ UUID string
actorRole) {
    const isOfficerActor = actorRole === "officer";
    const viewerStateSelect = actorId
        ? isOfficerActor
            ? `, EXISTS(SELECT 1 FROM upvotes WHERE report_id = r.id AND officer_id = $2) AS user_upvoted
         , FALSE AS user_bookmarked
         , FALSE AS user_following`
            : `, EXISTS(SELECT 1 FROM upvotes WHERE report_id = r.id AND user_id = $2) AS user_upvoted
         , EXISTS(SELECT 1 FROM bookmarks WHERE report_id = r.id AND user_id = $2) AS user_bookmarked
         , EXISTS(SELECT 1 FROM report_followers WHERE report_id = r.id AND user_id = $2) AS user_following`
        : `, FALSE AS user_upvoted, FALSE AS user_bookmarked, FALSE AS user_following`;
    const reportQuery = `
    SELECT
      r.*,
      u.name AS reporter_name,
      CASE WHEN r.user_id IS NULL THEN TRUE ELSE FALSE END AS is_anonymous
      ${viewerStateSelect}
    FROM reports r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.id = $1
  `;
    const params = actorId ? [reportId, actorId] : [reportId];
    const { rows } = await pool.query(reportQuery, params);
    if (!rows.length) {
        throw new Error("Report not found");
    }
    return rows[0];
}
// ─── Upvote (toggle) ─────────────────────────────────────────────────
export async function toggleUpvoteService(reportId, // ✅ UUID string
actorId, // ✅ UUID string
actorRole) {
    const isOfficerActor = actorRole === "officer";
    const actorColumn = isOfficerActor ? "officer_id" : "user_id";
    const insertColumns = isOfficerActor
        ? "(report_id, officer_id)"
        : "(report_id, user_id)";
    // Verify report exists
    const report = await pool.query(`SELECT id, user_id, is_public FROM reports WHERE id = $1`, [reportId]);
    if (!report.rows.length) {
        throw new Error("Report not found");
    }
    // Prevent self‐upvote
    if (!isOfficerActor && report.rows[0].user_id === actorId) {
        throw new Error("Cannot upvote your own report");
    }
    // Check current status
    const existing = await pool.query(`SELECT id FROM upvotes WHERE report_id = $1 AND ${actorColumn} = $2`, [reportId, actorId]);
    if (existing.rows.length) {
        await pool.query(`DELETE FROM upvotes WHERE report_id = $1 AND ${actorColumn} = $2`, [reportId, actorId]);
        const upvoteCount = await syncReportUpvoteCount(reportId);
        return { upvoted: false, upvote_count: upvoteCount };
    }
    await pool.query(`INSERT INTO upvotes ${insertColumns} VALUES ($1, $2)`, [
        reportId,
        actorId,
    ]);
    const newCount = await syncReportUpvoteCount(reportId);
    try {
        await notifyUpvoteMilestone(reportId, newCount);
    }
    catch (err) {
        console.error("notifyUpvoteMilestone error:", err);
    }
    return { upvoted: true, upvote_count: newCount };
}
// ─── Comments (list) ─────────────────────────────────────────────────
export async function getCommentsService(reportId, // ✅ UUID string
page = 1, limit = 20) {
    const report = await pool.query(`SELECT id FROM reports WHERE id = $1`, [
        reportId,
    ]);
    if (!report.rows.length) {
        throw new Error("Report not found");
    }
    const offset = (page - 1) * limit;
    const query = `
    SELECT
      c.id,
      c.content,
      c.created_at,
      COALESCE(c.public_tag, u.name, o.first_name || ' ' || o.last_name, 'Anonymous') AS commenter_name,
      COALESCE(u.id::text, c.officer_id::text) AS commenter_id,
      CASE WHEN c.user_id IS NULL AND c.officer_id IS NULL THEN TRUE ELSE FALSE END AS is_anonymous
    FROM comments c
    LEFT JOIN users u ON c.user_id::text = u.id::text
    LEFT JOIN officers o ON c.officer_id::text = o.id::text
    WHERE c.report_id::text = $1
    ORDER BY c.created_at DESC
    LIMIT $2 OFFSET $3
  `;
    const { rows } = await pool.query(query, [reportId, limit, offset]);
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM comments WHERE report_id = $1`, [reportId]);
    const totalCount = countResult.rows[0].total;
    const totalPages = Math.ceil(totalCount / limit) || 1;
    return {
        comments: rows,
        pagination: {
            currentPage: page,
            totalPages,
            totalCount,
            hasNext: page < totalPages,
            hasPrev: page > 1,
        },
    };
}
// ─── Comment (add) ───────────────────────────────────────────────────
export async function addCommentService({ reportId, userId, content, }) {
    // Validate report exists and is public
    const report = await pool.query(`SELECT id, is_public FROM reports WHERE id = $1`, [reportId]);
    if (!report.rows.length) {
        throw new Error("Report not found");
    }
    if (!report.rows[0].is_public) {
        throw new Error("Cannot comment on private reports");
    }
    const { rows } = await pool.query(`INSERT INTO comments (report_id, user_id, content)
     VALUES ($1, $2, $3)
     RETURNING id, content, created_at`, [reportId, userId, content]);
    const created = rows[0];
    try {
        await notifyNewComment(reportId, userId, content);
    }
    catch (err) {
        console.error("notifyNewComment error:", err);
    }
    return created;
}
// ─── Bookmark (toggle) ──────────────────────────────────────────────
export async function toggleBookmarkService(reportId, // ✅ UUID string
userId) {
    // Verify report exists
    const report = await pool.query(`SELECT id FROM reports WHERE id = $1`, [
        reportId,
    ]);
    if (!report.rows.length) {
        throw new Error("Report not found");
    }
    const existing = await pool.query(`SELECT id FROM bookmarks WHERE report_id = $1 AND user_id = $2`, [reportId, userId]);
    if (existing.rows.length) {
        await pool.query(`DELETE FROM bookmarks WHERE report_id = $1 AND user_id = $2`, [reportId, userId]);
        return { bookmarked: false };
    }
    await pool.query(`INSERT INTO bookmarks (report_id, user_id) VALUES ($1, $2)`, [reportId, userId]);
    return { bookmarked: true };
}
