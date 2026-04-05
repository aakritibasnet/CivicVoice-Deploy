import { createReportService, listMyReportsService, listPublicReportsService, claimReportsService, findSimilarReports, } from "../../services/reports/reports.service";
import { awardBadgesForUser } from "@/services/gamification/badges.service";
import { notifyWardUsersOfNewReport } from "@/services/notifications/triggers.service";
// ─── Create Report (authenticated or anonymous) ──────────────────────
export async function createReportController(req, res) {
    try {
        // ✅ Use proper typing (req.user is defined in your global types)
        const userId = req.user?.id ?? null;
        // 🔍 Debug logging
        console.log("🔍 createReportController - userId:", userId);
        console.log("🔍 createReportController - req.user:", req.user);
        console.log("🔍 createReportController - headers:", req.headers.authorization);
        const file = req.file;
        if (!file) {
            return res.status(400).json({
                success: false,
                error: "Media file is required",
            });
        }
        const { title, description, media_type, category, is_public, location_lat, location_lng, location_accuracy_m, device_id, } = req.body;
        // 🔍 Debug what's being sent to service
        console.log("🔍 Calling createReportService with userId:", userId);
        const report = await createReportService({
            userId, // ✅ This should be a string UUID or null
            deviceId: userId === null ? device_id || null : null,
            fileBuffer: file.buffer,
            mediaType: media_type,
            title,
            description,
            category,
            isPublic: is_public === "false" ? false : true,
            locationLat: location_lat,
            locationLng: location_lng,
            locationAccuracyM: location_accuracy_m,
            address: req.body.address || null,
        });
        // 🔍 Check what came back
        console.log("✅ Report created:", {
            id: report.id,
            user_id: report.user_id,
            device_id: report.device_id,
        });
        try {
            await notifyWardUsersOfNewReport(report.id);
        }
        catch (err) {
            console.error("createReportController ward notification error:", err);
        }
        let newlyEarnedBadges = [];
        if (userId !== null) {
            try {
                // ⚠️ If your badges service expects a number, you need to fix it
                // Otherwise, pass userId as string
                newlyEarnedBadges = await awardBadgesForUser(userId);
            }
            catch (err) {
                console.error("createReportController badge award error:", err);
            }
        }
        return res.status(201).json({
            success: true,
            data: {
                message: "Report created",
                report,
                wardName: report.ward_name || null,
                newlyEarnedBadges,
            },
        });
    }
    catch (err) {
        console.error("❌ createReportController error:", err);
        return res.status(500).json({
            success: false,
            error: err?.message || "Server error",
        });
    }
}
// ─── My Reports ──────────────────────────────────────────────────────
export async function myReportsController(req, res) {
    try {
        const userId = req.user?.id; // ✅ Use proper typing
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
            });
        }
        console.log("🔍 myReportsController - userId:", userId);
        const reports = await listMyReportsService({ userId });
        return res.json({
            success: true,
            data: { reports },
        });
    }
    catch (err) {
        console.error("❌ myReportsController error:", err);
        return res.status(500).json({
            success: false,
            error: "Server error",
        });
    }
}
// ─── Public Reports (paginated) ──────────────────────────────────────
export async function publicReportsController(req, res) {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 500));
        const category = req.query.category;
        const status = req.query.status || null;
        const escalated = req.query.escalated === "true";
        const timeRangeRaw = req.query.timeRange || "all";
        const timeRange = timeRangeRaw === "24h" ||
            timeRangeRaw === "7d" ||
            timeRangeRaw === "30d" ||
            timeRangeRaw === "all"
            ? timeRangeRaw
            : "all";
        const userLat = parseFloat(req.query.lat);
        const userLng = parseFloat(req.query.lng);
        const radius = parseFloat(req.query.radius);
        const neLat = parseFloat(req.query.neLat);
        const neLng = parseFloat(req.query.neLng);
        const swLat = parseFloat(req.query.swLat);
        const swLng = parseFloat(req.query.swLng);
        const bounds = Number.isFinite(neLat) &&
            Number.isFinite(neLng) &&
            Number.isFinite(swLat) &&
            Number.isFinite(swLng)
            ? { neLat, neLng, swLat, swLng }
            : null;
        const actorId = req.user?.id ?? null;
        const actorRole = req.user?.role ?? null;
        const result = await listPublicReportsService({
            page,
            limit,
            category: category ?? null,
            status,
            escalated: escalated || null,
            timeRange,
            userLat: Number.isFinite(userLat) ? userLat : null,
            userLng: Number.isFinite(userLng) ? userLng : null,
            radius: Number.isFinite(radius) ? radius : 5000,
            bounds,
            actorId,
            actorRole,
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (err) {
        console.error("❌ publicReportsController error:", err);
        return res.status(500).json({
            success: false,
            error: "Server error",
        });
    }
}
// ─── Claim Anonymous Reports ─────────────────────────────────────────
export async function claimReportsController(req, res) {
    try {
        const userId = req.user?.id; // ✅ Use proper typing
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
            });
        }
        const { deviceId, reportIds } = req.body;
        if (!deviceId || typeof deviceId !== "string") {
            return res.status(400).json({
                success: false,
                error: "deviceId is required",
            });
        }
        if (!Array.isArray(reportIds) || reportIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: "reportIds must be a non-empty array",
            });
        }
        console.log("🔍 claimReportsController:", { userId, deviceId, reportIds });
        const result = await claimReportsService({ userId, deviceId, reportIds });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (err) {
        console.error("❌ claimReportsController error:", err);
        return res.status(500).json({
            success: false,
            error: "Server error",
        });
    }
}
// ─── Find Similar Reports (duplicate detection) ─────────────────────
export async function similarReportsController(req, res) {
    try {
        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);
        const category = req.query.category;
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !category) {
            return res.status(400).json({
                success: false,
                error: "lat, lng, and category are required",
            });
        }
        const radius = Math.min(2000, Math.max(100, parseInt(req.query.radius) || 500));
        const actorId = req.user?.id ?? null;
        const actorRole = req.user?.role ?? null;
        const reports = await findSimilarReports(lat, lng, category, radius, 5, actorId, actorRole);
        return res.json({
            success: true,
            data: { reports, count: reports.length },
        });
    }
    catch (err) {
        console.error("similarReportsController error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
}
