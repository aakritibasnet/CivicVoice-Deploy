// src/lib/tokens.ts
import jwt, { type JwtPayload } from "jsonwebtoken";
import crypto from "crypto";
import "@/lib/env";

export type Role = "citizen" | "officer" | "ward" | "municipality" | "admin";

/**
 * Principal kind. The `users` and `officers` tables have independent UUID
 * spaces, and `users.role` may itself be `officer` (enum default), so the
 * role string is NOT a reliable discriminator. Tokens now carry an explicit
 * `kind` so `resolvePrincipal` can deterministically pick the table.
 */
export type PrincipalKind = "user" | "officer";

export type AccessTokenPayload = {
  id: string;
  email: string;
  role: Role;
  kind: PrincipalKind;
  ward_id?: string | number | null;
};

export type RefreshTokenPayload = {
  id: string;
};

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing in env`);
  return v;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const ttlMin = Number(process.env.ACCESS_TOKEN_TTL_MIN || 15);
  return jwt.sign(payload, mustEnv("JWT_ACCESS_SECRET"), {
    expiresIn: `${ttlMin}m`,
  });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
  return jwt.sign(payload, mustEnv("JWT_REFRESH_SECRET"), {
    expiresIn: `${days}d`,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, mustEnv("JWT_ACCESS_SECRET"));
  if (typeof decoded === "string") {
    throw new Error("Invalid access token payload");
  }
  return decoded as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, mustEnv("JWT_REFRESH_SECRET"));
  if (typeof decoded === "string") {
    throw new Error("Invalid refresh token payload");
  }
  return decoded;
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function refreshExpiryDate(): Date {
  const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
