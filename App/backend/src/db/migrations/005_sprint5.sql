-- Sprint 5 Migration: Ward Boundary Detection (PostGIS)
-- Run against: civic_voice database
-- PREREQUISITE: PostGIS extension must be installed on the server

-- 1) Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2) Wards master table with polygon boundary
CREATE TABLE IF NOT EXISTS wards (
  ward_id SERIAL PRIMARY KEY,
  ward_name TEXT NOT NULL UNIQUE,
  boundary GEOMETRY(Polygon, 4326) NOT NULL,
  population INTEGER,
  area_sq_km NUMERIC(10,2),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- 3) Spatial index for fast point-in-polygon queries
CREATE INDEX IF NOT EXISTS idx_wards_boundary ON wards USING GIST(boundary);

-- 4) Add ward_id column to reports (nullable – existing rows will be NULL)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS ward_id INTEGER REFERENCES wards(ward_id);
CREATE INDEX IF NOT EXISTS idx_reports_ward ON reports(ward_id);

-- ============================================================
-- VERIFICATION QUERIES (run these AFTER the migration to test)
-- ============================================================

-- Insert a test ward polygon (small rectangle in Kathmandu)
-- INSERT INTO wards (ward_name, boundary)
-- VALUES ('Ward 1', ST_GeomFromText(
--   'POLYGON((85.30 27.70, 85.35 27.70, 85.35 27.75, 85.30 27.75, 85.30 27.70))', 4326
-- ));

-- Test point-in-polygon (should return Ward 1)
-- SELECT ward_id, ward_name
-- FROM wards
-- WHERE ST_Contains(boundary, ST_SetSRID(ST_Point(85.32, 27.72), 4326));

-- Test point OUTSIDE all wards (should return 0 rows)
-- SELECT ward_id, ward_name
-- FROM wards
-- WHERE ST_Contains(boundary, ST_SetSRID(ST_Point(84.00, 26.00), 4326));
