// ═══════════════════════════════════════════════════════
// Ward Boundary GeoJSON Data
// 5 wards around Kathmandu, ~1km x 1km each
// Non-overlapping rectangular polygons
// Coordinates: [longitude, latitude] (GeoJSON standard)
// ═══════════════════════════════════════════════════════

export interface WardSeedData {
  name: string;
  ward_code: string;
  contact_email: string;
  contact_phone: string;
  geojson: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

// Approximate scale at Kathmandu latitude (~27.7°N):
// 0.001° latitude  ≈ 111 meters
// 0.001° longitude ≈ 99 meters
// Each ward below is roughly 1km x 1km

export const WARD_BOUNDARIES: WardSeedData[] = [
  // ── Ward 1: Dhapasi ──────────────────────────────
  // Contains test reports at 27.7497582, 85.3321581
  {
    name: "Dhapasi",
    ward_code: "KTM-W01",
    contact_email: "ward01@kathmandu.gov.np",
    contact_phone: "+977-1-4350001",
    geojson: {
      type: "Polygon",
      coordinates: [
        [
          [85.327, 27.745], // SW
          [85.337, 27.745], // SE
          [85.337, 27.754], // NE
          [85.327, 27.754], // NW
          [85.327, 27.745], // close
        ],
      ],
    },
  },

  // ── Ward 2: Balaju ───────────────────────────────
  {
    name: "Balaju",
    ward_code: "KTM-W02",
    contact_email: "ward02@kathmandu.gov.np",
    contact_phone: "+977-1-4350002",
    geojson: {
      type: "Polygon",
      coordinates: [
        [
          [85.299, 27.726], // SW
          [85.309, 27.726], // SE
          [85.309, 27.736], // NE
          [85.299, 27.736], // NW
          [85.299, 27.726], // close
        ],
      ],
    },
  },

  // ── Ward 3: Lazimpat ─────────────────────────────
  {
    name: "Lazimpat",
    ward_code: "KTM-W03",
    contact_email: "ward03@kathmandu.gov.np",
    contact_phone: "+977-1-4350003",
    geojson: {
      type: "Polygon",
      coordinates: [
        [
          [85.319, 27.713], // SW
          [85.329, 27.713], // SE
          [85.329, 27.723], // NE
          [85.319, 27.723], // NW
          [85.319, 27.713], // close
        ],
      ],
    },
  },

  // ── Ward 4: Thamel ──────────────────────────────
  {
    name: "Thamel",
    ward_code: "KTM-W04",
    contact_email: "ward04@kathmandu.gov.np",
    contact_phone: "+977-1-4350004",
    geojson: {
      type: "Polygon",
      coordinates: [
        [
          [85.308, 27.71], // SW
          [85.317, 27.71], // SE
          [85.317, 27.72], // NE
          [85.308, 27.72], // NW
          [85.308, 27.71], // close
        ],
      ],
    },
  },

  // ── Ward 5: New Baneshwor ───────────────────────
  {
    name: "New Baneshwor",
    ward_code: "KTM-W05",
    contact_email: "ward05@kathmandu.gov.np",
    contact_phone: "+977-1-4350005",
    geojson: {
      type: "Polygon",
      coordinates: [
        [
          [85.334, 27.689], // SW
          [85.344, 27.689], // SE
          [85.344, 27.699], // NE
          [85.334, 27.699], // NW
          [85.334, 27.689], // close
        ],
      ],
    },
  },
];
