-- Rollback for prisma/sql/20260519_chat_audit_log.sql (Sprint 5).
-- Kept OUTSIDE prisma/sql/ so apply-prisma-sql-patches.mjs won't run it.
--   psql "$DATABASE_URL" -f prisma/rollback/20260519_chat_audit_log_rollback.sql

DROP TABLE IF EXISTS "chat_audit_log" CASCADE;

DELETE FROM "_prisma_sql_patches" WHERE filename = '20260519_chat_audit_log.sql';
