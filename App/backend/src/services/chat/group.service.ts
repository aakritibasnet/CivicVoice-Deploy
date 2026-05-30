// Group management service — Sprint 8.
// All mutations require "manage" action (chat admin only) except archiveChat
// which is gated on "workflow" so senior officers can archive without being
// the original creator.
//
// restrict_send: when true, only chat admins may post messages; member/viewer
//               attempts are rejected in sendMessage (checked here by exporting
//               the guard so message.service.ts can import it).

import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";
import type { ResolvedPrincipal } from "./principal";
import { assertChatAccess } from "./access";
import { writeAudit } from "./chat-audit.service";
import { emitToChat } from "@/realtime/io";

export type GroupRole = "admin" | "member" | "viewer";

export async function addParticipant(
  principal: ResolvedPrincipal,
  chatId: string,
  target: { kind: "user" | "officer"; id: string; role?: GroupRole },
) {
  await assertChatAccess(principal, chatId, "manage");

  const role = target.role ?? "member";
  const { rowCount } = await pool.query(
    `INSERT INTO chat_participants (chat_id, party_kind, party_id, role_in_chat)
     VALUES ($1, $2, $3, $4::chat_role)
     ON CONFLICT (chat_id, party_kind, party_id)
       DO UPDATE SET is_active = TRUE, role_in_chat = EXCLUDED.role_in_chat,
                     removed_at = NULL`,
    [chatId, target.kind, target.id, role],
  );

  const client = await pool.connect();
  try {
    await writeAudit(client, {
      chatId,
      actor: principal,
      action: "participant.added",
      metadata: { targetKind: target.kind, targetId: target.id, role },
    });
  } finally {
    client.release();
  }

  emitToChat(chatId, "participant.added", {
    chatId,
    participant: { kind: target.kind, id: target.id, role },
    by: { kind: principal.kind, id: principal.id },
  });
  return { added: rowCount! > 0 };
}

export async function removeParticipant(
  principal: ResolvedPrincipal,
  chatId: string,
  target: { kind: "user" | "officer"; id: string },
) {
  await assertChatAccess(principal, chatId, "manage");

  // Admins cannot remove themselves if they are the only admin.
  if (target.kind === principal.kind && target.id === principal.id) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM chat_participants
        WHERE chat_id = $1 AND role_in_chat = 'admin' AND is_active = TRUE`,
      [chatId],
    );
    if (rows[0].n <= 1) {
      throw new AppError("Cannot remove the sole admin", 400);
    }
  }

  await pool.query(
    `UPDATE chat_participants
        SET is_active = FALSE, removed_at = CURRENT_TIMESTAMP
      WHERE chat_id = $1 AND party_kind = $2 AND party_id = $3`,
    [chatId, target.kind, target.id],
  );

  const client = await pool.connect();
  try {
    await writeAudit(client, {
      chatId,
      actor: principal,
      action: "participant.removed",
      metadata: { targetKind: target.kind, targetId: target.id },
    });
  } finally {
    client.release();
  }

  emitToChat(chatId, "participant.removed", {
    chatId,
    participant: { kind: target.kind, id: target.id },
    by: { kind: principal.kind, id: principal.id },
  });
  return { removed: true };
}

export async function updateParticipantRole(
  principal: ResolvedPrincipal,
  chatId: string,
  target: { kind: "user" | "officer"; id: string; role: GroupRole },
) {
  await assertChatAccess(principal, chatId, "manage");

  const { rowCount } = await pool.query(
    `UPDATE chat_participants
        SET role_in_chat = $4::chat_role
      WHERE chat_id = $1 AND party_kind = $2 AND party_id = $3 AND is_active = TRUE`,
    [chatId, target.kind, target.id, target.role],
  );
  if (!rowCount) throw new AppError("Participant not found or inactive", 404);

  const client = await pool.connect();
  try {
    await writeAudit(client, {
      chatId,
      actor: principal,
      action: "participant.role_changed",
      metadata: { targetKind: target.kind, targetId: target.id, role: target.role },
    });
  } finally {
    client.release();
  }

  emitToChat(chatId, "participant.role_changed", {
    chatId,
    participant: { kind: target.kind, id: target.id, role: target.role },
    by: { kind: principal.kind, id: principal.id },
  });
  return { role: target.role };
}

export async function renameChat(
  principal: ResolvedPrincipal,
  chatId: string,
  title: string,
) {
  if (!title?.trim()) throw new AppError("Title required", 400);
  await assertChatAccess(principal, chatId, "manage");

  await pool.query(
    `UPDATE chats SET title = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [chatId, title.trim()],
  );

  const client = await pool.connect();
  try {
    await writeAudit(client, {
      chatId,
      actor: principal,
      action: "chat.renamed",
      metadata: { title: title.trim() },
    });
  } finally {
    client.release();
  }

  emitToChat(chatId, "chat.renamed", { chatId, title: title.trim() });
  return { title: title.trim() };
}

export async function setRestrictSend(
  principal: ResolvedPrincipal,
  chatId: string,
  enabled: boolean,
) {
  await assertChatAccess(principal, chatId, "manage");

  await pool.query(
    `UPDATE chats SET restrict_send = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [chatId, enabled],
  );

  const client = await pool.connect();
  try {
    await writeAudit(client, {
      chatId,
      actor: principal,
      action: "chat.restrict_send_changed",
      metadata: { restrict_send: enabled },
    });
  } finally {
    client.release();
  }

  emitToChat(chatId, "chat.restrict_send_changed", { chatId, restrict_send: enabled });
  return { restrict_send: enabled };
}

export async function archiveChat(
  principal: ResolvedPrincipal,
  chatId: string,
  archive = true,
) {
  await assertChatAccess(principal, chatId, "manage");

  await pool.query(
    `UPDATE chats SET is_archived = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [chatId, archive],
  );

  const client = await pool.connect();
  try {
    await writeAudit(client, {
      chatId,
      actor: principal,
      action: archive ? "chat.archived" : "chat.unarchived",
      metadata: {},
    });
  } finally {
    client.release();
  }

  emitToChat(chatId, archive ? "chat.archived" : "chat.unarchived", { chatId });
  return { is_archived: archive };
}

/**
 * Checks the restrict_send flag for a chat. Returns true if the principal is
 * allowed to post (either restrict_send is off, or the principal is an admin).
 * Called by sendMessage before inserting.
 */
export async function canSendInChat(
  principal: ResolvedPrincipal,
  chatId: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT c.restrict_send,
            cp.role_in_chat
       FROM chats c
       LEFT JOIN chat_participants cp
         ON cp.chat_id = c.id
        AND cp.party_kind = $2 AND cp.party_id = $3
        AND cp.is_active = TRUE
      WHERE c.id = $1`,
    [chatId, principal.kind, principal.id],
  );
  if (!rows[0]) return false;
  if (!rows[0].restrict_send) return true;
  return rows[0].role_in_chat === "admin";
}
