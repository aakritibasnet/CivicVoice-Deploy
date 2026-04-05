import bcrypt from "bcrypt";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/schema/auth.schema";
import { normalizeEmail } from "@/lib/normalize";
import { createSession, toAccessRole } from "@/helper/session";
export async function loginService(body) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
        throw new AppError(parsed.error.issues[0]?.message || "Invalid input", 400);
    }
    const { email, password } = parsed.data;
    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.users.findFirst({
        where: {
            email: normalizedEmail,
        },
        select: {
            id: true,
            name: true,
            email: true,
            password_hash: true,
            role: true,
            deleted_at: true,
            is_active: true,
            must_change_password: true,
            ward_id: true,
        },
    });
    if (user) {
        if (user.deleted_at) {
            throw new AppError("This account has been deleted.", 403);
        }
        if (!user.is_active) {
            throw new AppError("Account is inactive", 403);
        }
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) {
            throw new AppError("Invalid email or password", 401);
        }
        return prisma.$transaction(async (tx) => {
            const tokens = await createSession(tx, {
                id: user.id,
                email: user.email,
                role: toAccessRole(user.role),
                ward_id: user.ward_id ?? null,
            });
            return {
                message: "Login successful",
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    must_change_password: user.must_change_password,
                    ward_id: user.ward_id ?? null,
                },
                ...tokens,
            };
        });
    }
    const officer = await prisma.officers.findFirst({
        where: {
            email: normalizedEmail,
        },
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
    });
    if (officer) {
        if (officer.deleted_at) {
            throw new AppError("This account has been deleted.", 403);
        }
        if (!officer.password_hash) {
            throw new AppError("Your account has no password set. Please contact your administrator.", 403);
        }
        const ok = await bcrypt.compare(password, officer.password_hash);
        if (!ok) {
            throw new AppError("Invalid email or password", 401);
        }
        return prisma.$transaction(async (tx) => {
            const tokens = await createSession(tx, {
                id: officer.id,
                email: officer.email ?? normalizedEmail,
                role: "officer",
                ward_id: officer.ward_id ?? null,
                isOfficer: true,
            });
            return {
                message: "Login successful",
                user: {
                    id: officer.id,
                    name: `${officer.first_name} ${officer.last_name}`.trim(),
                    email: officer.email,
                    role: "officer",
                    type: officer.type,
                    must_change_password: officer.must_change_password,
                    department_id: officer.department_id,
                    department_name: officer.officer_departments.name,
                    department_slug: officer.officer_departments.slug,
                    ward_id: officer.ward_id ?? null,
                    ward_name: officer.wards?.name ?? null,
                },
                ...tokens,
            };
        });
    }
    const pendingUser = await prisma.pending_users.findUnique({
        where: {
            email: normalizedEmail,
        },
        select: {
            id: true,
        },
    });
    if (pendingUser) {
        throw new AppError("Email not verified. Please verify your email first.", 403);
    }
    throw new AppError("Account not found. Please sign up.", 404);
}
