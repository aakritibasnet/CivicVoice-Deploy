# Prisma Migration Audit

## Scope

This audit covers `App/backend/src/**` plus the legacy SQL migrations in
`App/backend/src/db/migrations/**`. The backend is currently split between:

- legacy raw `pg` access via [`src/db/pool.ts`](src/db/pool.ts)
- direct SQL in services and two controllers
- mixed schema generations:
  - older integer-based sprint tables in `src/db/migrations`
  - newer UUID-based workflow tables already reflected more accurately in
    [`website/prisma/schema.prisma`](../website/prisma/schema.prisma)

The migration target should be Prisma as the primary data layer, with raw SQL
reserved only for PostGIS and a few aggregate/reporting paths where Prisma
cannot express the query ergonomically.

## Files Using Database Access

### Core database plumbing

- `src/db/pool.ts`: shared `pg` Pool instance
- `src/db/query.ts`: thin query helper over `pool.query`
- `src/helper/session.ts`: refresh token creation + last-login writes
- `src/server.ts`: startup connection test

### Controllers with direct SQL

- `src/controllers/ward/ward.controller.ts`
- `src/controllers/reports/status.controller.ts`

### Auth / identity services

- `src/services/auth/signup.service.ts`
- `src/services/auth/login.service.ts`
- `src/services/auth/logout.service.ts`
- `src/services/auth/me.service.ts`
- `src/services/auth/password.service.ts`
- `src/services/auth/refresh.service.ts`
- `src/services/auth/verification.service.ts`
- `src/services/auth/verify-email.service.ts`
- `src/services/user/profile.service.ts`
- `src/services/user/delete-account.service.ts`

### Reports / public interactions

- `src/services/reports/reports.service.ts`
- `src/services/reports/interactions.service.ts`
- `src/services/reports/followers.service.ts`
- `src/services/report-posts/feed.service.ts`

### Notifications

- `src/services/notifications/notifications.service.ts`
- `src/services/notifications/preferences.service.ts`
- `src/services/notifications/push.service.ts`
- `src/services/notifications/triggers.service.ts`

### Gamification / analytics

- `src/services/gamification/stats.service.ts`
- `src/services/gamification/badges.service.ts`
- `src/services/gamification/leaderboard.service.ts`
- `src/services/search/search.service.ts`

### Ward / municipality / officer workflow

- `src/services/ward/ward.service.ts`
- `src/services/ward/department.service.ts`
- `src/services/ward/publish.service.ts`
- `src/services/officer/officer.service.ts`

## Entities / Tables Discovered

### Core identity

- `users`
- `officers`
- `pending_users`
- `verification_codes`
- `refresh_tokens`
- `sessions`

### Geography / organization

- `wards`
- `municipalities`
- `officer_departments`
- `ward_officers`

### Report workflow

- `reports`
- `kanban_columns`
- `kanban_user_preferences`
- `activity_log`
- `task_completions`
- `attachments`
- `anonymous_reports`
- `anonymous_report_claims`
- `ward_happiness_events`

### Interactions / engagement

- `comments`
- `upvotes`
- `bookmarks`
- `report_followers`
- `notifications`
- `notification_preferences`
- `push_tokens`

### Publishing / public feed

- `report_posts`
- `report_ratings`
- `report_comments`
- `report_comment_reports`
- `report_post_bookmarks`
- `ward_published_reports`
- `ward_publish_schedule`

### Gamification / stats

- `badges`
- `user_badges`
- `user_stats`
- `analytics_snapshots`
- `system_settings`

### Legacy / partial / conflicting sprint-era tables still referenced

- `status_history`
- `departments`
- `officer_departments` (legacy meaning conflicts with current UUID table naming)
- `officer_tasks`
- `task_proof`
- `task_activity`
- `task_comments`
- `officer_notifications`

## Inferred Relations

### Identity

- `users` 1:n `refresh_tokens`
- `users` 1:n `verification_codes` is indirect by email, not FK-backed
- `users` 1:1 `notification_preferences`
- `users` 1:1 `user_stats`
- `users` n:m `badges` through `user_badges`
- `users` 1:n `push_tokens`

### Geography / organization

