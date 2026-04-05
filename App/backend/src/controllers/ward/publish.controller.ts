// src/controllers/ward/publish.controller.ts
import type { Request, Response, NextFunction } from "express";
import {
  getPublishStatus,
  getPublishPreview,
  publishWardReport,
  listPublishedReports,
  getPublicPublishedReport,
  listPublicPublishedReports,
} from "@/services/ward/publish.service";

export async function getPublishStatusController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const wardId = req.user?.ward_id;
    if (!wardId) return res.status(403).json({ ok: false, message: "Not a ward user" });

    const status = await getPublishStatus(String(wardId));
    return res.json({ ok: true, ...status });
  } catch (err) {
    next(err);
  }
}

export async function getPublishPreviewController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const wardId = req.user?.ward_id;
    if (!wardId) return res.status(403).json({ ok: false, message: "Not a ward user" });

    const preview = await getPublishPreview(String(wardId));
    return res.json({ ok: true, ...preview });
  } catch (err) {
    next(err);
  }
}

export async function publishReportController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const wardId = req.user?.ward_id;
    const userId = req.user?.id;
    if (!wardId || !userId) return res.status(403).json({ ok: false, message: "Not a ward user" });

    const result = await publishWardReport(String(wardId), userId);
    return res.status(201).json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getPublishedReportsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const wardId = req.user?.ward_id;
    if (!wardId) return res.status(403).json({ ok: false, message: "Not a ward user" });

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));

    const result = await listPublishedReports(String(wardId), page, limit);
    return res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getPublicPublishedFeedController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));

    const result = await listPublicPublishedReports(page, limit);
    return res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getPublicPublishedReportController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { reportId } = req.params;
    const report = await getPublicPublishedReport(reportId);

    if (!report) {
      return res.status(404).json({ ok: false, message: "Published report not found" });
    }

    return res.json({ ok: true, report });
  } catch (err) {
    next(err);
  }
}
