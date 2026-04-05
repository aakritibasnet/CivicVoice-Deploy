import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { hashRefreshToken, verifyRefreshToken } from "@/lib/tokens";
import { logoutSchema } from "@/schema/auth.schema";

export async function logoutService(body: unknown) {
  const parsed = logoutSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || "Invalid input", 400);
  }

  const { refreshToken } = parsed.data;

  let payload: { id?: string; userId?: string };
  try {
    payload = verifyRefreshToken(refreshToken) as { id?: string; userId?: string };
  } catch {
    throw new AppError("Invalid refresh token", 401);
  }

  const actorId = payload.id || payload.userId;
  if (!actorId) {
    throw new AppError("Invalid refresh token payload", 401);
  }

  const tokenHash = hashRefreshToken(refreshToken);

  const [userResult, officerResult] = await Promise.all([
    prisma.refresh_tokens.updateMany({
      where: {
        user_id: actorId,
        token_hash: tokenHash,
        revoked_at: null,
      },
      data: {
        revoked_at: new Date(),
      },
    }),
    prisma.officer_refresh_tokens.updateMany({
      where: {
        officer_id: actorId,
        token_hash: tokenHash,
        revoked_at: null,
      },
      data: {
        revoked_at: new Date(),
      },
    }),
  ]);

  if (userResult.count === 0 && officerResult.count === 0) {
    throw new AppError("Refresh token not found", 401);
  }

  return { message: "Logged out successfully" };
}
