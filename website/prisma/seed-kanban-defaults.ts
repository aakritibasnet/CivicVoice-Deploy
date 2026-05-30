import { PrismaClient } from "../app/generated/prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";
import path from "path";
import { DEFAULT_KANBAN_COLUMNS } from "./data/default-kanban-columns";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(
  pool as unknown as ConstructorParameters<typeof PrismaPg>[0],
);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding default Kanban columns...");

  await prisma.kanban_columns.deleteMany({
    where: { is_default: true },
  });

  for (const column of DEFAULT_KANBAN_COLUMNS) {
    await prisma.kanban_columns.create({
      data: {
        name: column.name,
        position: column.position,
        color: column.color,
        deadline_days: column.deadline_days,
        is_terminal: column.is_terminal,
        is_default: column.is_default,
        role_access: [...column.role_access],
        mapped_status: column.mapped_status,
      },
    });
  }

  console.log(`Created ${DEFAULT_KANBAN_COLUMNS.length} default columns.`);
}

main()
  .catch((error) => {
    console.error("Failed to seed Kanban defaults:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
