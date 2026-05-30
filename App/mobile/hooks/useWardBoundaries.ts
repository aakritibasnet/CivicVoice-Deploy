import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type LatLng = { latitude: number; longitude: number };

export type WardBoundaryData = {
  id: string;
  name: string;
  ward_code: string;
  municipality_id: string | null;
  coordinates: LatLng[][];
};

export type MunicipalityBoundaryData = {
  id: string;
  name: string;
  code: string;
  coordinates: LatLng[][];
};

function geoJsonToCoords(geojson: any): LatLng[][] {
  if (!geojson || !geojson.type) return [];

  if (geojson.type === "Polygon") {
    return geojson.coordinates.map((ring: number[][]) =>
      ring.map(([lng, lat]: number[]) => ({ latitude: lat, longitude: lng })),
    );
  }

  if (geojson.type === "MultiPolygon") {
    return geojson.coordinates.flatMap((polygon: number[][][]) =>
      polygon.map((ring: number[][]) =>
        ring.map(([lng, lat]: number[]) => ({ latitude: lat, longitude: lng })),
      ),
    );
  }

  return [];
}

export function useWardBoundaries(municipalityId?: string | null) {
  return useQuery<WardBoundaryData[]>({
    queryKey: ["wardBoundaries", municipalityId ?? "all"],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (municipalityId) params.municipality_id = municipalityId;

      const { data } = await api.get("/wards/boundaries", { params });

      return (data.boundaries || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        ward_code: b.ward_code,
        municipality_id: b.municipality_id,
        coordinates: geoJsonToCoords(b.geojson),
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useMunicipalityBoundaries(municipalityId?: string | null) {
  return useQuery<MunicipalityBoundaryData[]>({
    queryKey: ["municipalityBoundaries", municipalityId ?? "all"],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (municipalityId) params.municipality_id = municipalityId;

      const { data } = await api.get("/wards/municipality-boundaries", {
        params,
      });

      return (data.boundaries || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        coordinates: geoJsonToCoords(b.geojson),
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}
