import type { Request, Response, NextFunction } from "express";
import type { ApiResponse } from "@/types/api.types";
import {
  getPublicOfficerDetail,
  searchDirectory,
  searchReports,
  type SearchScope,
} from "@/services/search/search.service";

export async function searchReportsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = String(req.query.q || "").trim();
    const scope = (req.query.scope as SearchScope | undefined) || "general";
    const category = (req.query.category as string | undefined) || null;
    const status = (req.query.status as string | undefined) || null;
    const startDate = (req.query.startDate as string | undefined) || null;
    const endDate = (req.query.endDate as string | undefined) || null;

    const page = Math.max(
      1,
      Number.parseInt((req.query.page as string) || "1", 10),
    );
    const limit = Math.min(
      50,
      Math.max(
        1,
        Number.parseInt((req.query.limit as string) || "20", 10),
      ),
    );

    const neLat = Number.parseFloat(req.query.neLat as string);
    const neLng = Number.parseFloat(req.query.neLng as string);
    const swLat = Number.parseFloat(req.query.swLat as string);
    const swLng = Number.parseFloat(req.query.swLng as string);

    const bounds =
      Number.isFinite(neLat) &&
      Number.isFinite(neLng) &&
      Number.isFinite(swLat) &&
      Number.isFinite(swLng)
        ? { neLat, neLng, swLat, swLng }
        : null;

    const result = await searchReports({
      query,
      scope,
      category,
      status,
      startDate,
      endDate,
      bounds,
      page,
      limit,
    });

    return res.json({
      success: true,
      data: result,
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}

export async function searchDirectoryController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = String(req.query.q || "").trim();
    const limit = Math.min(
      20,
      Math.max(
        1,
        Number.parseInt((req.query.limit as string) || "8", 10),
      ),
    );

    const result = await searchDirectory(query, limit);

    return res.json({
      success: true,
      data: result,
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}

export async function getPublicOfficerDetailController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await getPublicOfficerDetail(req.params.officerId);

    if (!result.officer) {
      return res.status(404).json({
        success: false,
        error: "Officer not found",
      } satisfies ApiResponse);
    }

    return res.json({
      success: true,
      data: result,
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}

