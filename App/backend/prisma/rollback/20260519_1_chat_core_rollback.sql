-- Rollback for prisma/sql/20260519_chat_core.sql (Sprint 2 — chat core).
--
-- NOTE: kept OUTSIDE prisma/sql/ on purpose. apply-prisma-sql-patches.mjs
-- scans prisma/sql/ and runs every .sql there; a rollback living there would
-- be auto-applied. Run this manually to reverse the migration:
--   psql "$DATABASE_URL" -f prisma/rollback/20260519_chat_core_rollback.sql
-- then remove the tracking row so the patch re-applies cleanly:
--   DELETE FROM "_prisma_sql_patches" WHERE filename = '20260519_chat_core.sql';

DROP TABLE IF EXISTS "message_receipts" CASCADE;
DROP TABLE IF EXISTS "messages" CASCADE;
DROP TABLE IF EXISTS "chat_participants" CASCADE;
DROP TABLE IF EXISTS "chats" CASCADE;

DROP TYPE IF EXISTS chat_message_type;
DROP TYPE IF EXISTS chat_role;
DROP TYPE IF EXISTS chat_priority;
DROP TYPE IF EXISTS chat_status;
DROP TYPE IF EXISTS chat_type;

DELETE FROM "_prisma_sql_patches" WHERE filename = '20260519_chat_core.sql';
