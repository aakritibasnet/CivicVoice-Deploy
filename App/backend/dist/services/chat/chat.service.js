// Chat REST service — Sprint 2 scope only: create a chat, list the caller's
// chats, list a chat's participants. No messaging/realtime yet (Sprint 3).
// Uses the raw pg pool (chat module is self-contained, mirrors
// publish.service.ts), and routes every read/write through assertChatAccess.
import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";
import { assertChatAccess } from "./access";
import { resolveComplaint } from "./workflow.service";
import { writeAudit } from "./chat-audit.service";
const CHAT_TYPES = [
    "officer_ward",
    "municipality_internal",
    "ward_municipality",
    "complaint_case",
];
// Shape returned by both the SELECT and INSERT … RETURNING.
const CHAT_RETURN_COLS = `id, type::text AS type, title, status::text AS status,
  priority::text AS priority, ward_id, municipality_id, department_id,
  complaint_id, is_group, created_at`;
export async function createChat(principal, input) {
    if (!CHAT_TYPES.includes(input.type)) {
        throw new AppError("Invalid chat type", 400);
    }
    if (input.type === "complaint_case" && !input.complaintId) {
        throw new AppError("complaint_case chats require complaintId", 400);
    }
    // Validate the complaint link and inherit its ward when not supplied.
    let complaintWardId = null;
    if (input.complaintId) {
        ({ wardId: complaintWardId } = await resolveComplaint(input.complaintId));
    }
    // Scope defaults from the creator so they can always see what they create.
    const wardId = input.wardId ?? complaintWardId ?? principal.wardId ?? null;
    const municipalityId = input.municipalityId ?? principal.municipalityId ?? null;
    // ward_municipality chats are find-or-create: exactly one chat per
    // (ward, municipality) pair. Without this, ward and municipality each
    // create their own chat and end up talking past each other.
    if (input.type === "ward_municipality" && wardId && municipalityId) {
        const existing = await pool.query(`SELECT ${CHAT_RETURN_COLS}
         FROM chats
        WHERE type = 'ward_municipality'
          AND ward_id = $1::uuid
          AND municipality_id = $2::uuid`, [wardId, municipalityId]);
        if (existing.rows[0]) {
            // Ensure the caller has a participant row so receipts/last_read work
            // without depending on lazy materialization elsewhere.
            await pool.query(`INSERT INTO chat_participants
           (chat_id, party_kind, party_id, role_in_chat)
         VALUES ($1, $2, $3, 'member'::chat_role)
         ON CONFLICT (chat_id, party_kind, party_id) DO NOTHING`, [existing.rows[0].id, principal.kind, principal.id]);
            return existing.rows[0];
        }
    }
    // 1-on-1 officer/org chats are find-or-create when there are exactly 2 participants:
    // creator + one additional. Prevents duplicate 1-on-1 chats when either side
    // initiates independently.
    if ((input.type === "officer_ward" ||
        input.type === "municipality_internal") &&
        input.participants &&
        input.participants.length === 1) {
        const other = input.participants[0];
        const existing = await pool.query(`SELECT ${CHAT_RETURN_COLS}
         FROM chats
        WHERE type = $5::chat_type
          AND EXISTS (
            SELECT 1 FROM chat_participants p1
             WHERE p1.chat_id = chats.id
               AND p1.party_kind = $1 AND p1.party_id = $2
          )
          AND EXISTS (
            SELECT 1 FROM chat_participants p2
             WHERE p2.chat_id = chats.id
               AND p2.party_kind = $3 AND p2.party_id = $4
          )
          AND is_group = false
        LIMIT 1`, [principal.kind, principal.id, other.kind, other.id, input.type]);
        if (existing.rows[0]) {
            await pool.query(`INSERT INTO chat_participants
           (chat_id, party_kind, party_id, role_in_chat)
         VALUES ($1, $2, $3, 'member'::chat_role)
         ON CONFLICT (chat_id, party_kind, party_id) DO NOTHING`, [existing.rows[0].id, principal.kind, principal.id]);
            return existing.rows[0];
        }
    }
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        let chat;
        try {
            const chatRes = await client.query(`INSERT INTO chats
           (type, title, municipality_id, ward_id, department_id, complaint_id,
            is_group, created_by_kind, created_by_id, last_message_at)
         VALUES ($1::chat_type, $2, $3, $4, $5, $6, $7, $8, $9, NULL)
         RETURNING ${CHAT_RETURN_COLS}`, [
                input.type,
                input.title ?? null,
                municipalityId,
                wardId,
                input.departmentId ?? principal.departmentId ?? null,
                input.complaintId ?? null,
                input.isGroup ?? false,
                principal.kind,
                principal.id,
            ]);
            chat = chatRes.rows[0];
        }
        catch (err) {
            // Lost the find-or-create race on the partial unique index. Roll back
            // and return the row the winner inserted.
            if (err?.code === "23505" &&
                input.type === "ward_municipality" &&
                wardId &&
                municipalityId) {
                await client.query("ROLLBACK");
                const winner = await pool.query(`SELECT ${CHAT_RETURN_COLS}
             FROM chats
            WHERE type = 'ward_municipality'
              AND ward_id = $1::uuid
              AND municipality_id = $2::uuid`, [wardId, municipalityId]);
                if (winner.rows[0]) {
                    await pool.query(`INSERT INTO chat_participants
               (chat_id, party_kind, party_id, role_in_chat)
             VALUES ($1, $2, $3, 'member'::chat_role)
             ON CONFLICT (chat_id, party_kind, party_id) DO NOTHING`, [winner.rows[0].id, principal.kind, principal.id]);
                    return winner.rows[0];
                }
            }
            throw err;
        }
        // Creator joins as admin.
        const rows = [
            { kind: principal.kind, id: principal.id, role: "admin" },
        ];
        for (const p of input.participants ?? []) {
            if (p.kind === principal.kind && p.id === principal.id)
                continue;
            rows.push({ kind: p.kind, id: p.id, role: p.role ?? "member" });
        }
        for (const r of rows) {
            await client.query(`INSERT INTO chat_participants
           (chat_id, party_kind, party_id, role_in_chat)
         VALUES ($1, $2, $3, $4::chat_role)
         ON CONFLICT (chat_id, party_kind, party_id) DO NOTHING`, [chat.id, r.kind, r.id, r.role]);
        }
        await writeAudit(client, {
            chatId: chat.id,
            actor: principal,
            action: "chat.created",
            metadata: {
                type: chat.type,
                complaintId: chat.complaint_id ?? null,
                participantCount: rows.length,
            },
        });
        await client.query("COMMIT");
        return chat;
    }
    catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        throw err;
    }
    finally {
        client.release();
    }
}
export async function listMyChats(principal) {
    // Columns shared by all UNION branches.
    const BASE = `c.id, c.type::text AS type, c.title, c.status::text AS status,
    c.priority::text AS priority, c.ward_id, c.municipality_id,
    c.complaint_id, c.is_group, c.is_archived, c.last_message_at, c.created_at`;
    // Correlated last-message preview (identical in every branch).
    const LAST_MSG = `(SELECT row_to_json(lm) FROM (
      SELECT m.body,
             m.type::text AS type,
             (
               SELECT a.mime_type
                 FROM message_attachments a
                WHERE a.message_id = m.id
                ORDER BY a.created_at ASC
                LIMIT 1
             ) AS mime_type
        FROM messages m
       WHERE m.chat_id = c.id AND m.deleted_at IS NULL
       ORDER BY m.created_at DESC LIMIT 1
     ) lm) AS last_message`;
    // NOT-EXISTS guard so type-derived rows never duplicate an explicit one.
    const NO_EXPLICIT = `NOT EXISTS (
      SELECT 1 FROM chat_participants x
       WHERE x.chat_id = c.id AND x.party_kind = $1 AND x.party_id = $2
    )`;
    // For 1-on-1 chats: resolve the other participant's display name so each
    // viewer always sees the other person's name regardless of who stored the
    // chat title or whose perspective it was set from.
    // For ward org users (party_kind='user'), prefer the ward name over the
    // user account display name so it reads as "Ward 5" not "Admin Account".
    const DISPLAY_TITLE = `
    CASE WHEN c.is_group = false THEN (
      SELECT CASE cp2.party_kind
        WHEN 'officer' THEN (
          SELECT o.first_name || ' ' || o.last_name
            FROM officers o
           WHERE o.id = cp2.party_id AND o.deleted_at IS NULL
        )
        WHEN 'user' THEN (
          SELECT COALESCE(w.name, u.name)
            FROM users u
            LEFT JOIN wards w ON w.id::text = u.ward_id::text
           WHERE u.id = cp2.party_id AND u.deleted_at IS NULL
        )
      END
      FROM chat_participants cp2
      WHERE cp2.chat_id = c.id
        AND NOT (cp2.party_kind = $1 AND cp2.party_id = $2)
        AND cp2.is_active = TRUE
      LIMIT 1
    ) ELSE NULL END AS display_title`;
    const OTHER_PARTICIPANT_KIND = `
    CASE WHEN c.is_group = false THEN (
      SELECT cp2.party_kind::text
      FROM chat_participants cp2
      WHERE cp2.chat_id = c.id
        AND NOT (cp2.party_kind = $1 AND cp2.party_id = $2)
        AND cp2.is_active = TRUE
      ORDER BY cp2.joined_at ASC
      LIMIT 1
    ) ELSE NULL END AS other_participant_kind`;
    const OTHER_PARTICIPANT_ID = `
    CASE WHEN c.is_group = false THEN (
      SELECT cp2.party_id
      FROM chat_participants cp2
      WHERE cp2.chat_id = c.id
        AND NOT (cp2.party_kind = $1 AND cp2.party_id = $2)
        AND cp2.is_active = TRUE
      ORDER BY cp2.joined_at ASC
      LIMIT 1
    ) ELSE NULL END AS other_participant_id`;
    const { rows } = await pool.query(`-- 1) Explicit participant rows
     SELECT ${BASE},
            cp.role_in_chat::text AS my_role,
            cp.last_read_message_id,
            cp.muted_until,
            ${LAST_MSG},
            ${DISPLAY_TITLE},
            ${OTHER_PARTICIPANT_KIND},
            ${OTHER_PARTICIPANT_ID}
       FROM chat_participants cp
       JOIN chats c ON c.id = cp.chat_id
      WHERE cp.party_kind = $1 AND cp.party_id = $2 AND cp.is_active = TRUE

     UNION ALL

     -- 2) Type-derived: ward_municipality seen from the ward side
     SELECT ${BASE},
            'member'          AS my_role,
            NULL::uuid        AS last_read_message_id,
            NULL::timestamptz AS muted_until,
            ${LAST_MSG},
            ${DISPLAY_TITLE},
            ${OTHER_PARTICIPANT_KIND},
            ${OTHER_PARTICIPANT_ID}
       FROM chats c
      WHERE c.type = 'ward_municipality'
        AND c.ward_id = $3::uuid
        AND $3 IS NOT NULL
        AND ${NO_EXPLICIT}

     UNION ALL

     -- 3) Type-derived: ward_municipality seen from the municipality side
     SELECT ${BASE},
            'member'          AS my_role,
            NULL::uuid        AS last_read_message_id,
            NULL::timestamptz AS muted_until,
            ${LAST_MSG},
            ${DISPLAY_TITLE},
            ${OTHER_PARTICIPANT_KIND},
            ${OTHER_PARTICIPANT_ID}
       FROM chats c
      WHERE c.type = 'ward_municipality'
        AND c.municipality_id = $4::uuid
        AND $4 IS NOT NULL
        AND ${NO_EXPLICIT}

     ORDER BY last_message_at DESC NULLS LAST, created_at DESC`, [principal.kind, principal.id, principal.wardId, principal.municipalityId]);
    return rows;
}
export async function getParticipants(principal, chatId) {
    // Read access required to see the roster.
    await assertChatAccess(principal, chatId, "read");
    const { rows } = await pool.query(`SELECT party_kind, party_id, role_in_chat::text AS role_in_chat,
            is_active, joined_at, removed_at
       FROM chat_participants
      WHERE chat_id = $1
      ORDER BY joined_at ASC`, [chatId]);
    return rows;
}
