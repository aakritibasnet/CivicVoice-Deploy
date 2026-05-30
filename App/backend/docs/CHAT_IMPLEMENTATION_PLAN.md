# Civic Voice Communication Hub — Implementation Plan

> Status: Approved planning doc. No code written yet.
> Confirmed decisions: **Socket.IO + Postgres bridge** · **Officials-only MVP (citizens deferred)** · **Single instance, Redis-ready**.

---

## Part 0 — Architecture Stance: Shared Module, Not a Separate System

The chat is built as **one self-contained module inside the existing backend**, exposed as a single REST + Socket.IO API that **both** the Expo mobile app and the Next.js web ("core") consume identically.

- **Not a separate microservice.** A standalone service would force duplicating JWT auth (there are *two* token systems — `users` and `officers`), re-sharing the Postgres pool, and re-wiring push/notification infra. For a single-instance deployment this is overhead with no payoff.
- **Fully modular.** Lives in its own `routes/chat`, `services/chat`, and a dedicated Socket.IO namespace, with zero coupling to report/gamification code. Could be extracted into its own service later (alongside the Redis adapter) without a rewrite.
- **One backend, one socket, two thin clients.** Mobile and web share the same events, auth, and permission guard. No per-platform logic forks.

---

## Part 1 — Codebase Analysis

**Stack:** Express 5 + TypeScript (ESM), PostgreSQL via raw `pg` pool *and* Prisma client, hand-written numbered SQL migrations in `App/backend/src/db/migrations/` kept in sync with `prisma/schema.prisma` via `prisma:apply-sql-patches`. Mobile = Expo/React Native; web = Next.js.

### The central finding — dual identity
Two separate principal tables with separate UUIDs:
- `users` (roles: `citizen | ward | municipality | admin | officer`)
- `officers` (types: `ward_officer | municipality_officer`)

Existing tables cope via **nullable `user_id` + `officer_id` columns** (`notifications`, `push_tokens`, `comments`, `upvotes`). Chat **must** use the same polymorphic pattern for every participant/sender/receipt row, or permissions and read receipts break. This drives the entire data model.

### Reused (not rebuilt)
| Capability | Existing asset | Reuse for chat |
|---|---|---|
| Offline push | `push.service.ts` (Expo) | Push for messages when recipient offline |
| Event fan-out | Postgres `LISTEN/NOTIFY` `notification_events` + `pg_try_advisory_lock` (`realtime-delivery.service.ts`) | Same pattern for a `chat_events` channel |
| In-app notifications | `notifications.service.ts` `createNotification()` | Chat notification rows + badge |
| Auth | JWT middleware for users *and* officers (separate refresh-token tables) | Socket handshake auth |
| Uploads | Cloudinary + multer memory (`upload.cloudinary.ts`) | Attachment storage (with gaps, below) |

### Hard gaps (do not exist anywhere)
1. **No WebSocket layer at all.** Real-time sync (the core spec requirement) is unbuilt. Web is 30s polling.
2. No presence, typing, delivered/read/acknowledge infra.
3. Notifications are **report-centric**: officers bypass preferences entirely; no per-conversation mute, priority override, mentions, coalescing, quiet hours, or presence-aware suppression.
4. Cloudinary URLs are **public/unauthenticated** — unacceptable for restricted official attachments.
5. `activity_log` is report-scoped; no generic chat audit trail.
6. `users.ward_id` is an untyped `String` (not `@db.Uuid`) — data-integrity inconsistency when scoping chats by ward.

---

## Part 2 — Target Architecture

### 2.1 Real-time layer (new)
- **Socket.IO** attached to the existing HTTP server in `server.ts` (not a separate process) — shares JWT auth and the DB pool.
- **Handshake auth middleware**: validate JWT, resolve principal to `{ kind: 'user'|'officer', id, role }`. Reject unauthenticated sockets. Reuse `middleware/auth.ts` + officer auth.
- **Rooms**: one room per `chat_id` (join only after DB authz check); one per-principal room (`principal:{kind}:{id}`) for badge/unread/announcement fan-out.
- **Bridge**: a `chat_events` Postgres `NOTIFY` channel mirrors the existing notification bridge (same advisory-lock single-instance election). Room model + bridge keep it **Redis-adapter-ready** (`@socket.io/redis-adapter` later, zero schema change).
- **Delivery flow:** persist → `pg_notify('chat_events', …)` → bridge emits `message.created` to chat room → recipients ACK `message.delivered` over socket → server writes receipt → if a recipient has **no active socket in that room**, fall through to push/in-app (presence-aware suppression).

### 2.2 Data model (migrations `013_chat_core.sql` … `019_*`)
Polymorphic principal everywhere as `party_kind ('user'|'officer') + party_id (uuid)` with a CHECK that the correct FK column is populated (mirrors `notifications`).

