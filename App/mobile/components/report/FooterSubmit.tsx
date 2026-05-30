import React from "react";
import { View } from "react-native";
import { styles } from "@/components/report/ReportsScreen.styles";
import GradientButton from "../ui/common/AppButton";

type Props = {
  onSubmit: () => void;
  disabled?: boolean;
};

export default function FooterSubmit({ onSubmit, disabled }: Props) {
  return (
    <View style={styles.footer}>
      <GradientButton title="Report" onPress={onSubmit} disabled={disabled} />
    </View>
  );
}
