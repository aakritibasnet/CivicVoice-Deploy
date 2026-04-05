CREATE OR REPLACE FUNCTION update_upvote_count()
RETURNS TRIGGER AS $$
DECLARE
  target_report_id UUID;
BEGIN
  target_report_id := COALESCE(NEW.report_id, OLD.report_id);

  UPDATE reports
  SET upvote_count = (
    SELECT COUNT(*)::int
    FROM upvotes
    WHERE report_id = target_report_id
  )
  WHERE id = target_report_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS upvote_count_trigger ON upvotes;

CREATE TRIGGER upvote_count_trigger
AFTER INSERT OR DELETE ON upvotes
FOR EACH ROW
EXECUTE FUNCTION update_upvote_count();

UPDATE reports r
SET upvote_count = (
  SELECT COUNT(*)::int
  FROM upvotes uv
  WHERE uv.report_id = r.id
);
