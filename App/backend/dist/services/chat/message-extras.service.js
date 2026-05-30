// Should-have message features: reactions, reply-to (column already exists
// and is honored by sendMessage), an edit/delete window, and per-chat
// message search. All gated through assertChatAccess.
import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";
import { assertChatAccess } from "./access";
import { emitToChat } from "@/realtime/io";
const EDIT_WINDOW_MS = Number(process.env.CHAT_EDIT_WINDOW_MIN || 15) * 60 * 1000;
async function loadOwnMessage(chatId, messageId) {
    const { rows } = await pool.query(`SELECT id, sender_kind, sender_id, created_at, deleted_at
       FROM messages WHERE id = $1 AND chat_id = $2`, [messageId, chatId]);
    if (!rows[0])
        throw new AppError("Message not found", 404);
    return rows[0];
}
export async function addReaction(principal, chatId, messageId, emoji) {
    if (!emoji || emoji.length > 16)
        throw new AppError("Invalid emoji", 400);
    await assertChatAccess(principal, chatId, "read");
    await pool.query(`INSERT INTO message_reactions (message_id, party_kind, party_id, emoji)
     SELECT $1::uuid, $2::text, $3::uuid, $4
      WHERE EXISTS (SELECT 1 FROM messages WHERE id = $1 AND chat_id = $5)
     ON CONFLICT (message_id, party_kind, party_id, emoji) DO NOTHING`, [messageId, principal.kind, principal.id, emoji, chatId]);
    emitToChat(chatId, "reaction.added", {
        chatId,
        messageId,
        emoji,
        by: { kind: principal.kind, id: principal.id },
    });
    return { ok: true };
}
export async function removeReaction(principal, chatId, messageId, emoji) {
    await assertChatAccess(principal, chatId, "read");
    await pool.query(`DELETE FROM message_reactions
      WHERE message_id = $1 AND party_kind = $2 AND party_id = $3
        AND emoji = $4`, [messageId, principal.kind, principal.id, emoji]);
    emitToChat(chatId, "reaction.removed", {
        chatId,
        messageId,
        emoji,
        by: { kind: principal.kind, id: principal.id },
    });
    return { ok: true };
}
export async function listReactions(principal, chatId, messageId) {
    await assertChatAccess(principal, chatId, "read");
    const { rows } = await pool.query(`SELECT emoji, COUNT(*)::int AS count
       FROM message_reactions WHERE message_id = $1
      GROUP BY emoji ORDER BY count DESC`, [messageId]);
    return rows;
}
export async function editMessage(principal, chatId, messageId, body) {
    if (!body?.trim())
        throw new AppError("Body required", 400);
    await assertChatAccess(principal, chatId, "write");
    const msg = await loadOwnMessage(chatId, messageId);
    if (msg.sender_kind !== principal.kind || msg.sender_id !== principal.id) {
        throw new AppError("Only the sender can edit", 403);
    }
    if (msg.deleted_at)
        throw new AppError("Message deleted", 410);
    if (Date.now() - new Date(msg.created_at).getTime() > EDIT_WINDOW_MS) {
        throw new AppError("Edit window has passed", 403);
    }
    const { rows } = await pool.query(`UPDATE messages SET body = $2, edited_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING id, body, edited_at`, [messageId, body.trim()]);
    emitToChat(chatId, "message.edited", { chatId, message: rows[0] });
    return rows[0];
}
export async function deleteMessage(principal, chatId, messageId) {
    await assertChatAccess(principal, chatId, "write");
    const msg = await loadOwnMessage(chatId, messageId);
    if (msg.sender_kind !== principal.kind || msg.sender_id !== principal.id) {
        throw new AppError("Only the sender can delete", 403);
    }
    // Soft delete only — the original is retained for legal/audit retention.
    await pool.query(`UPDATE messages SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL`, [messageId]);
    emitToChat(chatId, "message.deleted", { chatId, messageId });
    return { deleted: true };
}
export async function searchMessages(principal, chatId, q, limit = 30) {
    if (!q?.trim())
        throw new AppError("Query required", 400);
    await assertChatAccess(principal, chatId, "read");
    const { rows } = await pool.query(`SELECT id, sender_kind, sender_id, body, created_at
       FROM messages
      WHERE chat_id = $1 AND deleted_at IS NULL
        AND body ILIKE '%' || $2 || '%'
      ORDER BY created_at DESC
      LIMIT $3`, [chatId, q.trim(), Math.min(100, Math.max(1, limit))]);
    return rows;
}
