import React from "react";
import { type PressableProps, type StyleProp, type ViewStyle } from "react-native";

import { AnimatedPressable } from "./AnimatedPressable";

type AnimatedIconButtonProps = PressableProps & {
  style?: StyleProp<ViewStyle>;
};

export function AnimatedIconButton({
  style,
  ...props
}: AnimatedIconButtonProps) {
  return <AnimatedPressable {...props} tapVariant="icon" style={style} />;
}

export default AnimatedIconButton;
