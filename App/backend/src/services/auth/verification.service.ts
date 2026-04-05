import "@/lib/env";
import type { Prisma } from "@/generated/prisma-client";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { generateOtp, hashOtp, verifyOtp } from "@/lib/otp";
import { sendVerificationEmail } from "@/lib/mailer";
import { normalizeEmail } from "@/lib/normalize";

export type VerificationPurpose =
  | "EMAIL_VERIFY"
  | "PASSWORD_RESET"
  | "EMAIL_CHANGE"
  | "MOBILE_VERIFY";

function ttlMinutes(): number {
  return Number(process.env.OTP_TTL_MIN || 10);
}

function computeExpiry(): Date {
  return new Date(Date.now() + ttlMinutes() * 60 * 1000);
}

export async function sendVerificationCode(opts: {
  purpose: VerificationPurpose;
  email: string;
  target?: string;
  meta?: Record<string, unknown>;
}) {
  const emailNorm = normalizeEmail(opts.email);
  const targetNorm = normalizeEmail(opts.target ?? opts.email);

  const code = generateOtp();
  const code_hash = await hashOtp(code);
  const expires_at = computeExpiry();

  await prisma.verification_codes.create({
    data: {
      email: emailNorm,
      target: targetNorm,
      purpose: opts.purpose,
      code_hash,
      expires_at,
      ...(opts.meta ? { meta: opts.meta as Prisma.InputJsonValue } : {}),
    },
  });

  await sendVerificationEmail({ to: targetNorm, code, purpose: opts.purpose });

  return { message: "Verification code sent." };
}

export async function verifyLatestCode(opts: {
  purpose: VerificationPurpose;
  lookupEmail: string;
  code: string;
}) {
  const lookupNorm = normalizeEmail(opts.lookupEmail);
  const where =
    opts.purpose === "EMAIL_CHANGE"
      ? { target: lookupNorm, purpose: opts.purpose }
      : { email: lookupNorm, purpose: opts.purpose };

  const row = await prisma.verification_codes.findFirst({
    where,
    orderBy: {
      created_at: "desc",
    },
  });

  if (!row) {
    throw new AppError(
      "No verification code found. Please request a new one.",
      404,
    );
  }

  if (row.used_at) {
    throw new AppError("This verification code was already used.", 400);
  }

  if (row.expires_at.getTime() < Date.now()) {
    throw new AppError(
      "Verification code expired. Please request a new one.",
      400,
    );
  }

  const ok = await verifyOtp(String(opts.code), row.code_hash);
  if (!ok) {
    throw new AppError("Invalid verification code.", 400);
  }

  await prisma.verification_codes.update({
    where: {
      id: row.id,
    },
    data: {
      used_at: new Date(),
    },
  });

  return {
    message: "Code verified.",
    meta: row.meta ?? null,
    email: row.email,
    target: row.target,
  };
}
