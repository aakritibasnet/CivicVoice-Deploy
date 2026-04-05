import { followReport } from "@/services/reports/followers.service";
export async function toggleFollowController(req, res) {
    try {
        const reportId = req.params.id;
        if (!reportId || typeof reportId !== "string" || !reportId.trim()) {
            return res.status(400).json({
                success: false,
                error: "Invalid report ID",
            });
        }
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
            });
        }
        const result = await followReport(userId, reportId);
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (err) {
        console.error("toggleFollowController error:", err);
        return res.status(400).json({
            success: false,
            error: err.message || "Failed to toggle follow",
        });
    }
}
