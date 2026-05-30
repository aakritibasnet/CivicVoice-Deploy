import React from "react";
import { StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AnimatedPressable } from "@/components/ui/tap-feedback";
import { colors } from "@/theme/colors";

type Props = {
  onPress: () => void;
};

export default function FilterButton({ onPress }: Props) {
  return (
    <AnimatedPressable onPress={onPress} style={styles.button} tapVariant="icon">
      <Ionicons name="options-outline" size={24} color="#FFFFFF" />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    top: 60,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.red2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.24,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 10,
  },
});
