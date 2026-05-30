import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import AppInput from "@/components/ui/common/AppInput";
import AppButton from "@/components/ui/common/AppButton";
import FullScreenLoader from "@/components/ui/common/FullScreenLoader";
import FormErrorNotice from "@/components/ui/feedback/FormErrorNotice";

export default function VerifyReset() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ code?: string }>({});
  const [submitError, setSubmitError] = useState("");

  const validate = () => {
    const next: typeof errors = {};
    if (!code.trim()) next.code = "Verification code is required";
    else if (code.trim().length < 4) next.code = "Enter the code you received";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onNext = async () => {
    if (!validate()) return;

    if (!email) {
      setSubmitError("Please go back and enter your email again.");
      return;
    }

    try {
      setLoading(true);
      setSubmitError("");
      router.push({
        pathname: "/(auth)/confirmPassword",
        params: { email: String(email), code: code.trim() },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <FullScreenLoader visible={loading} />

      <Text style={styles.title}>Verify Code</Text>
      <Text style={styles.sub}>Code sent to: {String(email ?? "")}</Text>

      <FormErrorNotice message={submitError} />

      <AppInput
        label="Verification Code"
        value={code}
        onChangeText={(t) => {
          setCode(t);
          if (submitError) setSubmitError("");
          if (errors.code) setErrors({ code: "" });
        }}
        onBlur={() => {
          if (!code.trim())
            setErrors({ code: "Verification code is required" });
        }}
        placeholder="6-digit code"
        autoCapitalize="none"
        error={errors.code}
        keyboardType="number-pad"
      />

      <AppButton title="Continue" onPress={onNext} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 26, fontWeight: "900", marginBottom: 8 },
  sub: { marginBottom: 16, opacity: 0.7 },
});
