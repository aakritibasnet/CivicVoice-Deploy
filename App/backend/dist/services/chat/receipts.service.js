// Delivered / read receipts + per-chat unread. Three timestamps live on
// message_receipts (delivered_at, read_at, acknowledged_at — ack is
// Sprint 5). The participant's last_read pointer is the fast path for
// unread badges; per-message receipt rows back the delivered/read ticks.
import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";
import { assertChatAccess } from "./access";
/**
 * Mark specific messages delivered to this principal. Idempotent; never
 * overwrites an existing delivered_at, and skips the principal's own
 * messages (you don't get a receipt for what you sent).
 */
export async function recordDelivered(principal, chatId, messageIds) {
    if (messageIds.length === 0)
        return 0;
    await assertChatAccess(principal, chatId, "read");
    const { rowCount } = await pool.query(`INSERT INTO message_receipts
       (message_id, party_kind, party_id, delivered_at)
     SELECT m.id, $2::text, $3::uuid, CURRENT_TIMESTAMP
       FROM messages m
      WHERE m.chat_id = $1
        AND m.id = ANY($4::uuid[])
        AND NOT (m.sender_kind = $2::text AND m.sender_id = $3::uuid)
     ON CONFLICT (message_id, party_kind, party_id)
       DO UPDATE SET delivered_at =
         COALESCE(message_receipts.delivered_at, EXCLUDED.delivered_at)`, [chatId, principal.kind, principal.id, messageIds]);
    return rowCount ?? 0;
}
async function resolveMarker(chatId, uptoMessageId) {
    const sql = uptoMessageId
        ? `SELECT id, created_at FROM messages WHERE chat_id = $1 AND id = $2`
        : `SELECT id, created_at FROM messages WHERE chat_id = $1
         ORDER BY created_at DESC, id DESC LIMIT 1`;
    const params = uptoMessageId ? [chatId, uptoMessageId] : [chatId];
    const { rows } = await pool.query(sql, params);
    return rows[0] ?? null;
}
/**
 * Mark every message in the chat up to `uptoMessageId` (inclusive; latest
 * if omitted) read by this principal, advance the last_read pointer, and
 * return the resulting unread count.
 */
export async function recordRead(principal, chatId, uptoMessageId) {
    await assertChatAccess(principal, chatId, "read");
    const marker = await resolveMarker(chatId, uptoMessageId ?? null);
    if (!marker) {
        return { unread: 0, lastReadMessageId: null };
    }
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // Derive the marker timestamp in SQL — never round-trip created_at
        // through a JS Date (millisecond truncation would leave the boundary
        // message counted as unread against the microsecond column).
        await client.query(`UPDATE chat_participants
          SET last_read_message_id = $4::uuid,
              last_read_at = (SELECT created_at FROM messages WHERE id = $4::uuid)
        WHERE chat_id = $1 AND party_kind = $2 AND party_id = $3`, [chatId, principal.kind, principal.id, marker.id]);
        await client.query(`INSERT INTO message_receipts
         (message_id, party_kind, party_id, delivered_at, read_at)
       SELECT m.id, $2::text, $3::uuid, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         FROM messages m
        WHERE m.chat_id = $1
          AND m.created_at <= (SELECT created_at FROM messages WHERE id = $4::uuid)
          AND NOT (m.sender_kind = $2::text AND m.sender_id = $3::uuid)
       ON CONFLICT (message_id, party_kind, party_id)
         DO UPDATE SET
           read_at = COALESCE(message_receipts.read_at, EXCLUDED.read_at),
           delivered_at =
             COALESCE(message_receipts.delivered_at, EXCLUDED.delivered_at)`, [chatId, principal.kind, principal.id, marker.id]);
        await client.query("COMMIT");
    }
    catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        throw err;
    }
    finally {
        client.release();
    }
    const unread = await getChatUnread(principal, chatId);
    return { unread, lastReadMessageId: marker.id };
}
/** Unread = messages after the principal's last_read pointer, not their own. */
export async function getChatUnread(principal, chatId) {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n
       FROM messages m
       JOIN chat_participants cp
         ON cp.chat_id = m.chat_id
        AND cp.party_kind = $2 AND cp.party_id = $3
      WHERE m.chat_id = $1
        AND m.deleted_at IS NULL
        AND NOT (m.sender_kind = $2 AND m.sender_id = $3)
        AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)`, [chatId, principal.kind, principal.id]);
    return rows[0]?.n ?? 0;
}
/** Per-chat unread across every active participation + grand total. */
export async function getUnreadSummary(principal) {
    const { rows } = await pool.query(`SELECT cp.chat_id,
            COUNT(m.id)::int AS unread
       FROM chat_participants cp
       LEFT JOIN messages m
         ON m.chat_id = cp.chat_id
        AND m.deleted_at IS NULL
        AND NOT (m.sender_kind = cp.party_kind AND m.sender_id = cp.party_id)
        AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
      WHERE cp.party_kind = $1 AND cp.party_id = $2 AND cp.is_active = TRUE
      GROUP BY cp.chat_id`, [principal.kind, principal.id]);
    const perChat = rows.map((r) => ({
        chatId: r.chat_id,
        unread: r.unread,
    }));
    const total = perChat.reduce((s, c) => s + c.unread, 0);
    return { total, perChat };
}
export function assertHasMessageIds(ids) {
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) {
        throw new AppError("messageIds must be a string array", 400);
    }
    return ids;
}
