import { getReportDetailService, toggleUpvoteService, getCommentsService, addCommentService, toggleBookmarkService, } from "../../services/reports/interactions.service";
// ─── Report Detail ───────────────────────────────────────────────────
export async function getReportDetailController(req, res) {
    try {
        const reportId = req.params.id; // ✅ Keep as string (UUID)
        // ✅ Validate UUID format (optional but recommended)
        if (!reportId ||
            typeof reportId !== "string" ||
            reportId.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: "Invalid report ID",
            });
        }
        const userId = req.user?.id ?? null; // ✅ Use proper typing
        const userRole = req.user?.role ?? null;
        console.log("🔍 getReportDetailController:", { reportId, userId, userRole });
        const report = await getReportDetailService(reportId, userId, userRole);
        return res.json({
            success: true,
            data: report,
        });
    }
    catch (err) {
        if (err.message === "Report not found") {
            return res.status(404).json({
                success: false,
                error: err.message,
            });
        }
        console.error("❌ getReportDetailController:", err);
        return res.status(500).json({
            success: false,
            error: "Server error",
        });
    }
}
// ─── Upvote ──────────────────────────────────────────────────────────
export async function toggleUpvoteController(req, res) {
    try {
        const reportId = req.params.id; // ✅ Keep as string (UUID)
        if (!reportId ||
            typeof reportId !== "string" ||
            reportId.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: "Invalid report ID",
            });
        }
        const userId = req.user?.id; // ✅ Use proper typing
        const userRole = req.user?.role ?? "citizen";
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
            });
        }
        console.log("🔍 toggleUpvoteController:", { reportId, userId, userRole });
        const result = await toggleUpvoteService(reportId, userId, userRole);
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (err) {
        if (err.message === "Report not found") {
            return res.status(404).json({
                success: false,
                error: err.message,
            });
        }
        console.error("❌ toggleUpvoteController:", err);
        return res.status(400).json({
            success: false,
            error: err.message || "Failed to toggle upvote",
        });
    }
}
// ─── Comments (list) ─────────────────────────────────────────────────
export async function getCommentsController(req, res) {
    try {
        const reportId = req.params.id; // ✅ Keep as string (UUID)
        if (!reportId ||
            typeof reportId !== "string" ||
            reportId.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: "Invalid report ID",
            });
        }
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        console.log("🔍 getCommentsController:", { reportId, page, limit });
        const result = await getCommentsService(reportId, page, limit);
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (err) {
        if (err.message === "Report not found") {
            return res.status(404).json({
                success: false,
                error: err.message,
            });
        }
        console.error("❌ getCommentsController:", err);
        return res.status(500).json({
            success: false,
            error: "Server error",
        });
    }
}
// ─── Comment (add) ───────────────────────────────────────────────────
export async function addCommentController(req, res) {
    try {
        const reportId = req.params.id; // ✅ Keep as string (UUID)
        if (!reportId ||
            typeof reportId !== "string" ||
            reportId.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: "Invalid report ID",
            });
        }
        const userId = req.user?.id; // ✅ Use proper typing
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
            });
        }
        const { content } = req.body;
        if (!content || typeof content !== "string" || content.trim().length < 1) {
            return res.status(400).json({
                success: false,
                error: "Comment cannot be empty",
            });
        }
        console.log("🔍 addCommentController:", {
            reportId,
            userId,
            contentLength: content.length,
        });
        const comment = await addCommentService({
            reportId,
            userId,
            content: content.trim(),
        });
        return res.status(201).json({
            success: true,
            data: comment,
        });
    }
    catch (err) {
        if (err.message === "Report not found") {
            return res.status(404).json({
                success: false,
                error: err.message,
            });
        }
        console.error("❌ addCommentController:", err);
        return res.status(400).json({
            success: false,
            error: err.message || "Failed to add comment",
        });
    }
}
// ─── Bookmark ────────────────────────────────────────────────────────
export async function toggleBookmarkController(req, res) {
    try {
        const reportId = req.params.id; // ✅ Keep as string (UUID)
        if (!reportId ||
            typeof reportId !== "string" ||
            reportId.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: "Invalid report ID",
            });
        }
        const userId = req.user?.id; // ✅ Use proper typing
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
            });
        }
        console.log("🔍 toggleBookmarkController:", { reportId, userId });
        const result = await toggleBookmarkService(reportId, userId);
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (err) {
        if (err.message === "Report not found") {
            return res.status(404).json({
                success: false,
                error: err.message,
            });
        }
        console.error("❌ toggleBookmarkController:", err);
        return res.status(400).json({
            success: false,
            error: err.message || "Failed to toggle bookmark",
        });
    }
}
