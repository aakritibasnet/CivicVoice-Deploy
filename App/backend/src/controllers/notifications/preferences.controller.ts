// src/controllers/notifications/notification-preferences.controller.ts
import type { Request, Response, NextFunction } from "express";
import type { ApiResponse } from "@/types/api.types";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/services/notifications/preferences.service";

export async function getPreferencesController(
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

    const prefs = await getNotificationPreferences(userId);
    return res.json({
      success: true,
      data: { preferences: prefs },
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}

export async function updatePreferencesController(
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

    const prefs = await updateNotificationPreferences(userId, req.body || {});

    return res.json({
      success: true,
      data: { preferences: prefs },
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}
