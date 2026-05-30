import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  Switch,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { colors } from "@/theme/colors";
import {
  getNotificationPreferencesApi,
  updateNotificationPreferencesApi,
  type NotificationPreferences,
} from "@/api/notifications";

type PrefKey = keyof NotificationPreferences;

const PREF_ITEMS: {
  key: PrefKey;
  label: string;
  description: string;
  icon: string;
  color: string;
}[] = [
  {
    key: "notify_status_changes",
    label: "Status Changes",
    description: "When your report status changes (in progress, completed, etc.)",
    icon: "checkmark-circle-outline",
    color: "#16A34A",
  },
  {
    key: "notify_comments",
    label: "Comments",
    description: "When someone comments on your report",
    icon: "chatbubble-ellipses-outline",
    color: "#2563EB",
  },
  {
    key: "notify_upvote_milestones",
    label: "Upvote Milestones",
    description: "When your report reaches 10, 50, 100, or 500 upvotes",
    icon: "trophy-outline",
    color: "#D97706",
  },
  {
    key: "notify_badge_earned",
    label: "Badge Earned",
    description: "When you earn a new badge",
    icon: "ribbon-outline",
    color: "#8B5CF6",
  },
  {
    key: "notify_nearby_resolved",
    label: "Nearby Resolved",
    description: "When a report near your location gets resolved",
    icon: "location-outline",
    color: "#0D9488",
  },
];

export default function NotificationSettingsScreen() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<PrefKey | null>(null);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      getNotificationPreferencesApi()
        .then(setPrefs)
        .catch(() => {})
        .finally(() => setLoading(false));
    }, []),
  );

  const togglePref = async (key: PrefKey) => {
    if (!prefs) return;
    const newValue = !prefs[key];
    // Optimistic
    setPrefs({ ...prefs, [key]: newValue });
    setUpdating(key);
    try {
      const updated = await updateNotificationPreferencesApi({ [key]: newValue });
      setPrefs(updated);
    } catch {
      // Revert
      setPrefs({ ...prefs, [key]: !newValue });
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.red2} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Notification Settings</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>NOTIFICATION TYPES</Text>
        <Text style={styles.sectionDesc}>
          Choose which notifications you want to receive.
        </Text>

        {PREF_ITEMS.map((item) => (
          <View key={item.key} style={styles.row}>
            <View style={[styles.iconCircle, { backgroundColor: item.color + "14" }]}>
              <Ionicons name={item.icon as any} size={18} color={item.color} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>{item.label}</Text>
              <Text style={styles.rowDesc}>{item.description}</Text>
            </View>
            <Switch
              value={prefs?.[item.key] ?? true}
              onValueChange={() => togglePref(item.key)}
              trackColor={{ false: colors.border, true: colors.red2 }}
              thumbColor={colors.white}
              disabled={updating === item.key}
            />
          </View>
        ))}
      </ScrollView>
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
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: 16,
  },
  sectionDesc: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 19,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  rowDesc: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 17,
  },
});
