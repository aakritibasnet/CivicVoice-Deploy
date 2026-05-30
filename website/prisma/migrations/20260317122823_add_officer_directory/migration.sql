-- CreateEnum
CREATE TYPE "officer_type" AS ENUM ('ward_officer', 'municipality_officer');

-- CreateTable
CREATE TABLE "officer_departments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "officer_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "officers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "first_name" VARCHAR(255) NOT NULL,
    "last_name" VARCHAR(255) NOT NULL,
    "phone_number" VARCHAR(50),
    "profile_image_url" VARCHAR(2048),
    "type" "officer_type" NOT NULL,
    "ward_id" UUID,
    "department_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "officers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "officer_departments_slug_key" ON "officer_departments"("slug");

-- Seed default officer departments
INSERT INTO "officer_departments" ("slug", "name", "description")
VALUES
  ('sewage', 'Sewage', 'Drainage, sewer overflow, and underground line issues.'),
  ('road', 'Road', 'Potholes, resurfacing, and street repair work.'),
  ('traffic', 'Traffic', 'Signals, signage, congestion support, and road safety.'),
  ('water', 'Water Supply', 'Distribution, leaks, outages, and public tap access.')
ON CONFLICT ("slug") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "updated_at" = CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "idx_officers_deleted_at" ON "officers"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_officers_department" ON "officers"("department_id");

-- CreateIndex
CREATE INDEX "idx_officers_type" ON "officers"("type");

-- CreateIndex
CREATE INDEX "idx_officers_ward" ON "officers"("ward_id");

-- AddForeignKey
ALTER TABLE "officers" ADD CONSTRAINT "officers_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "officer_departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "officers" ADD CONSTRAINT "officers_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "wards"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
