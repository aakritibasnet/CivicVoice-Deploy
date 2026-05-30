// src/components/profile/ProfileSlideOver.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import {
  AnimatedIconButton,
  AnimatedPressable,
} from "@/components/ui/tap-feedback";
import { colors } from "@/theme/colors";
import Avatar from "./Avatar";
import GradientButton from "../common/AppButton";

type MinimalUser = {
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  twitter?: string | null;
  role?: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  user: MinimalUser;
  onGoProfile: () => void;
  onLogout: () => void;
  onSaveField?: (
    field: "email" | "phone" | "twitter",
    value: string,
  ) => Promise<void> | void;
};

type EditableField = "email" | "phone" | "twitter";

export default function ProfileSlideOver({
  visible,
  onClose,
  user,
  onGoProfile,
  onLogout,
  onSaveField,
}: Props) {
  const screenW = Dimensions.get("window").width;
  const panelW = Math.min(340, Math.round(screenW * 0.88));
  const x = useRef(new Animated.Value(panelW)).current;
  const [editing, setEditing] = useState<EditableField | null>(null);
  const [draft, setDraft] = useState({
    email: user.email ?? "",
    phone: user.phone ?? "",
    twitter: user.twitter ?? "",
  });

  const inputRefs = useRef<Record<EditableField, TextInput | null>>({
    email: null,
    phone: null,
    twitter: null,
  });

  useEffect(() => {
    setDraft({
      email: user.email ?? "",
      phone: user.phone ?? "",
      twitter: user.twitter ?? "",
    });
    setEditing(null);
  }, [user.email, user.phone, user.twitter, visible]);

  useEffect(() => {
    Animated.timing(x, {
      toValue: visible ? 0 : panelW,
      duration: visible ? 220 : 180,
      useNativeDriver: true,
    }).start();
  }, [panelW, visible, x]);

  const items = useMemo(
    () =>
      [
        { key: "email", label: "Email", value: draft.email, editable: true },
        { key: "phone", label: "Mobile", value: draft.phone, editable: true },
        {
          key: "twitter",
          label: "Twitter",
          value: draft.twitter,
          editable: true,
        },
      ] as const,
    [draft.email, draft.phone, draft.twitter],
  );

  function startEdit(field: EditableField) {
    setEditing(field);
    requestAnimationFrame(() => {
      inputRefs.current[field]?.focus();
    });
  }

  async function finishEdit(field: EditableField) {
    setEditing(null);

    if (!onSaveField) {
      return;
    }

    try {
      await onSaveField(field, (draft[field] ?? "").trim());
    } catch {
      // Keep the slide-over responsive even if persistence fails upstream.
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.modalWrap}>
        <AnimatedPressable
          style={styles.overlay}
          onPress={onClose}
          disableGlobalRipple
          tapVariant="quiet"
        />

        <Animated.View
          style={[
            styles.panel,
            { width: panelW, transform: [{ translateX: x }] },
          ]}
        >
          <LinearGradient
            colors={[colors.red2, colors.red3]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <View style={styles.headerTopRow}>
              <AnimatedIconButton onPress={onClose} hitSlop={10}>
                <Ionicons name="arrow-back" size={18} color={colors.white} />
              </AnimatedIconButton>
              <Text style={styles.headerTitle}>Profile</Text>
              <View style={{ width: 24 }} />
            </View>

            <View style={styles.profileRow}>
              <Avatar
                name={user.name}
                imageUrl={user.avatar_url}
                size={64}
                style={{ borderColor: "rgba(255,255,255,0.35)" }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{user.name || "User"}</Text>
                <Text style={styles.role}>{user.role || "Member"}</Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statNum}>1000</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNum}>1200</Text>
                <Text style={styles.statLabel}>Following</Text>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.body}>
            {items.map((item) => {
              const field = item.key as EditableField;
              const isEditing = editing === field;

              return (
                <View key={item.label} style={styles.item}>
                  <View style={styles.itemTopRow}>
                    <Text style={styles.itemLabel}>{item.label}</Text>
                    {item.editable ? (
                      <AnimatedIconButton
                        onPress={() => startEdit(field)}
                        hitSlop={10}
                        style={styles.pencilBtn}
                      >
                        <Ionicons
                          name="pencil"
                          size={14}
                          color={colors.textMuted}
                        />
                      </AnimatedIconButton>
                    ) : null}
                  </View>

                  {!isEditing ? (
                    <Text style={styles.itemValue}>
                      {item.value?.trim() ? item.value : "-"}
                    </Text>
                  ) : (
                    <TextInput
                      ref={(ref) => {
                        inputRefs.current[field] = ref;
                      }}
                      value={draft[field]}
                      onChangeText={(text) =>
                        setDraft((prev) => ({ ...prev, [field]: text }))
                      }
                      style={styles.input}
                      placeholder={`Enter ${item.label.toLowerCase()}`}
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                      keyboardType={
                        field === "email"
                          ? "email-address"
                          : field === "phone"
                            ? "phone-pad"
                            : "default"
                      }
                      returnKeyType="done"
                      onSubmitEditing={() => finishEdit(field)}
                      onBlur={() => finishEdit(field)}
                    />
                  )}
                </View>
              );
            })}

            <View style={{ height: 12 }} />

            <GradientButton title="Open Profile" onPress={onGoProfile} />
            <View style={{ height: 10 }} />

            <AnimatedPressable
              onPress={onLogout}
              style={styles.logoutBtn}
              tapVariant="button"
            >
              <Text style={styles.logoutText}>Logout</Text>
            </AnimatedPressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalWrap: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  panel: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
    overflow: "hidden",
  },
  header: {
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerTitle: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  name: { color: colors.white, fontWeight: "900", fontSize: 16 },
  role: {
    color: "rgba(255,255,255,0.85)",
    fontWeight: "700",
    fontSize: 12,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    gap: 14,
  },
  stat: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
  },
  statNum: { color: colors.white, fontWeight: "900", fontSize: 16 },
  statLabel: {
    color: "rgba(255,255,255,0.85)",
    fontWeight: "700",
    fontSize: 11,
    marginTop: 2,
  },
  body: { padding: 16 },
  item: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  itemTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  itemLabel: {
    color: colors.textMuted,
    fontWeight: "800",
    fontSize: 11,
  },
  pencilBtn: {
    padding: 4,
    borderRadius: 10,
  },
  itemValue: { color: colors.text, fontWeight: "800", fontSize: 13 },
  input: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 13,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  logoutBtn: {
    marginTop: 10,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  logoutText: { color: colors.danger, fontWeight: "900" },
});
