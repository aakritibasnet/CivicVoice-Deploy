-- 009: Report followers + Push notification tokens

-- 1) Report followers table (users who want notifications for a specific report)
CREATE TABLE IF NOT EXISTS report_followers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(report_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_report_followers_report ON report_followers(report_id);
CREATE INDEX IF NOT EXISTS idx_report_followers_user ON report_followers(user_id);

-- 2) Push tokens table (Expo Push Notification tokens)
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, token)
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
