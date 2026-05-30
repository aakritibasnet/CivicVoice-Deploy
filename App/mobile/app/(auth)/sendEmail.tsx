import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";

import AppInput from "@/components/ui/common/AppInput";
import AppButton from "@/components/ui/common/AppButton";
import FullScreenLoader from "@/components/ui/common/FullScreenLoader";
import FormErrorNotice from "@/components/ui/feedback/FormErrorNotice";
import { useToast } from "@/components/ui/feedback/ToastProvider";
import { getFieldErrors, getFriendlyErrorMessage } from "@/lib/feedback";
import { isValidEmail } from "@/lib/validator";
import { forgotPassword } from "@/api/auth/password";

export default function SendEmail() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string }>({});
  const [submitError, setSubmitError] = useState("");
  const { showToast } = useToast();

  const validate = () => {
    const next: typeof errors = {};
    if (!email.trim()) next.email = "Email is required";
    else if (!isValidEmail(email)) next.email = "Enter a valid email";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSend = async () => {
    if (!validate()) return;

    try {
      setLoading(true);
      setSubmitError("");

      const res = await forgotPassword({ email: email.trim() });

      if (!res.exists) {
        setErrors({ email: "Email not found" });
        setSubmitError("No account exists with this email.");
        return;
      }

      showToast({
        type: "success",
        title: "Code sent",
        message: "Check your email for the reset code.",
      });

      router.push({
        pathname: "/(auth)/verifyReset",
        params: { email: email.trim() },
      });
    } catch (e: any) {
      const fieldErrors = getFieldErrors(e, ["email"]);
      setErrors((prev) => ({ ...prev, ...fieldErrors }));
      setSubmitError(
        getFriendlyErrorMessage(
          e,
          "We couldn't send the reset code. Please try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <FullScreenLoader visible={loading} />

      <Text style={styles.title}>Reset Password</Text>
      <Text style={styles.sub}>Enter your email and we&apos;ll send a code.</Text>

      <FormErrorNotice message={submitError} />

      <AppInput
        label="Email"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          if (submitError) setSubmitError("");
          if (errors.email) setErrors({ email: "" });
        }}
        onBlur={() => {
          if (!email.trim()) setErrors({ email: "Email is required" });
        }}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        error={errors.email}
      />

      <AppButton title="Send Code" onPress={onSend} />

      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>Go back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 26, fontWeight: "900", marginBottom: 6 },
  sub: { marginBottom: 16, opacity: 0.7 },
  back: {
    marginTop: 10,
    textAlign: "center",
    color: "#2563EB",
    textDecorationLine: "underline",
    fontWeight: "700",
  },
});
