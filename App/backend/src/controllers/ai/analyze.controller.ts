// src/controllers/ai/analyze.controller.ts
import type { Request, Response } from "express";
import type { ApiResponse } from "@/types/api.types";
import {
  analyzeReportImage,
  AiUnavailableError,
  isAiConfigured,
} from "@/services/ai/imageAnalysis.service";
import { signPrioritySuggestion } from "@/services/ai/prioritySuggestionToken";

// POST /api/reports/analyze-image
// Multipart: field "media" = the captured photo.
// On success: { success: true, data: { category, title, description, suggested_priority, priority_token } }
// On AI-unavailable: HTTP 503 with { success:false, code:"ai_unavailable" } so the
// mobile client can silently fall back to manual entry.
export async function analyzeImageController(req: Request, res: Response) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        error: "Image file is required",
      } satisfies ApiResponse);
    }

    if (!file.mimetype?.startsWith("image/")) {
      return res.status(400).json({
        success: false,
        error: "Only image files can be analyzed",
      } satisfies ApiResponse);
    }

    if (!isAiConfigured()) {
      // Not an error the user caused — let the client fall back quietly.
      return res.status(503).json({
        success: false,
        error: "AI auto-fill is not available right now.",
        code: "ai_unavailable",
      } satisfies ApiResponse);
    }

    const result = await analyzeReportImage(file.buffer, file.mimetype);
    const priorityToken = signPrioritySuggestion({
      priority: result.suggested_priority,
      imageBuffer: file.buffer,
    });

    return res.json({
      success: true,
      data: {
        ...result,
        priority_token: priorityToken,
      },
    } satisfies ApiResponse);
  } catch (err: any) {
    if (err instanceof AiUnavailableError) {
      return res.status(err.status).json({
        success: false,
        error: err.message,
        code: "ai_unavailable",
      } satisfies ApiResponse);
    }

    console.error("❌ analyzeImageController error:", err);
    return res.status(500).json({
      success: false,
      error: "Could not analyze the image.",
    } satisfies ApiResponse);
  }
}
