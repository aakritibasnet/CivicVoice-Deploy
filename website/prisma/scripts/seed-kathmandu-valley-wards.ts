/**
 * Generate approximate ward polygon fencing for the Kathmandu Valley:
 *   - Kathmandu Metropolitan City: 32 wards
 *   - Lalitpur Metropolitan City: 29 wards
 *   - Bhaktapur Municipality: 17 wards
 *
 * These are grid-subdivided polygons clipped to the municipality boundary.
 * Not survey-accurate, but functional for routing and map display.
 *
 * Usage:
 *   npx tsx prisma/scripts/seed-kathmandu-valley-wards.ts
 */

import { Pool } from "pg";
import { config } from "dotenv";

config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface MunicipalityInfo {
  id: string;
  name: string;
  code: string;
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
}

const VALLEY_MUNICIPALITIES: Array<{
  name: string;
  wardCount: number;
  gridCols: number;
  gridRows: number;
  // Well-known ward names for Kathmandu Valley
  wardNames?: Record<number, string>;
}> = [
  {
    name: "Kathmandu",
    wardCount: 32,
    gridCols: 6,
    gridRows: 6,
    wardNames: {
      1: "Budhanilkantha",
      2: "Nagarjun",
      3: "Tarakeshwor",
      4: "Chandragiri",
      5: "Dakshinkali",
      6: "Shankharapur",
      7: "Gokarneshwor",
      8: "Kageshwori-Manohara",
      9: "Tokha",
      10: "Goldhunga",
      11: "Kapan",
      12: "Chabahil",
      13: "Maharajgunj",
      14: "Bansbari",
      15: "Dhapasi",
      16: "Balaju",
      17: "Swayambhu",
      18: "Kalimati",
      19: "Kuleshwor",
      20: "Kalanki",
      21: "Naxal",
      22: "Lazimpat",
      23: "Durbarmarg",
      24: "Kamalpokhari",
      25: "Thamel",
      26: "Ason",
      27: "New Road",
      28: "Tripureshwor",
      29: "Bagbazar",
      30: "New Baneshwor",
      31: "Koteshwor",
      32: "Sinamangal",
    },
  },
  {
    name: "Lalitpur",
    wardCount: 29,
    gridCols: 5,
    gridRows: 6,
    wardNames: {
      1: "Godawari",
      2: "Sainbu",
      3: "Bungamati",
      4: "Khokana",
      5: "Chapagaun",
      6: "Harisiddhi",
      7: "Lubhu",
      8: "Imadol",
      9: "Tikathali",
      10: "Gwarko",
      11: "Satdobato",
      12: "Lagankhel",
      13: "Pulchowk",
      14: "Jawalakhel",
      15: "Sanepa",
      16: "Kupondole",
      17: "Patan Dhoka",
      18: "Mangal Bazaar",
      19: "Kumaripati",
      20: "Nakhipot",
      21: "Balkumari",
      22: "Mahalaxmi",
      23: "Nakhu",
      24: "Sunakothi",
      25: "Dhapakhel",
      26: "Thaiba",
      27: "Lele",
      28: "Nallu",
      29: "Devichour",
    },
  },
  {
    name: "Bhaktapur",
    wardCount: 17,
    gridCols: 5,
    gridRows: 4,
    wardNames: {
      1: "Kamal Binayak",
      2: "Suryabinayak",
      3: "Sipadol",
      4: "Jagati",
      5: "Tathali",
      6: "Madhyapur Thimi",
      7: "Lokanthali",
      8: "Bode",
      9: "Nagarkot",
      10: "Changunarayan",
      11: "Duwakot",
      12: "Balkot",
      13: "Bhaktapur Durbar",
      14: "Dattatreya",
      15: "Pottery Square",
      16: "Byasi",
      17: "Sallaghari",
    },
  },
];

async function getMunicipalityBounds(name: string): Promise<MunicipalityInfo | null> {
  const { rows } = await pool.query(
    `SELECT id, name, code,
       ST_YMin(ST_Envelope(boundary)) as min_lat,
       ST_YMax(ST_Envelope(boundary)) as max_lat,
       ST_XMin(ST_Envelope(boundary)) as min_lng,
       ST_XMax(ST_Envelope(boundary)) as max_lng
     FROM municipalities
     WHERE name = $1 AND is_active = true AND boundary IS NOT NULL
     LIMIT 1`,
    [name],
  );
  return rows[0] || null;
}

/**
 * Generate ward polygons by subdividing the municipality bounding box into a grid,
 * then clipping each cell to the actual municipality boundary using ST_Intersection.
 */
