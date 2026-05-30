import { PrismaClient } from "@/app/generated/prisma/client";
import { WARD_BOUNDARIES } from "./data/ward-boundaries";
import { DEFAULT_KANBAN_COLUMNS } from "./data/default-kanban-columns";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(
  pool as unknown as ConstructorParameters<typeof PrismaPg>[0],
);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("🌍 Seeding Ward Boundaries + Users");
  console.log("═══════════════════════════════════════\n");

  // ─── 1. Verify PostGIS is available ────────────────
  try {
    const postgisCheck = await prisma.$queryRawUnsafe<
      { postgis_full_version: string }[]
    >(`SELECT PostGIS_full_version() as postgis_full_version`);

    console.log(
      `✅ PostGIS: ${postgisCheck[0].postgis_full_version.slice(0, 60)}...\n`,
    );
  } catch {
    console.error("❌ PostGIS is not installed. Run:");
    console.error("   CREATE EXTENSION postgis;");
    process.exit(1);
  }

  // ─── 2. Ensure Kanban Columns Exist ────────────────
  const columns = [
    {
      name: "Incoming",
      position: 0,
      color: "#6b7280",
      deadline_days: 2,
      is_terminal: false,
      mapped_status: "incoming" as const,
      is_default: true,
      role_access: ["ward", "municipality", "admin"] as const,
    },
    {
      name: "In Progress",
      position: 1,
      color: "#f59e0b",
      deadline_days: 7,
      is_terminal: false,
      mapped_status: "in_progress" as const,
      is_default: true,
      role_access: ["ward", "municipality", "admin"] as const,
    },
    {
      name: "Completed",
      position: 2,
      color: "#10b981",
      deadline_days: null,
      is_terminal: true,
      mapped_status: "completed" as const,
      is_default: true,
      role_access: ["ward", "municipality", "admin"] as const,
    },
    {
      name: "Invalid",
      position: 3,
      color: "#ef4444",
      deadline_days: null,
      is_terminal: true,
      mapped_status: "invalid" as const,
      is_default: true,
      role_access: ["ward", "municipality", "admin"] as const,
    },
  ];

  console.log("📋 Ensuring default Kanban columns exist...\n");

  for (const col of columns) {
    const existing = await prisma.kanban_columns.findFirst({
      where: { name: col.name },
    });

    if (!existing) {
      await prisma.kanban_columns.create({
        data: {
          name: col.name,
          position: col.position,
          color: col.color,
          deadline_days: col.deadline_days,
          is_terminal: col.is_terminal,
          mapped_status: col.mapped_status,
          is_default: col.is_default,
          role_access: [...col.role_access],
        },
      });
      console.log(`   ✅ ${col.name}`);
    } else {
      await prisma.kanban_columns.update({
        where: { id: existing.id },
        data: {
          position: col.position,
          color: col.color,
          deadline_days: col.deadline_days,
          is_terminal: col.is_terminal,
          mapped_status: col.mapped_status,
          is_default: col.is_default,
          role_access: [...col.role_access],
        },
      });
      console.log(`   ⏭️  ${col.name} already exists, updated config`);
    }
  }

  await prisma.kanban_columns.deleteMany({
    where: { is_default: true },
  });

  for (const col of DEFAULT_KANBAN_COLUMNS) {
    await prisma.kanban_columns.create({
      data: {
        name: col.name,
        position: col.position,
        color: col.color,
        deadline_days: col.deadline_days,
        is_terminal: col.is_terminal,
        mapped_status: col.mapped_status,
        is_default: col.is_default,
        role_access: [...col.role_access],
      },
    });
  }

  console.log("");

  // ─── 3. Insert Ward Boundaries ─────────────────────
  console.log("🗺️  Inserting ward boundaries...\n");

  const wardIds: Record<string, string> = {};

  for (const ward of WARD_BOUNDARIES) {
    const upserted = await prisma.wards.upsert({
      where: { ward_code: ward.ward_code },
      update: {
        name: ward.name,
        contact_email: ward.contact_email,
        contact_phone: ward.contact_phone,
        is_active: true,
      },
      create: {
        name: ward.name,
        ward_code: ward.ward_code,
        contact_email: ward.contact_email,
        contact_phone: ward.contact_phone,
        default_deadline_days: 7,
        is_active: true,
      },
    });

    const geojsonStr = JSON.stringify(ward.geojson);

    await prisma.$executeRawUnsafe(
      `UPDATE wards
       SET boundary = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326),
           boundary_metadata = $2::jsonb
       WHERE id = $3::uuid`,
      geojsonStr,
      JSON.stringify({
        center: {
          lat:
            (ward.geojson.coordinates[0][0][1] +
              ward.geojson.coordinates[0][2][1]) /
            2,
          lng:
            (ward.geojson.coordinates[0][0][0] +
              ward.geojson.coordinates[0][2][0]) /
            2,
        },
        bbox: {
          sw: {
            lat: ward.geojson.coordinates[0][0][1],
            lng: ward.geojson.coordinates[0][0][0],
          },
          ne: {
            lat: ward.geojson.coordinates[0][2][1],
            lng: ward.geojson.coordinates[0][2][0],
          },
        },
      }),
      upserted.id,
    );

    wardIds[ward.ward_code] = upserted.id;

    const verification = await prisma.$queryRawUnsafe<
      { has_boundary: boolean }[]
    >(
      `SELECT boundary IS NOT NULL as has_boundary
       FROM wards
       WHERE id = $1::uuid`,
      upserted.id,
    );

    const status = verification[0]?.has_boundary ? "✅" : "❌";
    console.log(
      `   ${status} ${ward.name} (${ward.ward_code}) → ${upserted.id.slice(0, 8)}...`,
    );
  }

  console.log("");

  // ─── 4. Verify spatial detection works ─────────────
  console.log("🔍 Verifying spatial detection...\n");

  const testCoords = [
    { lat: 27.7497582, lng: 85.3321581, expected: "Dhapasi" },
    { lat: 27.731, lng: 85.3045, expected: "Balaju" },
    { lat: 27.718, lng: 85.324, expected: "Lazimpat" },
    { lat: 27.715, lng: 85.312, expected: "Thamel" },
    { lat: 27.694, lng: 85.339, expected: "New Baneshwor" },
    { lat: 27.6, lng: 85.2, expected: "NONE (outside all wards)" },
  ];

  for (const test of testCoords) {
    const result = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(
      `SELECT id, name
       FROM wards
       WHERE boundary IS NOT NULL
         AND is_active = true
         AND ST_Contains(boundary, ST_SetSRID(ST_Point($1, $2), 4326))
       LIMIT 1`,
      test.lng,
      test.lat,
    );

    const detected = result[0]?.name || "NONE";
    const match =
      detected === test.expected ||
      (detected === "NONE" && test.expected.includes("NONE"));

    console.log(
      `   ${match ? "✅" : "❌"} (${test.lat}, ${test.lng}) → ${detected} (expected: ${test.expected})`,
    );
  }

  console.log("");

  // ─── 5. Create/Update Dashboard Users ──────────────
  console.log("👤 Setting up dashboard users...\n");

  const dhapasiWardId = wardIds["KTM-W01"];

  const wardPassword = await bcrypt.hash("ward123", 12);
  const municipalityPassword = await bcrypt.hash("municipality123", 12);
  const adminPassword = await bcrypt.hash("admin123", 12);

  const wardUser = await prisma.users.upsert({
    where: { email: "ward1@civicvoice.gov.np" },
    update: {
      name: "Ward-01 Kathmandu",
      ward_id: dhapasiWardId,
      role: "ward",
      is_active: true,
      must_change_password: false,
    },
    create: {
      name: "Ward-01 Kathmandu",
      email: "ward1@civicvoice.gov.np",
      password_hash: wardPassword,
      role: "ward",
      is_active: true,
      must_change_password: false,
      ward_id: dhapasiWardId,
    },
  });
  console.log(`   ✅ Ward User: ${wardUser.email} → Ward: Dhapasi`);

  const municipalityUser = await prisma.users.upsert({
    where: { email: "municipality@civicvoice.gov.np" },
    update: {
      ward_id: null,
      role: "municipality",
      is_active: true,
      must_change_password: false,
    },
    create: {
      name: "Ram Prasad Sharma",
      email: "municipality@civicvoice.gov.np",
      password_hash: municipalityPassword,
      role: "municipality",
      is_active: true,
      must_change_password: false,
      ward_id: null,
    },
  });
  console.log(`   ✅ Municipality User: ${municipalityUser.email}`);

  const adminUser = await prisma.users.upsert({
    where: { email: "admin@civicvoice.gov.np" },
    update: {
      ward_id: null,
      role: "admin",
      is_active: true,
      must_change_password: false,
    },
    create: {
      name: "Sita Devi Thapa",
      email: "admin@civicvoice.gov.np",
      password_hash: adminPassword,
      role: "admin",
      is_active: true,
      must_change_password: false,
      ward_id: null,
    },
  });
  console.log(`   ✅ Admin User: ${adminUser.email}`);

  console.log("");

  // ─── 6. Optional Ward Officer Entry ────────────────
  console.log("🧑‍💼 Setting up ward officer entry...\n");

  const existingWardOfficer = await prisma.ward_officers.findFirst({
    where: {
      ward_id: dhapasiWardId,
      email: "officer1@civicvoice.gov.np",
    },
  });

  if (!existingWardOfficer && dhapasiWardId) {
    const wardOfficer = await prisma.ward_officers.create({
      data: {
        ward_id: dhapasiWardId,
        name: "Shyam Lal Adhikari",
        email: "officer1@civicvoice.gov.np",
        phone: "9800000002",
        designation: "Ward Officer",
      },
    });

    console.log(`   ✅ Ward Officer: ${wardOfficer.name}`);
  } else if (existingWardOfficer) {
    console.log(
      `   ⏭️  Ward Officer already exists: ${existingWardOfficer.email}`,
    );
  }

  console.log("");

  // ─── 7. Backfill Existing Reports ──────────────────
  console.log("🔧 Backfilling existing reports...\n");

  const wardBackfill = await prisma.$executeRaw`
    UPDATE reports r
    SET ward_id = (
      SELECT w.id
      FROM wards w
      WHERE w.boundary IS NOT NULL
        AND w.is_active = true
        AND ST_Contains(
          w.boundary,
          ST_SetSRID(ST_Point(r.location_lng, r.location_lat), 4326)
        )
      LIMIT 1
    ),
    ward_received_at = COALESCE(r.ward_received_at, r.created_at)
    WHERE r.ward_id IS NULL
      AND r.location_lat IS NOT NULL
      AND r.location_lng IS NOT NULL
  `;
  console.log(`   ✅ Ward assigned to ${wardBackfill} report(s)`);

  const kanbanBackfill = await prisma.$executeRaw`
    UPDATE reports r
    SET kanban_column_id = (
      SELECT kc.id
      FROM kanban_columns kc
      WHERE kc.mapped_status = r.status
        AND kc.role_access @> ARRAY['ward']::user_role[]
      ORDER BY kc.position ASC
      LIMIT 1
    )
    WHERE r.kanban_column_id IS NULL
  `;
  console.log(`   ✅ Kanban column assigned to ${kanbanBackfill} report(s)`);

  const deadlineBackfill = await prisma.$executeRaw`
    UPDATE reports r
    SET ward_deadline_at = r.created_at + (COALESCE(kc.deadline_days, 7) * INTERVAL '1 day')
    FROM kanban_columns kc
    WHERE r.kanban_column_id = kc.id
      AND r.ward_deadline_at IS NULL
      AND kc.deadline_days IS NOT NULL
  `;
  console.log(`   ✅ Deadline set for ${deadlineBackfill} report(s)`);

  console.log("");

  // ─── 8. Final Verification ─────────────────────────
  console.log("📊 Final verification...\n");

  const totalWards = await prisma.wards.count();
  const totalReports = await prisma.reports.count();
  const reportsWithWard = await prisma.reports.count({
    where: { ward_id: { not: null } },
  });
  const reportsWithKanban = await prisma.reports.count({
    where: { kanban_column_id: { not: null } },
  });
  const reportsInDhapasi = dhapasiWardId
    ? await prisma.reports.count({
        where: { ward_id: dhapasiWardId },
      })
    : 0;

  console.log(`   Wards:                    ${totalWards}`);
  console.log(`   Total Reports:            ${totalReports}`);
  console.log(
    `   Reports with ward:        ${reportsWithWard}/${totalReports}`,
  );
  console.log(
    `   Reports with kanban col:  ${reportsWithKanban}/${totalReports}`,
  );
  console.log(`   Reports in Dhapasi (W01): ${reportsInDhapasi}`);

  console.log("\n═══════════════════════════════════════");
  console.log("🎉 Ward boundary seeding complete!");
  console.log("═══════════════════════════════════════");
  console.log("\nLogin credentials:");
  console.log("───────────────────────────────────────");
  console.log("Ward User:         ward1@civicvoice.gov.np / ward123");
  console.log(
    "Municipality User: municipality@civicvoice.gov.np / municipality123",
  );
  console.log("Admin User:        admin@civicvoice.gov.np / admin123");
  console.log("Ward user assigned to: Ward 1 - Dhapasi (KTM-W01)");
  console.log("───────────────────────────────────────\n");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
