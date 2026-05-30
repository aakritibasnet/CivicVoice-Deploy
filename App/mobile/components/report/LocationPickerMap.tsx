import React, { useMemo, useRef, useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import MapView, { Circle, Polygon, Region } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { colors } from "@/theme/colors";
import { useWardBoundaries } from "@/hooks/useWardBoundaries";

type Coords = { latitude: number; longitude: number };

type Props = {
  initialLatitude: number;
  initialLongitude: number;
  gpsCoords?: Coords | null;
  gpsAccuracyM?: number | null;
  onPick: (coords: Coords) => void;
  errorText?: string;
  onRecenterToGPS?: () => void | Promise<Coords | null | void>;
  onAddressChange?: (address: string) => void;
};

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

export default function LocationPickerMap({
  initialLatitude,
  initialLongitude,
  gpsCoords,
  gpsAccuracyM,
  onPick,
  errorText,
  onRecenterToGPS,
  onAddressChange,
}: Props) {
  const mapRef = useRef<MapView | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [region, setRegion] = useState<Region>({
    latitude: initialLatitude,
    longitude: initialLongitude,
    latitudeDelta: 0.006,
    longitudeDelta: 0.006,
  });

  const [address, setAddress] = useState<string>("Detecting location...");
  const [resolving, setResolving] = useState(false);

  const { data: wardBoundaries } = useWardBoundaries();

  const assumedAccuracy = useMemo(() => {
    const raw = gpsAccuracyM ?? 0;
    return clamp(Math.max(raw, 50), 50, 500);
  }, [gpsAccuracyM]);

  useEffect(() => {
    void updateAddress(initialLatitude, initialLongitude);
  }, []);

  useEffect(() => {
    setRegion((prev) => ({
      ...prev,
      latitude: initialLatitude,
      longitude: initialLongitude,
    }));
  }, [initialLatitude, initialLongitude]);

  const onRegionChangeComplete = (r: Region) => {
    setRegion(r);
    onPick({ latitude: r.latitude, longitude: r.longitude });

    // Debounce address resolution to avoid excessive geocoding
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void updateAddress(r.latitude, r.longitude);
    }, 500);
  };

  const recenter = async () => {
    // Prefer a fresh GPS fix; fall back to the last known GPS coords so the
    // button still returns to the user's location if the new fix is unavailable.
    const fresh = await onRecenterToGPS?.();
    const target =
      fresh && typeof fresh === "object"
        ? fresh
        : gpsCoords ?? { latitude: initialLatitude, longitude: initialLongitude };

    mapRef.current?.animateToRegion(
      {
        latitude: target.latitude,
        longitude: target.longitude,
        latitudeDelta: 0.006,
        longitudeDelta: 0.006,
      },
      350,
    );
    onPick({ latitude: target.latitude, longitude: target.longitude });
  };

  const updateAddress = async (lat: number, lng: number) => {
    setResolving(true);
    try {
      const res = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lng,
      });

      if (!res.length) {
        setAddress("Pinned location");
        onAddressChange?.("Pinned location");
        return;
      }

      const p = res[0];
      const name = p.name;
      const street = p.street;
      const district = p.district;
      const city = p.city;

      let resolved = "";

      if (name && street) {
        resolved = `Near ${name}, ${street}`;
      } else if (street && district) {
        resolved = `${street}, ${district}`;
      } else if (name && district) {
        resolved = `${name}, ${district}`;
      } else if (district && city) {
        resolved = `${district}, ${city}`;
      } else if (street && city) {
        resolved = `${street}, ${city}`;
      } else if (name) {
        resolved = name;
      } else {
        resolved = "Pinned location";
      }

      setAddress(resolved);
      onAddressChange?.(resolved);
    } catch {
      setAddress("Pinned location");
      onAddressChange?.("Pinned location");
    } finally {
      setResolving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.mapBox}>
        <MapView
          ref={(r) => {
            mapRef.current = r;
          }}
          style={StyleSheet.absoluteFill}
          initialRegion={region}
          onRegionChangeComplete={onRegionChangeComplete}
          showsUserLocation
          showsMyLocationButton={false}
          loadingEnabled
          loadingIndicatorColor={colors.red2}
        >
          <Circle
            center={{ latitude: region.latitude, longitude: region.longitude }}
            radius={assumedAccuracy}
            strokeWidth={1}
            strokeColor="rgba(173,40,49,0.3)"
            fillColor="rgba(173,40,49,0.08)"
          />

          {wardBoundaries?.map((ward) =>
            ward.coordinates.map((ring, i) => (
              <Polygon
                key={`${ward.id}-${i}`}
                coordinates={ring}
                strokeColor="rgba(37, 99, 235, 0.6)"
                fillColor="rgba(37, 99, 235, 0.08)"
                strokeWidth={1.5}
                tappable={false}
              />
            )),
          )}
        </MapView>

        <View pointerEvents="none" style={styles.pinWrap}>
          <Ionicons name="location-sharp" size={34} color={colors.red2} />
          <View style={styles.pinShadow} />
        </View>

        <View style={styles.topInfo}>
          <Text style={styles.topInfoText}>
            Drag map to pin exact spot | GPS +/-{Math.round(assumedAccuracy)}m
          </Text>
        </View>

        <Pressable style={styles.recenterBtn} onPress={recenter} hitSlop={10}>
          <Ionicons name="locate" size={18} color={colors.text} />
          <Text style={styles.recenterText}>Recenter</Text>
        </Pressable>
      </View>

      {!!errorText && <Text style={styles.error}>{errorText}</Text>}
      <View style={styles.addressRow}>
        {resolving && <ActivityIndicator size="small" color={colors.textMuted} />}
        <Ionicons name="navigate-outline" size={13} color={colors.textMuted} />
        <Text style={styles.coords} numberOfLines={1}>{address}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, gap: 8 },
  mapBox: {
    height: 210,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#f2f2f2",
  },

  pinWrap: {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: [{ translateX: -17 }, { translateY: -34 }],
    alignItems: "center",
  },
  pinShadow: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.12)",
    marginTop: -6,
  },

  topInfo: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    alignItems: "center",
  },
  topInfoText: {
    fontSize: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
    overflow: "hidden",
    color: colors.text,
    fontWeight: "600",
  },

  recenterBtn: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  recenterText: { fontSize: 12, fontWeight: "700", color: colors.text },

  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  coords: { fontSize: 12, color: colors.textMuted, flex: 1 },
  error: { color: colors.danger, fontSize: 12 },
});
