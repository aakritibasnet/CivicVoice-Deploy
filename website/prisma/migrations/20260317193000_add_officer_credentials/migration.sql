-- AlterTable
ALTER TABLE "officers"
ADD COLUMN "email" VARCHAR(255),
ADD COLUMN "password_hash" VARCHAR(255),
ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "password_changed_at" TIMESTAMPTZ(6);

-- Normalize active duplicate officer names before enforcing uniqueness
DO $$
DECLARE
  current_officer RECORD;
  next_suffix INTEGER;
  candidate_last_name TEXT;
BEGIN
  FOR current_officer IN
    SELECT "id", "first_name", "last_name", "created_at"
    FROM "officers"
    WHERE "deleted_at" IS NULL
    ORDER BY LOWER("first_name"), LOWER("last_name"), "created_at", "id"
  LOOP
    IF EXISTS (
      SELECT 1
      FROM "officers" AS existing
      WHERE existing."deleted_at" IS NULL
        AND existing."id" <> current_officer."id"
        AND LOWER(existing."first_name") = LOWER(current_officer."first_name")
        AND LOWER(existing."last_name") = LOWER(current_officer."last_name")
        AND (
          existing."created_at" < current_officer."created_at"
          OR (
            existing."created_at" = current_officer."created_at"
            AND existing."id" < current_officer."id"
          )
        )
    ) THEN
      next_suffix := 1;

      LOOP
        candidate_last_name := current_officer."last_name" || next_suffix::TEXT;

        EXIT WHEN NOT EXISTS (
          SELECT 1
          FROM "officers" AS conflict
          WHERE conflict."deleted_at" IS NULL
            AND conflict."id" <> current_officer."id"
            AND LOWER(conflict."first_name") = LOWER(current_officer."first_name")
            AND LOWER(conflict."last_name") = LOWER(candidate_last_name)
        );

        next_suffix := next_suffix + 1;
      END LOOP;

      UPDATE "officers"
      SET
        "last_name" = candidate_last_name,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = current_officer."id";
    END IF;
  END LOOP;
END
$$;

-- CreateIndex
CREATE UNIQUE INDEX "officers_email_key" ON "officers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "idx_officers_active_name_unique"
ON "officers"(LOWER("first_name"), LOWER("last_name"))
WHERE "deleted_at" IS NULL;
