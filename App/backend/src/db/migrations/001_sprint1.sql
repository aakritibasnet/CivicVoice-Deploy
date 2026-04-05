-- Sprint 1 Migration: Anonymous reporting, status field, community counters
-- Run against: civic_voice database

-- 1) Status column with CHECK constraint
ALTER TABLE reports ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'submitted'
  CHECK (status IN ('submitted','under_review','in_progress','resolved','closed'));

-- 2) Community counters (used in Sprint 2, added now to avoid future migration)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS upvote_count INTEGER DEFAULT 0;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS comment_count INTEGER DEFAULT 0;

-- 3) Ensure id is nullable for anonymous reports
ALTER TABLE reports ALTER COLUMN id DROP NOT NULL;

-- 4) Junction table: tracks which device submitted anonymous reports
CREATE TABLE IF NOT EXISTS anonymous_reports (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(report_id)
);
CREATE INDEX IF NOT EXISTS idx_anon_reports_device ON anonymous_reports(device_id);

-- 5) Audit trail: records when anonymous reports are claimed by a user
CREATE TABLE IF NOT EXISTS anonymous_report_claims (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  claimed_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claimed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(report_id)
);
