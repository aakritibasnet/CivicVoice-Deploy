/**
 * Import real VDC-level boundaries as ward polygons for Kathmandu Valley.
 *
 * Data source: mesaugat/geoJSON-Nepal (nepal-wards.geojson)
 * These are pre-2017 VDC boundaries — the closest publicly available
 * polygon data to actual ward boundaries for Kathmandu, Lalitpur, and Bhaktapur.
 *
 * Each VDC polygon becomes a ward, clipped to the municipality boundary
 * via ST_Intersection so it doesn't spill into neighboring municipalities.
 *
 * Usage:
 *   npx tsx prisma/scripts/seed-valley-wards-real.ts
 */

import { readFileSync } from "fs";
import path from "path";
import { Pool } from "pg";
import { config } from "dotenv";

config();

const WARD_FILE = path.resolve(
  __dirname,
  "../data/nepal-boundaries/wards.geojson",
);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface GeoJSONFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

// Which districts to import and their municipality mapping
const VALLEY_DISTRICTS: Array<{
  district: string;
  municipalityName: string;
}> = [
  { district: "Kathmandu", municipalityName: "Kathmandu" },
  { district: "Lalitpur", municipalityName: "Lalitpur" },
  { district: "Bhaktapur", municipalityName: "Bhaktapur" },
];

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("🏔️  Kathmandu Valley — Real VDC Ward Boundaries");
  console.log("═══════════════════════════════════════════════════\n");

  const pgResult = await pool.query("SELECT PostGIS_full_version() as v");
  console.log(`✅ PostGIS: ${pgResult.rows[0].v.slice(0, 60)}...\n`);

  // Load GeoJSON
  console.log("Loading ward GeoJSON...");
  const data: GeoJSONCollection = JSON.parse(
    readFileSync(WARD_FILE, "utf-8"),
  );
  console.log(`   ${data.features.length} total VDC features loaded\n`);

  // ─── Step 1: Remove old grid-generated wards for the valley ───
  console.log("─── Cleaning old wards ───\n");

  for (const { municipalityName } of VALLEY_DISTRICTS) {
    // Get municipality ID
    const mun = await pool.query(
      `SELECT id, code FROM municipalities WHERE name = $1 AND is_active = true LIMIT 1`,
      [municipalityName],
    );
    if (!mun.rows[0]) {
      console.log(`   ⚠️  Municipality "${municipalityName}" not found, skipping cleanup`);
      continue;
    }

    const munId = mun.rows[0].id;
    const munCode = mun.rows[0].code;

    // Detach FKs before deleting
    await pool.query(
      `UPDATE reports SET ward_id = NULL WHERE ward_id IN (SELECT id FROM wards WHERE municipality_id = $1)`,
      [munId],
    );
    await pool.query(
      `UPDATE report_posts SET ward_id = NULL WHERE ward_id IN (SELECT id FROM wards WHERE municipality_id = $1)`,
      [munId],
    );
    await pool.query(
      `DELETE FROM ward_officers WHERE ward_id IN (SELECT id FROM wards WHERE municipality_id = $1)`,
      [munId],
    );
    await pool.query(
      `DELETE FROM officers WHERE ward_id IN (SELECT id FROM wards WHERE municipality_id = $1)`,
      [munId],
    );
    await pool.query(
      `UPDATE users SET ward_id = NULL WHERE ward_id::uuid IN (SELECT id FROM wards WHERE municipality_id = $1)`,
      [munId],
    );

    const del = await pool.query(
      `DELETE FROM wards WHERE municipality_id = $1`,
      [munId],
    );
    console.log(`   🗑️  ${municipalityName}: removed ${del.rowCount} old wards (code: ${munCode})`);
  }
  console.log("");

  // ─── Step 2: Import VDC boundaries as wards ───
  for (const { district, municipalityName } of VALLEY_DISTRICTS) {
    console.log(`─── ${municipalityName} (district: ${district}) ───\n`);

    const mun = await pool.query(
      `SELECT id, code FROM municipalities WHERE name = $1 AND is_active = true LIMIT 1`,
      [municipalityName],
    );
    if (!mun.rows[0]) {
      console.log(`   ❌ Municipality "${municipalityName}" not found!\n`);
      continue;
    }

    const munId = mun.rows[0].id;
    const munCode = mun.rows[0].code;

    // Filter features for this district
    const districtFeatures = data.features.filter(
      (f) => f.properties.DISTRICT === district,
    );
    console.log(`   ${districtFeatures.length} VDC features in ${district} district`);

    let inserted = 0;
    let skipped = 0;
    let wardNumber = 0;

    for (const feature of districtFeatures) {
      wardNumber++;
      const vdcName = String(feature.properties.VDC_NAME || "Unknown")
        .replace(/N\.P\.$/, "")
        .trim();

      const wardCode = `${munCode}-W${String(wardNumber).padStart(2, "0")}`;
      const geojsonStr = JSON.stringify(feature.geometry);

      try {
        // Clip VDC polygon to municipality boundary via ST_Intersection
        // This ensures ward polygons don't extend beyond the municipality
        const result = await pool.query(
          `WITH clipped AS (
             SELECT ST_Intersection(
               m.boundary,
               ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)
             ) AS geom
             FROM municipalities m
             WHERE m.id = $2
           )
           INSERT INTO wards (name, ward_code, municipality_id, boundary, boundary_metadata, is_active)
           SELECT
             $3, $4, $2,
             CASE
               WHEN ST_GeometryType(c.geom) IN ('ST_Polygon', 'ST_MultiPolygon')
               THEN c.geom
               ELSE ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)
             END,
             jsonb_build_object(
               'center', jsonb_build_object(
                 'lat', ST_Y(ST_Centroid(c.geom)),
                 'lng', ST_X(ST_Centroid(c.geom))
               ),
               'bbox', jsonb_build_object(
                 'sw', jsonb_build_object(
                   'lat', ST_YMin(ST_Envelope(c.geom)),
                   'lng', ST_XMin(ST_Envelope(c.geom))
                 ),
                 'ne', jsonb_build_object(
                   'lat', ST_YMax(ST_Envelope(c.geom)),
                   'lng', ST_XMax(ST_Envelope(c.geom))
                 )
               ),
               'vdc_code', $5::text,
               'vdc_name', $6::text
             ),
             true
           FROM clipped c
           WHERE NOT ST_IsEmpty(c.geom) AND ST_Area(c.geom) > 0
           ON CONFLICT (ward_code) DO UPDATE SET
             name = EXCLUDED.name,
             municipality_id = EXCLUDED.municipality_id,
             boundary = EXCLUDED.boundary,
             boundary_metadata = EXCLUDED.boundary_metadata,
             updated_at = NOW()
           RETURNING ward_code`,
          [
            geojsonStr,
            munId,
            vdcName,
            wardCode,
            String(feature.properties.VDC_CODE || ""),
            vdcName,
          ],
        );

        if (result.rowCount && result.rowCount > 0) {
          inserted++;
        } else {
          skipped++;
        }
      } catch (err) {
        console.error(`   ❌ ${vdcName} (${wardCode}):`, (err as Error).message.slice(0, 100));
        skipped++;
      }
    }

    console.log(`   ✅ ${inserted} wards inserted, ${skipped} skipped`);

    // Update total_wards on municipality
    await pool.query(
      `UPDATE municipalities SET total_wards = (
         SELECT COUNT(*) FROM wards WHERE municipality_id = $1 AND is_active = true
       ) WHERE id = $1`,
      [munId],
    );
    console.log("");
  }

  // ─── Step 3: Reassign reports ───
  console.log("─── Reassigning Reports ───\n");

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
     WHERE r.id = sub.report_id`,
  );
  console.log(`   ✅ ${reportResult.rowCount ?? 0} reports reassigned\n`);

  // ─── Step 4: Verification ───
  console.log("─── Verification ───\n");

  const counts = await pool.query(
    `SELECT m.name, m.total_wards,
       (SELECT COUNT(*) FROM wards w WHERE w.municipality_id = m.id AND w.is_active = true) as actual_wards
     FROM municipalities m
     WHERE m.name IN ('Kathmandu', 'Lalitpur', 'Bhaktapur')
     ORDER BY m.name`,
  );
  counts.rows.forEach((r: any) =>
    console.log(`   ${r.name}: ${r.actual_wards} wards`),
  );

  // Show all ward names per municipality
  for (const { municipalityName } of VALLEY_DISTRICTS) {
    const wards = await pool.query(
      `SELECT w.name, w.ward_code
       FROM wards w
       JOIN municipalities m ON m.id = w.municipality_id
       WHERE m.name = $1 AND w.is_active = true
       ORDER BY w.ward_code`,
      [municipalityName],
    );
    console.log(`\n   ${municipalityName} wards:`);
    wards.rows.forEach((r: any) => console.log(`     ${r.ward_code} — ${r.name}`));
  }

  // Test spatial detection
  const testPoints = [
    { lat: 27.7495, lng: 85.332, label: "Dhapasi" },
    { lat: 27.7800, lng: 85.362, label: "Budanilkantha" },
    { lat: 27.7350, lng: 85.300, label: "Balaju/Sitapaila" },
    { lat: 27.7172, lng: 85.324, label: "Kathmandu center" },
    { lat: 27.7400, lng: 85.350, label: "Kapan" },
    { lat: 27.7100, lng: 85.303, label: "Kirtipur" },
    { lat: 27.6667, lng: 85.3167, label: "Lalitpur/Patan" },
    { lat: 27.6450, lng: 85.325, label: "Godawari area" },
    { lat: 27.6500, lng: 85.290, label: "Bungamati" },
    { lat: 27.6710, lng: 85.4280, label: "Bhaktapur center" },
    { lat: 27.6720, lng: 85.4150, label: "Thimi" },
    { lat: 27.6820, lng: 85.4350, label: "Duwakot/Balkot" },
  ];

  console.log("\n\n   🔍 Spatial detection tests:\n");

  for (const test of testPoints) {
    const ward = await pool.query(
      `SELECT w.name, w.ward_code, m.name as municipality
       FROM wards w
       LEFT JOIN municipalities m ON m.id = w.municipality_id
       WHERE w.boundary IS NOT NULL AND w.is_active = true
         AND ST_Contains(w.boundary, ST_SetSRID(ST_Point($1, $2), 4326))
       LIMIT 1`,
      [test.lng, test.lat],
    );
    const r = ward.rows[0];
    console.log(
      `   📍 ${test.label}: ${r ? `${r.name} (${r.ward_code}) — ${r.municipality}` : "❌ Not found"}`,
    );
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("✅ Real ward boundary import complete!");
  console.log("═══════════════════════════════════════════════════\n");

  await pool.end();
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
