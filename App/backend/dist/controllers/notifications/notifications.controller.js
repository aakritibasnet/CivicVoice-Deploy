import { getNotificationsForUser, getUnreadCountForUser, markAllNotificationsAsRead, markNotificationAsRead, clearAllNotifications, } from "@/services/notifications/notifications.service";
export async function getNotificationsController(req, res, next) {
    try {
        const userId = req.user?.id; // ✅ Keep as string
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
            });
        }
        const unreadOnly = req.query.unread_only?.toLowerCase() === "true";
        const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || "50", 10)));
        const notifications = await getNotificationsForUser({
            userId,
            recipientRole: req.user?.role ?? null,
            unreadOnly,
            limit,
        });
        return res.json({
            success: true,
            data: { notifications },
        });
    }
    catch (err) {
        next(err);
    }
}
export async function getUnreadCountController(req, res, next) {
    try {
        const userId = req.user?.id; // ✅ Keep as string
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
            });
        }
        const count = await getUnreadCountForUser(userId, req.user?.role ?? null);
        return res.json({
            success: true,
            data: { count },
        });
    }
    catch (err) {
        next(err);
    }
}
export async function markNotificationReadController(req, res, next) {
    try {
        const userId = req.user?.id; // ✅ Keep as string
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
            });
        }
        const id = req.params.id; // ✅ Keep as string if notifications use UUID
        if (!id) {
            return res.status(400).json({
                success: false,
                error: "Invalid notification id",
            });
        }
        const ok = await markNotificationAsRead({
            id,
            userId,
            recipientRole: req.user?.role ?? null,
        });
        return res.json({
            success: true,
            data: { success: ok },
        });
    }
    catch (err) {
        next(err);
    }
}
export async function markAllNotificationsReadController(req, res, next) {
    try {
        const userId = req.user?.id; // ✅ Keep as string
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
            });
        }
        const updated = await markAllNotificationsAsRead(userId, req.user?.role ?? null);
        return res.json({
            success: true,
            data: { updated },
        });
    }
    catch (err) {
        next(err);
    }
}
export async function clearAllNotificationsController(req, res, next) {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, error: "Unauthorized" });
        }
        const deleted = await clearAllNotifications(userId, req.user?.role ?? null);
        return res.json({ success: true, data: { deleted } });
    }
    catch (err) {
        next(err);
    }
}
