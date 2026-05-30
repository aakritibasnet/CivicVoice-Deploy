import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  AccessibilityInfo,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/theme/colors";

type TapPoint = {
  x: number;
  y: number;
};

type TapFeedbackContextValue = {
  suppressNextGlobalRipple: () => void;
  shouldReduceMotion: boolean;
};

type RippleState = TapPoint & {
  id: number;
};

type ActiveTouch = {
  moved: boolean;
  startAt: number;
  startPoint: TapPoint;
  endPoint: TapPoint;
  suppressed: boolean;
};

const MOVE_THRESHOLD = 10;
const MAX_TAP_DURATION_MS = 420;
const SUPPRESSION_WINDOW_MS = 250;
const DEFAULT_TAP_FEEDBACK: TapFeedbackContextValue = {
  suppressNextGlobalRipple: () => {},
  shouldReduceMotion: false,
};

const TapFeedbackContext = createContext<TapFeedbackContextValue | null>(null);

function useReducedMotionPreference() {
  const [shouldReduceMotion, setShouldReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setShouldReduceMotion(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setShouldReduceMotion,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return shouldReduceMotion;
}

function Ripple({
  id,
  x,
  y,
  onDone,
  shouldReduceMotion,
}: RippleState & {
  onDone: (id: number) => void;
  shouldReduceMotion: boolean;
}) {
  const opacity = useSharedValue(shouldReduceMotion ? 0.14 : 0.2);
  const scale = useSharedValue(shouldReduceMotion ? 1 : 0.24);

  useEffect(() => {
    opacity.value = withTiming(0, {
      duration: shouldReduceMotion ? 140 : 320,
      easing: Easing.out(Easing.quad),
    });
    scale.value = withTiming(shouldReduceMotion ? 1 : 3.6, {
      duration: shouldReduceMotion ? 140 : 320,
      easing: Easing.out(Easing.cubic),
    });

    const timeout = setTimeout(() => onDone(id), shouldReduceMotion ? 160 : 340);

    return () => {
      clearTimeout(timeout);
    };
  }, [id, onDone, opacity, scale, shouldReduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ripple,
        animatedStyle,
        {
          left: x - 22,
          top: y - 22,
        },
      ]}
    />
  );
}

export function TapFeedbackProvider({ children }: PropsWithChildren) {
  const shouldReduceMotion = useReducedMotionPreference();
  const [ripples, setRipples] = useState<RippleState[]>([]);
  const rippleIdRef = useRef(0);
  const suppressionUntilRef = useRef(0);
  const activeTouchRef = useRef<ActiveTouch | null>(null);

  const suppressNextGlobalRipple = useCallback(() => {
    suppressionUntilRef.current = Date.now() + SUPPRESSION_WINDOW_MS;

    if (activeTouchRef.current) {
      activeTouchRef.current.suppressed = true;
    }
  }, []);

  const clearTouch = useCallback(() => {
    activeTouchRef.current = null;
  }, []);

  const addRipple = useCallback((point: TapPoint) => {
    const nextRipple = {
      id: rippleIdRef.current++,
      ...point,
    };

    setRipples((current) => [...current.slice(-3), nextRipple]);
  }, []);

  const removeRipple = useCallback((id: number) => {
    setRipples((current) => current.filter((ripple) => ripple.id !== id));
  }, []);

  const handleTouchStartCapture = useCallback((event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;

    activeTouchRef.current = {
      moved: false,
      startAt: Date.now(),
      startPoint: { x: pageX, y: pageY },
      endPoint: { x: pageX, y: pageY },
      suppressed: suppressionUntilRef.current > Date.now(),
    };
  }, []);

  const handleTouchMoveCapture = useCallback((event: GestureResponderEvent) => {
    if (!activeTouchRef.current) {
      return;
    }

    const { pageX, pageY } = event.nativeEvent;
    const deltaX = Math.abs(pageX - activeTouchRef.current.startPoint.x);
    const deltaY = Math.abs(pageY - activeTouchRef.current.startPoint.y);

    activeTouchRef.current.endPoint = { x: pageX, y: pageY };

    if (deltaX > MOVE_THRESHOLD || deltaY > MOVE_THRESHOLD) {
      activeTouchRef.current.moved = true;
    }
  }, []);

  const handleTouchEndCapture = useCallback(
    (event: GestureResponderEvent) => {
      if (!activeTouchRef.current) {
        return;
      }

      const { pageX, pageY } = event.nativeEvent;
      const activeTouch = activeTouchRef.current;
      const duration = Date.now() - activeTouch.startAt;

      activeTouch.endPoint = { x: pageX, y: pageY };

      if (
        !activeTouch.suppressed &&
        !activeTouch.moved &&
        duration <= MAX_TAP_DURATION_MS
      ) {
        addRipple(activeTouch.endPoint);
      }

      clearTouch();
    },
    [addRipple, clearTouch],
  );

  const contextValue = useMemo(
    () => ({
      suppressNextGlobalRipple,
      shouldReduceMotion,
    }),
    [shouldReduceMotion, suppressNextGlobalRipple],
  );

  return (
    <TapFeedbackContext.Provider value={contextValue}>
      <View
        style={styles.container}
        onTouchStart={handleTouchStartCapture}
        onTouchMove={handleTouchMoveCapture}
        onTouchEnd={handleTouchEndCapture}
        onTouchCancel={clearTouch}
      >
        {children}

        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {ripples.map((ripple) => (
            <Ripple
              key={ripple.id}
              {...ripple}
              onDone={removeRipple}
              shouldReduceMotion={shouldReduceMotion}
            />
          ))}
        </View>
      </View>
    </TapFeedbackContext.Provider>
  );
}

export function useTapFeedback() {
  const value = useContext(TapFeedbackContext);
  return value ?? DEFAULT_TAP_FEEDBACK;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  ripple: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: colors.red2,
  },
});
