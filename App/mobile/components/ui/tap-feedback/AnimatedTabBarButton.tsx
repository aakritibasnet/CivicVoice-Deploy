import React, { type ReactNode } from "react";
import {
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { AnimatedPressable } from "./AnimatedPressable";

type AnimatedTabBarButtonProps = Omit<PressableProps, "children"> & {
  accessibilityState?: {
    selected?: boolean;
  };
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function AnimatedTabBarButton({
  accessibilityState,
  children,
  onPressIn,
  onPressOut,
  style,
  ...props
}: AnimatedTabBarButtonProps) {
  const isSelected = accessibilityState?.selected ?? false;
  const contentScale = useSharedValue(1);

  const handlePressIn: PressableProps["onPressIn"] = (event) => {
    contentScale.value = withTiming(0.97, { duration: 90 });
    onPressIn?.(event);
  };

  const handlePressOut: PressableProps["onPressOut"] = (event) => {
    contentScale.value = withSpring(1, {
      damping: 14,
      stiffness: 250,
      mass: 0.75,
    });
    onPressOut?.(event);
  };

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: contentScale.value }],
  }));

  return (
    <AnimatedPressable
      {...props}
      accessibilityState={accessibilityState}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.button, style, isSelected && styles.buttonActive]}
      tapVariant="nav"
    >
      <Animated.View style={[styles.content, contentAnimatedStyle]}>
        {children}
      </Animated.View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 18,
    marginHorizontal: 6,
    marginTop: 6,
    marginBottom: 4,
  },
  buttonActive: {
    backgroundColor: "rgba(173, 40, 49, 0.08)",
  },
  content: {
    borderRadius: 18,
  },
});

export default AnimatedTabBarButton;
