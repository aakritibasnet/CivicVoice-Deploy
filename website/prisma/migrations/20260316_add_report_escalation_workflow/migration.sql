CREATE TYPE "assignment_level" AS ENUM ('ward', 'municipality');

ALTER TABLE "reports"
ADD COLUMN "assigned_level" "assignment_level" NOT NULL DEFAULT 'ward',
ADD COLUMN "escalated_to_municipality" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "escalated_at" TIMESTAMPTZ(6),
ADD COLUMN "returned_to_ward_at" TIMESTAMPTZ(6);

UPDATE "reports"
SET
  "escalated_to_municipality" = true,
  "escalated_at" = COALESCE("pathway_timestamp", "updated_at", "created_at"),
  "assigned_level" = CASE
    WHEN "status" = 'returned' THEN 'ward'::"assignment_level"
    ELSE 'municipality'::"assignment_level"
  END,
  "returned_to_ward_at" = CASE
    WHEN "status" = 'returned'
      THEN COALESCE("updated_at", "pathway_timestamp", "created_at")
    ELSE NULL
  END
WHERE "pathway_type" = 'escalated';

CREATE INDEX "idx_reports_assigned_level" ON "reports"("assigned_level");
CREATE INDEX "idx_reports_escalated_to_municipality" ON "reports"("escalated_to_municipality");

DELETE FROM "kanban_columns" WHERE "is_default" = true;

INSERT INTO "kanban_columns" (
  "name",
  "position",
  "color",
  "deadline_days",
  "is_terminal",
  "mapped_status",
  "is_default",
  "role_access"
) VALUES
  ('Incoming', 0, '#3b82f6', 3, false, 'incoming', true, ARRAY['ward']::"user_role"[]),
  ('In Progress', 1, '#f59e0b', 7, false, 'in_progress', true, ARRAY['ward']::"user_role"[]),
  ('Completed', 2, '#10b981', NULL, true, 'completed', true, ARRAY['ward']::"user_role"[]),
  ('Invalid', 3, '#ef4444', NULL, true, 'invalid', true, ARRAY['ward']::"user_role"[]),
  ('Escalated', 0, '#2563eb', 2, false, 'incoming', true, ARRAY['municipality']::"user_role"[]),
  ('In Progress', 1, '#d97706', 10, false, 'in_progress', true, ARRAY['municipality']::"user_role"[]),
  ('Completed', 2, '#059669', NULL, true, 'completed', true, ARRAY['municipality']::"user_role"[]),
  ('Invalid', 3, '#dc2626', NULL, true, 'invalid', true, ARRAY['municipality']::"user_role"[]),
  ('Returned', 4, '#ea580c', NULL, false, 'returned', true, ARRAY['municipality']::"user_role"[]),
  ('Incoming', 0, '#475569', 2, false, 'incoming', true, ARRAY['admin']::"user_role"[]),
  ('In Progress', 1, '#f59e0b', 7, false, 'in_progress', true, ARRAY['admin']::"user_role"[]),
  ('Completed', 2, '#10b981', NULL, true, 'completed', true, ARRAY['admin']::"user_role"[]),
  ('Invalid', 3, '#ef4444', NULL, true, 'invalid', true, ARRAY['admin']::"user_role"[]),
  ('Returned', 4, '#f97316', NULL, false, 'returned', true, ARRAY['admin']::"user_role"[]);
