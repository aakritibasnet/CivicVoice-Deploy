// Message input bar: text + typing signal, an attach menu (photo library /
// camera / document), and a reply banner. Media selection is delegated back to
// the screen via onSendAttachment so optimistic insert + upload live in one
// place.

import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Modal,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { colors } from "@/theme/colors";
import type { LocalAttachment, ChatMessage } from "@/api/chat";

type Props = {
  disabled?: boolean;
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  onSendText: (text: string) => void;
  onSendAttachment: (file: LocalAttachment, kind: "image" | "file") => void;
  onTyping: (start: boolean) => void;
};

function guessMime(uri: string, fallback: string): string {
  const ext = uri.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "heic") return "image/heic";
  return fallback;
}

export default function ChatComposer({
  disabled,
  replyTo,
  onCancelReply,
  onSendText,
  onSendAttachment,
  onTyping,
}: Props) {
  const [text, setText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const typingRef = useRef(false);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (val: string) => {
      setText(val);
      if (!typingRef.current) {
        typingRef.current = true;
        onTyping(true);
      }
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      typingStopTimer.current = setTimeout(() => {
        typingRef.current = false;
        onTyping(false);
      }, 2000);
    },
    [onTyping],
  );

  const stopTyping = useCallback(() => {
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    if (typingRef.current) {
      typingRef.current = false;
      onTyping(false);
    }
  }, [onTyping]);

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendText(trimmed);
    setText("");
    stopTyping();
  };

  const pickFromLibrary = async () => {
    setMenuOpen(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to send images.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    onSendAttachment(
      {
        uri: a.uri,
        name: a.fileName ?? `photo-${Date.now()}.jpg`,
        mimeType: a.mimeType ?? guessMime(a.uri, "image/jpeg"),
      },
      "image",
    );
  };

  const capturePhoto = async () => {
    setMenuOpen(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow camera access to take photos.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    onSendAttachment(
      {
        uri: a.uri,
        name: a.fileName ?? `photo-${Date.now()}.jpg`,
        mimeType: a.mimeType ?? guessMime(a.uri, "image/jpeg"),
      },
      "image",
    );
  };

  const pickDocument = async () => {
    setMenuOpen(false);
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "*/*"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    const isImage = (a.mimeType ?? "").startsWith("image/");
    onSendAttachment(
      {
        uri: a.uri,
        name: a.name ?? `file-${Date.now()}`,
        mimeType: a.mimeType ?? "application/octet-stream",
      },
      isImage ? "image" : "file",
    );
  };

  return (
    <>
      {replyTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyAccent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.replyTitle}>Replying to</Text>
            <Text style={styles.replyBody} numberOfLines={1}>
              {replyTo.type === "image"
                ? "📷 Photo"
                : replyTo.type === "file"
                  ? "📎 File"
                  : replyTo.body ?? "Message"}
            </Text>
          </View>
          <Pressable hitSlop={10} onPress={onCancelReply}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      )}

      <View style={styles.bar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => setMenuOpen(true)}
          disabled={disabled}
          hitSlop={8}
        >
          <Ionicons name="add-circle" size={28} color={colors.red2} />
        </Pressable>

        <TextInput
          style={styles.input}
          placeholder={disabled ? "You can't reply here" : "Message"}
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={handleChange}
          onBlur={stopTyping}
          editable={!disabled}
          multiline
        />

        <Pressable
          style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
          onPress={send}
          disabled={disabled || !text.trim()}
        >
          <Ionicons name="send" size={18} color={colors.white} />
        </Pressable>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Attach</Text>
            <Pressable style={styles.sheetItem} onPress={pickFromLibrary}>
              <View style={[styles.sheetIcon, { backgroundColor: "#2563EB" }]}>
                <Ionicons name="image" size={20} color={colors.white} />
              </View>
              <Text style={styles.sheetLabel}>Photo Library</Text>
            </Pressable>
            <Pressable style={styles.sheetItem} onPress={capturePhoto}>
              <View style={[styles.sheetIcon, { backgroundColor: "#16A34A" }]}>
                <Ionicons name="camera" size={20} color={colors.white} />
              </View>
              <Text style={styles.sheetLabel}>Take Photo</Text>
            </Pressable>
            <Pressable style={styles.sheetItem} onPress={pickDocument}>
              <View style={[styles.sheetIcon, { backgroundColor: "#D97706" }]}>
                <Ionicons name="document" size={20} color={colors.white} />
              </View>
              <Text style={styles.sheetLabel}>Document / PDF</Text>
            </Pressable>
            <Pressable
              style={styles.cancelItem}
              onPress={() => setMenuOpen(false)}
            >
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  iconBtn: {
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 2,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    backgroundColor: colors.bg,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    color: colors.text,
  },
  sendBtn: {
    height: 40,
    width: 40,
    borderRadius: 20,
    backgroundColor: colors.red2,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: "#E5A6AB",
  },
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  replyAccent: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
    backgroundColor: colors.red2,
  },
  replyTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.red2,
  },
  replyBody: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 28,
    gap: 4,
  },
  sheetTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
  },
  sheetIcon: {
    height: 40,
    width: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  cancelItem: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.bg,
    alignItems: "center",
  },
  cancelLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.red2,
  },
});
