# Priority Migration Plan: From Priority Name to Priority ID

## Problem
The `tasks` table currently stores priority names (TEXT) instead of priority IDs (INTEGER foreign key). This causes issues:
- If a priority name changes, all tasks with that priority become orphaned
- No referential integrity
- Inefficient queries (string matching instead of integer joins)

## Solution
Migrate from storing priority names to storing priority IDs with a foreign key relationship.

## Migration Steps

### 1. Database Migration (Version 10) ✅
- Add `priority_id INTEGER` column to `tasks` table
- Migrate existing data: match priority names to priority IDs
- Set default priority_id for any unmatched tasks
- Add index on `priority_id` for performance
- Keep `priority` column temporarily for backward compatibility

### 2. Backend API Updates ✅
- ✅ Update SELECT queries to JOIN on `priority_id` instead of `priority` name
- ✅ Update INSERT statements to accept and store `priority_id`
- ✅ Update UPDATE statements to accept and update `priority_id`
- ✅ Maintain backward compatibility: accept both `priority` (name) and `priority_id`, but prefer `priority_id`
- ✅ Update all task queries to include priority information via JOIN
- ✅ Update real-time updates (Redis pub/sub) to include priority info
- ✅ Update priority deletion to use `priority_id` for reassignment

### 3. Frontend Updates ✅
- ✅ Update task creation/update to send `priority_id` instead of `priority` name
- ✅ Update task display to use priority from joined data (via `priorityId` lookup)
- ✅ Update search/filter to use `priority_id` (backend accepts both)
- ✅ Update all components that reference `task.priority` to use `task.priorityName` or `task.priorityId`

### 4. Cleanup (Future)
- After all code is updated and tested, remove the `priority` column from tasks table
- This will be a separate migration

## Files to Update

### Backend:
- ✅ `server/routes/tasks.js` - All task CRUD operations (DONE)
- ✅ `server/routes/boards.js` - Board queries that include tasks (DONE)
- ✅ `server/routes/reports.js` - Reports that filter by priority (DONE)
- ✅ `server/routes/priorities.js` - Priority deletion (reassignment logic) (DONE)
- ✅ `server/services/emailTemplates.js` - Email notifications (No changes needed - only notification text)
- ✅ `server/routes/users.js` - Task reassignment on user deletion (DONE)
- ✅ `server/routes/adminUsers.js` - Task reassignment on admin user deletion (DONE)

### Frontend:
- ✅ `src/api.ts` - API calls (No changes needed - type definitions only)
- ✅ `src/components/TaskCard.tsx` - Task display (DONE)
- ✅ `src/components/TaskDetails.tsx` - Task editing (DONE)
- ✅ `src/components/TaskPage.tsx` - Task creation/editing (DONE - already using priorityId)
- ✅ `src/components/QuickEditModal.tsx` - Quick edit (DONE)
- ✅ `src/components/SearchInterface.tsx` - Priority filtering (DONE - uses priority names, backend accepts both)
- ✅ `src/components/ListView.tsx` - List view display (DONE)
- ✅ `src/components/gantt/GanttViewV2.tsx` - Gantt view (DONE)
- ✅ `src/components/gantt/GanttTimeline.tsx` - Gantt timeline (DONE)
- ✅ `src/components/gantt/TaskJumpDropdown.tsx` - Task jump dropdown (DONE)
- ✅ `src/types.ts` - TypeScript types (No changes needed - already has priorityId)

## Backward Compatibility Strategy
1. Accept both `priority` (name) and `priority_id` in API requests
2. If `priority_id` is provided, use it
3. If only `priority` (name) is provided, look up the `priority_id` and use it
4. Always return both `priority` (name) and `priority_id` in API responses for compatibility
5. Frontend should gradually migrate to using `priority_id`

## Testing Checklist
- [x] Migration runs successfully on existing database ✅
- [x] All existing tasks have priority_id set ✅
- [x] Task creation with priority_id works ✅
- [x] Task creation with priority name (backward compat) works ✅
- [x] Task update with priority_id works ✅
- [x] Task update with priority name (backward compat) works ✅
- [x] Task queries return correct priority information ✅
- [x] Priority filtering/search works ✅
- [x] Priority deletion reassigns tasks correctly ✅
- [x] Frontend displays priorities correctly ✅
- [x] Frontend can change priorities ✅
- [x] Reports filter by priority correctly ✅
- [x] Real-time updates include correct priority info ✅
- [x] Renamed priorities display correctly on tasks ✅

