import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";
import { getOrCreateUserStats } from "./stats.service";
import { notifyBadgeEarned, notifyLeaderboardRank } from "@/services/notifications/triggers.service";
export async function getUserBadges(userId, // ✅ Changed to string
opts = {}) {
    if (opts.autoAward) {
        try {
            await awardBadgesForUser(userId);
        }
        catch (err) {
            console.error("getUserBadges autoAward error:", err);
        }
    }
    const { rows } = await pool.query(`SELECT
      b.id,
      b.name,
      b.description,
      b.icon_name,
      b.tier,
      b.criteria_type,
      b.criteria_value,
      b.created_at,
      ub.earned_at
    FROM user_badges ub
    JOIN badges b ON b.id = ub.badge_id
    WHERE ub.user_id = $1
    ORDER BY ub.earned_at DESC`, [userId]);
    return rows;
}
export async function getAllBadgesWithStatus(userId, // ✅ Changed to string
opts = {}) {
    let stats = null;
    if (opts.includeProgress) {
        stats = await getOrCreateUserStats(userId);
    }
    const { rows } = await pool.query(`SELECT
      b.id,
      b.name,
      b.description,
      b.icon_name,
      b.tier,
      b.criteria_type,
      b.criteria_value,
      b.created_at,
      CASE WHEN ub.user_id IS NULL THEN FALSE ELSE TRUE END AS unlocked,
      ub.earned_at
    FROM badges b
    LEFT JOIN user_badges ub
      ON ub.badge_id = b.id AND ub.user_id = $1
    ORDER BY
      b.tier,
      b.criteria_type,
      b.criteria_value`, [userId]);
    if (!opts.includeProgress || !stats) {
        return rows;
    }
    const total = stats.total_reports || 0;
    const resolved = stats.resolved_reports || 0;
    const upvotes = stats.total_upvotes_received || 0;
    const streak = stats.current_streak_days || 0;
    const resolutionRate = total > 0 ? (resolved * 100) / total : 0;
    return rows.map((row) => {
        if (row.unlocked)
            return row;
        let progress = 0;
        if (row.criteria_type === "report_count") {
            progress =
                row.criteria_value > 0 ? (total / row.criteria_value) * 100 : 0;
        }
        else if (row.criteria_type === "upvote_count") {
            progress =
                row.criteria_value > 0 ? (upvotes / row.criteria_value) * 100 : 0;
        }
        else if (row.criteria_type === "resolution_rate") {
            if (total >= 5 && row.criteria_value > 0) {
                progress = (resolutionRate / row.criteria_value) * 100;
            }
            else {
                progress = 0;
            }
        }
        else if (row.criteria_type === "streak_days") {
            progress =
                row.criteria_value > 0 ? (streak / row.criteria_value) * 100 : 0;
        }
        return {
            ...row,
            progress_percent: Math.max(0, Math.min(100, Number(progress.toFixed(1)))),
        };
    });
}
export async function getBadgeDetail(badgeId, // ✅ Changed to string
userId) {
    const params = [badgeId];
    let sql = `
    SELECT
      b.id,
      b.name,
      b.description,
      b.icon_name,
      b.tier,
      b.criteria_type,
      b.criteria_value,
      b.created_at,
      FALSE AS unlocked,
      NULL::timestamp AS earned_at
    FROM badges b
    WHERE b.id = $1
  `;
    if (userId) {
        sql = `
      SELECT
        b.id,
        b.name,
        b.description,
        b.icon_name,
        b.tier,
        b.criteria_type,
        b.criteria_value,
        b.created_at,
        CASE WHEN ub.user_id IS NULL THEN FALSE ELSE TRUE END AS unlocked,
        ub.earned_at
      FROM badges b
      LEFT JOIN user_badges ub
        ON ub.badge_id = b.id AND ub.user_id = $2
      WHERE b.id = $1
    `;
        params.push(userId);
    }
    const { rows } = await pool.query(sql, params);
    if (!rows.length) {
        throw new AppError("Badge not found", 404);
    }
    return rows[0];
}
export async function awardBadgesForUser(userId) {
    const { rows: awardRows } = await pool.query(`SELECT check_and_award_badges($1) AS badge_ids`, [userId]);
    const badgeIds = awardRows[0]?.badge_ids || [];
    if (!badgeIds.length) {
        return [];
    }
    const { rows } = await pool.query(`SELECT
      b.id,
      b.name,
      b.description,
      b.icon_name,
      b.tier,
      b.criteria_type,
      b.criteria_value,
      b.created_at,
      ub.earned_at
    FROM badges b
    JOIN user_badges ub
      ON ub.badge_id = b.id AND ub.user_id = $1
    WHERE b.id = ANY($2::uuid[])
    ORDER BY ub.earned_at DESC`, [userId, badgeIds]);
    for (const badge of rows) {
        try {
            await notifyBadgeEarned(userId, {
                name: badge.name,
                description: badge.description,
                icon_name: badge.icon_name,
            });
        }
        catch (err) {
            console.error("notifyBadgeEarned error:", err);
        }
    }
    // Check leaderboard rank after stats update (non-blocking)
    try {
        await notifyLeaderboardRank(userId);
    }
    catch (err) {
        console.error("notifyLeaderboardRank error:", err);
    }
    return rows;
}
