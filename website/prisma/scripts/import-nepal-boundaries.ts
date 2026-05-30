/**
 * Import Nepal administrative boundary GeoJSON data into PostGIS.
 *
 * Prerequisites:
 *   1. Run the download script first:
 *      npx tsx prisma/scripts/download-nepal-boundaries.ts
 *   2. Ensure the migration has been applied:
 *      npx prisma migrate dev
 *
 * Usage:
 *   npx tsx prisma/scripts/import-nepal-boundaries.ts
 *
 * Options (env):
 *   SKIP_WARDS=1    — Import only municipalities (faster for testing)
 *   DRY_RUN=1       — Parse and validate without inserting
 */

import { readFileSync, existsSync } from "fs";
import path from "path";
import { Pool } from "pg";
import { config } from "dotenv";

config();

const DATA_DIR = path.resolve(__dirname, "../data/nepal-boundaries");
const MUNICIPALITY_FILE = path.join(DATA_DIR, "municipalities.geojson");
const WARD_FILE = path.join(DATA_DIR, "wards.geojson");

const BATCH_SIZE = 50;
const DRY_RUN = process.env.DRY_RUN === "1";
const SKIP_WARDS = process.env.SKIP_WARDS === "1";

// ─── Types ───────────────────────────────────────────

interface GeoJSONFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

interface MunicipalityRow {
  id: string;
  name: string;
  code: string;
}

// ─── Helpers ─────────────────────────────────────────

function generateMunicipalityCode(
  name: string,
  district: string,
  type: string,
): string {
  // Create a short unique code from district + municipality name
  const districtPart = district
    .replace(/\s+/g, "")
    .slice(0, 3)
    .toUpperCase();

  const namePart = name
    .replace(/\s+/g, "")
    .replace(/municipality|rural|metropolitan|sub-metropolitan|gaupalika|nagarpalika/gi, "")
    .trim()
    .slice(0, 5)
    .toUpperCase();

  const typeSuffix =
    type === "metropolitan"
      ? "MET"
      : type === "sub_metropolitan"
        ? "SME"
        : type === "rural_municipality"
          ? "RM"
          : "MUN";

  return `${districtPart}-${namePart || "X"}-${typeSuffix}`;
}

function normalizeMunicipalityType(raw: string): string {
  const lower = (raw || "").toLowerCase().trim();
  if (lower.includes("metropolitan") && lower.includes("sub")) return "sub_metropolitan";
  if (lower.includes("metropolitan")) return "metropolitan";
  if (lower.includes("rural") || lower.includes("gaupalika")) return "rural_municipality";
  return "municipality";
}

/**
 * Try to extract a property value from a GeoJSON feature using multiple possible key names.
 * HDX datasets vary in property naming conventions.
 */
function extractProp(
  props: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    // Try exact match
    if (props[key] != null && String(props[key]).trim() !== "") {
      return String(props[key]).trim();
    }
    // Try case-insensitive
    const found = Object.keys(props).find(
      (k) => k.toLowerCase() === key.toLowerCase(),
    );
    if (found && props[found] != null && String(props[found]).trim() !== "") {
      return String(props[found]).trim();
    }
  }
  return null;
}

function extractWardNumber(props: Record<string, unknown>): number | null {
  const raw = extractProp(props, [
    "NEW_WARD_N",
    "Ward_No",
    "WARD_NO",
    "ward_no",
    "Ward",
    "ward",
    "WARD",
    "NEW_WARD_NO",
    "WARDNO",
    "Ward_Number",
  ]);
  if (raw == null) return null;
  const num = parseInt(String(raw), 10);
  return isNaN(num) ? null : num;
}

function extractMunicipalityName(props: Record<string, unknown>): string | null {
  return extractProp(props, [
    "shapeName",
    "GaPa_NaPa",
    "GAPA_NAPA",
    "GaPa",
    "NaPa",
    "LOCAL",
    "local",
    "Municipality",
    "municipality",
    "LOCAL_UNIT",
    "local_unit",
    "GN_NAME",
    "NAME",
    "name",
    "Name",
    "LABEL",
  ]);
}

function extractDistrict(props: Record<string, unknown>): string | null {
  return extractProp(props, [
    "DISTRICT",
    "District",
    "district",
    "DIST_EN",
    "dist_en",
  ]);
}

