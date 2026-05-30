import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  label?: string;
  error?: string | null;
} & TextInputProps;

export default function AppInput({ label, error, ...props }: Props) {
  const isPassword =
    label?.toLowerCase() === "password" || props.secureTextEntry;

  const [secure, setSecure] = useState(isPassword);
  const [focused, setFocused] = useState(false);

  const isMultiline = props.multiline;

  return (
    <View style={styles.wrap}>
      {!!label && <Text style={styles.label}>{label}</Text>}

      <View
        style={[
          styles.inputWrap,
          focused && styles.focused,
          !!error && styles.inputError,
        ]}
      >
        <TextInput
          {...props}
          secureTextEntry={isPassword ? secure : props.secureTextEntry}
          style={[
            styles.input,
            isPassword && styles.inputWithIcon,
            isMultiline && styles.multiline,
          ]}
          placeholderTextColor="#9CA3AF"
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
        />

        {isPassword && (
          <Pressable
            onPress={() => setSecure(!secure)}
            style={styles.eyeButton}
          >
            <Ionicons
              name={secure ? "eye-off" : "eye"}
              size={20}
              color="#555"
            />
          </Pressable>
        )}
      </View>

      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
  },

  label: {
    marginBottom: 6,
    fontWeight: "600",
    fontSize: 13,
  },

  inputWrap: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    justifyContent: "center",
  },

  input: {
    fontSize: 14,
    paddingVertical: 10,
    color: "#111",
  },

  multiline: {
    minHeight: 90,
    textAlignVertical: "top",
  },

  inputWithIcon: {
    paddingRight: 36,
  },

  eyeButton: {
    position: "absolute",
    right: 10,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },

  focused: {
    borderColor: "#6366F1",
  },

  inputError: {
    borderColor: "#DC2626",
  },

  errorText: {
    marginTop: 6,
    color: "#DC2626",
    fontSize: 12,
    fontWeight: "600",
  },
});
