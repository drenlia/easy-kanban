# Field Naming Reference for SQL Manager Migration

## Critical Understanding

### PostgreSQL Behavior
- **PostgreSQL automatically lowercases unquoted identifiers**
- `boardId` in SQLite schema → `boardid` in PostgreSQL
- `is_finished` in SQLite schema → `is_finished` in PostgreSQL (snake_case stays as-is)

### Query Pattern
- **In WHERE/JOIN clauses**: Use lowercase (`boardid`, `columnid`, `taskid`)
- **In SELECT**: Use SQL aliases to return camelCase (`boardid as "boardId"`)
- **Parameter placeholders**: Use PostgreSQL syntax (`$1`, `$2`, `$3`)

## Table Field Mapping

### Tables with camelCase Fields (become lowercase in PostgreSQL)

#### `tasks` table
- `boardId` → `boardid`
- `columnId` → `columnid`
- `memberId` → `memberid`
- `requesterId` → `requesterid`
- `startDate` → `startdate`
- `dueDate` → `duedate`
- `sprint_id` → `sprint_id` (snake_case, stays as-is)
- `priority_id` → `priority_id` (snake_case, stays as-is)
- `pre_boardId` → `pre_boardid`
- `pre_columnId` → `pre_columnid`

#### `columns` table
- `boardId` → `boardid`
- `is_finished` → `is_finished` (snake_case, stays as-is)
- `is_archived` → `is_archived` (snake_case, stays as-is)

#### `comments` table
- `taskId` → `taskid`
- `authorId` → `authorid`
- `createdAt` → `createdat`

#### `attachments` table
- `taskId` → `taskid`
- `commentId` → `commentid`

#### `task_tags` table
- `taskId` → `taskid`
- `tagId` → `tagid`

#### `watchers` table
- `taskId` → `taskid`
- `memberId` → `memberid`
- `createdAt` → `createdat`

#### `collaborators` table
- `taskId` → `taskid`
- `memberId` → `memberid`
- `createdAt` → `createdat`

#### `activity` table
- `userId` → `userid`
- `taskId` → `taskid`
- `columnId` → `columnid`
- `boardId` → `boardid`
- `tagId` → `tagid`
- `commentId` → `commentid`

#### `views` table
- `filterName` → `filtername`
- `userId` → `userid`
- `dateFromFilter` → `datefromfilter`
- `dateToFilter` → `datetofilter`
- `dueDateFromFilter` → `duedatefromfilter`
- `dueDateToFilter` → `duedatetofilter`
- `memberFilters` → `memberfilters`
- `priorityFilters` → `priorityfilters`
- `tagFilters` → `tagfilters`
- `projectFilter` → `projectfilter`
- `taskFilter` → `taskfilter`
- `boardColumnFilter` → `boardcolumnfilter`

#### `user_settings` table
- `userId` → `userid`

### Tables with snake_case Fields (stay as-is in PostgreSQL)

#### `users` table
- `user_id` → `user_id`
- `first_name` → `first_name`
- `last_name` → `last_name`
- `password_hash` → `password_hash`
- `avatar_path` → `avatar_path`
- `auth_provider` → `auth_provider`
- `google_avatar_url` → `google_avatar_url`
- `is_active` → `is_active`
- `force_logout` → `force_logout`
- `deactivated_at` → `deactivated_at`
- `deactivated_by` → `deactivated_by`
- `created_at` → `created_at`
- `updated_at` → `updated_at`

#### `members` table
- `user_id` → `user_id`
- `created_at` → `created_at`
- `updated_at` → `updated_at`

#### `user_roles` table
- `user_id` → `user_id`
- `role_id` → `role_id`
- `created_at` → `created_at`
- `updated_at` → `updated_at`

#### `user_invitations` table
- `user_id` → `user_id`
- `expires_at` → `expires_at`
- `used_at` → `used_at`
- `created_at` → `created_at`

#### `password_reset_tokens` table
- `user_id` → `user_id`
- `expires_at` → `expires_at`
- `created_at` → `created_at`

#### `roles` table
- `created_at` → `created_at`
- `updated_at` → `updated_at`

#### `boards` table
- `created_at` → `created_at`
- `updated_at` → `updated_at`

#### `tags` table
- `created_at` → `created_at`
- `updated_at` → `updated_at`

#### `priorities` table
- `created_at` → `created_at`
- `updated_at` → `updated_at`

#### `settings` table
- `updated_at` → `updated_at`

#### `task_rels` table
- `task_id` → `task_id`
- `to_task_id` → `to_task_id`
- `created_at` → `created_at`
- `updated_at` → `updated_at`

#### `planning_periods` table (sprints)
- `start_date` → `start_date`
- `end_date` → `end_date`
- `is_active` → `is_active`
- `board_id` → `board_id`
- `created_by` → `created_by`
- `created_at` → `created_at`
- `updated_at` → `updated_at`

#### Reporting tables (all snake_case)
- `activity_events`: `user_id`, `task_id`, `board_id`, `column_id`, etc.
- `task_snapshots`: `task_id`, `board_id`, `column_id`, `assignee_id`, etc.
- `user_achievements`: `user_id`, `badge_id`, etc.
- `user_points`: `user_id`, etc.
- `badges`: `is_active`, `created_at`
- `notification_queue`: `user_id`, `task_id`, `scheduled_send_time`, etc.

## Example Query Patterns

### Correct Pattern (PostgreSQL)
```sql
-- Use lowercase in WHERE/JOIN
SELECT 
  t.id,
  t.boardid as "boardId",
  t.columnid as "columnId",
  t.memberid as "memberId",
  t.startdate as "startDate",
  t.duedate as "dueDate"
FROM tasks t
WHERE t.boardid = $1 AND t.columnid = $2
```

### Incorrect Pattern (Will Fail)
```sql
-- DON'T use camelCase in WHERE/JOIN
SELECT * FROM tasks WHERE boardId = $1  -- ❌ Should be boardid
```

## Migration Checklist

When migrating a route:
1. ✅ Identify all table field names (check schema)
2. ✅ Convert camelCase to lowercase for WHERE/JOIN clauses
3. ✅ Use SQL aliases (`as "camelCase"`) in SELECT statements
4. ✅ Use PostgreSQL parameter placeholders (`$1`, `$2`, `$3`)
5. ✅ Test with PostgreSQL database
6. ✅ Verify camelCase is returned to frontend

