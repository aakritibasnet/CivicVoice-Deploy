import { Router } from "express";
import { requireAuth } from "@/middleware/auth";
import { getNotificationsController, getUnreadCountController, markAllNotificationsReadController, markNotificationReadController, clearAllNotificationsController, } from "@/controllers/notifications/notifications.controller";
import { registerPushToken, removePushToken, } from "@/services/notifications/push.service";
const notificationsRoutes = Router();
notificationsRoutes.use(requireAuth);
notificationsRoutes.get("/", getNotificationsController);
notificationsRoutes.get("/unread-count", getUnreadCountController);
notificationsRoutes.patch("/:id/read", markNotificationReadController);
notificationsRoutes.patch("/mark-all-read", markAllNotificationsReadController);
notificationsRoutes.delete("/clear-all", clearAllNotificationsController);
// Push token registration
notificationsRoutes.post("/push-token", async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, error: "Unauthorized" });
        }
        const { token, platform } = req.body;
        if (!token || !platform) {
            return res.status(400).json({ success: false, error: "token and platform are required" });
        }
        await registerPushToken(userId, token, platform, req.user?.role ?? null);
        return res.json({ success: true, data: { registered: true } });
    }
    catch (err) {
        console.error("registerPushToken error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
});
notificationsRoutes.delete("/push-token", async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, error: "Unauthorized" });
        }
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ success: false, error: "token is required" });
        }
        await removePushToken(userId, token, req.user?.role ?? null);
        return res.json({ success: true, data: { removed: true } });
    }
    catch (err) {
        console.error("removePushToken error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
});
export default notificationsRoutes;
