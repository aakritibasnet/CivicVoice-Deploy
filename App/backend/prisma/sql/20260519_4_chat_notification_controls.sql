-- Chat module — Sprint 7: notification controls, mentions, reactions.
-- Per-principal chat notification prefs (officers get real controls — they
-- bypass notification_preferences entirely today). Idempotent.

CREATE TABLE IF NOT EXISTS "chat_notification_prefs" (
  "party_kind"        VARCHAR(8) NOT NULL,
  "party_id"          UUID NOT NULL,
  "push_enabled"      BOOLEAN NOT NULL DEFAULT TRUE,
  "in_app_enabled"    BOOLEAN NOT NULL DEFAULT TRUE,
  "dnd"               BOOLEAN NOT NULL DEFAULT FALSE,
  -- Quiet hours in the principal's local hour-of-day [0..23]; NULL = unset.
  -- Wrap-around (e.g. 22 -> 7) is supported by the suppression check.
  "quiet_hours_start" SMALLINT,
  "quiet_hours_end"   SMALLINT,
  -- When true, @mentions punch through mute / level / quiet hours / DND.
  "mention_override"  BOOLEAN NOT NULL DEFAULT TRUE,
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_notification_prefs_pkey"
    PRIMARY KEY ("party_kind", "party_id"),
  CONSTRAINT "chat_notification_prefs_party_kind_check"
    CHECK ("party_kind" IN ('user', 'officer')),
  CONSTRAINT "chat_notification_prefs_quiet_start_check"
    CHECK ("quiet_hours_start" IS NULL
           OR ("quiet_hours_start" BETWEEN 0 AND 23)),
  CONSTRAINT "chat_notification_prefs_quiet_end_check"
    CHECK ("quiet_hours_end" IS NULL
           OR ("quiet_hours_end" BETWEEN 0 AND 23))
);

CREATE TABLE IF NOT EXISTS "chat_mentions" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "message_id"     UUID NOT NULL,
  "mentioned_kind" VARCHAR(8) NOT NULL,
  "mentioned_id"   UUID NOT NULL,
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_mentions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_mentions_kind_check"
    CHECK ("mentioned_kind" IN ('user', 'officer')),
  CONSTRAINT "chat_mentions_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "chat_mentions_unique"
    UNIQUE ("message_id", "mentioned_kind", "mentioned_id")
);
CREATE INDEX IF NOT EXISTS "idx_chat_mentions_message"
  ON "chat_mentions"("message_id");
CREATE INDEX IF NOT EXISTS "idx_chat_mentions_party"
  ON "chat_mentions"("mentioned_kind", "mentioned_id");

CREATE TABLE IF NOT EXISTS "message_reactions" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "message_id" UUID NOT NULL,
  "party_kind" VARCHAR(8) NOT NULL,
  "party_id"   UUID NOT NULL,
  "emoji"      VARCHAR(16) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "message_reactions_kind_check"
    CHECK ("party_kind" IN ('user', 'officer')),
  CONSTRAINT "message_reactions_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "message_reactions_unique"
    UNIQUE ("message_id", "party_kind", "party_id", "emoji")
);
CREATE INDEX IF NOT EXISTS "idx_message_reactions_message"
  ON "message_reactions"("message_id");

INSERT INTO "system_settings" ("key", "value", "description")
VALUES ('chat.urgent_bypasses_mute', 'true',
        'When true, urgent/emergency chat messages ignore per-chat mute, '
        || 'quiet hours and DND.')
ON CONFLICT ("key") DO NOTHING;
