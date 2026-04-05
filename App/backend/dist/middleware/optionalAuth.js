import jwt from "jsonwebtoken";
/**
 * Like requireAuth but does NOT reject unauthenticated requests.
 * Sets req.user when a valid token is present,
 * or null when the token is missing / invalid.
 */
export function optionalAuth(req, _res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
        req.user = null;
        return next();
    }
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
        req.user = null;
        return next();
    }
    try {
        const decoded = jwt.verify(token, secret);
        if (typeof decoded === "string") {
            req.user = null;
            return next();
        }
        const payload = decoded;
        // ✅ Check user_id FIRST (matches your token format from requireAuth)
        const rawId = payload.user_id ?? payload.id ?? payload.sub;
        if (rawId == null) {
            console.warn("⚠️ optionalAuth - No user ID in token. Payload keys:", Object.keys(payload));
            req.user = null;
            return next();
        }
        const userId = String(rawId);
        if (!userId) {
            req.user = null;
            return next();
        }
        req.user = {
            id: userId,
            email: payload.email || "",
            role: payload.role || "citizen",
        };
        console.log("✅ optionalAuth - User authenticated:", req.user.id);
        return next();
    }
    catch (err) {
        console.warn("⚠️ optionalAuth - Token error:", err.message);
        req.user = null;
        return next();
    }
}
