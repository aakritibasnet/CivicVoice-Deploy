import { api } from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/feedback";
import { getAccessToken } from "@/lib/session";

export type ProfileStats = {
  id: number;
  name: string;
  member_since: string;
  total_reports: number;
  resolved_reports: number;
  resolution_rate: number;
  total_upvotes_received: number;
  current_streak_days: number;
  longest_streak_days: number;
  impact_score: number;
};

export type BadgeTier = "bronze" | "silver" | "gold" | "platinum";
export type BadgeCriteriaType =
  | "report_count"
  | "upvote_count"
  | "resolution_rate"
  | "streak_days";

export type Badge = {
  id: number;
  name: string;
  description: string;
  icon_name: string;
  tier: BadgeTier;
  criteria_type: BadgeCriteriaType;
  criteria_value: number;
  created_at: string;
};

export type UserBadge = Badge & {
  earned_at: string;
};

export type BadgeWithStatus = Badge & {
  unlocked: boolean;
  earned_at: string | null;
  progress_percent?: number;
};

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function extractApiError(err: any, fallback: string) {
  return getFriendlyErrorMessage(err, fallback);
}

export async function getMyStats(): Promise<ProfileStats> {
  const token = await getAccessToken();
  if (!token) throw new Error("Login required");

  try {
    const res = await api.get<ApiResponse<{ stats: ProfileStats }>>(
      "/stats/me",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!res.data.success) {
      throw new Error(res.data.error || "Failed to load stats");
    }

    return res.data.data.stats;
  } catch (err: any) {
    throw new Error(extractApiError(err, "Failed to load stats"));
  }
}

export async function getUserStatsPublic(
  userId: number,
): Promise<ProfileStats> {
  try {
    const res = await api.get<ApiResponse<{ stats: ProfileStats }>>(
      `/stats/${userId}`,
    );

    if (!res.data.success) {
      throw new Error(res.data.error || "Failed to load stats");
    }

    return res.data.data.stats;
  } catch (err: any) {
    throw new Error(extractApiError(err, "Failed to load stats"));
  }
}

export async function getMyBadges(): Promise<UserBadge[]> {
  const token = await getAccessToken();
  if (!token) throw new Error("Login required");

  try {
    const res = await api.get<ApiResponse<{ badges: UserBadge[] }>>(
      "/badges/me",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!res.data.success) {
      throw new Error(res.data.error || "Failed to load badges");
    }

    return res.data.data.badges;
  } catch (err: any) {
    throw new Error(extractApiError(err, "Failed to load badges"));
  }
}

export async function getAllBadgesWithStatus(): Promise<BadgeWithStatus[]> {
  const token = await getAccessToken();
  if (!token) throw new Error("Login required");

  try {
    const res = await api.get<ApiResponse<{ badges: BadgeWithStatus[] }>>(
      "/badges/all",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!res.data.success) {
      throw new Error(res.data.error || "Failed to load badges");
    }

    return res.data.data.badges;
  } catch (err: any) {
    throw new Error(extractApiError(err, "Failed to load badges"));
  }
}

export async function getBadgeDetailApi(
  badgeId: number,
): Promise<BadgeWithStatus> {
  const token = await getAccessToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  try {
    const res = await api.get<ApiResponse<{ badge: BadgeWithStatus }>>(
      `/badges/${badgeId}`,
      { headers },
    );

    if (!res.data.success) {
      throw new Error(res.data.error || "Failed to load badge");
    }

    return res.data.data.badge;
  } catch (err: any) {
    throw new Error(extractApiError(err, "Failed to load badge"));
  }
}

export type LeaderboardEntry = {
  id: number;
  name: string;
  report_count: number;
  total_upvotes: number;
  rank: number;
  total_users?: number | null;
};

export type LeaderboardTimeframe = "weekly" | "monthly" | "all_time";

export async function getLeaderboardApi(params?: {
  timeframe?: LeaderboardTimeframe;
  page?: number;
  limit?: number;
}): Promise<{
  timeframe: LeaderboardTimeframe;
  leaderboard: LeaderboardEntry[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}> {
  try {
    const res = await api.get<
      ApiResponse<{
        timeframe: LeaderboardTimeframe;
        leaderboard: LeaderboardEntry[];
        pagination: {
          currentPage: number;
          totalPages: number;
          totalCount: number;
          hasNext: boolean;
          hasPrev: boolean;
        };
      }>
    >("/leaderboard", {
      params: {
        timeframe: params?.timeframe,
        page: params?.page,
        limit: params?.limit,
      },
    });

    if (!res.data.success) {
      throw new Error(res.data.error || "Failed to load leaderboard");
    }

    return res.data.data;
  } catch (err: any) {
    throw new Error(extractApiError(err, "Failed to load leaderboard"));
  }
}

export async function getMyRankApi(params?: {
  timeframe?: LeaderboardTimeframe;
}): Promise<{
  timeframe: LeaderboardTimeframe;
  rank: LeaderboardEntry | null;
}> {
  const token = await getAccessToken();
  if (!token) throw new Error("Login required");

  try {
    const res = await api.get<
      ApiResponse<{
        timeframe: LeaderboardTimeframe;
        rank: LeaderboardEntry | null;
      }>
    >("/leaderboard/me", {
      params: { timeframe: params?.timeframe },
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.data.success) {
      throw new Error(res.data.error || "Failed to load rank");
    }

    return res.data.data;
  } catch (err: any) {
    throw new Error(extractApiError(err, "Failed to load rank"));
  }
}
