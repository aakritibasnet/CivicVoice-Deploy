-- 010: Departments, Officer assignments, and Ward Report Publishing
-- Supports: ward organization model, department hierarchy, report publishing cycle

-- 1) Departments table (belongs to a ward)
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id INTEGER NOT NULL REFERENCES wards(ward_id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(ward_id, name)
);
CREATE INDEX IF NOT EXISTS idx_departments_ward ON departments(ward_id);

-- 2) Officer-department assignments (each officer belongs to one department)
CREATE TABLE IF NOT EXISTS officer_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(officer_id)
);
CREATE INDEX IF NOT EXISTS idx_officer_departments_dept ON officer_departments(department_id);
CREATE INDEX IF NOT EXISTS idx_officer_departments_officer ON officer_departments(officer_id);

-- 3) Ward published reports (7-day reporting cycle)
CREATE TABLE IF NOT EXISTS ward_published_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id INTEGER NOT NULL REFERENCES wards(ward_id) ON DELETE CASCADE,
  published_by UUID REFERENCES users(id),
  published_at TIMESTAMP NOT NULL DEFAULT NOW(),
  cycle_start TIMESTAMP NOT NULL,
  cycle_end TIMESTAMP NOT NULL,
  is_auto_published BOOLEAN NOT NULL DEFAULT FALSE,
  report_snapshot JSONB NOT NULL,       -- snapshot of task states at publish time
  previous_snapshot JSONB,              -- snapshot from previous report (for diff)
  summary_text TEXT,                    -- human-readable summary
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ward_published_ward ON ward_published_reports(ward_id, published_at DESC);

-- 4) Ward auto-publish tracking
CREATE TABLE IF NOT EXISTS ward_publish_schedule (
  ward_id INTEGER PRIMARY KEY REFERENCES wards(ward_id) ON DELETE CASCADE,
  last_published_at TIMESTAMP,
  next_auto_publish_at TIMESTAMP,
  cycle_days INTEGER NOT NULL DEFAULT 7,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 5) Add is_ward_account flag to users for organizational accounts
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_ward_account BOOLEAN NOT NULL DEFAULT FALSE;

-- 6) Add department_id reference to reports for assignment tracking
ALTER TABLE reports ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);

-- 7) Seed default departments for existing wards
INSERT INTO departments (ward_id, name, description)
SELECT
  w.ward_id,
  dept.name,
  dept.description
FROM wards w
CROSS JOIN (VALUES
  ('Infrastructure', 'Roads, bridges, drainage, and public structures'),
  ('Sanitation', 'Waste management, cleanliness, and public hygiene'),
  ('Water Supply', 'Drinking water, pipelines, and water quality'),
  ('Electricity', 'Street lights, power lines, and electrical infrastructure'),
  ('Public Safety', 'Safety hazards, security concerns, and emergency issues'),
  ('Environment', 'Parks, green areas, pollution, and environmental concerns'),
  ('Education', 'Schools, libraries, and educational facilities'),
  ('Health', 'Health posts, clinics, and public health concerns'),
  ('Administration', 'General administrative and governance matters')
) AS dept(name, description)
WHERE w.is_active = true
ON CONFLICT (ward_id, name) DO NOTHING;

-- 8) Initialize publish schedule for existing wards
INSERT INTO ward_publish_schedule (ward_id, next_auto_publish_at, cycle_days)
SELECT ward_id, NOW() + INTERVAL '7 days', 7
FROM wards
WHERE is_active = true
ON CONFLICT (ward_id) DO NOTHING;
