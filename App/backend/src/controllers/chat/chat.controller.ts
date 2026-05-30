// src/controllers/chat/chat.controller.ts
import type { Request, Response } from "express";
import type { ApiResponse } from "@/types/api.types";
import { AppError } from "@/lib/errors";
import {
  resolvePrincipal,
  type PrincipalKind,
} from "@/services/chat/principal";
import {
  createChat,
  listMyChats,
  getParticipants,
} from "@/services/chat/chat.service";
import { sendMessage, getHistory } from "@/services/chat/message.service";
import {
  escalateChat,
  setChatStatus,
  acknowledgeMessage,
  type ChatStatus,
} from "@/services/chat/workflow.service";
import { listAudit } from "@/services/chat/chat-audit.service";
import {
  uploadChatAttachment,
  getAttachmentForDownload,
} from "@/services/chat/attachment.service";
import { Readable } from "node:stream";
import { setMute, type MuteDuration } from "@/services/chat/mute.service";
import {
  getChatPrefs,
  updateChatPrefs,
} from "@/services/chat/notification-prefs.service";
import {
  addReaction,
  removeReaction,
  listReactions,
  editMessage,
  deleteMessage,
  searchMessages,
} from "@/services/chat/message-extras.service";
import {
  addParticipant,
  removeParticipant,
  updateParticipantRole,
  renameChat,
  setRestrictSend,
  archiveChat,
} from "@/services/chat/group.service";
import {
  sendAnnouncement,
  listAnnouncements,
} from "@/services/chat/announcement.service";
import {
  setSlaDeadline,
  getActiveSlaTimer,
} from "@/services/chat/sla.service";
import {
  exportChatHistory,
  disableParticipant,
  listAllChatsAdmin,
} from "@/services/chat/admin.service";

// Org contact lookups return one dashboard account for a single org scope.
// Keep this at 1 unless the product explicitly supports multiple dashboard
// accounts per ward or municipality in the mobile contact picker.
const ORG_ACCOUNT_CONTACT_LIMIT = 1;

function handleError(res: Response, err: unknown) {
  if (err instanceof AppError) {
    return res
      .status(err.status)
      .json({ success: false, error: err.message } satisfies ApiResponse);
  }
  console.error("chat controller error:", err);
  return res
    .status(500)
    .json({ success: false, error: "Server error" } satisfies ApiResponse);
}

async function principalFromReq(req: Request) {
  if (!req.user?.id) {
    throw new AppError("Unauthorized", 401);
  }
  return resolvePrincipal({
    id: req.user.id,
    role: req.user.role,
    kind: req.user.kind as PrincipalKind | undefined,
  });
}

