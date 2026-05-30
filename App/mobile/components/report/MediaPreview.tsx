import React from "react";
import { View, Text, Image, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { styles } from "@/components/report/ReportsScreen.styles";

type Props = {
  mediaUri?: string | null;
  errorText?: string;
};

export default function MediaPreview({ mediaUri, errorText }: Props) {
  if (!mediaUri) {
    return (
      <View>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No media found.</Text>
        </View>
        {!!errorText && <Text style={styles.helperText}>{errorText}</Text>}
      </View>
    );
  }

  const retake = () => {
    router.push({
      pathname: "/(camera)/camera",
      params: { retake: "true" },
    });
  };

  return (
    <View>
      <View style={styles.previewWrap}>
        <Image source={{ uri: mediaUri }} style={styles.preview} />

        <Pressable style={styles.retakeBtn} onPress={retake}>
          <Ionicons name="camera-outline" size={16} color="#111" />
          <Text style={styles.retakeBtnText}>Retake</Text>
        </Pressable>
      </View>

      {!!errorText && <Text style={styles.helperText}>{errorText}</Text>}
    </View>
  );
}
