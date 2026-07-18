# SQL Manager Migration Plan: Centralized PostgreSQL Queries

## Overview

**Strategy**: Create a centralized `sqlManager.js` that contains all PostgreSQL-native queries as reusable functions. This eliminates SQL duplication, centralizes query logic, and makes maintenance easier.

**Estimated Effort**: 4-5 weeks (160-200 hours)  
**Risk Level**: Low-Medium  
**Complexity**: Medium

## Benefits of This Approach

1. **Single Source of Truth**: All SQL in one file
2. **Reusability**: Query functions can be reused across routes
3. **Easier Maintenance**: Update queries in one place
4. **Better Testing**: Can test SQL logic independently
5. **Type Safety**: Can add JSDoc/TypeScript for better IDE support
6. **Query Optimization**: Centralized place to optimize queries
7. **Query Monitoring**: Easy to add logging/monitoring to all queries
8. **Gradual Migration**: Can migrate route-by-route without breaking changes

## Current State Analysis

### Query Patterns Found
- **487 SQL query patterns** across **22 route files**
- Most common pattern: `db.prepare('SELECT ...').all()`
- Conditional SQL based on `isPostgresDatabase(db)` in 7 files
- Mix of simple queries and complex JOINs with JSON aggregation

### File Breakdown
| File | Query Count | Complexity | Priority |
|------|------------|------------|----------|
| `tasks.js` | 105 | Very High | 1 |
| `adminUsers.js` | 60 | High | 2 |
| `adminPortal.js` | 50 | High | 2 |
| `auth.js` | 31 | Medium | 3 |
| `priorities.js` | 24 | Medium | 3 |
| `taskRelations.js` | 24 | Medium | 3 |
| `boards.js` | 21 | High | 2 |
| `sprints.js` | 16 | Medium | 3 |
| `comments.js` | 16 | Medium | 3 |
| `adminSystem.js` | 16 | Low | 4 |
| `columns.js` | 17 | Medium | 3 |
| `reports.js` | 17 | High | 2 |
| `tags.js` | 13 | Low | 4 |
| `views.js` | 12 | Medium | 3 |
| `files.js` | 7 | Medium | 3 |
| `password-reset.js` | 7 | Low | 4 |
| `settings.js` | 8 | Low | 4 |
| `adminNotificationQueue.js` | 8 | Low | 4 |
| `members.js` | 4 | Low | 4 |
| `activity.js` | 2 | Low | 4 |
| `health.js` | 2 | Low | 4 |

## Phase 1: Assessment & Design (Week 1)
**Effort**: 30-40 hours

### 1.1 Complete Query Inventory (15-20 hours)

**Tasks**:
- [ ] Scan all route files for SQL queries
- [ ] Document each query with:
  - File location
  - Query purpose
  - Parameters used
  - Return type
  - Dependencies (JOINs, subqueries)
  - Complexity rating
- [ ] Identify duplicate/similar queries
- [ ] Group queries by domain (tasks, users, boards, etc.)
- [ ] Create query catalog spreadsheet/document

**Output**: 
- Complete inventory of all SQL queries
- Query categorization by domain
- Duplicate query analysis
- Complexity matrix

### 1.2 Design sqlManager API (10-15 hours)

**Design Decisions**:

#### Option A: Domain-Based Organization (Recommended)
```javascript
// server/utils/sqlManager.js
export const sqlManager = {
  tasks: {
    getById: (db, taskId) => { ... },
    getByTicket: (db, ticket) => { ... },
    getAll: (db, filters) => { ... },
    create: (db, taskData) => { ... },
    update: (db, taskId, updates) => { ... },
    delete: (db, taskId) => { ... },
    getWithRelationships: (db, taskId) => { ... },
    // ... more task queries
  },
  users: {
    getById: (db, userId) => { ... },
    getAll: (db) => { ... },
    // ... more user queries
  },
  boards: {
    // ... board queries
  },
  // ... other domains
};
```

#### Option B: Flat Organization
```javascript
// server/utils/sqlManager.js
export const sqlManager = {
  getTaskById: (db, taskId) => { ... },
  getTaskByTicket: (db, ticket) => { ... },
  getUserById: (db, userId) => { ... },
  // ... all queries flat
};
```

**Recommendation**: Option A (Domain-Based) for better organization

