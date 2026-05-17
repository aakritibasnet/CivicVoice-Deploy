-- Ward report publishing: published reports + auto-publish schedule.
-- Backs src/services/ward/publish.service.ts (ensureWardPublishingSchema()).
-- Types match prisma/schema.prisma: wards.id is UUID, users.id is UUID.
-- published_by has no FK: the publisher may be a row in users OR officers,
-- so the display name is resolved at read time (see publish.service.ts).

CREATE TABLE IF NOT EXISTS "ward_published_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ward_id" UUID NOT NULL,
    "published_by" UUID,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cycle_start" TIMESTAMPTZ(6) NOT NULL,
    "cycle_end" TIMESTAMPTZ(6) NOT NULL,
    "is_auto_published" BOOLEAN NOT NULL DEFAULT FALSE,
    "report_snapshot" JSONB NOT NULL,
    "previous_snapshot" JSONB,
    "summary_text" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ward_published_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ward_published_reports_ward_id_fkey"
      FOREIGN KEY ("ward_id") REFERENCES "wards"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_ward_published_ward"
  ON "ward_published_reports"("ward_id", "published_at" DESC);

CREATE TABLE IF NOT EXISTS "ward_publish_schedule" (
    "ward_id" UUID NOT NULL,
    "last_published_at" TIMESTAMPTZ(6),
    "next_auto_publish_at" TIMESTAMPTZ(6),
    "cycle_days" INTEGER NOT NULL DEFAULT 7,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ward_publish_schedule_pkey" PRIMARY KEY ("ward_id"),
    CONSTRAINT "ward_publish_schedule_ward_id_fkey"
      FOREIGN KEY ("ward_id") REFERENCES "wards"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
);
