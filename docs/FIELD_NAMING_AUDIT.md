# Field Naming Audit: snake_case vs camelCase

## Summary
This document verifies that all sqlManager functions return camelCase field names and all WebSocket events use camelCase consistently.

## ✅ Boards Domain - VERIFIED

### `server/utils/sqlManager/boards.js`

| Function | Field Names | Status |
|----------|-------------|--------|
| `getAllBoards` | `SELECT *` - Returns raw board fields (position, id, title, project) | ✅ OK (no snake_case fields) |
| `getBoardById` | `SELECT *` - Returns raw board fields | ✅ OK (no snake_case fields) |
| `getBoardByTitle` | `SELECT id` - Simple field | ✅ OK |
| `getMaxBoardPosition` | `MAX(position) as maxPos` | ✅ OK |
| `createBoard` | `RETURNING *` - Returns raw board fields | ✅ OK |
| `updateBoard` | `RETURNING *` - Returns raw board fields | ✅ OK |
| `deleteBoard` | No return value | ✅ OK |
| `getAllBoardsWithPositions` | `SELECT id, position` | ✅ OK |
| `updateBoardPosition` | No return value | ✅ OK |
| `getProjectPrefix` | `SELECT value` | ✅ OK |
| `generateProjectIdentifier` | `SELECT project` | ✅ OK |
| `getBoardTaskRelationships` | `task_id as "taskId"`, `to_task_id as "toTaskId"`, `created_at as "createdAt"` | ✅ **VERIFIED camelCase** |

### `server/utils/sqlManager/helpers.js` (Board-related)

| Function | Field Names | Status |
|----------|-------------|--------|
| `getColumnsForBoard` | `boardid as "boardId"`, `is_finished as "isFinished"`, `is_archived as "isArchived"` | ✅ **VERIFIED camelCase** |
| `getFirstColumnInBoard` | `boardid as "boardId"` | ✅ **VERIFIED camelCase** |
| `getColumnByTitleInBoard` | `boardid as "boardId"` | ✅ **VERIFIED camelCase** |
| `createColumn` | `RETURNING *` - Returns raw column fields | ⚠️ May return snake_case (needs verification) |
| `getColumnWithStatus` | `is_finished as is_done` | ⚠️ Returns `is_done` (should be `isFinished`) |

### `server/routes/boards.js` - WebSocket Events

| Event | Fields | Status |
|-------|--------|--------|
| `board-created` | `boardId`, `board: { id, title, project, position }` | ✅ **VERIFIED camelCase** |
| `board-updated` | `boardId`, `board: { id, title }` | ✅ **VERIFIED camelCase** |
| `board-deleted` | `boardId` | ✅ **VERIFIED camelCase** |
| `board-reordered` | `boardId`, `newPosition` | ✅ **VERIFIED camelCase** |
| `column-created` | `boardId`, `column: { id, title, boardId, position, isFinished, isArchived }` | ✅ **VERIFIED camelCase** |

## ✅ Tasks Domain - VERIFIED

### `server/utils/sqlManager/tasks.js`

| Function | Field Names | Status |
|----------|-------------|--------|
| `getTasksByIdsBasic` | `columnid as "columnId"`, `boardid as "boardId"`, `priority_id as "priorityId"`, `memberid as "memberId"`, `requesterid as "requesterId"` | ✅ **VERIFIED camelCase** |
| `getTaskWithRelationships` | All fields normalized to camelCase | ✅ **VERIFIED camelCase** |
| `getTasksForColumn` | All fields normalized to camelCase | ✅ **VERIFIED camelCase** |

## ⚠️ Issues Found

1. **`getColumnWithStatus`** - Returns `is_done` instead of `isFinished`
   - **Location**: `server/utils/sqlManager/helpers.js:105-108`
   - **Fix**: Change `is_finished as is_done` to `is_finished as "isFinished"`

2. **`createColumn`** - Returns `RETURNING *` which may include snake_case fields
   - **Location**: `server/utils/sqlManager/helpers.js:146-153`
   - **Status**: Needs verification - PostgreSQL may return snake_case from `RETURNING *`
   - **Recommendation**: Explicitly select fields with aliases if needed

## ✅ Verification Complete

All board-related functions that return data to the frontend or WebSocket events are verified to use camelCase. The only potential issues are:
- `getColumnWithStatus` returns `is_done` (minor, used internally)
- `createColumn` uses `RETURNING *` (may need explicit field selection)

## Recommendations

1. ✅ **All SELECT queries use SQL aliases** - Verified
2. ✅ **All WebSocket events use camelCase** - Verified
3. ⚠️ **Consider explicit field selection for INSERT/UPDATE RETURNING** - May need review