```
chats
  id, type (officer_ward|municipality_internal|ward_municipality|complaint_case),
  title, municipality_id, ward_id, department_id, complaint_id (→reports.id),
  status (open|pending|escalated|resolved|closed|reopened),
  priority (normal|important|urgent|emergency),
  is_group, is_archived, created_by_kind, created_by_id,
  last_message_at, created_at, updated_at

chat_participants
  id, chat_id, party_kind, party_id,
  role_in_chat (admin|member|viewer),
  last_read_message_id, last_read_at,
  muted_until (nullable timestamptz),  -- 15m/1h/until-tomorrow/forever(=infinity)
  notification_level (all|mentions|none),
  is_active, joined_at, removed_at
  UNIQUE(chat_id, party_kind, party_id)

messages
  id, chat_id, sender_kind, sender_id,
  type (text|image|file|audio|location|system),
  body, reply_to_message_id, priority,
  client_msg_id (idempotency key for retry/dedupe),
  edited_at, deleted_at (soft delete), created_at
  INDEX(chat_id, created_at)

message_attachments
  id, message_id, file_name, mime_type, size_bytes,
  storage_key, thumbnail_key, scan_status (pending|clean|infected),
  uploaded_by_kind, uploaded_by_id, created_at

message_receipts
  id, message_id, party_kind, party_id,
  delivered_at, read_at, acknowledged_at
  UNIQUE(message_id, party_kind, party_id)

message_reactions   (Should-have sprint)
  id, message_id, party_kind, party_id, emoji, created_at

chat_audit_log
  id, chat_id, actor_kind, actor_id, action, metadata jsonb, created_at

chat_mentions
  id, message_id, mentioned_kind, mentioned_id, created_at
```

Migration idiom: `CREATE TABLE IF NOT EXISTS`, explicit indexes, numbered file + rollback file, mirror into `schema.prisma`, run `prisma:apply-sql-patches`. New enums: `chat_type`, `chat_status`, `chat_priority`, `chat_role`.

### 2.3 Permission model (every REST call AND socket event)
Single `assertChatAccess(principal, chatId, action)` guard, shared by REST controllers and socket handlers:
- Resolve principal's `ward_id` / `municipality_id` / department / officer type.
- Rules: `officer_ward` → assigned officers + ward users; `municipality_internal` → municipality principals only (ward officers **blocked** unless an explicit `chat_participants` grant exists); `ward_municipality` → authorized ward + municipality; `complaint_case` → participants assigned to that `reports.id`.
- Viewer = read-only. Inactive participant = denied. Same guard gates attachment downloads.

---

## Part 3 — Notification Gaps Filled + Tweaks

| Gap / Tweak | Design |
|---|---|
| Per-chat mute & snooze | `chat_participants.muted_until`; durations 15m / 1h / until-tomorrow / forever. Snooze = future `muted_until`. "Sound off keep badge" / "push off keep in-app" via `notification_level` + pref flags. |
| Priority override of mute | `chats.priority` + message `priority`. `system_settings` key `chat.urgent_bypasses_mute`. `emergency`/`urgent` ignore `muted_until` when policy enabled. |
| Mentions (`@WardOfficer`) | Parse body on send → `chat_mentions` → mentioned principals notified even at `notification_level='mentions'` and even if muted (configurable). |
| Notification coalescing | Debounce per `(chat, recipient)`; collapse rapid messages into "5 new messages in Ward 5 ↔ Municipality". Prevents push spam (current bridge is 1:1). |
| Presence-aware suppression | Live socket joined to that chat room → suppress push; only push when offline/backgrounded. |
| Quiet hours / DND | Global per-principal setting, separate from per-chat mute; urgent/emergency may bypass per policy. |
| Officer notification prefs | Today officers bypass `notification_preferences`. Add `chat_notification_prefs` keyed by `(party_kind, party_id)` so officers get real controls. |
| Civic ack workflow | `message_receipts.acknowledged_at` + "Action Required → Acknowledge" status, distinct from read, audited. |
| Delivered vs Read vs Ack | Three timestamps; client emits `message.delivered`, `message.read`, explicit `message.acknowledge`. |
| Failed/retry | `client_msg_id` idempotency + client outbox; offline queue replays on reconnect; server dedupes. |
| Escalation / SLA / announcement | New types: `chat_message`, `chat_mention`, `chat_escalated`, `chat_announcement`, `chat_sla_overdue`, `chat_closed`. Extend `NotificationType` union + `isTypeEnabled`. |
| Web realtime parity | Web moves off 30s polling onto the same Socket.IO connection for chat. |
| Badge / unread sync | `unread.updated` to per-principal room; mobile/web badges update without polling. |

---

