// src/components/ui/Avatar.tsx
import React, { useMemo } from "react";
import { Image, StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors } from "@/theme/colors";

type Props = {
  name?: string | null;
  imageUrl?: string | null;
  size?: number;
  style?: ViewStyle;
};

function getInitials(name?: string | null) {
  const clean = (name || "").trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export default function Avatar({ name, imageUrl, size = 36, style }: Props) {
  const initials = useMemo(() => getInitials(name), [name]);
  const radius = size / 2;

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: radius },
        style,
      ]}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.fallback, { borderRadius: radius }]}>
          <Text style={styles.initials}>{initials}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  fallback: {
    flex: 1,
    backgroundColor: colors.red1,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: colors.white,
    fontWeight: "900",
    fontSize: 14,
  },
});
