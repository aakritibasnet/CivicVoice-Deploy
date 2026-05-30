import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  category?: string | null;
  status?: string | null;
};

type MarkerStyleConfig = {
  emoji: string;
  color: string;
};

export const CATEGORY_CONFIG: Record<string, MarkerStyleConfig> = {
  "Road Damage": { emoji: "🚧", color: "#FF6B35" },
  Waste: { emoji: "🗑️", color: "#8B4513" },
  Drainage: { emoji: "💧", color: "#1E90FF" },
  "Street Lights": { emoji: "💡", color: "#FFD700" },
  Safety: { emoji: "⚠️", color: "#DC143C" },
  Water: { emoji: "💧", color: "#4682B4" },
  Noise: { emoji: "🔊", color: "#9370DB" },
};

const DEFAULT_CONFIG: MarkerStyleConfig = { emoji: "📍", color: "#888888" };

export function getCategoryMarkerConfig(category?: string | null): MarkerStyleConfig {
  if (!category) return DEFAULT_CONFIG;
  return CATEGORY_CONFIG[category] || DEFAULT_CONFIG;
}

function getStatusStyle(status?: string | null) {
  switch (status) {
    case "submitted":
    case "incoming":
      return { borderColor: "#3B82F6", borderWidth: 3, size: 40 };
    case "in_progress":
    case "under_review":
      return { borderColor: "#F59E0B", borderWidth: 3, size: 40 };
    case "resolved":
    case "completed":
      return { borderColor: "#16A34A", borderWidth: 2, size: 36, showBadge: true };
    case "closed":
    case "invalid":
      return { borderColor: "#9CA3AF", borderWidth: 2, size: 36, dimmed: true };
    default:
      return { borderColor: "#FFFFFF", borderWidth: 2, size: 36 };
  }
}

export default function CustomMarker({ category, status }: Props) {
  const config = getCategoryMarkerConfig(category);
  const statusStyle = getStatusStyle(status);

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.marker,
          {
            backgroundColor: config.color,
            borderColor: statusStyle.borderColor,
            borderWidth: statusStyle.borderWidth,
            width: statusStyle.size,
            height: statusStyle.size,
            borderRadius: statusStyle.size / 2,
            opacity: statusStyle.dimmed ? 0.5 : 1,
          },
        ]}
      >
        <Text style={styles.emoji}>{config.emoji}</Text>
      </View>
      {statusStyle.showBadge && (
        <View style={styles.completedBadge}>
          <Ionicons name="checkmark" size={8} color="#FFFFFF" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  marker: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  emoji: {
    fontSize: 16,
  },
  completedBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
});
