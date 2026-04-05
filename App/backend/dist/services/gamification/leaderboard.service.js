import { pool } from "@/db/pool";
function getTimeBounds(timeframe) {
    if (timeframe === "all_time") {
        return { useStats: true };
    }
    if (timeframe === "weekly") {
        return {
            useStats: false,
            whereClause: "r.created_at >= date_trunc('week', timezone('UTC', now()))",
        };
    }
    return {
        useStats: false,
        whereClause: "r.created_at >= now() - INTERVAL '30 days'",
    };
}
export async function getLeaderboard(timeframe, limit = 10, offset = 0) {
    const bounds = getTimeBounds(timeframe);
    if (bounds.useStats) {
        const { rows } = await pool.query(`WITH ranked AS (
        SELECT
          u.id,
          u.name,
          s.total_reports AS report_count,
          s.total_upvotes_received AS total_upvotes,
          ROW_NUMBER() OVER (
            ORDER BY s.total_reports DESC, s.total_upvotes_received DESC, u.id ASC
          ) AS rank,
          COUNT(*) OVER () AS total_users
        FROM users u
        JOIN user_stats s ON s.user_id = u.id
        WHERE s.total_reports > 0
      )
      SELECT * FROM ranked
      ORDER BY rank
      LIMIT $1 OFFSET $2`, [limit, offset]);
        const totalUsers = rows[0]?.total_users ?? 0;
        const cleaned = rows.map((r) => ({
            ...r,
            total_users: undefined,
        }));
        return { rows: cleaned, total_users: totalUsers };
    }
    const { rows } = await pool.query(`WITH per_user AS (
      SELECT
        r.user_id as id,
        u.name,
        COUNT(*) AS report_count,
        COALESCE(SUM(r.upvote_count), 0) AS total_upvotes
      FROM reports r
      JOIN users u ON u.id = r.user_id
      WHERE r.user_id IS NOT NULL
        AND ${bounds.whereClause}
      GROUP BY r.user_id, u.name
      HAVING COUNT(*) >= 1
    ),
    ranked AS (
      SELECT
        id,
        name,
        report_count,
        total_upvotes,
        ROW_NUMBER() OVER (
          ORDER BY report_count DESC, total_upvotes DESC, id ASC
        ) AS rank,
        COUNT(*) OVER () AS total_users
      FROM per_user
    )
    SELECT * FROM ranked
    ORDER BY rank
    LIMIT $1 OFFSET $2`, [limit, offset]);
    const totalUsers = rows[0]?.total_users ?? 0;
    const cleaned = rows.map((r) => ({
        ...r,
        total_users: undefined,
    }));
    return { rows: cleaned, total_users: totalUsers };
}
export async function getUserRank(timeframe, userId) {
    const bounds = getTimeBounds(timeframe);
    if (bounds.useStats) {
        const { rows } = await pool.query(`WITH ranked AS (
        SELECT
          u.id,
          u.name,
          s.total_reports AS report_count,
          s.total_upvotes_received AS total_upvotes,
          ROW_NUMBER() OVER (
            ORDER BY s.total_reports DESC, s.total_upvotes_received DESC, u.id ASC
          ) AS rank,
          COUNT(*) OVER () AS total_users
        FROM users u
        JOIN user_stats s ON s.user_id = u.id
        WHERE s.total_reports > 0
      )
      SELECT * FROM ranked
      WHERE id = $1`, [userId]);
        if (!rows.length)
            return null;
        const row = rows[0];
        return {
            id: row.id,
            name: row.name,
            report_count: row.report_count,
            total_upvotes: row.total_upvotes,
            rank: row.rank,
            total_users: row.total_users,
        };
    }
    const { rows } = await pool.query(`WITH per_user AS (
      SELECT
        r.user_id as id,
        u.name,
        COUNT(*) AS report_count,
        COALESCE(SUM(r.upvote_count), 0) AS total_upvotes
      FROM reports r
      JOIN users u ON u.id = r.user_id
      WHERE r.user_id IS NOT NULL
        AND ${bounds.whereClause}
      GROUP BY r.user_id, u.name
      HAVING COUNT(*) >= 1
    ),
    ranked AS (
      SELECT
        id,
        name,
        report_count,
        total_upvotes,
        ROW_NUMBER() OVER (
          ORDER BY report_count DESC, total_upvotes DESC, id ASC
        ) AS rank,
        COUNT(*) OVER () AS total_users
      FROM per_user
    )
    SELECT * FROM ranked
    WHERE id = $1`, [userId]);
    if (!rows.length)
        return null;
    const row = rows[0];
    return {
        id: row.id,
        name: row.name,
        report_count: row.report_count,
        total_upvotes: row.total_upvotes,
        rank: row.rank,
        total_users: row.total_users,
    };
}
