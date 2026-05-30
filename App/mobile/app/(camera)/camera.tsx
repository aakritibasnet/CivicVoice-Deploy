"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useReportDraft } from "@/store/reportDraft";
import { useUserPrefs } from "@/store/userPrefs";
import { analyzeReportImage } from "@/api/reports";
import { debugWarn } from "@/lib/debug";

export default function CameraScreen() {
  const cameraRef = useRef<CameraView | null>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const { gpsCoords, setDraft } = useReportDraft();
  const { aiEnabled } = useUserPrefs();

  // Request camera permission on mount
  useEffect(() => {
    if (!permission) return;
    if (!permission.granted) requestPermission();
  }, [permission]);

  // Pre-request location permission so the OS dialog doesn't delay capture
  useEffect(() => {
    Location.requestForegroundPermissionsAsync().catch(() => {});
  }, []);

  const takePhoto = async () => {
    if (!ready || capturing || !cameraRef.current) return;

    try {
      setCapturing(true);

      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo?.uri) return;

      const uri = photo.uri;

      // ── Location: fire in background, navigate immediately ─────────────
      if (!gpsCoords) {
        (async () => {
          try {
            const perm = await Location.requestForegroundPermissionsAsync();
            if (perm.status !== "granted") return;
            const pos = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            });
            setDraft({
              gpsCoords: {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              },
              gpsAccuracyM: pos.coords.accuracy ?? null,
              pickedCoords: {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              },
              userAdjustedLocation: false,
            });
          } catch {
            // GPS failed — user can pin manually on the map
          }
        })();
      }

      // ── AI: fire in background, navigate immediately ────────────────────
      if (aiEnabled) {
        // Mark AI as started and clear stale draft content before navigating
        setDraft({
          aiAnalyzedUri: uri,
          title: "",
          description: "",
          aiPriorityToken: null,
          aiPriorityTokenMediaUri: null,
          aiSuggestedPriority: null,
        });

        (async () => {
          try {
            const result = await analyzeReportImage(uri);
            if (!result) return;
            setDraft({
              title: result.title,
              description: result.description,
              category: result.category,
              aiSuggestedPriority: result.suggested_priority,
              aiPriorityToken: result.priority_token ?? null,
              aiPriorityTokenMediaUri: result.priority_token ? uri : null,
            });
          } catch {
            // AI unavailable — user fills manually
          }
        })();
      }

      router.push({
        pathname: "/(reports)/reports",
        params: { mediaUri: uri, mediaType: "photo", replaceMedia: "true" },
      });
    } catch (e) {
      debugWarn("Take photo error", e);
      Alert.alert(
        "Couldn't capture photo",
        "Please try taking the photo again.",
      );
    } finally {
      setCapturing(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Camera permission is required.</Text>
        <Pressable style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Allow Camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.push("/(profile)/profile")}>
          <Ionicons name="person-circle-outline" size={36} color="white" />
        </Pressable>
        <Text style={styles.headerTitle}>Civic Voice</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.cameraBox}>
        <CameraView
          ref={(r) => {
            cameraRef.current = r;
          }}
          style={styles.camera}
          facing="back"
          onCameraReady={() => setReady(true)}
        />

        <View style={styles.hintWrap}>
          <Text style={styles.hintText}>
            {ready ? "Tap capture to take a photo" : "Opening camera..."}
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable
          style={[styles.captureBtn, capturing && { opacity: 0.5 }]}
          onPress={takePhoto}
          disabled={!ready || capturing}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "black" },

  header: {
    height: 96,
    paddingHorizontal: 16,
    paddingTop: Platform.select({ ios: 48, android: 42, default: 42 }),
    backgroundColor: "#111",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  cameraBox: {
    flex: 1,
    margin: 12,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  camera: { flex: 1 },

  hintWrap: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    alignItems: "center",
  },
  hintText: {
    color: "white",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    fontSize: 12,
    overflow: "hidden",
  },

  controls: {
    height: 130,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingBottom: 26,
    paddingHorizontal: 16,
  },
  captureBtn: {
    width: 76,
    height: 76,
    borderRadius: 999,
    borderWidth: 6,
    borderColor: "white",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  iconBtn: { alignItems: "center", gap: 4, minWidth: 70 },
  iconText: { color: "white", fontSize: 12, opacity: 0.85 },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
    padding: 20,
  },
  text: { color: "white", marginBottom: 12, textAlign: "center" },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#222",
    borderRadius: 10,
    marginTop: 10,
    minWidth: 160,
    alignItems: "center",
  },
  btnText: { color: "white", fontWeight: "800" },
});
