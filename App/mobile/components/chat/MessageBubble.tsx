// A single chat message row. Supports swipe-right-to-reply (gesture-handler +
// reanimated), WhatsApp-style delivery ticks for own messages, inline image
// previews (streamed through the authenticated backend), and tappable file
// chips. Pending/optimistic messages render a local preview + clock icon.

import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { colors } from "@/theme/colors";
import {
  attachmentUrl,
  type ChatAttachment,
  type ChatMessage,
} from "@/api/chat";

export type MessageStatus =
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type DisplayMessage = ChatMessage & {
  _status?: MessageStatus;
  _localUri?: string | null;
};

const SWIPE_THRESHOLD = 56;

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function StatusTicks({ status }: { status: MessageStatus }) {
  if (status === "sending")
    return <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.7)" />;
  if (status === "failed")
    return <Ionicons name="alert-circle" size={13} color="#FECACA" />;
  if (status === "sent")
    return <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.7)" />;
  // delivered + read both show double ticks; read is blue-tinted.
  return (
    <Ionicons
      name="checkmark-done"
      size={14}
      color={status === "read" ? "#7DD3FC" : "rgba(255,255,255,0.7)"}
    />
  );
}

function replyLabel(message: ChatMessage): string {
  // Check attachments first for accurate type info.
  if (message.attachments && message.attachments.length > 0) {
    const att = message.attachments[0];
    if (att.mime_type?.startsWith("image/")) return "📷 Photo";
    if (att.mime_type === "application/pdf") return "📄 PDF";
    return `📎 ${att.file_name}`;
  }
  if (message.type === "image") return "📷 Photo";
  if (message.type === "file") return "📎 File";
  if (message.type === "audio") return "🎤 Voice note";
  return message.body ?? "Message";
}

function ReplyPreview({
  message,
  mine,
  imageHeaders,
}: {
  message: ChatMessage;
  mine: boolean;
  imageHeaders: Record<string, string>;
}) {
  const firstImageAtt = message.attachments?.find(
    (a) => a.mime_type?.startsWith("image/") || a.resource_type === "image",
  );
  const thumbUrl = firstImageAtt ? attachmentUrl(firstImageAtt.id) : null;

  return (
    <View
      style={[
        styles.replyPreview,
        { borderLeftColor: mine ? "rgba(255,255,255,0.8)" : colors.red2 },
      ]}
    >
      {thumbUrl && (
        <Image
          source={{ uri: thumbUrl, headers: imageHeaders }}
          style={styles.replyThumb}
          contentFit="cover"
        />
      )}
      <Text
        style={[styles.replyText, mine && { color: "rgba(255,255,255,0.85)" }]}
        numberOfLines={1}
      >
        {replyLabel(message)}
      </Text>
    </View>
  );
}

