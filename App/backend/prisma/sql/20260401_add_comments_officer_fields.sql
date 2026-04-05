ALTER TABLE comments
ADD COLUMN IF NOT EXISTS officer_id UUID REFERENCES officers(id) ON DELETE SET NULL;

ALTER TABLE comments
ADD COLUMN IF NOT EXISTS public_tag VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_comments_officer_id ON comments(officer_id);
