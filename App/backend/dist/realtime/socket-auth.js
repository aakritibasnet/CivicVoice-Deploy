// Socket.IO handshake auth — the realtime equivalent of requireAuth.
// Validates the access token, resolves the principal across the dual
// users/officers identity, and rejects unauthenticated sockets. Reuses the
// exact JWT secret + resolvePrincipal the REST layer uses.
import jwt from "jsonwebtoken";
import { resolvePrincipal, } from "@/services/chat/principal";
function extractToken(socket) {
    const fromAuth = socket.handshake.auth?.token;
    if (typeof fromAuth === "string" && fromAuth) {
        return fromAuth.startsWith("Bearer ") ? fromAuth.slice(7) : fromAuth;
    }
    const header = socket.handshake.headers?.authorization || "";
    return header.startsWith("Bearer ") ? header.slice(7) : null;
}
export async function socketAuthMiddleware(socket, next) {
    try {
        // WSS only in prod (plan Part 4): reject plaintext transport unless a
        // TLS-terminating proxy says otherwise.
        if (process.env.NODE_ENV === "production") {
            const proto = socket.handshake.headers["x-forwarded-proto"];
            const secure = socket.handshake.secure ||
                (typeof proto === "string" && proto.split(",")[0] === "https");
            if (!secure) {
                return next(new Error("TLS required"));
            }
        }
        const token = extractToken(socket);
        if (!token)
            return next(new Error("Missing access token"));
        const secret = process.env.JWT_ACCESS_SECRET;
        if (!secret)
            return next(new Error("Server misconfigured"));
        const decoded = jwt.verify(token, secret);
        if (typeof decoded === "string") {
            return next(new Error("Invalid token payload"));
        }
        const payload = decoded;
        const id = payload.id || payload.user_id || payload.sub;
        if (!id)
            return next(new Error("Token missing principal id"));
        const principal = await resolvePrincipal({
            id: String(id),
            role: payload.role,
            kind: payload.kind,
        });
        socket.data.principal = principal;
        return next();
    }
    catch (err) {
        const name = err?.name;
        if (name === "TokenExpiredError")
            return next(new Error("Token expired"));
        return next(new Error("Authentication failed"));
    }
}
