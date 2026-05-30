-- Remove chat_participants rows that the old ward_municipality access rule
-- lazily materialized. Before the fix, a ward-scoped principal (ward officer
-- or ward-role org user) was granted type-derived access to SIBLING wards'
-- bridge chats via the municipality match (they all share a municipality_id).
-- assertChatAccess then inserted a participant row for them in a chat that
-- does not belong to their ward. Because an explicit participant grant
-- overrides the type check (access.ts step 1), those stale rows would keep
-- leaking another ward's conversation even after the rule is corrected.
--
-- A row is "bad" iff: the chat is ward_municipality, the principal is
-- ward-scoped, and the chat's ward_id differs from the principal's own ward.
-- Same-ward rows and all municipality-side rows are left untouched. We never
-- delete messages — only the erroneous memberships.
--
-- Idempotent: re-running deletes nothing once the bad rows are gone.

BEGIN;

-- Ward-role org users. users.ward_id is TEXT holding a uuid (the principal
-- resolver casts it the same way), and is always set for ward-role accounts.
DELETE FROM chat_participants cp
 USING chats c, users u
 WHERE cp.chat_id = c.id
   AND c.type = 'ward_municipality'
   AND c.ward_id IS NOT NULL
   AND cp.party_kind = 'user'
   AND u.id = cp.party_id
   AND u.role = 'ward'
   AND u.ward_id IS NOT NULL
   AND c.ward_id IS DISTINCT FROM u.ward_id::uuid;

-- Ward officers. officers.ward_id is already uuid.
DELETE FROM chat_participants cp
 USING chats c, officers o
 WHERE cp.chat_id = c.id
   AND c.type = 'ward_municipality'
   AND c.ward_id IS NOT NULL
   AND cp.party_kind = 'officer'
   AND o.id = cp.party_id
   AND o.type = 'ward_officer'
   AND o.ward_id IS NOT NULL
   AND c.ward_id IS DISTINCT FROM o.ward_id;

COMMIT;
