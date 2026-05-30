import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";
async function mustUser(userId) {
    const res = await pool.query(`SELECT id, name, created_at
     FROM users
     WHERE id = $1 AND deleted_at IS NULL`, [userId]);
    if (res.rows.length === 0) {
        throw new AppError("User not found", 404);
    }
    return res.rows[0];
}
export async function getOrCreateUserStats(userId) {
    const { rows } = await pool.query(`SELECT * FROM refresh_user_stats($1)`, [userId]);
    if (!rows.length) {
        throw new AppError("Failed to load user stats", 500);
    }
    return rows[0];
}
export async function recalculateUserStats(userId) {
    return getOrCreateUserStats(userId);
}
export async function getProfileStats(userId // ✅ Changed to string
) {
    const user = await mustUser(userId);
    const stats = await getOrCreateUserStats(userId);
    const total = stats.total_reports || 0;
    const resolved = stats.resolved_reports || 0;
    const resolutionRate = total > 0 ? Number(((resolved * 100) / total).toFixed(1)) : 0;
    return {
        id: user.id,
        name: user.name,
        member_since: user.created_at,
        total_reports: total,
        resolved_reports: resolved,
        resolution_rate: resolutionRate,
        total_upvotes_received: stats.total_upvotes_received || 0,
        current_streak_days: stats.current_streak_days || 0,
        longest_streak_days: stats.longest_streak_days || 0,
        impact_score: stats.impact_score || 0,
    };
}
