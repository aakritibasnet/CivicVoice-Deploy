import { hashRefreshToken, refreshExpiryDate, signAccessToken, signRefreshToken, } from "@/lib/tokens";
function assertRole(role) {
    if (role === "citizen" ||
        role === "officer" ||
        role === "ward" ||
        role === "municipality" ||
        role === "admin") {
        return role;
    }
    return "citizen";
}
export function toAccessRole(role) {
    return assertRole(role);
}
export async function createSession(tx, user) {
    const accessToken = signAccessToken({
        id: user.id,
        email: user.email,
        role: user.role,
        kind: user.isOfficer ? "officer" : "user",
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
    }
    else {
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
