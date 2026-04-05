import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { verifyOtp } from "@/lib/otp";
import { normalizeEmail } from "@/lib/normalize";
import { verifyEmailSchema } from "@/schema/auth.schema";
import { createSession, toAccessRole } from "@/helper/session";

const OTP_PURPOSE = "EMAIL_VERIFY" as const;

function normalizePendingRole(role: string) {
  if (
    role === "citizen" ||
    role === "officer" ||
    role === "ward" ||
    role === "municipality" ||
    role === "admin"
  ) {
    return role;
  }

  return "citizen";
}

export async function verifyEmailService(body: unknown) {
  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || "Invalid input", 400);
  }

  const { email, code } = parsed.data;
  const normalizedEmail = normalizeEmail(email);

  const otp = await prisma.verification_codes.findFirst({
    where: {
      email: normalizedEmail,
      purpose: OTP_PURPOSE,
    },
    orderBy: {
      created_at: "desc",
    },
  });

  if (!otp) {
    throw new AppError(
      "No verification code found. Please sign up again.",
      404,
    );
  }

  if (!otp.target) {
    throw new AppError(
      "Verification data is missing. Please request a new verification code.",
      400,
    );
  }

  if (normalizeEmail(otp.target) !== normalizedEmail) {
    throw new AppError(
      "Verification target mismatch. Please request a new verification code.",
      400,
    );
  }

  if (otp.used_at) {
    throw new AppError("This verification code has already been used.", 400);
  }

  if (otp.expires_at.getTime() < Date.now()) {
    throw new AppError(
      "Verification code expired. Please request a new code.",
      400,
    );
  }

  const ok = await verifyOtp(String(code), otp.code_hash);
  if (!ok) {
    throw new AppError("Invalid verification code.", 400);
  }

  const pending = await prisma.pending_users.findUnique({
    where: {
      email: normalizedEmail,
    },
  });

  if (!pending) {
    throw new AppError("No pending signup found. Please sign up again.", 404);
  }

  return prisma.$transaction(async (tx) => {
    const createdUser = await tx.users.create({
      data: {
        name: pending.name,
        email: pending.email,
        password_hash: pending.password_hash,
        role: normalizePendingRole(pending.role),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        created_at: true,
      },
    });

    await tx.verification_codes.delete({
      where: {
        id: otp.id,
      },
    });

    await tx.pending_users.delete({
      where: {
        id: pending.id,
      },
    });

    const tokens = await createSession(tx, {
      id: createdUser.id,
      email: createdUser.email,
      role: toAccessRole(createdUser.role),
    });

    return {
      message: "Email verified. Account created successfully.",
      user: createdUser,
      ...tokens,
    };
  });
}
