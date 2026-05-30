-- Chat module — Sprint 5: generic, polymorphic chat audit trail.
-- activity_log is report-scoped and its actor_id FKs to users only, so it
-- cannot record officer actors or chat actions — hence a dedicated table.
-- Idempotent (re-runnable by apply-prisma-sql-patches).

CREATE TABLE IF NOT EXISTS "chat_audit_log" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "chat_id"     UUID NOT NULL,
  "actor_kind"  VARCHAR(8) NOT NULL,
  "actor_id"    UUID NOT NULL,
  "action"      VARCHAR(50) NOT NULL,
  "metadata"    JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_audit_log_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_audit_log_actor_kind_check"
    CHECK ("actor_kind" IN ('user', 'officer')),
  CONSTRAINT "chat_audit_log_chat_id_fkey"
    FOREIGN KEY ("chat_id") REFERENCES "chats"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_chat_audit_chat"
  ON "chat_audit_log"("chat_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_chat_audit_action"
  ON "chat_audit_log"("action");
