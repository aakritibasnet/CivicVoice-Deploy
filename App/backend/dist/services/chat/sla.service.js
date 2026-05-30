// SLA timer service — Sprint 8.
// Officers (or system) attach an SLA config to a chat. A background checker
// runs every 60 s and fires a chat_sla_overdue notification + socket event
// for each timer whose resolve_deadline has passed without being fired yet.
//
// startSlaChecker() is called from server.ts once at startup.
// stopSlaChecker()  is called in tests / graceful shutdown.
import { pool } from "@/db/pool";
import { AppError } from "@/lib/errors";
import { assertChatAccess } from "./access";
import { writeAudit } from "./chat-audit.service";
import { createNotification } from "@/services/notifications/notifications.service";
import { emitToChat } from "@/realtime/io";
const CHECKER_INTERVAL_MS = 60_000;
let checkerHandle = null;
// ── Public API ───────────────────────────────────────────────────────────────
/** Set (or update) the SLA config for a chat and start a new timer. */
export async function setSlaDeadline(principal, chatId, resolveByHours, escalateByHours) {
    if (!Number.isFinite(resolveByHours) || resolveByHours <= 0) {
        throw new AppError("resolveByHours must be a positive number", 400);
    }
    await assertChatAccess(principal, chatId, "workflow");
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // Upsert the config.
        await client.query(`INSERT INTO chat_sla_configs (chat_id, resolve_by_hours, escalate_by_hours)
       VALUES ($1, $2, $3)
       ON CONFLICT (chat_id) DO UPDATE
         SET resolve_by_hours  = EXCLUDED.resolve_by_hours,
             escalate_by_hours = EXCLUDED.escalate_by_hours,
             updated_at        = CURRENT_TIMESTAMP`, [chatId, resolveByHours, escalateByHours ?? resolveByHours * 2]);
        // Void any open timers for this chat.
        await client.query(`UPDATE chat_sla_timers
          SET resolved_at = CURRENT_TIMESTAMP
        WHERE chat_id = $1 AND resolved_at IS NULL`, [chatId]);
        // Insert a fresh timer.
        const timerRes = await client.query(`INSERT INTO chat_sla_timers
         (chat_id, resolve_deadline, escalate_deadline)
       VALUES (
         $1,
         CURRENT_TIMESTAMP + ($2 * interval '1 hour'),
         CASE WHEN $3::int IS NOT NULL
              THEN CURRENT_TIMESTAMP + ($3::int * interval '1 hour')
              ELSE NULL
         END
       )
       RETURNING id, resolve_deadline, escalate_deadline`, [chatId, resolveByHours, escalateByHours ?? null]);
        const timer = timerRes.rows[0];
        await writeAudit(client, {
            chatId,
            actor: principal,
            action: "sla.set",
            metadata: {
                timerId: timer.id,
                resolveByHours,
                escalateByHours: escalateByHours ?? null,
                resolveDeadline: timer.resolve_deadline,
            },
        });
        await client.query("COMMIT");
        return timer;
    }
    catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        throw err;
    }
    finally {
        client.release();
    }
}
/** Cancel the open SLA timer (e.g. when a chat is resolved/closed). */
export async function resolveSlaTimer(chatId) {
    await pool.query(`UPDATE chat_sla_timers
        SET resolved_at = CURRENT_TIMESTAMP
      WHERE chat_id = $1 AND resolved_at IS NULL`, [chatId]);
}
/** Get the active SLA timer for a chat, or null. */
export async function getActiveSlaTimer(chatId) {
    const { rows } = await pool.query(`SELECT t.id, t.resolve_deadline, t.escalate_deadline,
            t.overdue_fired_at, t.started_at,
            c.resolve_by_hours, c.escalate_by_hours
       FROM chat_sla_timers t
       JOIN chat_sla_configs c ON c.chat_id = t.chat_id
      WHERE t.chat_id = $1 AND t.resolved_at IS NULL
      ORDER BY t.started_at DESC
      LIMIT 1`, [chatId]);
    return rows[0] ?? null;
}
// ── Background checker ───────────────────────────────────────────────────────
export function startSlaChecker() {
    if (checkerHandle)
        return;
    checkerHandle = setInterval(() => void runOverdueCheck(), CHECKER_INTERVAL_MS);
    // Run immediately on start to catch anything missed during downtime.
    void runOverdueCheck();
}
export function stopSlaChecker() {
    if (checkerHandle) {
        clearInterval(checkerHandle);
        checkerHandle = null;
    }
}
async function runOverdueCheck() {
    try {
        // Fetch overdue timers (resolve_deadline passed, not yet fired, not resolved).
        const { rows } = await pool.query(`SELECT t.id AS timer_id, t.chat_id,
              t.resolve_deadline, t.escalate_deadline
         FROM chat_sla_timers t
         JOIN chats c ON c.id = t.chat_id
        WHERE t.resolve_deadline <= CURRENT_TIMESTAMP
          AND t.overdue_fired_at IS NULL
          AND t.resolved_at IS NULL
          AND c.status NOT IN ('resolved', 'closed')
        LIMIT 50`);
        for (const row of rows) {
            await fireOverdue(row);
        }
    }
    catch (err) {
        console.error("SLA overdue check error:", err);
    }
}
async function fireOverdue(timer) {
    // Mark fired atomically — if two instances race, only one writes (CAS).
    const { rowCount } = await pool.query(`UPDATE chat_sla_timers
        SET overdue_fired_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND overdue_fired_at IS NULL`, [timer.timer_id]);
    if (!rowCount)
        return; // Another instance beat us.
    // Notify all active participants.
    const { rows: participants } = await pool.query(`SELECT party_kind, party_id FROM chat_participants
      WHERE chat_id = $1 AND is_active = TRUE`, [timer.chat_id]);
    await Promise.allSettled(participants.map((p) => createNotification({
        userId: p.party_id,
        recipientRole: p.party_kind === "officer" ? "officer" : "citizen",
        type: "chat_sla_overdue",
        title: "SLA deadline passed",
        message: "This chat has exceeded its resolution deadline.",
        link: `/chat/${timer.chat_id}`,
        metadata: {
            chatId: timer.chat_id,
            timerId: timer.timer_id,
            resolveDeadline: timer.resolve_deadline,
        },
    })));
    emitToChat(timer.chat_id, "sla.overdue", {
        chatId: timer.chat_id,
        timerId: timer.timer_id,
        resolveDeadline: timer.resolve_deadline,
    });
}
