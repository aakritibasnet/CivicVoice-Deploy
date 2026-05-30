ALTER TABLE "reports"
ADD COLUMN "municipality_seen_at" TIMESTAMPTZ(6);

UPDATE "reports"
SET "municipality_seen_at" = COALESCE("municipality_received_at", "updated_at")
WHERE "assigned_level" = 'municipality'
  AND "status" <> 'incoming'
  AND "municipality_seen_at" IS NULL;

CREATE INDEX "idx_reports_municipality_seen" ON "reports"("municipality_seen_at");
