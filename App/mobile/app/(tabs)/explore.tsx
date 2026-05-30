import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, Polygon, Region } from "react-native-maps";
import BottomSheet from "@gorhom/bottom-sheet";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { getPublicReports } from "@/api/reports";
import { useDeviceLocation } from "@/hooks/useDeviceLocation";
import { colors } from "@/theme/colors";
import FilterButton from "@/components/explore/FilterButton";
import FilterDrawer, {
  ExploreFilters,
} from "@/components/explore/FilterDrawer";
import CustomMarker from "@/components/explore/CustomMarker";
import ReportPreviewSheet, {
  ExploreReport,
} from "@/components/explore/ReportPreviewSheet";
import { useWardBoundaries, useMunicipalityBoundaries } from "@/hooks/useWardBoundaries";

type Bounds = {
  northEast: { lat: number; lng: number };
  southWest: { lat: number; lng: number };
};

const DEFAULT_REGION: Region = {
  latitude: 27.7172,
  longitude: 85.324,
  latitudeDelta: 0.2,
  longitudeDelta: 0.2,
};

export default function ExploreScreen() {
  const mapRef = useRef<MapView | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAnimatedRef = useRef(false);

  const { location, request: requestLocation } = useDeviceLocation();
  const { data: wardBoundaries } = useWardBoundaries();
  const { data: municipalityBoundaries } = useMunicipalityBoundaries();

  const [selectedReport, setSelectedReport] = useState<ExploreReport | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<ExploreFilters>({
    categories: [],
    statuses: [],
    timeRange: "all",
    radius: 5000,
  });
  const [mapBounds, setMapBounds] = useState<Bounds | null>(null);

  // Animate to user location once
  useEffect(() => {
    if (!location || hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      },
      500,
    );
  }, [location]);

  const publicReportsQuery = useQuery({
    queryKey: [
      "publicReports",
      mapBounds,
      filters.categories,
      filters.statuses,
      filters.timeRange,
      filters.radius,
      location?.latitude,
      location?.longitude,
    ],
    queryFn: () =>
      getPublicReports({
        bounds: mapBounds || undefined,
        category:
          filters.categories.length > 0
            ? filters.categories.join(",")
            : undefined,
        status:
          filters.statuses.length > 0
            ? filters.statuses.join(",")
            : undefined,
        timeRange: filters.timeRange,
        page: 1,
        limit: 500,
        lat: location?.latitude,
        lng: location?.longitude,
        radius: filters.radius,
      }),
    retry: 2,
    staleTime: 30_000,
  });

  // Refetch on mount (screen is always mounted inside PagerView)
  useEffect(() => {
    publicReportsQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reports: ExploreReport[] = publicReportsQuery.data?.reports || [];

  const markerReports = useMemo(
    () =>
      reports.filter(
        (report) =>
          Number.isFinite(Number(report.location_lat)) &&
          Number.isFinite(Number(report.location_lng)),
      ),
    [reports],
  );

  // Debounced region change handler
  const onRegionChangeComplete = useCallback((region: Region) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const halfLat = region.latitudeDelta / 2;
      const halfLng = region.longitudeDelta / 2;
      setMapBounds({
        northEast: {
          lat: region.latitude + halfLat,
          lng: region.longitude + halfLng,
        },
        southWest: {
          lat: region.latitude - halfLat,
          lng: region.longitude - halfLng,
        },
      });
    }, 400);
  }, []);

  const onMarkerPress = (report: ExploreReport) => {
    setSelectedReport(report);
    requestAnimationFrame(() => {
      bottomSheetRef.current?.snapToIndex(0);
    });
  };

  const handleUpvoted = useCallback((reportId: string) => {
    setSelectedReport((prev) => {
      if (!prev || prev.id !== reportId) return prev;
      return { ...prev, upvote_count: (prev.upvote_count ?? 0) + 1 };
    });
  }, []);

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

  const initialRegion = useMemo(() => {
    if (!location) return DEFAULT_REGION;
    return {
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
  }, [location]);

  const activeFilterCount =
    filters.categories.length +
    filters.statuses.length +
    (filters.timeRange !== "all" ? 1 : 0);

  return (
    <View style={styles.container}>
      <MapView
        ref={(ref) => {
          mapRef.current = ref;
        }}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation
        showsCompass
        showsScale
        loadingEnabled
        loadingIndicatorColor={colors.red2}
      >
        {municipalityBoundaries?.map((muni) =>
          muni.coordinates.map((ring, i) => (
            <Polygon
              key={`muni-${muni.id}-${i}`}
              coordinates={ring}
              strokeColor="rgba(15, 23, 42, 0.4)"
              fillColor="rgba(15, 23, 42, 0.02)"
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
              strokeColor="rgba(37, 99, 235, 0.45)"
              fillColor="rgba(37, 99, 235, 0.05)"
              strokeWidth={1.5}
              tappable={false}
            />
          )),
        )}

        {markerReports.map((report) => (
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

      {/* Report count + loading pill */}
      <View style={styles.topPill}>
        {publicReportsQuery.isFetching ? (
          <ActivityIndicator size="small" color={colors.red2} />
        ) : (
          <Ionicons name="map-outline" size={14} color={colors.textMuted} />
        )}
        <Text style={styles.topPillText}>
          {publicReportsQuery.isFetching
            ? "Loading..."
            : `${markerReports.length} report${markerReports.length !== 1 ? "s" : ""}`}
        </Text>
        {activeFilterCount > 0 && (
          <View style={styles.filterBadge}>
            <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
          </View>
        )}
      </View>

      {/* Error retry */}
      {publicReportsQuery.isError && !publicReportsQuery.isFetching && (
        <View style={styles.errorPill}>
          <Text style={styles.errorText}>Failed to load reports</Text>
          <Pressable onPress={() => publicReportsQuery.refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* My location button */}
      <Pressable style={styles.myLocationBtn} onPress={goToMyLocation} hitSlop={8}>
        <Ionicons name="locate" size={20} color={colors.text} />
      </Pressable>

      <FilterButton onPress={() => setFilterOpen(true)} />

      <FilterDrawer
        visible={filterOpen}
        filters={filters}
        onClose={() => setFilterOpen(false)}
        onApply={(newFilters) => {
          setFilters(newFilters);
          setFilterOpen(false);
        }}
      />

      <ReportPreviewSheet
        ref={bottomSheetRef}
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        onUpvoted={handleUpvoted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topPill: {
    position: "absolute",
    top: 56,
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
  },
  topPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  filterBadge: {
    backgroundColor: colors.red2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.white,
  },
  errorPill: {
    position: "absolute",
    top: 100,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
    fontWeight: "700",
  },
  retryText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.red2,
    textDecorationLine: "underline",
  },
  myLocationBtn: {
    position: "absolute",
    bottom: 110,
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
