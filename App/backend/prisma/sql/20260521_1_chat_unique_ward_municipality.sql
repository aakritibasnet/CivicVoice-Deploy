-- Consolidate any pre-existing duplicate ward_municipality chats, then enforce
-- one chat per (ward_id, municipality_id) so ward and municipality clients
-- can never end up typing into different chat rooms.
--
-- A duplicate chat is one where (type, ward_id, municipality_id) collides
-- with another row. The canonical row is the earliest-created chat in the
-- group. Messages, audit rows and participant rows are migrated onto the
-- canonical chat, then the duplicate chat rows are deleted (their CASCADEs
-- are a no-op at that point because everything has already moved).
--
-- This patch is idempotent: after one run the canonical-finder finds each
-- chat as its own canonical, the moves become no-ops, and the unique index
-- is already in place (CREATE … IF NOT EXISTS).

BEGIN;

-- 1) Build a temp table of (duplicate_id → canonical_id) for every dupe.
CREATE TEMP TABLE _wm_dupes ON COMMIT DROP AS
WITH canonical AS (
  SELECT DISTINCT ON (ward_id, municipality_id)
         id AS canonical_id, ward_id, municipality_id
    FROM chats
   WHERE type = 'ward_municipality'
     AND ward_id IS NOT NULL
     AND municipality_id IS NOT NULL
   ORDER BY ward_id, municipality_id, created_at ASC, id ASC
)
SELECT c.id AS dup_id, k.canonical_id
  FROM chats c
  JOIN canonical k
    ON k.ward_id = c.ward_id
   AND k.municipality_id = c.municipality_id
 WHERE c.type = 'ward_municipality'
   AND c.id <> k.canonical_id;

-- 2) Move messages from duplicates to the canonical chat.
UPDATE messages m
   SET chat_id = d.canonical_id
  FROM _wm_dupes d
 WHERE m.chat_id = d.dup_id;

-- 3) Move audit rows.
UPDATE chat_audit_log a
   SET chat_id = d.canonical_id
  FROM _wm_dupes d
 WHERE a.chat_id = d.dup_id;

-- 4) Move SLA configs (PK is chat_id, so collisions delete loser first).
DELETE FROM chat_sla_configs s
 USING _wm_dupes d
 WHERE s.chat_id = d.dup_id
   AND EXISTS (
     SELECT 1 FROM chat_sla_configs cx WHERE cx.chat_id = d.canonical_id
   );

UPDATE chat_sla_configs s
   SET chat_id = d.canonical_id
  FROM _wm_dupes d
 WHERE s.chat_id = d.dup_id;

-- 5) Move SLA timers (no uniqueness constraint, plain UPDATE).
UPDATE chat_sla_timers t
   SET chat_id = d.canonical_id
  FROM _wm_dupes d
 WHERE t.chat_id = d.dup_id;

-- (chat_announcements is broadcast-scoped via scope/scope_id, not per-chat;
--  chat_notification_prefs is principal-scoped; neither references chat_id.)

-- 6) Move participants. Drop any that would collide with the canonical's
--    existing participant for the same (party_kind, party_id), then move.
DELETE FROM chat_participants cp
 USING _wm_dupes d
 WHERE cp.chat_id = d.dup_id
   AND EXISTS (
     SELECT 1 FROM chat_participants cx
      WHERE cx.chat_id = d.canonical_id
        AND cx.party_kind = cp.party_kind
        AND cx.party_id = cp.party_id
   );

UPDATE chat_participants cp
   SET chat_id = d.canonical_id
  FROM _wm_dupes d
 WHERE cp.chat_id = d.dup_id;

-- 8) Recompute last_message_at on the canonical chats we touched.
UPDATE chats c
   SET last_message_at = (
         SELECT MAX(m.created_at)
           FROM messages m
          WHERE m.chat_id = c.id
            AND m.deleted_at IS NULL
       )
 WHERE c.id IN (SELECT canonical_id FROM _wm_dupes);

-- 9) Now safe to delete the duplicate chat rows themselves. CASCADEs are
--    inert at this point because everything has been re-parented.
DELETE FROM chats c
 USING _wm_dupes d
 WHERE c.id = d.dup_id;

COMMIT;

-- 10) Enforce uniqueness going forward. Partial so other chat types are
--     unconstrained and rows with a NULL side don't block valid creates.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_ward_municipality_chat"
  ON "chats" ("ward_id", "municipality_id")
  WHERE "type" = 'ward_municipality'
    AND "ward_id" IS NOT NULL
    AND "municipality_id" IS NOT NULL;
