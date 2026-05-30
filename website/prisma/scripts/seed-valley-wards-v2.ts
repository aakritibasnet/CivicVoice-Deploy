/**
 * Import real VDC boundaries as wards for Kathmandu Valley — NO clipping.
 *
 * The geoBoundaries municipality polygons are smaller than the actual district
 * extent, so clipping loses most VDCs. Instead, insert the VDC polygons as-is
 * and also update the municipality boundary to be the union of all its VDCs.
 *
 * Usage:
 *   npx tsx prisma/scripts/seed-valley-wards-v2.ts
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

const VALLEY_DISTRICTS = [
  { district: "Kathmandu", municipalityName: "Kathmandu" },
  { district: "Lalitpur", municipalityName: "Lalitpur" },
  { district: "Bhaktapur", municipalityName: "Bhaktapur" },
];

async function cleanOldWards(munId: string, munName: string, munCode: string) {
  const oldWardIds = `(SELECT id FROM wards WHERE municipality_id = '${munId}')`;
  await pool.query(`UPDATE reports SET ward_id = NULL WHERE ward_id IN ${oldWardIds}`);
  await pool.query(`UPDATE report_posts SET ward_id = NULL WHERE ward_id IN ${oldWardIds}`);
  await pool.query(`DELETE FROM ward_officers WHERE ward_id IN ${oldWardIds}`);
  await pool.query(`DELETE FROM officers WHERE ward_id IN ${oldWardIds}`);
  await pool.query(
    `UPDATE users SET ward_id = NULL WHERE ward_id::uuid IN ${oldWardIds}`,
  );
  const del = await pool.query(`DELETE FROM wards WHERE municipality_id = $1`, [munId]);
  console.log(`   🗑️  ${munName}: removed ${del.rowCount} old wards`);
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("🏔️  Kathmandu Valley — Real VDC Ward Boundaries v2");
  console.log("═══════════════════════════════════════════════════\n");

  const pgResult = await pool.query("SELECT PostGIS_full_version() as v");
  console.log(`✅ PostGIS: ${pgResult.rows[0].v.slice(0, 60)}...\n`);

  console.log("Loading ward GeoJSON...");
  const data: GeoJSONCollection = JSON.parse(readFileSync(WARD_FILE, "utf-8"));
  console.log(`   ${data.features.length} total VDC features loaded\n`);

  // ─── Clean old wards ───
  console.log("─── Cleaning old wards ───\n");
  for (const { municipalityName } of VALLEY_DISTRICTS) {
    const mun = await pool.query(
      `SELECT id, code FROM municipalities WHERE name = $1 AND is_active = true LIMIT 1`,
      [municipalityName],
    );
    if (mun.rows[0]) {
      await cleanOldWards(mun.rows[0].id, municipalityName, mun.rows[0].code);
    }
  }
  console.log("");

  // ─── Import VDC boundaries as wards (no clipping) ───
  for (const { district, municipalityName } of VALLEY_DISTRICTS) {
    console.log(`─── ${municipalityName} (${district} district) ───\n`);

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

    const districtFeatures = data.features.filter(
      (f) => f.properties.DISTRICT === district,
    );
    console.log(`   ${districtFeatures.length} VDC features`);

    let inserted = 0;
    let wardNumber = 0;

    for (const feature of districtFeatures) {
      wardNumber++;
      const vdcName = String(feature.properties.VDC_NAME || "Unknown")
        .replace(/N\.P\.$/, "")
        .trim();

      const wardCode = `${munCode}-W${String(wardNumber).padStart(2, "0")}`;
      const geojsonStr = JSON.stringify(feature.geometry);

      try {
        await pool.query(
          `INSERT INTO wards (name, ward_code, municipality_id, boundary, boundary_metadata, is_active)
           VALUES (
             $1, $2, $3,
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
             true
           )
           ON CONFLICT (ward_code) DO UPDATE SET
             name = EXCLUDED.name,
             municipality_id = EXCLUDED.municipality_id,
             boundary = EXCLUDED.boundary,
             boundary_metadata = EXCLUDED.boundary_metadata,
             updated_at = NOW()`,
          [vdcName, wardCode, munId, geojsonStr],
        );
        inserted++;
      } catch (err) {
        console.error(`   ❌ ${vdcName} (${wardCode}):`, (err as Error).message.slice(0, 120));
      }
    }

    console.log(`   ✅ ${inserted}/${districtFeatures.length} wards inserted`);

    // Update municipality boundary to be the union of all its VDC wards
    // This fixes the too-small geoBoundaries polygon
    await pool.query(
      `UPDATE municipalities m SET
         boundary = sub.union_geom,
         boundary_metadata = jsonb_build_object(
           'center', jsonb_build_object(
             'lat', ST_Y(ST_Centroid(sub.union_geom)),
             'lng', ST_X(ST_Centroid(sub.union_geom))
           ),
           'bbox', jsonb_build_object(
             'sw', jsonb_build_object(
               'lat', ST_YMin(ST_Envelope(sub.union_geom)),
               'lng', ST_XMin(ST_Envelope(sub.union_geom))
             ),
             'ne', jsonb_build_object(
               'lat', ST_YMax(ST_Envelope(sub.union_geom)),
               'lng', ST_XMax(ST_Envelope(sub.union_geom))
             )
           )
         ),
         total_wards = sub.ward_count,
         updated_at = NOW()
       FROM (
         SELECT
           w.municipality_id,
           ST_Multi(ST_Union(w.boundary)) AS union_geom,
           COUNT(*) AS ward_count
         FROM wards w
         WHERE w.municipality_id = $1 AND w.is_active = true AND w.boundary IS NOT NULL
         GROUP BY w.municipality_id
       ) sub
       WHERE m.id = $1`,
      [munId],
    );
    console.log(`   📐 Municipality boundary updated to union of ${inserted} VDC polygons\n`);
  }

  // ─── Reassign reports ───
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

  // ─── Verification ───
  console.log("─── Verification ───\n");

  const counts = await pool.query(
    `SELECT m.name, m.total_wards
     FROM municipalities m
     WHERE m.name IN ('Kathmandu', 'Lalitpur', 'Bhaktapur')
     ORDER BY m.name`,
  );
  counts.rows.forEach((r: any) => console.log(`   ${r.name}: ${r.total_wards} wards`));

  // Show all ward names
  for (const { municipalityName } of VALLEY_DISTRICTS) {
    const wards = await pool.query(
      `SELECT w.name, w.ward_code
       FROM wards w JOIN municipalities m ON m.id = w.municipality_id
       WHERE m.name = $1 AND w.is_active = true
       ORDER BY w.ward_code`,
      [municipalityName],
    );
    console.log(`\n   ${municipalityName} (${wards.rows.length} wards):`);
    wards.rows.forEach((r: any) => console.log(`     ${r.ward_code} — ${r.name}`));
  }

  // Spatial detection tests
  const testPoints = [
    { lat: 27.7495, lng: 85.332, label: "Dhapasi" },
    { lat: 27.7800, lng: 85.362, label: "Budanilkantha" },
    { lat: 27.7350, lng: 85.300, label: "Balaju/Sitapaila" },
    { lat: 27.7172, lng: 85.324, label: "Kathmandu center" },
    { lat: 27.7400, lng: 85.350, label: "Kapan" },
    { lat: 27.7100, lng: 85.303, label: "Kirtipur" },
    { lat: 27.6667, lng: 85.3167, label: "Lalitpur/Patan" },
    { lat: 27.6400, lng: 85.310, label: "Bungamati" },
    { lat: 27.6300, lng: 85.370, label: "Godawari" },
    { lat: 27.6500, lng: 85.325, label: "Sunakothi" },
    { lat: 27.6700, lng: 85.340, label: "Imadol" },
    { lat: 27.6710, lng: 85.4280, label: "Bhaktapur center" },
    { lat: 27.6720, lng: 85.4000, label: "Thimi" },
    { lat: 27.6850, lng: 85.4350, label: "Duwakot" },
    { lat: 27.7150, lng: 85.3650, label: "Gothatar" },
    { lat: 27.7300, lng: 85.3200, label: "Gonggabu/Bansbari" },
    { lat: 27.7650, lng: 85.3100, label: "Goldhunga" },
    { lat: 27.6950, lng: 85.3480, label: "New Baneshwor" },
  ];

  console.log("\n\n   🔍 Spatial detection tests:\n");
  for (const test of testPoints) {
    const ward = await pool.query(
      `SELECT w.name, w.ward_code, m.name as municipality
       FROM wards w LEFT JOIN municipalities m ON m.id = w.municipality_id
       WHERE w.boundary IS NOT NULL AND w.is_active = true
         AND ST_Contains(w.boundary, ST_SetSRID(ST_Point($1, $2), 4326))
       LIMIT 1`,
      [test.lng, test.lat],
    );
    const r = ward.rows[0];
    console.log(
      `   📍 ${test.label.padEnd(22)} → ${r ? `${r.name} (${r.ward_code})` : "❌ Not found"}`,
    );
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("✅ Done!");
  console.log("═══════════════════════════════════════════════════\n");

  await pool.end();
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
