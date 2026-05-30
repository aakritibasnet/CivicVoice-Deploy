// src/controllers/gamification/stats.controller.ts
import type { Request, Response, NextFunction } from "express";
import type { ApiResponse } from "@/types/api.types";
import { getProfileStats } from "@/services/gamification/stats.service";

export async function getMyStatsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user?.id; // ✅ Keep as string

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      } satisfies ApiResponse);
    }

    const stats = await getProfileStats(userId);

    return res.json({
      success: true,
      data: { stats },
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}

export async function getUserStatsPublicController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.params.userId; // ✅ Keep as string

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Invalid user id",
      } satisfies ApiResponse);
    }

    const stats = await getProfileStats(userId);

    return res.json({
      success: true,
      data: { stats },
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}
