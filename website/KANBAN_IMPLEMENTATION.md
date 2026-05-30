# Role-Based Kanban with Collapsible Columns - Implementation Guide

## Overview

This implementation adds role-based access control to the Kanban board with collapsible columns that persist their state across sessions.

## Features

### 1. **Role-Based Column Access**
- Different default columns for Ward, Municipality, and Admin roles
- Ward sees: Incoming → In Progress → Completed → Invalid
- Municipality sees: New Reports → Under Review → In Progress → Completed → Returned to Ward → Invalid
- Admin sees all columns with full control

### 2. **Dynamic CRUD Operations**
- Create custom columns (Municipality & Admin only)
- Update column properties (except defaults)
- Delete custom columns (protected: cannot delete defaults)
- Reorder columns via drag-and-drop

### 3. **Collapsible Columns**
- Click chevron to collapse/expand individual columns
- Collapsed columns display vertically: T|O|D|O
- State persists in database and localStorage
- Smooth animations for collapse/expand

### 4. **User Preferences**
- Per-user column collapse state stored in database
- Synced across devices
- Falls back to localStorage for offline support

## Database Schema Changes

### New Fields in `kanban_columns`
```prisma
model kanban_columns {
  // ... existing fields ...
  is_default    Boolean       @default(false)
  role_access   user_role[]   @default([])
}
```

### New Table: `kanban_user_preferences`
```prisma
model kanban_user_preferences {
  id                 String   @id @default(dbgenerated("gen_random_uuid()"))
  user_id            String   @db.Uuid
  collapsed_columns  Json     @default("[]")
  column_order       Json?
  created_at         DateTime @default(now())
  updated_at         DateTime @default(now())
  users              users    @relation(...)
}
```

## GraphQL API

### Queries
```graphql
# Get board with role-filtered columns
query GetKanbanBoard {
  kanbanBoard {
    id
    name
    is_default
    role_access
    # ... other fields
  }
}

# Get user preferences
query GetKanbanPreferences {
  kanbanUserPreferences {
    collapsed_columns
    column_order
  }
}
```

### Mutations
```graphql
# Toggle column collapse state
mutation ToggleColumnCollapse($columnId: ID!) {
  toggleColumnCollapse(columnId: $columnId) {
    collapsed_columns
  }
}

# Update all preferences at once
mutation UpdateKanbanPreferences($input: UpdatePreferencesInput!) {
  updateKanbanPreferences(input: $input) {
    collapsed_columns
    column_order
  }
}
```

## Frontend Architecture

### Zustand Store (`src/store/kanbanStore.ts`)
- Manages local UI state
- Persists to localStorage
- Syncs with server preferences on load

```typescript
interface KanbanState {
  collapsedColumns: Set<string>;
  toggleColumnCollapse: (columnId: string) => void;
  setCollapsedColumns: (columnIds: string[]) => void;
  isColumnCollapsed: (columnId: string) => boolean;
}
```

### Components

#### `KanbanBoard.tsx`
- Fetches board data and user preferences
- Syncs collapsed state from server
- Handles collapse/expand with optimistic updates
- Passes collapse state to columns

#### `KanbanColumn.tsx`
- Renders expanded or collapsed view
- Collapsed: 56px wide with vertical text
- Expanded: 320px wide with full content
- Smooth transitions between states

## Usage

### 1. Apply Database Migration

```bash
cd website
npx prisma db push
```

### 2. Seed Default Columns

```bash
npx tsx prisma/seed-kanban-defaults.ts
```

### 3. Generate Prisma Client

```bash
npx prisma generate
```

### 4. Start Development Server

```bash
npm run dev
```

## User Interaction Flow

1. **Collapsing a Column**
   - User clicks chevron-left icon on column header
   - Column animates to 56px width
   - Text rotates to vertical orientation
   - State saved to both localStorage and database
   - Persists across page reloads and devices

