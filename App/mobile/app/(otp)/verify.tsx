import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import AppInput from "@/components/ui/common/AppInput";
import AppButton from "@/components/ui/common/AppButton";
import FullScreenLoader from "@/components/ui/common/FullScreenLoader";
import FormErrorNotice from "@/components/ui/feedback/FormErrorNotice";
import ClaimReportsPrompt from "@/components/ui/auth/ClaimReportsPrompt";
import { useToast } from "@/components/ui/feedback/ToastProvider";
import { verifyEmail } from "@/lib/auth";
import { getFriendlyErrorMessage } from "@/lib/feedback";
import {
  confirmEmailChange,
  confirmMobileChange,
} from "@/api/profile/profileEdit";
import { colors } from "@/theme/colors";
import { getAnonymousReports } from "@/lib/anonymousStorage";

type OtpType = "SIGNUP_EMAIL_VERIFY" | "EMAIL_CHANGE" | "MOBILE_CHANGE";

export default function OtpVerifyScreen() {
  const { type, target, email } = useLocalSearchParams<{
    type?: string;
    target?: string;
    email?: string;
  }>();

  const otpType = (type as OtpType) || "SIGNUP_EMAIL_VERIFY";
  const otpTarget = String(target ?? email ?? "");

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [errors, setErrors] = useState<{ code?: string }>({});
  const [showClaimPrompt, setShowClaimPrompt] = useState(false);
  const { showToast } = useToast();

  const meta = useMemo(() => {
    if (otpType === "MOBILE_CHANGE") {
      return {
        title: "Verify Mobile",
        sub: `Code sent to: ${otpTarget}`,
      };
    }
    if (otpType === "EMAIL_CHANGE") {
      return {
        title: "Verify New Email",
        sub: `Code sent to: ${otpTarget}`,
      };
    }
    return {
      title: "Verify Email",
      sub: `Code sent to: ${otpTarget}`,
    };
  }, [otpType, otpTarget]);

  const validate = () => {
    const next: typeof errors = {};
    if (!code.trim()) next.code = "Verification code is required";
    else if (code.trim().length < 4) next.code = "Enter the code you received";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onVerify = async () => {
    if (!validate()) return;
    if (!otpTarget) {
      setSubmitError("No verification target was found. Please try again.");
      return;
    }

    try {
      setLoading(true);
      setSubmitError("");

      if (otpType === "SIGNUP_EMAIL_VERIFY") {
        await verifyEmail({ email: otpTarget, code: code.trim() });
        showToast({
          type: "success",
          title: "Email verified",
          message: "Your account is ready to use.",
        });

        const anonReports = await getAnonymousReports();
        if (anonReports.length > 0) {
          setShowClaimPrompt(true);
          return;
        }

        router.replace("/(tabs)");
        return;
      }

      if (otpType === "EMAIL_CHANGE") {
        await confirmEmailChange({ new_email: otpTarget, code: code.trim() });
        showToast({
          type: "success",
          title: "Email updated",
          message: "Your new email has been verified.",
        });
        router.back();
        return;
      }

      await confirmMobileChange({ new_mobile: otpTarget, code: code.trim() });
      showToast({
        type: "success",
        title: "Mobile updated",
        message: "Your new mobile number has been verified.",
      });
      router.back();
    } catch (e: any) {
      setErrors((prev) => ({
        ...prev,
        code:
          prev.code ||
          (getFriendlyErrorMessage(e, "").toLowerCase().includes("code")
            ? getFriendlyErrorMessage(e, "")
            : prev.code),
      }));
      setSubmitError(
        getFriendlyErrorMessage(
          e,
          "We couldn't verify that code. Please try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <FullScreenLoader visible={loading} />

      <Text style={styles.title}>{meta.title}</Text>
      <Text style={styles.sub}>{meta.sub}</Text>

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

      <AppButton title="Verify" onPress={onVerify} />
      <Text style={styles.note}>
        If you didn&apos;t get a code, go back and request again.
      </Text>

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
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    marginBottom: 8,
    color: colors.text,
  },
  sub: { marginBottom: 16, opacity: 0.75, color: colors.textMuted },
  note: { marginTop: 12, opacity: 0.6, fontSize: 12, color: colors.textMuted },
});
