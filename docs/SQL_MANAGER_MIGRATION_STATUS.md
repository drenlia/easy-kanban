# SQL Manager Migration Status

## Overview
This document tracks the progress of migrating all SQL queries to the centralized `sqlManager` module and converting to PostgreSQL-native queries.

## Migration Progress

### ✅ Completed: Tasks Domain
**Status**: Fully migrated to `sqlManager`
**Files**: 
- `server/utils/sqlManager/tasks.js` - All task-related queries
- `server/utils/sqlManager/helpers.js` - Helper queries (priorities, columns, boards, etc.)
- `server/routes/tasks.js` - All routes now use `sqlManager.tasks` and `sqlManager.helpers`

### ✅ Completed: Boards Domain
**Status**: Fully migrated to `sqlManager`
**Files**:
- `server/utils/sqlManager/boards.js` - All board-related queries
- `server/utils/sqlManager/helpers.js` - Added `createColumn` and `getColumnsForBoard`
- `server/routes/boards.js` - All routes now use `sqlManager.boards`, `sqlManager.tasks`, and `sqlManager.helpers`

### ✅ Completed: Columns Domain
**Status**: Fully migrated to `sqlManager`
**Files**:
- `server/utils/sqlManager/helpers.js` - All column-related queries
- `server/routes/columns.js` - All routes now use `sqlManager.helpers`

### ✅ Completed: Comments Domain
**Status**: Fully migrated to `sqlManager`
**Files**:
- `server/utils/sqlManager/comments.js` - All comment-related queries
- `server/utils/sqlManager/helpers.js` - Added `getAttachmentsForComment`
- `server/routes/comments.js` - All routes now use `sqlManager.comments`, `sqlManager.helpers`, and `sqlManager.tasks`

**Key Functions Migrated**:
- `createComment` - Create new comment
- `getCommentById` - Get comment with author info
- `getCommentSimple` - Get comment without joins
- `getCommentsForTask` - Get all comments for a task
- `updateComment` - Update comment text
- `deleteComment` - Delete comment
- `getAttachmentsForComment` - Get attachments for a comment (in helpers.js)
- `getTaskBoardId` - Get task's board ID (updated to return camelCase)

**Key Functions Migrated**:
- `getColumnById` - Get column by ID (id, title)
- `getColumnFullInfo` - Get full column info (id, title, boardId, position)
- `getColumnWithStatus` - Get column with isFinished status
- `getFirstColumnInBoard` - Get first column in board
- `getColumnByTitleInBoard` - Check for duplicate column names (case-insensitive)
- `getColumnsForBoard` - Get all columns for a board
- `getAllColumnsForBoard` - Get all columns ordered by position
- `getColumnIdsForBoard` - Get column IDs for renumbering
- `getMaxColumnPosition` - Get maximum column position
- `getColumnPosition` - Get column position by ID
- `createColumn` - Create new column
- `updateColumn` - Update column (title, isFinished, isArchived)
- `updateColumnPosition` - Update column position
- `shiftColumnPositions` - Shift column positions for reordering
- `checkColumnNameDuplicate` - Check for duplicate column names (excluding specific column)
- `deleteColumn` - Delete column

**Key Functions Migrated**:
- `getAllBoards` - Get all boards ordered by position
- `getBoardById` - Get board by ID
- `getBoardByTitle` - Check for duplicate board names
- `createBoard` - Create new board
- `updateBoard` - Update board title
- `deleteBoard` - Delete board
- `getAllBoardsWithPositions` - Get boards with positions for reordering
- `updateBoardPosition` - Update board position
- `getProjectPrefix` - Get project prefix from settings
- `generateProjectIdentifier` - Generate next project identifier
- `getBoardTaskRelationships` - Get task relationships for a board
- `createColumn` - Create column (in helpers.js)
- `getColumnsForBoard` - Get all columns for a board (in helpers.js)

**Field Naming Verification**:
- ✅ All SELECT queries use SQL aliases for camelCase (`boardid as "boardId"`, `columnid as "columnId"`, `task_id as "taskId"`, `created_at as "createdAt"`, `is_finished as "isFinished"`, `is_archived as "isArchived"`)
- ✅ WebSocket events use camelCase (`boardId`, `columnId`, `isFinished`, `isArchived`)
- ✅ All functions return camelCase field names
- ✅ Fixed `getColumnWithStatus` to return `isFinished` instead of `is_done`
- ✅ Fixed `getColumnById` to include `id` field
- ✅ Updated all references in routes to use `isFinished` instead of `is_done`

**Tasks Domain Key Functions Migrated**:
- `getTaskWithRelationships` - Full task with all relationships
- `getTaskByTicket` - Task lookup by ticket number
- `getTasksForColumn` - All tasks in a column
- `createTask` - Task creation
- `updateTask` - Task updates
- `deleteTask` - Task deletion
- `getTasksByIdsBasic` - Basic task data for batch operations
- `getTaskBoardId` - Get task's board ID
- `renumberTasksInColumn` - Position renumbering
- And many more...

### ⚠️ Critical Issue Found & Fixed

