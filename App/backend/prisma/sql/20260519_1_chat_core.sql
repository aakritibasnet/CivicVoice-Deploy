-- Chat module — Sprint 2: foundations & data model.
-- Backs src/services/chat/*. Idempotent (re-runnable by apply-prisma-sql-patches).
--
-- Polymorphic principal: every participant/sender/receipt row carries
-- (party_kind, party_id). `party_kind` is constrained to 'user'|'officer';
-- there is intentionally NO foreign key on party_id because the principal
-- may live in EITHER `users` OR `officers` (two independent UUID spaces).
-- Integrity is enforced at the app layer in resolvePrincipal/assertChatAccess.
-- This mirrors the existing ward_published_reports.published_by precedent.

-- 1) Enums (guarded — CREATE TYPE has no IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_type') THEN
    CREATE TYPE chat_type AS ENUM (
      'officer_ward', 'municipality_internal', 'ward_municipality', 'complaint_case'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_status') THEN
    CREATE TYPE chat_status AS ENUM (
      'open', 'pending', 'escalated', 'resolved', 'closed', 'reopened'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_priority') THEN
    CREATE TYPE chat_priority AS ENUM ('normal', 'important', 'urgent', 'emergency');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_role') THEN
    CREATE TYPE chat_role AS ENUM ('admin', 'member', 'viewer');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_message_type') THEN
    CREATE TYPE chat_message_type AS ENUM (
      'text', 'image', 'file', 'audio', 'location', 'system'
    );
  END IF;
END $$;

-- 2) chats
CREATE TABLE IF NOT EXISTS "chats" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "type"             chat_type NOT NULL,
  "title"            VARCHAR(255),
  "municipality_id"  UUID,
  "ward_id"          UUID,
  "department_id"    UUID,
  "complaint_id"     UUID,
  "status"           chat_status NOT NULL DEFAULT 'open',
  "priority"         chat_priority NOT NULL DEFAULT 'normal',
  "is_group"         BOOLEAN NOT NULL DEFAULT FALSE,
  "is_archived"      BOOLEAN NOT NULL DEFAULT FALSE,
  "created_by_kind"  VARCHAR(8) NOT NULL,
  "created_by_id"    UUID NOT NULL,
  "last_message_at"  TIMESTAMPTZ(6),
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chats_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chats_created_by_kind_check"
    CHECK ("created_by_kind" IN ('user', 'officer')),
  CONSTRAINT "chats_municipality_id_fkey"
    FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "chats_ward_id_fkey"
    FOREIGN KEY ("ward_id") REFERENCES "wards"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "chats_complaint_id_fkey"
    FOREIGN KEY ("complaint_id") REFERENCES "reports"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "idx_chats_ward" ON "chats"("ward_id");
CREATE INDEX IF NOT EXISTS "idx_chats_municipality" ON "chats"("municipality_id");
CREATE INDEX IF NOT EXISTS "idx_chats_complaint" ON "chats"("complaint_id");
CREATE INDEX IF NOT EXISTS "idx_chats_last_message"
  ON "chats"("last_message_at" DESC);

-- 3) chat_participants
CREATE TABLE IF NOT EXISTS "chat_participants" (
  "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
  "chat_id"               UUID NOT NULL,
  "party_kind"            VARCHAR(8) NOT NULL,
  "party_id"              UUID NOT NULL,
  "role_in_chat"          chat_role NOT NULL DEFAULT 'member',
  "last_read_message_id"  UUID,
  "last_read_at"          TIMESTAMPTZ(6),
  "muted_until"           TIMESTAMPTZ(6),
  "notification_level"    VARCHAR(8) NOT NULL DEFAULT 'all',
  "is_active"             BOOLEAN NOT NULL DEFAULT TRUE,
  "joined_at"             TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removed_at"            TIMESTAMPTZ(6),
  CONSTRAINT "chat_participants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_participants_party_kind_check"
    CHECK ("party_kind" IN ('user', 'officer')),
  CONSTRAINT "chat_participants_notification_level_check"
    CHECK ("notification_level" IN ('all', 'mentions', 'none')),
  CONSTRAINT "chat_participants_chat_id_fkey"
    FOREIGN KEY ("chat_id") REFERENCES "chats"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "chat_participants_unique" UNIQUE ("chat_id", "party_kind", "party_id")
);
CREATE INDEX IF NOT EXISTS "idx_chat_participants_chat"
  ON "chat_participants"("chat_id");
CREATE INDEX IF NOT EXISTS "idx_chat_participants_party"
  ON "chat_participants"("party_kind", "party_id", "is_active");

-- 4) messages
CREATE TABLE IF NOT EXISTS "messages" (
  "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
  "chat_id"              UUID NOT NULL,
  "sender_kind"          VARCHAR(8) NOT NULL,
  "sender_id"            UUID NOT NULL,
  "type"                 chat_message_type NOT NULL DEFAULT 'text',
  "body"                 TEXT,
  "reply_to_message_id"  UUID,
  "priority"             chat_priority NOT NULL DEFAULT 'normal',
  "client_msg_id"        VARCHAR(64),
  "edited_at"            TIMESTAMPTZ(6),
  "deleted_at"           TIMESTAMPTZ(6),
  "created_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_sender_kind_check"
    CHECK ("sender_kind" IN ('user', 'officer')),
  CONSTRAINT "messages_chat_id_fkey"
    FOREIGN KEY ("chat_id") REFERENCES "chats"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "messages_reply_to_message_id_fkey"
    FOREIGN KEY ("reply_to_message_id") REFERENCES "messages"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "idx_messages_chat_created"
  ON "messages"("chat_id", "created_at");
-- Idempotency key for client retry/dedupe (scoped per chat); partial so old
-- rows without a client_msg_id don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS "messages_chat_client_msg_id_key"
  ON "messages"("chat_id", "client_msg_id")
  WHERE "client_msg_id" IS NOT NULL;

-- 4b) deferred FK: participant's last-read pointer → messages(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_participants_last_read_message_id_fkey'
  ) THEN
    ALTER TABLE "chat_participants"
      ADD CONSTRAINT "chat_participants_last_read_message_id_fkey"
      FOREIGN KEY ("last_read_message_id") REFERENCES "messages"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

-- 5) message_receipts
CREATE TABLE IF NOT EXISTS "message_receipts" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "message_id"       UUID NOT NULL,
  "party_kind"       VARCHAR(8) NOT NULL,
  "party_id"         UUID NOT NULL,
  "delivered_at"     TIMESTAMPTZ(6),
  "read_at"          TIMESTAMPTZ(6),
  "acknowledged_at"  TIMESTAMPTZ(6),
  CONSTRAINT "message_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "message_receipts_party_kind_check"
    CHECK ("party_kind" IN ('user', 'officer')),
  CONSTRAINT "message_receipts_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "message_receipts_unique"
    UNIQUE ("message_id", "party_kind", "party_id")
);
CREATE INDEX IF NOT EXISTS "idx_message_receipts_message"
  ON "message_receipts"("message_id");
CREATE INDEX IF NOT EXISTS "idx_message_receipts_party"
  ON "message_receipts"("party_kind", "party_id");
