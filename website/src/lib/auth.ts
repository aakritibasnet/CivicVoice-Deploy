import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "./prisma";

const JWT_SECRET = process.env.JWT_SECRET!;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set");
}

export interface AuthWard {
  id: string;
  name: string;
  ward_code: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "municipality" | "ward";
  ward_id: string | null;
  must_change_password: boolean;
  ward: AuthWard | null;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: string;
  wardId: string | null;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: {
  id: string;
  email: string;
  role: string;
  ward_id?: string | null;
}) {
  return jwt.sign(
    {
      // Legacy fields used by website GraphQL context (verifyToken → AuthTokenPayload)
      userId: payload.id,
      wardId: payload.ward_id ?? null,
      // Fields required by backend chat module (requireAuth + socketAuthMiddleware)
      id: payload.id,
      kind: "user" as const,
      ward_id: payload.ward_id ?? null,
      // Common
      email: payload.email,
      role: payload.role,
    },
    JWT_SECRET,
    { expiresIn: "30d" },
  );
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export async function authenticateUser(emailInput: string, password: string) {
  const email = emailInput.toLowerCase().trim();

  const user = await prisma.users.findUnique({
    where: { email },
  });

  if (!user) {
    throw new Error("Invalid email or password");
  }

  if (user.deleted_at) {
    throw new Error("Account no longer exists");
  }

  if (!user.is_active) {
    throw new Error("Your account has been deactivated");
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);

  if (!isValidPassword) {
    throw new Error("Invalid email or password");
  }

  const allowedRoles = ["ward", "municipality", "admin"];

  // Ensure type match by explicit cast + checks
  const role = user.role as "admin" | "municipality" | "ward";

  if (!allowedRoles.includes(role)) {
    throw new Error("Access denied. Dashboard access is restricted");
  }

  await prisma.users.update({
    where: { id: user.id },
    data: { last_login_at: new Date() },
  });

  let wardObj: AuthWard | null = null;

  if (user.ward_id) {
    const wardData = await prisma.wards.findUnique({
      where: { id: user.ward_id },
      select: { id: true, name: true, ward_code: true },
    });

    if (wardData) {
      wardObj = wardData;
    }
  }

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role,
    ward_id: user.ward_id,
    must_change_password: user.must_change_password,
    ward: wardObj,
  };

  const token = generateToken({
    id: user.id,
    email: user.email,
    role,
    ward_id: user.ward_id,
  });

  return { user: authUser, token };
}
