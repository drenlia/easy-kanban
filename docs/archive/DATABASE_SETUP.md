# Database Setup and Migration Status

## Current Database Type

**You are using PostgreSQL** (not SQLite).

The database type is determined by the `DB_TYPE` environment variable:
- `DB_TYPE=postgresql` → PostgreSQL (current setup)
- Not set or other value → SQLite

## Schema Definition Location

The database schema is defined in **`server/config/database.js`** in the `CREATE_TABLES_SQL` constant. This is a SQLite-style schema definition that gets converted to PostgreSQL when `DB_TYPE=postgresql`.

## How PostgreSQL Schema is Created

1. **Schema Definition**: `CREATE_TABLES_SQL` in `database.js` defines tables with camelCase column names:
   - `boardId`, `columnId`, `taskId`, `memberId`, `requesterId`, `startDate`, `dueDate`, etc.

2. **PostgreSQL Conversion**: When using PostgreSQL:
   - `convertSqliteToPostgres()` in `database.js` converts SQLite syntax (DATETIME → TIMESTAMPTZ, etc.)
   - `PostgresDatabase.convertSqliteToPostgres()` converts camelCase identifiers to lowercase
   - **CRITICAL**: PostgreSQL lowercases unquoted identifiers automatically

3. **Actual Column Names in PostgreSQL**:
   - `boardId` → `boardid` (lowercase)
   - `columnId` → `columnid` (lowercase)
   - `taskId` → `taskid` (lowercase)
   - `memberId` → `memberid` (lowercase)
   - `requesterId` → `requesterid` (lowercase)
   - `startDate` → `startdate` (lowercase)
   - `dueDate` → `duedate` (lowercase)
   - `is_finished` → `is_finished` (snake_case stays as-is)
   - `is_archived` → `is_archived` (snake_case stays as-is)

## Migration Status

### ✅ Fully Migrated to sqlManager (PostgreSQL-native queries)

1. **Tasks Domain** - 100% Complete
   - All queries in `server/utils/sqlManager/tasks.js`
   - All routes in `server/routes/tasks.js` use sqlManager

2. **Boards Domain** - 100% Complete
   - All queries in `server/utils/sqlManager/boards.js`
   - All routes in `server/routes/boards.js` use sqlManager

3. **Columns Domain** - 100% Complete
   - All queries in `server/utils/sqlManager/helpers.js`
   - All routes in `server/routes/columns.js` use sqlManager

4. **Comments Domain** - 100% Complete
   - All queries in `server/utils/sqlManager/comments.js`
   - All routes in `server/routes/comments.js` use sqlManager

### ⚠️ Partially Migrated

- **Task Relations** - Partially done (relationships are migrated, tags/attachments may need work)

### ❌ Not Yet Migrated

- Users/Admin Users
- Sprints
- Priorities (helpers done, routes may need migration)
- Reports
- Settings
- Files
- Activity
- Health

## Query Writing Guidelines

### For PostgreSQL (Current Setup)

1. **Use lowercase column names** in queries:
   ```sql
   SELECT t.boardid, t.columnid, t.taskid
   FROM tasks t
   WHERE t.boardid = $1
   ```

2. **Use SQL aliases to return camelCase** to the frontend:
   ```sql
   SELECT 
     t.boardid as "boardId",
     t.columnid as "columnId",
     t.taskid as "taskId"
   FROM tasks t
   WHERE t.boardid = $1
   ```

3. **Use PostgreSQL syntax**:
   - Parameter placeholders: `$1`, `$2`, `$3` (not `?`)
   - JSON functions: `json_agg()`, `json_build_object()`
   - Boolean values: `true`/`false` (not `1`/`0`)

### Example: Correct Query Pattern

```sql
SELECT 
  tr.id,
  tr.task_id as "taskId",
  tr.relationship,
  tr.to_task_id as "toTaskId",
  tr.created_at as "createdAt"
FROM task_rels tr
JOIN tasks t1 ON tr.task_id = t1.id
JOIN tasks t2 ON tr.to_task_id = t2.id
WHERE t1.boardid = $1 AND t2.boardid = $1
ORDER BY tr.created_at DESC
```

**Key Points**:
- `t1.boardid` (lowercase) - matches PostgreSQL column name
- `"taskId"` (quoted alias) - returns camelCase to frontend
- `$1` - PostgreSQL parameter placeholder

## Verifying Column Names

To verify actual column names in PostgreSQL, you can run:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tasks' 
ORDER BY ordinal_position;
```

## Summary

- **Database**: PostgreSQL (via `DB_TYPE=postgresql`)
- **Schema Source**: `server/config/database.js` → `CREATE_TABLES_SQL`
- **Column Names in DB**: Lowercase (`boardid`, `columnid`, `taskid`)
- **Column Names in API**: CamelCase (`boardId`, `columnId`, `taskId`) via SQL aliases
- **Migration Status**: Tasks, Boards, Columns, Comments = 100% migrated to sqlManager
- **Query Pattern**: Use lowercase in WHERE/JOIN, alias to camelCase in SELECT