- `municipalities` 1:n `wards`
- `wards` 1:n `reports`
- `wards` 1:n `officers`
- `wards` 1:n `ward_officers`
- `officer_departments` 1:n `officers`
- `officer_departments` 1:n `reports` via assigned department

### Report workflow

- `users` 1:n `reports` as reporter
- `users` 1:n `reports` as assigned admin/officer in some legacy paths
- `officers` 1:n `reports` as `assigned_field_officer_id`
- `reports` 1:n `comments`
- `reports` 1:n `upvotes`
- `reports` 1:n `bookmarks`
- `reports` 1:n `report_followers`
- `reports` 1:n `notifications`
- `reports` 1:n `activity_log`
- `reports` 1:1 `task_completions`
- `reports` 1:1 `report_posts`
- `reports` 1:n `ward_happiness_events`
- `kanban_columns` 1:n `reports`

### Public feed

- `report_posts` 1:n `report_ratings`
- `report_posts` 1:n `report_comments`
- `report_posts` 1:n `report_post_bookmarks`
- `report_comments` self-relation for replies

## Complex / Risky Query Areas

### PostGIS and spatial

- `src/services/ward/ward.service.ts`
- `src/services/reports/reports.service.ts::findSimilarReports`
- `src/services/notifications/triggers.service.ts::notifyNearbyResolved`

These will likely remain Prisma raw SQL because they depend on `ST_Contains`,
`ST_AsGeoJSON`, `ST_SimplifyPreserveTopology`, and distance math.

### Dynamic filtering / ranking / pagination

- `src/services/search/search.service.ts`
- `src/services/reports/reports.service.ts::listPublicReportsService`
- `src/services/report-posts/feed.service.ts::getReportPostsFeed`
- `src/services/gamification/leaderboard.service.ts`

These require careful Prisma translation to preserve sort, cursor, and aggregate
semantics.

### SQL functions / stored logic

- `src/services/gamification/stats.service.ts::getOrCreateUserStats`
- `src/services/gamification/badges.service.ts::awardBadgesForUser`

Current behavior depends on database functions `refresh_user_stats` and
`check_and_award_badges`. These are likely raw SQL holdouts or need to be
reimplemented in application code plus Prisma transactions.

### Transaction-sensitive flows

- signup + pending user + verification code
- email verification + user creation + session creation
- login + refresh token + last login update
- refresh rotation
- delete account + token revocation
- create report + kanban placement + anonymous ownership record
- claim anonymous reports
- ward publish + schedule reset

These should become `prisma.$transaction` flows.

## Response Shape Dependencies

### Controllers expecting SQL row objects

- `reports.controller.ts`: expects `report` payload with plain column names
- `interactions.controller.ts`: maps thrown string errors from services
- `report-posts/feed.controller.ts`: returns raw service payloads, not wrapped DTOs
- `search.controller.ts`: expects report and officer search rows to already be API-shaped
- `officer.controller.ts`: expects flattened report/task rows with aliased fields

### Services with SQL-shaped contracts

- `officer.service.ts`: returns flattened rows, alias-heavy
- `ward/publish.service.ts`: JSON snapshots are SQL-shaped task objects
- `notifications/triggers.service.ts`: expects `rows[0]` from plain selects
- `profile.service.ts`: public profile returns hand-assembled objects from multiple queries

## Schema Drift / Conflicts To Resolve Before Full Migration

1. The backend SQL migrations are not the current source of truth.
   Many migration files still reference integer ids (`report_id`, `ward_id`) and
   legacy statuses (`submitted`, `resolved`, `closed`).

2. Current application logic uses UUID ids and newer workflow statuses:
   `incoming`, `in_progress`, `completed`, `returned`, `invalid`.

3. There are stale files still using old-state semantics:
   - `src/controllers/reports/status.controller.ts`
   - `src/services/ward/department.service.ts`
   - `src/services/ward/publish.service.ts`
   - `src/services/search/search.service.ts`

4. `src/services/reports/reports.service.ts` already assumes new workflow columns
   such as `incoming_seen_at`, `incoming_ack_deadline_at`, and `ward_deadline_at`,
   which makes DB alignment mandatory.

## Recommended Prisma Strategy

### Use normal Prisma client queries for

- auth record lookups and updates
- report CRUD and interaction toggles
- comments / bookmarks / followers
- notification preferences and notification CRUD
- officer profile/report/task reads
- refresh token rotation
- nested relation reads on report detail