#### Function Signature Pattern
```javascript
/**
 * Get task by ID with all relationships
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @returns {Promise<Object|null>} Task object with relationships or null
 */
async function getTaskWithRelationships(db, taskId) {
  const query = `
    SELECT t.*, 
           p.id as "priorityId",
           p.priority as "priorityName",
           p.color as "priorityColor",
           COALESCE(json_agg(json_build_object(...)) FILTER (...), '[]'::json) as comments,
           ...
    FROM tasks t
    LEFT JOIN priorities p ON ...
    WHERE t.id = $1
    GROUP BY t.id, p.id
  `;
  
  const stmt = db.prepare(query);
  return await stmt.get(taskId);
}
```

**Key Design Principles**:
1. **Always async**: All functions return Promises
2. **PostgreSQL-native**: Use `$1, $2, $3` placeholders
3. **Consistent naming**: `get*`, `create*`, `update*`, `delete*`, `list*`
4. **Error handling**: Let errors bubble up (route handles them)
5. **Query logging**: Integrate with existing `wrapQuery` utility
6. **Type hints**: JSDoc comments for IDE support

### 1.3 Create sqlManager Structure (5-8 hours)

**File Structure**:
```
server/utils/sqlManager/
  ├── index.js              # Main export, organizes all domains
  ├── tasks.js              # All task-related queries
  ├── users.js              # All user-related queries
  ├── boards.js             # All board-related queries
  ├── columns.js             # All column-related queries
  ├── comments.js           # All comment-related queries
  ├── priorities.js          # All priority-related queries
  ├── tags.js               # All tag-related queries
  ├── members.js            # All member-related queries
  ├── sprints.js            # All sprint-related queries
  ├── reports.js            # All report-related queries
  ├── auth.js               # All auth-related queries
  └── common.js             # Shared query utilities/helpers
```

**Initial Setup**:
- [ ] Create directory structure
- [ ] Create index.js with domain exports
- [ ] Create placeholder files for each domain
- [ ] Set up JSDoc template
- [ ] Add query logging integration

## Phase 2: Build sqlManager (Week 2-3)
**Effort**: 60-80 hours

### 2.1 Migrate High-Priority Queries (40-50 hours)

**Priority Order**:
1. **Tasks domain** (20-25 hours) - Most complex, most queries
2. **Users domain** (8-10 hours) - High usage
3. **Boards domain** (6-8 hours) - High usage
4. **Reports domain** (6-8 hours) - Complex queries

#### Tasks Domain Example
```javascript
// server/utils/sqlManager/tasks.js
import { wrapQuery } from '../queryLogger.js';

/**
 * Get task by ID with all relationships (comments, watchers, collaborators, tags, attachments)
 */
export async function getTaskWithRelationships(db, taskId) {
  const query = `
    SELECT t.*, 
           p.id as "priorityId",
           p.priority as "priorityName",
           p.color as "priorityColor",
           CASE WHEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) > 0 
                THEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) 
                ELSE NULL END as attachmentCount,
           COALESCE(json_agg(json_build_object(
               'id', c.id,
               'text', c.text,
               'authorId', c.authorid,
               'createdAt', c.createdat
           )) FILTER (WHERE c.id IS NOT NULL), '[]'::json) as comments,
           COALESCE(json_agg(json_build_object(
               'id', tag.id,
               'tag', tag.tag,
               'description', tag.description,
               'color', tag.color
           )) FILTER (WHERE tag.id IS NOT NULL), '[]'::json) as tags,
           COALESCE(json_agg(json_build_object(
               'id', watcher.id,
               'name', watcher.name,
               'color', watcher.color
           )) FILTER (WHERE watcher.id IS NOT NULL), '[]'::json) as watchers,
           COALESCE(json_agg(json_build_object(
               'id', collaborator.id,
               'name', collaborator.name,
               'color', collaborator.color
           )) FILTER (WHERE collaborator.id IS NOT NULL), '[]'::json) as collaborators
    FROM tasks t
    LEFT JOIN comments c ON c.taskid = t.id
    LEFT JOIN task_tags tt ON tt.taskid = t.id
    LEFT JOIN tags tag ON tag.id = tt.tagid
    LEFT JOIN watchers w ON w.taskid = t.id
    LEFT JOIN members watcher ON watcher.id = w.memberid
    LEFT JOIN collaborators col ON col.taskid = t.id
    LEFT JOIN members collaborator ON collaborator.id = col.memberid
    LEFT JOIN attachments a ON a.taskid = t.id
    LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
    WHERE t.id = $1
    GROUP BY t.id, p.id
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(taskId);
}

/**
 * Get task by ticket number
 */
