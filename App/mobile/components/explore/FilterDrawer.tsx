import React, { useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  AnimatedIconButton,
  AnimatedPressable,
} from "@/components/ui/tap-feedback";
import { colors } from "@/theme/colors";
import type { TimeRange } from "@/api/reports";

export const CATEGORIES = [
  "Road Damage",
  "Waste",
  "Drainage",
  "Street Lights",
  "Safety",
  "Water",
  "Noise",
];

export const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

export const STATUS_OPTIONS: { value: string; label: string; color: string }[] =
  [
    { value: "submitted", label: "Incoming", color: "#3B82F6" },
    { value: "in_progress", label: "In Progress", color: "#F59E0B" },
    { value: "resolved", label: "Completed", color: "#16A34A" },
    { value: "closed", label: "Invalid", color: "#DC2626" },
  ];

export type ExploreFilters = {
  categories: string[];
  statuses: string[];
  timeRange: TimeRange;
  radius: number;
};

type Props = {
  visible: boolean;
  filters: ExploreFilters;
  onClose: () => void;
  onApply: (newFilters: ExploreFilters) => void;
};

export default function FilterDrawer({
  visible,
  filters,
  onClose,
  onApply,
}: Props) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    filters.categories,
  );
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
    filters.statuses,
  );
  const [timeRange, setTimeRange] = useState<TimeRange>(filters.timeRange);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setSelectedCategories(filters.categories);
    setSelectedStatuses(filters.statuses);
    setTimeRange(filters.timeRange);
  }, [visible, filters.categories, filters.statuses, filters.timeRange]);

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((item) => item !== category)
        : [...prev, category],
    );
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((item) => item !== status)
        : [...prev, status],
    );
  };

  const clearAll = () => {
    setSelectedCategories([]);
    setSelectedStatuses([]);
    setTimeRange("all");
  };

  const applyFilters = () => {
    onApply({
      categories: selectedCategories,
      statuses: selectedStatuses,
      timeRange,
      radius: filters.radius,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <AnimatedPressable
          style={styles.backdrop}
          onPress={onClose}
          disableGlobalRipple
          tapVariant="quiet"
        />

        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Filter Reports</Text>
            <AnimatedIconButton onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.text} />
            </AnimatedIconButton>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.sectionTitle}>Categories</Text>
            {CATEGORIES.map((category) => {
              const checked = selectedCategories.includes(category);

              return (
                <AnimatedPressable
                  key={category}
                  style={styles.optionRow}
                  onPress={() => toggleCategory(category)}
                  tapVariant="card"
                >
                  <Ionicons
                    name={checked ? "checkbox" : "square-outline"}
                    size={22}
                    color={checked ? colors.red2 : colors.textMuted}
                  />
                  <Text style={styles.optionLabel}>{category}</Text>
                </AnimatedPressable>
              );
            })}

            <Text style={[styles.sectionTitle, styles.timeSection]}>Status</Text>
            {STATUS_OPTIONS.map((item) => {
              const checked = selectedStatuses.includes(item.value);

              return (
                <AnimatedPressable
                  key={item.value}
                  style={styles.optionRow}
                  onPress={() => toggleStatus(item.value)}
                  tapVariant="card"
                >
                  <Ionicons
                    name={checked ? "checkbox" : "square-outline"}
                    size={22}
                    color={checked ? item.color : colors.textMuted}
                  />
                  <View
                    style={[styles.statusDot, { backgroundColor: item.color }]}
                  />
                  <Text style={styles.optionLabel}>{item.label}</Text>
                </AnimatedPressable>
              );
            })}

            <Text style={[styles.sectionTitle, styles.timeSection]}>
              Time Range
            </Text>
            {TIME_RANGES.map((item) => {
              const selected = timeRange === item.value;

              return (
                <AnimatedPressable
                  key={item.value}
                  style={styles.optionRow}
                  onPress={() => setTimeRange(item.value)}
                  tapVariant="card"
                >
                  <Ionicons
                    name={selected ? "radio-button-on" : "radio-button-off"}
                    size={22}
                    color={selected ? colors.red2 : colors.textMuted}
                  />
                  <Text style={styles.optionLabel}>{item.label}</Text>
                </AnimatedPressable>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <AnimatedPressable
              style={styles.clearBtn}
              onPress={clearAll}
              tapVariant="button"
            >
              <Text style={styles.clearText}>Clear All</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.applyBtn}
              onPress={applyFilters}
              tapVariant="button"
            >
              <Text style={styles.applyText}>Apply Filters</Text>
            </AnimatedPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    maxHeight: "78%",
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  content: {
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
    marginTop: 12,
    marginBottom: 8,
  },
  timeSection: {
    marginTop: 18,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  optionLabel: {
    fontSize: 15,
    color: colors.text,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  clearBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  clearText: {
    color: colors.textMuted,
    fontWeight: "700",
  },
  applyBtn: {
    flex: 1,
    backgroundColor: colors.red2,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  applyText: {
    color: colors.white,
    fontWeight: "800",
  },
});
