ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS officer_id UUID;

ALTER TABLE notifications
ALTER COLUMN user_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_officer_id_fkey'
  ) THEN
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_officer_id_fkey
    FOREIGN KEY (officer_id)
    REFERENCES officers(id)
    ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_single_recipient_check'
  ) THEN
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_single_recipient_check
    CHECK (
      (CASE WHEN user_id IS NULL THEN 0 ELSE 1 END) +
      (CASE WHEN officer_id IS NULL THEN 0 ELSE 1 END) = 1
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_officer
ON notifications(officer_id);

CREATE INDEX IF NOT EXISTS idx_notifications_officer_unread
ON notifications(officer_id, is_read);

ALTER TABLE push_tokens
ADD COLUMN IF NOT EXISTS officer_id UUID;

ALTER TABLE push_tokens
ALTER COLUMN user_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'push_tokens_officer_id_fkey'
  ) THEN
    ALTER TABLE push_tokens
    ADD CONSTRAINT push_tokens_officer_id_fkey
    FOREIGN KEY (officer_id)
    REFERENCES officers(id)
    ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'push_tokens_single_owner_check'
  ) THEN
    ALTER TABLE push_tokens
    ADD CONSTRAINT push_tokens_single_owner_check
    CHECK (
      (CASE WHEN user_id IS NULL THEN 0 ELSE 1 END) +
      (CASE WHEN officer_id IS NULL THEN 0 ELSE 1 END) = 1
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_officer_id_token_key
ON push_tokens(officer_id, token);

CREATE INDEX IF NOT EXISTS idx_push_tokens_officer
ON push_tokens(officer_id);
