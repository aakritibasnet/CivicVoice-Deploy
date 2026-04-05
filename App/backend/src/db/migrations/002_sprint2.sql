-- Sprint 2 Migration: Upvotes, Comments, Bookmarks, Address column
-- Run against: civic_voice database

-- 1) Address column for reverse geocoded text
ALTER TABLE reports ADD COLUMN IF NOT EXISTS address TEXT;

-- 2) Upvotes table
CREATE TABLE IF NOT EXISTS upvotes (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
  id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(report_id, id)
);

-- 3) Trigger to auto-update reports.upvote_count
CREATE OR REPLACE FUNCTION update_upvote_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE reports SET upvote_count = upvote_count + 1 WHERE report_id = NEW.report_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE reports SET upvote_count = upvote_count - 1 WHERE report_id = OLD.report_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS upvote_count_trigger ON upvotes;
CREATE TRIGGER upvote_count_trigger
AFTER INSERT OR DELETE ON upvotes
FOR EACH ROW EXECUTE FUNCTION update_upvote_count();

-- 4) Comments table
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
  id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_report ON comments(report_id, created_at DESC);

-- 5) Trigger to auto-update reports.comment_count
CREATE OR REPLACE FUNCTION update_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE reports SET comment_count = comment_count + 1 WHERE report_id = NEW.report_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE reports SET comment_count = comment_count - 1 WHERE report_id = OLD.report_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comment_count_trigger ON comments;
CREATE TRIGGER comment_count_trigger
AFTER INSERT OR DELETE ON comments
FOR EACH ROW EXECUTE FUNCTION update_comment_count();

-- 6) Bookmarks table
CREATE TABLE IF NOT EXISTS bookmarks (
  id SERIAL PRIMARY KEY,
  id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_id INTEGER NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(id, report_id)
);
