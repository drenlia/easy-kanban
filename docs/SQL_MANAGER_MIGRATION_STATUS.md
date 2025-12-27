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

### ✅ Completed: Task Relationships Domain (task_rels table)
**Status**: Fully migrated to `sqlManager`
**Files**:
- `server/utils/sqlManager/tasks.js` - All task relationship queries (task_rels table)
- `server/utils/sqlManager/boards.js` - `getBoardTaskRelationships` function
- `server/routes/tasks.js` - All relationship routes use `sqlManager.tasks`

**Key Functions Migrated**:
- `getTaskRelationships` - Get all relationships for a task
- `getTaskRelationship` - Check if specific relationship exists
- `getOppositeRelationship` - Check for opposite relationship (for cycle detection)
- `createTaskRelationship` - Create new relationship (parent/child/related)
- `deleteTaskRelationship` - Delete relationship
- `getAvailableTasksForRelationship` - Get tasks available for creating relationships
- `getRelationshipsForFlowChart` - Get relationships for flowchart visualization
- `getBoardTaskRelationships` - Get all relationships for a board (in boards.js)

**Note**: This covers the `task_rels` table for parent/child/related relationships. Task-Tag, Watcher, and Collaborator associations are handled separately (see below).

### ✅ Completed: Task Relations Domain (tags/watchers/collaborators)
**Status**: Fully migrated to `sqlManager`
**Files**:
- `server/utils/sqlManager/helpers.js` - All tag/watcher/collaborator association queries
- `server/routes/taskRelations.js` - All routes now use `sqlManager.helpers` and `sqlManager.tasks`

**Key Functions Migrated**:
- `getTagsForTask` - Get all tags for a task
- `getTagById` - Get tag by ID
- `checkTagAssociation` - Check if tag is already associated with task
- `addTagToTask` - Add tag to task
- `removeTagFromTask` - Remove tag from task
- `getWatchersForTask` - Get all watchers for a task
- `addWatcher` - Add watcher to task
- `removeWatcher` - Remove watcher from task
- `getCollaboratorsForTask` - Get all collaborators for a task
- `addCollaborator` - Add collaborator to task
- `removeCollaborator` - Remove collaborator from task

**Note**: All routes in `taskRelations.js` now use sqlManager functions. Task info queries use `taskQueries.getTaskById` and `taskQueries.getTaskWithBoardColumnInfo` for consistency.

### ✅ Completed: Priorities Domain
**Status**: Fully migrated to `sqlManager`
**Files**:
- `server/utils/sqlManager/priorities.js` - All priority queries
- `server/routes/priorities.js` - All routes now use `sqlManager.priorities`

**Key Functions Migrated**:
- `getAllPriorities` - Get all priorities ordered by position
- `getPriorityById` - Get priority by ID
- `getPriorityByName` - Get priority by name
- `getDefaultPriority` - Get default priority
- `getMaxPriorityPosition` - Get maximum position value
- `createPriority` - Create new priority
- `updatePriority` - Update priority
- `deletePriority` - Delete priority
- `updatePriorityPositions` - Update priority positions (for reordering)
- `setDefaultPriority` - Set priority as default
- `getPriorityUsageCount` - Get usage count (tasks using priority)
- `getBatchPriorityUsageCounts` - Get batch usage counts
- `getTasksUsingPriority` - Get tasks using a priority
- `reassignTasksPriority` - Reassign tasks from one priority to another

### ✅ Completed: Sprints Domain
**Status**: Fully migrated to `sqlManager`
**Files**:
- `server/utils/sqlManager/sprints.js` - All sprint (planning_periods) queries
- `server/routes/sprints.js` - All routes now use `sqlManager.sprints`

**Key Functions Migrated**:
- `getAllSprints` - Get all sprints ordered by start_date DESC
- `getActiveSprint` - Get currently active sprint
- `getSprintById` - Get sprint by ID
- `getSprintUsageCount` - Get usage count (tasks using sprint)
- `getTasksUsingSprint` - Get tasks using a sprint
- `deactivateAllSprints` - Deactivate all sprints
- `deactivateAllSprintsExcept` - Deactivate all sprints except one
- `createSprint` - Create new sprint
- `updateSprint` - Update sprint
- `deleteSprint` - Delete sprint
- `unassignTasksFromSprint` - Remove sprint assignment from tasks

