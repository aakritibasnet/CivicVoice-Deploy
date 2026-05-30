import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { colors } from "@/theme/colors";
import { getOfficerProfileApi, updateOfficerPhoto } from "@/api/officerApi";
import { useAuth } from "@/hooks/useAuth";
import Avatar from "@/components/ui/profile/Avatar";
import { useToast } from "@/components/ui/feedback/ToastProvider";

export default function OfficerProfileScreen() {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const { showToast } = useToast();

  const profileQuery = useQuery({
    queryKey: ["officerProfile"],
    queryFn: getOfficerProfileApi,
  });

  const profile = profileQuery.data;

  const handlePhotoUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]) return;

    try {
      setUploading(true);
      await updateOfficerPhoto(result.assets[0].uri);
      showToast({
        type: "success",
        title: "Profile updated",
        message: "Your profile photo was updated.",
      });
      profileQuery.refetch();
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Update failed",
        message: err.message,
      });
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await signOut();
          queryClient.clear();
          router.replace("/(auth)/login" as any);
        },
      },
    ]);
  };

  if (profileQuery.isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.red2} />
      </View>
    );
  }

  const completionRate =
    profile && profile.total_tasks > 0
      ? Math.round((profile.completed_tasks / profile.total_tasks) * 100)
      : 0;
  const isMunicipalityOfficer = profile?.type === "municipality_officer";
  const roleLabel = isMunicipalityOfficer
    ? profile?.municipality_name
      ? `${profile.municipality_name} Municipality Officer`
      : "Municipality Officer"
    : profile?.ward_name
      ? `${profile.ward_name} Officer`
      : "Officer";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <Pressable onPress={handlePhotoUpload} disabled={uploading}>
            <View style={styles.avatarWrap}>
              <Avatar
                name={profile?.name || "Officer"}
                imageUrl={profile?.profile_image_url}
                size={80}
              />
              <View style={styles.cameraIcon}>
                {uploading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons name="camera" size={14} color={colors.white} />
                )}
              </View>
            </View>
          </Pressable>

          <Text style={styles.name}>{profile?.name || "Officer"}</Text>
          <Text style={styles.email}>{profile?.email || ""}</Text>

          <View style={styles.roleBadge}>
            <Ionicons name="shield-checkmark" size={12} color={colors.red2} />
            <Text style={styles.roleText}>{roleLabel}</Text>
          </View>

          {profile?.department_name && (
            <View style={styles.deptBadge}>
              <Ionicons
                name="business-outline"
                size={12}
                color={colors.textMuted}
              />
              <Text style={styles.deptText}>{profile.department_name}</Text>
            </View>
          )}

          <Text style={styles.memberSince}>
            Member since{" "}
            {profile?.created_at
              ? new Date(profile.created_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                })
              : ""}
          </Text>
        </View>

        {/* Stats */}
        {profile && (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{profile.total_tasks}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: "#F59E0B" }]}>
                {isMunicipalityOfficer ? (profile.incoming_tasks ?? 0) : profile.completed_tasks}
              </Text>
              <Text style={styles.statLabel}>
                {isMunicipalityOfficer ? "Incoming" : "Completed"}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text
                style={[
                  styles.statValue,
                  { color: isMunicipalityOfficer ? "#2563EB" : "#F59E0B" },
                ]}
              >
                {profile.active_tasks}
              </Text>
              <Text style={styles.statLabel}>
                {isMunicipalityOfficer ? "In Progress" : "Active"}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text
                style={[
                  styles.statValue,
                  { color: isMunicipalityOfficer ? "#16A34A" : "#8B5CF6" },
                ]}
              >
                {isMunicipalityOfficer ? profile.completed_tasks : `${completionRate}%`}
              </Text>
              <Text style={styles.statLabel}>
                {isMunicipalityOfficer ? "Completed" : "Rate"}
              </Text>
            </View>
          </View>
        )}

        {/* Menu */}
        <MenuItem
          icon="time-outline"
          label="Task History"
          onPress={() => router.push("/(officer-tabs)/history" as any)}
        />
        <MenuItem
          icon="notifications-outline"
          label="Notifications"
          onPress={() => router.push("/officer-notifications" as any)}
        />
        <MenuItem
          icon="key-outline"
          label="Change Password"
          onPress={() => router.push("/(officer-auth)/change-password" as any)}
        />
        <MenuItem
          icon="log-out-outline"
          label="Logout"
          danger
          onPress={handleLogout}
        />

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readOnlyRow}>
      <Text style={styles.readOnlyLabel}>{label}</Text>
      <Text style={styles.readOnlyValue}>{value}</Text>
    </View>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.85 }]}
      onPress={onPress}
    >
      <View
        style={[
          styles.menuIconWrap,
          danger && { backgroundColor: colors.danger + "12" },
        ]}
      >
        <Ionicons
          name={icon as any}
          size={20}
          color={danger ? colors.danger : colors.red2}
        />
      </View>
      <Text style={[styles.menuLabel, danger && { color: colors.danger }]}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },

  header: {
    paddingTop: Platform.select({ ios: 60, android: 48, default: 48 }),
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 24, fontWeight: "900", color: colors.text },

  content: { padding: 16 },

  profileCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 28,
    marginBottom: 16,
  },
  avatarWrap: { position: "relative" },
  cameraIcon: {
    position: "absolute",
    bottom: 0,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.red2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.card,
  },
  name: { fontSize: 20, fontWeight: "900", color: colors.text, marginTop: 14 },
  email: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.red2 + "12",
  },
  roleText: { fontSize: 13, fontWeight: "700", color: colors.red2 },
  deptBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  deptText: { fontSize: 12, color: colors.textMuted, fontWeight: "700" },
  memberSince: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "700",
    marginTop: 8,
  },

  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    alignItems: "stretch",
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    minHeight: 82,
    paddingHorizontal: 6,
    paddingVertical: 12,
    overflow: "visible",
  },
  statValue: { fontSize: 20, fontWeight: "900", color: colors.text },
  statLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 14,
    textAlign: "center",
    includeFontPadding: false,
  },

  infoCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  infoHeaderText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },

  readOnlyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  readOnlyLabel: { fontSize: 13, color: colors.textMuted, fontWeight: "700" },
  readOnlyValue: { fontSize: 13, color: colors.text, fontWeight: "700" },

  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.red2 + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: "800", color: colors.text },
});
