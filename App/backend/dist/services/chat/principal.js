// Resolves an authenticated request principal to its chat-scoping context.
//
// The `users` and `officers` tables have independent UUID spaces, and
// `users.role` defaults to `officer`, so the role string alone cannot tell
// the two apart. We trust the token's explicit `kind` claim when present
// (issued since the chat-module change) and fall back to a table probe for
// legacy tokens. This is the single source of truth every chat REST and
// socket handler must use before touching chat data.
import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";
// Fallback selects exactly one municipality scope for legacy municipality
// officers that are not attached to a ward. Keep this at 1 unless officers gain
// explicit multi-municipality assignments.
const MUNICIPALITY_OFFICER_SCOPE_FALLBACK_LIMIT = 1;
async function loadUser(id) {
    const { rows } = await pool.query(`SELECT u.id,
            u.role::text                                    AS role,
            u.ward_id,
            COALESCE(u.municipality_id, w.municipality_id)   AS municipality_id
       FROM users u
       LEFT JOIN wards w ON w.id = u.ward_id::uuid
      WHERE u.id = $1 AND u.deleted_at IS NULL`, [id]);
    const r = rows[0];
    if (!r)
        return null;
    return {
        kind: "user",
        id: r.id,
        role: r.role,
        officerType: null,
        wardId: r.ward_id ?? null,
        municipalityId: r.municipality_id ?? null,
        departmentId: null,
    };
}
async function loadOfficer(id) {
    const { rows } = await pool.query(`SELECT o.id,
            o.type::text       AS officer_type,
            o.ward_id,
            o.department_id,
            w.municipality_id
       FROM officers o
       LEFT JOIN wards w ON w.id = o.ward_id
      WHERE o.id = $1 AND o.deleted_at IS NULL`, [id]);
    const r = rows[0];
    if (!r)
        return null;
    let municipalityId = r.municipality_id ?? null;
    if (r.officer_type === "municipality_officer" && !municipalityId) {
        municipalityId = await inferMunicipalityScopeForOfficer();
    }
    return {
        kind: "officer",
        id: r.id,
        role: "officer",
        officerType: r.officer_type,
        wardId: r.ward_id ?? null,
        municipalityId,
        departmentId: r.department_id ?? null,
    };
}
async function inferMunicipalityScopeForOfficer() {
    const { rows } = await pool.query(`SELECT w.municipality_id
       FROM reports r
       JOIN wards w ON w.id::text = r.ward_id::text
      WHERE w.municipality_id IS NOT NULL
        AND (
          r.assigned_level = 'municipality'
          OR r.escalated_to_municipality = true
        )
      GROUP BY w.municipality_id
      ORDER BY COUNT(*) DESC, w.municipality_id ASC
      LIMIT $1`, [MUNICIPALITY_OFFICER_SCOPE_FALLBACK_LIMIT]);
    return rows[0]?.municipality_id ?? null;
}
export async function resolvePrincipal(input) {
    if (!input?.id) {
        throw new AppError("Unauthenticated", 401);
    }
    if (input.kind === "officer") {
        const o = await loadOfficer(input.id);
        if (o)
            return o;
    }
    else if (input.kind === "user") {
        const u = await loadUser(input.id);
        if (u)
            return u;
    }
    // Legacy token (no `kind`) or the claimed table had no row: probe both.
    const [officer, user] = await Promise.all([
        loadOfficer(input.id),
        loadUser(input.id),
    ]);
    if (officer && user) {
        // Cross-table UUID collision is astronomically unlikely; if it ever
        // happens, the role hint breaks the tie deterministically.
        return input.role && input.role !== "officer" ? user : officer;
    }
    const resolved = officer ?? user;
    if (!resolved) {
        throw new AppError("Principal not found or inactive", 401);
    }
    return resolved;
}
