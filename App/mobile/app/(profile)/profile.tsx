import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { getMe, User, isWardOrgAccount } from "@/lib/auth";
import { getAccessToken } from "@/lib/session";
import Avatar from "@/components/ui/profile/Avatar";
import AppButton from "@/components/ui/common/AppButton";
import { useToast } from "@/components/ui/feedback/ToastProvider";
import { colors } from "@/theme/colors";
import { debugWarn } from "@/lib/debug";
import { getFriendlyErrorMessage } from "@/lib/feedback";
import {
  getAllBadgesWithStatus,
  getMyStats,
  type BadgeWithStatus,
  type ProfileStats,
} from "@/api/gamification";
import { updateProfileImage } from "@/api/profile/profileEdit";

export default function ProfileScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [allBadges, setAllBadges] = useState<BadgeWithStatus[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<BadgeWithStatus | null>(
    null,
  );
  const [uploadingImage, setUploadingImage] = useState(false);
  const { showToast } = useToast();

  const avatarUrl = user?.profile_image_url || null;
  const isWardOrg = isWardOrgAccount(user);

  const loadUser = async () => {
    const token = await getAccessToken();
    if (!token) {
      setUser(null);
      return;
    }

    const res = await getMe();
    setUser(res.user);
  };

  const loadGamification = async () => {
    try {
      const [statsRes, badges] = await Promise.all([
        getMyStats(),
        getAllBadgesWithStatus(),
      ]);
      setStats(statsRes);
      setAllBadges(badges);
    } catch (e) {
      debugWarn("Failed to load profile stats or badges", e);
      showToast({
        type: "error",
        title: "Couldn't load profile details",
        message: getFriendlyErrorMessage(
          e,
          "Something went wrong. Please try again.",
        ),
      });
    }
  };

  useEffect(() => {
    loadUser().then(() => {
      void loadGamification();
    });
  }, []);

  async function pickAndUploadImage() {
    const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permResult.granted) {
      showToast({
        type: "info",
        title: "Permission needed",
        message: "Please allow access to your photo library.",
      });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    try {
      setUploadingImage(true);
      const res = await updateProfileImage(result.assets[0].uri);
      setUser((prev) =>
        prev ? { ...prev, profile_image_url: res.profile_image_url } : prev,
      );
      showToast({
        type: "success",
        title: "Profile updated",
        message: "Your profile photo was updated.",
      });
    } catch (e: any) {
      showToast({
        type: "error",
        title: "Upload failed",
        message: getFriendlyErrorMessage(
          e,
          "Something went wrong. Please try again.",
        ),
      });
    } finally {
      setUploadingImage(false);
    }
  }

  const streakLabel = useMemo(() => {
    if (!stats) return "No streak yet";
    if (stats.current_streak_days <= 0) return "No active streak";
    if (stats.current_streak_days === 1) return "1 day streak";
    return `${stats.current_streak_days} day streak`;
  }, [stats]);

  const memberSinceText = useMemo(() => {
    if (!stats?.member_since) return "";
    const joined = new Date(stats.member_since);
    return joined.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
    });
  }, [stats]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.red2, colors.red3]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.back}>←</Text>
          </Pressable>

          <Text style={styles.headerTitle}>Profile</Text>

          <Pressable
            onPress={() => router.push("/(profile)/account-settings")}
            hitSlop={10}
          >
            <Ionicons name="settings-outline" size={20} color={colors.white} />
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Pressable
            onPress={isWardOrg ? undefined : pickAndUploadImage}
            disabled={uploadingImage || isWardOrg}
          >
            <Avatar
              name={user?.name}
              imageUrl={avatarUrl}
              size={86}
              style={{ borderColor: "rgba(255,255,255,0.35)" }}
            />
            {!isWardOrg && (
              <View style={styles.cameraOverlay}>
                {uploadingImage ? (
                  <ActivityIndicator size={14} color={colors.white} />
                ) : (
                  <Ionicons name="camera" size={14} color={colors.white} />
                )}
              </View>
            )}
          </Pressable>

          <Text style={styles.name}>{user?.name || "User"}</Text>
          <Text style={styles.email}>{user?.email || ""}</Text>

          {stats ? (
            <Text style={styles.memberSince}>Member since {memberSinceText}</Text>
          ) : null}

          <View style={styles.streakWrap}>
            <View style={styles.streakIcon}>
              <Text style={styles.streakFlame}>🔥</Text>
            </View>
            <View>
              <Text style={styles.streakLabel}>Current streak</Text>
              <Text style={styles.streakValue}>{streakLabel}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body}>
        {stats && (
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Ionicons
                name="document-text-outline"
                size={20}
                color={colors.red2}
              />
              <Text style={styles.statValue}>{stats.total_reports}</Text>
              <Text style={styles.statLabel}>Reports</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="checkmark-done" size={20} color="#16A34A" />
              <Text style={styles.statValue}>{stats.resolved_reports}</Text>
              <Text style={styles.statLabel}>Resolved</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="stats-chart-outline" size={20} color="#2563EB" />
              <Text style={styles.statValue}>
                {stats.resolution_rate.toFixed(0)}%
              </Text>
              <Text style={styles.statLabel}>Resolution rate</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons
                name="arrow-up-circle-outline"
                size={20}
                color="#F97316"
              />
              <Text style={styles.statValue}>
                {stats.total_upvotes_received}
              </Text>
              <Text style={styles.statLabel}>Upvotes</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="flame-outline" size={20} color="#EA580C" />
              <Text style={styles.statValue}>{stats.current_streak_days}</Text>
              <Text style={styles.statLabel}>Current streak</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="diamond-outline" size={20} color="#8B5CF6" />
              <Text style={styles.statValue}>{stats.impact_score}</Text>
              <Text style={styles.statLabel}>Impact score</Text>
            </View>
          </View>
        )}

        {allBadges.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.label}>
                Badges{" "}
                {allBadges.filter((badge) => badge.unlocked).length > 0 && (
                  <Text style={styles.badgeCountText}>
                    ({allBadges.filter((badge) => badge.unlocked).length}/
                    {allBadges.length})
                  </Text>
                )}
              </Text>
              <Pressable
                onPress={() => router.push("/(profile)/all-badges")}
                hitSlop={10}
              >
                <Text style={styles.viewAllText}>View All</Text>
              </Pressable>
            </View>

            {allBadges.some((badge) => badge.unlocked) ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.badgeRow}
              >
                {allBadges
                  .filter((badge) => badge.unlocked)
                  .map((badge) => (
                    <Pressable
                      key={badge.id}
                      style={[
                        styles.badgeCircle,
                        styles[`tier_${badge.tier}` as const],
                      ]}
                      onPress={() => setSelectedBadge(badge)}
                    >
                      <Ionicons
                        name={badge.icon_name as any}
                        size={26}
                        color={colors.white}
                      />
                    </Pressable>
                  ))}
              </ScrollView>
            ) : (
              <Text style={styles.noBadgesYet}>
                No badges earned yet. Keep reporting to unlock badges!
              </Text>
            )}
          </View>
        )}

        <View style={{ height: 28 }} />
      </ScrollView>

      <Modal
        visible={!!selectedBadge}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedBadge(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSelectedBadge(null)}
        />

        {selectedBadge && (
          <View style={styles.sheet}>
            <View
              style={[
                styles.badgeDetailIconWrap,
                styles[`tier_${selectedBadge.tier}` as const],
              ]}
            >
              <Ionicons
                name={selectedBadge.icon_name as any}
                size={40}
                color={colors.white}
              />
            </View>

            <Text style={styles.sheetTitle}>{selectedBadge.name}</Text>
            <Text style={styles.badgeTierText}>
              {selectedBadge.tier.toUpperCase()} BADGE
            </Text>

            <Text style={styles.badgeDescription}>
              {selectedBadge.description}
            </Text>

            {selectedBadge.unlocked && selectedBadge.earned_at ? (
              <Text style={styles.badgeEarnedText}>
                Earned on{" "}
                {new Date(selectedBadge.earned_at).toLocaleDateString()}
              </Text>
            ) : (
              <View style={{ marginTop: 8 }}>
                <View style={styles.progressBarOuter}>
                  <View
                    style={[
                      styles.progressBarInner,
                      {
                        width: `${
                          selectedBadge.progress_percent != null
                            ? Math.max(
                                4,
                                Math.min(100, selectedBadge.progress_percent),
                              )
                            : 0
                        }%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.badgeEncouragement}>
                  Keep going, you&apos;re close to unlocking this badge!
                </Text>
              </View>
            )}

            <View style={{ height: 10 }} />
            <AppButton title="Close" onPress={() => setSelectedBadge(null)} />
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    paddingTop: 54,
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },

  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  back: { color: colors.white, fontWeight: "900", fontSize: 18 },

  headerTitle: {
    color: colors.white,
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 0.3,
  },

  hero: { alignItems: "center", marginTop: 14 },

  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.red2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.white,
  },

  name: { marginTop: 10, color: colors.white, fontWeight: "900", fontSize: 18 },

  email: {
    marginTop: 2,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "700",
    fontSize: 12,
  },

  memberSince: {
    marginTop: 4,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "700",
    fontSize: 11,
  },

  streakWrap: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  streakIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  streakFlame: {
    fontSize: 16,
  },
  streakLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    fontWeight: "700",
  },
  streakValue: {
    color: colors.white,
    fontWeight: "900",
    fontSize: 13,
  },

  body: { padding: 16, paddingTop: 18 },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    width: "47%",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "flex-start",
    gap: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },

  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },

  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  label: {
    color: colors.textMuted,
    fontWeight: "800",
    fontSize: 11,
    marginBottom: 6,
  },

  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },

  sheet: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 20,
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },

  sheetTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 10,
  },

  badgeRow: {
    paddingVertical: 8,
    gap: 10,
  },
  badgeCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  tier_bronze: {
    backgroundColor: "#B45309",
  },
  tier_silver: {
    backgroundColor: "#6B7280",
  },
  tier_gold: {
    backgroundColor: "#D97706",
  },
  tier_platinum: {
    backgroundColor: "#7C3AED",
  },
  badgeCountText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.red2,
  },
  noBadgesYet: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 19,
  },
  progressBarOuter: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
  progressBarInner: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.red2,
  },
  badgeDetailIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 10,
  },
  badgeTierText: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 1,
  },
  badgeDescription: {
    marginTop: 10,
    fontSize: 13,
    color: colors.text,
  },
  badgeEarnedText: {
    marginTop: 10,
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "700",
  },
  badgeEncouragement: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "700",
  },
});
