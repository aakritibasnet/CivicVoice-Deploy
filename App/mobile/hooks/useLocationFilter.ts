import { useState, useEffect, useCallback } from "react";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LOCATION_KEY = "civicvoice_location_v1";
const CITY_INDEX_KEY = "civicvoice_city_idx";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Major Nepali municipalities — rotated as fallback when GPS is unavailable
const CITIES = [
  { name: "Kathmandu",  lat: 27.7172, lng: 85.3240 },
  { name: "Pokhara",    lat: 28.2096, lng: 83.9856 },
  { name: "Lalitpur",   lat: 27.6674, lng: 85.3080 },
  { name: "Bharatpur",  lat: 27.6833, lng: 84.4333 },
  { name: "Biratnagar", lat: 26.4833, lng: 87.2833 },
  { name: "Birgunj",    lat: 27.0167, lng: 84.8667 },
  { name: "Dharan",     lat: 26.8167, lng: 87.2833 },
  { name: "Butwal",     lat: 27.7006, lng: 83.4483 },
  { name: "Hetauda",    lat: 27.4167, lng: 85.0333 },
  { name: "Bhaktapur",  lat: 27.6716, lng: 85.4283 },
];

export type LocationFilter = {
  lat: number;
  lng: number;
  cityName: string;
  isGps: boolean;
};

type Cached = { loc: LocationFilter; ts: number };

export function useLocationFilter() {
  const [location, setLocation] = useState<LocationFilter | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const saveAndSet = useCallback(async (loc: LocationFilter) => {
    setLocation(loc);
    await AsyncStorage.setItem(LOCATION_KEY, JSON.stringify({ loc, ts: Date.now() } satisfies Cached));
  }, []);

  const useNextCity = useCallback(async (): Promise<LocationFilter> => {
    const raw = await AsyncStorage.getItem(CITY_INDEX_KEY);
    const next = ((raw ? parseInt(raw, 10) : -1) + 1) % CITIES.length;
    await AsyncStorage.setItem(CITY_INDEX_KEY, String(next));
    const c = CITIES[next];
    return { lat: c.lat, lng: c.lng, cityName: c.name, isGps: false };
  }, []);

  const init = useCallback(async () => {
    try {
      // Check permission without showing a prompt
      const { status } = await Location.getForegroundPermissionsAsync();
      const granted = status === "granted";
      setPermissionGranted(granted);

      // Use cached if fresh
      const raw = await AsyncStorage.getItem(LOCATION_KEY);
      if (raw) {
        const cached: Cached = JSON.parse(raw);
        if (Date.now() - cached.ts < CACHE_TTL_MS) {
          setLocation(cached.loc);
          setLoading(false);
          return;
        }
      }

      // Refresh
      if (granted) {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        await saveAndSet({ lat: pos.coords.latitude, lng: pos.coords.longitude, cityName: "Your Area", isGps: true });
      } else {
        await saveAndSet(await useNextCity());
      }
    } catch {
      setLocation({ lat: 27.7172, lng: 85.3240, cityName: "Kathmandu", isGps: false });
    } finally {
      setLoading(false);
    }
  }, [saveAndSet, useNextCity]);

  useEffect(() => {
    init();
  }, [init]);

  // Call this when the user explicitly taps "Use My Location"
  const requestPermission = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    const granted = status === "granted";
    setPermissionGranted(granted);
    if (granted) {
      setLoading(true);
      try {
        await AsyncStorage.removeItem(LOCATION_KEY); // bust cache
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await saveAndSet({ lat: pos.coords.latitude, lng: pos.coords.longitude, cityName: "Your Area", isGps: true });
      } catch {
        // keep existing location
      } finally {
        setLoading(false);
      }
    }
  }, [saveAndSet]);

  return { location, loading, permissionGranted, requestPermission };
}
