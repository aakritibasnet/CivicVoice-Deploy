// Per-principal chat notification preferences. Officers bypass the legacy
// notification_preferences table entirely, so this gives BOTH users and
// officers real controls (plan Part 3 gap fix). Defaults are applied on
// read so a missing row behaves as "everything on".
import { pool } from "@/db/pool";
const DEFAULTS = {
    push_enabled: true,
    in_app_enabled: true,
    dnd: false,
    quiet_hours_start: null,
    quiet_hours_end: null,
    mention_override: true,
};
export async function getChatPrefs(principal) {
    const { rows } = await pool.query(`SELECT push_enabled, in_app_enabled, dnd,
            quiet_hours_start, quiet_hours_end, mention_override
       FROM chat_notification_prefs
      WHERE party_kind = $1 AND party_id = $2`, [principal.kind, principal.id]);
    return rows[0] ? { ...DEFAULTS, ...rows[0] } : { ...DEFAULTS };
}
const FIELDS = [
    "push_enabled",
    "in_app_enabled",
    "dnd",
    "quiet_hours_start",
    "quiet_hours_end",
    "mention_override",
];
export async function updateChatPrefs(principal, patch) {
    const current = await getChatPrefs(principal);
    const next = { ...current };
    for (const f of FIELDS) {
        if (patch[f] !== undefined)
            next[f] = patch[f];
    }
    await pool.query(`INSERT INTO chat_notification_prefs
       (party_kind, party_id, push_enabled, in_app_enabled, dnd,
        quiet_hours_start, quiet_hours_end, mention_override, updated_at)
     VALUES ($1::text, $2::uuid, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
     ON CONFLICT (party_kind, party_id) DO UPDATE SET
       push_enabled = EXCLUDED.push_enabled,
       in_app_enabled = EXCLUDED.in_app_enabled,
       dnd = EXCLUDED.dnd,
       quiet_hours_start = EXCLUDED.quiet_hours_start,
       quiet_hours_end = EXCLUDED.quiet_hours_end,
       mention_override = EXCLUDED.mention_override,
       updated_at = CURRENT_TIMESTAMP`, [
        principal.kind,
        principal.id,
        next.push_enabled,
        next.in_app_enabled,
        next.dnd,
        next.quiet_hours_start,
        next.quiet_hours_end,
        next.mention_override,
    ]);
    return next;
}
/** Is `hour` (0..23) inside the quiet window? Handles wrap-around. */
export function isQuietHour(prefs, hour) {
    const { quiet_hours_start: s, quiet_hours_end: e } = prefs;
    if (s === null || e === null)
        return false;
    if (s === e)
        return false;
    return s < e ? hour >= s && hour < e : hour >= s || hour < e;
}
