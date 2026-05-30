import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";
import {
  getAnonymousReports,
  getDeviceId,
  clearAnonymousReports,
  type AnonymousReportMeta,
} from "@/lib/anonymousStorage";
import { claimAnonymousReports } from "@/api/reports";
import { getAccessToken } from "@/lib/session";
import { useToast } from "@/components/ui/feedback/ToastProvider";
import { debugWarn } from "@/lib/debug";
import { getFriendlyErrorMessage } from "@/lib/feedback";

type Props = {
  visible: boolean;
  onDismiss: () => void;
  onClaimed: () => void;
};

/**
 * Shown after login/signup if the user has unclaimed anonymous reports
 * on this device. Allows linking them to their new account.
 */
export default function ClaimReportsPrompt({
  visible,
  onDismiss,
  onClaimed,
}: Props) {
  const [reports, setReports] = useState<AnonymousReportMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (visible) {
      getAnonymousReports().then(setReports);
    }
  }, [visible]);

  if (!visible || reports.length === 0) return null;

  const handleClaim = async () => {
    try {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) {
        showToast({
          type: "error",
          title: "Login required",
          message: "Please log in and try again.",
        });
        return;
      }

      const deviceId = await getDeviceId();
      const reportIds = reports.map((r) => String(r.reportId));

      await claimAnonymousReports(deviceId, reportIds);
      await clearAnonymousReports();
      showToast({
        type: "success",
        title: "Reports linked",
        message: "Your previous reports are now linked to this account.",
      });

      onClaimed();
    } catch (e: any) {
      debugWarn("Failed to claim anonymous reports", e?.message ?? e);
      // Silently dismiss – not critical
      showToast({
        type: "error",
        title: "Couldn't link reports",
        message: getFriendlyErrorMessage(
          e,
          "Something went wrong. Please try again.",
        ),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.iconRow}>
          <View style={styles.iconCircle}>
            <Ionicons name="link-outline" size={28} color={colors.red2} />
          </View>
        </View>

        <Text style={styles.title}>Link Your Reports</Text>
        <Text style={styles.subtitle}>
          You have{" "}
          <Text style={styles.count}>{reports.length}</Text>{" "}
          {reports.length === 1 ? "report" : "reports"} submitted before
          logging in. Link them to your account to track updates and earn badges.
        </Text>

        <Pressable
          style={[styles.claimBtn, loading && { opacity: 0.6 }]}
          onPress={handleClaim}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color={colors.white} />
              <Text style={styles.claimBtnText}>Link to My Account</Text>
            </>
          )}
        </Pressable>

        <Pressable style={styles.skipBtn} onPress={onDismiss}>
          <Text style={styles.skipBtnText}>Skip for Now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
    padding: 24,
  },
  card: {
    width: "100%",
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconRow: { marginBottom: 14 },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.red2 + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  count: { fontWeight: "900", color: colors.text },
  claimBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    backgroundColor: colors.red2,
    width: "100%",
  },
  claimBtnText: { color: colors.white, fontWeight: "800", fontSize: 15 },
  skipBtn: {
    marginTop: 12,
    paddingVertical: 10,
  },
  skipBtnText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
});
