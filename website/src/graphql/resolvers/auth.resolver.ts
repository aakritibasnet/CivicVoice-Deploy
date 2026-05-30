import { GQLContext } from "../context";
import { generateToken, comparePassword } from "@/src/lib/auth";

export const authResolvers = {
  Query: {
    me: async (_: unknown, __: unknown, { prisma, user }: GQLContext) => {
      if (!user) return null;

      const dbUser = await prisma.users.findUnique({
        where: { id: user.id },
      });

      if (!dbUser || !dbUser.is_active) return null;

      return {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role,
        is_active: dbUser.is_active,
        ward_id: dbUser.ward_id,
        municipality_id: dbUser.municipality_id,
        created_at: dbUser.created_at,
        last_login_at: dbUser.last_login_at,
        must_change_password: dbUser.must_change_password,
      };
    },

    wards: async (_: unknown, __: unknown, { prisma, user }: GQLContext) => {
      if (user?.role === "municipality" && !user.municipalityId) {
        return [];
      }

      const where =
        user?.role === "municipality" && user.municipalityId
          ? {
              is_active: true,
              municipality_id: user.municipalityId,
            }
          : { is_active: true };

      return prisma.wards.findMany({
        where,
        orderBy: { ward_code: "asc" },
      });
    },
  },

  Mutation: {
    login: async (
      _: unknown,
      { email, password }: { email: string; password: string },
      { prisma }: GQLContext,
    ) => {
      const user = await prisma.users.findUnique({
        where: { email: email.toLowerCase().trim() },
      });

      if (!user) throw new Error("Invalid email or password");
      if (!user.is_active)
        throw new Error("Account is deactivated. Contact your administrator.");
      if (user.deleted_at) throw new Error("Account no longer exists");

      const allowedRoles = ["municipality", "ward", "admin"];
      if (!allowedRoles.includes(user.role)) {
        throw new Error(
          "Access denied. Only admin, municipality and ward can access the dashboard.",
        );
      }

      const valid = await comparePassword(password, user.password_hash);
      if (!valid) throw new Error("Invalid email or password");

      await prisma.users.update({
        where: { id: user.id },
        data: { last_login_at: new Date() },
      });

      const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
        ward_id: user.ward_id,
      });

      return {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          is_active: user.is_active,
          ward_id: user.ward_id,
          municipality_id: user.municipality_id,
          created_at: user.created_at,
          last_login_at: new Date(),
          must_change_password: user.must_change_password,
        },
      };
    },

    logout: async (_: unknown, __: unknown, { user }: GQLContext) => {
      if (!user) throw new Error("Not authenticated");
      return true;
    },
  },

  // ─── User Field Resolvers ─────────────────────────
  User: {
    ward: async (
      parent: { ward_id: string | null },
      _: unknown,
      { prisma }: GQLContext,
    ) => {
      if (!parent.ward_id) return null;

      try {
        return await prisma.wards.findUnique({
          where: { id: parent.ward_id },
        });
      } catch {
        // ward_id might be invalid UUID string
        return null;
      }
    },
  },

  // ─── Ward Field Resolvers ─────────────────────────
  Ward: {
    report_count: async (
      parent: { id: string },
      _: unknown,
      { prisma }: GQLContext,
    ) => {
      return prisma.reports.count({
        where: { ward_id: parent.id },
      });
    },
  },
};