function Attachments({
  message,
  mine,
  imageHeaders,
  onOpenFile,
}: {
  message: DisplayMessage;
  mine: boolean;
  imageHeaders: Record<string, string>;
  onOpenFile: (att: ChatAttachment) => void;
}) {
  // Optimistic local image (not yet uploaded).
  if (message._localUri && message.type === "image") {
    return (
      <Image
        source={{ uri: message._localUri }}
        style={styles.image}
        contentFit="cover"
      />
    );
  }

  const atts = message.attachments ?? [];
  if (atts.length === 0) return null;

  return (
    <View style={{ gap: 6 }}>
      {atts.map((a) => {
        const isImage =
          a.resource_type === "image" || a.mime_type?.startsWith("image/");
        if (isImage) {
          return (
            <Image
              key={a.id}
              source={{ uri: attachmentUrl(a.id), headers: imageHeaders }}
              style={styles.image}
              contentFit="cover"
              transition={150}
            />
          );
        }
        return (
          <Pressable
            key={a.id}
            onPress={() => onOpenFile(a)}
            style={[
              styles.fileChip,
              { backgroundColor: mine ? "rgba(255,255,255,0.15)" : colors.bg },
            ]}
          >
            <Ionicons
              name="document-text"
              size={22}
              color={mine ? colors.white : colors.red2}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.fileName, mine && { color: colors.white }]}
                numberOfLines={1}
              >
                {a.file_name}
              </Text>
              <Text
                style={[
                  styles.fileMeta,
                  mine && { color: "rgba(255,255,255,0.7)" },
                ]}
              >
                {(a.size_bytes / 1024).toFixed(0)} KB
              </Text>
            </View>
            <Ionicons
              name="download-outline"
              size={18}
              color={mine ? "rgba(255,255,255,0.8)" : colors.textMuted}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

function MessageBubbleBase({
  message,
  isMine,
  status,
  replyTo,
  imageHeaders,
  onReply,
  onOpenFile,
}: {
  message: DisplayMessage;
  isMine: boolean;
  status: MessageStatus | null;
  replyTo: ChatMessage | null;
  imageHeaders: Record<string, string>;
  onReply: (m: DisplayMessage) => void;
  onOpenFile: (att: ChatAttachment) => void;
}) {
  const translateX = useSharedValue(0);
  const triggered = useSharedValue(false);

  const fireReply = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onReply(message);
  };

  const pan = Gesture.Pan()
    .activeOffsetX(12) // only engage on a clear horizontal drag
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      const x = Math.max(0, Math.min(e.translationX, 80));
      translateX.value = x;
      if (x > SWIPE_THRESHOLD && !triggered.value) {
        triggered.value = true;
        runOnJS(fireReply)();
      }
    })
    .onEnd(() => {
      translateX.value = withSpring(0, { damping: 18 });
      triggered.value = false;
    });

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: Math.min(translateX.value / SWIPE_THRESHOLD, 1),
    transform: [{ scale: Math.min(translateX.value / SWIPE_THRESHOLD, 1) }],
  }));

  const deleted = !!message.deleted_at;

  return (
    <View style={styles.rowWrap}>
      <Animated.View style={[styles.replyIcon, iconStyle]}>
        <Ionicons name="arrow-undo" size={18} color={colors.textMuted} />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.bubbleRow,
            { justifyContent: isMine ? "flex-end" : "flex-start" },
            bubbleStyle,
          ]}
        >
          <View
            style={[
              styles.bubble,
              isMine ? styles.bubbleMine : styles.bubbleTheirs,
            ]}
          >
            {replyTo && !deleted && (
              <ReplyPreview message={replyTo} mine={isMine} imageHeaders={imageHeaders} />
            )}

            {deleted ? (
              <Text
                style={[
                  styles.deletedText,
                  isMine && { color: "rgba(255,255,255,0.7)" },
                ]}
              >
                This message was deleted
              </Text>
            ) : (
              <>
                <Attachments
                  message={message}
                  mine={isMine}
                  imageHeaders={imageHeaders}
                  onOpenFile={onOpenFile}
                />
                {!!message.body && (
                  <Text
                    style={[styles.bodyText, isMine && { color: colors.white }]}
                  >
                    {message.body}
                  </Text>
                )}
              </>
            )}

            <View style={styles.metaRow}>
              {message.edited_at && !deleted && (
                <Text
                  style={[
                    styles.edited,
                    isMine && { color: "rgba(255,255,255,0.6)" },
                  ]}
                >
                  edited
                </Text>
              )}
              <Text
                style={[
                  styles.time,
                  isMine && { color: "rgba(255,255,255,0.7)" },
                ]}
              >
                {formatTime(message.created_at)}
              </Text>
              {isMine && status && <StatusTicks status={status} />}
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export default React.memo(MessageBubbleBase);

const styles = StyleSheet.create({
  rowWrap: {
    justifyContent: "center",
  },
  replyIcon: {
    position: "absolute",
    left: 16,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    marginVertical: 3,
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMine: {
    backgroundColor: colors.red2,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: colors.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bodyText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 20,
  },
  deletedText: {
    fontSize: 14,
    fontStyle: "italic",
    color: colors.textMuted,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 4,
    marginTop: 3,
  },
  time: {
    fontSize: 10.5,
    color: colors.textMuted,
  },
  edited: {
    fontSize: 10.5,
    color: colors.textMuted,
  },
  image: {
    width: 220,
    height: 220,
    borderRadius: 12,
    backgroundColor: colors.bg,
  },
  fileChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    minWidth: 200,
  },
  fileName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  fileMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  replyPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderLeftWidth: 3,
    paddingLeft: 8,
    paddingVertical: 4,
    marginBottom: 4,
    opacity: 0.9,
  },
  replyThumb: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: colors.bg,
    flexShrink: 0,
  },
  replyText: {
    flex: 1,
    fontSize: 12.5,
    color: colors.textMuted,
  },
});
