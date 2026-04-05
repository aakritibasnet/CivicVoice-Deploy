import { Router, Request, Response } from "express";
import { requireAuth } from "@/middleware/auth";
import {
  getNotificationsController,
  getUnreadCountController,
  markAllNotificationsReadController,
  markNotificationReadController,
  clearAllNotificationsController,
} from "@/controllers/notifications/notifications.controller";
import {
  registerPushToken,
  removePushToken,
} from "@/services/notifications/push.service";
import type { ApiResponse } from "@/types/api.types";

const notificationsRoutes = Router();

notificationsRoutes.use(requireAuth);

notificationsRoutes.get("/", getNotificationsController);
notificationsRoutes.get("/unread-count", getUnreadCountController);
notificationsRoutes.patch("/:id/read", markNotificationReadController);
notificationsRoutes.patch("/mark-all-read", markAllNotificationsReadController);
notificationsRoutes.delete("/clear-all", clearAllNotificationsController);

// Push token registration
notificationsRoutes.post("/push-token", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" } satisfies ApiResponse);
    }
    const { token, platform } = req.body;
    if (!token || !platform) {
      return res.status(400).json({ success: false, error: "token and platform are required" } satisfies ApiResponse);
    }
    await registerPushToken(userId, token, platform, req.user?.role ?? null);
    return res.json({ success: true, data: { registered: true } } satisfies ApiResponse);
  } catch (err: any) {
    console.error("registerPushToken error:", err);
    return res.status(500).json({ success: false, error: "Server error" } satisfies ApiResponse);
  }
});

notificationsRoutes.delete("/push-token", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" } satisfies ApiResponse);
    }
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: "token is required" } satisfies ApiResponse);
    }
    await removePushToken(userId, token, req.user?.role ?? null);
    return res.json({ success: true, data: { removed: true } } satisfies ApiResponse);
  } catch (err: any) {
    console.error("removePushToken error:", err);
    return res.status(500).json({ success: false, error: "Server error" } satisfies ApiResponse);
  }
});

export default notificationsRoutes;