**Issue**: Real-time WebSocket updates not working for task position changes
**Root Cause**: `getTasksByIdsBasic` was returning snake_case field names (`boardid`, `columnid`) but the code was accessing camelCase (`boardId`, `columnId`), causing `boardId` to be `undefined` in WebSocket events.

**Fix Applied**:
1. Updated `getTasksByIdsBasic` to return camelCase using SQL aliases (`columnid as "columnId"`, `boardid as "boardId"`)
2. Added fallback normalization in `batch-update-positions` route for safety
3. Ensured all WebSocket event payloads use camelCase consistently

**Files Fixed**:
- `server/utils/sqlManager/tasks.js` - `getTasksByIdsBasic` now returns camelCase
- `server/routes/tasks.js` - `batch-update-positions` route now handles field normalization

### 🔍 Field Naming Consistency

**Current State**:
- ✅ `getTasksByIdsBasic` - Returns camelCase (fixed)
- ✅ `fetchTaskWithRelationships` - Returns camelCase (already normalized)
- ✅ `getBoardTaskRelationships` - Returns camelCase (`taskId`, `toTaskId`, `createdAt`)
- ✅ `getColumnsForBoard` - Returns camelCase (`boardId`, `isFinished`, `isArchived`)
- ✅ `getFirstColumnInBoard` - Returns camelCase (`boardId`)
- ✅ `getColumnByTitleInBoard` - Returns camelCase (`boardId`)
- ✅ `getColumnWithStatus` - Returns camelCase (`id`, `title`, `isFinished`) - Fixed
- ✅ `getColumnById` - Returns camelCase (`id`, `title`) - Fixed
- ✅ WebSocket events - Use camelCase consistently (`boardId`, `columnId`, `isFinished`, `isArchived`)
- ✅ All boards.js sqlManager functions - Return camelCase
- ✅ All board-related helpers.js functions - Return camelCase
- ✅ All references in routes updated to use `isFinished` instead of `is_done`

**Recommendation**: 
- All sqlManager functions should return camelCase for consistency
- Use SQL aliases (`columnid as "columnId"`) in SELECT statements
- Document this as a standard in the migration plan

### 📋 Remaining Migration Work

#### High Priority (Real-time Updates Depend on These)
- [x] **Boards domain** - Board queries and WebSocket events ✅
- [x] **Columns domain** - Column queries ✅
- [x] **Comments domain** - Comment queries ✅
- [ ] **Task Relations domain** - Tag/attachment relationships (partially done)

#### Medium Priority
- [ ] **Users/Admin Users** - User management queries
- [ ] **Sprints** - Sprint queries
- [ ] **Priorities** - Priority queries (helpers done, routes may need migration)
- [ ] **Reports** - Report queries

#### Low Priority
- [ ] **Settings** - Settings queries
- [ ] **Files** - File queries
- [ ] **Activity** - Activity log queries
- [ ] **Health** - Health check queries

### 🐛 Known Issues

1. **Real-time Updates Fixed** ✅
   - Issue: Task position updates not appearing in real-time for other users
   - Status: Fixed by normalizing field names in `getTasksByIdsBasic`

2. **Field Naming Inconsistency** ✅
   - All board and task-related sqlManager functions verified to return camelCase
   - Fixed `getColumnWithStatus` to return `isFinished` instead of `is_done`
   - See `docs/FIELD_NAMING_AUDIT.md` for complete audit

### 📝 Migration Best Practices

1. **Always Return camelCase**:
   ```sql
   SELECT columnid as "columnId", boardid as "boardId" FROM tasks
   ```

2. **WebSocket Events Must Use camelCase**:
   ```javascript
   {
     boardId: task.boardId,  // ✅ camelCase
     columnId: task.columnId,  // ✅ camelCase
     // NOT: boardid, columnid
   }
   ```

3. **Normalize at Query Level**:
   - Use SQL aliases in SELECT statements
   - Don't rely on JavaScript normalization (slower, error-prone)

4. **Test Real-time Updates**:
   - Always test with multiple users/sessions
   - Verify WebSocket events are received
   - Check that `boardId` is present in all events

### 🔄 Next Steps

1. **Immediate**:
   - ✅ Fix real-time updates (DONE)
   - Test with 2 users to verify fix works
   - Audit other sqlManager functions for field naming

2. **Short-term**:
   - Continue migrating remaining route files
   - Ensure all sqlManager functions return camelCase
   - Add field normalization helper if needed

3. **Long-term**:
   - Complete full migration per plan
   - Remove all SQLite code
   - Optimize queries
   - Document sqlManager API

### 📊 Migration Statistics

- **Tasks Domain**: ✅ 100% Complete
- **Boards Domain**: ✅ 100% Complete
- **Columns Domain**: ✅ 100% Complete
- **Comments Domain**: ✅ 100% Complete
- **Overall Progress**: ~40-45% (Tasks, Boards, Columns, and Comments are major domains)
- **Estimated Remaining**: 2-2.5 weeks

### 🧪 Testing Checklist

For each migrated route:
- [ ] All endpoints work correctly
- [ ] Real-time updates work (test with 2+ users)
- [ ] Field names are camelCase in responses
- [ ] WebSocket events include `boardId` and `columnId` (camelCase)
- [ ] No performance regressions
- [ ] Error handling works correctly

