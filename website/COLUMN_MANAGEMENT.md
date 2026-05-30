# Column Management Features

## Overview

The Kanban board now includes comprehensive column management features accessible via an inline popup menu. Users can rename columns, change colors, and delete custom columns directly from the board interface.

## Features

### 1. **Column Options Menu**

Click the **⋮** (three dots) icon on any column header to open the options menu.

#### Available Options:
- **Rename** - Change the column name
- **Change Color** - Select from 12 predefined colors
- **Delete Column** - Remove custom columns (with protection)

### 2. **Rename Column**

**Access**: Column Options → Rename

**Features**:
- Inline text input with live editing
- Enter to save, Escape to cancel
- Validates non-empty names
- Real-time error feedback
- Disabled for default columns

**Protection**:
- Default columns cannot be renamed
- Shows "Default" label for protected columns

**Usage**:
```
1. Click ⋮ on column header
2. Select "Rename"
3. Type new name
4. Press Enter or click "Save"
```

### 3. **Change Color**

**Access**: Column Options → Change Color

**Features**:
- 12 predefined colors optimized for UX
- Visual color picker grid
- Live preview with current selection highlighted
- Instant visual feedback
- Works for all columns (including defaults)

**Available Colors**:
- Blue (#3b82f6)
- Purple (#8b5cf6)
- Cyan (#06b6d4)
- Green (#10b981)
- Amber (#f59e0b)
- Orange (#f97316)
- Red (#ef4444)
- Pink (#ec4899)
- Gray (#6b7280)
- Teal (#14b8a6)
- Violet (#a855f7)
- Yellow (#eab308)

**Usage**:
```
1. Click ⋮ on column header
2. Select "Change Color"
3. Click desired color
4. Click "Save"
```

### 4. **Delete Column**

**Access**: Column Options → Delete Column

**Features**:
- Confirmation dialog with smart messaging
- Triple protection system
- Clear error messaging
- Cannot be undone (permanent)

**Protection Levels**:

1. **Default Column Protection**
   - Default columns cannot be deleted
   - Shows "Protected" label
   - Delete button disabled
   - Message: "Cannot delete default columns."

2. **Non-Empty Column Protection**
   - Cannot delete columns with reports
   - Shows report count
   - Delete button disabled
   - Message: "This column has X reports. Please move or complete them before deleting."

3. **Empty Custom Column**
   - Only case where deletion is allowed
   - Shows confirmation dialog
   - Requires explicit confirmation
   - Message: "Are you sure you want to delete [Column Name]? This action cannot be undone."

**Usage**:
```
1. Click ⋮ on column header
2. Select "Delete Column"
3. Read confirmation message
4. Click "Delete" to confirm (if allowed)
```

## UI Components

### **AnchoredPopup** (`src/ui/AnchoredPopup.tsx`)

A reusable popup component that anchors to a specific element.

**Features**:
- Automatic positioning
- Viewport boundary detection
- Click-outside-to-close
- Escape key support
- Smooth animations
- Multiple placement options

**Props**:
```typescript
interface AnchoredPopupProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  children: React.ReactNode;
  placement?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
  offset?: { x: number; y: number };
}
```

### **ColorPicker** (`src/ui/ColorPicker.tsx`)

A grid-based color picker with predefined colors.

**Features**:
- 6-column grid layout
- Hover effects (scale + shadow)
- Current selection indicator
- Keyboard accessible
- Customizable color palette

**Props**:
```typescript
interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  colors?: string[];
}
```

### **ColumnOptionsPopup** (`src/components/kanban/ColumnOptionsPopup.tsx`)

The main column management interface.

**Features**:
- Multi-view state machine
- Inline editing
- Error handling
- Loading states
- Smart validation

**View Modes**:
1. `menu` - Main options menu
2. `rename` - Rename interface
3. `color` - Color picker interface
4. `delete-confirm` - Delete confirmation

**Props**:
```typescript
interface ColumnOptionsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  column: KanbanColumn;
  onRename: (newName: string) => Promise<void>;
  onChangeColor: (newColor: string) => Promise<void>;
  onDelete: () => Promise<void>;
}
```

## GraphQL API

### Mutations

#### Update Column
```graphql
mutation UpdateKanbanColumn($id: ID!, $input: UpdateColumnInput!) {
  updateKanbanColumn(id: $id, input: $input) {
    id
    name
    color
    is_default
    # ... other fields
  }
}
```

**Input**:
```typescript
{
  name?: string;
  position?: number;
  color?: string;
  deadline_days?: number;
  is_terminal?: boolean;
  mapped_status?: ReportStatus;
}
```

#### Delete Column
```graphql
mutation DeleteKanbanColumn($id: ID!) {
  deleteKanbanColumn(id: $id)
}
```

**Returns**: `Boolean` (true on success)

**Errors**:
- "Cannot delete default columns"
- "Cannot delete: X report(s) in this column"
- "Column not found"

## Backend Validation

### Resolver Logic

**Update Column** (`updateKanbanColumn`):
```typescript
- Requires admin or municipality role
- Cannot modify non-existent columns
- Validates input fields
- Updates timestamp automatically
```

**Delete Column** (`deleteKanbanColumn`):
```typescript
- Requires admin or municipality role
- Checks if column is default (blocks if true)
- Counts reports in column (blocks if > 0)
- Deletes column if all checks pass
```

## User Experience

### Interaction Flow

```
User clicks ⋮
  → Popup opens below button
  → User selects action

  If Rename:
    → Input field auto-focuses
    → User types new name
    → Press Enter or click Save
    → Popup closes, column updates

  If Change Color:
    → Color grid appears
    → User clicks color
    → Click Save
    → Popup closes, column updates

  If Delete:
    → Confirmation dialog appears
    → Shows protection status
    → User confirms (if allowed)
    → Popup closes, column removed
```

### Error Handling

**Network Errors**:
- Shows error message in popup
- Keeps popup open for retry
- Does not close on error

**Validation Errors**:
- Inline error display
- Red text with warning icon
- Specific error messages

**User Errors**:
- Disabled buttons for invalid actions
- Explanatory labels ("Default", "Protected")
- Clear messaging

## Accessibility

- **Keyboard Navigation**: Tab, Enter, Escape
- **Focus Management**: Auto-focus on inputs
- **ARIA Labels**: Descriptive titles on all buttons
- **Visual Feedback**: Hover states, active states
- **Error Announcements**: Screen reader compatible

## Performance

- **Optimistic Updates**: Immediate UI feedback
- **Debouncing**: Not needed (explicit save)
- **Caching**: Apollo cache auto-updates
- **Re-renders**: Minimal, only affected column

## Testing Checklist

### Rename Column
- [ ] Open rename dialog
- [ ] Type new name
- [ ] Save with Enter key
- [ ] Cancel with Escape key
- [ ] Try empty name (should show error)
- [ ] Try renaming default column (should be disabled)
- [ ] Verify name updates on board

### Change Color
- [ ] Open color picker
- [ ] Select different color
- [ ] Save color change
- [ ] Verify color updates on board
- [ ] Try changing default column color (should work)
- [ ] Verify color persists after refresh

### Delete Column
- [ ] Try deleting default column (should be blocked)
- [ ] Try deleting column with reports (should be blocked)
- [ ] Delete empty custom column (should work)
- [ ] Verify column removed from board
- [ ] Verify reports not affected
- [ ] Check cannot undo deletion

### Popup Behavior
- [ ] Click outside to close
- [ ] Press Escape to close
- [ ] Popup stays within viewport
- [ ] Position updates on scroll
- [ ] Multiple popups don't conflict

## Known Limitations

1. **Color Palette**: Fixed to 12 colors (can be extended)
2. **Undo**: No undo for deletions (add if needed)
3. **Batch Operations**: One column at a time
4. **Drag to Reorder**: Not yet implemented (future)

## Future Enhancements

- [ ] Custom color input (hex/RGB)
- [ ] Column templates
- [ ] Bulk column operations
- [ ] Column duplication
- [ ] Column archiving (vs deletion)
- [ ] Permission per column
- [ ] Column description field
- [ ] Column icons

## Troubleshooting

### Popup not appearing
- Check console for errors
- Verify `anchorEl` is not null
- Check z-index conflicts

### Cannot delete column
- Verify column is not default
- Check report count (must be 0)
- Verify user has admin/municipality role

### Color not saving
- Check network tab for mutation
- Verify GraphQL endpoint is reachable
- Check for validation errors

### Name not updating
- Ensure name is not empty
- Check for duplicate names
- Verify mutation completed

## Files Modified/Created

### New Files
- `src/ui/AnchoredPopup.tsx` - Popup component
- `src/ui/ColorPicker.tsx` - Color selection
- `src/components/kanban/ColumnOptionsPopup.tsx` - Main options UI
- `COLUMN_MANAGEMENT.md` - This documentation

### Modified Files
- `src/components/kanban/KanbanColumn.tsx` - Added options button & handlers
- `src/components/kanban/KanbanBoard.tsx` - Added mutation hooks & handlers
- `src/graphql/resolvers/kanban.resolver.ts` - Already had update/delete logic

## Support

For issues or questions:
1. Check console for errors
2. Verify user permissions
3. Test with admin account
4. Check network requests
5. Consult KANBAN_IMPLEMENTATION.md for system overview
