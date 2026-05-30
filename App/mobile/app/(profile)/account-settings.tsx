import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { getMe, logout, User, isWardOrgAccount } from "@/lib/auth";
import { useToast } from "@/components/ui/feedback/ToastProvider";
import {
  AnimatedIconButton,
  AnimatedPressable,
} from "@/components/ui/tap-feedback";
import { getAccessToken } from "@/lib/session";
import { colors } from "@/theme/colors";
import { getFriendlyErrorMessage } from "@/lib/feedback";
import {
  updateFullName,
  requestEmailChange,
  changePassword,
  deleteAccount,
} from "@/api/profile/profileEdit";
import { useUserPrefs } from "@/store/userPrefs";

type EditableKey = "name" | "email";

export default function AccountSettingsScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<EditableKey | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<TextInput | null>(null);
  const [saving, setSaving] = useState(false);

  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { showToast } = useToast();
  const { aiEnabled, setAiEnabled } = useUserPrefs();

  const isWardOrg = isWardOrgAccount(user);

  async function loadUser() {
    try {
      const token = await getAccessToken();
      if (!token) {
        setUser(null);
        return;
      }

      const res = await getMe();
      setUser(res.user);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUser();
  }, []);

  function startEdit(key: EditableKey, currentValue: string) {
    setEditingKey(key);
    setDraft(currentValue === "—" ? "" : currentValue);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function cancelEdit() {
    setEditingKey(null);
    setDraft("");
  }

  async function saveEdit() {
    if (!editingKey) return;
    const value = draft.trim();

    try {
      setSaving(true);

      if (editingKey === "name") {
        if (value.length < 1) return;
        await updateFullName({ name: value });
        showToast({
          type: "success",
          title: "Profile updated",
          message: "Your full name was updated.",
        });
        cancelEdit();
        await loadUser();
        return;
      }

      if (value.length < 3) return;
      await requestEmailChange({ new_email: value });
      showToast({
        type: "success",
        title: "Verification code sent",
        message: "Check your new email to confirm the change.",
      });
      cancelEdit();
      router.push({
        pathname: "/(otp)/verify",
        params: { type: "EMAIL_CHANGE", target: value },
      });
    } catch (e: any) {
      showToast({
        type: "error",
        title: "Update failed",
        message: getFriendlyErrorMessage(
          e,
          "Something went wrong. Please try again.",
        ),
      });
    } finally {
      setSaving(false);
    }
  }

  function resetPwModal() {
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setPwError(null);
    setPwModalOpen(false);
  }

  async function handleChangePassword() {
    setPwError(null);

    if (!currentPw.trim()) {
      setPwError("Current password is required.");
      return;
    }
    if (newPw.length < 6) {
      setPwError("New password must be at least 6 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("Passwords do not match.");
      return;
    }

    try {
      setPwSaving(true);
      await changePassword({
        current_password: currentPw,
        new_password: newPw,
      });
      resetPwModal();
      showToast({
        type: "success",
        title: "Password changed",
        message: "Your password has been changed.",
      });
    } catch (e: any) {
      setPwError(
        getFriendlyErrorMessage(
          e,
          "Something went wrong. Please try again.",
        ),
      );
    } finally {
      setPwSaving(false);
    }
  }

  async function handleLogout() {
    Alert.alert("Logout", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            setLoggingOut(true);
            await logout();
            router.replace("/(auth)/login");
          } catch (e: any) {
            showToast({
              type: "error",
              title: "Logout failed",
              message: getFriendlyErrorMessage(
                e,
                "Something went wrong. Please try again.",
              ),
            });
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  }

  async function handleDeleteAccount() {
    if (confirmText.trim().toUpperCase() !== "CONFIRM") {
      showToast({
        type: "error",
        title: "Confirmation required",
        message: 'Type "CONFIRM" to continue.',
      });
      return;
    }

    try {
      setDeleting(true);
      await deleteAccount({ confirm: "CONFIRM" });
      await logout();
      setDeleteOpen(false);
      showToast({
        type: "success",
        title: "Account deleted",
        message: "Your account has been removed.",
      });
      router.replace("/(auth)/login");
    } catch (e: any) {
      showToast({
        type: "error",
        title: "Delete failed",
        message: getFriendlyErrorMessage(
          e,
          "Something went wrong. Please try again.",
        ),
      });
    } finally {
      setDeleting(false);
    }
  }

  const infoRows = [
    { key: "name" as const, label: "Full name", value: user?.name || "—" },
    { key: "email" as const, label: "Email", value: user?.email || "—" },
  ];

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" color={colors.red2} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.red2, colors.red3]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.back}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Account Settings</Text>
          <View style={{ width: 20 }} />
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body}>
        {infoRows.map((row) => {
          const isEditing = editingKey === row.key;

          return (
            <View key={row.key} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.label}>{row.label}</Text>

                {!isWardOrg && !isEditing && (
                  <AnimatedIconButton
                    onPress={() => startEdit(row.key, row.value)}
                    hitSlop={10}
                    style={styles.iconBtn}
                  >
                    <Ionicons
                      name="pencil"
                      size={14}
                      color={colors.textMuted}
                    />
                  </AnimatedIconButton>
                )}

                {!isWardOrg && isEditing && (
                  <View style={styles.actions}>
                    <AnimatedIconButton
                      onPress={saveEdit}
                      hitSlop={10}
                      style={styles.iconBtn}
                    >
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={colors.text}
                      />
                    </AnimatedIconButton>
                    <AnimatedIconButton
                      onPress={cancelEdit}
                      hitSlop={10}
                      style={styles.iconBtn}
                    >
                      <Ionicons name="close" size={18} color={colors.danger} />
                    </AnimatedIconButton>
                  </View>
                )}
              </View>

              {!isEditing ? (
                <Text style={styles.value}>{row.value}</Text>
              ) : (
                <TextInput
                  ref={inputRef}
                  value={draft}
                  onChangeText={setDraft}
                  style={styles.input}
                  placeholder={`Enter ${row.label.toLowerCase()}`}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  editable={!saving}
                  keyboardType={
                    row.key === "email" ? "email-address" : "default"
                  }
                  returnKeyType="done"
                  onSubmitEditing={saveEdit}
                />
              )}

              {isEditing && row.key === "email" ? (
                <Text style={styles.helper}>
                  We&apos;ll send a verification code to confirm this change.
                </Text>
              ) : null}
            </View>
          );
        })}

        {!isWardOrg && (
          <AnimatedPressable
            style={({ pressed }) => [
              styles.actionRow,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => setPwModalOpen(true)}
            tapVariant="nav"
          >
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color={colors.red2}
            />
            <Text style={styles.actionText}>Change your password</Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textMuted}
            />
          </AnimatedPressable>
        )}

        <View style={styles.sectionGap} />

        <View style={styles.card}>
          <View style={styles.prefRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.prefLabel}>AI report auto-fill</Text>
              <Text style={styles.prefSub}>
                Automatically fill in report details from your photo
              </Text>
            </View>
            <Switch
              value={aiEnabled}
              onValueChange={setAiEnabled}
              trackColor={{ false: colors.border, true: colors.red2 + "88" }}
              thumbColor={aiEnabled ? colors.red2 : colors.textMuted}
            />
          </View>
        </View>

        <View style={styles.sectionGap} />

        <AnimatedPressable
          style={({ pressed }) => [
            styles.actionRow,
            pressed && { opacity: 0.85 },
            loggingOut && { opacity: 0.55 },
          ]}
          onPress={handleLogout}
          disabled={loggingOut}
          tapVariant="button"
        >
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.dangerText}>
            {loggingOut ? "Logging out..." : "Logout"}
          </Text>
        </AnimatedPressable>

        {!isWardOrg && (
          <AnimatedPressable
            style={({ pressed }) => [
              styles.actionRow,
              styles.deleteRow,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => {
              setConfirmText("");
              setDeleteOpen(true);
            }}
            tapVariant="button"
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
            <Text style={styles.dangerText}>Delete account</Text>
          </AnimatedPressable>
        )}

        <View style={{ height: 28 }} />
      </ScrollView>

      <Modal
        visible={pwModalOpen}
        transparent
        animationType="fade"
        onRequestClose={resetPwModal}
      >
        <AnimatedPressable
          style={styles.modalOverlay}
          onPress={resetPwModal}
          disableGlobalRipple
          tapVariant="quiet"
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Change Password</Text>

            <Text style={styles.fieldLabel}>Current password</Text>
            <TextInput
              value={currentPw}
              onChangeText={setCurrentPw}
              secureTextEntry
              style={styles.modalInput}
              placeholder="Enter current password"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              editable={!pwSaving}
            />

            <Text style={styles.fieldLabel}>New password</Text>
            <TextInput
              value={newPw}
              onChangeText={setNewPw}
              secureTextEntry
              style={styles.modalInput}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              editable={!pwSaving}
            />

            <Text style={styles.fieldLabel}>Confirm new password</Text>
            <TextInput
              value={confirmPw}
              onChangeText={setConfirmPw}
              secureTextEntry
              style={styles.modalInput}
              placeholder="Re-enter new password"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              editable={!pwSaving}
            />

            {pwError ? <Text style={styles.pwError}>{pwError}</Text> : null}

            <AnimatedPressable
              style={({ pressed }) => [
                styles.saveBtn,
                pressed && { opacity: 0.85 },
                pwSaving && { opacity: 0.55 },
              ]}
              onPress={handleChangePassword}
              disabled={pwSaving}
              tapVariant="button"
            >
              <LinearGradient
                colors={[colors.red2, colors.red3]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.saveBtnInner}
              >
                {pwSaving ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.saveBtnText}>Update Password</Text>
                )}
              </LinearGradient>
            </AnimatedPressable>

            <AnimatedPressable
              onPress={resetPwModal}
              style={styles.cancelBtn}
              tapVariant="button"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </AnimatedPressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={deleteOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteOpen(false)}
      >
        <AnimatedPressable
          style={styles.modalOverlay}
          onPress={() => setDeleteOpen(false)}
          disableGlobalRipple
          tapVariant="quiet"
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Delete Account</Text>
            <Text style={styles.deleteHelp}>
              This action cannot be undone. Type CONFIRM to continue.
            </Text>

            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              style={styles.modalInput}
              placeholder="CONFIRM"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              editable={!deleting}
            />

            <AnimatedPressable
              style={({ pressed }) => [
                styles.deleteButton,
                pressed && { opacity: 0.85 },
                deleting && { opacity: 0.55 },
              ]}
              onPress={handleDeleteAccount}
              disabled={deleting}
              tapVariant="button"
            >
              {deleting ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.deleteButtonText}>Delete Account</Text>
              )}
            </AnimatedPressable>

            <AnimatedPressable
              onPress={() => setDeleteOpen(false)}
              style={styles.cancelBtn}
              disabled={deleting}
              tapVariant="button"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </AnimatedPressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    paddingTop: 54,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: { color: colors.white, fontWeight: "900", fontSize: 18 },
  headerTitle: {
    color: colors.white,
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 0.3,
  },

  body: { padding: 16, paddingTop: 18 },

  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    color: colors.textMuted,
    fontWeight: "800",
    fontSize: 11,
    marginBottom: 6,
  },
  value: { color: colors.text, fontWeight: "900", fontSize: 14 },

  iconBtn: { padding: 6, borderRadius: 12 },
  actions: { flexDirection: "row", gap: 6, alignItems: "center" },

  input: {
    marginTop: 2,
    color: colors.text,
    fontWeight: "900",
    fontSize: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  helper: {
    marginTop: 8,
    color: colors.textMuted,
    fontWeight: "700",
    fontSize: 11,
  },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginBottom: 12,
  },
  actionText: {
    flex: 1,
    color: colors.text,
    fontWeight: "900",
    fontSize: 14,
  },
  dangerText: {
    flex: 1,
    color: colors.danger,
    fontWeight: "900",
    fontSize: 14,
  },
  deleteRow: {
    backgroundColor: colors.card,
  },
  sectionGap: {
    height: 8,
  },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  prefLabel: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 14,
    marginBottom: 3,
  },
  prefSub: {
    color: colors.textMuted,
    fontWeight: "700",
    fontSize: 11,
    lineHeight: 15,
  },

  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheetWrap: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 14,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontWeight: "800",
    fontSize: 11,
    marginBottom: 6,
    marginTop: 4,
  },
  modalInput: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    marginBottom: 10,
  },
  pwError: {
    color: colors.danger,
    fontWeight: "800",
    fontSize: 12,
    marginBottom: 10,
  },
  saveBtn: {
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 4,
  },
  saveBtnInner: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  saveBtnText: {
    color: colors.white,
    fontWeight: "900",
    fontSize: 14,
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    marginTop: 8,
  },
  cancelText: { color: colors.textMuted, fontWeight: "900" },
  deleteHelp: {
    color: colors.textMuted,
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  deleteButton: {
    borderRadius: 14,
    backgroundColor: colors.danger,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonText: {
    color: colors.white,
    fontWeight: "900",
    fontSize: 14,
  },
});
