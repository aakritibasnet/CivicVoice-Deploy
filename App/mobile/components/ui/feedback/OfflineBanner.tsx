import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { colors } from "@/theme/colors";

/**
 * Global connectivity banner. Mounted once at the app root; slides down
 * whenever the device loses its internet connection and slides away when
 * it returns. Non-interactive so it never blocks the UI underneath.
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const translateY = useRef(new Animated.Value(-60)).current;

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // isInternetReachable can be null while unknown — only treat an
      // explicit false (with no connection) as offline to avoid flicker.
      const isOffline =
        state.isConnected === false || state.isInternetReachable === false;
      setOffline(isOffline);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: offline ? 0 : -60,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [offline, translateY]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, { transform: [{ translateY }] }]}
      accessibilityRole="alert"
      accessibilityLabel="You are offline"
    >
      <View style={styles.inner}>
        <Ionicons name="cloud-offline-outline" size={16} color={colors.white} />
        <Text style={styles.text}>
          No internet connection — changes will sync when you’re back online.
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.red3,
    paddingTop: Platform.select({ ios: 52, android: 36, default: 36 }),
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  text: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1,
  },
});
