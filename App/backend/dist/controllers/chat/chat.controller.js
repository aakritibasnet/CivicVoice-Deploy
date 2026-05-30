import { AppError } from "@/lib/errors";
import { resolvePrincipal, } from "@/services/chat/principal";
import { createChat, listMyChats, getParticipants, } from "@/services/chat/chat.service";
import { sendMessage, getHistory } from "@/services/chat/message.service";
import { escalateChat, setChatStatus, acknowledgeMessage, } from "@/services/chat/workflow.service";
import { listAudit } from "@/services/chat/chat-audit.service";
import { uploadChatAttachment, getAttachmentForDownload, } from "@/services/chat/attachment.service";
import { Readable } from "node:stream";
import { setMute } from "@/services/chat/mute.service";
import { getChatPrefs, updateChatPrefs, } from "@/services/chat/notification-prefs.service";
import { addReaction, removeReaction, listReactions, editMessage, deleteMessage, searchMessages, } from "@/services/chat/message-extras.service";
import { addParticipant, removeParticipant, updateParticipantRole, renameChat, setRestrictSend, archiveChat, } from "@/services/chat/group.service";
import { sendAnnouncement, listAnnouncements, } from "@/services/chat/announcement.service";
import { setSlaDeadline, getActiveSlaTimer, } from "@/services/chat/sla.service";
import { exportChatHistory, disableParticipant, listAllChatsAdmin, } from "@/services/chat/admin.service";
// Org contact lookups return one dashboard account for a single org scope.
// Keep this at 1 unless the product explicitly supports multiple dashboard
// accounts per ward or municipality in the mobile contact picker.
const ORG_ACCOUNT_CONTACT_LIMIT = 1;
function handleError(res, err) {
    if (err instanceof AppError) {
        return res
            .status(err.status)
            .json({ success: false, error: err.message });
    }
    console.error("chat controller error:", err);
    return res
        .status(500)
        .json({ success: false, error: "Server error" });
}
async function principalFromReq(req) {
    if (!req.user?.id) {
        throw new AppError("Unauthorized", 401);
    }
    return resolvePrincipal({
        id: req.user.id,
        role: req.user.role,
        kind: req.user.kind,
    });
}
// ── Peers ────────────────────────────────────────────────────────────────────
// Returns other officers in the same scope (ward or municipality) so the
// mobile officer app can start peer chats without knowing colleague IDs.
export async function listChatPeersController(req, res) {
    try {
        const principal = await principalFromReq(req);
        if (principal.kind !== "officer") {
            return res
                .status(403)
                .json({ success: false, error: "Officers only" });
        }
        const { pool } = await import("@/db/pool");
        if (principal.wardId) {
            // Ward officers: peers share the same ward_id.
            const { rows } = await pool.query(`SELECT o.id, o.first_name, o.last_name,
                o.type::text AS type,
                o.profile_image_url,
                d.name AS department_name
           FROM officers o
           LEFT JOIN officer_departments d ON d.id = o.department_id
          WHERE o.ward_id = $1
            AND o.id <> $2
            AND o.deleted_at IS NULL
          ORDER BY o.first_name, o.last_name`, [principal.wardId, principal.id]);
            return res.json({ success: true, data: { peers: rows } });
        }
        if (principal.municipalityId) {
            // Municipality officers: peers share the same municipality (via ward).
            const { rows } = await pool.query(`SELECT o.id, o.first_name, o.last_name,
                o.type::text AS type,
                o.profile_image_url,
                d.name AS department_name
           FROM officers o
           LEFT JOIN wards w ON w.id = o.ward_id
           LEFT JOIN officer_departments d ON d.id = o.department_id
          WHERE (w.municipality_id = $1 OR o.ward_id IS NULL)
            AND o.id <> $2
            AND o.type = 'municipality_officer'
            AND o.deleted_at IS NULL
          ORDER BY o.first_name, o.last_name`, [principal.municipalityId, principal.id]);
            return res.json({ success: true, data: { peers: rows } });
        }
        return res.json({ success: true, data: { peers: [] } });
    }
    catch (err) {
        return handleError(res, err);
    }
}
// ── Ward officers (for ward org → officers table) ─────────────────────────────
// Ward org accounts (users, role='ward') call this to list officers they can
// start officer_ward chats with. Returns from the officers table, not users.
export async function listWardOfficersController(req, res) {
    try {
        const principal = await principalFromReq(req);
        if (principal.kind !== "user") {
            return res
                .status(403)
                .json({ success: false, error: "Ward users only" });
        }
        if (!principal.wardId) {
            return res.json({ success: true, data: { officers: [] } });
        }
        const { pool } = await import("@/db/pool");
        const { rows } = await pool.query(`SELECT o.id, o.first_name, o.last_name,
              o.type::text AS type,
              o.profile_image_url,
              d.name AS department_name
         FROM officers o
         LEFT JOIN officer_departments d ON d.id = o.department_id
        WHERE o.ward_id = $1
          AND o.deleted_at IS NULL
        ORDER BY o.first_name, o.last_name`, [principal.wardId]);
        return res.json({ success: true, data: { officers: rows } });
    }
    catch (err) {
        return handleError(res, err);
    }
}
// ── Ward org accounts (for mobile officers → find ward dashboard user accounts) ─
// Ward officers get their single ward's org account.
// Municipality officers get all ward org accounts in their municipality.
export async function getWardOrgController(req, res) {
    try {
        const principal = await principalFromReq(req);
        if (principal.kind !== "officer") {
            return res
                .status(403)
                .json({ success: false, error: "Officers only" });
        }
        const { pool } = await import("@/db/pool");
        if (principal.wardId) {
            // Ward officer: return their own ward's dashboard account.
            const { rows } = await pool.query(`SELECT u.id, u.name, u.email, w.name AS ward_name
           FROM users u
           JOIN wards w ON w.id::text = u.ward_id::text
          WHERE u.ward_id::text = $1::text
            AND u.role = 'ward'
            AND u.deleted_at IS NULL
          LIMIT $2`, [principal.wardId, ORG_ACCOUNT_CONTACT_LIMIT]);
            return res.json({ success: true, data: { ward_orgs: rows } });
        }
        if (principal.municipalityId) {
            // Municipality officer: return all ward dashboard accounts in their municipality.
            const { rows } = await pool.query(`SELECT u.id, u.name, u.email, w.name AS ward_name
           FROM users u
           JOIN wards w ON w.id::text = u.ward_id::text
          WHERE w.municipality_id = $1
            AND u.role = 'ward'
            AND u.deleted_at IS NULL
          ORDER BY w.ward_code ASC`, [principal.municipalityId]);
            return res.json({ success: true, data: { ward_orgs: rows } });
        }
        return res.json({ success: true, data: { ward_orgs: [] } });
    }
    catch (err) {
        return handleError(res, err);
    }
}
// Municipality officers can initiate chats with the municipality dashboard
// account from the mobile app, matching the ward-officer -> ward-org flow.
export async function getMunicipalityOrgController(req, res) {
    try {
        const principal = await principalFromReq(req);
        if (principal.kind !== "officer") {
            return res
                .status(403)
                .json({ success: false, error: "Officers only" });
        }
        if (principal.officerType !== "municipality_officer" ||
            !principal.municipalityId) {
            return res.json({
                success: true,
                data: { municipality_orgs: [] },
            });
        }
        const { pool } = await import("@/db/pool");
        const { rows } = await pool.query(`SELECT u.id, u.name, u.email, m.name AS municipality_name
         FROM users u
         JOIN municipalities m ON m.id = u.municipality_id
        WHERE u.municipality_id = $1
          AND u.role = 'municipality'
          AND u.deleted_at IS NULL
        ORDER BY u.created_at ASC
        LIMIT $2`, [principal.municipalityId, ORG_ACCOUNT_CONTACT_LIMIT]);
        return res.json({
            success: true,
            data: { municipality_orgs: rows },
        });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function createChatController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const chat = await createChat(principal, req.body ?? {});
        return res
            .status(201)
            .json({ success: true, data: { chat } });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function listMyChatsController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const chats = await listMyChats(principal);
        return res.json({
            success: true,
            data: { chats },
        });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function getParticipantsController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const participants = await getParticipants(principal, req.params.id);
        return res.json({
            success: true,
            data: { participants },
        });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function sendMessageController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const result = await sendMessage(principal, req.params.id, req.body ?? {});
        return res
            .status(result.deduped ? 200 : 201)
            .json({ success: true, data: result });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function getHistoryController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const limit = req.query.limit
            ? Number.parseInt(String(req.query.limit), 10)
            : undefined;
        const data = await getHistory(principal, req.params.id, {
            limit,
            before: req.query.before ?? null,
            after: req.query.after ?? null,
        });
        return res.json({ success: true, data });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function escalateChatController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const chat = await escalateChat(principal, req.params.id, req.body ?? {});
        return res.json({ success: true, data: { chat } });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function setChatStatusController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const status = req.body?.status;
        const result = await setChatStatus(principal, req.params.id, status);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function acknowledgeMessageController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const result = await acknowledgeMessage(principal, req.params.id, req.params.messageId);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function uploadAttachmentController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const file = req.file;
        if (!file) {
            return res
                .status(400)
                .json({ success: false, error: "file is required" });
        }
        const result = await uploadChatAttachment(principal, req.params.id, {
            buffer: file.buffer,
            originalname: file.originalname,
            mimetype: file.mimetype,
        }, {
            body: req.body?.body ?? null,
            clientMsgId: req.body?.clientMsgId ?? null,
            replyToMessageId: req.body?.replyToMessageId ?? null,
        });
        return res
            .status(201)
            .json({ success: true, data: result });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function downloadAttachmentController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const delivery = await getAttachmentForDownload(principal, req.params.attachmentId, { thumbnail: req.query.thumb === "1" });
        // Fetch the signed asset server-side and stream it — the Cloudinary
        // URL is never exposed to the client.
        const upstream = await fetch(delivery.signedUrl);
        if (!upstream.ok || !upstream.body) {
            return res
                .status(502)
                .json({ success: false, error: "Upstream fetch failed" });
        }
        res.setHeader("Content-Type", delivery.mimeType);
        res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(delivery.fileName)}"`);
        res.setHeader("Cache-Control", "private, no-store");
        Readable.fromWeb(upstream.body).pipe(res);
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function muteChatController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const result = await setMute(principal, req.params.id, req.body?.duration);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function getNotificationPrefsController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const prefs = await getChatPrefs(principal);
        return res.json({ success: true, data: { prefs } });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function updateNotificationPrefsController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const prefs = await updateChatPrefs(principal, req.body ?? {});
        return res.json({ success: true, data: { prefs } });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function addReactionController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const data = await addReaction(principal, req.params.id, req.params.messageId, req.body?.emoji);
        return res.json({ success: true, data });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function removeReactionController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const data = await removeReaction(principal, req.params.id, req.params.messageId, String(req.query.emoji ?? req.body?.emoji ?? ""));
        return res.json({ success: true, data });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function listReactionsController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const reactions = await listReactions(principal, req.params.id, req.params.messageId);
        return res.json({
            success: true,
            data: { reactions },
        });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function editMessageController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const message = await editMessage(principal, req.params.id, req.params.messageId, req.body?.body);
        return res.json({
            success: true,
            data: { message },
        });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function deleteMessageController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const data = await deleteMessage(principal, req.params.id, req.params.messageId);
        return res.json({ success: true, data });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function searchMessagesController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const messages = await searchMessages(principal, req.params.id, String(req.query.q ?? ""));
        return res.json({
            success: true,
            data: { messages },
        });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function getAuditController(req, res) {
    try {
        const principal = await principalFromReq(req);
        // Reading the audit trail requires read access to the chat.
        await getParticipants(principal, req.params.id);
        const audit = await listAudit(req.params.id);
        return res.json({ success: true, data: { audit } });
    }
    catch (err) {
        return handleError(res, err);
    }
}
// ── Group management ─────────────────────────────────────────────────────────
export async function addParticipantController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const result = await addParticipant(principal, req.params.id, req.body);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function removeParticipantController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const result = await removeParticipant(principal, req.params.id, req.body);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function updateParticipantRoleController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const result = await updateParticipantRole(principal, req.params.id, req.body);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function renameChatController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const result = await renameChat(principal, req.params.id, req.body?.title);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function setRestrictSendController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const result = await setRestrictSend(principal, req.params.id, Boolean(req.body?.restrict_send));
        return res.json({ success: true, data: result });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function archiveChatController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const archive = req.body?.archive !== false; // default true
        const result = await archiveChat(principal, req.params.id, archive);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        return handleError(res, err);
    }
}
// ── Announcements ────────────────────────────────────────────────────────────
export async function sendAnnouncementController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const result = await sendAnnouncement(principal, req.body ?? {});
        return res.status(201).json({ success: true, data: result });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function listAnnouncementsController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const limit = req.query.limit ? Number(req.query.limit) : 50;
        const before = req.query.before ?? undefined;
        const announcements = await listAnnouncements(principal, limit, before);
        return res.json({
            success: true,
            data: { announcements },
        });
    }
    catch (err) {
        return handleError(res, err);
    }
}
// ── SLA ──────────────────────────────────────────────────────────────────────
export async function setSlaController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const result = await setSlaDeadline(principal, req.params.id, Number(req.body?.resolveByHours), req.body?.escalateByHours != null
            ? Number(req.body.escalateByHours)
            : undefined);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function getSlaController(req, res) {
    try {
        const principal = await principalFromReq(req);
        // Read access is enough to view the SLA timer.
        await getParticipants(principal, req.params.id);
        const timer = await getActiveSlaTimer(req.params.id);
        return res.json({ success: true, data: { timer } });
    }
    catch (err) {
        return handleError(res, err);
    }
}
// ── Admin ────────────────────────────────────────────────────────────────────
export async function exportChatController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const data = await exportChatHistory(principal, req.params.id);
        return res.json({ success: true, data });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function disableParticipantController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const result = await disableParticipant(principal, req.params.id, req.body);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        return handleError(res, err);
    }
}
export async function adminListChatsController(req, res) {
    try {
        const principal = await principalFromReq(req);
        const chats = await listAllChatsAdmin(principal, {
            wardId: req.query.wardId ?? null,
            municipalityId: req.query.municipalityId ?? null,
            status: req.query.status ?? null,
            limit: req.query.limit ? Number(req.query.limit) : undefined,
            before: req.query.before ?? null,
        });
        return res.json({ success: true, data: { chats } });
    }
    catch (err) {
        return handleError(res, err);
    }
}
