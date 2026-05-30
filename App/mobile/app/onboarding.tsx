import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  FlatList,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { colors } from "@/theme/colors";

const { width } = Dimensions.get("window");

type Slide = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  gradient: [string, string];
};

const SLIDES: Slide[] = [
  {
    id: "1",
    icon: "camera-outline",
    title: "Report Issues",
    description:
      "See a pothole, broken street light, or garbage pile? Simply take a photo and we'll handle the rest.",
    gradient: ["#FF6B6B", "#AD2831"],
  },
  {
    id: "2",
    icon: "navigate-outline",
    title: "Auto-Routing",
    description:
      "Your report goes directly to the correct ward office based on your location. No need to figure out who to contact.",
    gradient: ["#4ECDC4", "#2C7A7B"],
  },
  {
    id: "3",
    icon: "map-outline",
    title: "Track Progress",
    description:
      "Follow your report's status and see all issues in your area on the community map. Stay informed as problems get fixed.",
    gradient: ["#6C63FF", "#4338CA"],
  },
  {
    id: "4",
    icon: "people-outline",
    title: "Join the Community",
    description:
      "Use anonymously or create an account to track reports, earn badges, and join the leaderboard.",
    gradient: ["#F59E0B", "#D97706"],
  },
];

const ONBOARDING_KEY = "onboardingSeen";

export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(ONBOARDING_KEY);
    return val === "true";
  } catch {
    return false;
  }
}

export async function markOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
  } catch {
    // Fail silently
  }
}

export default function OnboardingScreen() {
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const onFinish = async () => {
    await markOnboardingSeen();
    router.replace("/(tabs)");
  };

  const onNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      onFinish();
    }
  };

  const onSkip = async () => {
    await markOnboardingSeen();
    router.replace("/(tabs)");
  };

  const renderSlide = ({ item }: { item: Slide }) => (
    <View style={[styles.slide, { width }]}>
      <LinearGradient
        colors={item.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.iconCircle}
      >
        <Ionicons name={item.icon} size={64} color="#fff" />
      </LinearGradient>

      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.description}>{item.description}</Text>
    </View>
  );

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      {/* Skip button */}
      {!isLast && (
        <Pressable style={styles.skipBtn} onPress={onSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      )}

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(idx);
        }}
      />

      {/* Dots + Button */}
      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === currentIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.nextBtn,
            pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
          ]}
          onPress={onNext}
        >
          <LinearGradient
            colors={[colors.red2, colors.red3]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.nextBtnGradient}
          >
            <Text style={styles.nextBtnText}>
              {isLast ? "Get Started" : "Next"}
            </Text>
            <Ionicons
              name={isLast ? "checkmark-circle-outline" : "arrow-forward"}
              size={20}
              color="#fff"
            />
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  skipBtn: {
    position: "absolute",
    top: Platform.select({ ios: 56, android: 44, default: 44 }),
    right: 20,
    zIndex: 10,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  skipText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textMuted,
  },

  slide: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 36,
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 36,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: colors.text,
    textAlign: "center",
    marginBottom: 14,
    letterSpacing: 0.3,
  },
  description: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 8,
  },

  footer: {
    paddingBottom: Platform.select({ ios: 50, android: 36, default: 36 }),
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 20,
  },
  dots: {
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.red2,
    width: 28,
    borderRadius: 5,
  },

  nextBtn: {
    width: "100%",
    borderRadius: 18,
    overflow: "hidden",
    elevation: 3,
    shadowColor: colors.red2,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  nextBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 18,
    borderRadius: 18,
  },
  nextBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
});
