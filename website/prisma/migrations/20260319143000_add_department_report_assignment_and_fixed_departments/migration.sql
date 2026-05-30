ALTER TABLE "reports"
ADD COLUMN "assigned_department_id" UUID,
ADD COLUMN "assigned_field_officer_id" UUID;

UPDATE "officer_departments"
SET
  "slug" = 'roads_and_infrastructure',
  "name" = 'Roads and Infrastructure',
  "description" = 'Road repairs, drainage structures, footpaths, bridges, and other civic infrastructure work.',
  "updated_at" = NOW()
WHERE "slug" = 'road';

UPDATE "officer_departments"
SET
  "slug" = 'sanitation_and_waste_management',
  "name" = 'Sanitation and Waste Management',
  "description" = 'Waste collection, illegal dumping, public cleanliness, and sanitation response.',
  "updated_at" = NOW()
WHERE "slug" = 'sewage';

UPDATE "officer_departments"
SET
  "slug" = 'public_utilities_water_and_power',
  "name" = 'Public Utilities Water and Power',
  "description" = 'Water supply, leaks, public taps, street power issues, and utility interruptions.',
  "updated_at" = NOW()
WHERE "slug" = 'water';

UPDATE "officer_departments"
SET
  "slug" = 'traffic_and_transport',
  "name" = 'Traffic and Transport',
  "description" = 'Traffic flow, transport support, signage, signals, and mobility-related issues.',
  "updated_at" = NOW()
WHERE "slug" = 'traffic';

INSERT INTO "officer_departments" ("slug", "name", "description")
VALUES (
  'environment_and_parks',
  'Environment and Parks',
  'Parks, greenery, public open spaces, tree maintenance, and environmental upkeep.'
)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "updated_at" = NOW();

CREATE INDEX "idx_reports_assigned_department"
ON "reports"("assigned_department_id");

CREATE INDEX "idx_reports_assigned_field_officer"
ON "reports"("assigned_field_officer_id");

ALTER TABLE "reports"
ADD CONSTRAINT "reports_assigned_department_id_fkey"
FOREIGN KEY ("assigned_department_id") REFERENCES "officer_departments"("id")
ON DELETE SET NULL
ON UPDATE NO ACTION;

ALTER TABLE "reports"
ADD CONSTRAINT "reports_assigned_field_officer_id_fkey"
FOREIGN KEY ("assigned_field_officer_id") REFERENCES "officers"("id")
ON DELETE SET NULL
ON UPDATE NO ACTION;
