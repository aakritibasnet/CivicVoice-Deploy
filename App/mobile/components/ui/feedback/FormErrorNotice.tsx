import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";

type Props = {
  message?: string | null;
};

export default function FormErrorNotice({ message }: Props) {
  if (!message) return null;

  return (
    <View style={styles.wrap}>
      <Ionicons name="alert-circle" size={16} color={colors.danger} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.danger + "10",
    borderWidth: 1,
    borderColor: colors.danger + "20",
    marginBottom: 14,
  },
  text: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: colors.danger,
  },
});