export async function getTaskByTicket(db, ticket) {
  const query = `
    SELECT t.*, 
           p.id as "priorityId",
           p.priority as "priorityName",
           p.color as "priorityColor",
           c.title as status
    FROM tasks t
    LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
    LEFT JOIN columns c ON c.id = t.columnId
    WHERE t.ticket = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(ticket);
}

/**
 * Get all tasks for a column with relationships
 */
export async function getTasksForColumn(db, columnId) {
  const query = `
    SELECT t.id, t.position, t.title, t.description, t.ticket, 
           t.memberid as "memberId", t.requesterid as "requesterId", 
           t.startdate as "startDate", t.duedate as "dueDate", 
           t.effort, t.priority, t.priority_id as "priority_id", 
           t.columnid as "columnId", t.boardid as "boardId", 
           t.sprint_id as "sprint_id", t.created_at, t.updated_at,
           p.id as "priorityId", p.priority as "priorityName", 
           p.color as "priorityColor",
           CASE WHEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) > 0 
                THEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) 
                ELSE NULL END as attachmentCount,
           COALESCE(json_agg(json_build_object(...)) FILTER (...), '[]'::json) as comments,
           COALESCE(json_agg(json_build_object(...)) FILTER (...), '[]'::json) as tags,
           COALESCE(json_agg(json_build_object(...)) FILTER (...), '[]'::json) as watchers,
           COALESCE(json_agg(json_build_object(...)) FILTER (...), '[]'::json) as collaborators
    FROM tasks t
    LEFT JOIN comments c ON c.taskid = t.id
    LEFT JOIN task_tags tt ON tt.taskid = t.id
    LEFT JOIN tags tag ON tag.id = tt.tagid
    LEFT JOIN watchers w ON w.taskid = t.id
    LEFT JOIN members watcher ON watcher.id = w.memberid
    LEFT JOIN collaborators col ON col.taskid = t.id
    LEFT JOIN members collaborator ON collaborator.id = col.memberid
    LEFT JOIN attachments a ON a.taskid = t.id
    LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
    WHERE t.columnid = $1
    GROUP BY t.id, p.id
    ORDER BY t.position ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(columnId);
}

/**
 * Create a new task
 */
export async function createTask(db, taskData) {
  const query = `
    INSERT INTO tasks (
      id, title, description, ticket, memberid, requesterid,
      startdate, duedate, effort, priority, priority_id,
      columnid, boardid, sprint_id, position, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
    ) RETURNING *
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  return await stmt.run(
    taskData.id,
    taskData.title,
    taskData.description,
    taskData.ticket,
    taskData.memberId,
    taskData.requesterId,
    taskData.startDate,
    taskData.dueDate,
    taskData.effort,
    taskData.priority,
    taskData.priorityId,
    taskData.columnId,
    taskData.boardId,
    taskData.sprintId,
    taskData.position,
    taskData.createdAt || new Date().toISOString(),
    taskData.updatedAt || new Date().toISOString()
  );
}

/**
 * Update task
 */
export async function updateTask(db, taskId, updates) {
  const setClauses = [];
  const values = [];
  let paramIndex = 1;
  
  // Build dynamic UPDATE query
  Object.entries(updates).forEach(([key, value]) => {
    setClauses.push(`${key} = $${paramIndex++}`);
    values.push(value);
  });
  
  values.push(taskId); // For WHERE clause
  
  const query = `
    UPDATE tasks 
    SET ${setClauses.join(', ')}, updated_at = $${paramIndex}
    WHERE id = $${paramIndex + 1}
    RETURNING *
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  return await stmt.run(...values, new Date().toISOString());
}

// ... more task query functions
```

**Tasks**:
- [ ] Convert all task queries to PostgreSQL-native
- [ ] Remove SQLite conditionals
- [ ] Add JSDoc comments
- [ ] Test each function independently
- [ ] Document parameters and return types

### 2.2 Migrate Medium-Priority Queries (20-30 hours)

**Domains**:
- Comments (4-5 hours)
- Columns (4-5 hours)
- Priorities (3-4 hours)
- Tags (2-3 hours)
- Members (2-3 hours)
- Sprints (4-5 hours)
- Task Relations (4-5 hours)

### 2.3 Create Common Utilities (5-8 hours)

**Common Helpers**:
```javascript
// server/utils/sqlManager/common.js

/**
 * Build WHERE clause with parameters
 */
export function buildWhereClause(conditions) {
  const clauses = [];
  const values = [];
  let paramIndex = 1;
  
  Object.entries(conditions).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      clauses.push(`${key} = $${paramIndex++}`);
      values.push(value);
    }
  });
  
  return {
    clause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    values
  };
}

