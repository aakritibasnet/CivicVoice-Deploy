// Presence-aware, coalesced chat notification fan-out. Invoked by the
// chat_events bridge (the single elected deliverer) right after a message
// is broadcast to the room, so cross-instance double-send can't happen.
//
// Decision per recipient:
//   live socket in that chat room  -> suppress push (they're viewing it)
//   muted_until in the future      -> suppress push (Sprint 4 policy;
//                                     urgent override is Sprint 7)
//   notification_level none/mentions -> suppress push (plain message)
//   otherwise                      -> debounced, coalesced push
// Either way the recipient's personal room gets an unread.updated nudge.
import { pool } from "@/db/pool";
import { createNotification } from "@/services/notifications/notifications.service";
import { emitToPrincipal, isPrincipalInChatRoom } from "@/realtime/io";
import { getChatUnread } from "./receipts.service";
import { getChatPrefs, isQuietHour } from "./notification-prefs.service";
// Short enough that a single message arrives in near-real-time; long enough
// to coalesce a multi-line burst into one notification ("Dhapasi sent 3
// messages"). Overridable via env without redeploying.
const DEBOUNCE_MS = Number(process.env.CHAT_PUSH_DEBOUNCE_MS || 1000);
const pending = new Map();
function key(chatId, r) {
    return `${chatId}|${r.kind}:${r.id}`;
}
function chatLabel(chat) {
    return chat.title || chat.type.replace(/_/g, " ");
}
/**
 * Sender-side label that the *recipient* will recognize. For ward_municipality
 * chats the label is the ward/municipality name (sender side derived from
 * which side of the chat the sender belongs to), not the user's display name —
 * this is what makes "Dhapasi messaged: hello" land for the municipality.
 */
