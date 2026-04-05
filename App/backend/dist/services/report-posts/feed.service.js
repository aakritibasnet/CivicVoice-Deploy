import { pool } from "@/db/pool";
import { notifyReportPostComment } from "@/services/notifications/triggers.service";
export async function getReportPostsFeed(params) {
    const { wardId, category, sort = "latest", cursor, viewerId } = params;
    const limit = Math.min(Math.max(params.limit ?? 12, 1), 24);
    const conditions = [];
    const values = [];
    let idx = 1;
    if (wardId) {
        conditions.push(`rp.ward_id = $${idx}`);
        values.push(wardId);
        idx++;
    }
    if (category) {
        conditions.push(`rp.category = $${idx}`);
        values.push(category);
        idx++;
    }
    if (cursor) {
        if (sort === "top_rated") {
            // cursor = "rating_average:created_at"
            const [ratingStr, dateStr] = cursor.split(":");
            conditions.push(`(rp.rating_average, rp.created_at) < ($${idx}, $${idx + 1})`);
            values.push(Number(ratingStr), new Date(dateStr));
            idx += 2;
        }
        else {
            conditions.push(`rp.created_at < $${idx}`);
            values.push(new Date(cursor));
            idx++;
        }
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderBy = sort === "top_rated"
        ? "ORDER BY rp.rating_average DESC, rp.created_at DESC"
        : "ORDER BY rp.created_at DESC";
    const dataQ = `
    SELECT
      rp.id,
      rp.task_id,
      rp.completion_id,
      rp.title,
      rp.description,
      rp.category,
      rp.priority,
      rp.before_image_url,
      rp.after_image_url,
      rp.ward_name_snapshot AS ward_name,
      rp.completed_by_name_snapshot AS completed_by_name,
      rp.completed_by_role_snapshot AS completed_by_role,
      rp.rating_average,
      rp.rating_count,
      rp.comment_count,
      rp.bookmark_count,
      rp.edited_count,
      rp.completed_at,
      rp.created_at,
      w.ward_code
    FROM report_posts rp
    LEFT JOIN wards w ON rp.ward_id = w.id
    ${whereClause}
    ${orderBy}
    LIMIT $${idx}
  `;
    values.push(limit + 1); // fetch one extra to check hasMore
    const { rows } = await pool.query(dataQ, values);
    const hasMore = rows.length > limit;
    const nodes = hasMore ? rows.slice(0, limit) : rows;
    // Build cursor for next page
    let endCursor = null;
    if (hasMore && nodes.length > 0) {
        const last = nodes[nodes.length - 1];
        endCursor =
            sort === "top_rated"
                ? `${last.rating_average}:${last.created_at.toISOString()}`
                : last.created_at.toISOString();
    }
    // Fetch viewer state if logged in
    let viewerRatings = new Map();
    let viewerBookmarks = new Set();
    if (viewerId && nodes.length > 0) {
        const postIds = nodes.map((n) => n.id);
        const [ratingsRes, bookmarksRes] = await Promise.all([
            pool.query(`SELECT post_id, rating FROM report_ratings WHERE user_id = $1 AND post_id = ANY($2)`, [viewerId, postIds]),
            pool.query(`SELECT post_id FROM report_post_bookmarks WHERE user_id = $1 AND post_id = ANY($2)`, [viewerId, postIds]),
        ]);
        for (const r of ratingsRes.rows) {
            viewerRatings.set(r.post_id, r.rating);
        }
        for (const b of bookmarksRes.rows) {
            viewerBookmarks.add(b.post_id);
        }
    }
    const enrichedNodes = nodes.map((n) => ({
        ...n,
        viewer_rating: viewerRatings.get(n.id) ?? null,
        is_bookmarked: viewerBookmarks.has(n.id),
    }));
    return {
        nodes: enrichedNodes,
        pageInfo: { endCursor, hasMore },
    };
}
export async function getReportPostDetail(postId, viewerId) {
    const q = `
    SELECT
      rp.id,
      rp.task_id,
      rp.completion_id,
      rp.title,
      rp.description,
      rp.category,
      rp.priority,
      rp.before_image_url,
      rp.after_image_url,
      rp.ward_name_snapshot AS ward_name,
      rp.completed_by_name_snapshot AS completed_by_name,
      rp.completed_by_role_snapshot AS completed_by_role,
      rp.rating_average,
      rp.rating_count,
      rp.comment_count,
      rp.bookmark_count,
      rp.completed_at,
      rp.created_at,
      tc.description AS completion_description,
      w.ward_code,
      r.location_lat,
      r.location_lng,
      r.address_text
    FROM report_posts rp
    LEFT JOIN task_completions tc ON rp.completion_id = tc.id
    LEFT JOIN wards w ON rp.ward_id = w.id
    LEFT JOIN reports r ON rp.task_id = r.id
    WHERE rp.id = $1
  `;
    const { rows } = await pool.query(q, [postId]);
    if (rows.length === 0)
        return null;
    const post = rows[0];
    // Viewer state
    if (viewerId) {
        const [ratingRes, bookmarkRes] = await Promise.all([
            pool.query(`SELECT rating FROM report_ratings WHERE user_id = $1 AND post_id = $2`, [viewerId, postId]),
            pool.query(`SELECT 1 FROM report_post_bookmarks WHERE user_id = $1 AND post_id = $2`, [viewerId, postId]),
        ]);
        post.viewer_rating = ratingRes.rows[0]?.rating ?? null;
        post.is_bookmarked = bookmarkRes.rows.length > 0;
    }
    else {
        post.viewer_rating = null;
        post.is_bookmarked = false;
    }
    return post;
}
export async function ratePost(postId, userId, rating) {
    if (rating < 1 || rating > 5)
        throw new Error("Rating must be 1-5");
    // Upsert rating
    await pool.query(`INSERT INTO report_ratings (post_id, user_id, rating)
     VALUES ($1, $2, $3)
     ON CONFLICT (post_id, user_id)
     DO UPDATE SET rating = $3, updated_at = NOW()`, [postId, userId, rating]);
    // Recalculate average
    const { rows } = await pool.query(`SELECT COALESCE(AVG(rating), 0) AS avg, COUNT(*)::int AS cnt
     FROM report_ratings WHERE post_id = $1`, [postId]);
    await pool.query(`UPDATE report_posts SET rating_average = $1, rating_count = $2, updated_at = NOW()
     WHERE id = $3`, [rows[0].avg, rows[0].cnt, postId]);
    return { rating, rating_average: Number(rows[0].avg), rating_count: rows[0].cnt };
}
export async function togglePostBookmark(postId, userId) {
    const existing = await pool.query(`SELECT id FROM report_post_bookmarks WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
    if (existing.rows.length > 0) {
        await pool.query(`DELETE FROM report_post_bookmarks WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
        await pool.query(`UPDATE report_posts SET bookmark_count = GREATEST(0, bookmark_count - 1) WHERE id = $1`, [postId]);
        return { is_bookmarked: false };
    }
    await pool.query(`INSERT INTO report_post_bookmarks (post_id, user_id) VALUES ($1, $2)`, [postId, userId]);
    await pool.query(`UPDATE report_posts SET bookmark_count = bookmark_count + 1 WHERE id = $1`, [postId]);
    return { is_bookmarked: true };
}
export async function getUserBookmarkedPosts(userId) {
    const { rows } = await pool.query(`SELECT
      rp.id,
      rp.title,
      rp.category,
      rp.before_image_url,
      rp.after_image_url,
      rp.ward_name_snapshot AS ward_name,
      rp.rating_average,
      rp.rating_count,
      rp.comment_count,
      rp.completed_at,
      rp.created_at
    FROM report_post_bookmarks bm
    JOIN report_posts rp ON rp.id = bm.post_id
    WHERE bm.user_id = $1
    ORDER BY bm.created_at DESC`, [userId]);
    return rows;
}
export async function getPostComments(postId) {
    const { rows } = await pool.query(`SELECT
       rc.id,
       rc.post_id,
       rc.content,
       rc.anonymous_name,
       rc.reply_count,
       rc.created_at,
       u.id AS user_id,
       u.name AS user_name,
       u.profile_image_url AS user_profile_image
     FROM report_comments rc
     LEFT JOIN users u ON rc.user_id = u.id
     WHERE rc.post_id = $1 AND rc.parent_id IS NULL
     ORDER BY rc.created_at ASC`, [postId]);
    return rows;
}
export async function addPostComment(postId, userId, content) {
    const userRes = await pool.query(`SELECT name, profile_image_url FROM users WHERE id = $1`, [userId]);
    const userName = userRes.rows[0]?.name || "Anonymous";
    const userProfileImage = userRes.rows[0]?.profile_image_url || null;
    const { rows } = await pool.query(`INSERT INTO report_comments (post_id, user_id, content, anonymous_name)
     VALUES ($1, $2, $3, $4)
     RETURNING id, content, anonymous_name, created_at`, [postId, userId, content, userName.split(" ")[0] + " " + String.fromCharCode(65 + Math.floor(Math.random() * 26)) + "."]);
    await pool.query(`UPDATE report_posts SET comment_count = comment_count + 1 WHERE id = $1`, [postId]);
    try {
        await notifyReportPostComment(postId, userId, content);
    }
    catch (err) {
        console.error("notifyReportPostComment error:", err);
    }
    return {
        ...rows[0],
        user_id: userId,
        user_name: userName,
        user_profile_image: userProfileImage,
    };
}
