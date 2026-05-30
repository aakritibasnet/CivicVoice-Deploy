import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AnimatedPressable } from "@/components/ui/tap-feedback";
import { colors } from "@/theme/colors";
import type { User } from "@/lib/auth";

type Props = {
  user: User | null;
};

export default function HomeContent({ user }: Props) {
  return (
    <View style={styles.container}>
      {/* ── Branding ── */}
      <View style={styles.brandArea}>
        <View style={styles.logoCircle}>
          <Ionicons name="megaphone" size={42} color={colors.white} />
        </View>
        <Text style={styles.appName}>CivicVoice</Text>
        <Text style={styles.tagline}>
          {user
            ? `Welcome back, ${user.name?.split(" ")[0] || "Citizen"}!`
            : "Report issues. Improve your community."}
        </Text>
      </View>

      {/* ── Action Buttons ── */}
      <View style={styles.actions}>
        <AnimatedPressable
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && { opacity: 0.98 },
          ]}
          onPress={() => router.push("/(camera)/camera")}
          tapVariant="button"
          accessibilityLabel="Report an issue"
          accessibilityHint="Opens camera to capture a photo of the issue"
        >
          <LinearGradient
            colors={[colors.red2, colors.red3]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientBtn}
          >
            <Ionicons name="camera-outline" size={26} color={colors.white} />
            <Text style={styles.primaryBtnText}>Report an Issue</Text>
          </LinearGradient>
        </AnimatedPressable>

        {!user && (
          <AnimatedPressable
            style={({ pressed }) => [
              styles.secondaryBtn,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => router.push("/(auth)/login")}
            tapVariant="button"
            accessibilityLabel="Login or sign up"
          >
            <Ionicons name="log-in-outline" size={20} color={colors.red2} />
            <Text style={styles.secondaryBtnText}>Login / Sign Up</Text>
          </AnimatedPressable>
        )}
      </View>

      {/* ── Info pill ── */}
      <View style={styles.infoPill}>
        <Ionicons
          name="shield-checkmark-outline"
          size={16}
          color={colors.textMuted}
        />
        <Text style={styles.infoText}>
          {user
            ? "Your reports help build a better community"
            : "No account needed to report — login to track & earn badges"}
        </Text>
      </View>
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

  brandArea: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.red2,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    elevation: 4,
    shadowColor: colors.red2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  appName: {
    fontSize: 32,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 22,
  },

  actions: {
    width: "100%",
    gap: 14,
    marginBottom: 32,
  },

  primaryBtn: {
    borderRadius: 18,
    overflow: "hidden",
    elevation: 3,
    shadowColor: colors.red2,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  gradientBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    borderRadius: 18,
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.red2,
    backgroundColor: colors.card,
  },
  secondaryBtnText: {
    color: colors.red2,
    fontSize: 16,
    fontWeight: "800",
  },

  infoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
});