async function resolveSenderLabel(chat, senderKind, senderId) {
    if (senderKind === "officer") {
        const { rows } = await pool.query(`SELECT o.first_name, o.last_name,
              o.ward_id::text AS ward_id,
              w.municipality_id::text AS municipality_id
         FROM officers o
         LEFT JOIN wards w ON w.id = o.ward_id
        WHERE o.id = $1::uuid`, [senderId]);
        const o = rows[0];
        const personal = o && `${o.first_name ?? ""} ${o.last_name ?? ""}`.trim();
        // In a ward↔municipality thread, label officers by the side they speak
        // for ("Dhapasi messaged"), matching the org-account behaviour below.
        if (o && chat.type === "ward_municipality") {
            if (o.ward_id && chat.ward_id && o.ward_id === chat.ward_id) {
                return chat.ward_name ?? (personal || "Ward");
            }
            if (o.municipality_id &&
                chat.municipality_id &&
                o.municipality_id === chat.municipality_id) {
                return chat.municipality_name ?? (personal || "Municipality");
            }
        }
        return personal || "Officer";
    }
    // sender_kind === "user"
    const { rows } = await pool.query(`SELECT u.name, u.ward_id::text AS ward_id, u.municipality_id::text AS municipality_id
       FROM users u WHERE u.id = $1::uuid`, [senderId]);
    const u = rows[0];
    if (!u)
        return "Someone";
    if (chat.type === "ward_municipality") {
        // Sender on the ward side → label is the ward name.
        if (u.ward_id && chat.ward_id && u.ward_id === chat.ward_id) {
            return chat.ward_name ?? u.name ?? "Ward";
        }
        // Sender on the municipality side → label is the municipality name.
        if (u.municipality_id &&
            chat.municipality_id &&
            u.municipality_id === chat.municipality_id) {
            return chat.municipality_name ?? u.name ?? "Municipality";
        }
    }
    return u.name ?? "Someone";
}
function buildBodyPreview(message) {
    if (message.type === "text")
        return message.body?.slice(0, 140) ?? "";
    if (message.type === "image")
        return "📷 Photo";
    if (message.type === "file")
        return "📎 File";
    if (message.type === "audio")
        return "🎤 Voice note";
    if (message.type === "location")
        return "📍 Location";
    return `[${message.type}]`;
}
function chatDashboardLink(chatId) {
    // Both the website route (/dashboard/chat/[id]) and mobile (deep-link
    // metadata.chatId) work off this — the website router uses link, mobile
    // uses metadata.chatId.
    return `/dashboard/chat/${chatId}`;
}
// getChatUnread only reads .kind/.id off the principal.
function asPrincipal(r) {
    return {
        kind: r.kind,
        id: r.id,
        role: r.kind === "officer" ? "officer" : "citizen",
        officerType: null,
        wardId: null,
        municipalityId: null,
        departmentId: null,
    };
}
async function flush(k) {
    const p = pending.get(k);
    if (!p)
        return;
    pending.delete(k);
    const isOne = p.count === 1;
    const title = isOne
        ? `${p.senderLabel} ${p.lastVerb}`
        : `${p.senderLabel} sent ${p.count} messages`;
    // For coalesced pushes still show the latest body — that's what the user
    // most wants to see ("3 new messages: …last one"), not just a count.
    const message = isOne
        ? p.lastBody
        : p.lastBody
            ? `${p.count} new messages — latest: ${p.lastBody}`
            : `${p.count} new messages in ${chatLabel(p.chat)}`;
    try {
        await createNotification({
            userId: p.recipient.id,
            recipientRole: p.recipient.kind === "officer" ? "officer" : "citizen",
            type: "chat_message",
            title,
            message,
            link: chatDashboardLink(p.chat.id),
            metadata: {
                chatId: p.chat.id,
                coalescedCount: p.count,
                senderLabel: p.senderLabel,
            },
        });
        // Real-time in-app popup: the recipient's personal room receives the full
        // title/body so mobile + web can toast immediately without polling the
        // notifications table. Lands even in Expo Go (no push build required).
        emitToPrincipal(p.recipient.kind, p.recipient.id, "chat.notify", {
            chatId: p.chat.id,
            type: "chat_message",
            title,
            body: message,
            senderLabel: p.senderLabel,
            count: p.count,
            link: chatDashboardLink(p.chat.id),
        });
    }
    catch (err) {
        console.error("chat push flush error:", err);
    }
}
function queuePush(chat, recipient, body, verb, senderLabel) {
    const k = key(chat.id, recipient);
    const existing = pending.get(k);
    if (existing) {
        existing.count += 1;
        existing.lastBody = body;
        existing.lastVerb = verb;
        existing.senderLabel = senderLabel;
        clearTimeout(existing.timer);
        existing.timer = setTimeout(() => void flush(k), DEBOUNCE_MS);
        return;
    }
    pending.set(k, {
        count: 1,
        chat,
        recipient,
        lastBody: body,
        lastVerb: verb,
        senderLabel,
        timer: setTimeout(() => void flush(k), DEBOUNCE_MS),
    });
}
export async function dispatchMessageNotifications(message) {
    // Load the chat plus its ward/muni names in one round-trip so the
    // recipient sees "Dhapasi messaged" rather than the raw user account name.
    const chatRes = await pool.query(`SELECT c.id, c.title, c.type::text AS type,
            c.ward_id::text AS ward_id,
            w.name AS ward_name,
            c.municipality_id::text AS municipality_id,
            m.name AS municipality_name
       FROM chats c
       LEFT JOIN wards w ON w.id = c.ward_id
       LEFT JOIN municipalities m ON m.id = c.municipality_id
      WHERE c.id = $1`, [message.chat_id]);
    const chat = chatRes.rows[0];
    if (!chat)
        return;
    const partRes = await pool.query(`SELECT party_kind AS kind, party_id AS id, notification_level,
            (muted_until IS NOT NULL
             AND muted_until > CURRENT_TIMESTAMP) AS is_muted
       FROM chat_participants
      WHERE chat_id = $1 AND is_active = TRUE
        AND NOT (party_kind = $2 AND party_id = $3)`, [message.chat_id, message.sender_kind, message.sender_id]);
    const nowHour = new Date().getHours();
    const preview = buildBodyPreview(message);
    const senderLabel = await resolveSenderLabel(chat, message.sender_kind, message.sender_id);
    // Per-recipient "replied" detection: if the recipient has spoken in this
    // chat at any point before this message, this message is a reply to the
    // ongoing thread on their side. First-ever message from each side reads as
    // "messaged"; every subsequent inbound is "replied". An explicit
    // reply_to_message_id always counts too.
    const priorByOtherRes = await pool.query(`SELECT sender_kind, sender_id::text AS sender_id
       FROM messages
      WHERE chat_id = $1 AND id <> $2::uuid AND deleted_at IS NULL
        AND NOT (sender_kind = $3 AND sender_id = $4)`, [message.chat_id, message.id, message.sender_kind, message.sender_id]);
    const prevSpeakers = new Set(priorByOtherRes.rows.map((r) => `${r.sender_kind}:${r.sender_id}`));
    const mentionSet = new Set((message.mentions ?? []).map((m) => `${m.kind}:${m.id}`));
    const isHighPriority = message.priority === "urgent" || message.priority === "emergency";
    const urgentBypassPolicy = isHighPriority && (await urgentBypassesMute());
    for (const row of partRes.rows) {
        // Badge nudge regardless of push decision.
        try {
            const unread = await getChatUnread(asPrincipal(row), message.chat_id);
            emitToPrincipal(row.kind, row.id, "unread.updated", {
                chatId: message.chat_id,
                unread,
            });
        }
        catch (err) {
            console.error("unread.updated emit error:", err);
        }
        const inRoom = await isPrincipalInChatRoom(row.kind, row.id, message.chat_id);
        if (inRoom)
            continue; // actively viewing — no push
        const prefs = await getChatPrefs(row);
        const mentioned = mentionSet.has(`${row.kind}:${row.id}`);
        const bypass = urgentBypassPolicy || (mentioned && prefs.mention_override);
        const recipientHasSpoken = prevSpeakers.has(`${row.kind}:${row.id}`);
        const verb = message.reply_to_message_id || recipientHasSpoken
            ? "replied"
            : "messaged";
        if (!bypass) {
            if (row.is_muted)
                continue;
            if (row.notification_level === "none")
                continue;
            if (row.notification_level === "mentions" && !mentioned)
                continue;
            if (!prefs.push_enabled)
                continue;
            if (prefs.dnd)
                continue;
            if (isQuietHour(prefs, nowHour))
                continue;
        }
        if (mentioned) {
            // Mentions are prominent — delivered immediately, not coalesced.
            try {
                await createNotification({
                    userId: row.id,
                    recipientRole: row.kind === "officer" ? "officer" : "citizen",
                    type: "chat_mention",
                    title: `${senderLabel} mentioned you`,
                    message: preview,
                    link: chatDashboardLink(chat.id),
                    metadata: {
                        chatId: chat.id,
                        messageId: message.id,
                        senderLabel,
                        verb,
                    },
                });
                emitToPrincipal(row.kind, row.id, "chat.notify", {
                    chatId: chat.id,
                    type: "chat_mention",
                    title: `${senderLabel} mentioned you`,
                    body: preview,
                    senderLabel,
                    link: chatDashboardLink(chat.id),
                });
            }
            catch (err) {
                console.error("chat_mention notify error:", err);
            }
            continue;
        }
        queuePush(chat, row, preview, verb, senderLabel);
    }
}
let urgentBypassCache = null;
async function urgentBypassesMute() {
    // Tiny TTL cache — this is read on every inbound message.
    if (urgentBypassCache && Date.now() - urgentBypassCache.at < 30_000) {
        return urgentBypassCache.value;
    }
    const { rows } = await pool.query(`SELECT value FROM system_settings WHERE key = 'chat.urgent_bypasses_mute'`);
    const value = rows[0]?.value === "true";
    urgentBypassCache = { value, at: Date.now() };
    return value;
}
