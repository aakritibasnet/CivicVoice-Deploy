import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sqlDir = path.resolve(__dirname, "../prisma/sql");

const TRACKING_TABLE = "_prisma_sql_patches";

async function ensureTrackingTable(client) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS "${TRACKING_TABLE}" (
       filename    VARCHAR(255) PRIMARY KEY,
       checksum    VARCHAR(64) NOT NULL,
       applied_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
  );
}

async function getApplied(client) {
  const { rows } = await client.query(
    `SELECT filename, checksum FROM "${TRACKING_TABLE}"`,
  );
  return new Map(rows.map((r) => [r.filename, r.checksum]));
}

function checksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  const files = (await readdir(sqlDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.log(`No SQL patch files found in ${sqlDir}`);
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await ensureTrackingTable(client);
    const applied = await getApplied(client);

    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      const fullPath = path.join(sqlDir, file);
      const sql = await readFile(fullPath, "utf8");
      const sum = checksum(sql);
      const prevSum = applied.get(file);

      if (prevSum === sum) {
        console.log(`Skipping ${file} (already applied).`);
        skippedCount += 1;
        continue;
      }

      if (prevSum && prevSum !== sum) {
        console.warn(
          `Re-applying ${file}: contents changed since last run. ` +
            `Ensure this patch is idempotent.`,
        );
      } else {
        console.log(`Applying ${file}...`);
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO "${TRACKING_TABLE}" (filename, checksum, applied_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP)
           ON CONFLICT (filename)
           DO UPDATE SET checksum = EXCLUDED.checksum,
                         applied_at = CURRENT_TIMESTAMP`,
          [file, sum],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }

      appliedCount += 1;
    }

    console.log(
      `Done. Applied ${appliedCount} patch file(s), skipped ${skippedCount} already-applied.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
