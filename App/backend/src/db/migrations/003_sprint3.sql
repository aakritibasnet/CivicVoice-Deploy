-- Sprint 3 Migration: Gamification (badges, user_stats, leaderboards helpers)
-- Run against: civic_voice database

-- 1) Badges master table
CREATE TABLE IF NOT EXISTS badges (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  icon_name TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('bronze','silver','gold','platinum')),
  criteria_type TEXT NOT NULL CHECK (
    criteria_type IN ('report_count','upvote_count','resolution_rate','streak_days')
  ),
  criteria_value INTEGER NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- 2) User-badges junction table
CREATE TABLE IF NOT EXISTS user_badges (
  id SERIAL PRIMARY KEY,
  id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  UNIQUE (id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(id, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge ON user_badges(badge_id);

-- 3) Cached user statistics
CREATE TABLE IF NOT EXISTS user_stats (
  id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_reports INTEGER NOT NULL DEFAULT 0,
  resolved_reports INTEGER NOT NULL DEFAULT 0,
  total_upvotes_received INTEGER NOT NULL DEFAULT 0,
  current_streak_days INTEGER NOT NULL DEFAULT 0,
  longest_streak_days INTEGER NOT NULL DEFAULT 0,
  last_report_date DATE,
  impact_score INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_stats_impact ON user_stats(impact_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_total_reports ON user_stats(total_reports DESC);

-- 4) Helpful indexes on reports for leaderboards & stats
CREATE INDEX IF NOT EXISTS idx_reports_user_created_at
  ON reports(id, created_at);

CREATE INDEX IF NOT EXISTS idx_reports_user_status
  ON reports(id, status);

-- 5) Function: recompute user_stats from base tables
CREATE OR REPLACE FUNCTION refresh_user_stats(p_id INTEGER)
RETURNS user_stats AS $$
DECLARE
  v_stats user_stats;
  v_last_date DATE;
  v_total_reports INTEGER;
  v_resolved_reports INTEGER;
  v_total_upvotes INTEGER;
  v_current_streak INTEGER;
  v_longest_streak INTEGER;
BEGIN
  -- Basic aggregates
  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE status = 'completed')::INTEGER,
    COALESCE(SUM(upvote_count), 0)::INTEGER,
    MAX(created_at)::DATE
  INTO
    v_total_reports,
    v_resolved_reports,
    v_total_upvotes,
    v_last_date
  FROM reports
  WHERE id = p_id;

  IF v_total_reports IS NULL THEN
    v_total_reports := 0;
    v_resolved_reports := 0;
    v_total_upvotes := 0;
    v_last_date := NULL;
  END IF;

  -- Current streak: consecutive days ending at last_report_date
  IF v_last_date IS NULL THEN
    v_current_streak := 0;
  ELSE
    WITH days AS (
      SELECT DISTINCT created_at::DATE AS d
      FROM reports
      WHERE id = p_id
    ),
    ordered AS (
      SELECT d, ROW_NUMBER() OVER (ORDER BY d DESC) AS rn
      FROM days
    ),
    grouped AS (
      SELECT d
      FROM ordered
      WHERE (SELECT MAX(d) FROM days) - d = rn - 1
    )
    SELECT COUNT(*)::INTEGER INTO v_current_streak FROM grouped;
  END IF;

  -- Longest streak: longest run of consecutive days with at least one report
  IF v_last_date IS NULL THEN
    v_longest_streak := 0;
  ELSE
    WITH days AS (
      SELECT DISTINCT created_at::DATE AS d
      FROM reports
      WHERE id = p_id
    ),
    ordered AS (
      SELECT d, ROW_NUMBER() OVER (ORDER BY d) AS rn
      FROM days
    ),
    groups AS (
      SELECT (d - (rn || ' day')::INTERVAL)::DATE AS grp_key, COUNT(*) AS cnt
      FROM ordered
      GROUP BY (d - (rn || ' day')::INTERVAL)::DATE
    )
    SELECT COALESCE(MAX(cnt), 0)::INTEGER INTO v_longest_streak FROM groups;
  END IF;

  -- Impact score: resolved * 10 + upvotes * 2
  v_stats.impact_score := (v_resolved_reports * 10) + (v_total_upvotes * 2);

  -- Upsert into user_stats
  INSERT INTO user_stats (
    id,
    total_reports,
    resolved_reports,
    total_upvotes_received,
    current_streak_days,
    longest_streak_days,
    last_report_date,
    impact_score,
    updated_at
  )
  VALUES (
    p_id,
    v_total_reports,
    v_resolved_reports,
    v_total_upvotes,
    COALESCE(v_current_streak, 0),
    COALESCE(GREATEST(v_longest_streak, COALESCE(v_current_streak, 0)), 0),
    v_last_date,
    v_stats.impact_score,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    total_reports = EXCLUDED.total_reports,
    resolved_reports = EXCLUDED.resolved_reports,
    total_upvotes_received = EXCLUDED.total_upvotes_received,
    current_streak_days = EXCLUDED.current_streak_days,
    longest_streak_days = EXCLUDED.longest_streak_days,
    last_report_date = EXCLUDED.last_report_date,
    impact_score = EXCLUDED.impact_score,
    updated_at = EXCLUDED.updated_at
  RETURNING * INTO v_stats;

  RETURN v_stats;
END;
$$ LANGUAGE plpgsql;

-- 6) Trigger function: keep user_stats in sync with reports changes
CREATE OR REPLACE FUNCTION sync_user_stats_from_reports()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.id IS NOT NULL THEN
      PERFORM refresh_user_stats(NEW.id);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- If report ownership moved between users (e.g. anonymous claim)
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      IF OLD.id IS NOT NULL THEN
        PERFORM refresh_user_stats(OLD.id);
      END IF;
      IF NEW.id IS NOT NULL THEN
        PERFORM refresh_user_stats(NEW.id);
      END IF;
    ELSE
      IF NEW.id IS NOT NULL THEN
        PERFORM refresh_user_stats(NEW.id);
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.id IS NOT NULL THEN
      PERFORM refresh_user_stats(OLD.id);
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_user_stats ON reports;
CREATE TRIGGER trg_sync_user_stats
AFTER INSERT OR UPDATE OF status, id, upvote_count OR DELETE ON reports
FOR EACH ROW EXECUTE FUNCTION sync_user_stats_from_reports();

-- 7) Badge awarding function
CREATE OR REPLACE FUNCTION check_and_award_badges(p_id INTEGER)
RETURNS INTEGER[] AS $$
DECLARE
  v_stats user_stats;
  v_badge RECORD;
  v_new_badge_ids INTEGER[] := '{}';
  v_resolution_rate NUMERIC := 0;
