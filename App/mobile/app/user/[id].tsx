import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { colors } from "@/theme/colors";
import { getPublicProfile, type PublicProfile, type PublicBadge } from "@/api/publicProfile";

const TIER_COLORS: Record<string, string> = {
  bronze: "#B45309",
  silver: "#6B7280",
  gold: "#D97706",
  platinum: "#7C3AED",
};

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getPublicProfile(id)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.red2} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <Ionicons name="person-outline" size={48} color={colors.border} />
        <Text style={styles.errorText}>User not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const memberSince = new Date(profile.member_since).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
  });

  const streakLabel =
    profile.stats.current_streak_days <= 0
      ? "No active streak"
      : profile.stats.current_streak_days === 1
        ? "1 day streak"
        : `${profile.stats.current_streak_days} day streak`;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Avatar & name */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarWrap}>
            {profile.profile_image_url ? (
              <Image source={{ uri: profile.profile_image_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>
                  {(profile.name || "?")[0].toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.memberSince}>Member since {memberSince}</Text>

          {/* Streak */}
          <View style={styles.streakPill}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <Text style={styles.streakText}>{streakLabel}</Text>
          </View>
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="document-text-outline" size={18} color={colors.red2} />
            <Text style={styles.statValue}>{profile.stats.total_reports}</Text>
            <Text style={styles.statLabel}>Reports</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="checkmark-done" size={18} color="#16A34A" />
            <Text style={styles.statValue}>{profile.stats.resolved_reports}</Text>
            <Text style={styles.statLabel}>Resolved</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="flame-outline" size={18} color="#EA580C" />
            <Text style={styles.statValue}>{profile.stats.longest_streak_days}</Text>
            <Text style={styles.statLabel}>Best Streak</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="diamond-outline" size={18} color="#8B5CF6" />
            <Text style={styles.statValue}>{profile.stats.impact_score}</Text>
            <Text style={styles.statLabel}>Impact</Text>
          </View>
        </View>

        {/* Badges */}
        {profile.badges.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Badges ({profile.badges.length})</Text>
            <View style={styles.badgeGrid}>
              {profile.badges.map((badge) => (
                <View key={badge.id} style={styles.badgeItem}>
                  <View
                    style={[
                      styles.badgeCircle,
                      { backgroundColor: TIER_COLORS[badge.tier] || colors.textMuted },
                    ]}
                  >
                    <Ionicons name={badge.icon_name as any} size={22} color={colors.white} />
                  </View>
                  <Text style={styles.badgeName} numberOfLines={1}>
                    {badge.name}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {profile.badges.length === 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Badges</Text>
            <Text style={styles.noBadges}>No badges earned yet.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: 12,
  },
  backBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.red2,
  },
  backBtnText: { color: colors.white, fontWeight: "800" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.select({ ios: 56, android: 46, default: 46 }),
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: "900", color: colors.text },

  body: { padding: 16, paddingBottom: 40 },

  profileHeader: { alignItems: "center", marginBottom: 20 },
  avatarWrap: { marginBottom: 10 },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.red2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: colors.white, fontSize: 32, fontWeight: "900" },
  name: { fontSize: 20, fontWeight: "900", color: colors.text },
  memberSince: { fontSize: 12, color: colors.textMuted, marginTop: 4 },

  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  streakEmoji: { fontSize: 16 },
  streakText: { fontSize: 13, fontWeight: "800", color: colors.text },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    width: "47%",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "flex-start",
    gap: 4,
  },
  statValue: { fontSize: 18, fontWeight: "900", color: colors.text },
  statLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted },

  section: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: "900", color: colors.text, marginBottom: 10 },

  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  badgeItem: { alignItems: "center", width: 70 },
  badgeCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  badgeName: { fontSize: 11, fontWeight: "700", color: colors.text, textAlign: "center" },
  noBadges: { fontSize: 13, color: colors.textMuted, fontStyle: "italic" },
});
