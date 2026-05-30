import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import AppInput from "@/components/ui/common/AppInput";
import AppButton from "@/components/ui/common/AppButton";
import FullScreenLoader from "@/components/ui/common/FullScreenLoader";
import FormErrorNotice from "@/components/ui/feedback/FormErrorNotice";
import { useToast } from "@/components/ui/feedback/ToastProvider";
import { getFieldErrors, getFriendlyErrorMessage } from "@/lib/feedback";
import { resetPassword } from "@/api/auth/password";

export default function ConfirmPassword() {
  const { email, code } = useLocalSearchParams<{
    email?: string;
    code?: string;
  }>();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>(
    {},
  );
  const { showToast } = useToast();

  const validate = () => {
    const next: typeof errors = {};

    if (!password.trim()) next.password = "Password is required";
    else if (password.trim().length < 6) next.password = "Min 6 characters";

    if (!confirm.trim()) next.confirm = "Confirm password is required";
    else if (confirm !== password) next.confirm = "Passwords do not match";

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onReset = async () => {
    if (!validate()) return;

    if (!email || !code) {
      setSubmitError("Please restart the password reset flow.");
      return;
    }

    try {
      setLoading(true);
      setSubmitError("");
      await resetPassword({
        email: String(email),
        code: String(code),
        new_password: password.trim(),
      });

      showToast({
        type: "success",
        title: "Password updated",
        message: "You can log in with your new password now.",
      });
      router.replace("/(auth)/login");
    } catch (e: any) {
      const fieldErrors = getFieldErrors(e, ["password", "confirm"]);
      setErrors((prev) => ({ ...prev, ...fieldErrors }));
      setSubmitError(
        getFriendlyErrorMessage(
          e,
          "We couldn't reset your password. Please try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <FullScreenLoader visible={loading} />

      <Text style={styles.title}>New Password</Text>
      <Text style={styles.sub}>Create a new password for your account.</Text>

      <FormErrorNotice message={submitError} />

      <AppInput
        label="Password"
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          if (submitError) setSubmitError("");
          if (errors.password) setErrors((prev) => ({ ...prev, password: "" }));
        }}
        placeholder="New password"
        autoCapitalize="none"
        error={errors.password}
      />

      <AppInput
        label="Confirm Password"
        value={confirm}
        onChangeText={(t) => {
          setConfirm(t);
          if (submitError) setSubmitError("");
          if (errors.confirm) setErrors((prev) => ({ ...prev, confirm: "" }));
        }}
        placeholder="Confirm password"
        autoCapitalize="none"
        secureTextEntry
        error={errors.confirm}
      />

      <AppButton title="Reset Password" onPress={onReset} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 26, fontWeight: "900", marginBottom: 8 },
  sub: { marginBottom: 16, opacity: 0.7 },
});
