/**
 * Create a ward-role user for every ward in the Kathmandu Valley
 * (Kathmandu, Lalitpur, Bhaktapur) and write credentials to a text file.
 *
 * Email pattern:  {wardslug}@civicvoice.gov.np
 * Password:       ward123  (same for all, for dev/testing)
 *
 * Usage:
 *   npx tsx prisma/scripts/seed-ward-users.ts
 */

import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { writeFileSync } from "fs";
import path from "path";
import { config } from "dotenv";

config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const OUTPUT_FILE = path.resolve(__dirname, "../../ward-credentials.txt");
const PASSWORD = "ward123";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/n\.p\.$/, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20);
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("👤 Seeding Ward Users for Kathmandu Valley");
  console.log("═══════════════════════════════════════════════════\n");

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // Get all valley wards
  const { rows: wards } = await pool.query<{
    id: string;
    name: string;
    ward_code: string;
    municipality_id: string;
    municipality_name: string;
  }>(
    `SELECT w.id, w.name, w.ward_code, w.municipality_id, m.name AS municipality_name
     FROM wards w
     JOIN municipalities m ON m.id = w.municipality_id
     WHERE m.name IN ('Kathmandu', 'Lalitpur', 'Bhaktapur')
       AND w.is_active = true
     ORDER BY m.name, w.ward_code`,
  );

  console.log(`Found ${wards.length} wards across 3 municipalities\n`);

  const credentials: Array<{
    municipality: string;
    ward: string;
    wardCode: string;
    email: string;
    password: string;
  }> = [];

  const usedEmails = new Set<string>();
  let created = 0;
  let updated = 0;

  for (const ward of wards) {
    // Build unique email
    const munPrefix = ward.municipality_name.toLowerCase().slice(0, 3);
    let slug = slugify(ward.name);
    let email = `${munPrefix}.${slug}@civicvoice.gov.np`;

    // Ensure uniqueness
    if (usedEmails.has(email)) {
      const codeNum = ward.ward_code.replace(/.*-W/, "");
      email = `${munPrefix}.${slug}${codeNum}@civicvoice.gov.np`;
    }
    usedEmails.add(email);

    const userName = `${ward.name} Ward Office`;

    // Upsert user
    const { rows: existing } = await pool.query(
      `SELECT id FROM users WHERE email = $1`,
      [email],
    );

    if (existing.length > 0) {
      await pool.query(
        `UPDATE users SET
           name = $1, ward_id = $2, role = 'ward', is_active = true,
           must_change_password = false, municipality_id = $3, updated_at = NOW()
         WHERE email = $4`,
        [userName, ward.id, ward.municipality_id, email],
      );
      updated++;
    } else {
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role, is_active, must_change_password, ward_id, municipality_id)
         VALUES ($1, $2, $3, 'ward', true, false, $4, $5)`,
        [userName, email, passwordHash, ward.id, ward.municipality_id],
      );
      created++;
    }

    credentials.push({
      municipality: ward.municipality_name,
      ward: ward.name,
      wardCode: ward.ward_code,
      email,
      password: PASSWORD,
    });
  }

  console.log(`✅ Ward users: created ${created}, updated ${updated}\n`);

  // ─── Also create municipality-level users for all 3 valley municipalities ───
  console.log("─── Municipality Users ───\n");

  const MUNI_PASSWORD = "municipality123";
  const muniPasswordHash = await bcrypt.hash(MUNI_PASSWORD, 12);

  const { rows: munis } = await pool.query<{
    id: string;
    name: string;
    code: string;
  }>(
    `SELECT id, name, code FROM municipalities
     WHERE name IN ('Kathmandu', 'Lalitpur', 'Bhaktapur') AND is_active = true
     ORDER BY name`,
  );

  const muniCredentials: Array<{
    municipality: string;
    code: string;
    email: string;
    password: string;
  }> = [];

  for (const muni of munis) {
    const muniSlug = muni.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const email = `municipality.${muniSlug}@civicvoice.gov.np`;
    const userName = `${muni.name} Municipality Office`;

    const { rows: existing } = await pool.query(
      `SELECT id FROM users WHERE email = $1`,
      [email],
    );

    if (existing.length > 0) {
      await pool.query(
        `UPDATE users SET
           name = $1, role = 'municipality', is_active = true,
           must_change_password = false, municipality_id = $2, ward_id = NULL, updated_at = NOW()
         WHERE email = $3`,
        [userName, muni.id, email],
      );
      console.log(`   ⏭️  Updated: ${email}`);
    } else {
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role, is_active, must_change_password, municipality_id)
         VALUES ($1, $2, $3, 'municipality', true, false, $4)`,
        [userName, email, muniPasswordHash, muni.id],
      );
      console.log(`   ✅ Created: ${email}`);
    }

    muniCredentials.push({
      municipality: muni.name,
      code: muni.code,
      email,
      password: MUNI_PASSWORD,
    });
  }

  console.log("");

  // ─── Write credentials file ───
  const lines: string[] = [
    "═══════════════════════════════════════════════════════════════════",
    " CIVIC VOICE — Ward Login Credentials (Kathmandu Valley)",
    " Generated: " + new Date().toISOString().slice(0, 10),
    " Password for ALL wards: " + PASSWORD,
    "═══════════════════════════════════════════════════════════════════",
    "",
  ];

  let currentMun = "";
  for (const cred of credentials) {
    if (cred.municipality !== currentMun) {
      currentMun = cred.municipality;
      lines.push("───────────────────────────────────────────────────────────────────");
      lines.push(` ${currentMun.toUpperCase()} (${credentials.filter(c => c.municipality === currentMun).length} wards)`);
      lines.push("───────────────────────────────────────────────────────────────────");
      lines.push(
        " " +
          "Ward".padEnd(28) +
          "Code".padEnd(30) +
          "Email",
      );
      lines.push(
        " " + "─".repeat(27) + " " + "─".repeat(29) + " " + "─".repeat(40),
      );
    }
    lines.push(
      " " +
        cred.ward.padEnd(28) +
        cred.wardCode.padEnd(30) +
        cred.email,
    );
  }

  lines.push("");
  lines.push("═══════════════════════════════════════════════════════════════════");
  lines.push(" MUNICIPALITY USERS");
  lines.push("═══════════════════════════════════════════════════════════════════");
  lines.push(
    " " +
      "Municipality".padEnd(22) +
      "Email".padEnd(48) +
      "Password",
  );
  lines.push(
    " " + "─".repeat(21) + " " + "─".repeat(47) + " " + "─".repeat(16),
  );
  for (const mc of muniCredentials) {
    lines.push(
      " " +
        mc.municipality.padEnd(22) +
        mc.email.padEnd(48) +
        mc.password,
    );
  }

  lines.push("");
  lines.push("═══════════════════════════════════════════════════════════════════");
  lines.push(" ADMIN / GLOBAL USERS");
  lines.push("═══════════════════════════════════════════════════════════════════");
  lines.push(` Admin:        admin@civicvoice.gov.np / admin123`);
  lines.push(` Municipality: municipality@civicvoice.gov.np / municipality123`);
  lines.push("");
  lines.push("═══════════════════════════════════════════════════════════════════");
  lines.push(` Total: ${credentials.length} ward accounts + ${muniCredentials.length} municipality accounts`);
  lines.push(` Ward password: ${PASSWORD}`);
  lines.push(` Municipality password: ${MUNI_PASSWORD}`);
  lines.push("═══════════════════════════════════════════════════════════════════");

  const fileContent = lines.join("\n");
  writeFileSync(OUTPUT_FILE, fileContent, "utf-8");

  console.log(`📄 Credentials written to: ${OUTPUT_FILE}\n`);

  // Print summary
  const muniNames = [...new Set(credentials.map((c) => c.municipality))];
  for (const m of muniNames) {
    const count = credentials.filter((c) => c.municipality === m).length;
    console.log(`   ${m}: ${count} ward users`);
  }

  console.log(`\n   Total: ${credentials.length} ward users`);
  console.log(`   Password: ${PASSWORD}\n`);

  console.log("═══════════════════════════════════════════════════");
  console.log("✅ Done!");
  console.log("═══════════════════════════════════════════════════\n");

  await pool.end();
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
