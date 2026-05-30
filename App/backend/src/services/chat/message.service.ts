// Message send + paginated history. Send is idempotent on
// (chat_id, client_msg_id) so a client outbox can safely retry after a
// flaky network. History uses keyset pagination on (created_at, id) — the
// same composite the idx_messages_chat_created index serves — and supports
// an `after` cursor so a reconnecting client can replay only what it missed.

import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";
import type { ResolvedPrincipal } from "./principal";
import { assertChatAccess } from "./access";
import { publishChatEvent } from "./chat-events.bridge";
import { canSendInChat } from "./group.service";

export type MessageType =
  | "text"
  | "image"
  | "file"
  | "audio"
  | "location"
  | "system";

type Mention = { kind: "user" | "officer"; id: string };

type SendInput = {
  body?: string | null;
  type?: MessageType;
  clientMsgId?: string | null;
  replyToMessageId?: string | null;
  priority?: "normal" | "important" | "urgent" | "emergency";
  mentions?: Mention[];
};

// created_us = microsecond epoch. timestamptz(6) is microsecond-precise but
// node-pg hands back a millisecond JS Date, so cursors keyset on this
// lossless bigint instead — otherwise the boundary row leaks back in.
const SELECT_COLS = `id, chat_id, sender_kind, sender_id, type::text AS type,
  body, reply_to_message_id, priority::text AS priority, client_msg_id,
  edited_at, deleted_at, created_at,
  (extract(epoch from created_at) * 1000000)::bigint AS created_us`;

// History queries alias the table as "m" and include an attachments subquery
// so the client can render images/files inline without a separate round-trip.
const HISTORY_COLS = `m.id, m.chat_id, m.sender_kind, m.sender_id, m.type::text AS type,
  m.body, m.reply_to_message_id, m.priority::text AS priority, m.client_msg_id,
  m.edited_at, m.deleted_at, m.created_at,
  (extract(epoch from m.created_at) * 1000000)::bigint AS created_us,
  COALESCE((
    SELECT json_agg(json_build_object(
      'id', a.id, 'file_name', a.file_name,
      'mime_type', a.mime_type, 'resource_type', a.resource_type::text,
      'size_bytes', a.size_bytes
    ) ORDER BY a.created_at)
    FROM message_attachments a WHERE a.message_id = m.id
  ), '[]'::json) AS attachments`;

async function findByClientMsgId(
  chatId: string,
  clientMsgId: string,
): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query(
    `SELECT ${SELECT_COLS} FROM messages
      WHERE chat_id = $1 AND client_msg_id = $2`,
    [chatId, clientMsgId],
  );
  return rows[0] ?? null;
}

export async function sendMessage(
  principal: ResolvedPrincipal,
  chatId: string,
  input: SendInput,
) {
  await assertChatAccess(principal, chatId, "write");

  // Groups can restrict posting to admins only.
  const allowed = await canSendInChat(principal, chatId);
  if (!allowed) {
    throw new AppError(
      "Sending is restricted to admins in this group",
      403,
    );
  }

  const type: MessageType = input.type ?? "text";
  const body = input.body?.trim() ?? null;
  if (type === "text" && !body) {
    throw new AppError("Message body is required", 400);
  }

  if (input.clientMsgId) {
    const existing = await findByClientMsgId(chatId, input.clientMsgId);
    if (existing) return { message: existing, deduped: true };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let row: Record<string, unknown>;
    try {
      const res = await client.query(
        `INSERT INTO messages
           (chat_id, sender_kind, sender_id, type, body,
            reply_to_message_id, priority, client_msg_id)
         VALUES ($1, $2, $3, $4::chat_message_type, $5, $6,
                 $7::chat_priority, $8)
         RETURNING ${SELECT_COLS}`,
        [
          chatId,
          principal.kind,
          principal.id,
          type,
          body,
          input.replyToMessageId ?? null,
          input.priority ?? "normal",
          input.clientMsgId ?? null,
        ],
      );
      row = res.rows[0];
    } catch (err: unknown) {
      // Lost an idempotency race against the partial unique index.
      if ((err as { code?: string })?.code === "23505" && input.clientMsgId) {
        await client.query("ROLLBACK");
        const existing = await findByClientMsgId(chatId, input.clientMsgId);
        if (existing) return { message: existing, deduped: true };
      }
      throw err;
    }

    const mentions = (input.mentions ?? []).filter(
      (m) => m && (m.kind === "user" || m.kind === "officer") && m.id,
    );
    for (const m of mentions) {
      await client.query(
        `INSERT INTO chat_mentions (message_id, mentioned_kind, mentioned_id)
         VALUES ($1, $2::text, $3::uuid)
         ON CONFLICT (message_id, mentioned_kind, mentioned_id) DO NOTHING`,
        [row.id, m.kind, m.id],
      );
    }

    await client.query(
      `UPDATE chats
          SET last_message_at = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [chatId, row.created_at],
    );

    await publishChatEvent(client, {
      event: "message.created",
      chat_id: chatId,
      message: { ...row, mentions },
    });

    await client.query("COMMIT");
    return { message: row, deduped: false };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

type Cursor = { createdUs: string; id: string };

function cursorOf(row: Record<string, unknown>): string {
  return Buffer.from(`${row.created_us}|${row.id}`, "utf8").toString(
    "base64url",
  );
}

function decodeCursor(raw?: string | null): Cursor | null {
  if (!raw) return null;
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  const sep = decoded.lastIndexOf("|");
  if (sep < 0) return null;
  const createdUs = decoded.slice(0, sep);
  if (!/^\d+$/.test(createdUs)) return null;
  return { createdUs, id: decoded.slice(sep + 1) };
}

export async function getHistory(
  principal: ResolvedPrincipal,
  chatId: string,
  opts: { limit?: number; before?: string | null; after?: string | null },
) {
  await assertChatAccess(principal, chatId, "read");

  const limit = Math.min(100, Math.max(1, opts.limit ?? 30));

  // `after` = forward replay (oldest→newest) for reconnect catch-up.
  // `before` (default) = backward paging (newest→older) for scrollback.
  const after = decodeCursor(opts.after);
  if (after) {
    const { rows } = await pool.query(
      `SELECT ${HISTORY_COLS} FROM messages m
        WHERE m.chat_id = $1
          AND ((extract(epoch from m.created_at) * 1000000)::bigint, m.id)
              > ($2::bigint, $3::uuid)
        ORDER BY m.created_at ASC, m.id ASC
        LIMIT $4`,
      [chatId, after.createdUs, after.id, limit + 1],
    );
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      messages: page,
      nextCursor:
        page.length > 0 ? cursorOf(page[page.length - 1]) : opts.after ?? null,
      hasMore,
      direction: "forward" as const,
    };
  }

  const before = decodeCursor(opts.before);
  const { rows } = await pool.query(
    `SELECT ${HISTORY_COLS} FROM messages m
      WHERE m.chat_id = $1
        AND ($2::bigint IS NULL
             OR ((extract(epoch from m.created_at) * 1000000)::bigint, m.id)
                < ($2::bigint, $3::uuid))
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $4`,
    [chatId, before?.createdUs ?? null, before?.id ?? null, limit + 1],
  );
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    messages: page,
    nextCursor: page.length > 0 ? cursorOf(page[page.length - 1]) : null,
    hasMore,
    direction: "backward" as const,
  };
}
