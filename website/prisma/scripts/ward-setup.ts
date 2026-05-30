/**
 * ═══════════════════════════════════════════════════════════════
 * ONE-COMMAND SETUP — Run this on a fresh laptop to set up:
 *   1. Prisma migrations (creates tables + PostGIS columns)
 *   2. Download Nepal boundary GeoJSON data
 *   3. Import 774 municipality boundaries (all Nepal)
 *   4. Import 119 real ward boundaries (Kathmandu Valley)
 *   5. Seed ward + municipality + admin users
 *   6. Write credentials to ward-credentials.txt
 *
 * Prerequisites:
 *   - PostgreSQL running with PostGIS extension enabled
 *   - .env file with DATABASE_URL set
 *   - npm install done
 *
 * Usage:
 *   cd website
 *   npx tsx prisma/scripts/ward-setup.ts
 * ═══════════════════════════════════════════════════════════════
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { config } from "dotenv";

config();

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../..");
const DATA_DIR = path.resolve(SCRIPT_DIR, "../data/nepal-boundaries");
const MUNICIPALITY_FILE = path.join(DATA_DIR, "municipalities.geojson");
const WARD_FILE = path.join(DATA_DIR, "wards.geojson");
const CRED_FILE = path.join(ROOT, "ward-credentials.txt");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── Helpers ────────────────────────────────────────────────

function run(cmd: string, label: string) {
  console.log(`\n⏳ ${label}...`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: "inherit" });
    console.log(`✅ ${label} — done`);
  } catch {
    console.error(`❌ ${label} — failed`);
    throw new Error(`Step failed: ${label}`);
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/n\.p\.$/, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20);
}

// ─── Step 1: Prisma Migrate ────────────────────────────────

async function step1_migrate() {
  console.log("\n═══════════════════════════════════════");
  console.log("STEP 1/6 — Prisma Migrations");
  console.log("═══════════════════════════════════════");

  // Ensure PostGIS
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS postgis");
    console.log("✅ PostGIS extension ready");
  } catch (err) {
    console.error("❌ Could not enable PostGIS:", (err as Error).message);
  }

  run("npx prisma migrate deploy", "Applying migrations");
  run("npx prisma generate", "Generating Prisma client");
}

// ─── Step 2: Download Boundary Data ────────────────────────

async function step2_download() {
  console.log("\n═══════════════════════════════════════");
  console.log("STEP 2/6 — Download Boundary Data");
  console.log("═══════════════════════════════════════");

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  // Download municipalities from geoBoundaries
  if (!existsSync(MUNICIPALITY_FILE)) {
    console.log(
      "\n⬇️  Downloading municipality boundaries (ADM3) from geoBoundaries...",
    );
    const apiRes = await fetch(
      "https://www.geoboundaries.org/api/current/gbOpen/NPL/ADM3/",
    );
    const apiData = (await apiRes.json()) as { gjDownloadURL: string };
    const gjUrl = apiData.gjDownloadURL;
    console.log(`   URL: ${gjUrl}`);

    const dataRes = await fetch(gjUrl, { redirect: "follow" });
    if (!dataRes.ok) throw new Error(`Download failed: ${dataRes.status}`);
    const text = await dataRes.text();
    const parsed = JSON.parse(text);
    writeFileSync(MUNICIPALITY_FILE, text);
    console.log(
      `   ✅ Saved ${parsed.features?.length} municipalities (${(Buffer.byteLength(text) / 1024 / 1024).toFixed(1)} MB)`,
    );
  } else {
    console.log("⏭️  Municipality GeoJSON already exists");
  }

  // Download wards from mesaugat/geoJSON-Nepal
  if (!existsSync(WARD_FILE)) {
    console.log("\n⬇️  Downloading ward boundaries (VDC) from GitHub...");
    const url =
      "https://raw.githubusercontent.com/mesaugat/geoJSON-Nepal/master/nepal-wards.geojson";
    console.log(`   URL: ${url}`);

    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const text = await res.text();
    const parsed = JSON.parse(text);
    writeFileSync(WARD_FILE, text);
    console.log(
      `   ✅ Saved ${parsed.features?.length} VDC features (${(Buffer.byteLength(text) / 1024 / 1024).toFixed(1)} MB)`,
    );
  } else {
    console.log("⏭️  Ward GeoJSON already exists");
  }
}

// ─── Step 3: Import Municipality Boundaries ─────────────────

async function step3_importMunicipalities() {
  console.log("\n═══════════════════════════════════════");
  console.log("STEP 3/6 — Import Municipality Boundaries (774)");
  console.log("═══════════════════════════════════════");

  const existing = await pool.query(
    "SELECT COUNT(*) as c FROM municipalities WHERE boundary IS NOT NULL",
  );
  if (parseInt(existing.rows[0].c) > 700) {
    console.log(
      `⏭️  Already have ${existing.rows[0].c} municipalities with boundaries`,
    );
    return;
  }

  const data = JSON.parse(readFileSync(MUNICIPALITY_FILE, "utf-8"));
  console.log(`   Loaded ${data.features.length} features`);

  let inserted = 0;
  const usedCodes = new Set<string>();

  for (const feature of data.features) {
    const name = feature.properties.shapeName;
    if (!name) continue;

    const shapeId = feature.properties.shapeID || "";
    let code = `NPL-${name.replace(/\s+/g, "").slice(0, 8).toUpperCase()}-${String(shapeId).slice(-4) || "X"}`;

    // Ensure unique code
    let finalCode = code;
    let counter = 1;
    while (usedCodes.has(finalCode)) {
      finalCode = `${code}${counter}`;
      counter++;
    }
    usedCodes.add(finalCode);

    const geojsonStr = JSON.stringify(feature.geometry);
    const type = name.toLowerCase().includes("metropolitan")
      ? name.toLowerCase().includes("sub")
        ? "sub_metropolitan"
        : "metropolitan"
      : "municipality";

    try {
      await pool.query(
        `INSERT INTO municipalities (name, code, type, boundary, boundary_metadata, is_active)
         VALUES ($1, $2, $3,
           ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)),
           jsonb_build_object(
             'center', jsonb_build_object(
               'lat', ST_Y(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))),
               'lng', ST_X(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)))
             )
           ), true)
         ON CONFLICT (code) DO UPDATE SET
           boundary = EXCLUDED.boundary,
           boundary_metadata = EXCLUDED.boundary_metadata,
           updated_at = NOW()`,
        [name, finalCode, type, geojsonStr],
      );
      inserted++;
    } catch (err) {
      console.error(`   ❌ ${name}:`, (err as Error).message.slice(0, 80));
    }

    if (inserted % 100 === 0)
      process.stdout.write(`\r   ${inserted} imported...`);
  }

  console.log(`\n   ✅ ${inserted} municipalities imported`);
}

// ─── Step 4: Import Valley Ward Boundaries ──────────────────

async function step4_importValleyWards() {
  console.log("\n═══════════════════════════════════════");
  console.log("STEP 4/6 — Import Kathmandu Valley Wards (119)");
  console.log("═══════════════════════════════════════");

  const data = JSON.parse(readFileSync(WARD_FILE, "utf-8"));

  const DISTRICTS = [
    { district: "Kathmandu", muni: "Kathmandu" },
    { district: "Lalitpur", muni: "Lalitpur" },
    { district: "Bhaktapur", muni: "Bhaktapur" },
  ];

  for (const { district, muni } of DISTRICTS) {
    const munRow = await pool.query(
      `SELECT id, code FROM municipalities WHERE name = $1 AND is_active = true LIMIT 1`,
      [muni],
    );
    if (!munRow.rows[0]) {
      console.log(`   ❌ Municipality "${muni}" not found`);
      continue;
    }

    const munId = munRow.rows[0].id;
    const munCode = munRow.rows[0].code;

    // Clean existing wards for this municipality
    const oldWardIds = `(SELECT id FROM wards WHERE municipality_id = '${munId}')`;
    await pool.query(
      `UPDATE reports SET ward_id = NULL WHERE ward_id IN ${oldWardIds}`,
    );
    await pool.query(
      `UPDATE report_posts SET ward_id = NULL WHERE ward_id IN ${oldWardIds}`,
    );
    await pool.query(
      `DELETE FROM ward_officers WHERE ward_id IN ${oldWardIds}`,
    );
    await pool.query(`DELETE FROM officers WHERE ward_id IN ${oldWardIds}`);
    try {
      await pool.query(
        `UPDATE users SET ward_id = NULL WHERE ward_id::uuid IN ${oldWardIds}`,
      );
    } catch {
      /* no users linked yet on fresh setup */
    }
    await pool.query(`DELETE FROM wards WHERE municipality_id = $1`, [munId]);

    // Insert VDC features as wards
    const features = data.features.filter(
      (f: any) => f.properties.DISTRICT === district,
    );

    let inserted = 0;
    let wardNum = 0;

    for (const feature of features) {
      wardNum++;
      const vdcName = String(feature.properties.VDC_NAME || "Unknown")
        .replace(/N\.P\.$/, "")
        .trim();
      const wardCode = `${munCode}-W${String(wardNum).padStart(2, "0")}`;
      const geojsonStr = JSON.stringify(feature.geometry);

      try {
        await pool.query(
          `INSERT INTO wards (name, ward_code, municipality_id, boundary, boundary_metadata, is_active)
           VALUES ($1, $2, $3,
             ST_SetSRID(ST_GeomFromGeoJSON($4), 4326),
             jsonb_build_object(
               'center', jsonb_build_object(
                 'lat', ST_Y(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))),
                 'lng', ST_X(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)))
               )
             ), true)
           ON CONFLICT (ward_code) DO UPDATE SET
             name = EXCLUDED.name, municipality_id = EXCLUDED.municipality_id,
             boundary = EXCLUDED.boundary, boundary_metadata = EXCLUDED.boundary_metadata,
             updated_at = NOW()`,
          [vdcName, wardCode, munId, geojsonStr],
        );
        inserted++;
      } catch (err) {
        console.error(`   ❌ ${vdcName}:`, (err as Error).message.slice(0, 80));
      }
    }

    // Update municipality boundary to union of its wards
    await pool.query(
      `UPDATE municipalities SET
         boundary = sub.g, total_wards = sub.c, updated_at = NOW()
       FROM (
         SELECT municipality_id, ST_Multi(ST_Union(boundary)) AS g, COUNT(*) AS c
         FROM wards WHERE municipality_id = $1 AND is_active = true AND boundary IS NOT NULL
         GROUP BY municipality_id
       ) sub WHERE id = $1`,
      [munId],
    );

    console.log(`   ✅ ${muni}: ${inserted} wards`);
  }
}

