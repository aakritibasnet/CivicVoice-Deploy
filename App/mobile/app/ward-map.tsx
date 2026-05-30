import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, Polygon, Region } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { colors } from "@/theme/colors";
import { useDeviceLocation } from "@/hooks/useDeviceLocation";
import CustomMarker from "@/components/explore/CustomMarker";
import { getPublicReports } from "@/api/reports";
import { useAuth } from "@/hooks/useAuth";
import { useWardBoundaries, useMunicipalityBoundaries } from "@/hooks/useWardBoundaries";

type MapReport = {
  id: string;
  title: string;
  category: string;
  status: string;
  location_lat: number;
  location_lng: number;
  address_text?: string;
  ward_id?: string;
};

const DEFAULT_REGION: Region = {
  latitude: 27.7172,
  longitude: 85.324,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export default function WardMapScreen() {
  const mapRef = useRef<MapView | null>(null);
  const { location, request: requestLocation } = useDeviceLocation();
  const { user } = useAuth();

  const [showAllTasks, setShowAllTasks] = useState(false);

  const { data: wardBoundaries } = useWardBoundaries();
  const { data: municipalityBoundaries } = useMunicipalityBoundaries();

  const reportsQuery = useQuery({
    queryKey: ["wardMapReports", showAllTasks, user?.ward_id],
    queryFn: () =>
      getPublicReports({
        page: 1,
        limit: 500,
        ...(showAllTasks ? {} : {}), // When showing all, no ward filter
      }),
    staleTime: 30_000,
  });

  const reports: MapReport[] = useMemo(() => {
    const all = reportsQuery.data?.reports || [];
    return all.filter((r: any) => {
      const hasCoords = Number.isFinite(Number(r.location_lat)) && Number.isFinite(Number(r.location_lng));
      if (!hasCoords) return false;
      // If not showing all, filter to user's ward
      if (!showAllTasks && user?.ward_id && r.ward_id) {
        return String(r.ward_id) === String(user.ward_id);
      }
      return true;
    });
  }, [reportsQuery.data, showAllTasks, user?.ward_id]);

  const initialRegion = useMemo(() => {
    if (!location) return DEFAULT_REGION;
    return {
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
  }, [location]);

  useEffect(() => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        },
        500,
      );
    }
  }, [location]);

  const goToMyLocation = () => {
    if (location) {
      mapRef.current?.animateToRegion(
        {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        },
        400,
      );
    } else {
      requestLocation();
    }
  };

  const onMarkerPress = useCallback((report: MapReport) => {
    router.push({ pathname: "/report/[id]", params: { id: report.id } });
  }, []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Task Map</Text>
        <View style={{ width: 22 }} />
      </View>

      <MapView
        ref={(ref) => { mapRef.current = ref; }}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation
        showsCompass
        showsScale
        loadingEnabled
        loadingIndicatorColor={colors.red2}
        mapPadding={{ top: 100, right: 0, bottom: 0, left: 0 }}
      >
        {municipalityBoundaries?.map((muni) =>
          muni.coordinates.map((ring, i) => (
            <Polygon
              key={`muni-${muni.id}-${i}`}
              coordinates={ring}
              strokeColor="rgba(15, 23, 42, 0.5)"
              fillColor="rgba(15, 23, 42, 0.03)"
              strokeWidth={2}
              lineDashPattern={[8, 4]}
              tappable={false}
            />
          )),
        )}

        {wardBoundaries?.map((ward) =>
          ward.coordinates.map((ring, i) => (
            <Polygon
              key={`ward-${ward.id}-${i}`}
              coordinates={ring}
              strokeColor="rgba(37, 99, 235, 0.5)"
              fillColor="rgba(37, 99, 235, 0.06)"
              strokeWidth={1.5}
              tappable={false}
            />
          )),
        )}

        {reports.map((report) => (
          <Marker
            key={String(report.id)}
            coordinate={{
              latitude: Number(report.location_lat),
              longitude: Number(report.location_lng),
            }}
            onPress={() => onMarkerPress(report)}
            tracksViewChanges={false}
          >
            <CustomMarker category={report.category} status={report.status} />
          </Marker>
        ))}
      </MapView>

      {/* Top pill - report count */}
      <View style={styles.topPill}>
        {reportsQuery.isFetching ? (
          <ActivityIndicator size="small" color={colors.red2} />
        ) : (
          <Ionicons name="map-outline" size={14} color={colors.textMuted} />
        )}
        <Text style={styles.topPillText}>
          {reportsQuery.isFetching
            ? "Loading..."
            : `${reports.length} task${reports.length !== 1 ? "s" : ""}`}
        </Text>
      </View>

      {/* Scope toggle - top right */}
      <View style={styles.toggleWrap}>
        <Pressable
          style={[styles.toggleBtn, !showAllTasks && styles.toggleBtnActive]}
          onPress={() => setShowAllTasks(false)}
        >
          <Ionicons
            name="location-outline"
            size={14}
            color={!showAllTasks ? colors.white : colors.text}
          />
          <Text style={[styles.toggleText, !showAllTasks && styles.toggleTextActive]}>
            Local
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleBtn, showAllTasks && styles.toggleBtnActive]}
          onPress={() => setShowAllTasks(true)}
        >
          <Ionicons
            name="globe-outline"
            size={14}
            color={showAllTasks ? colors.white : colors.text}
          />
          <Text style={[styles.toggleText, showAllTasks && styles.toggleTextActive]}>
            All
          </Text>
        </Pressable>
      </View>

      {/* My location button */}
      <Pressable style={styles.myLocationBtn} onPress={goToMyLocation} hitSlop={8}>
        <Ionicons name="locate" size={20} color={colors.text} />
      </Pressable>
    </View>
  );
}

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
  headerTitle: { fontSize: 18, fontWeight: "900", color: colors.text },

  topPill: {
    position: "absolute",
    top: Platform.select({ ios: 116, android: 104, default: 104 }),
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.95)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  topPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },

  toggleWrap: {
    position: "absolute",
    top: Platform.select({ ios: 116, android: 104, default: 104 }),
    right: 16,
    flexDirection: "row",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.95)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toggleBtnActive: {
    backgroundColor: colors.red2,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  toggleTextActive: {
    color: colors.white,
  },

  myLocationBtn: {
    position: "absolute",
    bottom: 40,
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
  },
});
