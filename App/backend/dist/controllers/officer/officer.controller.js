import { getOfficerTasks, getTaskDetail, updateTaskStatus, uploadTaskProof, getOfficerReports, getOfficerReportDetail, addReportComment, addTaskComment, getOfficerNotifications, getOfficerUnreadCount, markOfficerNotificationRead, markAllOfficerNotificationsRead, getOfficerHistory, getOfficerProfile, updateOfficerPhoto, changeOfficerPassword, getOfficerPublicTag, } from "@/services/officer/officer.service";
import { uploadBufferToCloudinary } from "@/lib/upload.cloudinary";
// ─── Tasks ─────────────────────────────────────────────────────────────
export async function listTasks(req, res, next) {
    try {
        const officerId = req.user.id;
        const filters = {
            status: req.query.status,
            priority: req.query.priority,
            ward_id: req.query.ward_id ? Number(req.query.ward_id) : undefined,
            department_id: req.query.department_id,
            escalated_only: req.query.escalated_only === "true",
            assigned_only: req.query.assigned_only !== "false",
        };
        const result = await getOfficerTasks(officerId, filters);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
export async function taskDetail(req, res, next) {
    try {
        const officerId = req.user.id;
        const result = await getTaskDetail(req.params.id, officerId);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
export async function changeTaskStatus(req, res, next) {
    try {
        const officerId = req.user.id;
        const { status, note } = req.body;
        if (!status) {
            return res.status(400).json({ success: false, error: "status is required" });
        }
        const result = await updateTaskStatus(req.params.id, officerId, status, note);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
export async function uploadProof(req, res, next) {
    try {
        const officerId = req.user.id;
        const file = req.file;
        if (!file) {
            return res.status(400).json({ success: false, error: "Image file is required" });
        }
        // Upload to cloudinary
        const uploaded = await uploadBufferToCloudinary({
            buffer: file.buffer,
            folder: "officer-proof",
            resourceType: "image",
        });
        const imageUrl = uploaded.secure_url;
        const type = req.body.type || "completion";
        const note = req.body.note;
        const result = await uploadTaskProof(req.params.id, officerId, imageUrl, type, note);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
// ─── Reports ───────────────────────────────────────────────────────────
export async function listReports(req, res, next) {
    try {
        const officerId = req.user.id;
        const wardId = req.query.ward_id ? Number(req.query.ward_id) : undefined;
        const result = await getOfficerReports(officerId, wardId);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
export async function reportDetail(req, res, next) {
    try {
        const officerId = req.user.id;
        const result = await getOfficerReportDetail(req.params.id, officerId);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
export async function commentOnReport(req, res, next) {
    try {
        const officerId = req.user.id;
        const { content } = req.body;
        if (!content?.trim()) {
            return res.status(400).json({ success: false, error: "content is required" });
        }
        const publicTag = await getOfficerPublicTag(officerId);
        const result = await addReportComment(req.params.id, officerId, content.trim(), publicTag);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
export async function commentOnTask(req, res, next) {
    try {
        const officerId = req.user.id;
        const { content } = req.body;
        if (!content?.trim()) {
            return res.status(400).json({ success: false, error: "content is required" });
        }
        const publicTag = await getOfficerPublicTag(officerId);
        const result = await addTaskComment(req.params.id, officerId, content.trim(), publicTag);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
// ─── Notifications ─────────────────────────────────────────────────────
export async function listNotifications(req, res, next) {
    try {
        const officerId = req.user.id;
        const unreadOnly = req.query.unread_only === "true";
        const result = await getOfficerNotifications(officerId, unreadOnly);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
export async function unreadCount(req, res, next) {
    try {
        const officerId = req.user.id;
        const result = await getOfficerUnreadCount(officerId);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
export async function markNotifRead(req, res, next) {
    try {
        const officerId = req.user.id;
        const result = await markOfficerNotificationRead(req.params.id, officerId);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
export async function markAllNotifsRead(req, res, next) {
    try {
        const officerId = req.user.id;
        const result = await markAllOfficerNotificationsRead(officerId);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
// ─── History ───────────────────────────────────────────────────────────
export async function history(req, res, next) {
    try {
        const officerId = req.user.id;
        const type = req.query.type;
        const result = await getOfficerHistory(officerId, type);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
// ─── Profile ───────────────────────────────────────────────────────────
export async function profile(req, res, next) {
    try {
        const officerId = req.user.id;
        const result = await getOfficerProfile(officerId);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
export async function updatePhoto(req, res, next) {
    try {
        const officerId = req.user.id;
        const file = req.file;
        if (!file) {
            return res.status(400).json({ success: false, error: "Image file is required" });
        }
        const uploaded = await uploadBufferToCloudinary({
            buffer: file.buffer,
            folder: "officer-profiles",
            resourceType: "image",
        });
        const imageUrl = uploaded.secure_url;
        const result = await updateOfficerPhoto(officerId, imageUrl);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
export async function changePassword(req, res, next) {
    try {
        const officerId = req.user.id;
        const { old_password, new_password } = req.body;
        if (!old_password || !new_password) {
            return res.status(400).json({
                success: false,
                error: "old_password and new_password are required",
            });
        }
        const result = await changeOfficerPassword(officerId, old_password, new_password);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
