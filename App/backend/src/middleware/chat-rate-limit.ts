// Per-principal rate limiting for chat message send.
// Uses express-rate-limit with a key derived from the authenticated principal
// (kind:id) rather than IP so shared IPs (NAT, proxies) don't bucket together.
//
// Socket-level typing events are capped in chat-namespace.ts via a simple
// per-socket sliding window rather than a full token bucket — typing spam
// is cosmetic and not worth a DB round-trip.

import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request, Response } from "express";

const WINDOW_MS = Number(process.env.CHAT_RATE_WINDOW_MS || 5_000);
const MAX = Number(process.env.CHAT_RATE_MAX || 10);

export const chatSendRateLimit = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // Key by authenticated principal so NAT-shared IPs are not bucketed together.
  // Fall back to ipKeyGenerator for unauthenticated requests (IPv6-safe).
  keyGenerator: (req: Request) => {
    const u = (req as Request & { user?: { id?: string; kind?: string } }).user;
    return u?.id ? `${u.kind ?? "user"}:${u.id}` : ipKeyGenerator(req.ip ?? "");
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: "Too many messages — slow down",
    });
  },
  skip: (req: Request) => {
    // Let through non-text message types (attachments have their own upload limit).
    return req.body?.type && req.body.type !== "text";
  },
});

// ── Socket-level typing throttle ────────────────────────────────────────────
// Exported so chat-namespace.ts can call it. Returns false when the socket
// should be rate-limited (suppress the event), true otherwise.

const TYPING_WINDOW_MS = 3_000;
const TYPING_MAX = 5;

type TypingBucket = { count: number; resetAt: number };
const typingBuckets = new WeakMap<object, TypingBucket>();

export function shouldAllowTyping(socketRef: object): boolean {
  const now = Date.now();
  const bucket = typingBuckets.get(socketRef);
  if (!bucket || now >= bucket.resetAt) {
    typingBuckets.set(socketRef, { count: 1, resetAt: now + TYPING_WINDOW_MS });
    return true;
  }
  if (bucket.count >= TYPING_MAX) return false;
  bucket.count += 1;
  return true;
}
