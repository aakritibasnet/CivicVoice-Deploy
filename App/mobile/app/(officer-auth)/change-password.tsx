import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";
import AppInput from "@/components/ui/common/AppInput";
import AppButton from "@/components/ui/common/AppButton";
import FullScreenLoader from "@/components/ui/common/FullScreenLoader";
import FormErrorNotice from "@/components/ui/feedback/FormErrorNotice";
import { useToast } from "@/components/ui/feedback/ToastProvider";
import { getFieldErrors, getFriendlyErrorMessage } from "@/lib/feedback";
import { api } from "@/lib/api";

export default function ChangePasswordScreen() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [errors, setErrors] = useState<{
    new?: string;
    confirm?: string;
  }>({});
  const { showToast } = useToast();

  const validate = () => {
    const next: typeof errors = {};
    if (!newPassword.trim()) next.new = "New password is required";
    else if (newPassword.length < 6) next.new = "At least 6 characters";
    if (!confirmPassword.trim()) next.confirm = "Please confirm your password";
    else if (newPassword !== confirmPassword)
      next.confirm = "Passwords don't match";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      setLoading(true);
      setSubmitError("");
      await api.post("/officer/force-change-password", {
        new_password: newPassword,
      });
      showToast({
        type: "success",
        title: "Password set",
        message: "You can continue to your tasks now.",
      });
      router.replace("/(officer-tabs)/tasks" as any);
    } catch (e: any) {
      const fieldErrors = getFieldErrors(e, ["new", "confirm"]);
      setErrors((prev) => ({ ...prev, ...fieldErrors }));
      setSubmitError(
        getFriendlyErrorMessage(e, "Failed to set password."),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <FullScreenLoader visible={loading} />

        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark" size={56} color={colors.red2} />
        </View>

        <Text style={styles.title}>Set New Password</Text>
        <Text style={styles.subtitle}>
          Your administrator has reset your password. Please set a new
          password to continue.
        </Text>

        <FormErrorNotice message={submitError} />

        <AppInput
          label="New Password"
          value={newPassword}
          onChangeText={(t) => {
            setNewPassword(t);
            if (submitError) setSubmitError("");
            if (errors.new) setErrors((p) => ({ ...p, new: "" }));
          }}
          placeholder="At least 6 characters"
          autoCapitalize="none"
          secureTextEntry
          error={errors.new}
        />

        <AppInput
          label="Confirm New Password"
          value={confirmPassword}
          onChangeText={(t) => {
            setConfirmPassword(t);
            if (submitError) setSubmitError("");
            if (errors.confirm) setErrors((p) => ({ ...p, confirm: "" }));
          }}
          placeholder="Re-enter new password"
          autoCapitalize="none"
          secureTextEntry
          error={errors.confirm}
        />

        <View style={{ height: 8 }} />
        <AppButton title="Set Password" onPress={onSubmit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  iconWrap: {
    alignSelf: "center",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.red2 + "14",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
    paddingHorizontal: 12,
  },
});
