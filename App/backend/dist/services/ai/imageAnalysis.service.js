// src/services/ai/imageAnalysis.service.ts
// Gemini Vision auto-fill: given a civic-issue photo, suggest a category,
// title, description, and priority to pre-fill the citizen report form.
//
// Design notes:
// - No SDK dependency: uses the Generative Language REST API via global fetch
//   (Node 18+/22 has fetch built in).
// - Degrades gracefully: when GEMINI_API_KEY is absent or the call fails,
//   we throw AiUnavailableError so the controller can tell the client to
//   fall back to manual entry instead of 500-ing.
import { AppError } from "@/lib/errors";
// Keep in sync with mobile App/mobile/components/ui/common/CategoryDropdown.tsx
export const REPORT_CATEGORIES = [
    "Road Damage",
    "Waste Management",
    "Water Supply",
    "Street Lights",
    "Public Safety",
    "Drainage Issue",
    "Traffic Signal Problem",
    "Illegal Dumping",
    "Sidewalk Damage",
];
// Matches the priority_level enum in prisma/schema.prisma.
export const PRIORITY_LEVELS = ["low", "medium", "high", "critical"];
/** Thrown when AI is not configured or the upstream call fails. */
export class AiUnavailableError extends AppError {
    constructor(message) {
        // 503: the request is fine, the AI dependency just isn't available.
        super(message, 503);
        this.name = "AiUnavailableError";
    }
}
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 20000;
export function isAiConfigured() {
    return Boolean(process.env.GEMINI_API_KEY?.trim());
}
const PROMPT = `You are assisting a civic-issue reporting app used by citizens in Nepal.
Look at the attached photo of a public/civic infrastructure problem and produce a draft report.

Rules:
- "category" MUST be exactly one of the allowed values.
- "title": a short, specific headline (max ~60 characters), no quotes, no trailing period.
- "description": 1-2 plain sentences describing only what is visibly wrong, factual, no speculation about cause.
- "suggested_priority": judge by public safety / urgency:
  - critical: immediate danger to life (live wires, deep open manhole, collapsed structure)
  - high: significant hazard or major disruption affecting many people
  - medium: should be fixed soon but not dangerous right now
  - low: minor or cosmetic
- If the photo does not clearly show a civic issue, choose the closest category and say so briefly in the description.
Respond with JSON only.`;
function coerceCategory(value) {
    const match = REPORT_CATEGORIES.find((c) => c.toLowerCase() === String(value ?? "").trim().toLowerCase());
    return match ?? "Public Safety";
}
function coercePriority(value) {
    const v = String(value ?? "").trim().toLowerCase();
    return PRIORITY_LEVELS.includes(v)
        ? v
        : "medium";
}
function clampText(value, max) {
    const s = String(value ?? "").trim().replace(/\s+/g, " ");
    return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
/**
 * Analyze a civic-issue image and return suggested report fields.
 * @throws {AiUnavailableError} when AI is not configured or the call fails.
 */
export async function analyzeReportImage(imageBuffer, mimeType) {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
        throw new AiUnavailableError("AI image analysis is not configured.");
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
    const body = {
        contents: [
            {
                role: "user",
                parts: [
                    { text: PROMPT },
                    {
                        inline_data: {
                            mime_type: mimeType || "image/jpeg",
                            data: imageBuffer.toString("base64"),
                        },
                    },
                ],
            },
        ],
        generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    category: { type: "STRING", enum: [...REPORT_CATEGORIES] },
                    title: { type: "STRING" },
                    description: { type: "STRING" },
                    suggested_priority: { type: "STRING", enum: [...PRIORITY_LEVELS] },
                },
                required: ["category", "title", "description", "suggested_priority"],
            },
        },
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res;
    try {
        res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    }
    catch (err) {
        const reason = err?.name === "AbortError" ? "timed out" : "could not be reached";
        throw new AiUnavailableError(`AI image analysis ${reason}.`);
    }
    finally {
        clearTimeout(timeout);
    }
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error(`Gemini analyze-image failed: ${res.status} ${res.statusText} ${detail.slice(0, 500)}`);
        throw new AiUnavailableError("AI image analysis failed. Please fill the form manually.");
    }
    const json = (await res.json().catch(() => null));
    if (json?.promptFeedback?.blockReason) {
        throw new AiUnavailableError("The photo could not be analyzed. Please fill the form manually.");
    }
    const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
        throw new AiUnavailableError("AI returned no result. Please fill the form manually.");
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new AiUnavailableError("AI returned an unreadable result. Please fill the form manually.");
    }
    const title = clampText(parsed.title, 80);
    const description = clampText(parsed.description, 500);
    if (!title || !description) {
        throw new AiUnavailableError("AI result was incomplete. Please fill the form manually.");
    }
    return {
        category: coerceCategory(parsed.category),
        title,
        description,
        suggested_priority: coercePriority(parsed.suggested_priority),
    };
}
