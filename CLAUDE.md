# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CivicVoice is a civic engagement platform: citizens submit reports, officers triage and resolve them, and municipalities manage ward-level operations. Three components share one repo:

- **`App/backend/`** — Express + TypeScript REST API (port 5000), Socket.IO realtime
- **`website/`** — Next.js 16 dashboard for officers/municipalities (GraphQL via Apollo, port 3000)
- **`App/mobile/`** — Expo/React Native app for citizens and officers

## Commands

### Backend (`App/backend/`)
```bash
npm run dev                      # nodemon → tsx src/server.ts
npm run build                    # tsc → dist/
npm test                         # node --test on src/**/*.test.ts (via tsx)
npm run prisma:apply-sql-patches # Apply pending SQL patches (see Migration section)
npm run prisma:generate
```

### Website (`website/`)
```bash
npm run dev          # next dev (Turbopack)
npm run build
npm run seed         # tsx prisma/seed.ts
npm run seed-wards
```

### Mobile (`App/mobile/`)
```bash
npm start            # expo start
npm run android / ios / web
```

## Architecture

### Dual ORM — Why Two Database Layers

The backend uses **Prisma** for standard relational data (users, officers, reports, badges, gamification) and **raw `pg` pool** for the entire chat module.

The reason: chat uses a polymorphic principal design — every participant/sender/message carries `(party_kind: "user"|"officer", party_id: UUID)` instead of FK columns, because a principal can live in either the `users` or `officers` table (two independent UUID spaces). Prisma can't express this cross-table polymorphism, so chat queries are raw SQL.

- Prisma client: `src/lib/prisma.ts` (singleton)
- Pool: `src/db/pool.ts` — also drives `LISTEN/NOTIFY`
- Prisma schema: `prisma/schema.prisma` — does **not** define chat tables

### Migration System

There are two independent migration systems:

1. **Prisma migrations** — standard, for Prisma-managed tables
2. **Custom SQL patch runner** (`scripts/apply-prisma-sql-patches.mjs`) — for chat tables and other raw SQL that Prisma can't generate

The patch runner reads `prisma/sql/*.sql`, sorts them **alphabetically**, and tracks applied patches (by SHA256 checksum) in `_prisma_sql_patches`. Files must be idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, etc.). The ordering convention is date + numeric infix: `20260519_1_chat_core.sql`, `20260519_2_chat_audit_log.sql` — the number is required when multiple files share a date prefix and have dependencies between them. `chat_core` must always be first since all other chat patches reference its tables.

Rollback scripts live in `prisma/rollback/` (same naming) and are run manually.

Run patches with: `npm run prisma:apply-sql-patches` in `App/backend/`.

### Auth & Principal Resolution

JWT tokens carry a `kind` claim (`"user"` or `"officer"`) and are verified in `src/middleware/auth.ts`. Two separate secrets: `JWT_ACCESS_SECRET` (15-min tokens) and `JWT_REFRESH_SECRET` (30-day, hashed in DB).

`resolvePrincipal(kind, id)` in `src/services/chat/principal.ts` is the canonical function to load a full chat principal — it fetches `ward_id`, `municipality_id`, `department_id`, and `officer_type` from the correct table. Always call this (not raw lookups) for anything that needs access control in the chat module.

Socket.IO auth (`realtime/socket-auth.ts`) validates the token and attaches `socket.data.principal: ResolvedPrincipal`.

### Realtime Architecture

The server runs one Express HTTP server shared with Socket.IO. On startup, three background services are elected and started:

1. **Notification bridge** — `LISTEN notification_events` → Expo push + Socket.IO principal rooms
2. **Chat events bridge** — `LISTEN chat_events` → `emitToChat()` → Socket.IO chat rooms
3. **SLA checker** — polls `chat_sla_timers` every 60s, fires `chat_sla_overdue` events

Each bridge uses `pg_try_advisory_lock()` to elect a single deliverer in multi-instance deploys. Writers call `pg_notify()`, the elected instance fans out.

Room model:
- Chat rooms: `chat:${chatId}`
- Principal rooms: `principal:${kind}:${id}` (for unread counts, badges, announcements)

### Chat Access Control

`evaluateChatAccess(principal, chat, participant, action)` in `src/services/chat/access.ts` is the single source of truth for chat permissions. Actions are `"read"`, `"write"`, `"workflow"` (escalate/status changes), `"manage"`. Key rules:
- An explicit `chat_participants` row overrides derived membership
- `complaint_case` chats require explicit participant grants
- Write is blocked when `status = "resolved" | "closed"`; workflow actions still allowed (for reopening)

### Website GraphQL

The website exposes a GraphQL endpoint at `/api/graphql` (Next.js Route Handler via Apollo). Schema is in `src/graphql/schema.ts`; resolvers are in `src/graphql/resolvers/`. The Prisma client uses `@prisma/adapter-pg` (connection pooling). The website has its own separate Prisma schema and generated client under `website/prisma/`.

Zustand (`src/store/auth-store`) persists the auth token; Apollo's error link clears it on 401.

### Key Environment Variables (Backend)

`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CLOUDINARY_*`, `TWILIO_*`, `SMTP_*` — all loaded from `App/backend/.env` via dotenv at process start.