function extractProvince(props: Record<string, unknown>): {
  id: number | null;
  name: string | null;
} {
  const name = extractProp(props, [
    "Province",
    "PROVINCE",
    "province",
    "PR_NAME",
    "State",
  ]);
  const idRaw = extractProp(props, [
    "Province_N",
    "PROVINCE_N",
    "PR_CODE",
    "Province_Code",
    "STATE_CODE",
  ]);
  const id = idRaw ? parseInt(String(idRaw), 10) : null;
  return { id: isNaN(id as number) ? null : id, name };
}

// ─── Main Logic ──────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("🇳🇵 Nepal Boundary Import — PostGIS");
  if (DRY_RUN) console.log("   ⚠️  DRY RUN — no data will be inserted");
  console.log("═══════════════════════════════════════════════════\n");

  // Validate files exist
  if (!existsSync(MUNICIPALITY_FILE)) {
    console.error(`❌ Municipality GeoJSON not found: ${MUNICIPALITY_FILE}`);
    console.error("   Run the download script first: npx tsx prisma/scripts/download-nepal-boundaries.ts");
    process.exit(1);
  }

  if (!SKIP_WARDS && !existsSync(WARD_FILE)) {
    console.error(`❌ Ward GeoJSON not found: ${WARD_FILE}`);
    console.error("   Run the download script first, or set SKIP_WARDS=1 to skip wards");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Verify PostGIS
    const pgResult = await pool.query(
      "SELECT PostGIS_full_version() as v",
    );
    console.log(`✅ PostGIS: ${pgResult.rows[0].v.slice(0, 60)}...\n`);

    // ─── Step 1: Import Municipalities ─────────────────
    console.log("─── Step 1: Importing Municipalities ───────────────\n");

    const munData: GeoJSONCollection = JSON.parse(
      readFileSync(MUNICIPALITY_FILE, "utf-8"),
    );
    console.log(`   Loaded ${munData.features.length} municipality features\n`);

    // Inspect first feature to understand property names
    if (munData.features.length > 0) {
      console.log("   Sample properties (first feature):");
      const sampleProps = munData.features[0].properties;
      for (const [key, value] of Object.entries(sampleProps)) {
        console.log(`     ${key}: ${JSON.stringify(value)}`);
      }
      console.log("");
    }

    const municipalityMap = new Map<string, MunicipalityRow>();
    let munInserted = 0;
    let munSkipped = 0;
    let munErrors = 0;

    for (let i = 0; i < munData.features.length; i += BATCH_SIZE) {
      const batch = munData.features.slice(i, i + BATCH_SIZE);

      for (const feature of batch) {
        const props = feature.properties;
        const name = extractMunicipalityName(props);

        if (!name) {
          console.warn(`   ⚠️  Skipping feature with no name: ${JSON.stringify(Object.keys(props))}`);
          munSkipped++;
          continue;
        }

        const district = extractDistrict(props) || "Unknown";
        const province = extractProvince(props);
        const typeRaw = extractProp(props, [
          "shapeType",
          "Type_GN",
          "TYPE",
          "type",
          "Type",
          "LOCAL_TYPE",
          "GN_TYPE",
        ]) || "municipality";
        const nameNe = extractProp(props, [
          "GaPa_NaPa_N",
          "NAME_NE",
          "name_ne",
          "LOCAL_NE",
          "HLCIT_LOCL",
        ]);

        // Infer type from name for geoBoundaries data
        const type = normalizeMunicipalityType(
          name.toLowerCase().includes("metropolitan") && name.toLowerCase().includes("sub")
            ? "sub_metropolitan"
            : name.toLowerCase().includes("metropolitan")
              ? "metropolitan"
              : name.toLowerCase().includes("rural") || name.toLowerCase().includes("gaupalika")
                ? "rural_municipality"
                : typeRaw,
        );

        // For geoBoundaries data without district, use shapeID or name-based code
        const shapeId = extractProp(props, ["shapeID"]);
        const code = district !== "Unknown"
          ? generateMunicipalityCode(name, district, type)
          : `NPL-${name.replace(/\s+/g, "").slice(0, 8).toUpperCase()}-${(shapeId || "").slice(-4) || "X"}`;

        // Deduplicate by code — if same code, append a counter
        let finalCode = code;
        let counter = 1;
        while (municipalityMap.has(finalCode)) {
          finalCode = `${code}${counter}`;
          counter++;
        }

        if (DRY_RUN) {
          municipalityMap.set(finalCode, { id: `dry-${i}`, name, code: finalCode });
          munInserted++;
          continue;
        }

        try {
          const geojsonStr = JSON.stringify(feature.geometry);

          const result = await pool.query(
            `INSERT INTO municipalities (name, name_ne, code, type, province_id, province_name, district, boundary, boundary_metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7,
                     ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($8), 4326)),
                     jsonb_build_object(
                       'center', jsonb_build_object(
                         'lat', ST_Y(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($8), 4326))),
                         'lng', ST_X(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($8), 4326)))
                       ),
                       'bbox', jsonb_build_object(
                         'sw', jsonb_build_object(
                           'lat', ST_YMin(ST_Envelope(ST_SetSRID(ST_GeomFromGeoJSON($8), 4326))),
                           'lng', ST_XMin(ST_Envelope(ST_SetSRID(ST_GeomFromGeoJSON($8), 4326)))
                         ),
                         'ne', jsonb_build_object(
                           'lat', ST_YMax(ST_Envelope(ST_SetSRID(ST_GeomFromGeoJSON($8), 4326))),
                           'lng', ST_XMax(ST_Envelope(ST_SetSRID(ST_GeomFromGeoJSON($8), 4326)))
                         )
                       )
                     ))
             ON CONFLICT (code) DO UPDATE SET
               name = EXCLUDED.name,
               name_ne = EXCLUDED.name_ne,
               type = EXCLUDED.type,
               province_id = EXCLUDED.province_id,
               province_name = EXCLUDED.province_name,
               district = EXCLUDED.district,
               boundary = EXCLUDED.boundary,
               boundary_metadata = EXCLUDED.boundary_metadata,
               updated_at = NOW()
             RETURNING id, name, code`,
            [
              name,
              nameNe,
              finalCode,
              type,
              province.id,
              province.name,
              district,
              geojsonStr,
            ],
          );

          const row = result.rows[0];
          municipalityMap.set(finalCode, row);
          munInserted++;
        } catch (err) {
          console.error(`   ❌ Error inserting ${name} (${finalCode}):`, (err as Error).message);
          munErrors++;
        }
      }

      // Progress
      const progress = Math.min(i + BATCH_SIZE, munData.features.length);
      process.stdout.write(
        `\r   Progress: ${progress}/${munData.features.length} municipalities processed...`,
      );
    }

    console.log(
      `\n\n   ✅ Municipalities: ${munInserted} inserted, ${munSkipped} skipped, ${munErrors} errors\n`,
    );

    // Build a lookup: name+district → municipality for ward matching
    // Also fetch all municipalities from DB for lookup
    let dbMunicipalities: MunicipalityRow[] = [];
    if (!DRY_RUN) {
      const munResult = await pool.query(
        "SELECT id, name, code, district FROM municipalities WHERE is_active = true",
      );
      dbMunicipalities = munResult.rows;

      // Update total_wards after ward import
      console.log(`   📊 ${dbMunicipalities.length} municipalities in database\n`);
    }

    // ─── Step 2: Import Wards ──────────────────────────
    if (SKIP_WARDS) {
      console.log("⏭️  Skipping ward import (SKIP_WARDS=1)\n");
    } else {
      console.log("─── Step 2: Importing Wards ────────────────────────\n");

      const wardData: GeoJSONCollection = JSON.parse(
        readFileSync(WARD_FILE, "utf-8"),
      );
      console.log(`   Loaded ${wardData.features.length} ward features\n`);

      // Inspect first feature
      if (wardData.features.length > 0) {
        console.log("   Sample properties (first feature):");
        const sampleProps = wardData.features[0].properties;
        for (const [key, value] of Object.entries(sampleProps)) {
          console.log(`     ${key}: ${JSON.stringify(value)}`);
        }
        console.log("");
      }

      let wardInserted = 0;
      let wardSkipped = 0;
      let wardErrors = 0;
      let wardNoMunicipality = 0;

      for (let i = 0; i < wardData.features.length; i += BATCH_SIZE) {
        const batch = wardData.features.slice(i, i + BATCH_SIZE);

        for (const feature of batch) {
          const props = feature.properties;
          const wardNumber = extractWardNumber(props);
          const munName = extractMunicipalityName(props);
          const district = extractDistrict(props) || "Unknown";

          if (wardNumber == null) {
            wardSkipped++;
            continue;
          }

          if (!munName) {
            wardSkipped++;
            continue;
          }

          // Find matching municipality
          let municipalityId: string | null = null;
          let municipalityCode: string | null = null;

          if (!DRY_RUN) {
            // Match by name + district (case-insensitive)
            const match = dbMunicipalities.find(
              (m) =>
                m.name.toLowerCase() === munName.toLowerCase() ||
                // Sometimes names differ slightly, try contains
                m.name.toLowerCase().includes(munName.toLowerCase()) ||
                munName.toLowerCase().includes(m.name.toLowerCase()),
            );

            if (match) {
              municipalityId = match.id;
              municipalityCode = match.code;
            } else {
              // Try spatial match: find municipality containing the ward centroid
              const geojsonStr = JSON.stringify(feature.geometry);
              try {
                const spatialMatch = await pool.query(
                  `SELECT id, code FROM municipalities
                   WHERE boundary IS NOT NULL AND is_active = true
                     AND ST_Contains(boundary, ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)))
                   LIMIT 1`,
                  [geojsonStr],
                );
                if (spatialMatch.rows.length > 0) {
                  municipalityId = spatialMatch.rows[0].id;
                  municipalityCode = spatialMatch.rows[0].code;
                }
              } catch {
                // Spatial match failed, continue without
              }
            }

            if (!municipalityId) {
              wardNoMunicipality++;
            }
          }

          const wardCode = municipalityCode
            ? `${municipalityCode}-W${String(wardNumber).padStart(2, "0")}`
            : `UNK-${district.slice(0, 3).toUpperCase()}-W${wardNumber}`;
          const wardName = `Ward ${wardNumber}`;

          if (DRY_RUN) {
            wardInserted++;
            continue;
          }

          try {
            const geojsonStr = JSON.stringify(feature.geometry);

            await pool.query(
              `INSERT INTO wards (name, ward_code, municipality_id, boundary, boundary_metadata, is_active)
               VALUES ($1, $2, $3,
                       ST_SetSRID(ST_GeomFromGeoJSON($4), 4326),
                       jsonb_build_object(
                         'center', jsonb_build_object(
                           'lat', ST_Y(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))),
                           'lng', ST_X(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)))
                         ),
                         'bbox', jsonb_build_object(
                           'sw', jsonb_build_object(
                             'lat', ST_YMin(ST_Envelope(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))),
                             'lng', ST_XMin(ST_Envelope(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)))
                           ),
                           'ne', jsonb_build_object(
                             'lat', ST_YMax(ST_Envelope(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))),
                             'lng', ST_XMax(ST_Envelope(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)))
                           )
                         )
                       ),
                       true)
               ON CONFLICT (ward_code) DO UPDATE SET
                 name = EXCLUDED.name,
                 municipality_id = EXCLUDED.municipality_id,
                 boundary = EXCLUDED.boundary,
                 boundary_metadata = EXCLUDED.boundary_metadata,
                 updated_at = NOW()`,
              [wardName, wardCode, municipalityId, geojsonStr],
            );

            wardInserted++;
          } catch (err) {
            const msg = (err as Error).message;
            // Duplicate ward_code — generate a unique one with suffix
            if (msg.includes("duplicate key") || msg.includes("unique constraint")) {
              const uniqueCode = `${wardCode}-${Date.now().toString(36).slice(-4)}`;
              try {
                const geojsonStr = JSON.stringify(feature.geometry);
                await pool.query(
                  `INSERT INTO wards (name, ward_code, municipality_id, boundary, boundary_metadata, is_active)
                   VALUES ($1, $2, $3,
                           ST_SetSRID(ST_GeomFromGeoJSON($4), 4326),
                           jsonb_build_object(
                             'center', jsonb_build_object(
                               'lat', ST_Y(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))),
                               'lng', ST_X(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)))
                             )
                           ),
                           true)`,
                  [wardName, uniqueCode, municipalityId, geojsonStr],
                );
                wardInserted++;
              } catch (retryErr) {
                console.error(`   ❌ Error inserting ward ${wardCode}:`, (retryErr as Error).message);
                wardErrors++;
              }
            } else {
              console.error(`   ❌ Error inserting ward ${wardCode}:`, msg);
              wardErrors++;
            }
          }
        }

        const progress = Math.min(i + BATCH_SIZE, wardData.features.length);
        process.stdout.write(
          `\r   Progress: ${progress}/${wardData.features.length} wards processed...`,
        );
      }

      console.log(
        `\n\n   ✅ Wards: ${wardInserted} inserted, ${wardSkipped} skipped, ${wardErrors} errors`,
      );
      if (wardNoMunicipality > 0) {
        console.log(
          `   ⚠️  ${wardNoMunicipality} wards could not be matched to a municipality`,
        );
      }
      console.log("");

      // Update total_wards count on municipalities
      if (!DRY_RUN) {
        await pool.query(
          `UPDATE municipalities m
           SET total_wards = (SELECT COUNT(*) FROM wards w WHERE w.municipality_id = m.id AND w.is_active = true)`,
        );
        console.log("   📊 Updated municipality ward counts\n");
      }
    }

    // ─── Step 3: Reassign existing reports ─────────────
    if (!DRY_RUN) {
      console.log("─── Step 3: Reassigning Reports ────────────────────\n");

      const reportResult = await pool.query(
        `UPDATE reports r
         SET ward_id = sub.ward_id
         FROM (
           SELECT r2.id AS report_id, w.id AS ward_id
           FROM reports r2
           INNER JOIN wards w ON w.boundary IS NOT NULL AND w.is_active = true
             AND ST_Contains(w.boundary, ST_SetSRID(ST_Point(r2.location_lng, r2.location_lat), 4326))
           WHERE r2.location_lat IS NOT NULL AND r2.location_lng IS NOT NULL
         ) sub
         WHERE r.id = sub.report_id AND (r.ward_id IS NULL OR r.ward_id != sub.ward_id)`,
      );

      console.log(`   ✅ ${reportResult.rowCount ?? 0} reports reassigned to matching wards\n`);
    }

    // ─── Step 4: Verification ──────────────────────────
    if (!DRY_RUN) {
      console.log("─── Step 4: Verification ───────────────────────────\n");

      const counts = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM municipalities WHERE is_active = true) AS municipality_count,
           (SELECT COUNT(*) FROM wards WHERE is_active = true) AS ward_count,
           (SELECT COUNT(*) FROM wards WHERE boundary IS NOT NULL) AS wards_with_boundary,
           (SELECT COUNT(*) FROM municipalities WHERE boundary IS NOT NULL) AS municipalities_with_boundary`,
      );

      const c = counts.rows[0];
      console.log(`   Municipalities: ${c.municipality_count} (${c.municipalities_with_boundary} with boundaries)`);
      console.log(`   Wards:          ${c.ward_count} (${c.wards_with_boundary} with boundaries)\n`);

      // Test known coordinates
      const testPoints = [
        { lat: 27.7172, lng: 85.324, label: "Kathmandu" },
        { lat: 28.2096, lng: 83.9856, label: "Pokhara" },
        { lat: 26.4525, lng: 87.2718, label: "Biratnagar" },
        { lat: 27.6667, lng: 85.3167, label: "Lalitpur" },
      ];

      console.log("   🔍 Spatial detection tests:\n");

      for (const test of testPoints) {
        // Test ward detection
        const wardResult = await pool.query(
          `SELECT w.name AS ward_name, w.ward_code, m.name AS municipality_name
           FROM wards w
           LEFT JOIN municipalities m ON m.id = w.municipality_id
           WHERE w.boundary IS NOT NULL AND w.is_active = true
             AND ST_Contains(w.boundary, ST_SetSRID(ST_Point($1, $2), 4326))
           LIMIT 1`,
          [test.lng, test.lat],
        );

        // Test municipality detection
        const munResult = await pool.query(
          `SELECT name, code FROM municipalities
           WHERE boundary IS NOT NULL AND is_active = true
             AND ST_Contains(boundary, ST_SetSRID(ST_Point($1, $2), 4326))
           LIMIT 1`,
          [test.lng, test.lat],
        );

        const ward = wardResult.rows[0];
        const mun = munResult.rows[0];

        console.log(`   📍 ${test.label} (${test.lat}, ${test.lng}):`);
        console.log(`      Municipality: ${mun?.name || "Not found"} ${mun?.code ? `(${mun.code})` : ""}`);
        console.log(`      Ward: ${ward?.ward_name || "Not found"} ${ward?.ward_code ? `(${ward.ward_code})` : ""}`);
        console.log("");
      }
    }

    console.log("═══════════════════════════════════════════════════");
    console.log("✅ Import complete!");
    console.log("═══════════════════════════════════════════════════\n");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Import failed:", err);
  process.exit(1);
});
