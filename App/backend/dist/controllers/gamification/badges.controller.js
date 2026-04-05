import { awardBadgesForUser, getAllBadgesWithStatus, getBadgeDetail, getUserBadges, } from "@/services/gamification/badges.service";
export async function getMyBadgesController(req, res, next) {
    try {
        const userId = req.user?.id; // ✅ Keep as string
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
            });
        }
        // Auto-award any badges
        try {
            await awardBadgesForUser(userId);
        }
        catch (err) {
            console.error("getMyBadgesController award error:", err);
        }
        const badges = await getUserBadges(userId);
        return res.json({
            success: true,
            data: { badges },
        });
    }
    catch (err) {
        next(err);
    }
}
export async function getAllBadgesForUserController(req, res, next) {
    try {
        const userId = req.user?.id; // ✅ Keep as string
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
            });
        }
        const badges = await getAllBadgesWithStatus(userId, {
            includeProgress: true,
        });
        return res.json({
            success: true,
            data: { badges },
        });
    }
    catch (err) {
        next(err);
    }
}
export async function getBadgeDetailController(req, res, next) {
    try {
        const badgeId = req.params.badgeId; // ✅ Keep as string if badges use UUID
        if (!badgeId) {
            return res.status(400).json({
                success: false,
                error: "Invalid badge id",
            });
        }
        const userId = req.user?.id; // ✅ Optional, keep as string
        const badge = await getBadgeDetail(badgeId, userId);
        return res.json({
            success: true,
            data: { badge },
        });
    }
    catch (err) {
        next(err);
    }
}