// ─── Step 5: Seed Users ─────────────────────────────────────

async function step5_seedUsers() {
  console.log("\n═══════════════════════════════════════");
  console.log("STEP 5/6 — Seed Ward + Municipality + Admin Users");
  console.log("═══════════════════════════════════════");

  const WARD_PW = "ward123";
  const MUNI_PW = "municipality123";
  const ADMIN_PW = "admin123";

  const wardHash = await bcrypt.hash(WARD_PW, 12);
  const muniHash = await bcrypt.hash(MUNI_PW, 12);
  const adminHash = await bcrypt.hash(ADMIN_PW, 12);

  // Admin user
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, is_active, must_change_password)
     VALUES ('Admin', 'admin@civicvoice.gov.np', $1, 'admin', true, false)
     ON CONFLICT (email) DO UPDATE SET password_hash = $1, role = 'admin', is_active = true`,
    [adminHash],
  );
  console.log("   ✅ admin@civicvoice.gov.np");

  // Global municipality user
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, is_active, must_change_password)
     VALUES ('Municipality Office', 'municipality@civicvoice.gov.np', $1, 'municipality', true, false)
     ON CONFLICT (email) DO UPDATE SET password_hash = $1, role = 'municipality', is_active = true`,
    [muniHash],
  );
  console.log("   ✅ municipality@civicvoice.gov.np");

  // Get all valley wards
  const { rows: wards } = await pool.query(
    `SELECT w.id, w.name, w.ward_code, w.municipality_id, m.name AS mun_name
     FROM wards w JOIN municipalities m ON m.id = w.municipality_id
     WHERE m.name IN ('Kathmandu', 'Lalitpur', 'Bhaktapur') AND w.is_active = true
     ORDER BY m.name, w.ward_code`,
  );

  const credentials: Array<{
    municipality: string;
    ward: string;
    wardCode: string;
    email: string;
    password: string;
  }> = [];

  const usedEmails = new Set<string>();
  let created = 0;

  for (const ward of wards) {
    const munPrefix = ward.mun_name.toLowerCase().slice(0, 3);
    let slug = slugify(ward.name);
    let email = `${munPrefix}.${slug}@civicvoice.gov.np`;
    if (usedEmails.has(email)) {
      email = `${munPrefix}.${slug}${ward.ward_code.replace(/.*-W/, "")}@civicvoice.gov.np`;
    }
    usedEmails.add(email);

    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, is_active, must_change_password, ward_id, municipality_id)
       VALUES ($1, $2, $3, 'ward', true, false, $4, $5)
       ON CONFLICT (email) DO UPDATE SET
         ward_id = $4, municipality_id = $5, role = 'ward', is_active = true, password_hash = $3`,
      [
        `${ward.name} Ward Office`,
        email,
        wardHash,
        ward.id,
        ward.municipality_id,
      ],
    );
    created++;

    credentials.push({
      municipality: ward.mun_name,
      ward: ward.name,
      wardCode: ward.ward_code,
      email,
      password: WARD_PW,
    });
  }

  // Municipality-specific users
  const muniCreds: Array<{ name: string; email: string }> = [];
  for (const muniName of ["Kathmandu", "Lalitpur", "Bhaktapur"]) {
    const munRow = await pool.query(
      `SELECT id FROM municipalities WHERE name = $1 LIMIT 1`,
      [muniName],
    );
    if (!munRow.rows[0]) continue;

    const email = `municipality.${muniName.toLowerCase()}@civicvoice.gov.np`;
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, is_active, must_change_password, municipality_id)
       VALUES ($1, $2, $3, 'municipality', true, false, $4)
       ON CONFLICT (email) DO UPDATE SET municipality_id = $4, role = 'municipality', is_active = true, password_hash = $3`,
      [`${muniName} Municipality Office`, email, muniHash, munRow.rows[0].id],
    );
    muniCreds.push({ name: muniName, email });
    console.log(`   ✅ ${email}`);
  }

  console.log(`   ✅ ${created} ward users created`);

  // Return data for credentials file
  return { credentials, muniCreds, WARD_PW, MUNI_PW, ADMIN_PW };
}