async function generateWards(
  muni: MunicipalityInfo,
  wardCount: number,
  gridCols: number,
  gridRows: number,
  wardNames: Record<number, string>,
): Promise<number> {
  const latStep = (muni.max_lat - muni.min_lat) / gridRows;
  const lngStep = (muni.max_lng - muni.min_lng) / gridCols;

  let wardNumber = 0;
  let inserted = 0;

  for (let row = 0; row < gridRows && wardNumber < wardCount; row++) {
    for (let col = 0; col < gridCols && wardNumber < wardCount; col++) {
      wardNumber++;

      const cellMinLat = muni.min_lat + row * latStep;
      const cellMaxLat = muni.min_lat + (row + 1) * latStep;
      const cellMinLng = muni.min_lng + col * lngStep;
      const cellMaxLng = muni.min_lng + (col + 1) * lngStep;

      // Build a GeoJSON polygon for this grid cell
      const cellGeoJSON = JSON.stringify({
        type: "Polygon",
        coordinates: [[
          [cellMinLng, cellMinLat],
          [cellMaxLng, cellMinLat],
          [cellMaxLng, cellMaxLat],
          [cellMinLng, cellMaxLat],
          [cellMinLng, cellMinLat],
        ]],
      });

      const wardCode = `${muni.code}-W${String(wardNumber).padStart(2, "0")}`;
      const wardName = wardNames[wardNumber] || `Ward ${wardNumber}`;

      try {
        // Clip the grid cell to the municipality boundary via ST_Intersection
        // Only insert if the intersection is a valid polygon (not empty or point)
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
             c.geom,
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
               )
             ),
             true
           FROM clipped c
           WHERE ST_GeometryType(c.geom) IN ('ST_Polygon', 'ST_MultiPolygon')
             AND ST_Area(c.geom) > 0
           ON CONFLICT (ward_code) DO UPDATE SET
             name = EXCLUDED.name,
             municipality_id = EXCLUDED.municipality_id,
             boundary = EXCLUDED.boundary,
             boundary_metadata = EXCLUDED.boundary_metadata,
             updated_at = NOW()
           RETURNING ward_code`,
          [cellGeoJSON, muni.id, wardName, wardCode],
        );

        if (result.rowCount && result.rowCount > 0) {
          inserted++;
        }
      } catch (err) {
        console.error(`   ❌ Error inserting ${wardCode}:`, (err as Error).message);
      }
    }
  }

  return inserted;
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("🏔️  Kathmandu Valley Ward Fencing Generator");
  console.log("═══════════════════════════════════════════════════\n");

  // Verify PostGIS
  const pgResult = await pool.query("SELECT PostGIS_full_version() as v");
  console.log(`✅ PostGIS: ${pgResult.rows[0].v.slice(0, 60)}...\n`);

  // Detach all FK references to old test wards before deleting them
  const oldWardIds = `(SELECT id FROM wards WHERE ward_code ~ '^KTM-W0[1-5]$')`;
  await pool.query(`UPDATE reports SET ward_id = NULL WHERE ward_id IN ${oldWardIds}`);
  await pool.query(`UPDATE report_posts SET ward_id = NULL WHERE ward_id IN ${oldWardIds}`);
  await pool.query(`DELETE FROM ward_officers WHERE ward_id IN ${oldWardIds}`);
  await pool.query(`DELETE FROM officers WHERE ward_id IN ${oldWardIds}`);
  await pool.query(
    `UPDATE users SET ward_id = NULL WHERE ward_id::uuid IN ${oldWardIds}`,
  );
  const deleteResult = await pool.query(
    `DELETE FROM wards WHERE ward_code ~ '^KTM-W0[1-5]$'`,
  );
  console.log(`🗑️  Removed ${deleteResult.rowCount} old test wards (references detached for reassignment)\n`);

  for (const config of VALLEY_MUNICIPALITIES) {
    console.log(`─── ${config.name} (${config.wardCount} wards) ───\n`);

    const muni = await getMunicipalityBounds(config.name);
    if (!muni) {
      console.error(`   ❌ Municipality "${config.name}" not found in database. Run import first.\n`);
      continue;
    }

    console.log(`   Bounds: ${muni.min_lat.toFixed(4)},${muni.min_lng.toFixed(4)} → ${muni.max_lat.toFixed(4)},${muni.max_lng.toFixed(4)}`);
    console.log(`   Grid: ${config.gridCols}×${config.gridRows} = ${config.gridCols * config.gridRows} cells → ${config.wardCount} wards\n`);

    const inserted = await generateWards(
      muni,
      config.wardCount,
      config.gridCols,
      config.gridRows,
      config.wardNames || {},
    );

    console.log(`   ✅ Inserted ${inserted} ward polygons\n`);

    // Update total_wards
    await pool.query(
      `UPDATE municipalities SET total_wards = (
         SELECT COUNT(*) FROM wards WHERE municipality_id = $1 AND is_active = true
       ) WHERE id = $1`,
      [muni.id],
    );
  }

  // Reassign reports to new wards
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

  // Verification
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

  // Test spatial detection
  const testPoints = [
    { lat: 27.7172, lng: 85.324, label: "Kathmandu center" },
    { lat: 27.7495, lng: 85.332, label: "Dhapasi area" },
    { lat: 27.731, lng: 85.304, label: "Balaju area" },
    { lat: 27.6667, lng: 85.3167, label: "Lalitpur center" },
    { lat: 27.6710, lng: 85.4280, label: "Bhaktapur center" },
  ];

  console.log("\n   🔍 Spatial detection tests:\n");

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
      `   📍 ${test.label}: ${r ? `${r.name} (${r.ward_code}) — ${r.municipality}` : "Not found"}`,
    );
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("✅ Kathmandu Valley ward fencing complete!");
  console.log("═══════════════════════════════════════════════════\n");

  await pool.end();
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
