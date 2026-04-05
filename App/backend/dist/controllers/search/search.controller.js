import { getPublicOfficerDetail, searchDirectory, searchReports, } from "@/services/search/search.service";
export async function searchReportsController(req, res, next) {
    try {
        const query = String(req.query.q || "").trim();
        const scope = req.query.scope || "general";
        const category = req.query.category || null;
        const status = req.query.status || null;
        const startDate = req.query.startDate || null;
        const endDate = req.query.endDate || null;
        const page = Math.max(1, Number.parseInt(req.query.page || "1", 10));
        const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit || "20", 10)));
        const neLat = Number.parseFloat(req.query.neLat);
        const neLng = Number.parseFloat(req.query.neLng);
        const swLat = Number.parseFloat(req.query.swLat);
        const swLng = Number.parseFloat(req.query.swLng);
        const bounds = Number.isFinite(neLat) &&
            Number.isFinite(neLng) &&
            Number.isFinite(swLat) &&
            Number.isFinite(swLng)
            ? { neLat, neLng, swLat, swLng }
            : null;
        const result = await searchReports({
            query,
            scope,
            category,
            status,
            startDate,
            endDate,
            bounds,
            page,
            limit,
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (err) {
        next(err);
    }
}
export async function searchDirectoryController(req, res, next) {
    try {
        const query = String(req.query.q || "").trim();
        const limit = Math.min(20, Math.max(1, Number.parseInt(req.query.limit || "8", 10)));
        const result = await searchDirectory(query, limit);
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (err) {
        next(err);
    }
}
export async function getPublicOfficerDetailController(req, res, next) {
    try {
        const result = await getPublicOfficerDetail(req.params.officerId);
        if (!result.officer) {
            return res.status(404).json({
                success: false,
                error: "Officer not found",
            });
        }
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (err) {
        next(err);
    }
}
