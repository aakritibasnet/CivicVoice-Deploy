import { NextRequest } from "next/server";
import prisma from "@/src/lib/prisma";
import { verifyToken } from "@/src/lib/auth";
import { enforceReportWorkflowAutomation } from "@/src/lib/reportWorkflowEnforcer";

export interface GQLUser {
  id: string;
  email: string;
  role: string;
  wardId: string | null;
  municipalityId: string | null;
}

export interface GQLContext {
  req: NextRequest;
  prisma: typeof prisma;
  user: GQLUser | null;
}

export async function createContext(req: NextRequest): Promise<GQLContext> {
  const authHeader = req.headers.get("authorization");
  let user: GQLUser | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);

    if (payload) {
      const dbUser = await prisma.users.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          email: true,
          role: true,
          ward_id: true,
          municipality_id: true,
          is_active: true,
          deleted_at: true,
        },
      });

      if (dbUser && dbUser.is_active && !dbUser.deleted_at) {
        user = {
          id: dbUser.id,
          email: dbUser.email,
          role: dbUser.role,
          wardId: dbUser.ward_id ?? null,
          municipalityId: dbUser.municipality_id ?? null,
        };
      }
    }
  }

  if (user && ["ward", "municipality", "admin"].includes(user.role)) {
    await enforceReportWorkflowAutomation(prisma);
  }

  return {
    req,
    prisma,
    user,
  };
}
