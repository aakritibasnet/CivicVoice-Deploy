-- Sprint 1 Rollback: reverses all changes from 001_sprint1.sql
-- Run against: civic_voice database

DROP TABLE IF EXISTS anonymous_report_claims;
DROP TABLE IF EXISTS anonymous_reports;
ALTER TABLE reports DROP COLUMN IF EXISTS comment_count;
ALTER TABLE reports DROP COLUMN IF EXISTS upvote_count;
ALTER TABLE reports DROP COLUMN IF EXISTS status;
