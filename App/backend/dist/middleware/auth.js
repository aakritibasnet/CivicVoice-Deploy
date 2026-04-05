import jwt from "jsonwebtoken";
export function requireAuth(req, res, next) {
    try {
        const header = req.headers.authorization || "";
        const token = header.startsWith("Bearer ") ? header.slice(7) : null;
        if (!token) {
            return res
                .status(401)
                .json({ ok: false, message: "Missing access token" });
        }
        const secret = process.env.JWT_ACCESS_SECRET;
        if (!secret) {
            return res
                .status(500)
                .json({ ok: false, message: "Server misconfigured" });
        }
        const decoded = jwt.verify(token, secret);
        if (typeof decoded === "string") {
            return res
                .status(401)
                .json({ ok: false, message: "Invalid token payload" });
        }
        const payload = decoded;
        const userId = payload.user_id || payload.id || payload.sub;
        if (!userId) {
            return res
                .status(401)
                .json({ ok: false, message: "Token missing user id" });
        }
        req.user = {
            id: String(userId),
            email: payload.email || "",
            role: payload.role || "citizen",
            ward_id: payload.ward_id ?? null,
        };
        return next();
    }
    catch (err) {
        if (err.name === "TokenExpiredError") {
            return res.status(401).json({ ok: false, message: "Token expired" });
        }
        if (err.name === "JsonWebTokenError") {
            return res.status(401).json({ ok: false, message: "Invalid token" });
        }
        return res
            .status(401)
            .json({ ok: false, message: "Authentication failed" });
    }
}
