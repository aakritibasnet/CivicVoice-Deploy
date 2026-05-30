import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useUploadProgress } from "@/store/uploadProgress";
import { colors } from "@/theme/colors";

const STATUS_CONFIG = {
  uploading: {
    barColor: "#3B82F6",
    bgColor: "rgba(59,130,246,0.08)",
    icon: "cloud-upload-outline" as const,
    iconColor: "#3B82F6",
  },
  retrying: {
    barColor: "#F59E0B",
    bgColor: "rgba(245,158,11,0.08)",
    icon: "refresh-outline" as const,
    iconColor: "#F59E0B",
  },
  offline_queued: {
    barColor: "#9CA3AF",
    bgColor: "rgba(156,163,175,0.08)",
    icon: "cloud-offline-outline" as const,
    iconColor: "#9CA3AF",
  },
  success: {
    barColor: "#16A34A",
    bgColor: "rgba(22,163,74,0.08)",
    icon: "checkmark-circle" as const,
    iconColor: "#16A34A",
  },
  error: {
    barColor: "#DC2626",
    bgColor: "rgba(220,38,38,0.08)",
    icon: "alert-circle-outline" as const,
    iconColor: "#DC2626",
  },
};

type Props = {
  onRetry?: () => void;
};

// Tune only for upload-toast positioning; bottom keeps it above tab/footer chrome.
const OVERLAY_LAYOUT = {
  bottom: 84, // Acceptable range: 72-112 px.
  horizontalInset: 16, // Acceptable range: 12-24 px.
  zIndex: 100, // Acceptable range: 100-999; must stay above route content.
};

// Tune card density without changing behavior.
const CARD_LAYOUT = {
  borderRadius: 18, // Acceptable range: 12-24 px.
  padding: 14, // Acceptable range: 12-18 px.
  rowGap: 10, // Acceptable range: 8-14 px.
  contentGap: 12, // Acceptable range: 8-16 px.
  iconWrapSize: 42, // Acceptable range: 36-48 px.
  iconSize: 22, // Acceptable range: 18-28 px.
  progressHeight: 8, // Acceptable range: 4-10 px.
  shadowElevation: 8, // Acceptable range: 4-12.
  shadowOpacity: 0.14, // Acceptable range: 0.08-0.2.
  shadowRadius: 18, // Acceptable range: 10-24 px.
  shadowOffsetY: 8, // Acceptable range: 4-12 px.
  pillRadius: 999, // Keep fully rounded.
  percentPaddingHorizontal: 10, // Acceptable range: 8-12 px.
  percentPaddingVertical: 5, // Acceptable range: 4-6 px.
};

function getStatusCopy(
  status: string,
  progress: number,
  canRetry: boolean,
  errorMessage?: string | null,
) {
  const percent = Math.round(progress * 100);

  switch (status) {
    case "uploading":
      return {
        title: "Uploading report",
        detail: "Keep the app open while we send your report.",
        percentText: `${percent}%`,
      };
    case "retrying":
      return {
        title: "Retrying upload",
        detail: "We are trying to reconnect and finish the upload.",
        percentText: `${percent}%`,
      };
    case "offline_queued":
      return {
        title: "Saved offline",
        detail: "Your report will upload automatically when connected.",
        percentText: null,
      };
    case "success":
      return {
        title: "Upload complete",
        detail: "Your report was submitted successfully.",
        percentText: "100%",
      };
    case "error":
      return {
        title: "Upload failed",
        detail:
          errorMessage ||
          (canRetry
            ? "Tap this card to retry."
            : "Please check your connection and try again."),
        percentText: null,
      };
    default:
      return {
        title: "",
        detail: "",
        percentText: null,
      };
  }
}

export default function UploadProgressOverlay({ onRetry }: Props) {
  const { status, progress, errorMessage } = useUploadProgress();
  const animatedWidth = useSharedValue(0);

  useEffect(() => {
    animatedWidth.value = withTiming(progress, {
      duration: 300,
      easing: Easing.out(Easing.ease),
    });
  }, [animatedWidth, progress]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${animatedWidth.value * 100}%`,
  }));

  if (status === "idle") return null;

  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
  if (!config) return null;

  const isTappable = status === "error" && typeof onRetry === "function";
  const copy = getStatusCopy(status, progress, isTappable, errorMessage);
  const showProgressBar =
    status === "uploading" || status === "retrying" || status === "success";

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <Pressable
        style={styles.card}
        onPress={isTappable ? onRetry : undefined}
        disabled={!isTappable}
      >
        <View style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: config.bgColor }]}>
            <Ionicons
              name={config.icon}
              size={CARD_LAYOUT.iconSize}
              color={config.iconColor}
            />
          </View>

          <View style={styles.copyWrap}>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.detail} numberOfLines={2}>
              {copy.detail}
            </Text>
          </View>

          {copy.percentText ? (
            <View
              style={[
                styles.percentPill,
                { backgroundColor: config.bgColor },
              ]}
            >
              <Text style={[styles.percentText, { color: config.iconColor }]}>
                {copy.percentText}
              </Text>
            </View>
          ) : null}
        </View>

        {showProgressBar && (
          <View style={styles.barTrack}>
            <Animated.View
              style={[
                styles.barFill,
                { backgroundColor: config.barColor },
                barStyle,
              ]}
            />
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: OVERLAY_LAYOUT.bottom,
    left: OVERLAY_LAYOUT.horizontalInset,
    right: OVERLAY_LAYOUT.horizontalInset,
    zIndex: OVERLAY_LAYOUT.zIndex,
    elevation: OVERLAY_LAYOUT.zIndex,
  },
  card: {
    borderRadius: CARD_LAYOUT.borderRadius,
    padding: CARD_LAYOUT.padding,
    gap: CARD_LAYOUT.contentGap,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: CARD_LAYOUT.shadowOffsetY },
    shadowOpacity: CARD_LAYOUT.shadowOpacity,
    shadowRadius: CARD_LAYOUT.shadowRadius,
    elevation: CARD_LAYOUT.shadowElevation,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: CARD_LAYOUT.rowGap,
  },
  iconWrap: {
    width: CARD_LAYOUT.iconWrapSize,
    height: CARD_LAYOUT.iconWrapSize,
    borderRadius: CARD_LAYOUT.pillRadius,
    alignItems: "center",
    justifyContent: "center",
  },
  copyWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  detail: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  percentPill: {
    borderRadius: CARD_LAYOUT.pillRadius,
    paddingHorizontal: CARD_LAYOUT.percentPaddingHorizontal,
    paddingVertical: CARD_LAYOUT.percentPaddingVertical,
  },
  percentText: {
    fontSize: 12,
    fontWeight: "900",
  },
  barTrack: {
    height: CARD_LAYOUT.progressHeight,
    borderRadius: CARD_LAYOUT.pillRadius,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: CARD_LAYOUT.pillRadius,
  },
});
