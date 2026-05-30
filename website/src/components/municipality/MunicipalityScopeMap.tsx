"use client";

import { useMemo } from "react";
import type {
  MunicipalityMapReport,
  MunicipalityWardOverview,
} from "@/src/types/municipality";

type MapFilter = "all" | "active" | "completed" | "escalated";

interface MunicipalityScopeMapProps {
  wards: MunicipalityWardOverview[];
  reports: MunicipalityMapReport[];
  municipalityBoundary: unknown;
  selectedWardId: string | null;
  onSelectWard: (wardId: string | null) => void;
  reportFilter: MapFilter;
}

type Coordinate = [number, number];

const SVG_WIDTH = 960;
const SVG_HEIGHT = 640;
const SVG_PADDING = 56;

const reportStatusColors: Record<MunicipalityMapReport["status"], string> = {
  incoming: "#2563eb",
  in_progress: "#d97706",
  completed: "#059669",
  invalid: "#dc2626",
  returned: "#7c3aed",
};

function isCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function toGeometry(geojson: unknown): { type?: string; coordinates?: unknown } | null {
  if (!geojson || typeof geojson !== "object") {
    return null;
  }

  const value = geojson as {
    type?: string;
    coordinates?: unknown;
    geometry?: { type?: string; coordinates?: unknown };
  };

  if (value.type === "Feature" && value.geometry) {
    return value.geometry;
  }

  return value;
}

function extractOuterRings(geojson: unknown) {
  const geometry = toGeometry(geojson);
  if (!geometry?.type) {
    return [] as Coordinate[][];
  }

  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    const [outerRing] = geometry.coordinates;
    if (!Array.isArray(outerRing)) return [];
    return [outerRing.filter(isCoordinate)];
  }

  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.flatMap((polygon) => {
      if (!Array.isArray(polygon)) return [];
      const [outerRing] = polygon;
      if (!Array.isArray(outerRing)) return [];
      return [outerRing.filter(isCoordinate)];
    });
  }

  return [] as Coordinate[][];
}

function buildBounds(wards: MunicipalityWardOverview[], reports: MunicipalityMapReport[]) {
  const coordinates: Coordinate[] = [];

  for (const ward of wards) {
    for (const ring of extractOuterRings(ward.boundary_geojson)) {
      coordinates.push(...ring);
    }
  }

  for (const report of reports) {
    coordinates.push([report.location_lng, report.location_lat]);
  }

  if (coordinates.length === 0) {
    return null;
  }

  const [firstLng, firstLat] = coordinates[0];
  let minLng = firstLng;
  let maxLng = firstLng;
  let minLat = firstLat;
  let maxLat = firstLat;

  for (const [lng, lat] of coordinates) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  const lngSpan = Math.max(maxLng - minLng, 0.001);
  const latSpan = Math.max(maxLat - minLat, 0.001);

  return {
    minLng: minLng - lngSpan * 0.08,
    maxLng: maxLng + lngSpan * 0.08,
    minLat: minLat - latSpan * 0.08,
    maxLat: maxLat + latSpan * 0.08,
  };
}

function projectPoint(
  lng: number,
  lat: number,
  bounds: NonNullable<ReturnType<typeof buildBounds>>,
) {
  const width = SVG_WIDTH - SVG_PADDING * 2;
  const height = SVG_HEIGHT - SVG_PADDING * 2;
  const x =
    SVG_PADDING +
    ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng || 1)) * width;
  const y =
    SVG_HEIGHT -
    SVG_PADDING -
    ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1)) * height;

  return { x, y };
}

function toPath(ring: Coordinate[], bounds: NonNullable<ReturnType<typeof buildBounds>>) {
  return ring
    .map(([lng, lat], index) => {
      const point = projectPoint(lng, lat, bounds);
      return `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`;
    })
    .join(" ");
}

function filterReports(
  reports: MunicipalityMapReport[],
  reportFilter: MapFilter,
  selectedWardId: string | null,
) {
  return reports.filter((report) => {
    if (selectedWardId && report.ward_id !== selectedWardId) {
      return false;
    }

    if (reportFilter === "active") {
      return report.status === "incoming" || report.status === "in_progress";
    }

    if (reportFilter === "completed") {
      return report.status === "completed";
    }

    if (reportFilter === "escalated") {
      return report.escalated_to_municipality || report.assigned_level === "municipality";
    }

    return true;
  });
}

export function MunicipalityScopeMap({
  wards,
  reports,
  municipalityBoundary,
  selectedWardId,
  onSelectWard,
  reportFilter,
}: MunicipalityScopeMapProps) {
  const visibleReports = useMemo(
    () => filterReports(reports, reportFilter, selectedWardId),
    [reportFilter, reports, selectedWardId],
  );

  const bounds = useMemo(
    () => buildBounds(wards, visibleReports.length > 0 ? visibleReports : reports),
    [reports, visibleReports, wards],
  );

  const municipalityRings = useMemo(
    () => extractOuterRings(municipalityBoundary),
    [municipalityBoundary],
  );

  if (!bounds) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 text-sm text-gray-500">
        Map data is not available for the current scope.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Scope map</p>
          <p className="text-xs text-gray-500">
            Ward borders, municipality outline, and mapped task locations.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSelectWard(null)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          Show all wards
        </button>
      </div>

      <div className="bg-gray-50">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="h-[480px] w-full"
          role="img"
          aria-label="Municipality scope map"
        >
          <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="#f8fafc" />

          {municipalityRings.map((ring, index) => (
            <path
              key={`municipality-${index}`}
              d={`${toPath(ring, bounds)} Z`}
              fill="none"
              stroke="#0f172a"
              strokeDasharray="8 8"
              strokeWidth="3"
              opacity="0.6"
            />
          ))}

          {wards.map((ward) => {
            const isSelected = selectedWardId === ward.id;
            const rings = extractOuterRings(ward.boundary_geojson);

            return (
              <g key={ward.id}>
                {rings.map((ring, index) => (
                  <path
                    key={`${ward.id}-${index}`}
                    d={`${toPath(ring, bounds)} Z`}
                    fill={isSelected ? "#dbeafe" : "#e5e7eb"}
                    fillOpacity={isSelected ? 0.7 : 0.45}
                    stroke={isSelected ? "#2563eb" : "#94a3b8"}
                    strokeWidth={isSelected ? "3" : "1.8"}
                    className="cursor-pointer transition-all"
                    onClick={() => onSelectWard(isSelected ? null : ward.id)}
                  >
                    <title>{`${ward.name} (${ward.ward_code})`}</title>
                  </path>
                ))}

                {ward.center_lat !== null && ward.center_lng !== null ? (
                  <text
                    x={projectPoint(ward.center_lng, ward.center_lat, bounds).x}
                    y={projectPoint(ward.center_lng, ward.center_lat, bounds).y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-slate-700 text-[12px] font-medium"
                  >
                    {ward.ward_code.replace(/^.*-/, "")}
                  </text>
                ) : null}
              </g>
            );
          })}

          {visibleReports.map((report) => {
            const point = projectPoint(report.location_lng, report.location_lat, bounds);
            const selected = selectedWardId === report.ward_id;

            return (
              <g key={report.id}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={selected ? "5" : "4"}
                  fill={reportStatusColors[report.status]}
                  stroke="#ffffff"
                  strokeWidth="2"
                  opacity={selectedWardId && !selected ? 0.45 : 0.9}
                >
                  <title>{`${report.title} • ${report.ward_name} • ${report.upvote_count} upvotes`}</title>
                </circle>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
