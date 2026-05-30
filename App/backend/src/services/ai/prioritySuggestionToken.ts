import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  isReportPriorityLevel,
  type ReportPriorityLevel,
} from "@/config/reportPriority";

// Token format version; bump only if the signed payload shape changes.
const AI_PRIORITY_TOKEN_VERSION = "v1";

function getSigningSecret(): string | null {
  return (
    process.env.AI_PRIORITY_TOKEN_SECRET?.trim() ||
    process.env.JWT_ACCESS_SECRET?.trim() ||
    process.env.JWT_REFRESH_SECRET?.trim() ||
    null
  );
}

function hashImageBuffer(imageBuffer: Buffer): string {
  return createHash("sha256").update(imageBuffer).digest("hex");
}

function buildPayload(priority: ReportPriorityLevel, imageHash: string): string {
  return `${AI_PRIORITY_TOKEN_VERSION}:${priority}:${imageHash}`;
}

export function signPrioritySuggestion(params: {
  priority: ReportPriorityLevel;
  imageBuffer: Buffer;
}): string | null {
  const secret = getSigningSecret();
  if (!secret) {
    return null;
  }

  const imageHash = hashImageBuffer(params.imageBuffer);
  const payload = buildPayload(params.priority, imageHash);
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return `${AI_PRIORITY_TOKEN_VERSION}.${params.priority}.${imageHash}.${signature}`;
}

export function verifyPrioritySuggestionToken(
  token: string | null | undefined,
  imageBuffer: Buffer,
): ReportPriorityLevel | null {
  const secret = getSigningSecret();
  if (!token || !secret) {
    return null;
  }

  const [version, priority, imageHash, signature] = token.split(".");
  if (
    version !== AI_PRIORITY_TOKEN_VERSION ||
    !isReportPriorityLevel(priority) ||
    !imageHash ||
    !signature
  ) {
    return null;
  }

  const submittedImageHash = hashImageBuffer(imageBuffer);
  if (imageHash !== submittedImageHash) {
    return null;
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(buildPayload(priority, imageHash))
    .digest("hex");

  const expected = Buffer.from(expectedSignature, "hex");
  const received = Buffer.from(signature, "hex");

  if (expected.length !== received.length) {
    return null;
  }

  return timingSafeEqual(expected, received) ? priority : null;
}
