// Civic workflow: complaint linkage, escalation, status lifecycle, and the
// acknowledge action. Every mutation is audited (chat_audit_log) inside the
// same transaction and, where it matters, notifies participants.

import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";
import { createNotification } from "@/services/notifications/notifications.service";
import { emitToChat } from "@/realtime/io";
import type { ResolvedPrincipal } from "./principal";
import { assertChatAccess } from "./access";
import { writeAudit } from "./chat-audit.service";

export type ChatStatus =
  | "open"
  | "pending"
  | "escalated"
  | "resolved"
  | "closed"
  | "reopened";

// Permitted status transitions. Anything else is a 400.
const TRANSITIONS: Record<ChatStatus, ChatStatus[]> = {
  open: ["pending", "escalated", "resolved", "closed"],
  pending: ["open", "escalated", "resolved", "closed"],
  escalated: ["pending", "resolved", "closed", "reopened"],
  resolved: ["reopened", "closed"],
  closed: ["reopened"],
  reopened: ["pending", "escalated", "resolved", "closed"],
};

/** Validate a complaint reference and return its ward for chat scoping. */
export async function resolveComplaint(
  complaintId: string,
): Promise<{ wardId: string | null }> {
  const { rows } = await pool.query(
    `SELECT id, ward_id FROM reports WHERE id = $1`,
    [complaintId],
  );
  if (!rows[0]) throw new AppError("Linked complaint not found", 404);
  return { wardId: rows[0].ward_id ?? null };
}

async function notifyParticipants(
  chatId: string,
  exclude: { kind: string; id: string },
  type: "chat_escalated" | "chat_closed",
  title: string,
  message: string,
): Promise<void> {
  const { rows } = await pool.query(
    `SELECT party_kind, party_id FROM chat_participants
      WHERE chat_id = $1 AND is_active = TRUE
        AND NOT (party_kind = $2 AND party_id = $3)`,
    [chatId, exclude.kind, exclude.id],
  );
  await Promise.allSettled(
    rows.map((r) =>
      createNotification({
        userId: r.party_id,
        recipientRole: r.party_kind === "officer" ? "officer" : "citizen",
        type,
        title,
        message,
        link: `/chat/${chatId}`,
        metadata: { chatId },
      }),
    ),
  );
}

export async function escalateChat(
  principal: ResolvedPrincipal,
  chatId: string,
  input: {
    reason: string;
    priority?: "normal" | "important" | "urgent" | "emergency";
    departmentId?: string | null;
    deadlineAt?: string | null;
  },
) {
  if (!input?.reason?.trim()) {
    throw new AppError("Escalation reason is required", 400);
  }
  await assertChatAccess(principal, chatId, "workflow");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query(
      `UPDATE chats
          SET status = 'escalated',
              priority = COALESCE($2::chat_priority, priority),
              department_id = COALESCE($3::uuid, department_id),
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      RETURNING id, status::text AS status, priority::text AS priority,
                department_id`,
      [chatId, input.priority ?? null, input.departmentId ?? null],
    );
    const chat = res.rows[0];
    if (!chat) throw new AppError("Chat not found", 404);

    await writeAudit(client, {
      chatId,
      actor: principal,
      action: "chat.escalated",
      metadata: {
        reason: input.reason,
        priority: chat.priority,
        departmentId: chat.department_id,
        deadlineAt: input.deadlineAt ?? null,
      },
    });
    await client.query("COMMIT");

    await notifyParticipants(
      chatId,
      principal,
      "chat_escalated",
      "Chat escalated",
      input.reason,
    );
    emitToChat(chatId, "chat.escalated", {
      chatId,
      by: { kind: principal.kind, id: principal.id },
      reason: input.reason,
      priority: chat.priority,
    });
    return chat;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function setChatStatus(
  principal: ResolvedPrincipal,
  chatId: string,
  next: ChatStatus,
) {
  if (!TRANSITIONS[next] && next !== "open") {
    throw new AppError("Invalid status", 400);
  }
  await assertChatAccess(principal, chatId, "workflow");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      `SELECT status::text AS status FROM chats WHERE id = $1 FOR UPDATE`,
      [chatId],
    );
    if (!cur.rows[0]) throw new AppError("Chat not found", 404);
    const from = cur.rows[0].status as ChatStatus;

    if (from === next) {
      await client.query("ROLLBACK");
      return { status: from, unchanged: true };
    }
    if (!TRANSITIONS[from]?.includes(next)) {
      throw new AppError(`Illegal transition ${from} → ${next}`, 400);
    }

    await client.query(
      `UPDATE chats SET status = $2::chat_status,
              updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [chatId, next],
    );
    await writeAudit(client, {
      chatId,
      actor: principal,
      action: "chat.status_changed",
      metadata: { from, to: next },
    });
    await client.query("COMMIT");

    if (next === "closed") {
      await notifyParticipants(
        chatId,
        principal,
        "chat_closed",
        "Chat closed",
        "This conversation has been closed.",
      );
    }
    emitToChat(chatId, "chat.status_changed", { chatId, from, to: next });
    return { status: next, unchanged: false };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function acknowledgeMessage(
  principal: ResolvedPrincipal,
  chatId: string,
  messageId: string,
) {
  await assertChatAccess(principal, chatId, "workflow");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const msg = await client.query(
      `SELECT id FROM messages WHERE id = $1 AND chat_id = $2`,
      [messageId, chatId],
    );
    if (!msg.rows[0]) throw new AppError("Message not found", 404);

    await client.query(
      `INSERT INTO message_receipts
         (message_id, party_kind, party_id,
          delivered_at, read_at, acknowledged_at)
       VALUES ($1::uuid, $2::text, $3::uuid,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (message_id, party_kind, party_id)
         DO UPDATE SET
           acknowledged_at =
             COALESCE(message_receipts.acknowledged_at, EXCLUDED.acknowledged_at),
           delivered_at =
             COALESCE(message_receipts.delivered_at, EXCLUDED.delivered_at),
           read_at = COALESCE(message_receipts.read_at, EXCLUDED.read_at)`,
      [messageId, principal.kind, principal.id],
    );
    await writeAudit(client, {
      chatId,
      actor: principal,
      action: "message.acknowledged",
      metadata: { messageId },
    });
    await client.query("COMMIT");

    emitToChat(chatId, "receipt.acknowledged", {
      chatId,
      messageId,
      by: { kind: principal.kind, id: principal.id },
    });
    return { acknowledged: true };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
