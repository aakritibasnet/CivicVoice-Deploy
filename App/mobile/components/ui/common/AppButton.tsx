// src/components/ui/GradientButton.tsx
import React from "react";
import { StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AnimatedPressable } from "@/components/ui/tap-feedback";
import { colors } from "@/theme/colors";

type Props = {
  title: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
};

export default function GradientButton({
  title,
  onPress,
  style,
  disabled,
}: Props) {
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      tapVariant="button"
      style={[style, disabled && { opacity: 0.6 }]}
    >
      <LinearGradient
        colors={[colors.red2, colors.red3]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.btn}
      >
        <Text style={styles.txt}>{title}</Text>
      </LinearGradient>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  txt: {
    color: colors.white,
    fontWeight: "600",
    fontSize: 16,
    letterSpacing: 0.5,
  },
});
