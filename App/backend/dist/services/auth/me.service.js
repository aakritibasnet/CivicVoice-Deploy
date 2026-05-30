import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
export async function meService(jwtUser) {
    const userId = jwtUser?.id;
    if (!userId || typeof userId !== "string") {
        throw new AppError("Unauthorized", 401);
    }
    const user = await prisma.users.findFirst({
        where: {
            id: userId,
            is_active: true,
            deleted_at: null,
        },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            is_active: true,
            created_at: true,
            last_login_at: true,
            must_change_password: true,
            ward_id: true,
        },
    });
    if (user) {
        return {
            ok: true,
            user: {
                ...user,
                profile_image_url: null,
            },
        };
    }
    const officer = await prisma.officers.findFirst({
        where: {
            id: userId,
            deleted_at: null,
        },
        include: {
            wards: {
                select: {
                    name: true,
                    municipality_id: true,
                    municipality: { select: { name: true } },
                },
            },
            officer_departments: {
                select: {
                    name: true,
                },
            },
        },
    });
    if (officer) {
        return {
            ok: true,
            user: {
                id: officer.id,
                name: `${officer.first_name} ${officer.last_name}`.trim(),
                email: officer.email,
                role: "officer",
                type: officer.type,
                is_active: true,
                created_at: officer.created_at,
                profile_image_url: officer.profile_image_url,
                must_change_password: officer.must_change_password,
                department_id: officer.department_id,
                department_name: officer.officer_departments.name,
                ward_id: officer.ward_id ?? null,
                ward_name: officer.wards?.name ?? null,
                // Officers have no direct municipality column — it's derived from
                // their ward. municipality_officer rows without a ward stay null.
                municipality_id: officer.wards?.municipality_id ?? null,
                municipality_name: officer.wards?.municipality?.name ?? null,
            },
        };
    }
    throw new AppError("User not found", 404);
}
