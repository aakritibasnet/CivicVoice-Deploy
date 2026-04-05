import { Request, Response } from "express";
import type { ApiResponse } from "@/types/api.types";
import { followReport } from "@/services/reports/followers.service";

export async function toggleFollowController(req: Request, res: Response) {
  try {
    const reportId = req.params.id;

    if (!reportId || typeof reportId !== "string" || !reportId.trim()) {
      return res.status(400).json({
        success: false,
        error: "Invalid report ID",
      } satisfies ApiResponse);
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      } satisfies ApiResponse);
    }

    const result = await followReport(userId, reportId);

    return res.json({
      success: true,
      data: result,
    } satisfies ApiResponse);
  } catch (err: any) {
    console.error("toggleFollowController error:", err);
    return res.status(400).json({
      success: false,
      error: err.message || "Failed to toggle follow",
    } satisfies ApiResponse);
  }
}
