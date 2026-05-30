import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AnimatedIconButton } from "@/components/ui/tap-feedback";
import { styles } from "@/components/report/ReportsScreen.styles";

type Props = {
  title?: string;
  onBack: () => void;
};

export default function TopBar({ title = "New Report", onBack }: Props) {
  return (
    <View style={styles.top}>
      <AnimatedIconButton onPress={onBack} hitSlop={10}>
        <Ionicons name="arrow-back" size={26} color="white" />
      </AnimatedIconButton>

      <Text style={styles.topTitle}>{title}</Text>

      <View style={{ width: 26 }} />
    </View>
  );
}