### Use Prisma transactions for

- signup
- verify email
- login session creation
- refresh rotation
- delete account
- create report
- claim anonymous reports
- publish ward report
- officer task status transitions when combined with activity creation

### Keep Prisma raw SQL intentionally for

- PostGIS boundary detection and GeoJSON extraction
- nearby distance calculations
- full-text-like report search ranking if Prisma search support is insufficient
- database functions `refresh_user_stats` and `check_and_award_badges` until reimplemented

## File-by-File Migration Plan

### Foundation

- `src/db/pool.ts`: remove after migration completion
- `src/db/query.ts`: remove after migration completion
- `src/lib/prisma.ts`: reusable Prisma client entrypoint
- `prisma/schema.prisma`: backend schema source

### Auth

- `src/helper/session.ts`
  - current: client-driven inserts/updates
  - target: Prisma transaction helper over `refresh_tokens` + `users` / `officers`
- `src/services/auth/*.ts`
  - current: row-based lookups and manual transactions
  - target: `findUnique`, `create`, `update`, `upsert`, `$transaction`
- `src/services/user/*.ts`
  - current: manual selects/updates, verification-service coupling
  - target: relation-aware Prisma reads + shared verification/session helpers

### Reports / interactions

- `src/services/reports/reports.service.ts`
  - current: raw inserts, dynamic list SQL, claim loop
  - target:
    - create: Prisma `create` inside transaction
    - list/detail: `findMany` / `findUnique` with `include`
    - claim: transactional loop or batched mutation with consistency checks
    - similarity/public listing: likely mixed Prisma + raw SQL
- `src/services/reports/interactions.service.ts`
  - target: `findUnique`, `create`, `deleteMany`, `_count`, transaction for counters if needed
- `src/services/reports/followers.service.ts`
  - target: unique relation toggle via `findFirst` + `create` / `deleteMany`

### Notifications

- `src/services/notifications/*.ts`
  - target: Prisma CRUD plus `upsert` for preferences and push tokens
- `src/services/notifications/triggers.service.ts`
  - target: relation reads through Prisma, raw SQL retained only for nearby-resolved spatial query

### Officer / ward workflow

- `src/services/officer/officer.service.ts`
  - target: relation includes for reports/comments/activity/proof
  - special care: preserve flattened mobile response contracts
- `src/services/ward/department.service.ts`
  - target: replace legacy `users`-as-officers logic with Prisma models aligned to real `officers`
- `src/services/ward/publish.service.ts`
  - target: Prisma reads/writes, maybe raw SQL fallback only if snapshot queries remain awkward
- `src/services/ward/ward.service.ts`
  - target: Prisma raw SQL for geometry operations

### Search / analytics / gamification

- `src/services/search/search.service.ts`
  - target: likely Prisma raw SQL for ranked search, Prisma normal queries for directory reads if feasible
- `src/services/gamification/*.ts`
  - target: Prisma aggregates / relation queries
  - keep raw SQL or DB functions temporarily for `refresh_user_stats` and badge-award function calls

### Controllers needing response-contract review

- `src/controllers/reports/*.ts`
- `src/controllers/report-posts/feed.controller.ts`
- `src/controllers/search/search.controller.ts`
- `src/controllers/officer/officer.controller.ts`
- `src/controllers/ward/ward.controller.ts`

These should be revisited after service migration to ensure API payloads still
match current clients.

## Migration Order

1. Foundation: Prisma schema, generated client, backend client wrapper
2. Auth + user profile
3. Notifications + preferences + push tokens
4. Reports CRUD + interactions + anonymous flows
5. Officer mobile services
6. Ward services and publish flows
7. Search + gamification + leaderboards
8. Controller cleanup and direct-SQL removal
9. Remove `pg` runtime dependency once remaining deliberate raw SQL is moved to Prisma raw APIs

## Initial Migration Assumptions

- The repo-level Prisma schema in `website/prisma/schema.prisma` is closer to the
  actual current database than the backend sprint SQL files.
- The backend migration should reuse that schema shape, but the backend still
  needs its own Prisma client generation path and its own service-by-service
  conversion.
- Some legacy controllers/services will need behavior correction, not just ORM
  substitution, because they still encode old statuses or old table layouts.
