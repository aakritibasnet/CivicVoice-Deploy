/**
 * Download Nepal administrative boundary GeoJSON data from HDX/OCHA.
 *
 * Usage:
 *   npx tsx prisma/scripts/download-nepal-boundaries.ts
 *
 * Downloads:
 *   - Municipality boundaries (Admin Level 3) → prisma/data/nepal-boundaries/municipalities.geojson
 *   - Ward boundaries (Admin Level 4)         → prisma/data/nepal-boundaries/wards.geojson
 */

import { writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";

const OUT_DIR = path.resolve(__dirname, "../data/nepal-boundaries");

// HDX dataset API — Nepal administrative boundaries
// These URLs point to the OCHA-maintained Common Operational Datasets (COD)
const HDX_DATASET_ID = "administrative-boundaries-of-nepal";
const HDX_API_BASE = "https://data.humdata.org/api/3/action";

interface HDXResource {
  id: string;
  name: string;
  url: string;
  format: string;
  description: string;
}

interface HDXDatasetResponse {
  success: boolean;
  result: {
    resources: HDXResource[];
  };
}

async function fetchDatasetResources(): Promise<HDXResource[]> {
  console.log("📡 Fetching HDX dataset metadata...\n");

  const url = `${HDX_API_BASE}/package_show?id=${HDX_DATASET_ID}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`HDX API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as HDXDatasetResponse;
  if (!data.success) {
    throw new Error("HDX API returned success=false");
  }

  return data.result.resources;
}

function findGeoJSONResource(
  resources: HDXResource[],
  adminLevel: string,
): HDXResource | null {
  // Look for GeoJSON files matching the admin level
  // HDX naming patterns: "adm3" for municipalities, "adm4" for wards
  const patterns = [
    adminLevel.toLowerCase(),
    `admin${adminLevel.replace("adm", "")}`,
    `level_${adminLevel.replace("adm", "")}`,
  ];

  // Prefer GeoJSON format
  const geojsonResources = resources.filter(
    (r) =>
      r.format?.toLowerCase() === "geojson" ||
      r.url?.endsWith(".geojson") ||
      r.url?.endsWith(".json"),
  );

  for (const r of geojsonResources) {
    const nameAndDesc = `${r.name} ${r.description}`.toLowerCase();
    if (patterns.some((p) => nameAndDesc.includes(p))) {
      return r;
    }
  }

  // Fallback: check all resources
  for (const r of resources) {
    const nameAndDesc = `${r.name} ${r.description}`.toLowerCase();
    if (
      patterns.some((p) => nameAndDesc.includes(p)) &&
      (r.format?.toLowerCase() === "geojson" ||
        r.url?.endsWith(".geojson") ||
        r.url?.endsWith(".json"))
    ) {
      return r;
    }
  }

  return null;
}

async function downloadFile(
  url: string,
  outputPath: string,
  label: string,
): Promise<void> {
  console.log(`⬇️  Downloading ${label}...`);
  console.log(`   URL: ${url}`);

  const res = await fetch(url, {
    headers: { "User-Agent": "CivicVoice-Boundary-Import/1.0" },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();

  // Validate it's valid JSON/GeoJSON
  try {
    const parsed = JSON.parse(text);
    if (parsed.type !== "FeatureCollection" && parsed.type !== "Feature") {
      console.warn(`   ⚠️  Warning: Response may not be GeoJSON (type: ${parsed.type})`);
    } else {
      const count = parsed.features?.length ?? 0;
      console.log(`   ✅ Valid GeoJSON — ${count} features`);
    }
  } catch {
    throw new Error("Downloaded file is not valid JSON");
  }

  writeFileSync(outputPath, text, "utf-8");
  const sizeMB = (Buffer.byteLength(text) / 1024 / 1024).toFixed(1);
  console.log(`   📁 Saved to ${outputPath} (${sizeMB} MB)\n`);
}

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("🇳🇵 Nepal Administrative Boundary Data Downloader");
  console.log("═══════════════════════════════════════════════\n");

  // Ensure output directory exists
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  const municipalityPath = path.join(OUT_DIR, "municipalities.geojson");
  const wardPath = path.join(OUT_DIR, "wards.geojson");

  // Try HDX API first
  try {
    const resources = await fetchDatasetResources();

    console.log(`Found ${resources.length} resources in HDX dataset.\n`);
    console.log("Available GeoJSON resources:");
    resources
      .filter(
        (r) =>
          r.format?.toLowerCase() === "geojson" ||
          r.url?.endsWith(".geojson"),
      )
      .forEach((r) => {
        console.log(`  - ${r.name} (${r.format})`);
        console.log(`    ${r.url}\n`);
      });

    // Find municipality (admin level 3) and ward (admin level 4) resources
    const munResource = findGeoJSONResource(resources, "adm3");
    const wardResource = findGeoJSONResource(resources, "adm4");

    if (munResource) {
      await downloadFile(munResource.url, municipalityPath, "Municipality boundaries (Admin Level 3)");
    } else {
      console.log("⚠️  Could not auto-detect municipality (adm3) GeoJSON resource.");
      console.log("   Please download manually from: https://data.humdata.org/dataset/administrative-boundaries-of-nepal\n");
      console.log("   Look for a GeoJSON file with 'adm3' in the name.");
      console.log(`   Save it to: ${municipalityPath}\n`);
    }

    if (wardResource) {
      await downloadFile(wardResource.url, wardPath, "Ward boundaries (Admin Level 4)");
    } else {
      console.log("⚠️  Could not auto-detect ward (adm4) GeoJSON resource.");
      console.log("   Please download manually from: https://data.humdata.org/dataset/administrative-boundaries-of-nepal\n");
      console.log("   Look for a GeoJSON file with 'adm4' in the name.");
      console.log(`   Save it to: ${wardPath}\n`);
    }
  } catch (err) {
    console.error("❌ HDX API request failed:", err);
    console.log("\n📋 Manual download instructions:");
    console.log("────────────────────────────────");
    console.log("1. Visit: https://data.humdata.org/dataset/administrative-boundaries-of-nepal");
    console.log("2. Download the GeoJSON files for:");
    console.log("   - Admin Level 3 (Municipalities/Local Levels) → save as municipalities.geojson");
    console.log("   - Admin Level 4 (Wards) → save as wards.geojson");
    console.log(`3. Place files in: ${OUT_DIR}`);
    console.log("");
    console.log("Alternative sources:");
    console.log("  - https://geodata.lib.utexas.edu/ (search Nepal administrative)");
    console.log("  - https://www.geoboundaries.org/index.html#getdata (Nepal ADM3/ADM4)");
    console.log("  - Nepal Survey Department shapefiles (convert with ogr2ogr -f GeoJSON)");
  }

  // Check final state
  console.log("═══════════════════════════════════════════════");
  console.log("📋 Status:");
  console.log(
    `   Municipalities: ${existsSync(municipalityPath) ? "✅ Ready" : "❌ Missing"}`,
  );
  console.log(
    `   Wards:          ${existsSync(wardPath) ? "✅ Ready" : "❌ Missing"}`,
  );
  console.log("═══════════════════════════════════════════════\n");

  if (existsSync(municipalityPath) && existsSync(wardPath)) {
    console.log("✅ All boundary data ready. Run the import script next:");
    console.log("   npx tsx prisma/scripts/import-nepal-boundaries.ts\n");
  }
}

main().catch(console.error);
