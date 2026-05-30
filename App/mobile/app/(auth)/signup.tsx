import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";

import AppInput from "@/components/ui/common/AppInput";
import AppButton from "@/components/ui/common/AppButton";
import FullScreenLoader from "@/components/ui/common/FullScreenLoader";
import FormErrorNotice from "@/components/ui/feedback/FormErrorNotice";
import { useToast } from "@/components/ui/feedback/ToastProvider";
import { signup } from "@/lib/auth";
import { getFieldErrors, getFriendlyErrorMessage } from "@/lib/feedback";
import { isValidEmail } from "@/lib/validator";

export default function SignupScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const { showToast } = useToast();

  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
  }>({});

  const validate = () => {
    const next: typeof errors = {};

    if (!name.trim()) next.name = "Full name is required";

    if (!email.trim()) next.email = "Email is required";
    else if (!isValidEmail(email)) next.email = "Enter a valid email";

    if (!password.trim()) next.password = "Password is required";
    else if (password.trim().length < 6)
      next.password = "Password must be at least 6 characters";

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSignup = async () => {
    if (!validate()) return;

    try {
      setLoading(true);
      setSubmitError("");
      await signup({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      showToast({
        type: "success",
        title: "Account created",
        message: "Enter the verification code we sent to your email.",
      });
      router.push({
        pathname: "/(otp)/verify",
        params: { type: "SIGNUP_EMAIL_VERIFY", target: email.trim() },
      });
    } catch (e: any) {
      const fieldErrors = getFieldErrors(e, ["name", "email", "password"]);
      setErrors((prev) => ({ ...prev, ...fieldErrors }));
      setSubmitError(
        getFriendlyErrorMessage(
          e,
          "We couldn't create your account right now. Please try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <FullScreenLoader visible={loading} />

      <Text style={styles.title}>Create account</Text>

      <FormErrorNotice message={submitError} />

      <AppInput
        label="Full Name"
        value={name}
        onChangeText={(t) => {
          setName(t);
          if (submitError) setSubmitError("");
          if (errors.name) setErrors((p) => ({ ...p, name: "" }));
        }}
        onBlur={() => {
          if (!name.trim())
            setErrors((p) => ({ ...p, name: "Full name is required" }));
        }}
        placeholder="Your name"
        autoCapitalize="words"
        error={errors.name}
      />

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

      <AppButton title="Sign Up" onPress={onSignup} />

      <Pressable onPress={() => router.replace("/(auth)/login")}>
        <Text style={{ marginTop: 6, textAlign: "center" }}>
          Already have an account? <Text style={styles.link}>Login</Text>
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "900", marginBottom: 16 },
  link: { color: "#2563EB", fontWeight: "700" },
});
