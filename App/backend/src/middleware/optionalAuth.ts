import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

type AnyJwtPayload = jwt.JwtPayload & {
  user_id?: string | number; // ✅ Add user_id
  id?: number | string;
  sub?: string | number;
  email?: string;
  role?: string;
};

/**
 * Like requireAuth but does NOT reject unauthenticated requests.
 * Sets req.user when a valid token is present,
 * or null when the token is missing / invalid.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    req.user = null as any;
    return next();
  }

  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    req.user = null as any;
    return next();
  }

  try {
    const decoded = jwt.verify(token, secret);

    if (typeof decoded === "string") {
      req.user = null as any;
      return next();
    }

    const payload = decoded as AnyJwtPayload;

    // ✅ Check user_id FIRST (matches your token format from requireAuth)
    const rawId = payload.user_id ?? payload.id ?? payload.sub;

    if (rawId == null) {
      console.warn(
        "⚠️ optionalAuth - No user ID in token. Payload keys:",
        Object.keys(payload),
      );
      req.user = null as any;
      return next();
    }

    const userId = String(rawId);

    if (!userId) {
      req.user = null as any;
      return next();
    }

    req.user = {
      id: userId,
      email: payload.email || "",
      role: payload.role || "citizen",
    };

    console.log("✅ optionalAuth - User authenticated:", req.user.id);
    return next();
  } catch (err: any) {
    console.warn("⚠️ optionalAuth - Token error:", err.message);
    req.user = null as any;
    return next();
  }
}
