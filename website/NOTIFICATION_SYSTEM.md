# In-App Notification System

A comprehensive, production-ready notification system for the CivicVoice web application built with Next.js, React, GraphQL, Zustand, and Prisma.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [File Structure](#file-structure)
- [Setup & Usage](#setup--usage)
- [API Reference](#api-reference)
- [Customization](#customization)

## 🎯 Overview

The notification system provides real-time alerts to users when important events occur, such as when a report is assigned to their ward. It features a dropdown notification panel in the header, a full notifications page, sound alerts, and real-time polling for updates.

## ✨ Features

### Core Features
- ✅ **Real-time Notifications** - 30-second polling interval for near real-time updates
- ✅ **Sound Alerts** - Plays notification.wav when new notifications arrive
- ✅ **Unread Badge** - Visual indicator showing unread notification count
- ✅ **Notification Dropdown** - Quick access panel in the header showing recent 5 notifications
- ✅ **Full Notifications Page** - Comprehensive view at `/dashboard/notifications`
- ✅ **Filtering** - Filter by All, Unread, or Read notifications
- ✅ **Mark as Read** - Individual and bulk "mark all as read" functionality
- ✅ **Delete Notifications** - Remove individual notifications
- ✅ **Click to Navigate** - Notifications linked to reports open the ReportDetailModal
- ✅ **Responsive Design** - Mobile-friendly UI components

### Notification Types
- `info` - General informational notifications
- `success` - Success/completion messages
- `warning` - Warning alerts
- `error` - Error notifications
- `report_assigned` - Special type for report-related notifications

### Triggers
Currently, notifications are automatically created when:
- A report is **returned to a ward** from municipality
- All ward users with access to that ward receive the notification

## 🏗️ Architecture

### Tech Stack
- **Frontend**: Next.js 16, React 19, TypeScript
- **State Management**: Zustand
- **Data Fetching**: Apollo Client (GraphQL)
- **Backend**: GraphQL API with Prisma ORM
- **Database**: PostgreSQL
- **Styling**: Tailwind CSS

### Data Flow

```
┌─────────────────┐
│  User Action    │ (e.g., Return report to ward)
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  GraphQL Resolver       │ (kanban.resolver.ts)
│  - Triggers createNotif │
└────────┬────────────────┘
         │
         ▼
┌──────────────────────────┐
│  Prisma DB Insert        │ (notifications table)
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│  Apollo Polling (30s)    │ (useNotifications hook)
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│  Zustand Store Update    │ (notification-store.ts)
│  - Plays sound           │
│  - Updates UI            │
└──────────────────────────┘
```

## 💾 Database Schema

### `notifications` Table

The schema has been updated to include a `report_id` field linking notifications to specific reports:

```prisma
model notifications {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id    String   @db.Uuid
  report_id  String?  @db.Uuid
  title      String   @db.VarChar(255)
  message    String
  type       String   @default("info") @db.VarChar(50)
  link       String?  @db.VarChar(500)
  is_read    Boolean  @default(false)
  created_at DateTime @default(now()) @db.Timestamptz(6)
  users      users    @relation(fields: [user_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  reports    reports? @relation(fields: [report_id], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@index([user_id], map: "idx_notifications_user")
  @@index([user_id, is_read], map: "idx_notifications_user_unread", where: raw("(is_read = false)"))
  @@index([report_id], map: "idx_notifications_report")
}
```

### Migration Required

After updating the schema, run:

```bash
npx prisma migrate dev --name add_report_id_to_notifications
npx prisma generate
```

## 📁 File Structure

```
website/
├── app/
│   └── dashboard/
│       └── notifications/
│           └── page.tsx                    # Notifications route
│
├── src/
│   ├── components/
│   │   ├── dashboard/
│   │   │   └── Header.tsx                  # Updated with NotificationDropdown
│   │   └── notifications/
│   │       ├── NotificationDropdown.tsx    # Bell icon & dropdown panel
│   │       └── NotificationsPage.tsx       # Full notifications page
│   │
│   ├── store/
│   │   └── notification-store.ts           # Zustand state management
│   │
│   ├── hooks/
│   │   └── useNotifications.ts             # Custom hook for polling & mutations
│   │
│   ├── graphql/
│   │   ├── schema.ts                       # Updated with Notification types
│   │   ├── operations/
│   │   │   └── notifications.ts            # GraphQL queries & mutations
│   │   └── resolvers/
│   │       ├── notification.resolver.ts    # Notification CRUD resolvers
│   │       ├── kanban.resolver.ts          # Updated with notification triggers
│   │       └── index.ts                    # Updated resolver exports
│   │
│   └── config/
│       └── navigation.ts                   # Updated with Notifications nav item
│
├── public/
│   └── sounds/
│       └── notification.wav                # Notification sound file
│
└── prisma/
    └── schema.prisma                       # Updated database schema
```

## 🚀 Setup & Usage

### 1. Database Migration

```bash
cd website
npx prisma migrate dev --name add_report_id_to_notifications
npx prisma generate
```

### 2. Sound File

Ensure `notification.wav` exists at `public/sounds/notification.wav`. The system will fail gracefully if the file is missing, logging a warning to the console.

### 3. Start the Application

```bash
npm run dev
```

### 4. Using the Notification System

#### As a Developer - Creating Notifications

To create notifications programmatically:

```typescript
import { createNotification } from "@/src/graphql/resolvers/notification.resolver";

// Example: Notify ward users about a new report
await createNotification({
  user_id: "user-uuid",
  report_id: "report-uuid",  // Optional: links to a report
  title: "New Report Assigned",
  message: "A new report has been assigned to your ward",
  type: "report_assigned",
  link: "/dashboard/kanban?report=report-uuid",  // Optional
});
```

#### As a User - Viewing Notifications

1. **Dropdown**: Click the bell icon in the header to view recent notifications
2. **Full Page**: Navigate to "Notifications" in the sidebar under System section
3. **Mark as Read**: Click on a notification or use "Mark all read" button
4. **Navigate to Report**: Click on a notification with a report to open the ReportDetailModal

## 📚 API Reference

### GraphQL Schema

#### Queries

```graphql
# Get all notifications for the current user
query GetNotifications {
  notifications {
    id
    user_id
    report_id
    title
    message
    type
    link
    is_read
    created_at
  }
}

# Get unread count
query GetUnreadNotificationCount {
  unreadNotificationCount
}
```

#### Mutations

```graphql
# Mark single notification as read
mutation MarkNotificationAsRead($id: ID!) {
  markNotificationAsRead(id: $id) {
    id
    is_read
  }
}

# Mark all notifications as read
mutation MarkAllNotificationsAsRead {
  markAllNotificationsAsRead
}

# Delete notification
mutation DeleteNotification($id: ID!) {
  deleteNotification(id: $id)
}
```

### Zustand Store API

```typescript
// Access notification store
import { useNotificationStore } from "@/src/store/notification-store";

const {
  notifications,         // Array of all notifications
  unreadCount,          // Number of unread notifications
  isDropdownOpen,       // Dropdown open state
  addNotification,      // Add new notification (with sound)
  setNotifications,     // Set all notifications
  markAsRead,           // Mark single as read
  markAllAsRead,        // Mark all as read
  deleteNotification,   // Delete notification
  toggleDropdown,       // Toggle dropdown
  closeDropdown,        // Close dropdown
  playNotificationSound // Play sound manually
} = useNotificationStore();
```

### Custom Hook

```typescript
import { useNotifications } from "@/src/hooks/useNotifications";

const {
  notifications,     // From GraphQL query
  loading,          // Loading state
  error,            // Error state
  markAsRead,       // Async function
  markAllAsRead,    // Async function
  deleteNotification, // Async function
  refetch           // Manually refetch
} = useNotifications();
```

## 🎨 Customization

### Change Polling Interval

Edit `website/src/hooks/useNotifications.ts`:

```typescript
const POLL_INTERVAL = 30000; // Change to desired milliseconds
```

### Change Notification Sound

Replace `public/sounds/notification.wav` with your own audio file, or update the path in `notification-store.ts`:

```typescript
const audio = new Audio("/sounds/your-sound.wav");
```

### Add New Notification Triggers

1. Import the helper function:
   ```typescript
   import { createNotification } from "@/src/graphql/resolvers/notification.resolver";
   ```

2. Call it in your resolver:
   ```typescript
   await createNotification({
     user_id: targetUserId,
     report_id: reportId, // Optional
     title: "Your Title",
     message: "Your message",
     type: "info", // or success, warning, error, report_assigned
   });
   ```

### Customize UI Colors/Styles

The notification components use Tailwind CSS. Modify the class names in:
- `NotificationDropdown.tsx`
- `NotificationsPage.tsx`

Example badge variants are defined in `src/ui/Badge.tsx`.

## 🔐 Security

- ✅ All GraphQL resolvers check user authentication
- ✅ Users can only access their own notifications
- ✅ Cascading deletes when users or reports are deleted
- ✅ Input validation on all mutations

## 🧪 Testing Tips

### Manual Testing

1. **Create Test Notification**:
   - As a municipality user, return a report to a ward
   - Ward users should receive notification within 30 seconds

2. **Test Dropdown**:
   - Click bell icon
   - Verify unread count badge
   - Click notification to mark as read

3. **Test Full Page**:
   - Navigate to `/dashboard/notifications`
   - Test filtering (All, Unread, Read)
   - Test "Mark all as read"
   - Test delete notification

4. **Test Sound**:
   - Ensure browser allows autoplay
   - Wait for new notification to arrive
   - Verify sound plays

### GraphQL Playground

Test queries/mutations in your GraphQL playground:

```graphql
# Create test notification (add to your resolvers first)
mutation {
  createNotification(input: {
    title: "Test"
    message: "Test message"
    type: "info"
  }) {
    id
  }
}
```

## 📊 Performance Considerations

- **Polling**: 30-second interval balances real-time feel with server load
- **Caching**: Apollo Client caches notifications reducing unnecessary requests
- **Optimistic UI**: Mark as read operations update UI immediately
- **Indexed Queries**: Database indexes on `user_id`, `is_read`, and `report_id`
- **Limits**: Dropdown shows only 5 most recent notifications

## 🛠️ Troubleshooting

### Notifications Not Appearing

1. Check browser console for GraphQL errors
2. Verify user is authenticated
3. Confirm polling is active (check Network tab for periodic requests)
4. Check database for notifications: `SELECT * FROM notifications WHERE user_id = 'your-id'`

### Sound Not Playing

1. Check browser autoplay policy
2. Verify `notification.wav` exists in `public/sounds/`
3. Check browser console for audio errors
4. Try user interaction first (click somewhere) to enable autoplay

### Polling Not Working

1. Verify `useNotifications()` hook is called in component
2. Check Apollo Client configuration
3. Look for errors in browser console
4. Confirm GraphQL endpoint is accessible

## 🚧 Future Enhancements

Potential features to add:

- [ ] WebSocket support for instant real-time updates
- [ ] Email notifications
- [ ] Push notifications (PWA)
- [ ] Notification preferences (per user)
- [ ] Notification categories/channels
- [ ] Bulk actions (delete all, archive)
- [ ] Notification history/archive
- [ ] Rich notifications (with images/attachments)
- [ ] Notification templates
- [ ] Admin panel for broadcast notifications

## 📝 License

This notification system is part of the VoiceCivic project.

---

**Built with ❤️ for CivicVoice**