/**
 * Build pagination clause
 */
export function buildPagination(limit, offset) {
  return {
    clause: `LIMIT $${limit} OFFSET $${offset}`,
    values: [limit, offset]
  };
}

/**
 * Convert camelCase to snake_case for column names
 */
export function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}
```

## Phase 3: Migrate Route Files (Week 3-4)
**Effort**: 50-60 hours

### 3.1 Migration Strategy

**For each route file**:
1. Import sqlManager functions
2. Replace `db.prepare(...)` with sqlManager function calls
3. Remove conditional SQL (`isPostgres` checks)
4. Update error handling if needed
5. Test the route
6. Remove old SQL code

**Example Migration**:

**Before**:
```javascript
// server/routes/tasks.js
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { id } = req.params;
    const isTicket = /^[A-Z]+-\d+$/i.test(id);
    
    const isPostgres = isPostgresDatabase(db);
    const task = isTicket 
      ? await wrapQuery(db.prepare(`
          SELECT t.*, p.id as priorityId, ...
          FROM tasks t
          LEFT JOIN priorities p ON ...
          WHERE t.ticket = ?
        `), 'SELECT').get(id)
      : await wrapQuery(db.prepare(`
          SELECT t.*, p.id as priorityId, ...
          FROM tasks t
          LEFT JOIN priorities p ON ...
          WHERE t.id = ?
        `), 'SELECT').get(id);
    
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});
```

**After**:
```javascript
// server/routes/tasks.js
import { getTaskByTicket, getTaskWithRelationships } from '../utils/sqlManager/tasks.js';

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { id } = req.params;
    const isTicket = /^[A-Z]+-\d+$/i.test(id);
    
    const task = isTicket 
      ? await getTaskByTicket(db, id)
      : await getTaskWithRelationships(db, id);
    
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});
```

### 3.2 Migration Order

**Week 3**:
- [ ] `tasks.js` (15-20 hours) - Most complex
- [ ] `adminUsers.js` (8-10 hours)
- [ ] `boards.js` (6-8 hours)

**Week 4**:
- [ ] `reports.js` (6-8 hours)
- [ ] `sprints.js` (4-5 hours)
- [ ] `comments.js` (4-5 hours)
- [ ] `columns.js` (4-5 hours)
- [ ] `priorities.js` (3-4 hours)
- [ ] `taskRelations.js` (4-5 hours)
- [ ] `auth.js` (4-5 hours)
- [ ] Remaining files (10-12 hours)

### 3.3 Testing Each Migration

**For each route file**:
- [ ] Test all endpoints
- [ ] Verify data format matches frontend expectations
- [ ] Test error cases
- [ ] Test edge cases (empty results, null values)
- [ ] Performance check (no regression)

## Phase 4: Cleanup & Optimization (Week 5)
**Effort**: 20-30 hours

### 4.1 Remove SQLite Code (5-8 hours)

**Files to update**:
- [ ] Remove `isPostgresDatabase()` checks (no longer needed)
- [ ] Remove `convertSqlToPostgres()` calls
- [ ] Remove SQLite-specific comments
- [ ] Update `dbAsync.js` (simplify, remove conditionals)
- [ ] Update migration system (remove SQLite conversion)

### 4.2 Optimize Queries (8-12 hours)

**Tasks**:
- [ ] Review slow queries (use EXPLAIN ANALYZE)
- [ ] Add missing indexes
- [ ] Optimize JOINs
- [ ] Use PostgreSQL-specific features (JSONB, arrays, etc.)
- [ ] Add query result caching where appropriate

### 4.3 Documentation (5-8 hours)

**Tasks**:
- [ ] Document sqlManager API
- [ ] Create query catalog
- [ ] Add usage examples
- [ ] Update route file documentation
- [ ] Create migration guide for future queries

### 4.4 Final Testing (2-3 hours)

**Tasks**:
- [ ] Full integration test
- [ ] Performance benchmark
- [ ] Load testing
- [ ] Multi-tenant testing

## sqlManager API Design

### Domain Organization

```javascript
// server/utils/sqlManager/index.js
import * as tasks from './tasks.js';
import * as users from './users.js';
import * as boards from './boards.js';
// ... other domains

export const sqlManager = {
  tasks,
  users,
  boards,
  columns,
  comments,
  priorities,
  tags,
  members,
  sprints,
  reports,
  auth,
  // ... other domains
};

