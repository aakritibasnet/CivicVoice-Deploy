import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors } from "@/theme/colors";
import { useAuth } from "@/hooks/useAuth";
import { isWardUser } from "@/lib/auth";
import Avatar from "@/components/ui/profile/Avatar";

export default function ProfileTab() {
  const { user, avatarUrl, loading } = useAuth();

  if (loading) return <View style={styles.container} />;

  return (
    <View style={{ flex: 1 }}>
      {user ? (
        // ── Authenticated ──
        <View style={styles.container}>
          <View style={styles.profileCard}>
            <Avatar name={user.name} imageUrl={avatarUrl} size={72} />
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.email}>{user.email}</Text>

            <Pressable
              style={({ pressed }) => [
                styles.viewProfileBtn,
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => router.push("/(profile)/profile")}
            >
              <Text style={styles.viewProfileText}>View Profile</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.red2} />
            </Pressable>
          </View>

          {/* My Reports shortcut */}
          <Pressable
            style={({ pressed }) => [
              styles.menuRow,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => router.push("/(profile)/my-reports")}
          >
            <View style={styles.menuIconWrap}>
              <Ionicons
                name="document-text-outline"
                size={20}
                color={colors.red2}
              />
            </View>
            <Text style={styles.menuLabel}>My Reports</Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textMuted}
            />
          </Pressable>

          {/* Bookmarked Reports */}
          <Pressable
            style={({ pressed }) => [
              styles.menuRow,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => router.push("/(profile)/bookmarked")}
          >
            <View style={styles.menuIconWrap}>
              <Ionicons
                name="bookmark-outline"
                size={20}
                color={colors.red2}
              />
            </View>
            <Text style={styles.menuLabel}>Bookmarked Reports</Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textMuted}
            />
          </Pressable>

          {/* Ward-specific menu items */}
          {isWardUser(user) && (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.menuRow,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => router.push("/ward-map" as any)}
              >
                <View style={styles.menuIconWrap}>
                  <Ionicons name="map-outline" size={20} color={colors.red2} />
                </View>
                <Text style={styles.menuLabel}>Task Map</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.menuRow,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => router.push("/ward-publish" as any)}
              >
                <View style={styles.menuIconWrap}>
                  <Ionicons name="document-text-outline" size={20} color={colors.red2} />
                </View>
                <Text style={styles.menuLabel}>Publish Reports</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            </>
          )}
        </View>
      ) : (
        // ── Not authenticated ──
        <View style={styles.container}>
          <View style={styles.guestCard}>
            <View style={styles.guestIcon}>
              <Ionicons name="person-outline" size={48} color={colors.border} />
            </View>

            <Text style={styles.guestTitle}>Your Profile</Text>
            <Text style={styles.guestSubtitle}>
              Login to track reports, earn badges, and join the leaderboard.
            </Text>

            <Pressable
              style={styles.loginBtn}
              onPress={() => router.push("/(auth)/login")}
            >
              <Ionicons name="log-in-outline" size={18} color={colors.white} />
              <Text style={styles.loginBtnText}>Login</Text>
            </Pressable>

            <Pressable
              style={styles.signupBtn}
              onPress={() => router.push("/(auth)/signup")}
            >
              <Text style={styles.signupBtnText}>Create Account</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    paddingTop: Platform.select({ ios: 80, android: 70, default: 70 }),
    backgroundColor: colors.bg,
  },

  // Authenticated
  profileCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 28,
    width: "100%",
  },
  name: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.text,
    marginTop: 14,
  },
  email: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  viewProfileBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.red2,
  },
  viewProfileText: {
    color: colors.red2,
    fontWeight: "800",
    fontSize: 14,
  },

  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.red2 + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },

  // Guest
  guestCard: {
    alignItems: "center",
    width: "100%",
  },
  guestIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  guestTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: colors.text,
  },
  guestSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  loginBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 16,
    backgroundColor: colors.red2,
    width: "100%",
    justifyContent: "center",
  },
  loginBtnText: { color: colors.white, fontWeight: "800", fontSize: 15 },

  signupBtn: {
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.red2,
    width: "100%",
    alignItems: "center",
  },
  signupBtnText: { color: colors.red2, fontWeight: "800", fontSize: 15 },
});
