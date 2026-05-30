// Central chat authorization guard. EVERY chat REST controller and (later)
// socket handler must pass through assertChatAccess before reading or
// mutating chat data — no exceptions (plan Part 2.3 / Part 4).
//
// The rule engine (evaluateChatAccess) is a pure function with no DB I/O so
// the full permission matrix can be unit-tested without a database.
import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";
const WRITE_BLOCKED_STATUSES = new Set(["resolved", "closed"]);
/**
 * Pure permission decision. `participant` is the principal's row in
 * chat_participants if one exists (an explicit grant), else null.
 */
export function evaluateChatAccess(principal, chat, participant, action) {
    const needsWrite = action !== "read";
    // 1) Explicit participant grant takes precedence over type-derived
    //    membership (this is how a ward officer enters a
    //    municipality_internal chat, and the only way into a complaint_case).
    if (participant) {
        if (!participant.is_active) {
            return { allowed: false, reason: "participant_inactive" };
        }
        if (participant.role_in_chat === "viewer" && needsWrite) {
            return { allowed: false, reason: "viewer_read_only" };
        }
        if (action === "manage" && participant.role_in_chat !== "admin") {
            return { allowed: false, reason: "manage_requires_admin" };
        }
        if (action === "write" && WRITE_BLOCKED_STATUSES.has(chat.status)) {
            return { allowed: false, reason: "chat_closed" };
        }
        return { allowed: true, reason: "participant_grant" };
    }
    // 2) No explicit row — derive membership from the chat type.
    const isOfficer = principal.kind === "officer";
    const wardMatch = !!chat.ward_id && principal.wardId === chat.ward_id;
    const muniMatch = !!chat.municipality_id &&
        principal.municipalityId === chat.municipality_id;
    let typeAllowed = false;
    switch (chat.type) {
        case "officer_ward":
            // Officers assigned to the ward + that ward's users.
            typeAllowed = wardMatch;
            break;
        case "municipality_internal":
            // Municipality-side principals only. Ward officers are explicitly
            // blocked unless an explicit chat_participants grant exists (handled
            // in step 1). Ward-role users are likewise ward-scoped, not
            // municipality-internal.
            typeAllowed =
                muniMatch &&
                    principal.officerType !== "ward_officer" &&
                    principal.role !== "ward" &&
                    principal.role !== "citizen";
            break;
        case "ward_municipality": {
            // Bridge channel between ONE ward and its municipality. The ward side is
            // the principals whose ward matches the chat's ward. The municipality
            // side is municipality-scoped principals only — ward officers and
            // ward-role org users must NOT reach a sibling ward's chat through the
            // municipality match (they share a municipality_id), or every ward in a
            // municipality would see every other ward's conversation.
            const isMunicipalitySide = muniMatch &&
                principal.officerType !== "ward_officer" &&
                principal.role !== "ward" &&
                principal.role !== "citizen";
            typeAllowed = wardMatch || isMunicipalitySide;
            break;
        }
        case "complaint_case":
            // Strictly explicit participants assigned to the report. With no
            // participant row there is no derived access.
            typeAllowed = false;
            break;
    }
    if (!typeAllowed) {
        return { allowed: false, reason: "not_a_member" };
    }
    if (action === "manage") {
        // Type-derived members are members, not chat admins.
        return { allowed: false, reason: "manage_requires_admin" };
    }
    if (action === "write" && WRITE_BLOCKED_STATUSES.has(chat.status)) {
        return { allowed: false, reason: "chat_closed" };
    }
    return { allowed: true, reason: `type_member_${chat.type}` };
}
/**
 * Loads the chat + the principal's participant row, evaluates the rules,
 * and throws on denial. Returns the loaded context so callers don't re-query.
 */
export async function assertChatAccess(principal, chatId, action) {
    const chatRes = await pool.query(`SELECT id, type::text AS type, status::text AS status,
            ward_id, municipality_id, complaint_id
       FROM chats
      WHERE id = $1`, [chatId]);
    const chat = chatRes.rows[0];
    if (!chat) {
        throw new AppError("Chat not found", 404);
    }
    const partRes = await pool.query(`SELECT role_in_chat::text AS role_in_chat, is_active
       FROM chat_participants
      WHERE chat_id = $1 AND party_kind = $2 AND party_id = $3`, [chatId, principal.kind, principal.id]);
    const participant = partRes.rows[0] ?? null;
    const decision = evaluateChatAccess(principal, chat, participant, action);
    if (!decision.allowed) {
        throw new AppError(`Forbidden: ${decision.reason}`, 403);
    }
    // Lazily materialize a participant row for type-derived members so
    // receipts, last_read pointers and unread tracking have something to
    // hang off (plan: scaling is "new participant rows only", no migration).
    if (!participant && decision.reason.startsWith("type_member_")) {
        await pool.query(`INSERT INTO chat_participants
         (chat_id, party_kind, party_id, role_in_chat)
       VALUES ($1, $2, $3, 'member')
       ON CONFLICT (chat_id, party_kind, party_id) DO NOTHING`, [chatId, principal.kind, principal.id]);
        return {
            chat,
            participant: { role_in_chat: "member", is_active: true },
        };
    }
    return { chat, participant };
}