export default sqlManager;
```

### Function Naming Conventions

- **Get single**: `getTaskById`, `getUserById`
- **Get by criteria**: `getTaskByTicket`, `getUserByEmail`
- **Get with relationships**: `getTaskWithRelationships`, `getBoardWithColumns`
- **List all**: `getAllTasks`, `getAllUsers`
- **List filtered**: `getTasksByColumn`, `getUsersByRole`
- **Create**: `createTask`, `createUser`
- **Update**: `updateTask`, `updateUser`
- **Delete**: `deleteTask`, `deleteUser`
- **Count**: `countTasks`, `countUsers`

### Error Handling

**Strategy**: Let errors bubble up to route handlers
- sqlManager functions don't catch errors
- Route handlers handle errors and return appropriate HTTP responses
- Can add error logging in sqlManager if needed

### Query Logging

**Integration with existing system**:
```javascript
import { wrapQuery } from '../queryLogger.js';

export async function getTaskById(db, taskId) {
  const query = `SELECT * FROM tasks WHERE id = $1`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(taskId);
}
```

## Migration Checklist

### Pre-Migration
- [ ] Complete query inventory
- [ ] Design sqlManager API
- [ ] Create directory structure
- [ ] Set up testing framework

### During Migration
- [ ] Build sqlManager with all queries
- [ ] Migrate route files one by one
- [ ] Test each migration
- [ ] Document as you go

### Post-Migration
- [ ] Remove SQLite code
- [ ] Optimize queries
- [ ] Update documentation
- [ ] Final testing
- [ ] Performance validation

## Risk Mitigation

### Risk 1: Breaking Changes During Migration
**Mitigation**: 
- Migrate one route file at a time
- Test thoroughly before moving to next
- Keep old code until new code is verified

### Risk 2: Query Performance Regression
**Mitigation**:
- Benchmark before/after
- Use EXPLAIN ANALYZE to verify query plans
- Optimize as needed

### Risk 3: Missing Edge Cases
**Mitigation**:
- Comprehensive testing
- Review all query parameters
- Test with real data

## Timeline Summary

| Phase | Duration | Effort | Key Deliverables |
|-------|----------|--------|-----------------|
| **Phase 1: Assessment** | Week 1 | 30-40h | Query inventory, API design |
| **Phase 2: Build sqlManager** | Week 2-3 | 60-80h | Complete sqlManager with all queries |
| **Phase 3: Migrate Routes** | Week 3-4 | 50-60h | All route files using sqlManager |
| **Phase 4: Cleanup** | Week 5 | 20-30h | Remove SQLite code, optimize, document |
| **Total** | **5 weeks** | **160-210h** | PostgreSQL-only codebase |

## Success Criteria

- [ ] All SQL queries centralized in sqlManager
- [ ] No SQL queries in route files
- [ ] No SQLite-specific code
- [ ] All routes tested and working
- [ ] Performance maintained or improved
- [ ] Documentation complete
- [ ] Code review passed

## Next Steps

1. **Review and approve this plan**
2. **Start Phase 1**: Complete query inventory
3. **Design sqlManager API** based on inventory
4. **Begin building sqlManager** with high-priority domains
5. **Migrate routes gradually** with thorough testing

## Example: Complete sqlManager File Structure

```
server/utils/sqlManager/
├── index.js
├── tasks.js          (105 queries → ~50 functions)
├── users.js          (60 queries → ~30 functions)
├── boards.js         (21 queries → ~15 functions)
├── columns.js        (17 queries → ~12 functions)
├── comments.js       (16 queries → ~10 functions)
├── priorities.js     (24 queries → ~15 functions)
├── tags.js           (13 queries → ~8 functions)
├── members.js        (4 queries → ~5 functions)
├── sprints.js        (16 queries → ~12 functions)
├── reports.js        (17 queries → ~15 functions)
├── auth.js           (31 queries → ~20 functions)
├── taskRelations.js  (24 queries → ~15 functions)
├── views.js          (12 queries → ~8 functions)
├── files.js          (7 queries → ~5 functions)
├── settings.js       (8 queries → ~5 functions)
├── adminUsers.js     (60 queries → ~30 functions)
├── adminPortal.js    (50 queries → ~25 functions)
├── adminSystem.js    (16 queries → ~10 functions)
├── adminNotificationQueue.js (8 queries → ~5 functions)
├── activity.js        (2 queries → ~2 functions)
├── health.js         (2 queries → ~2 functions)
└── common.js         (shared utilities)
```

**Total**: ~487 queries → ~300-350 reusable functions