### ✅ Completed: Users Domain
**Status**: Fully migrated to `sqlManager`
**Files**:
- `server/utils/sqlManager/users.js` - All user queries
- `server/routes/users.js` - User profile routes (avatar, profile update, settings, account deletion)
- `server/routes/adminUsers.js` - Admin user management routes (GET all users, POST create, PUT update, DELETE user, role management, etc.)
- `server/routes/adminPortal.js` - Admin portal user routes

**Key Functions Migrated**:
- `getUserById` - Get user by ID
- `getUserByIdForAdmin` - Get user by ID for admin (all fields)
- `getUserByEmail` - Get user by email
- `getMemberByUserId` - Get member by user_id
- `getMemberByUserIdWithColor` - Get member by user_id with color
- `getMemberById` - Get member by ID
- `updateUserAvatar` - Update user avatar path
- `checkMemberNameExists` - Check if member name exists
- `updateMemberName` - Update member name
- `updateMemberColor` - Update member color
- `getUserSettings` - Get user settings
- `upsertUserSetting` - Upsert user setting
- `deleteUserSetting` - Delete user setting
- `getTasksForMember` - Get tasks for member
- `getTaskCountForMember` - Get task count for member
- `getUserBasicInfo` - Get user basic info
- `getAllUsersWithRolesAndMembers` - Get all users with roles and member info (for admin)
- `getUserWithRoles` - Get user with roles
- `getUserRole` - Get user's current role
- `getRoleByName` - Get role ID by name
- `checkEmailExists` - Check if email exists (with optional exclude)
- `createUser` - Create new user
- `updateUser` - Update user fields (uses `true`/`false` for boolean `is_active` field)
- `deleteUserRoles` - Delete user roles
- `addUserRole` - Add user role
- `updateUserTimestamp` - Update user's updated_at timestamp

**Fixes Applied**:
- ✅ Fixed boolean handling in `updateUser` - now uses `true`/`false` instead of `1`/`0` for PostgreSQL `is_active` field
- ✅ Fixed undefined `dbType` reference in admin user routes (changed to `getNotificationSystem()`)
- ✅ Improved error logging in member-name update route

### ✅ Completed: Reports Domain
**Status**: Fully migrated to `sqlManager`
**Files**:
- `server/utils/sqlManager/reports.js` - All report-related queries
- `server/routes/reports.js` - All routes now use `sqlManager.reports`

**Key Functions Migrated**:
- `getReportSettings` - Get report-related settings
- `getSettingByKey` - Get setting value by key
- `getMemberInfoByUserId` - Get member info by user_id
- `getUserTotalPoints` - Get user's total points (sum across all periods)
- `getUserMonthlyPoints` - Get user's monthly points breakdown
- `getUserAchievements` - Get user achievements with badge info
- `getActiveMembersCount` - Get count of active members
- `getBurndownSnapshots` - Get burndown snapshots for a date range
- `getBurndownBaseline` - Get burndown baseline (tasks at first snapshot)
- `getBoardsInDateRange` - Get unique boards in date range
- `getBoardBurndownSnapshots` - Get board-specific burndown snapshots
- `getActivityEvents` - Get activity events for team performance
- `getUserPointsForPeriod` - Get user points for a specific period
- `getPriorityByName` - Get priority by name
- `getTaskList` - Get task list with filters
- `getTagsForTask` - Get tags for a task

**Endpoints Migrated**:
- `GET /api/reports/settings` - Report visibility settings
- `GET /api/reports/user-points` - User points and achievements
- `GET /api/reports/leaderboard` - Team rankings
- `GET /api/reports/burndown` - Burndown charts
- `GET /api/reports/team-performance` - Team performance metrics
- `GET /api/reports/task-list` - Comprehensive task list with metrics

### 📋 Remaining Migration Work

#### High Priority (Real-time Updates Depend on These)
- [x] **Boards domain** - Board queries and WebSocket events ✅
- [x] **Columns domain** - Column queries ✅
- [x] **Comments domain** - Comment queries ✅
- [x] **Task Relationships domain** - Parent/child/related relationships (task_rels table) ✅
- [x] **Task Relations domain** - Tag/watcher/collaborator associations (taskRelations.js) ✅

