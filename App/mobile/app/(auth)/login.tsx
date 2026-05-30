import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";

import AppInput from "@/components/ui/common/AppInput";
import AppButton from "@/components/ui/common/AppButton";
import FullScreenLoader from "@/components/ui/common/FullScreenLoader";
import FormErrorNotice from "@/components/ui/feedback/FormErrorNotice";
import ClaimReportsPrompt from "@/components/ui/auth/ClaimReportsPrompt";
import { login } from "@/lib/auth";
import { useToast } from "@/components/ui/feedback/ToastProvider";
import { getFieldErrors, getFriendlyErrorMessage } from "@/lib/feedback";
import { isValidEmail } from "@/lib/validator";
import { getAnonymousReports } from "@/lib/anonymousStorage";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [showClaimPrompt, setShowClaimPrompt] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const { showToast } = useToast();

  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  );

  const validate = () => {
    const next: typeof errors = {};

    if (!email.trim()) next.email = "Email is required";
    else if (!isValidEmail(email)) next.email = "Enter a valid email";

    if (!password.trim()) next.password = "Password is required";

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onLogin = async () => {
    if (!validate()) return;

    try {
      setLoading(true);
      setSubmitError("");
      const result = await login({ email: email.trim(), password });

      showToast({
        type: "success",
        title: "Logged in",
        message: "Welcome back.",
      });

      // Officer role routing
      if (result.user?.role === "officer") {
        if (result.user?.must_change_password) {
          router.replace("/(officer-auth)/change-password" as any);
        } else {
          router.replace("/(officer-tabs)/tasks" as any);
        }
        return;
      }

      // Check for unclaimed anonymous reports (citizen flow)
      const anonReports = await getAnonymousReports();
      if (anonReports.length > 0) {
        setShowClaimPrompt(true);
        return;
      }

      router.replace("/(tabs)");
    } catch (e: any) {
      const fieldErrors = getFieldErrors(e, ["email", "password"]);
      setErrors((prev) => ({ ...prev, ...fieldErrors }));
      setSubmitError(
        getFriendlyErrorMessage(e, "We couldn't sign you in. Please try again."),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <FullScreenLoader visible={loading} />

      <Text style={styles.title}>Welcome back</Text>

      <FormErrorNotice message={submitError} />

      <AppInput
        label="Email"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          if (submitError) setSubmitError("");
          if (errors.email) setErrors((p) => ({ ...p, email: "" }));
        }}
        onBlur={() => {
          if (!email.trim())
            setErrors((p) => ({ ...p, email: "Email is required" }));
        }}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        error={errors.email}
      />

      <AppInput
        label="Password"
        value={password}
        placeholder="password123@#"
        onChangeText={(t) => {
          setPass(t);
          if (submitError) setSubmitError("");
          if (errors.password) setErrors((p) => ({ ...p, password: "" }));
        }}
        onBlur={() => {
          if (!password.trim())
            setErrors((p) => ({ ...p, password: "Password is required" }));
        }}
        autoCapitalize="none"
        error={errors.password}
      />
      <Pressable onPress={() => router.push("/(auth)/sendEmail")}>
        <Text style={styles.forgot}>Forgot your password?</Text>
      </Pressable>

      <AppButton title="Login" onPress={onLogin} />

      <Pressable onPress={() => router.replace("/(auth)/signup")}>
        <Text style={{ marginTop: 6, textAlign: "center" }}>
          Don&apos;t have an account? <Text style={styles.link}>Sign up</Text>
        </Text>
      </Pressable>

      <ClaimReportsPrompt
        visible={showClaimPrompt}
        onDismiss={() => {
          setShowClaimPrompt(false);
          router.replace("/(tabs)");
        }}
        onClaimed={() => {
          setShowClaimPrompt(false);
          router.replace("/(tabs)");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "900", marginBottom: 16 },
  link: { color: "#2563EB", fontWeight: "700" },
  forgot: {
    // marginTop: ,
    textAlign: "left",
    marginBottom: 12,
    color: "#2563EB",
    textDecorationLine: "underline",
    fontWeight: "700",
  },
});
