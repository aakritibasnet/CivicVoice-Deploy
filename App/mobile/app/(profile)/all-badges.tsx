import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Modal,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { colors } from "@/theme/colors";
import {
  getAllBadgesWithStatus,
  type BadgeWithStatus,
  type BadgeTier,
} from "@/api/gamification";
import AppButton from "@/components/ui/common/AppButton";

const TIER_ORDER: BadgeTier[] = ["bronze", "silver", "gold", "platinum"];

const TIER_CONFIG: Record<BadgeTier, { bg: string; label: string; emoji: string }> = {
  bronze: { bg: "#B45309", label: "Bronze", emoji: "🥉" },
  silver: { bg: "#6B7280", label: "Silver", emoji: "🥈" },
  gold: { bg: "#D97706", label: "Gold", emoji: "🥇" },
  platinum: { bg: "#7C3AED", label: "Platinum", emoji: "💎" },
};

export default function AllBadgesScreen() {
  const [badges, setBadges] = useState<BadgeWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBadge, setSelectedBadge] = useState<BadgeWithStatus | null>(null);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      getAllBadgesWithStatus()
        .then(setBadges)
        .catch(() => {})
        .finally(() => setLoading(false));
    }, []),
  );

  const unlockedCount = badges.filter((b) => b.unlocked).length;

  // Group by tier
  const grouped = TIER_ORDER.map((tier) => ({
    tier,
    badges: badges.filter((b) => b.tier === tier),
  })).filter((g) => g.badges.length > 0);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.red2} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>All Badges</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Summary pill */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryPill}>
          <Ionicons name="ribbon" size={16} color={colors.red2} />
          <Text style={styles.summaryText}>
            {unlockedCount} of {badges.length} unlocked
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {grouped.map(({ tier, badges: tierBadges }) => {
          const config = TIER_CONFIG[tier];
          const tierUnlocked = tierBadges.filter((b) => b.unlocked).length;

          return (
            <View key={tier} style={styles.tierSection}>
              {/* Tier header */}
              <View style={styles.tierHeader}>
                <Text style={styles.tierEmoji}>{config.emoji}</Text>
                <Text style={styles.tierLabel}>{config.label}</Text>
                <Text style={styles.tierCount}>
                  {tierUnlocked}/{tierBadges.length}
                </Text>
              </View>

              {/* Badge grid */}
              <View style={styles.badgeGrid}>
                {tierBadges.map((badge) => (
                  <Pressable
                    key={badge.id}
                    style={styles.badgeCard}
                    onPress={() => setSelectedBadge(badge)}
                  >
                    <View
                      style={[
                        styles.badgeIconCircle,
                        {
                          backgroundColor: badge.unlocked
                            ? config.bg
                            : colors.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name={badge.icon_name as any}
                        size={28}
                        color={badge.unlocked ? colors.white : colors.textMuted}
                      />
                      {!badge.unlocked && (
                        <View style={styles.lockBadge}>
                          <Ionicons name="lock-closed" size={10} color={colors.white} />
                        </View>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.badgeName,
                        !badge.unlocked && styles.badgeNameLocked,
                      ]}
                      numberOfLines={2}
                    >
                      {badge.name}
                    </Text>
                    {badge.unlocked ? (
                      <View style={styles.unlockedTag}>
                        <Ionicons name="checkmark-circle" size={12} color="#16A34A" />
                        <Text style={styles.unlockedTagText}>Earned</Text>
                      </View>
                    ) : badge.progress_percent != null && badge.progress_percent > 0 ? (
                      <View style={styles.progressWrap}>
                        <View style={styles.progressBarOuter}>
                          <View
                            style={[
                              styles.progressBarInner,
                              {
                                width: `${Math.max(6, Math.min(100, badge.progress_percent))}%`,
                                backgroundColor: config.bg,
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.progressText}>
                          {Math.round(badge.progress_percent)}%
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.lockedLabel}>Locked</Text>
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Badge detail modal */}
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
                styles.detailIconCircle,
                {
                  backgroundColor: selectedBadge.unlocked
                    ? TIER_CONFIG[selectedBadge.tier].bg
                    : colors.border,
                },
              ]}
            >
              <Ionicons
                name={selectedBadge.icon_name as any}
                size={40}
                color={selectedBadge.unlocked ? colors.white : colors.textMuted}
              />
            </View>

            <Text style={styles.sheetTitle}>{selectedBadge.name}</Text>
            <Text style={styles.sheetTier}>
              {TIER_CONFIG[selectedBadge.tier].emoji}{" "}
              {selectedBadge.tier.toUpperCase()} BADGE
            </Text>

            <Text style={styles.sheetDesc}>{selectedBadge.description}</Text>

            {/* Criteria info */}
            <View style={styles.criteriaRow}>
              <Ionicons name="flag-outline" size={14} color={colors.textMuted} />
              <Text style={styles.criteriaText}>
                Requires: {selectedBadge.criteria_value}{" "}
                {selectedBadge.criteria_type.replace(/_/g, " ")}
              </Text>
            </View>

            {selectedBadge.unlocked && selectedBadge.earned_at ? (
              <View style={styles.earnedRow}>
                <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                <Text style={styles.earnedText}>
                  Earned on{" "}
                  {new Date(selectedBadge.earned_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </Text>
              </View>
            ) : (
              <View style={styles.lockedDetail}>
                <View style={styles.detailProgressOuter}>
                  <View
                    style={[
                      styles.detailProgressInner,
                      {
                        width: `${Math.max(
                          4,
                          Math.min(100, selectedBadge.progress_percent ?? 0),
                        )}%`,
                        backgroundColor: TIER_CONFIG[selectedBadge.tier].bg,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.detailProgressText}>
                  {Math.round(selectedBadge.progress_percent ?? 0)}% complete
                </Text>
                <Text style={styles.encouragement}>
                  Keep going — you're making progress toward this badge!
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
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // Header
  header: {
    paddingTop: Platform.select({ ios: 60, android: 48, default: 48 }),
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
  },

  // Summary
  summaryRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  summaryPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.red2 + "10",
    borderWidth: 1,
    borderColor: colors.red2 + "20",
  },
  summaryText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.red2,
  },

  content: {
    paddingHorizontal: 16,
  },

  // Tier section
  tierSection: {
    marginTop: 20,
  },
  tierHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  tierEmoji: {
    fontSize: 18,
  },
  tierLabel: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
  },
  tierCount: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    marginLeft: "auto",
  },

  // Badge grid
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  badgeCard: {
    width: "47%",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
  },
  badgeIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  lockBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.card,
  },
  badgeName: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
    marginBottom: 6,
  },
  badgeNameLocked: {
    color: colors.textMuted,
  },
  unlockedTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  unlockedTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#16A34A",
  },
  progressWrap: {
    width: "100%",
    gap: 4,
  },
  progressBarOuter: {
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.bg,
    overflow: "hidden",
    width: "100%",
  },
  progressBarInner: {
    height: "100%",
    borderRadius: 999,
  },
  progressText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    textAlign: "center",
  },
  lockedLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },

  // Modal
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
    padding: 16,
  },
  detailIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
    textAlign: "center",
  },
  sheetTier: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: 4,
  },
  sheetDesc: {
    marginTop: 12,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    textAlign: "center",
  },
  criteriaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.bg,
    alignSelf: "center",
  },
  criteriaText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  earnedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
  },
  earnedText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#16A34A",
  },
  lockedDetail: {
    marginTop: 12,
    alignItems: "center",
  },
  detailProgressOuter: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.bg,
    overflow: "hidden",
    width: "80%",
  },
  detailProgressInner: {
    height: "100%",
    borderRadius: 999,
  },
  detailProgressText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  encouragement: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
    textAlign: "center",
  },
});