BEGIN
  -- Ensure stats are up to date
  v_stats := refresh_user_stats(p_id);

  IF v_stats.total_reports > 0 THEN
    v_resolution_rate :=
      (v_stats.resolved_reports::NUMERIC * 100.0) / v_stats.total_reports::NUMERIC;
  ELSE
    v_resolution_rate := 0;
  END IF;

  FOR v_badge IN
    SELECT b.*
    FROM badges b
    WHERE NOT EXISTS (
      SELECT 1
      FROM user_badges ub
      WHERE ub.id = p_id
        AND ub.badge_id = b.id
    )
  LOOP
    IF v_badge.criteria_type = 'report_count' THEN
      IF v_stats.total_reports >= v_badge.criteria_value THEN
        INSERT INTO user_badges (id, badge_id)
        VALUES (p_id, v_badge.id)
        ON CONFLICT (id, badge_id) DO NOTHING;

        v_new_badge_ids := array_append(v_new_badge_ids, v_badge.id);
      END IF;

    ELSIF v_badge.criteria_type = 'upvote_count' THEN
      IF v_stats.total_upvotes_received >= v_badge.criteria_value THEN
        INSERT INTO user_badges (id, badge_id)
        VALUES (p_id, v_badge.id)
        ON CONFLICT (id, badge_id) DO NOTHING;

        v_new_badge_ids := array_append(v_new_badge_ids, v_badge.id);
      END IF;

    ELSIF v_badge.criteria_type = 'resolution_rate' THEN
      -- Require at least 5 reports before considering resolution badges
      IF v_stats.total_reports >= 5 AND v_resolution_rate >= v_badge.criteria_value THEN
        INSERT INTO user_badges (id, badge_id)
        VALUES (p_id, v_badge.id)
        ON CONFLICT (id, badge_id) DO NOTHING;

        v_new_badge_ids := array_append(v_new_badge_ids, v_badge.id);
      END IF;

    ELSIF v_badge.criteria_type = 'streak_days' THEN
      IF v_stats.current_streak_days >= v_badge.criteria_value THEN
        INSERT INTO user_badges (id, badge_id)
        VALUES (p_id, v_badge.id)
        ON CONFLICT (id, badge_id) DO NOTHING;

        v_new_badge_ids := array_append(v_new_badge_ids, v_badge.id);
      END IF;
    END IF;
  END LOOP;

  RETURN v_new_badge_ids;
END;
$$ LANGUAGE plpgsql;

-- 8) Seed initial badges (idempotent)
INSERT INTO badges (name, description, icon_name, tier, criteria_type, criteria_value)
VALUES
  -- Report count milestones
  ('First Step', 'Submitted your first civic report.', 'walk-outline', 'bronze', 'report_count', 1),
  ('Getting Started', 'Submitted 5 civic reports.', 'flag-outline', 'bronze', 'report_count', 5),
  ('Street Hero', 'Submitted 10 civic reports.', 'car-sport-outline', 'silver', 'report_count', 10),
  ('Civic Champion', 'Submitted 50 civic reports.', 'ribbon-outline', 'gold', 'report_count', 50),
  ('Community Legend', 'Submitted 100 civic reports.', 'trophy-outline', 'platinum', 'report_count', 100),
  -- Upvotes / popularity
  ('Popular Voice', 'Received 50 upvotes across all your reports.', 'megaphone-outline', 'silver', 'upvote_count', 50),
  -- Resolution rate
  ('Trusted Reporter', 'Achieved an 80% resolution rate on your reports (with at least 5 reports).', 'shield-checkmark-outline', 'gold', 'resolution_rate', 80),
  -- Streak achievements
  ('First Week', 'Reported issues on 3 different days in a row.', 'calendar-outline', 'bronze', 'streak_days', 3),
  ('Consistent Contributor', 'Maintained a 7-day daily reporting streak.', 'flame-outline', 'silver', 'streak_days', 7),
  ('Monthly Champion', 'Maintained a 30-day daily reporting streak.', 'flame', 'platinum', 'streak_days', 30)
ON CONFLICT (name) DO NOTHING;

