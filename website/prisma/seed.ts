import { PrismaClient } from "@/app/generated/prisma/client";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { DEFAULT_KANBAN_COLUMNS } from "./data/default-kanban-columns";
import { FIXED_DEPARTMENTS } from "../src/features/departments/catalog";

config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(
  pool as unknown as ConstructorParameters<typeof PrismaPg>[0],
);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...\n");

  const wardPassword = await bcrypt.hash("ward123", 12);
  const municipalityPassword = await bcrypt.hash("municipality123", 12);
  const adminPassword = await bcrypt.hash("admin123", 12);

  const ward = await prisma.wards.findUnique({
    where: { ward_code: "KTM-W01" },
  });

  if (!ward) {
    throw new Error(
      "Ward KTM-W01 not found. Run `npm run seed-wards` before `npm run seed`.",
    );
  }

  console.log(`Ward: ${ward.name} (${ward.ward_code})`);

  const wardUser = await prisma.users.upsert({
    where: { email: "ward1@civicvoice.gov.np" },
    update: {
      name: "Ward-01 Kathmandu",
      ward_id: ward.id,
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
      ward_id: ward.id,
    },
  });

  console.log(`Ward User: ${wardUser.email}`);

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

  console.log(`Municipality User: ${municipalityUser.email}`);

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

  console.log(`Admin User: ${adminUser.email}`);

  for (const department of FIXED_DEPARTMENTS) {
    await prisma.officer_departments.upsert({
      where: { slug: department.slug },
      update: {
        name: department.name,
        description: department.description,
        updated_at: new Date(),
      },
      create: department,
    });
  }

  const roadDepartment = await prisma.officer_departments.findUnique({
    where: { slug: "roads_and_infrastructure" },
  });
  const sanitationDepartment = await prisma.officer_departments.findUnique({
    where: { slug: "sanitation_and_waste_management" },
  });

  if (roadDepartment) {
    const existingBackendWardOfficer = await prisma.officers.findFirst({
      where: {
        first_name: "Shyam",
        last_name: "Adhikari",
        type: "ward_officer",
        ward_id: ward.id,
        deleted_at: null,
      },
    });

    if (!existingBackendWardOfficer) {
      await prisma.officers.create({
        data: {
          first_name: "Shyam",
          last_name: "Adhikari",
          phone_number: "9800000002",
          type: "ward_officer",
          ward_id: ward.id,
          department_id: roadDepartment.id,
        },
      });
    }
  }

  if (sanitationDepartment) {
    const existingMunicipalityOfficer = await prisma.officers.findFirst({
      where: {
        first_name: "Anita",
        last_name: "Shrestha",
        type: "municipality_officer",
        deleted_at: null,
      },
    });

    if (!existingMunicipalityOfficer) {
      await prisma.officers.create({
        data: {
          first_name: "Anita",
          last_name: "Shrestha",
          phone_number: "9811111111",
          type: "municipality_officer",
          ward_id: null,
          department_id: sanitationDepartment.id,
        },
      });
    }
  }

  const existingWardOfficer = await prisma.ward_officers.findFirst({
    where: {
      ward_id: ward.id,
      email: "officer1@civicvoice.gov.np",
    },
  });

  if (!existingWardOfficer) {
    const wardOfficer = await prisma.ward_officers.create({
      data: {
        ward_id: ward.id,
        name: "Shyam Lal Adhikari",
        email: "officer1@civicvoice.gov.np",
        phone: "9800000002",
        designation: "Ward Officer",
      },
    });

    console.log(`Ward Officer: ${wardOfficer.name}`);
  } else {
    console.log(`Ward Officer already exists: ${existingWardOfficer.email}`);
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

    console.log(
      `Kanban Column: ${col.name} (${col.role_access.join(", ")})`,
    );
  }

  console.log("\nSeeding complete.\n");
  console.log("Login credentials:");
  console.log("Ward User:         ward1@civicvoice.gov.np / ward123");
  console.log(
    "Municipality User: municipality@civicvoice.gov.np / municipality123",
  );
  console.log("Admin User:        admin@civicvoice.gov.np / admin123");
  console.log("Ward user assigned to: Ward 1 - Dhapasi (KTM-W01)");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
