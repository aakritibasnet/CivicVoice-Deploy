// Generic chat audit trail. Every workflow mutation (escalate, status
// change, acknowledge, close, reopen) writes a row here for legal
// retention. Accepts either the pool or an open transaction client so the
// audit row commits atomically with the action it records.
import { pool } from "@/db/pool";
export async function writeAudit(db, params) {
    await db.query(`INSERT INTO chat_audit_log (chat_id, actor_kind, actor_id, action, metadata)
     VALUES ($1, $2::text, $3::uuid, $4, $5::jsonb)`, [
        params.chatId,
        params.actor.kind,
        params.actor.id,
        params.action,
        JSON.stringify(params.metadata ?? {}),
    ]);
}
export async function listAudit(chatId, limit = 100) {
    const { rows } = await pool.query(`SELECT id, actor_kind, actor_id, action, metadata, created_at
       FROM chat_audit_log
      WHERE chat_id = $1
      ORDER BY created_at DESC
      LIMIT $2`, [chatId, Math.min(500, Math.max(1, limit))]);
    return rows;
}
