import bcrypt from "bcrypt";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/normalize";
import { sendVerificationCode, verifyLatestCode, } from "@/services/auth/verification.service";
const forgotPasswordSchema = z.object({
    email: z.string().email("Invalid email"),
});
const resetPasswordSchema = z.object({
    email: z.string().email("Invalid email"),
    code: z.string().min(4, "code is required"),
    new_password: z.string().min(6, "Password must be at least 6 chars"),
});
export async function forgotPasswordService(body) {
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
        throw new AppError(parsed.error.issues[0]?.message || "Invalid input", 400);
    }
    const email = normalizeEmail(parsed.data.email);
    const user = await prisma.users.findUnique({
        where: {
            email,
        },
        select: {
            id: true,
        },
    });
    const exists = Boolean(user);
    if (exists) {
        await sendVerificationCode({
            email,
            target: email,
            purpose: "PASSWORD_RESET",
            meta: { email },
        });
    }
    return { message: "Reset code sent.", exists };
}
export async function resetPasswordService(body) {
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
        throw new AppError(parsed.error.issues[0]?.message || "Invalid input", 400);
    }
    const email = normalizeEmail(parsed.data.email);
    await verifyLatestCode({
        purpose: "PASSWORD_RESET",
        lookupEmail: email,
        code: parsed.data.code,
    });
    const password_hash = await bcrypt.hash(parsed.data.new_password, 12);
    const user = await prisma.users.update({
        where: {
            email,
        },
        data: {
            password_hash,
        },
        select: {
            id: true,
        },
    }).catch(() => null);
    if (!user) {
        throw new AppError("User not found", 404);
    }
    await prisma.refresh_tokens.updateMany({
        where: {
            user_id: user.id,
            revoked_at: null,
        },
        data: {
            revoked_at: new Date(),
        },
    });
    return { message: "Password reset successful. Please login again." };
}
