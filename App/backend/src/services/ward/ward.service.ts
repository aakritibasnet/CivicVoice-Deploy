import { pool } from "@/db/pool";

export type WardDetectionResult = {
  wardId: string;
  wardName: string;
  wardCode: string;
  municipalityId?: string;
  municipalityName?: string;
} | null;

export type MunicipalityDetectionResult = {
  municipalityId: string;
  municipalityName: string;
  municipalityCode: string;
} | null;

export type WardBoundary = {
  id: string;
  name: string;
  ward_code: string;
  municipality_id: string | null;
  geojson: object;
};

export type MunicipalityBoundary = {
  id: string;
  name: string;
  code: string;
  geojson: object;
};

export async function detectWard(
  lat: number,
  lng: number,
): Promise<WardDetectionResult> {
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    console.warn(`Invalid coordinates: lat=${lat}, lng=${lng}`);
    return null;
  }

  try {
    const { rows } = await pool.query<{
      id: string;
      name: string;
      ward_code: string;
    }>(
      `SELECT id, name, ward_code
       FROM wards
       WHERE boundary IS NOT NULL
         AND is_active = true
         AND ST_Contains(
           boundary,
           ST_SetSRID(ST_Point($1, $2), 4326)
         )
       LIMIT 1`,
      [lng, lat],
    );

    if (rows.length === 0) return null;

    return {
      wardId: rows[0].id,
      wardName: rows[0].name,
      wardCode: rows[0].ward_code,
    };
  } catch (err) {
    console.error("detectWard error:", err);
    return null;
  }
}

export async function detectMunicipality(
  lat: number,
  lng: number,
): Promise<MunicipalityDetectionResult> {
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  try {
    const { rows } = await pool.query<{
      id: string;
      name: string;
      code: string;
    }>(
      `SELECT id, name, code
       FROM municipalities
       WHERE boundary IS NOT NULL
         AND is_active = true
         AND ST_Contains(
           boundary,
           ST_SetSRID(ST_Point($1, $2), 4326)
         )
       LIMIT 1`,
      [lng, lat],
    );

    if (rows.length === 0) return null;

    return {
      municipalityId: rows[0].id,
      municipalityName: rows[0].name,
      municipalityCode: rows[0].code,
    };
  } catch (err) {
    console.error("detectMunicipality error:", err);
    return null;
  }
}

export async function getWardBoundaries(
  municipalityId?: string,
): Promise<WardBoundary[]> {
  try {
    const whereClause = municipalityId
      ? `WHERE w.boundary IS NOT NULL AND w.is_active = true AND w.municipality_id = $1`
      : `WHERE w.boundary IS NOT NULL AND w.is_active = true`;

    const params = municipalityId ? [municipalityId] : [];

    const { rows } = await pool.query<WardBoundary>(
      `SELECT
         w.id,
         w.name,
         w.ward_code,
         w.municipality_id,
         ST_AsGeoJSON(ST_SimplifyPreserveTopology(w.boundary, 0.0001))::jsonb AS geojson
       FROM wards w
       ${whereClause}
       ORDER BY w.ward_code`,
      params,
    );

    return rows;
  } catch (err) {
    console.error("getWardBoundaries error:", err);
    return [];
  }
}

export async function getMunicipalityBoundaries(
  municipalityId?: string,
): Promise<MunicipalityBoundary[]> {
  try {
    const whereClause = municipalityId
      ? `WHERE m.boundary IS NOT NULL AND m.is_active = true AND m.id = $1`
      : `WHERE m.boundary IS NOT NULL AND m.is_active = true`;

    const params = municipalityId ? [municipalityId] : [];

    const { rows } = await pool.query<MunicipalityBoundary>(
      `SELECT
         m.id,
         m.name,
         m.code,
         ST_AsGeoJSON(ST_SimplifyPreserveTopology(m.boundary, 0.001))::jsonb AS geojson
       FROM municipalities m
       ${whereClause}
       ORDER BY m.name`,
      params,
    );

    return rows;
  } catch (err) {
    console.error("getMunicipalityBoundaries error:", err);
    return [];
  }
}
