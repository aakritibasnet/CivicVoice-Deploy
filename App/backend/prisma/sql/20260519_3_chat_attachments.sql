-- Chat module — Sprint 6: secured attachments.
-- storage_key/thumbnail_key are Cloudinary public_ids of privately-uploaded
-- (type=authenticated) assets — never public URLs. Delivery is always via
-- the authz'd backend proxy GET /api/chat/attachments/:id. Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_scan_status') THEN
    CREATE TYPE chat_scan_status AS ENUM ('pending', 'clean', 'infected');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "message_attachments" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "message_id"       UUID NOT NULL,
  "file_name"        VARCHAR(255) NOT NULL,
  "mime_type"        VARCHAR(127) NOT NULL,
  "size_bytes"       BIGINT NOT NULL,
  "storage_key"      VARCHAR(512) NOT NULL,
  "thumbnail_key"    VARCHAR(512),
  "resource_type"    VARCHAR(16) NOT NULL DEFAULT 'image',
  "scan_status"      chat_scan_status NOT NULL DEFAULT 'pending',
  "uploaded_by_kind" VARCHAR(8) NOT NULL,
  "uploaded_by_id"   UUID NOT NULL,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "message_attachments_uploaded_by_kind_check"
    CHECK ("uploaded_by_kind" IN ('user', 'officer')),
  CONSTRAINT "message_attachments_resource_type_check"
    CHECK ("resource_type" IN ('image', 'video', 'raw')),
  CONSTRAINT "message_attachments_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_message_attachments_message"
  ON "message_attachments"("message_id");
