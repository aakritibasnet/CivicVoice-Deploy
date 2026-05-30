import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";

export type UserStatsRow = {
  user_id: string;  // ✅ Changed to string
  total_reports: number;
  resolved_reports: number;
  total_upvotes_received: number;
  current_streak_days: number;
  longest_streak_days: number;
  last_report_date: Date | null;
  impact_score: number;
  updated_at: Date;
};

export type ProfileStats = {
  id: string;  // ✅ Changed to string
  name: string;
  member_since: Date;
  total_reports: number;
  resolved_reports: number;
  resolution_rate: number;
  total_upvotes_received: number;
  current_streak_days: number;
  longest_streak_days: number;
  impact_score: number;
};

async function mustUser(userId: string) {  // ✅ Changed to string
  const res = await pool.query<{
    id: string;
    name: string;
    created_at: Date;
  }>(
    `SELECT id, name, created_at
     FROM users
     WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );

  if (res.rows.length === 0) {
    throw new AppError("User not found", 404);
  }

  return res.rows[0];
}

export async function getOrCreateUserStats(
  userId: string,  // ✅ Changed to string
): Promise<UserStatsRow> {
  const { rows } = await pool.query<UserStatsRow>(
    `SELECT * FROM refresh_user_stats($1)`,
    [userId],
  );

  if (!rows.length) {
    throw new AppError("Failed to load user stats", 500);
  }

  return rows[0];
}

export async function recalculateUserStats(
  userId: string,  // ✅ Changed to string
): Promise<UserStatsRow> {
  return getOrCreateUserStats(userId);
}

export async function getProfileStats(
  userId: string  // ✅ Changed to string
): Promise<ProfileStats> {
  const user = await mustUser(userId);
  const stats = await getOrCreateUserStats(userId);

  const total = stats.total_reports || 0;
  const resolved = stats.resolved_reports || 0;
  const resolutionRate =
    total > 0 ? Number(((resolved * 100) / total).toFixed(1)) : 0;

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