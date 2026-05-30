INSERT INTO "officer_departments" ("slug", "name", "description")
VALUES
  ('roads_and_infrastructure', 'Roads and Infrastructure', 'Road repairs, drainage structures, footpaths, bridges, and other civic infrastructure work.'),
  ('sanitation_and_waste_management', 'Sanitation and Waste Management', 'Waste collection, illegal dumping, public cleanliness, and sanitation response.'),
  ('public_utilities_water_and_power', 'Public Utilities Water and Power', 'Water supply, leaks, public taps, street power issues, and utility interruptions.'),
  ('environment_and_parks', 'Environment and Parks', 'Parks, greenery, public open spaces, tree maintenance, and environmental upkeep.'),
  ('traffic_and_transport', 'Traffic and Transport', 'Traffic flow, transport support, signage, signals, and mobility-related issues.')
ON CONFLICT ("slug") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "updated_at" = CURRENT_TIMESTAMP;
