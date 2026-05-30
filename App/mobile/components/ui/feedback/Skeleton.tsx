import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
import { colors } from "@/theme/colors";

/**
 * A single shimmering placeholder block. Uses the built-in Animated API
 * (no reanimated worklets) so it is safe to drop anywhere.
 */
export function Skeleton({
  width,
  height = 14,
  radius = 8,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width ?? "100%",
          height,
          borderRadius: radius,
          backgroundColor: colors.border,
          opacity,
        },
        style,
      ]}
    />
  );
}

/** A card-shaped placeholder matching the report feed card layout. */
export function ReportCardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton height={200} radius={0} />
      <View style={styles.body}>
        <View style={styles.row}>
          <Skeleton width={70} height={20} radius={10} />
          <Skeleton width={90} height={20} radius={10} />
        </View>
        <Skeleton width="80%" height={18} style={{ marginTop: 12 }} />
        <Skeleton width="60%" height={14} style={{ marginTop: 8 }} />
        <Skeleton width="100%" height={44} radius={12} style={{ marginTop: 12 }} />
      </View>
    </View>
  );
}

/**
 * A full-screen list of card skeletons. Drop-in replacement for a
 * centered spinner while a feed is loading.
 */
export function ReportListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <ReportCardSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingTop: 4 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    marginBottom: 16,
    overflow: "hidden",
  },
  body: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 },
  row: { flexDirection: "row", gap: 6 },
});