## Part 4 — Security & Compliance
- **Attachment access control (gap fix):** stop serving raw public Cloudinary URLs for chat. Use a backend `GET /api/chat/attachments/:id` proxy that runs `assertChatAccess` then streams, logging every download to `chat_audit_log`. (Cloudinary signed short-TTL URLs is the fallback option.)
- File-type allowlist + size cap + magic-byte validation (not extension only). `scan_status` reserved for malware scanning; never serve `infected`.
- WSS only in prod; reject non-TLS sockets.
- Every REST + socket handler calls the central authz guard — no exceptions.
- Soft-delete messages (`deleted_at`); retain originals in `chat_audit_log` for legal retention.
- Rate limiting on send (`express-rate-limit` + socket-level token bucket).
- Audit: send/edit/delete/download/ack/escalate/close → `chat_audit_log`.

---

## Part 5 — Sprint Plan

Sprint 1 ("stabilize backend foundation") already committed. Chat = Sprint 2 → Sprint 8. Each sprint ships a numbered migration + rollback, mirrored Prisma schema, and an explicit Definition of Done.

### Sprint 2 — Foundations & Data Model
- Migration `013_chat_core.sql` (+ rollback): `chats`, `chat_participants`, `messages`, `message_receipts`, enums. Mirror schema, run patches.
- Polymorphic helpers (`resolvePrincipal`, `assertChatAccess`) + unit tests covering full permission matrix incl. ward-officer-blocked-from-municipality-internal.
- REST: create chat, list my chats, get participants (no messaging yet).
- **DoD:** migrations apply + roll back cleanly; permission matrix tests green; no socket yet.

### Sprint 3 — Real-time Core
- Socket.IO attached to `server.ts`; JWT handshake for users **and** officers; room join gated by `assertChatAccess`.
- `chat_events` Postgres NOTIFY bridge (advisory-lock single-instance election).
- Events: `message.created`, `typing.started/stopped`, `user.online/offline`.
- REST: send text message, paginated history (keyset on `chat_id, created_at`), `client_msg_id` idempotency.
- **DoD:** two clients exchange text in real time; unauthorized room join rejected; reconnect replays missed messages.

### Sprint 4 — Receipts, Presence, Notifications Integration
- `message_receipts` delivered/read; `last_read_message_id`; per-chat unread; `unread.updated` to per-principal room.
- Presence-aware push: offline → `createNotification()` + Expo push; online-in-room → suppressed.
- Notification coalescing/debounce; new chat notification types in `notifications.service.ts`.
- **DoD:** delivered/read ticks correct across 3 devices; muted-but-offline per policy; no push while actively viewing.

### Sprint 5 — Civic Workflow
- Complaint-linked chat (`complaint_id` → `reports.id`); escalation (reason/priority/department/deadline) with audit + notification; status lifecycle (open→escalated→resolved→closed→reopened); acknowledge action; `chat_audit_log`.
- **DoD:** ward→municipality escalation produces audited trail + notifications; closed chat blocks sends; ack recorded + audited.

### Sprint 6 — Attachments (secured)
- Upload via Cloudinary path; access-controlled download endpoint with authz + audit; type allowlist, size cap, magic-byte check; image/PDF preview + thumbnails; `scan_status` plumbing (stub clean).
- **DoD:** unauthorized attachment fetch → 403 + audited; oversized/disallowed rejected; preview works.

### Sprint 7 — Notification Controls & Mute/Snooze (Should-have)
- Per-chat mute durations + snooze; `chat_notification_prefs` (incl. officers); quiet hours/DND; priority override per `system_settings`; mentions end-to-end; reactions, reply-to, pin, edit/delete window, message search.
- **DoD:** all mute durations expire correctly; emergency bypasses mute when policy on; mention notifies a muted user; preference matrix tested for users and officers.

### Sprint 8 — Groups, Admin, Hardening
- Group management (add/remove/admin/rename/restrict-send/archive); announcements (all wards / specific ward / department / all municipality officers) via per-principal fan-out; admin console (create channels, assign officers, view audit, disable user, export history); SLA timers + overdue reminders; load test; rate-limit tuning; **web realtime parity** (Next.js on the same socket).
- **DoD:** announcement reaches correct audience only; SLA overdue fires; export = complete audited history; web no longer polls for chat.

### Later (post-MVP backlog)
Voice notes, GIFs, video, AI chat summary, auto-translation, message→task conversion, advanced analytics, PDF export, Redis adapter for multi-instance, real malware scanner.

---

## Part 6 — Risks & Mitigations
| Risk | Mitigation |
|---|---|
| Dual-identity bugs (user vs officer ID collisions) | Polymorphic `(kind,id)` + DB CHECK constraints + matrix unit tests in Sprint 2 before socket code |
| `users.ward_id` untyped String | Validate in `resolvePrincipal`; follow-up migration to cast to `uuid` if data permits (flag, don't silently coerce) |
| Push spam in active group chats | Coalescing + presence-aware suppression (Sprint 4) |
| Public Cloudinary URLs leak restricted docs | Proxied authz'd download endpoint (Sprint 6) — do not ship attachments before this |
| Single-instance socket can't scale | Room model + Postgres bridge designed Redis-adapter-ready; documented swap path |
| Scope creep from citizens | Citizens deferred; schema supports them later with zero migration churn (new participant rows only) |
