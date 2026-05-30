import { Request, Response } from "express";
import type { ApiResponse } from "@/types/api.types";
import {
  createReportService,
  listMyReportsService,
  listPublicReportsService,
  claimReportsService,
  findSimilarReports,
} from "../../services/reports/reports.service";
import { awardBadgesForUser } from "@/services/gamification/badges.service";
import { notifyWardUsersOfNewReport } from "@/services/notifications/triggers.service";

// ─── Create Report (authenticated or anonymous) ──────────────────────
export async function createReportController(req: Request, res: Response) {
  try {
    // ✅ Use proper typing (req.user is defined in your global types)
    const userId = req.user?.id ?? null;

    // 🔍 Debug logging
    console.log("🔍 createReportController - userId:", userId);
    console.log("🔍 createReportController - req.user:", req.user);
    console.log(
      "🔍 createReportController - headers:",
      req.headers.authorization,
    );

    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        error: "Media file is required",
      } satisfies ApiResponse);
    }

    const {
      title,
      description,
      media_type,
      category,
      is_public,
      location_lat,
      location_lng,
      location_accuracy_m,
      device_id,
      ai_priority_token,
    } = req.body;
    if (ai_priority_token != null && typeof ai_priority_token !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid AI priority token",
      } satisfies ApiResponse);
    }

    // 🔍 Debug what's being sent to service
    console.log("🔍 Calling createReportService with userId:", userId);

    const report = await createReportService({
      userId, // ✅ This should be a string UUID or null
      deviceId: userId === null ? device_id || null : null,
      fileBuffer: file.buffer,
      mediaType: media_type,
      title,
      description,
      category,
      isPublic: is_public === "false" ? false : true,
      locationLat: location_lat,
      locationLng: location_lng,
      locationAccuracyM: location_accuracy_m,
      address: req.body.address || null,
      aiPriorityToken: ai_priority_token || null,
    });

    // 🔍 Check what came back
    console.log("✅ Report created:", {
      id: report.id,
      user_id: report.user_id,
      device_id: report.device_id,
    });

    try {
      await notifyWardUsersOfNewReport(report.id);
    } catch (err) {
      console.error("createReportController ward notification error:", err);
    }

    let newlyEarnedBadges: Awaited<ReturnType<typeof awardBadgesForUser>> = [];
    if (userId !== null) {
      try {
        // ⚠️ If your badges service expects a number, you need to fix it
        // Otherwise, pass userId as string
        newlyEarnedBadges = await awardBadgesForUser(userId);
      } catch (err) {
        console.error("createReportController badge award error:", err);
      }
    }

    return res.status(201).json({
      success: true,
      data: {
        message: "Report created",
        report,
        wardName: report.ward_name || null,
        newlyEarnedBadges,
      },
    } satisfies ApiResponse);
  } catch (err: any) {
    console.error("❌ createReportController error:", err);
    const status = typeof err?.status === "number" ? err.status : 500;
    return res.status(status).json({
      success: false,
      error: err?.message || "Server error",
    } satisfies ApiResponse);
  }
}

// ─── My Reports ──────────────────────────────────────────────────────
export async function myReportsController(req: Request, res: Response) {
  try {
    const userId = req.user?.id; // ✅ Use proper typing

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      } satisfies ApiResponse);
    }

    console.log("🔍 myReportsController - userId:", userId);

    const reports = await listMyReportsService({ userId });

    return res.json({
      success: true,
      data: { reports },
    } satisfies ApiResponse);
  } catch (err: any) {
    console.error("❌ myReportsController error:", err);
    return res.status(500).json({
      success: false,
      error: "Server error",
    } satisfies ApiResponse);
  }
}

// ─── Public Reports (paginated) ──────────────────────────────────────
export async function publicReportsController(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      500,
      Math.max(1, parseInt(req.query.limit as string) || 500),
    );
    const category = req.query.category as string | string[] | undefined;
    const status = (req.query.status as string) || null;
    const escalated = req.query.escalated === "true";
    const timeRangeRaw = (req.query.timeRange as string) || "all";
    const timeRange =
      timeRangeRaw === "24h" ||
      timeRangeRaw === "7d" ||
      timeRangeRaw === "30d" ||
      timeRangeRaw === "all"
        ? timeRangeRaw
        : "all";
    const userLat = parseFloat(req.query.lat as string);
    const userLng = parseFloat(req.query.lng as string);
    const radius = parseFloat(req.query.radius as string);

    const neLat = parseFloat(req.query.neLat as string);
    const neLng = parseFloat(req.query.neLng as string);
    const swLat = parseFloat(req.query.swLat as string);
    const swLng = parseFloat(req.query.swLng as string);

    const bounds =
      Number.isFinite(neLat) &&
      Number.isFinite(neLng) &&
      Number.isFinite(swLat) &&
      Number.isFinite(swLng)
        ? { neLat, neLng, swLat, swLng }
        : null;
    const actorId = req.user?.id ?? null;
    const actorRole = req.user?.role ?? null;

    const result = await listPublicReportsService({
      page,
      limit,
      category: category ?? null,
      status,
      escalated: escalated || null,
      timeRange,
      userLat: Number.isFinite(userLat) ? userLat : null,
      userLng: Number.isFinite(userLng) ? userLng : null,
      radius: Number.isFinite(radius) ? radius : 5000,
      bounds,
      actorId,
      actorRole,
    });

    return res.json({
      success: true,
      data: result,
    } satisfies ApiResponse);
  } catch (err: any) {
    console.error("❌ publicReportsController error:", err);
    return res.status(500).json({
      success: false,
      error: "Server error",
    } satisfies ApiResponse);
  }
}

// ─── Claim Anonymous Reports ─────────────────────────────────────────
export async function claimReportsController(req: Request, res: Response) {
  try {
    const userId = req.user?.id; // ✅ Use proper typing

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      } satisfies ApiResponse);
    }

    const { deviceId, reportIds } = req.body;

    if (!deviceId || typeof deviceId !== "string") {
      return res.status(400).json({
        success: false,
        error: "deviceId is required",
      } satisfies ApiResponse);
    }

    if (!Array.isArray(reportIds) || reportIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "reportIds must be a non-empty array",
      } satisfies ApiResponse);
    }

    console.log("🔍 claimReportsController:", { userId, deviceId, reportIds });

    const result = await claimReportsService({ userId, deviceId, reportIds });

    return res.json({
      success: true,
      data: result,
    } satisfies ApiResponse);
  } catch (err: any) {
    console.error("❌ claimReportsController error:", err);
    return res.status(500).json({
      success: false,
      error: "Server error",
    } satisfies ApiResponse);
  }
}

// ─── Find Similar Reports (duplicate detection) ─────────────────────
export async function similarReportsController(req: Request, res: Response) {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const category = req.query.category as string;

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !category) {
      return res.status(400).json({
        success: false,
        error: "lat, lng, and category are required",
      });
    }

    const radius = Math.min(
      2000,
      Math.max(100, parseInt(req.query.radius as string) || 500),
    );

    const actorId = req.user?.id ?? null;
    const actorRole = req.user?.role ?? null;

    const reports = await findSimilarReports(lat, lng, category, radius, 5, actorId, actorRole);

    return res.json({
      success: true,
      data: { reports, count: reports.length },
    });
  } catch (err: any) {
    console.error("similarReportsController error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
}
