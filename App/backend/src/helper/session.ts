import type { Prisma, user_role } from "@/generated/prisma-client";
import {
  hashRefreshToken,
  refreshExpiryDate,
  signAccessToken,
  signRefreshToken,
  type Role,
} from "@/lib/tokens";

type PrismaSessionClient = Prisma.TransactionClient;

export type SessionUser = {
  id: string;
  email: string;
  role: Role;
  ward_id?: string | null;
  isOfficer?: boolean;
};

function assertRole(role: string): Role {
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

export function toAccessRole(role: user_role | string): Role {
  return assertRole(role);
}

export async function createSession(
  tx: PrismaSessionClient,
  user: SessionUser,
) {
  const accessToken = signAccessToken({
    id: user.id,
    email: user.email,
    role: user.role,
    ward_id: user.ward_id ?? null,
  });

  const refreshToken = signRefreshToken({
    id: user.id,
  });

  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = refreshExpiryDate();

  if (user.isOfficer) {
    await tx.officer_refresh_tokens.create({
      data: {
        officer_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      },
    });

    await tx.officers.update({
      where: { id: user.id },
      data: {
        updated_at: new Date(),
      },
    });
  } else {
    await tx.refresh_tokens.create({
      data: {
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      },
    });

    await tx.users.update({
      where: { id: user.id },
      data: {
        last_login_at: new Date(),
      },
    });
  }

  return { accessToken, refreshToken };
}
