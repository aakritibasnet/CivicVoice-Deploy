-- Sprint 4 Migration: Notifications and Preferences
-- Run against: civic_voice database

-- 1) Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_id INTEGER REFERENCES reports(report_id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  icon_name VARCHAR(100) NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index to efficiently fetch latest unread notifications per user
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created
  ON notifications(id, is_read, created_at DESC);

-- 2) Notification preferences per user
CREATE TABLE IF NOT EXISTS notification_preferences (
  id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  notify_status_changes BOOLEAN NOT NULL DEFAULT TRUE,
  notify_comments BOOLEAN NOT NULL DEFAULT TRUE,
  notify_upvote_milestones BOOLEAN NOT NULL DEFAULT TRUE,
  notify_badge_earned BOOLEAN NOT NULL DEFAULT TRUE,
  notify_nearby_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

