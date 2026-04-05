-- Fix gamification functions for UUID user/badge IDs
-- Tables (user_stats, user_badges, badges) already exist from Prisma with UUID types.
-- This only creates the PL/pgSQL functions and trigger.

DROP TRIGGER IF EXISTS trg_sync_user_stats ON reports;
DROP FUNCTION IF EXISTS sync_user_stats_from_reports() CASCADE;
DROP FUNCTION IF EXISTS check_and_award_badges(UUID) CASCADE;
DROP FUNCTION IF EXISTS check_and_award_badges(INTEGER) CASCADE;
DROP FUNCTION IF EXISTS refresh_user_stats(UUID) CASCADE;
DROP FUNCTION IF EXISTS refresh_user_stats(INTEGER) CASCADE;

DROP INDEX IF EXISTS idx_reports_user_created_at;
DROP INDEX IF EXISTS idx_reports_user_status;
CREATE INDEX IF NOT EXISTS idx_reports_user_created_at ON reports(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_user_status ON reports(user_id, status);

CREATE OR REPLACE FUNCTION refresh_user_stats(p_user_id UUID)
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
  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE status = 'completed')::INTEGER,
    COALESCE(SUM(upvote_count), 0)::INTEGER,
    MAX(created_at)::DATE
  INTO v_total_reports, v_resolved_reports, v_total_upvotes, v_last_date
  FROM reports WHERE user_id = p_user_id;

  IF v_total_reports IS NULL THEN
    v_total_reports := 0; v_resolved_reports := 0; v_total_upvotes := 0; v_last_date := NULL;
  END IF;

  IF v_last_date IS NULL THEN v_current_streak := 0;
  ELSE
    WITH days AS (SELECT DISTINCT created_at::DATE AS d FROM reports WHERE user_id = p_user_id),
    ordered AS (SELECT d, ROW_NUMBER() OVER (ORDER BY d DESC) AS rn FROM days),
    grouped AS (SELECT d FROM ordered WHERE (SELECT MAX(d) FROM days) - d = rn - 1)
    SELECT COUNT(*)::INTEGER INTO v_current_streak FROM grouped;
  END IF;

  IF v_last_date IS NULL THEN v_longest_streak := 0;
  ELSE
    WITH days AS (SELECT DISTINCT created_at::DATE AS d FROM reports WHERE user_id = p_user_id),
    ordered AS (SELECT d, ROW_NUMBER() OVER (ORDER BY d) AS rn FROM days),
    groups AS (SELECT (d - (rn || ' day')::INTERVAL)::DATE AS grp_key, COUNT(*) AS cnt FROM ordered GROUP BY (d - (rn || ' day')::INTERVAL)::DATE)
    SELECT COALESCE(MAX(cnt), 0)::INTEGER INTO v_longest_streak FROM groups;
  END IF;

  v_stats.impact_score := (v_resolved_reports * 10) + (v_total_upvotes * 2);

  INSERT INTO user_stats (user_id, total_reports, resolved_reports, total_upvotes_received, current_streak_days, longest_streak_days, last_report_date, impact_score, updated_at)
  VALUES (p_user_id, v_total_reports, v_resolved_reports, v_total_upvotes, COALESCE(v_current_streak,0), COALESCE(GREATEST(v_longest_streak, COALESCE(v_current_streak,0)),0), v_last_date, v_stats.impact_score, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    total_reports = EXCLUDED.total_reports, resolved_reports = EXCLUDED.resolved_reports,
    total_upvotes_received = EXCLUDED.total_upvotes_received, current_streak_days = EXCLUDED.current_streak_days,
    longest_streak_days = EXCLUDED.longest_streak_days, last_report_date = EXCLUDED.last_report_date,
    impact_score = EXCLUDED.impact_score, updated_at = EXCLUDED.updated_at
  RETURNING * INTO v_stats;
  RETURN v_stats;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_user_stats_from_reports()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NOT NULL THEN PERFORM refresh_user_stats(NEW.user_id); END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      IF OLD.user_id IS NOT NULL THEN PERFORM refresh_user_stats(OLD.user_id); END IF;
      IF NEW.user_id IS NOT NULL THEN PERFORM refresh_user_stats(NEW.user_id); END IF;
    ELSE
      IF NEW.user_id IS NOT NULL THEN PERFORM refresh_user_stats(NEW.user_id); END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.user_id IS NOT NULL THEN PERFORM refresh_user_stats(OLD.user_id); END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_user_stats
AFTER INSERT OR UPDATE OF status, user_id, upvote_count OR DELETE ON reports
FOR EACH ROW EXECUTE FUNCTION sync_user_stats_from_reports();

CREATE OR REPLACE FUNCTION check_and_award_badges(p_user_id UUID)
RETURNS UUID[] AS $$
DECLARE
  v_stats user_stats; v_badge RECORD; v_new_badge_ids UUID[] := '{}'; v_resolution_rate NUMERIC := 0;
BEGIN
  v_stats := refresh_user_stats(p_user_id);
  IF v_stats.total_reports > 0 THEN
    v_resolution_rate := (v_stats.resolved_reports::NUMERIC * 100.0) / v_stats.total_reports::NUMERIC;
  END IF;

  FOR v_badge IN SELECT b.* FROM badges b WHERE NOT EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p_user_id AND ub.badge_id = b.id)
  LOOP
    IF (v_badge.criteria_type = 'report_count' AND v_stats.total_reports >= v_badge.criteria_value)
    OR (v_badge.criteria_type = 'upvote_count' AND v_stats.total_upvotes_received >= v_badge.criteria_value)
    OR (v_badge.criteria_type = 'resolution_rate' AND v_stats.total_reports >= 5 AND v_resolution_rate >= v_badge.criteria_value)
    OR (v_badge.criteria_type = 'streak_days' AND v_stats.current_streak_days >= v_badge.criteria_value)
    THEN
      INSERT INTO user_badges (user_id, badge_id) VALUES (p_user_id, v_badge.id) ON CONFLICT (user_id, badge_id) DO NOTHING;
      v_new_badge_ids := array_append(v_new_badge_ids, v_badge.id);
    END IF;
  END LOOP;
  RETURN v_new_badge_ids;
END;
$$ LANGUAGE plpgsql;
