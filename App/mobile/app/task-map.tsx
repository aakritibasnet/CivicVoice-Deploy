import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { colors } from "@/theme/colors";
import { useDeviceLocation } from "@/hooks/useDeviceLocation";
import { useToast } from "@/components/ui/feedback/ToastProvider";

// ─── Config ────────────────────────────────────────────────────────────
// Zoom level when focusing a single point. Accepted range: 0.002–0.05;
// smaller = closer zoom. 0.01 ≈ a few city blocks.
const FOCUS_DELTA = 0.01;
// Fallback region (Kathmandu) when destination coords are invalid.
const FALLBACK_REGION: Region = {
  latitude: 27.7172,
  longitude: 85.324,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};
// Padding (px) so neither the user nor the destination sits under the UI
// chrome when both points are fitted into view.
const FIT_EDGE_PADDING = { top: 140, right: 80, bottom: 260, left: 80 };
// Earth radius in metres for the haversine distance estimate.
const EARTH_RADIUS_M = 6_371_000;

// ─── Helpers ───────────────────────────────────────────────────────────

function parseCoord(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function toParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ?? "";
}

function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m away`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km away`;
}

// ─── Screen ────────────────────────────────────────────────────────────

export default function TaskMapScreen() {
  const params = useLocalSearchParams<{
    lat?: string | string[];
    lng?: string | string[];
    title?: string | string[];
    address?: string | string[];
  }>();
  const { showToast } = useToast();

  const destination = useMemo(() => {
    const latitude = parseCoord(params.lat);
    const longitude = parseCoord(params.lng);
    if (latitude == null || longitude == null) return null;
    return { latitude, longitude };
  }, [params.lat, params.lng]);

  const title = toParam(params.title) || "Task location";
  const address = toParam(params.address);

  const mapRef = useRef<MapView | null>(null);
  const { location, request: requestLocation } = useDeviceLocation();

  const distanceText = useMemo(() => {
    if (!location || !destination) return null;
    return formatDistance(haversineMeters(location, destination));
  }, [location, destination]);

  const initialRegion = useMemo<Region>(() => {
    if (destination) {
      return {
        latitude: destination.latitude,
        longitude: destination.longitude,
        latitudeDelta: FOCUS_DELTA,
        longitudeDelta: FOCUS_DELTA,
      };
    }
    return FALLBACK_REGION;
  }, [destination]);

  // Once we have both the officer and the destination, frame them together.
  const fitToBoth = useCallback(() => {
    if (!destination) return;
    if (location && mapRef.current) {
      mapRef.current.fitToCoordinates([location, destination], {
        edgePadding: FIT_EDGE_PADDING,
        animated: true,
      });
    } else {
      mapRef.current?.animateToRegion(
        {
          latitude: destination.latitude,
          longitude: destination.longitude,
          latitudeDelta: FOCUS_DELTA,
          longitudeDelta: FOCUS_DELTA,
        },
        400,
      );
    }
  }, [location, destination]);

  useEffect(() => {
    fitToBoth();
  }, [fitToBoth]);

  const goToMyLocation = useCallback(() => {
    if (location) {
      mapRef.current?.animateToRegion(
        {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: FOCUS_DELTA,
          longitudeDelta: FOCUS_DELTA,
        },
        400,
      );
    } else {
      void requestLocation();
    }
  }, [location, requestLocation]);

  // Hand off to the device's native maps app for turn-by-turn navigation,
  // like opening directions from a ride-hailing app. We open the app scheme
  // directly (Apple Maps on iOS, Google Maps navigation on Android) rather
  // than checking canOpenURL first — that check is unreliable on Android 11+
  // without manifest queries, while openURL launches the app regardless. The
  // web URL is only a last resort if no maps app handles the intent.
  const startNavigation = useCallback(async () => {
    if (!destination) return;

    const latLng = `${destination.latitude},${destination.longitude}`;
    const label = encodeURIComponent(title);
    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${latLng}`;
    const nativeUrl = Platform.select({
      ios: `maps://?daddr=${latLng}&q=${label}`,
      android: `google.navigation:q=${latLng}`,
      default: webUrl,
    });

    try {
      await Linking.openURL(nativeUrl ?? webUrl);
    } catch {
      try {
        await Linking.openURL(webUrl);
      } catch {
        showToast({
          type: "error",
          title: "Couldn't open maps",
          message: "No navigation app is available on this device.",
        });
      }
    }
  }, [destination, title, showToast]);

  return (
    <View style={styles.container}>
      <MapView
        ref={(ref) => {
          mapRef.current = ref;
        }}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass
        loadingEnabled
        loadingIndicatorColor={colors.red2}
        mapPadding={{ top: 90, right: 0, bottom: 0, left: 0 }}
      >
        {destination && (
          <Marker
            coordinate={destination}
            title={title}
            description={address || undefined}
            pinColor={colors.red2}
          />
        )}
      </MapView>

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Navigate to Task
        </Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Recenter on my location */}
      <Pressable style={styles.myLocationBtn} onPress={goToMyLocation} hitSlop={8}>
        <Ionicons name="locate" size={20} color={colors.text} />
      </Pressable>

      {/* Bottom destination card */}
      <View style={styles.card}>
        {destination ? (
          <>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardIcon}>
                <Ionicons name="location-sharp" size={20} color={colors.red2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {title}
                </Text>
                {!!address && (
                  <Text style={styles.cardAddress} numberOfLines={2}>
                    {address}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.metaRow}>
              {distanceText ? (
                <View style={styles.metaPill}>
                  <Ionicons name="navigate" size={13} color={colors.red2} />
                  <Text style={styles.metaText}>{distanceText}</Text>
                </View>
              ) : (
                <View style={styles.metaPill}>
                  <ActivityIndicator size="small" color={colors.textMuted} />
                  <Text style={styles.metaText}>Locating you…</Text>
                </View>
              )}
              <Text style={styles.coordText}>
                {destination.latitude.toFixed(5)}, {destination.longitude.toFixed(5)}
              </Text>
            </View>

            <Pressable style={styles.navBtn} onPress={startNavigation}>
              <Ionicons name="navigate-circle" size={22} color={colors.white} />
              <Text style={styles.navBtnText}>Start Navigation</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="alert-circle-outline" size={22} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              This task has no map location attached.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.select({ ios: 60, android: 48, default: 48 }),
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.95)",
    zIndex: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "900", color: colors.text },

  myLocationBtn: {
    position: "absolute",
    bottom: 200,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },

  card: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: Platform.select({ ios: 32, android: 20, default: 20 }),
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.red2 + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 16, fontWeight: "900", color: colors.text },
  cardAddress: { fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18 },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.red2 + "10",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  metaText: { fontSize: 12, fontWeight: "800", color: colors.text },
  coordText: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },

  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.red2,
    borderRadius: 14,
    paddingVertical: 15,
  },
  navBtnText: { fontSize: 16, fontWeight: "900", color: colors.white },

  emptyCard: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  emptyText: { fontSize: 13, color: colors.textMuted, flex: 1, lineHeight: 18 },
});
