import { api } from "@/lib/api";

export type PublicBadge = {
  id: string;
  name: string;
  description: string;
  icon_name: string;
  tier: "bronze" | "silver" | "gold" | "platinum";
  earned_at: string;
};

export type PublicProfile = {
  id: string;
  name: string;
  profile_image_url: string | null;
  member_since: string;
  stats: {
    total_reports: number;
    resolved_reports: number;
    current_streak_days: number;
    longest_streak_days: number;
    impact_score: number;
  };
  badges: PublicBadge[];
};

export async function getPublicProfile(userId: string): Promise<PublicProfile> {
  const res = await api.get<PublicProfile>(`/profile/public/${userId}`);
  return res.data;
}