// ── Peers ────────────────────────────────────────────────────────────────────
// Returns other officers in the same scope (ward or municipality) so the
// mobile officer app can start peer chats without knowing colleague IDs.
export async function listChatPeersController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    if (principal.kind !== "officer") {
      return res
        .status(403)
        .json({ success: false, error: "Officers only" } satisfies ApiResponse);
    }

    const { pool } = await import("@/db/pool");

    if (principal.wardId) {
      // Ward officers: peers share the same ward_id.
      const { rows } = await pool.query(
        `SELECT o.id, o.first_name, o.last_name,
                o.type::text AS type,
                o.profile_image_url,
                d.name AS department_name
           FROM officers o
           LEFT JOIN officer_departments d ON d.id = o.department_id
          WHERE o.ward_id = $1
            AND o.id <> $2
            AND o.deleted_at IS NULL
          ORDER BY o.first_name, o.last_name`,
        [principal.wardId, principal.id],
      );
      return res.json({ success: true, data: { peers: rows } } satisfies ApiResponse);
    }

    if (principal.municipalityId) {
      // Municipality officers: peers share the same municipality (via ward).
      const { rows } = await pool.query(
        `SELECT o.id, o.first_name, o.last_name,
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
          ORDER BY o.first_name, o.last_name`,
        [principal.municipalityId, principal.id],
      );
      return res.json({ success: true, data: { peers: rows } } satisfies ApiResponse);
    }

    return res.json({ success: true, data: { peers: [] } } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

// ── Ward officers (for ward org → officers table) ─────────────────────────────
// Ward org accounts (users, role='ward') call this to list officers they can
// start officer_ward chats with. Returns from the officers table, not users.
export async function listWardOfficersController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    if (principal.kind !== "user") {
      return res
        .status(403)
        .json({ success: false, error: "Ward users only" } satisfies ApiResponse);
    }
    if (!principal.wardId) {
      return res.json({ success: true, data: { officers: [] } } satisfies ApiResponse);
    }

    const { pool } = await import("@/db/pool");
    const { rows } = await pool.query(
      `SELECT o.id, o.first_name, o.last_name,
              o.type::text AS type,
              o.profile_image_url,
              d.name AS department_name
         FROM officers o
         LEFT JOIN officer_departments d ON d.id = o.department_id
        WHERE o.ward_id = $1
          AND o.deleted_at IS NULL
        ORDER BY o.first_name, o.last_name`,
      [principal.wardId],
    );
    return res.json({ success: true, data: { officers: rows } } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

// ── Ward org accounts (for mobile officers → find ward dashboard user accounts) ─
// Ward officers get their single ward's org account.
// Municipality officers get all ward org accounts in their municipality.
export async function getWardOrgController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    if (principal.kind !== "officer") {
      return res
        .status(403)
        .json({ success: false, error: "Officers only" } satisfies ApiResponse);
    }

    const { pool } = await import("@/db/pool");

    if (principal.wardId) {
      // Ward officer: return their own ward's dashboard account.
      const { rows } = await pool.query(
        `SELECT u.id, u.name, u.email, w.name AS ward_name
           FROM users u
           JOIN wards w ON w.id::text = u.ward_id::text
          WHERE u.ward_id::text = $1::text
            AND u.role = 'ward'
            AND u.deleted_at IS NULL
          LIMIT $2`,
        [principal.wardId, ORG_ACCOUNT_CONTACT_LIMIT],
      );
      return res.json({ success: true, data: { ward_orgs: rows } } satisfies ApiResponse);
    }

    if (principal.municipalityId) {
      // Municipality officer: return all ward dashboard accounts in their municipality.
      const { rows } = await pool.query(
        `SELECT u.id, u.name, u.email, w.name AS ward_name
           FROM users u
           JOIN wards w ON w.id::text = u.ward_id::text
          WHERE w.municipality_id = $1
            AND u.role = 'ward'
            AND u.deleted_at IS NULL
          ORDER BY w.ward_code ASC`,
        [principal.municipalityId],
      );
      return res.json({ success: true, data: { ward_orgs: rows } } satisfies ApiResponse);
    }

    return res.json({ success: true, data: { ward_orgs: [] } } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

// Municipality officers can initiate chats with the municipality dashboard
// account from the mobile app, matching the ward-officer -> ward-org flow.
export async function getMunicipalityOrgController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    if (principal.kind !== "officer") {
      return res
        .status(403)
        .json({ success: false, error: "Officers only" } satisfies ApiResponse);
    }
    if (
      principal.officerType !== "municipality_officer" ||
      !principal.municipalityId
    ) {
      return res.json({
        success: true,
        data: { municipality_orgs: [] },
      } satisfies ApiResponse);
    }

    const { pool } = await import("@/db/pool");
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, m.name AS municipality_name
         FROM users u
         JOIN municipalities m ON m.id = u.municipality_id
        WHERE u.municipality_id = $1
          AND u.role = 'municipality'
          AND u.deleted_at IS NULL
        ORDER BY u.created_at ASC
        LIMIT $2`,
      [principal.municipalityId, ORG_ACCOUNT_CONTACT_LIMIT],
    );

    return res.json({
      success: true,
      data: { municipality_orgs: rows },
    } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function createChatController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const chat = await createChat(principal, req.body ?? {});
    return res
      .status(201)
      .json({ success: true, data: { chat } } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function listMyChatsController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const chats = await listMyChats(principal);
    return res.json({
      success: true,
      data: { chats },
    } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function getParticipantsController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const participants = await getParticipants(principal, req.params.id);
    return res.json({
      success: true,
      data: { participants },
    } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function sendMessageController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const result = await sendMessage(principal, req.params.id, req.body ?? {});
    return res
      .status(result.deduped ? 200 : 201)
      .json({ success: true, data: result } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function getHistoryController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const limit = req.query.limit
      ? Number.parseInt(String(req.query.limit), 10)
      : undefined;
    const data = await getHistory(principal, req.params.id, {
      limit,
      before: (req.query.before as string) ?? null,
      after: (req.query.after as string) ?? null,
    });
    return res.json({ success: true, data } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function escalateChatController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const chat = await escalateChat(principal, req.params.id, req.body ?? {});
    return res.json({ success: true, data: { chat } } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function setChatStatusController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const status = req.body?.status as ChatStatus;
    const result = await setChatStatus(principal, req.params.id, status);
    return res.json({ success: true, data: result } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function acknowledgeMessageController(
  req: Request,
  res: Response,
) {
  try {
    const principal = await principalFromReq(req);
    const result = await acknowledgeMessage(
      principal,
      req.params.id,
      req.params.messageId,
    );
    return res.json({ success: true, data: result } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function uploadAttachmentController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      return res
        .status(400)
        .json({ success: false, error: "file is required" } satisfies ApiResponse);
    }
    const result = await uploadChatAttachment(
      principal,
      req.params.id,
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      },
      {
        body: req.body?.body ?? null,
        clientMsgId: req.body?.clientMsgId ?? null,
        replyToMessageId: req.body?.replyToMessageId ?? null,
      },
    );
    return res
      .status(201)
      .json({ success: true, data: result } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function downloadAttachmentController(
  req: Request,
  res: Response,
) {
  try {
    const principal = await principalFromReq(req);
    const delivery = await getAttachmentForDownload(
      principal,
      req.params.attachmentId,
      { thumbnail: req.query.thumb === "1" },
    );
    // Fetch the signed asset server-side and stream it — the Cloudinary
    // URL is never exposed to the client.
    const upstream = await fetch(delivery.signedUrl);
    if (!upstream.ok || !upstream.body) {
      return res
        .status(502)
        .json({ success: false, error: "Upstream fetch failed" } satisfies ApiResponse);
    }
    res.setHeader("Content-Type", delivery.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(delivery.fileName)}"`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(
      res,
    );
  } catch (err) {
    return handleError(res, err);
  }
}

export async function muteChatController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const result = await setMute(
      principal,
      req.params.id,
      req.body?.duration as MuteDuration,
    );
    return res.json({ success: true, data: result } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function getNotificationPrefsController(
  req: Request,
  res: Response,
) {
  try {
    const principal = await principalFromReq(req);
    const prefs = await getChatPrefs(principal);
    return res.json({ success: true, data: { prefs } } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function updateNotificationPrefsController(
  req: Request,
  res: Response,
) {
  try {
    const principal = await principalFromReq(req);
    const prefs = await updateChatPrefs(principal, req.body ?? {});
    return res.json({ success: true, data: { prefs } } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function addReactionController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const data = await addReaction(
      principal,
      req.params.id,
      req.params.messageId,
      req.body?.emoji,
    );
    return res.json({ success: true, data } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function removeReactionController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const data = await removeReaction(
      principal,
      req.params.id,
      req.params.messageId,
      String(req.query.emoji ?? req.body?.emoji ?? ""),
    );
    return res.json({ success: true, data } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function listReactionsController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const reactions = await listReactions(
      principal,
      req.params.id,
      req.params.messageId,
    );
    return res.json({
      success: true,
      data: { reactions },
    } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function editMessageController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const message = await editMessage(
      principal,
      req.params.id,
      req.params.messageId,
      req.body?.body,
    );
    return res.json({
      success: true,
      data: { message },
    } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function deleteMessageController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const data = await deleteMessage(
      principal,
      req.params.id,
      req.params.messageId,
    );
    return res.json({ success: true, data } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function searchMessagesController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const messages = await searchMessages(
      principal,
      req.params.id,
      String(req.query.q ?? ""),
    );
    return res.json({
      success: true,
      data: { messages },
    } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function getAuditController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    // Reading the audit trail requires read access to the chat.
    await getParticipants(principal, req.params.id);
    const audit = await listAudit(req.params.id);
    return res.json({ success: true, data: { audit } } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

// ── Group management ─────────────────────────────────────────────────────────

export async function addParticipantController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const result = await addParticipant(principal, req.params.id, req.body);
    return res.json({ success: true, data: result } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function removeParticipantController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const result = await removeParticipant(principal, req.params.id, req.body);
    return res.json({ success: true, data: result } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function updateParticipantRoleController(
  req: Request,
  res: Response,
) {
  try {
    const principal = await principalFromReq(req);
    const result = await updateParticipantRole(
      principal,
      req.params.id,
      req.body,
    );
    return res.json({ success: true, data: result } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function renameChatController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const result = await renameChat(
      principal,
      req.params.id,
      req.body?.title,
    );
    return res.json({ success: true, data: result } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function setRestrictSendController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const result = await setRestrictSend(
      principal,
      req.params.id,
      Boolean(req.body?.restrict_send),
    );
    return res.json({ success: true, data: result } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function archiveChatController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const archive = req.body?.archive !== false; // default true
    const result = await archiveChat(principal, req.params.id, archive);
    return res.json({ success: true, data: result } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

// ── Announcements ────────────────────────────────────────────────────────────

export async function sendAnnouncementController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const result = await sendAnnouncement(principal, req.body ?? {});
    return res.status(201).json({ success: true, data: result } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function listAnnouncementsController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const before = (req.query.before as string) ?? undefined;
    const announcements = await listAnnouncements(principal, limit, before);
    return res.json({
      success: true,
      data: { announcements },
    } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

// ── SLA ──────────────────────────────────────────────────────────────────────

export async function setSlaController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const result = await setSlaDeadline(
      principal,
      req.params.id,
      Number(req.body?.resolveByHours),
      req.body?.escalateByHours != null
        ? Number(req.body.escalateByHours)
        : undefined,
    );
    return res.json({ success: true, data: result } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function getSlaController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    // Read access is enough to view the SLA timer.
    await getParticipants(principal, req.params.id);
    const timer = await getActiveSlaTimer(req.params.id);
    return res.json({ success: true, data: { timer } } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function exportChatController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const data = await exportChatHistory(principal, req.params.id);
    return res.json({ success: true, data } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function disableParticipantController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const result = await disableParticipant(principal, req.params.id, req.body);
    return res.json({ success: true, data: result } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function adminListChatsController(req: Request, res: Response) {
  try {
    const principal = await principalFromReq(req);
    const chats = await listAllChatsAdmin(principal, {
      wardId: req.query.wardId as string ?? null,
      municipalityId: req.query.municipalityId as string ?? null,
      status: req.query.status as string ?? null,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      before: req.query.before as string ?? null,
    });
    return res.json({ success: true, data: { chats } } satisfies ApiResponse);
  } catch (err) {
    return handleError(res, err);
  }
}
