// Secured chat attachments. Upload validates declared type against the
// allowlist AND the file's magic bytes (extension/mime spoofing is not
// trusted), caps size, and stores the asset PRIVATELY in Cloudinary
// (type=authenticated). Nothing is ever served from a public URL — the
// only way to fetch an attachment is the authz'd backend proxy, which
// re-checks chat access, refuses `infected` files, and audits every read.
import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";
import { uploadPrivateToCloudinary, signedPrivateUrl, } from "@/lib/upload.cloudinary";
import { assertChatAccess } from "./access";
import { publishChatEvent } from "./chat-events.bridge";
import { writeAudit } from "./chat-audit.service";
const MAX_BYTES = Number(process.env.CHAT_ATTACHMENT_MAX_BYTES || 10 * 1024 * 1024);
const ALLOWLIST = {
    "image/jpeg": "image",
    "image/png": "image",
    "image/gif": "image",
    "image/webp": "image",
    "application/pdf": "raw",
};
/** Sniff the leading bytes; returns the real mime or null if unrecognized. */
function sniffMime(buf) {
    if (buf.length < 12)
        return null;
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
        return "image/jpeg";
    }
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
        return "image/png";
    }
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
        return "image/gif";
    }
    if (buf.toString("ascii", 0, 4) === "RIFF" &&
        buf.toString("ascii", 8, 12) === "WEBP") {
        return "image/webp";
    }
    if (buf.toString("ascii", 0, 5) === "%PDF-") {
        return "application/pdf";
    }
    return null;
}
export async function uploadChatAttachment(principal, chatId, file, opts) {
    await assertChatAccess(principal, chatId, "write");
    if (!file?.buffer?.length) {
        throw new AppError("Empty file", 400);
    }
    if (file.buffer.length > MAX_BYTES) {
        throw new AppError(`File exceeds ${Math.floor(MAX_BYTES / 1024 / 1024)}MB limit`, 413);
    }
    const sniffed = sniffMime(file.buffer);
    if (!sniffed || !(sniffed in ALLOWLIST)) {
        throw new AppError("Unsupported or unrecognized file type", 415);
    }
    // Declared mime must agree with the bytes (defends against spoofing).
    if (file.mimetype && file.mimetype !== sniffed) {
        throw new AppError("Declared type does not match file contents", 415);
    }
    const resourceType = ALLOWLIST[sniffed];
    const messageType = resourceType === "image" ? "image" : "file";
    const uploaded = await uploadPrivateToCloudinary({
        buffer: file.buffer,
        folder: `chat/${chatId}`,
        resourceType,
    });
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const msgRes = await client.query(`INSERT INTO messages
         (chat_id, sender_kind, sender_id, type, body, reply_to_message_id, client_msg_id)
       VALUES ($1, $2::text, $3::uuid, $4::chat_message_type, $5, $6, $7)
       RETURNING id, chat_id, sender_kind, sender_id, type::text AS type,
                 body, reply_to_message_id, created_at,
                 (extract(epoch from created_at) * 1000000)::bigint AS created_us`, [
            chatId,
            principal.kind,
            principal.id,
            messageType,
            opts.body?.trim() || null,
            opts.replyToMessageId ?? null,
            opts.clientMsgId ?? null,
        ]);
        const message = msgRes.rows[0];
        const attRes = await client.query(`INSERT INTO message_attachments
         (message_id, file_name, mime_type, size_bytes, storage_key,
          resource_type, scan_status, uploaded_by_kind, uploaded_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'clean', $7::text, $8::uuid)
       RETURNING id, file_name, mime_type, size_bytes, resource_type,
                 scan_status, created_at`, [
            message.id,
            file.originalname.slice(0, 255),
            sniffed,
            file.buffer.length,
            uploaded.public_id,
            resourceType,
            principal.kind,
            principal.id,
        ]);
        const attachment = attRes.rows[0];
        await client.query(`UPDATE chats SET last_message_at = $2,
              updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [chatId, message.created_at]);
        await writeAudit(client, {
            chatId,
            actor: principal,
            action: "attachment.uploaded",
            metadata: {
                attachmentId: attachment.id,
                fileName: attachment.file_name,
                mime: sniffed,
                size: file.buffer.length,
            },
        });
        await publishChatEvent(client, {
            event: "message.created",
            chat_id: chatId,
            message: { ...message, attachments: [attachment] },
        });
        await client.query("COMMIT");
        return { message, attachment };
    }
    catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        throw err;
    }
    finally {
        client.release();
    }
}
/**
 * Resolve an attachment for the proxy: re-check chat access, refuse
 * infected files, audit the read, and hand back a short-TTL signed URL the
 * proxy will fetch server-side (the URL never reaches the client).
 */
export async function getAttachmentForDownload(principal, attachmentId, opts) {
    const { rows } = await pool.query(`SELECT a.id, a.file_name, a.mime_type, a.storage_key, a.thumbnail_key,
            a.resource_type, a.scan_status::text AS scan_status,
            m.chat_id
       FROM message_attachments a
       JOIN messages m ON m.id = a.message_id
      WHERE a.id = $1`, [attachmentId]);
    const att = rows[0];
    if (!att)
        throw new AppError("Attachment not found", 404);
    // Authz: must have read access to the owning chat. Throws 403/404 and is
    // audited below only on success — a denied attempt is audited too.
    try {
        await assertChatAccess(principal, att.chat_id, "read");
    }
    catch (err) {
        await writeAudit(pool, {
            chatId: att.chat_id,
            actor: principal,
            action: "attachment.download_denied",
            metadata: { attachmentId, reason: err?.message },
        }).catch(() => { });
        throw err;
    }
    if (att.scan_status === "infected") {
        await writeAudit(pool, {
            chatId: att.chat_id,
            actor: principal,
            action: "attachment.download_blocked_infected",
            metadata: { attachmentId },
        }).catch(() => { });
        throw new AppError("File failed malware scan", 403);
    }
    await writeAudit(pool, {
        chatId: att.chat_id,
        actor: principal,
        action: "attachment.downloaded",
        metadata: { attachmentId, thumbnail: !!opts.thumbnail },
    });
    const signedUrl = signedPrivateUrl(att.storage_key, att.resource_type, {
        thumbnail: opts.thumbnail,
    });
    return {
        fileName: att.file_name,
        mimeType: att.mime_type,
        signedUrl,
    };
}
