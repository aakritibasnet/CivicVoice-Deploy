// src/middleware/wardAuth.ts
import type { Request, Response, NextFunction } from "express";

/**
 * Middleware that ensures the authenticated user belongs to a ward.
 * Must be used AFTER requireAuth middleware.
 * Attaches req.user.ward_id (already set by auth middleware from JWT).
 */
export function requireWardUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }

  if (!req.user.ward_id) {
    return res.status(403).json({
      ok: false,
      message: "Access denied: not a ward user",
    });
  }

  next();
}

/**
 * Middleware that ensures the ward user has a ward-level admin role.
 */
export function requireWardAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }

  const role = req.user.role;
  if (role !== "ward" && role !== "admin") {
    return res.status(403).json({
      ok: false,
      message: "Access denied: requires ward or admin role",
    });
  }

  next();
}
