// src/controllers/gamification/badges.controller.ts
import type { Request, Response, NextFunction } from "express";
import type { ApiResponse } from "@/types/api.types";
import {
  awardBadgesForUser,
  getAllBadgesWithStatus,
  getBadgeDetail,
  getUserBadges,
} from "@/services/gamification/badges.service";

export async function getMyBadgesController(
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

    // Auto-award any badges
    try {
      await awardBadgesForUser(userId);
    } catch (err) {
      console.error("getMyBadgesController award error:", err);
    }

    const badges = await getUserBadges(userId);

    return res.json({
      success: true,
      data: { badges },
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}

export async function getAllBadgesForUserController(
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

    const badges = await getAllBadgesWithStatus(userId, {
      includeProgress: true,
    });

    return res.json({
      success: true,
      data: { badges },
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}

export async function getBadgeDetailController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const badgeId = req.params.badgeId; // ✅ Keep as string if badges use UUID

    if (!badgeId) {
      return res.status(400).json({
        success: false,
        error: "Invalid badge id",
      } satisfies ApiResponse);
    }

    const userId = req.user?.id; // ✅ Optional, keep as string

    const badge = await getBadgeDetail(badgeId, userId);

    return res.json({
      success: true,
      data: { badge },
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}
