-- Rollback for prisma/sql/20260519_chat_notification_controls.sql (Sprint 7).
-- Kept OUTSIDE prisma/sql/ so apply-prisma-sql-patches.mjs won't run it.

DROP TABLE IF EXISTS "message_reactions" CASCADE;
DROP TABLE IF EXISTS "chat_mentions" CASCADE;
DROP TABLE IF EXISTS "chat_notification_prefs" CASCADE;
DELETE FROM "system_settings" WHERE "key" = 'chat.urgent_bypasses_mute';

DELETE FROM "_prisma_sql_patches"
 WHERE filename = '20260519_chat_notification_controls.sql';
