import type { Request, Response, NextFunction } from "express";
import {
  detectWard,
  detectMunicipality,
  getWardBoundaries,
  getMunicipalityBoundaries,
} from "../../services/ward/ward.service";
import { pool } from "@/db/pool";

export async function listWardsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name AS ward_name, ward_code FROM wards WHERE is_active = true ORDER BY name ASC`,
    );
    return res.json({ wards: rows });
  } catch (err) {
    next(err);
  }
}

export async function listCategoriesController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT category FROM reports WHERE category IS NOT NULL ORDER BY category ASC`,
    );
    return res.json({ categories: rows.map((r: any) => r.category) });
  } catch (err) {
    next(err);
  }
}

export async function detectWardFromCoords(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { lat, lng } = req.query;

    // ─── Validate presence ────────────────────────
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "lat and lng query parameters are required",
      });
    }

    const latitude = parseFloat(lat as string);
    const longitude = parseFloat(lng as string);

    // ─── Validate numbers ─────────────────────────
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({
        success: false,
        message: "lat and lng must be valid numbers",
      });
    }

    // ─── Validate ranges ──────────────────────────
    if (latitude < -90 || latitude > 90) {
      return res.status(400).json({
        success: false,
        message: "lat must be between -90 and 90",
      });
    }

    if (longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        message: "lng must be between -180 and 180",
      });
    }

    // ─── Detect ward ──────────────────────────────
    const ward = await detectWard(latitude, longitude);

    if (!ward) {
      // Try municipality-level fallback
      const municipality = await detectMunicipality(latitude, longitude);

      if (municipality) {
        return res.status(200).json({
          success: true,
          detected: false,
          ward: null,
          municipality: {
            id: municipality.municipalityId,
            name: municipality.municipalityName,
            code: municipality.municipalityCode,
          },
          message:
            "Ward boundary not mapped yet, but location is within " +
            municipality.municipalityName +
            ". Your report will be routed to the municipality for assignment.",
        });
      }

      return res.status(200).json({
        success: true,
        detected: false,
        ward: null,
        municipality: null,
        message:
          "Location is outside all registered boundaries. Your report will still be submitted but may require manual routing.",
      });
    }

    return res.status(200).json({
      success: true,
      detected: true,
      ward: {
        id: ward.wardId,
        name: ward.wardName,
        ward_code: ward.wardCode,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getWardBoundariesController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const municipalityId = req.query.municipality_id as string | undefined;
    const wards = await getWardBoundaries(municipalityId);

    return res.json({
      success: true,
      count: wards.length,
      boundaries: wards.map((w) => ({
        id: w.id,
        name: w.name,
        ward_code: w.ward_code,
        municipality_id: w.municipality_id,
        geojson: w.geojson,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function getMunicipalityBoundariesController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const municipalityId = req.query.municipality_id as string | undefined;
    const municipalities = await getMunicipalityBoundaries(municipalityId);

    return res.json({
      success: true,
      count: municipalities.length,
      boundaries: municipalities.map((m) => ({
        id: m.id,
        name: m.name,
        code: m.code,
        geojson: m.geojson,
      })),
    });
  } catch (err) {
    next(err);
  }
}
