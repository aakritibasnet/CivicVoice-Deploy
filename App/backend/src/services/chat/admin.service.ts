// Admin console service — Sprint 8.
// Provides export and disable operations gated behind "manage" access.
// Export: full audited history (chat metadata + messages + receipts + audit).
// Disable: soft-removes a participant so they can no longer access the chat.

import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";
import type { ResolvedPrincipal } from "./principal";
import { assertChatAccess } from "./access";
import { writeAudit } from "./chat-audit.service";
import { emitToChat } from "@/realtime/io";

export async function exportChatHistory(
  principal: ResolvedPrincipal,
  chatId: string,
) {
  await assertChatAccess(principal, chatId, "manage");

  const [chatRes, participantsRes, messagesRes, receiptsRes, auditRes] =
    await Promise.all([
      pool.query(
        `SELECT id, type::text AS type, title, status::text AS status,
                priority::text AS priority, ward_id, municipality_id,
                department_id, complaint_id, is_group, is_archived,
                restrict_send, created_by_kind, created_by_id,
                last_message_at, created_at, updated_at
           FROM chats WHERE id = $1`,
        [chatId],
      ),
      pool.query(
        `SELECT party_kind, party_id, role_in_chat::text, is_active,
                joined_at, removed_at
           FROM chat_participants WHERE chat_id = $1
           ORDER BY joined_at ASC`,
        [chatId],
      ),
      pool.query(
        `SELECT id, sender_kind, sender_id, type::text AS type,
                body, priority::text AS priority, reply_to_message_id,
                client_msg_id, edited_at, deleted_at, created_at
           FROM messages WHERE chat_id = $1
           ORDER BY created_at ASC`,
        [chatId],
      ),
      pool.query(
        `SELECT mr.message_id, mr.party_kind, mr.party_id,
                mr.delivered_at, mr.read_at, mr.acknowledged_at
           FROM message_receipts mr
           JOIN messages m ON m.id = mr.message_id
          WHERE m.chat_id = $1
          ORDER BY mr.message_id`,
        [chatId],
      ),
      pool.query(
        `SELECT id, actor_kind, actor_id, action, metadata, created_at
           FROM chat_audit_log WHERE chat_id = $1
           ORDER BY created_at ASC`,
        [chatId],
      ),
    ]);

  await writeAudit({ query: pool.query.bind(pool) }, {
    chatId,
    actor: principal,
    action: "chat.exported",
    metadata: {
      messageCount: messagesRes.rowCount ?? 0,
      auditCount: auditRes.rowCount ?? 0,
    },
  });

  return {
    chat: chatRes.rows[0] ?? null,
    participants: participantsRes.rows,
    messages: messagesRes.rows,
    receipts: receiptsRes.rows,
    audit: auditRes.rows,
    exportedAt: new Date().toISOString(),
    exportedBy: { kind: principal.kind, id: principal.id },
  };
}

export async function disableParticipant(
  principal: ResolvedPrincipal,
  chatId: string,
  target: { kind: "user" | "officer"; id: string },
) {
  await assertChatAccess(principal, chatId, "manage");

  const { rowCount } = await pool.query(
    `UPDATE chat_participants
        SET is_active = FALSE, removed_at = CURRENT_TIMESTAMP
      WHERE chat_id = $1 AND party_kind = $2 AND party_id = $3 AND is_active = TRUE`,
    [chatId, target.kind, target.id],
  );
  if (!rowCount) throw new AppError("Participant not found or already inactive", 404);

  await writeAudit({ query: pool.query.bind(pool) }, {
    chatId,
    actor: principal,
    action: "participant.disabled",
    metadata: { targetKind: target.kind, targetId: target.id },
  });

  emitToChat(chatId, "participant.disabled", {
    chatId,
    participant: { kind: target.kind, id: target.id },
    by: { kind: principal.kind, id: principal.id },
  });
  return { disabled: true };
}

export async function listAllChatsAdmin(
  principal: ResolvedPrincipal,
  opts: {
    wardId?: string | null;
    municipalityId?: string | null;
    status?: string | null;
    limit?: number;
    before?: string | null;
  } = {},
) {
  // Only municipality-level officers or admin users can use the admin list.
  if (
    principal.kind === "officer" &&
    principal.officerType !== "municipality_officer"
  ) {
    throw new AppError("Insufficient privilege for admin chat list", 403);
  }

  const limit = Math.min(100, opts.limit ?? 50);
  const { rows } = await pool.query(
    `SELECT c.id, c.type::text AS type, c.title, c.status::text AS status,
            c.priority::text AS priority, c.ward_id, c.municipality_id,
            c.department_id, c.complaint_id, c.is_group, c.is_archived,
            c.restrict_send, c.last_message_at, c.created_at,
            (SELECT COUNT(*)::int FROM chat_participants cp
              WHERE cp.chat_id = c.id AND cp.is_active = TRUE) AS participant_count
       FROM chats c
      WHERE ($1::uuid IS NULL OR c.ward_id = $1::uuid)
        AND ($2::uuid IS NULL OR c.municipality_id = $2::uuid)
        AND ($3::text  IS NULL OR c.status::text = $3)
        AND ($4::timestamptz IS NULL OR c.created_at < $4::timestamptz)
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
      LIMIT $5`,
    [
      opts.wardId ?? null,
      opts.municipalityId ?? null,
      opts.status ?? null,
      opts.before ?? null,
      limit,
    ],
  );
  return rows;
}
