-- 012: Add "invalid" task status and "invalidation" proof type
-- Supports: officers marking tasks as invalid with required proof

-- 1) Expand officer_tasks.status CHECK to include 'invalid'
ALTER TABLE officer_tasks DROP CONSTRAINT IF EXISTS officer_tasks_status_check;
ALTER TABLE officer_tasks ADD CONSTRAINT officer_tasks_status_check
  CHECK (status IN ('todo', 'in_progress', 'completed', 'invalid'));

-- 2) Expand task_proof.type CHECK to include 'invalidation'
ALTER TABLE task_proof DROP CONSTRAINT IF EXISTS task_proof_type_check;
ALTER TABLE task_proof ADD CONSTRAINT task_proof_type_check
  CHECK (type IN ('progress', 'completion', 'invalidation'));

-- 3) Add invalidated_at timestamp column
ALTER TABLE officer_tasks ADD COLUMN IF NOT EXISTS invalidated_at TIMESTAMP;
