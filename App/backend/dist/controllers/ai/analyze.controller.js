import { analyzeReportImage, AiUnavailableError, isAiConfigured, } from "@/services/ai/imageAnalysis.service";
// POST /api/reports/analyze-image
// Multipart: field "media" = the captured photo.
// On success: { success: true, data: { category, title, description, suggested_priority } }
// On AI-unavailable: HTTP 503 with { success:false, code:"ai_unavailable" } so the
// mobile client can silently fall back to manual entry.
export async function analyzeImageController(req, res) {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({
                success: false,
                error: "Image file is required",
            });
        }
        if (!file.mimetype?.startsWith("image/")) {
            return res.status(400).json({
                success: false,
                error: "Only image files can be analyzed",
            });
        }
        if (!isAiConfigured()) {
            // Not an error the user caused — let the client fall back quietly.
            return res.status(503).json({
                success: false,
                error: "AI auto-fill is not available right now.",
                code: "ai_unavailable",
            });
        }
        const result = await analyzeReportImage(file.buffer, file.mimetype);
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (err) {
        if (err instanceof AiUnavailableError) {
            return res.status(err.status).json({
                success: false,
                error: err.message,
                code: "ai_unavailable",
            });
        }
        console.error("❌ analyzeImageController error:", err);
        return res.status(500).json({
            success: false,
            error: "Could not analyze the image.",
        });
    }
}
