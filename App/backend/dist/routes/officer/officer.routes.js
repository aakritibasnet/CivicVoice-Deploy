// src/routes/officer/officer.routes.ts
import { Router } from "express";
import { requireAuth } from "@/middleware/auth";
import { requireOfficerRole } from "@/middleware/requireOfficer";
import { uploadMemory } from "@/lib/upload.memory";
import { listTasks, taskDetail, changeTaskStatus, uploadProof, listReports, reportDetail, commentOnReport, commentOnTask, listNotifications, unreadCount, markNotifRead, markAllNotifsRead, history, profile, updatePhoto, changePassword, forceChangePassword, } from "@/controllers/officer/officer.controller";
const router = Router();
// All officer routes require auth + officer role
router.use(requireAuth, requireOfficerRole);
// Tasks
router.get("/tasks", listTasks);
router.get("/tasks/:id", taskDetail);
router.patch("/tasks/:id/status", changeTaskStatus);
router.post("/tasks/:id/proof", uploadMemory.single("image"), uploadProof);
router.post("/tasks/:id/comments", commentOnTask);
// Reports
router.get("/reports", listReports);
router.get("/reports/:id", reportDetail);
router.post("/reports/:id/comments", commentOnReport);
// Notifications
router.get("/notifications", listNotifications);
router.get("/notifications/unread-count", unreadCount);
router.patch("/notifications/:id/read", markNotifRead);
router.patch("/notifications/mark-all-read", markAllNotifsRead);
// History
router.get("/history", history);
// Profile
router.get("/profile", profile);
router.patch("/profile/photo", uploadMemory.single("image"), updatePhoto);
// Password
router.post("/change-password", changePassword);
router.post("/force-change-password", forceChangePassword);
export default router;
