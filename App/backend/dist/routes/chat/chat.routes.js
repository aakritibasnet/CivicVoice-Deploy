// src/routes/chat/chat.routes.ts
// Chat REST surface (Sprints 2–8). Every handler resolves a principal and
// passes chat-scoped work through assertChatAccess in the service layer.
import { Router } from "express";
import { requireAuth } from "@/middleware/auth";
import { uploadMemory } from "@/lib/upload.memory";
import { chatSendRateLimit } from "@/middleware/chat-rate-limit";
import { createChatController, listMyChatsController, getParticipantsController, sendMessageController, getHistoryController, escalateChatController, setChatStatusController, acknowledgeMessageController, getAuditController, uploadAttachmentController, downloadAttachmentController, muteChatController, getNotificationPrefsController, updateNotificationPrefsController, addReactionController, removeReactionController, listReactionsController, editMessageController, deleteMessageController, searchMessagesController, 
// Sprint 8
addParticipantController, removeParticipantController, updateParticipantRoleController, renameChatController, setRestrictSendController, archiveChatController, sendAnnouncementController, listAnnouncementsController, setSlaController, getSlaController, exportChatController, disableParticipantController, adminListChatsController, listChatPeersController, listWardOfficersController, getWardOrgController, getMunicipalityOrgController, } from "@/controllers/chat/chat.controller";
const chatRoutes = Router();
chatRoutes.use(requireAuth);
// Distinct 2-segment paths — keep above the /:id routes.
chatRoutes.get("/attachments/:attachmentId", downloadAttachmentController);
chatRoutes.get("/notification-prefs", getNotificationPrefsController);
chatRoutes.get("/peers", listChatPeersController);
chatRoutes.get("/ward-officers", listWardOfficersController);
chatRoutes.get("/ward-org", getWardOrgController);
chatRoutes.get("/municipality-org", getMunicipalityOrgController);
chatRoutes.put("/notification-prefs", updateNotificationPrefsController);
// Announcements (no chat context — municipality-wide).
chatRoutes.post("/announcements", sendAnnouncementController);
chatRoutes.get("/announcements", listAnnouncementsController);
// Admin list (no chat context — requires officer privilege).
chatRoutes.get("/admin/chats", adminListChatsController);
chatRoutes.post("/", createChatController);
chatRoutes.get("/", listMyChatsController);
chatRoutes.post("/:id/attachments", uploadMemory.single("file"), uploadAttachmentController);
chatRoutes.get("/:id/participants", getParticipantsController);
chatRoutes.post("/:id/messages", chatSendRateLimit, sendMessageController);
chatRoutes.get("/:id/messages", getHistoryController);
chatRoutes.patch("/:id/messages/:messageId", editMessageController);
chatRoutes.delete("/:id/messages/:messageId", deleteMessageController);
chatRoutes.post("/:id/messages/:messageId/ack", acknowledgeMessageController);
chatRoutes.post("/:id/messages/:messageId/reactions", addReactionController);
chatRoutes.delete("/:id/messages/:messageId/reactions", removeReactionController);
chatRoutes.get("/:id/messages/:messageId/reactions", listReactionsController);
chatRoutes.get("/:id/search", searchMessagesController);
chatRoutes.post("/:id/mute", muteChatController);
chatRoutes.post("/:id/escalate", escalateChatController);
chatRoutes.post("/:id/status", setChatStatusController);
chatRoutes.get("/:id/audit", getAuditController);
// ── Sprint 8: Group management ────────────────────────────────────────────
chatRoutes.post("/:id/participants", addParticipantController);
chatRoutes.delete("/:id/participants", removeParticipantController);
chatRoutes.patch("/:id/participants/role", updateParticipantRoleController);
chatRoutes.patch("/:id/title", renameChatController);
chatRoutes.post("/:id/restrict-send", setRestrictSendController);
chatRoutes.post("/:id/archive", archiveChatController);
// ── Sprint 8: SLA ────────────────────────────────────────────────────────
chatRoutes.post("/:id/sla", setSlaController);
chatRoutes.get("/:id/sla", getSlaController);
// ── Sprint 8: Admin console ──────────────────────────────────────────────
chatRoutes.get("/:id/export", exportChatController);
chatRoutes.post("/:id/disable-participant", disableParticipantController);
export default chatRoutes;
