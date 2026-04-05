-- 011: Officer Mobile App – Tasks, Proof, Activity, Notifications
-- Supports: officer task management, proof uploads, activity timeline, officer notifications

-- 0) Prerequisite: Ensure departments table exists (from migration 010)
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

-- 0b) Prerequisite: Ensure officer_departments table exists (from migration 010)
CREATE TABLE IF NOT EXISTS officer_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(officer_id)
);
CREATE INDEX IF NOT EXISTS idx_officer_departments_dept ON officer_departments(department_id);
CREATE INDEX IF NOT EXISTS idx_officer_departments_officer ON officer_departments(officer_id);

-- 1) Add officer-specific columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS municipality_id INTEGER;

-- 2) Officer Tasks table (decoupled from reports, linked via linked_report_id)
CREATE TABLE IF NOT EXISTS officer_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(300) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  location_text TEXT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  ward_id INTEGER REFERENCES wards(ward_id),
  municipality_id INTEGER,
  department_id UUID REFERENCES departments(id),
  assigned_officer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'in_progress', 'completed')),
  priority VARCHAR(10) NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  linked_report_id INTEGER REFERENCES reports(report_id),
  escalated_from INTEGER,
  escalated_to INTEGER,
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_officer_tasks_officer ON officer_tasks(assigned_officer_id, status);
CREATE INDEX IF NOT EXISTS idx_officer_tasks_ward ON officer_tasks(ward_id);
CREATE INDEX IF NOT EXISTS idx_officer_tasks_status ON officer_tasks(status);
CREATE INDEX IF NOT EXISTS idx_officer_tasks_report ON officer_tasks(linked_report_id);
CREATE INDEX IF NOT EXISTS idx_officer_tasks_priority ON officer_tasks(priority);

-- 3) Task Proof table (images/notes uploaded by officers)
CREATE TABLE IF NOT EXISTS task_proof (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES officer_tasks(id) ON DELETE CASCADE,
  officer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL DEFAULT 'completion'
    CHECK (type IN ('progress', 'completion')),
  image_url TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_proof_task ON task_proof(task_id);
CREATE INDEX IF NOT EXISTS idx_task_proof_officer ON task_proof(officer_id);

-- 4) Task Activity timeline (status changes, comments, actions)
CREATE TABLE IF NOT EXISTS task_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES officer_tasks(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES users(id),
  actor_role VARCHAR(30) NOT NULL,
  action VARCHAR(50) NOT NULL,
  from_status VARCHAR(20),
  to_status VARCHAR(20),
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_activity_task ON task_activity(task_id, created_at DESC);

-- 5) Task Comments table (separate from report comments)
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES officer_tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  author_role VARCHAR(30) NOT NULL,
  public_tag VARCHAR(100),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id, created_at);

-- 6) Officer Notifications table
CREATE TABLE IF NOT EXISTS officer_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(300) NOT NULL,
  body TEXT,
  related_task_id UUID REFERENCES officer_tasks(id) ON DELETE SET NULL,
  related_report_id INTEGER REFERENCES reports(report_id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_officer_notif_recipient ON officer_notifications(recipient_id, is_read, created_at DESC);

-- 7) Updated timestamp trigger for officer_tasks
CREATE OR REPLACE FUNCTION update_officer_task_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_officer_task_updated ON officer_tasks;
CREATE TRIGGER trg_officer_task_updated
BEFORE UPDATE ON officer_tasks
FOR EACH ROW EXECUTE FUNCTION update_officer_task_timestamp();
