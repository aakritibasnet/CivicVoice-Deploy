import { getProfileStats } from "@/services/gamification/stats.service";
export async function getMyStatsController(req, res, next) {
    try {
        const userId = req.user?.id; // ✅ Keep as string
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
            });
        }
        const stats = await getProfileStats(userId);
        return res.json({
            success: true,
            data: { stats },
        });
    }
    catch (err) {
        next(err);
    }
}
export async function getUserStatsPublicController(req, res, next) {
    try {
        const userId = req.params.userId; // ✅ Keep as string
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: "Invalid user id",
            });
        }
        const stats = await getProfileStats(userId);
        return res.json({
            success: true,
            data: { stats },
        });
    }
    catch (err) {
        next(err);
    }
}
