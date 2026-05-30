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
export async function getReportChangelogService(reportId) {
    const { rows: rr } = await pool.query(`SELECT r.submitted_at, r.created_at,
            r.escalated_at, r.escalated_to_municipality,
            r.pathway_reason,
            r.returned_to_ward_at,
            u.name AS reporter_name,
            CASE WHEN r.user_id IS NULL THEN TRUE ELSE FALSE END AS is_anonymous
     FROM reports r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.id = $1`, [reportId]);
    if (!rr.length)
        throw new Error("Report not found");
    const r = rr[0];
    const { rows: logRows } = await pool.query(`SELECT id, actor_name, action, details, created_at
     FROM activity_log
     WHERE report_id = $1
     ORDER BY created_at ASC`, [reportId]);
    const events = [];
    // Submission event (always synthesized — nothing logs this in activity_log)
    events.push({
        id: "evt_submitted",
        event_type: "submitted",
        actor_name: r.is_anonymous ? "Anonymous" : (r.reporter_name ?? "Citizen"),
        from_status: null,
        to_status: "incoming",
        note: null,
        timestamp: new Date(r.submitted_at ?? r.created_at).toISOString(),
    });
    // Activity log entries (status_change, proof_uploaded, comment_added)
    for (const row of logRows) {
        const d = (row.details ?? {});
        events.push({
            id: String(row.id),
            event_type: String(row.action),
            actor_name: row.actor_name ? String(row.actor_name) : "Officer",
            from_status: d.from_status ? String(d.from_status) : null,
            to_status: d.to_status ? String(d.to_status) : null,
            note: d.note ? String(d.note) : null,
            timestamp: new Date(row.created_at).toISOString(),
        });
    }
    // Escalation event — synthesized if not already logged
    if (r.escalated_to_municipality && r.escalated_at) {
        events.push({
            id: "evt_escalated",
            event_type: "escalated",
            actor_name: null,
            from_status: null,
            to_status: null,
            note: r.pathway_reason ? String(r.pathway_reason) : null,
            timestamp: new Date(r.escalated_at).toISOString(),
        });
    }
    // Returned to ward event
    if (r.returned_to_ward_at) {
        events.push({
            id: "evt_returned_ward",
            event_type: "returned_to_ward",
            actor_name: null,
            from_status: null,
            to_status: null,
            note: null,
            timestamp: new Date(r.returned_to_ward_at).toISOString(),
        });
    }
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return events;
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
