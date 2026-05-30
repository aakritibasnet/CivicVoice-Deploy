import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ErrorBoundaryProps } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { AnimatedPressable } from "@/components/ui/tap-feedback";
import { colors } from "@/theme/colors";
import { getFriendlyErrorMessage } from "@/lib/feedback";

export default function AppErrorFallback({
  error,
  retry,
}: ErrorBoundaryProps) {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.red2, colors.red3]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.iconWrap}
      >
        <Ionicons name="alert-circle-outline" size={34} color={colors.white} />
      </LinearGradient>

      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.subtitle}>
        The app hit an unexpected issue. You can try again without losing your
        place.
      </Text>

      <View style={styles.detailsCard}>
        <Text style={styles.detailsTitle}>Helpful detail</Text>
        <Text style={styles.detailsText}>
          {getFriendlyErrorMessage(
            error,
            "Unexpected application error.",
          )}
        </Text>
      </View>

      <AnimatedPressable style={styles.primaryBtn} onPress={retry} tapVariant="button">
        <Text style={styles.primaryBtnText}>Try Again</Text>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: 20,
  },
  detailsCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 16,
    marginBottom: 18,
  },
  detailsTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.textMuted,
    marginBottom: 6,
  },
  detailsText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.text,
  },
  primaryBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.red2,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: "900",
    color: colors.white,
  },
});
