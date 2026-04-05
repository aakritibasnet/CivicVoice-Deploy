import { getLeaderboard, getUserRank, } from "@/services/gamification/leaderboard.service";
function parseTimeframe(raw) {
    if (raw === "weekly" || raw === "monthly" || raw === "all_time")
        return raw;
    return "weekly";
}
export async function getLeaderboardController(req, res, next) {
    try {
        const timeframe = parseTimeframe(req.query.timeframe);
        const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || "10", 10)));
        const page = Math.max(1, Number.parseInt(req.query.page || "1", 10));
        const offset = (page - 1) * limit;
        const { rows, total_users } = await getLeaderboard(timeframe, limit, offset);
        return res.json({
            success: true,
            data: {
                timeframe,
                leaderboard: rows,
                pagination: {
                    currentPage: page,
                    totalCount: total_users,
                    totalPages: total_users > 0 ? Math.ceil(total_users / limit) : 0,
                    hasNext: total_users > page * limit,
                    hasPrev: page > 1,
                },
            },
        });
    }
    catch (err) {
        next(err);
    }
}
export async function getMyRankController(req, res, next) {
    try {
        const userId = req.user?.id; // ✅ Keep as string
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
            });
        }
        const timeframe = parseTimeframe(req.query.timeframe);
        const rankRow = await getUserRank(timeframe, userId);
        return res.json({
            success: true,
            data: {
                timeframe,
                rank: rankRow,
            },
        });
    }
    catch (err) {
        next(err);
    }
}