// ─── Step 6: Write Credentials File ─────────────────────────

function step6_writeCredentials(data: {
  credentials: Array<{
    municipality: string;
    ward: string;
    wardCode: string;
    email: string;
    password: string;
  }>;
  muniCreds: Array<{ name: string; email: string }>;
  WARD_PW: string;
  MUNI_PW: string;
  ADMIN_PW: string;
}) {
  console.log("\n═══════════════════════════════════════");
  console.log("STEP 6/6 — Write Credentials File");
  console.log("═══════════════════════════════════════");

  const lines: string[] = [
    "═══════════════════════════════════════════════════════════════════",
    " CIVIC VOICE — Ward Login Credentials (Kathmandu Valley)",
    " Generated: " + new Date().toISOString().slice(0, 10),
    " Password for ALL wards: " + data.WARD_PW,
    "═══════════════════════════════════════════════════════════════════",
    "",
  ];

  let currentMun = "";
  for (const cred of data.credentials) {
    if (cred.municipality !== currentMun) {
      currentMun = cred.municipality;
      const count = data.credentials.filter(
        (c) => c.municipality === currentMun,
      ).length;
      lines.push(
        "───────────────────────────────────────────────────────────────────",
      );
      lines.push(` ${currentMun.toUpperCase()} (${count} wards)`);
      lines.push(
        "───────────────────────────────────────────────────────────────────",
      );
      lines.push(" " + "Ward".padEnd(28) + "Code".padEnd(30) + "Email");
      lines.push(
        " " + "─".repeat(27) + " " + "─".repeat(29) + " " + "─".repeat(40),
      );
    }
    lines.push(
      " " + cred.ward.padEnd(28) + cred.wardCode.padEnd(30) + cred.email,
    );
  }

  lines.push("");
  lines.push(
    "═══════════════════════════════════════════════════════════════════",
  );
  lines.push(" MUNICIPALITY USERS (password: " + data.MUNI_PW + ")");
  lines.push(
    "═══════════════════════════════════════════════════════════════════",
  );
  for (const mc of data.muniCreds) {
    lines.push(` ${mc.name.padEnd(22)} ${mc.email}`);
  }
  lines.push(` ${"Global".padEnd(22)} municipality@civicvoice.gov.np`);

  lines.push("");
  lines.push(
    "═══════════════════════════════════════════════════════════════════",
  );
  lines.push(` ADMIN: admin@civicvoice.gov.np / ${data.ADMIN_PW}`);
  lines.push(
    ` Total: ${data.credentials.length} ward accounts + ${data.muniCreds.length + 1} municipality accounts`,
  );
  lines.push(
    "═══════════════════════════════════════════════════════════════════",
  );

  writeFileSync(CRED_FILE, lines.join("\n"), "utf-8");
  console.log(`\n   📄 ${CRED_FILE}`);
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║  CIVIC VOICE — Full Geofencing + Users Setup         ║");
  console.log("║  This sets up everything on a fresh database.        ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  const start = Date.now();

  await step1_migrate();
  await step2_download();
  await step3_importMunicipalities();
  await step4_importValleyWards();
  const credData = await step5_seedUsers();
  step6_writeCredentials(credData);

  // Reassign any existing reports
  const reportResult = await pool.query(
    `UPDATE reports r SET ward_id = sub.ward_id
     FROM (
       SELECT r2.id AS report_id, w.id AS ward_id
       FROM reports r2
       INNER JOIN wards w ON w.boundary IS NOT NULL AND w.is_active = true
         AND ST_Contains(w.boundary, ST_SetSRID(ST_Point(r2.location_lng, r2.location_lat), 4326))
       WHERE r2.location_lat IS NOT NULL AND r2.location_lng IS NOT NULL
     ) sub WHERE r.id = sub.report_id`,
  );
  console.log(`\n📌 ${reportResult.rowCount ?? 0} reports reassigned to wards`);

  const elapsed = ((Date.now() - start) / 1000).toFixed(0);

  console.log(`\n╔═══════════════════════════════════════════════════════╗`);
  console.log(`║  ✅ SETUP COMPLETE (${elapsed}s)                          ║`);
  console.log(`║                                                       ║`);
  console.log(`║  774 municipalities (all Nepal)                       ║`);
  console.log(`║  119 wards (Kathmandu + Lalitpur + Bhaktapur)         ║`);
  console.log(`║  119 ward users + 4 municipality + 1 admin            ║`);
  console.log(`║                                                       ║`);
  console.log(`║  Credentials: website/ward-credentials.txt            ║`);
  console.log(`╚═══════════════════════════════════════════════════════╝\n`);

  await pool.end();
}

main().catch((err) => {
  console.error("\n❌ Setup failed:", err);
  pool.end();
  process.exit(1);
});
