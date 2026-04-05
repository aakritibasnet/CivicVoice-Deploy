import { getNotificationPreferences, updateNotificationPreferences, } from "@/services/notifications/preferences.service";
export async function getPreferencesController(req, res, next) {
    try {
        const userId = req.user?.id; // ✅ Keep as string
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
            });
        }
        const prefs = await getNotificationPreferences(userId);
        return res.json({
            success: true,
            data: { preferences: prefs },
        });
    }
    catch (err) {
        next(err);
    }
}
export async function updatePreferencesController(req, res, next) {
    try {
        const userId = req.user?.id; // ✅ Keep as string
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
            });
        }
        const prefs = await updateNotificationPreferences(userId, req.body || {});
        return res.json({
            success: true,
            data: { preferences: prefs },
        });
    }
    catch (err) {
        next(err);
    }
}