2. **Expanding a Column**
   - User clicks chevron-right icon on collapsed column
   - Column animates back to 320px width
   - Content returns to normal orientation
   - State updated in localStorage and database

3. **Role-Based Filtering**
   - Ward user only sees Ward columns
   - Municipality user sees Municipality + Admin columns
   - Admin sees all columns
   - Columns automatically filtered on server

4. **CRUD Operations**
   - Only Municipality and Admin can create columns
   - Default columns cannot be deleted
   - Custom columns can be deleted (if empty)
   - All users can reorder their visible columns

## Default Column Configurations

### Ward (4 columns)
1. **Incoming** (Blue) - 3 day deadline
2. **In Progress** (Amber) - 7 day deadline
3. **Completed** (Green) - Terminal
4. **Invalid** (Red) - Terminal

### Municipality (6 columns)
1. **New Reports** (Blue) - 2 day deadline
2. **Under Review** (Purple) - 5 day deadline
3. **In Progress** (Amber) - 14 day deadline
4. **Completed** (Green) - Terminal
5. **Returned to Ward** (Orange)
6. **Invalid** (Red) - Terminal

### Admin (7 columns)
1. **Incoming** (Blue) - 1 day deadline
2. **Under Review** (Purple) - 3 day deadline
3. **Assigned** (Cyan) - 7 day deadline
4. **In Progress** (Amber) - 14 day deadline
5. **Completed** (Green) - Terminal
6. **Returned** (Orange)
7. **Invalid** (Red) - Terminal

## Technical Decisions

### Why Zustand + Server Sync?
- **Zustand**: Fast local state, instant UI updates
- **Server**: Cross-device persistence, backup
- **localStorage**: Offline support, immediate availability
- **Best of all worlds**: Optimistic UI + reliable persistence

### Why Vertical Text for Collapsed State?
- Maximizes information density
- Allows 5-6 collapsed columns in same space as 1 expanded
- Maintains visual hierarchy and color coding
- Better UX than hiding entirely

### Why Protect Default Columns?
- Ensures consistent workflow across organization
- Prevents accidental deletion of core stages
- Maintains data integrity
- Allows customization without breaking base functionality

## Troubleshooting

### Collapsed state not persisting
1. Check browser localStorage is enabled
2. Verify user is authenticated (check JWT token)
3. Check network tab for mutation success
4. Verify database has `kanban_user_preferences` table

### Columns not showing for role
1. Check `role_access` array in database
2. Verify user's role in JWT payload
3. Check GraphQL resolver role filter
4. Ensure column `is_default` matches role

### Migration fails
1. Check database connection
2. Verify `user_role` enum has correct values
3. Run `npx prisma db pull` to see current state
4. Apply manual migration SQL if needed

## Future Enhancements

- [ ] Drag to reorder columns
- [ ] Custom column colors per user
- [ ] Column-level permissions (view/edit)
- [ ] Bulk collapse/expand all columns
- [ ] Column width customization
- [ ] Export/import column configurations
- [ ] Column templates for quick setup

## Files Changed/Created

### Database
- `prisma/schema.prisma` - Added role_access, is_default, preferences table
- `prisma/migrations/20260315_add_role_based_kanban/migration.sql` - Migration
- `prisma/seed-kanban-defaults.ts` - Seed default columns

### Backend (GraphQL)
- `src/graphql/schema.ts` - Updated types, added preferences
- `src/graphql/resolvers/kanban.resolver.ts` - Role filtering, preferences
- `src/graphql/operations/kanban.ts` - New queries/mutations

### Frontend (UI)
- `src/components/kanban/KanbanBoard.tsx` - Preferences integration
- `src/components/kanban/KanbanColumn.tsx` - Collapsible view
- `src/store/kanbanStore.ts` - State management
- `src/types/kanban.ts` - Updated interfaces

## License & Credits

Implemented as part of VoiceCivic FYP project.
