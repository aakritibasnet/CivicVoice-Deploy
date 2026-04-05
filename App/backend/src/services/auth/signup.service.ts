import bcrypt from "bcrypt";

import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { signupSchema } from "@/schema/auth.schema";
import { normalizeEmail } from "@/lib/normalize";
import { generateOtp, hashOtp } from "@/lib/otp";
import { sendVerificationEmail } from "@/lib/mailer";

const OTP_PURPOSE = "EMAIL_VERIFY" as const;

export async function signupService(body: unknown) {
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || "Invalid input", 400);
  }

  const { name, email, password } = parsed.data;

  const normalizedEmail = normalizeEmail(email);
  const trimmedName = name.trim();
  const password_hash = await bcrypt.hash(password, 12);

  const existingUser = await prisma.users.findUnique({
    where: {
      email: normalizedEmail,
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    throw new AppError("Email already registered. Please login.", 409);
  }

  const code = generateOtp();
  const code_hash = await hashOtp(code);
  const ttlMin = Number(process.env.OTP_TTL_MIN || 10);
  const expires_at = new Date(Date.now() + ttlMin * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.pending_users.upsert({
      where: {
        email: normalizedEmail,
      },
      update: {
        name: trimmedName,
        password_hash,
      },
      create: {
        name: trimmedName,
        email: normalizedEmail,
        password_hash,
        role: "citizen",
      },
    });

    await tx.verification_codes.create({
      data: {
        email: normalizedEmail,
        target: normalizedEmail,
        purpose: OTP_PURPOSE,
        code_hash,
        expires_at,
      },
    });
  });

  await sendVerificationEmail({
    to: normalizedEmail,
    code,
    purpose: OTP_PURPOSE,
  });

  return {
    message:
      "Verification code sent to email. Please verify to complete signup.",
  };
}
