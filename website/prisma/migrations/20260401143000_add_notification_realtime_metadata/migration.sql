ALTER TABLE "notifications"
ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION notify_notification_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payload json;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    payload := json_build_object(
      'action', 'deleted',
      'notification', json_build_object(
        'id', OLD.id,
        'user_id', OLD.user_id,
        'report_id', OLD.report_id,
        'title', OLD.title,
        'message', OLD.message,
        'type', OLD.type,
        'link', OLD.link,
        'metadata', COALESCE(OLD.metadata, '{}'::jsonb),
        'is_read', OLD.is_read,
        'created_at', OLD.created_at
      )
    );
  ELSE
    payload := json_build_object(
      'action', CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END,
      'notification', json_build_object(
        'id', NEW.id,
        'user_id', NEW.user_id,
        'report_id', NEW.report_id,
        'title', NEW.title,
        'message', NEW.message,
        'type', NEW.type,
        'link', NEW.link,
        'metadata', COALESCE(NEW.metadata, '{}'::jsonb),
        'is_read', NEW.is_read,
        'created_at', NEW.created_at
      )
    );
  END IF;

  PERFORM pg_notify('notification_events', payload::text);

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_notification_event ON "notifications";

CREATE TRIGGER trg_notify_notification_event
AFTER INSERT OR UPDATE OR DELETE ON "notifications"
FOR EACH ROW
EXECUTE FUNCTION notify_notification_event();
