-- Rollback for prisma/sql/20260519_chat_attachments.sql (Sprint 6).
-- Kept OUTSIDE prisma/sql/ so apply-prisma-sql-patches.mjs won't run it.

DROP TABLE IF EXISTS "message_attachments" CASCADE;
DROP TYPE IF EXISTS chat_scan_status;

DELETE FROM "_prisma_sql_patches"
 WHERE filename = '20260519_chat_attachments.sql';
