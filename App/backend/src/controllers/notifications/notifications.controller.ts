// src/controllers/notifications/notifications.controller.ts
import type { Request, Response, NextFunction } from "express";
import type { ApiResponse } from "@/types/api.types";
import {
  getNotificationsForUser,
  getUnreadCountForUser,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  clearAllNotifications,
} from "@/services/notifications/notifications.service";

export async function getNotificationsController(
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

    const unreadOnly =
      (req.query.unread_only as string | undefined)?.toLowerCase() === "true";
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt((req.query.limit as string) || "50", 10)),
    );

    const notifications = await getNotificationsForUser({
      userId,
      recipientRole: req.user?.role ?? null,
      unreadOnly,
      limit,
    });

    return res.json({
      success: true,
      data: { notifications },
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}

export async function getUnreadCountController(
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

    const count = await getUnreadCountForUser(userId, req.user?.role ?? null);

    return res.json({
      success: true,
      data: { count },
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}

export async function markNotificationReadController(
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

    const id = req.params.id; // ✅ Keep as string if notifications use UUID

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Invalid notification id",
      } satisfies ApiResponse);
    }

    const ok = await markNotificationAsRead({
      id,
      userId,
      recipientRole: req.user?.role ?? null,
    });

    return res.json({
      success: true,
      data: { success: ok },
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}

export async function markAllNotificationsReadController(
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

    const updated = await markAllNotificationsAsRead(
      userId,
      req.user?.role ?? null,
    );

    return res.json({
      success: true,
      data: { updated },
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}

export async function clearAllNotificationsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" } satisfies ApiResponse);
    }
    const deleted = await clearAllNotifications(userId, req.user?.role ?? null);
    return res.json({ success: true, data: { deleted } } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}
