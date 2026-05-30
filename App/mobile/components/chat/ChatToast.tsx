// Stacked in-app toasts for incoming chat messages. Fed by useChatStore
// (populated by the `chat.notify` realtime event). Tapping a toast opens the
// chat; toasts auto-dismiss after a few seconds.

import React, { useEffect } from "react";
import { Text, StyleSheet, Pressable, View } from "react-native";
import Animated, {
  FadeInUp,
  FadeOutUp,
  LinearTransition,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useChatStore, type ChatToast as ChatToastType } from "@/store/chat";
import { colors } from "@/theme/colors";

const AUTO_DISMISS_MS = 4500;

function ToastCard({ toast }: { toast: ChatToastType }) {
  const dismissToast = useChatStore((s) => s.dismissToast);

  useEffect(() => {
    const t = setTimeout(() => dismissToast(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [toast.id, dismissToast]);

  return (
    <Animated.View
      entering={FadeInUp.springify().damping(18)}
      exiting={FadeOutUp.duration(200)}
      layout={LinearTransition.springify()}
      style={styles.card}
    >
      <Pressable
        style={styles.row}
        onPress={() => {
          dismissToast(toast.id);
          router.push(`/officer-chat/${toast.chatId}` as any);
        }}
      >
        <View style={styles.iconWrap}>
          <Ionicons
            name={
              toast.type === "chat_mention"
                ? "at"
                : "chatbubble-ellipses"
            }
            size={18}
            color={colors.white}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {toast.title}
          </Text>
          {!!toast.body && (
            <Text style={styles.body} numberOfLines={2}>
              {toast.body}
            </Text>
          )}
        </View>
        <Pressable
          hitSlop={10}
          onPress={() => dismissToast(toast.id)}
          style={styles.close}
        >
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

export default function ChatToast() {
  const toasts = useChatStore((s) => s.toasts);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { top: insets.top + 8 }]}
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 1000,
    gap: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
  },
  iconWrap: {
    height: 38,
    width: 38,
    borderRadius: 19,
    backgroundColor: colors.red2,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  body: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 1,
  },
  close: {
    padding: 2,
  },
});
