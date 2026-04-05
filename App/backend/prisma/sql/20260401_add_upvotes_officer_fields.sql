ALTER TABLE upvotes
ADD COLUMN IF NOT EXISTS officer_id UUID;

ALTER TABLE upvotes
ALTER COLUMN user_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'upvotes_officer_id_fkey'
  ) THEN
    ALTER TABLE upvotes
    ADD CONSTRAINT upvotes_officer_id_fkey
    FOREIGN KEY (officer_id)
    REFERENCES officers(id)
    ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS upvotes_report_id_officer_id_key
ON upvotes(report_id, officer_id);

CREATE INDEX IF NOT EXISTS idx_upvotes_officer_id
ON upvotes(officer_id);
