# Column Name Audit Report
**Generated**: 2025-10-26  
**Purpose**: Verify all SQL queries use correct column names matching database schema

## Database Schema Reference

### Core Tables (snake_case mixed with camelCase)
- **users**: `is_active` (NOT `isActive`)
- **columns**: `is_finished` (NOT `is_done`), `is_archived`, `boardId` (camelCase)
- **tasks**: `memberId`, `requesterId`, `columnId`, `boardId` (all camelCase)
- **comments**: `taskId`, `authorId`, `createdAt` (all camelCase)
- **watchers**: `taskId`, `memberId`, `createdAt` (all camelCase)
- **collaborators**: `taskId`, `memberId`, `createdAt` (all camelCase)
- **tags**: `tag` (NOT `name`), `description`, `color`
- **task_tags**: `taskId`, `tagId` (both camelCase)

---

## Audit Results by File

### ✅ server/routes/reports.js
**Status**: ALL FIXED

#### Fixed Issues:
1. ✅ Line 86: `u.is_active = 1` (was `u.isActive`)
2. ✅ Line 145: `u.is_active = 1` (was `u.isActive`)  
3. ✅ Line 407: `c.is_finished as is_done` (was `c.is_done`)
4. ✅ Line 439-441: `c.is_finished = 1/0` (was `c.is_done`)

#### Verified Correct:
- ✅ Line 26: `m.name as user_name` - correct
- ✅ Line 410-412: `taskId` in subqueries - correct
- ✅ Line 414-416: `t.boardId`, `t.columnId`, `t.memberId` - correct
- ✅ Line 461: `t.tag` from tags table - correct
- ✅ Line 464: `tt.taskId` - correct

---

### ✅ server/jobs/taskSnapshots.js
**Status**: ALL FIXED

#### Fixed Issues:
1. ✅ Line 19: `c.is_finished as is_done` (was `c.is_done`)

#### Verified Correct:
- ✅ Line 17-21: All task columns (boardId, columnId, memberId, requesterId) - correct
- ✅ Line 42: `SELECT t.tag as name` - correct (aliasing `tag` to `name`)
- ✅ Line 43: `JOIN tags t ON tt.tagId = t.id` - correct

---

### ✅ server/jobs/achievements.js  
**Status**: ALL FIXED

#### Fixed Issues:
1. ✅ Line 28: `u.is_active = 1` (was `u.isActive`)

#### Verified Correct:
- ✅ Line 19: `m.name as user_name` - correct
- ✅ Line 27: `LEFT JOIN members m ON u.id = m.user_id` - correct

---

### ✅ server/services/reportingLogger.js
**Status**: VERIFIED CORRECT

#### Verified Correct:
- Uses helper functions to get info, doesn't directly query tables
- All column references go through `getUserInfo`, `getBoardInfo`, `getColumnInfo`
- These helpers use correct column names

---

### ✅ server/routes/tasks.js (reporting integration)
**Status**: ALL FIXED

#### Fixed Issues:
1. ✅ Lines 508, 691, 854: `SELECT title, is_finished as is_done FROM columns` (was `is_done`)

#### Verified Correct:
- ✅ Lines 106-107: `SELECT t.tag as name FROM task_tags tt` - correct
- ✅ Line 126: `tags: taskTags.map(t => t.name)` - correct (using alias)
- ✅ Line 263: `JOIN tags t ON tt.tagId = t.id` - correct
- ✅ Line 743: `tags.tag` - correct

---

## Summary

### Issues Found and Fixed: 8
1. ✅ `is_active` vs `isActive` - 3 occurrences fixed
2. ✅ `is_finished` vs `is_done` - 5 occurrences fixed

### Potential Future Issues (NOT broken, but watch for):
- ⚠️ Inconsistent naming convention (snake_case vs camelCase)
- ⚠️ `tags.tag` might be confusing (consider renaming to `tags.name` in future schema migration)
- ⚠️ Mixed `createdAt` (camelCase) vs `created_at` (snake_case) across tables

### Recommendations:
1. ✅ **DONE**: All current reporting queries now use correct column names
2. 📝 **Future**: Consider normalizing all columns to snake_case in a major version
3. 📝 **Future**: Add database schema validation tests
4. 📝 **Future**: Use TypeScript types generated from actual schema

---

## Testing Checklist

After restart, verify:
- ✅ Reports → My Stats (should show user name, not "Unknown")
- ✅ Reports → Leaderboard (should show correct total members)
- ✅ Admin → Reporting → Refresh Now (should complete without errors)
- ✅ Achievement cron job (check logs at top of hour)
- ✅ Task creation/update (should log to activity_events)

---

**Status**: 🎉 ALL COLUMN NAME ISSUES RESOLVED

