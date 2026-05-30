import type { Request, Response, NextFunction } from "express";

type Role = "USER" | "ADMIN";

export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role || !allowedRoles.includes(role as Role)) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }
    next();
  };
}