#### Medium Priority
- [x] **Priorities** - Priority queries ✅
- [x] **Sprints** - Sprint queries ✅
- [x] **Users/Admin Users** - User management queries ✅
- [x] **Reports** - Report queries ✅

#### Low Priority
- [x] **Settings** - Settings queries ✅
- [x] **Files** - File queries ✅
- [x] **Activity** - Activity log queries ✅
- [x] **Health** - Health check queries ✅

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

### ✅ Completed: Settings Domain
**Status**: Fully migrated to `sqlManager`
**Files**:
- `server/utils/sqlManager/settings.js` - All settings queries
- `server/routes/settings.js` - All routes now use `sqlManager.settings`

**Key Functions Migrated**:
- `getSettingsByKeys` - Get settings by array of keys
- `getAllSettings` - Get all settings
- `getSettingByKey` - Get setting by key
- `upsertSetting` - Insert or update setting
- `upsertSettingWithTimestamp` - Insert or update setting with custom timestamp

### ✅ Completed: Files Domain
**Status**: Fully migrated to `sqlManager`
**Files**:
- `server/utils/sqlManager/files.js` - All file/attachment queries
- `server/routes/files.js` - All routes now use `sqlManager.files` and `sqlManager.tasks`

**Key Functions Migrated**:
- `getAttachmentById` - Get attachment by ID
- `getUserByIdForFileAccess` - Get user by ID for file access verification
- `getTaskByIdForFiles` - Get task by ID (for attachment operations)
- `deleteAttachment` - Delete attachment by ID

### ✅ Completed: Activity Domain
**Status**: Fully migrated to `sqlManager`
**Files**:
- `server/utils/sqlManager/activity.js` - All activity log queries
- `server/routes/activity.js` - All routes now use `sqlManager.activity`

**Key Functions Migrated**:
- `getActivityFeed` - Get activity feed with limit
- `getUserStatus` - Get user status and permissions

### ✅ Completed: Health Domain
**Status**: Fully migrated to `sqlManager`
**Files**:
- `server/utils/sqlManager/health.js` - All health check queries
- `server/routes/health.js` - All routes now use `sqlManager.health`

**Key Functions Migrated**:
- `checkDatabaseConnection` - Check database connection

### 🎉 Migration Complete!

**All domains have been successfully migrated to `sqlManager`!**

### 🔄 Next Steps

1. **Testing & Validation**:
   - Test all endpoints to ensure they work correctly
   - Verify real-time updates still work
   - Check for any remaining SQL queries in route files
   - Performance testing

2. **Cleanup**:
   - Remove any unused SQL query code
   - Review and optimize queries
   - Add JSDoc documentation to all sqlManager functions

3. **Documentation**:
   - Document sqlManager API
   - Create query usage examples
   - Update developer documentation

### 📊 Migration Statistics

- **Tasks Domain**: ✅ 100% Complete
- **Boards Domain**: ✅ 100% Complete
- **Columns Domain**: ✅ 100% Complete
- **Comments Domain**: ✅ 100% Complete
- **Task Relationships Domain** (task_rels): ✅ 100% Complete
- **Task Relations Domain** (tags/watchers/collaborators): ✅ 100% Complete
- **Priorities Domain**: ✅ 100% Complete
- **Sprints Domain**: ✅ 100% Complete
- **Users Domain**: ✅ 100% Complete
- **Reports Domain**: ✅ 100% Complete
- **Settings Domain**: ✅ 100% Complete
- **Files Domain**: ✅ 100% Complete
- **Activity Domain**: ✅ 100% Complete
- **Health Domain**: ✅ 100% Complete
- **Overall Progress**: ~95-100% (All major domains migrated: Tasks, Boards, Columns, Comments, Task Relationships, Task Relations, Priorities, Sprints, Users, Reports, Settings, Files, Activity, Health)
- **Estimated Remaining**: Complete! 🎉

### 🧪 Testing Checklist

For each migrated route:
- [ ] All endpoints work correctly
- [ ] Real-time updates work (test with 2+ users)
- [ ] Field names are camelCase in responses
- [ ] WebSocket events include `boardId` and `columnId` (camelCase)
- [ ] No performance regressions
- [ ] Error handling works correctly

