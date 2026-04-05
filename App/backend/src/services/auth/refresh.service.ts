import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { refreshSchema } from "@/schema/auth.schema";
import {
  hashRefreshToken,
  verifyRefreshToken,
} from "@/lib/tokens";
import { createSession, toAccessRole } from "@/helper/session";

export async function refreshService(body: unknown) {
  const parsed = refreshSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || "Invalid input", 400);
  }

  const { refreshToken } = parsed.data;

  let decoded: { id?: string; userId?: string };
  try {
    decoded = verifyRefreshToken(refreshToken) as { id?: string; userId?: string };
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      throw new AppError("Refresh token expired. Please login again.", 401);
    }
    throw new AppError("Invalid refresh token", 401);
  }

  const actorId = decoded.id || decoded.userId;
  if (!actorId) {
    throw new AppError("Invalid refresh token payload", 401);
  }

  const tokenHash = hashRefreshToken(refreshToken);

  const userToken = await prisma.refresh_tokens.findFirst({
    where: {
      user_id: actorId,
      token_hash: tokenHash,
    },
    include: {
      users: true,
    },
  });

  if (userToken) {
    if (userToken.revoked_at) {
      throw new AppError("Refresh token has been revoked", 401);
    }

    if (userToken.expires_at < new Date()) {
      throw new AppError("Refresh token has expired", 401);
    }

    const user = userToken.users;
    if (user.deleted_at) {
      throw new AppError("Account has been deleted", 403);
    }

    if (!user.is_active) {
      throw new AppError("Account is inactive", 403);
    }

    return prisma.$transaction(async (tx) => {
      await tx.refresh_tokens.update({
        where: { id: userToken.id },
        data: {
          revoked_at: new Date(),
        },
      });

      const tokens = await createSession(tx, {
        id: user.id,
        email: user.email,
        role: toAccessRole(user.role),
        ward_id: user.ward_id ?? null,
      });

      return {
        ...tokens,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          must_change_password: user.must_change_password,
          ward_id: user.ward_id ?? null,
        },
      };
    });
  }

  const officerToken = await prisma.officer_refresh_tokens.findFirst({
    where: {
      officer_id: actorId,
      token_hash: tokenHash,
    },
    include: {
      officers: {
        include: {
          wards: {
            select: {
              name: true,
            },
          },
          officer_departments: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  });

  if (!officerToken) {
    throw new AppError("Refresh token not found", 401);
  }

  if (officerToken.revoked_at) {
    throw new AppError("Refresh token has been revoked", 401);
  }

  if (officerToken.expires_at < new Date()) {
    throw new AppError("Refresh token has expired", 401);
  }

  const officer = officerToken.officers;
  if (officer.deleted_at) {
    throw new AppError("Account has been deleted", 403);
  }

  return prisma.$transaction(async (tx) => {
    await tx.officer_refresh_tokens.update({
      where: { id: officerToken.id },
      data: {
        revoked_at: new Date(),
      },
    });

    const tokens = await createSession(tx, {
      id: officer.id,
      email: officer.email ?? "",
      role: "officer",
      ward_id: officer.ward_id ?? null,
      isOfficer: true,
    });

    return {
      ...tokens,
      user: {
        id: officer.id,
        name: `${officer.first_name} ${officer.last_name}`.trim(),
        email: officer.email,
        role: "officer" as const,
        type: officer.type,
        must_change_password: officer.must_change_password,
        department_id: officer.department_id,
        department_name: officer.officer_departments.name,
        department_slug: officer.officer_departments.slug,
        ward_id: officer.ward_id ?? null,
        ward_name: officer.wards?.name ?? null,
      },
    };
  });
}
