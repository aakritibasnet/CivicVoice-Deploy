-- Sprint 8: Group management, SLA timers, rate-limit policy settings
-- Idempotent. Tracked by apply-prisma-sql-patches.mjs via _prisma_sql_patches.

-- ── restrict_send flag on chats ──────────────────────────────────────────────
ALTER TABLE chats ADD COLUMN IF NOT EXISTS restrict_send boolean NOT NULL DEFAULT false;

-- ── SLA configuration per chat ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sla_configs (
  chat_id            uuid        PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  resolve_by_hours   int         NOT NULL DEFAULT 24,
  escalate_by_hours  int         NOT NULL DEFAULT 48,
  created_at         timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Active SLA timers ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sla_timers (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id           uuid        NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  started_at        timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolve_deadline  timestamptz NOT NULL,
  escalate_deadline timestamptz,
  overdue_fired_at  timestamptz,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS chat_sla_timers_chat_idx
  ON chat_sla_timers(chat_id);
-- Partial index: only open timers queried for overdue detection.
CREATE INDEX IF NOT EXISTS chat_sla_timers_deadline_idx
  ON chat_sla_timers(resolve_deadline)
  WHERE overdue_fired_at IS NULL AND resolved_at IS NULL;

-- ── Announcement records ─────────────────────────────────────────────────────
-- scope: 'all_municipality_officers' | 'ward_specific' | 'department' | 'all_ward_officers'
CREATE TABLE IF NOT EXISTS chat_announcements (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_kind     text        NOT NULL CHECK (sender_kind IN ('user','officer')),
  sender_id       uuid        NOT NULL,
  scope           text        NOT NULL,
  scope_id        uuid,                  -- ward_id / department_id when scoped
  municipality_id uuid,
  body            text        NOT NULL,
  sent_count      int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS chat_announcements_sender_idx
  ON chat_announcements(sender_kind, sender_id);
CREATE INDEX IF NOT EXISTS chat_announcements_created_idx
  ON chat_announcements(created_at DESC);

-- ── System-level rate limit policy keys ─────────────────────────────────────
INSERT INTO system_settings (key, value)
  VALUES ('chat.rate_limit_window_ms', '5000')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO system_settings (key, value)
  VALUES ('chat.rate_limit_max_per_window', '10')
  ON CONFLICT (key) DO NOTHING;
