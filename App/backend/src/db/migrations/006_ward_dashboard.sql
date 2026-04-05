-- Sprint 6 Migration: Ward Dashboard Support
-- Run against: civic_voice database

-- 1) Add ward_id to users (NULL = municipality/citizen user)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ward_id INTEGER REFERENCES wards(ward_id);
CREATE INDEX IF NOT EXISTS idx_users_ward ON users(ward_id);

-- 2) Ward Kanban columns (visual mapping to existing reports.status)
CREATE TABLE IF NOT EXISTS ward_kanban_columns (
  id SERIAL PRIMARY KEY,
  ward_id INTEGER NOT NULL REFERENCES wards(ward_id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  mapped_status VARCHAR(20) NOT NULL
    CHECK (mapped_status IN ('submitted','under_review','in_progress','resolved','closed')),
  position INT NOT NULL DEFAULT 0,
  color VARCHAR(20) NOT NULL DEFAULT '#6b7280',
  deadline_days INT,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ward_kanban_ward ON ward_kanban_columns(ward_id, position);

-- 3) Forward/return/escalation tracking on reports
ALTER TABLE reports ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS forwarded_at TIMESTAMP;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS forward_reason TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS forwarded_by UUID;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS returned_at TIMESTAMP;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS return_reason TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP;

-- 4) Status history table
CREATE TABLE IF NOT EXISTS status_history (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
  old_status VARCHAR(20),
  new_status VARCHAR(20) NOT NULL,
  changed_by UUID,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_status_history_report ON status_history(report_id, created_at DESC);

-- 5) Seed default kanban columns for existing wards
INSERT INTO ward_kanban_columns (ward_id, name, mapped_status, position, color, deadline_days, is_terminal)
SELECT
  w.ward_id,
  col.name,
  col.mapped_status,
  col.position,
  col.color,
  col.deadline_days,
  col.is_terminal
FROM wards w
CROSS JOIN (VALUES
  ('Todo',        'submitted',    0, '#6b7280', 2,    FALSE),
  ('In Progress', 'in_progress',  1, '#f59e0b', 7,    FALSE),
  ('Completed',   'resolved',     2, '#22c55e', NULL,  TRUE),
  ('Invalid',     'closed',       3, '#ef4444', NULL,  TRUE)
) AS col(name, mapped_status, position, color, deadline_days, is_terminal)
ON CONFLICT DO NOTHING;
