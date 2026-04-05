/**
 * Middleware that ensures the authenticated user is an officer.
 * Must be used AFTER requireAuth middleware.
 */
export function requireOfficerRole(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ ok: false, message: "Unauthorized" });
    }
    if (req.user.role !== "officer") {
        return res.status(403).json({
            ok: false,
            message: "Access denied: officer role required",
        });
    }
    next();
}
