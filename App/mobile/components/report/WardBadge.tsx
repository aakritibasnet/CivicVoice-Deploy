import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";
import type { DetectedWard } from "@/hooks/useWardDetection";

type DetectedMunicipality = {
  id: string;
  name: string;
  code: string;
};

type Props = {
  ward: DetectedWard | null;
  loading: boolean;
  detected: boolean;
  error: string | null;
  municipality?: DetectedMunicipality | null;
};

export default function WardBadge({ ward, loading, detected, error, municipality }: Props) {
  // Still loading
  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={styles.loadingText}>Detecting ward...</Text>
      </View>
    );
  }

  // Ward detected
  if (detected && ward) {
    return (
      <View style={[styles.container, styles.detectedContainer]}>
        <Ionicons name="location" size={16} color="#2563eb" />
        <View style={styles.textWrap}>
          <Text style={styles.wardName}>{ward.name}</Text>
          <Text style={styles.wardCode}>{ward.ward_code}</Text>
        </View>
        <View style={styles.routedBadge}>
          <Text style={styles.routedText}>Will be routed here</Text>
        </View>
      </View>
    );
  }

  // Ward not detected but municipality found
  if (!detected && !loading && !error && municipality) {
    return (
      <View style={[styles.container, styles.municipalityContainer]}>
        <Ionicons name="business-outline" size={16} color="#7c3aed" />
        <View style={styles.textWrap}>
          <Text style={styles.municipalityName}>{municipality.name}</Text>
          <Text style={styles.municipalityCode}>{municipality.code}</Text>
        </View>
        <View style={styles.municipalityBadge}>
          <Text style={styles.municipalityBadgeText}>Municipality routing</Text>
        </View>
      </View>
    );
  }

  // Location outside all wards and municipalities
  if (!detected && !loading && !error) {
    return (
      <View style={[styles.container, styles.warningContainer]}>
        <Ionicons name="warning-outline" size={16} color="#d97706" />
        <Text style={styles.warningText}>
          Location is outside registered boundaries. Report will need
          manual routing.
        </Text>
      </View>
    );
  }

  // Error
  if (error) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <Ionicons
          name="alert-circle-outline"
          size={16}
          color={colors.textMuted}
        />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  // No coords yet — don't render anything
  return null;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    marginBottom: 4,
    gap: 8,
    borderWidth: 1,
  },
  loadingContainer: {
    backgroundColor: "#f9fafb",
    borderColor: "#e5e7eb",
  },
  detectedContainer: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
  },
  municipalityContainer: {
    backgroundColor: "#f5f3ff",
    borderColor: "#c4b5fd",
  },
  warningContainer: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
  },
  errorContainer: {
    backgroundColor: "#f9fafb",
    borderColor: "#e5e7eb",
  },
  loadingText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  textWrap: {
    flex: 1,
  },
  wardName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1e40af",
  },
  wardCode: {
    fontSize: 11,
    color: "#3b82f6",
    marginTop: 1,
  },
  routedBadge: {
    backgroundColor: "#dbeafe",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  routedText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#1d4ed8",
  },
  municipalityName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#5b21b6",
  },
  municipalityCode: {
    fontSize: 11,
    color: "#7c3aed",
    marginTop: 1,
  },
  municipalityBadge: {
    backgroundColor: "#ede9fe",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  municipalityBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#6d28d9",
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: "#92400e",
    lineHeight: 17,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
  },
});
