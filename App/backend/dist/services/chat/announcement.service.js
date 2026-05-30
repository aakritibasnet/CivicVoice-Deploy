// Announcement fan-out — Sprint 8.
// A municipality or ward officer can broadcast a system message to a scoped
// audience. Recipients who have an active socket in their personal room get an
// immediate socket event; the rest receive a chat_announcement notification.
//
// Scopes:
//   all_municipality_officers  — every officer whose municipality_id matches
//   all_ward_officers          — every officer in a specific ward
//   department                 — every officer in a specific department
//   ward_specific              — all active participants of all chats in a ward
import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";
import { createNotification } from "@/services/notifications/notifications.service";
import { emitToPrincipal } from "@/realtime/io";
async function resolveRecipients(principal, input) {
    switch (input.scope) {
        case "all_municipality_officers": {
            const muniId = principal.municipalityId;
            if (!muniId)
                throw new AppError("Sender has no municipality context", 403);
            const { rows } = await pool.query(`SELECT id FROM officers WHERE municipality_id = $1`, [muniId]);
            return rows.map((r) => ({ id: r.id, kind: "officer" }));
        }
        case "all_ward_officers": {
            const wardId = input.scopeId ?? principal.wardId;
            if (!wardId)
                throw new AppError("Ward ID required for all_ward_officers scope", 400);
            const { rows } = await pool.query(`SELECT id FROM officers WHERE ward_id = $1`, [wardId]);
            return rows.map((r) => ({ id: r.id, kind: "officer" }));
        }
        case "department": {
            if (!input.scopeId)
                throw new AppError("scopeId (department) required", 400);
            const { rows } = await pool.query(`SELECT id FROM officers WHERE department_id = $1`, [input.scopeId]);
            return rows.map((r) => ({ id: r.id, kind: "officer" }));
        }
        case "ward_specific": {
            const wardId = input.scopeId ?? principal.wardId;
            if (!wardId)
                throw new AppError("Ward ID required for ward_specific scope", 400);
            // Active participants across all chats in this ward, deduplicated.
            const { rows } = await pool.query(`SELECT DISTINCT cp.party_kind AS kind, cp.party_id AS id
           FROM chat_participants cp
           JOIN chats c ON c.id = cp.chat_id
          WHERE c.ward_id = $1 AND cp.is_active = TRUE`, [wardId]);
            return rows.map((r) => ({
                id: r.id,
                kind: r.kind,
            }));
        }
        default:
            throw new AppError("Unknown scope", 400);
    }
}
export async function sendAnnouncement(principal, input) {
    if (!input.body?.trim())
        throw new AppError("Body required", 400);
    // Only officers may send announcements.
    if (principal.kind !== "officer") {
        throw new AppError("Only officers can send announcements", 403);
    }
    const recipients = await resolveRecipients(principal, input);
    // Persist the announcement record.
    const { rows } = await pool.query(`INSERT INTO chat_announcements
       (sender_kind, sender_id, scope, scope_id, municipality_id, body, sent_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`, [
        principal.kind,
        principal.id,
        input.scope,
        input.scopeId ?? null,
        principal.municipalityId ?? null,
        input.body.trim(),
        recipients.length,
    ]);
    const announcement = rows[0];
    // Fan-out: socket emit + notification for each recipient (excluding sender).
    const payload = {
        announcementId: announcement.id,
        senderKind: principal.kind,
        senderId: principal.id,
        scope: input.scope,
        body: input.body.trim(),
        createdAt: announcement.created_at,
    };
    await Promise.allSettled(recipients
        .filter((r) => !(r.kind === principal.kind && r.id === principal.id))
        .map(async (r) => {
        emitToPrincipal(r.kind, r.id, "announcement.received", payload);
        try {
            await createNotification({
                userId: r.id,
                recipientRole: r.kind === "officer" ? "officer" : "citizen",
                type: "chat_announcement",
                title: "Announcement",
                message: input.body.trim().slice(0, 140),
                link: `/announcements/${announcement.id}`,
                metadata: { announcementId: announcement.id },
            });
        }
        catch {
            // Non-fatal — socket delivery already attempted.
        }
    }));
    return {
        id: announcement.id,
        scope: input.scope,
        sentCount: recipients.length,
        createdAt: announcement.created_at,
    };
}
export async function listAnnouncements(principal, limit = 50, before) {
    const { rows } = await pool.query(`SELECT id, sender_kind, sender_id, scope, scope_id, body, sent_count, created_at
       FROM chat_announcements
      WHERE municipality_id = $1
        AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
      ORDER BY created_at DESC
      LIMIT $3`, [principal.municipalityId ?? null, before ?? null, Math.min(100, limit)]);
    return rows;
}
