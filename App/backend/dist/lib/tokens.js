// src/lib/tokens.ts
import jwt from "jsonwebtoken";
import crypto from "crypto";
import "@/lib/env";
function mustEnv(name) {
    const v = process.env[name];
    if (!v)
        throw new Error(`${name} missing in env`);
    return v;
}
export function signAccessToken(payload) {
    const ttlMin = Number(process.env.ACCESS_TOKEN_TTL_MIN || 15);
    return jwt.sign(payload, mustEnv("JWT_ACCESS_SECRET"), {
        expiresIn: `${ttlMin}m`,
    });
}
export function signRefreshToken(payload) {
    const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
    return jwt.sign(payload, mustEnv("JWT_REFRESH_SECRET"), {
        expiresIn: `${days}d`,
    });
}
export function verifyAccessToken(token) {
    const decoded = jwt.verify(token, mustEnv("JWT_ACCESS_SECRET"));
    if (typeof decoded === "string") {
        throw new Error("Invalid access token payload");
    }
    return decoded;
}
export function verifyRefreshToken(token) {
    const decoded = jwt.verify(token, mustEnv("JWT_REFRESH_SECRET"));
    if (typeof decoded === "string") {
        throw new Error("Invalid refresh token payload");
    }
    return decoded;
}
export function hashRefreshToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}
export function refreshExpiryDate() {
    const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
