import React, { forwardRef, useCallback } from "react";
import {
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useTapFeedback } from "@/components/ui/tap-feedback/TapFeedbackProvider";

export type TapVariant =
  | "default"
  | "button"
  | "nav"
  | "icon"
  | "card"
  | "quiet";

type AnimatedPressableProps = PressableProps & {
  containerStyle?: StyleProp<ViewStyle>;
  disableGlobalRipple?: boolean;
  tapVariant?: TapVariant;
};

type VariantConfig = {
  pressedOpacity: number;
  pressedScale: number;
  suppressRippleByDefault: boolean;
};

const VARIANT_CONFIG: Record<TapVariant, VariantConfig> = {
  default: {
    pressedOpacity: 0.96,
    pressedScale: 0.985,
    suppressRippleByDefault: false,
  },
  button: {
    pressedOpacity: 0.95,
    pressedScale: 0.96,
    suppressRippleByDefault: true,
  },
  nav: {
    pressedOpacity: 0.94,
    pressedScale: 0.97,
    suppressRippleByDefault: true,
  },
  icon: {
    pressedOpacity: 0.9,
    pressedScale: 0.93,
    suppressRippleByDefault: true,
  },
  card: {
    pressedOpacity: 0.96,
    pressedScale: 0.98,
    suppressRippleByDefault: true,
  },
  quiet: {
    pressedOpacity: 0.94,
    pressedScale: 0.99,
    suppressRippleByDefault: false,
  },
};

export const AnimatedPressable = forwardRef<
  React.ElementRef<typeof Pressable>,
  AnimatedPressableProps
>(
  function AnimatedPressable(
    {
      children,
      containerStyle,
      disableGlobalRipple,
      disabled,
      onPressIn,
      onPressOut,
      style,
      tapVariant = "default",
      ...props
    },
    ref,
  ) {
    const { shouldReduceMotion, suppressNextGlobalRipple } = useTapFeedback();
    const scale = useSharedValue(1);
    const opacity = useSharedValue(1);
    const config = VARIANT_CONFIG[tapVariant];

    const shouldSuppressRipple =
      disableGlobalRipple ?? config.suppressRippleByDefault;

    const handlePressIn = useCallback(
      (event: Parameters<NonNullable<PressableProps["onPressIn"]>>[0]) => {
        if (!disabled && shouldSuppressRipple) {
          suppressNextGlobalRipple();
        }

        if (!disabled) {
          scale.value = shouldReduceMotion
            ? 1
            : withTiming(config.pressedScale, { duration: 90 });
          opacity.value = withTiming(config.pressedOpacity, { duration: 90 });
        }

        onPressIn?.(event);
      },
      [
        config.pressedOpacity,
        config.pressedScale,
        disabled,
        onPressIn,
        opacity,
        scale,
        shouldReduceMotion,
        shouldSuppressRipple,
        suppressNextGlobalRipple,
      ],
    );

    const handlePressOut = useCallback(
      (event: Parameters<NonNullable<PressableProps["onPressOut"]>>[0]) => {
        if (!disabled) {
          scale.value = shouldReduceMotion
            ? 1
            : withSpring(1, {
                damping: 14,
                stiffness: 240,
                mass: 0.7,
              });
          opacity.value = withTiming(1, { duration: 120 });
        }

        onPressOut?.(event);
      },
      [disabled, onPressOut, opacity, scale, shouldReduceMotion],
    );

    const animatedStyle = useAnimatedStyle(() => ({
      opacity: opacity.value,
      transform: [{ scale: scale.value }],
    }));

    const resolvedStyle = useCallback(
      (state: PressableStateCallbackType) => {
        if (typeof style === "function") {
          return style(state);
        }

        return style;
      },
      [style],
    );

    return (
      <Animated.View style={[containerStyle, animatedStyle]}>
        <Pressable
          ref={ref}
          {...props}
          disabled={disabled}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={resolvedStyle}
        >
          {children}
        </Pressable>
      </Animated.View>
    );
  },
);

export default AnimatedPressable;
