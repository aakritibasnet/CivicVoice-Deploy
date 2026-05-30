CREATE TABLE "ward_happiness_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_key" VARCHAR(255) NOT NULL,
  "ward_id" UUID NOT NULL,
  "report_id" UUID,
  "event_type" VARCHAR(80) NOT NULL,
  "penalty_points" INTEGER NOT NULL DEFAULT 0,
  "details" JSONB DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "ward_happiness_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ward_happiness_events_event_key_key" UNIQUE ("event_key"),
  CONSTRAINT "ward_happiness_events_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "reports"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "ward_happiness_events_ward_id_fkey"
    FOREIGN KEY ("ward_id") REFERENCES "wards"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

ALTER TABLE "reports"
  ADD COLUMN "incoming_seen_at" TIMESTAMPTZ(6),
  ADD COLUMN "incoming_ack_deadline_at" TIMESTAMPTZ(6),
  ADD COLUMN "ward_active_started_at" TIMESTAMPTZ(6),
  ADD COLUMN "ward_deadline_reason" TEXT,
  ADD COLUMN "escalation_type" VARCHAR(80),
  ADD COLUMN "escalation_source" VARCHAR(80);

UPDATE "reports"
SET
  "incoming_seen_at" = COALESCE("ward_received_at", "created_at"),
  "incoming_ack_deadline_at" = COALESCE("ward_received_at", "created_at") + INTERVAL '24 hours',
  "ward_active_started_at" = CASE
    WHEN "assigned_level" = 'ward'::"assignment_level"
      AND "status" IN ('in_progress', 'completed', 'invalid')
      THEN COALESCE("updated_at", "created_at")
    WHEN "assigned_level" = 'ward'::"assignment_level"
      AND "returned_to_ward_at" IS NOT NULL
      THEN COALESCE("returned_to_ward_at", "updated_at", "created_at")
    ELSE NULL
  END,
  "escalation_type" = CASE
    WHEN "escalated_to_municipality" = TRUE THEN 'manual'
    ELSE NULL
  END,
  "escalation_source" = CASE
    WHEN "escalated_to_municipality" = TRUE THEN 'ward'
    ELSE NULL
  END;

CREATE INDEX "idx_reports_incoming_ack_deadline" ON "reports"("incoming_ack_deadline_at");
CREATE INDEX "idx_reports_incoming_seen" ON "reports"("incoming_seen_at");
CREATE INDEX "idx_reports_municipality_deadline" ON "reports"("municipality_deadline_at");
CREATE INDEX "idx_ward_happiness_events_type" ON "ward_happiness_events"("event_type");
CREATE INDEX "idx_ward_happiness_events_report" ON "ward_happiness_events"("report_id");
CREATE INDEX "idx_ward_happiness_events_ward_created"
  ON "ward_happiness_events"("ward_id", "created_at" DESC);
