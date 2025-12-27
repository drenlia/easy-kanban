# SQL Manager Usage Examples

This document shows how to use the sqlManager proof-of-concept in route files.

## Basic Usage

### Before (Current Approach)

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
          SELECT t.*, 
                 p.id as priorityId,
                 p.priority as priorityName,
                 p.color as priorityColor,
                 c.title as status,
                 CASE WHEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) > 0 
                      THEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) 
                      ELSE NULL END as attachmentCount
          FROM tasks t
          LEFT JOIN attachments a ON a.taskId = t.id
          LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
          LEFT JOIN columns c ON c.id = t.columnId
          WHERE t.ticket = ?
          GROUP BY t.id, p.id, c.id
        `), 'SELECT').get(id)
      : await wrapQuery(db.prepare(`
          SELECT t.*, 
                 p.id as priorityId,
                 p.priority as priorityName,
                 p.color as priorityColor,
                 c.title as status,
                 CASE WHEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) > 0 
                      THEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) 
                      ELSE NULL END as attachmentCount
          FROM tasks t
          LEFT JOIN attachments a ON a.taskId = t.id
          LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
          LEFT JOIN columns c ON c.id = t.columnId
          WHERE t.id = ?
          GROUP BY t.id, p.id, c.id
        `), 'SELECT').get(id);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});
```

### After (Using sqlManager)

```javascript
// server/routes/tasks.js
import { tasks } from '../utils/sqlManager/index.js';

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { id } = req.params;
    const isTicket = /^[A-Z]+-\d+$/i.test(id);
    
    // Much cleaner! No SQL in route file, no conditional logic
    const task = isTicket 
      ? await tasks.getTaskByTicket(db, id)
      : await tasks.getTaskWithRelationships(db, id);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});
```

## Creating a Task

### Before

```javascript
await wrapQuery(db.prepare(`
  INSERT INTO tasks (id, title, description, ticket, memberId, requesterId, startDate, dueDate, effort, priority, priority_id, columnId, boardId, position, sprint_id, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`), 'INSERT').run(
  task.id, task.title, task.description || '', ticket, task.memberId, task.requesterId,
  task.startDate, dueDate, task.effort, priorityName, priorityId, task.columnId, task.boardId, task.position || 0, task.sprintId || null, now, now
);
```

### After

```javascript
import { tasks } from '../utils/sqlManager/index.js';

const result = await tasks.createTask(db, {
  id: task.id,
  title: task.title,
  description: task.description || '',
  ticket: ticket,
  memberId: task.memberId,
  requesterId: task.requesterId,
  startDate: task.startDate,
  dueDate: dueDate,
  effort: task.effort,
  priority: priorityName,
  priorityId: priorityId,
  columnId: task.columnId,
  boardId: task.boardId,
  position: task.position || 0,
  sprintId: task.sprintId || null
});
```

## Updating a Task

### Before

```javascript
await wrapQuery(db.prepare(`
  UPDATE tasks SET title = ?, description = ?, memberId = ?, requesterId = ?, startDate = ?, 
  dueDate = ?, effort = ?, priority = ?, priority_id = ?, columnId = ?, boardId = ?, position = ?, 
  sprint_id = ?, pre_boardId = ?, pre_columnId = ?, updated_at = ? WHERE id = ?
`), 'UPDATE').run(
  task.title, task.description, task.memberId, task.requesterId, task.startDate,
  task.dueDate, task.effort, priorityName, priorityId, task.columnId, task.boardId, task.position,
  task.sprintId, task.pre_boardId, task.pre_columnId, now, id
);
```

### After

```javascript
import { tasks } from '../utils/sqlManager/index.js';

const result = await tasks.updateTask(db, id, {
  title: task.title,
  description: task.description,
  memberId: task.memberId,
  requesterId: task.requesterId,
  startDate: task.startDate,
  dueDate: task.dueDate,
  effort: task.effort,
  priority: priorityName,
  priorityId: priorityId,
  columnId: task.columnId,
  boardId: task.boardId,
  position: task.position,
  sprintId: task.sprintId,
  pre_boardId: task.pre_boardId,
  pre_columnId: task.pre_columnId
});
```

## Getting Tasks for a Column

### Before

```javascript
const tasks = await wrapQuery(db.prepare(`
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
         ...
  FROM tasks t
  LEFT JOIN comments c ON c.taskid = t.id
  ...
  WHERE t.columnid = $1
  GROUP BY t.id, p.id
  ORDER BY t.position ASC
`), 'SELECT').all(columnId);
```

### After

```javascript
import { tasks } from '../utils/sqlManager/index.js';

const tasks = await tasks.getTasksForColumn(db, columnId);
```

## Benefits

1. **Cleaner Route Files**: No SQL in route files, just function calls
2. **Reusability**: Same query functions can be used across multiple routes
3. **Maintainability**: Update SQL in one place (sqlManager)
4. **Type Safety**: JSDoc provides IDE autocomplete and type hints
5. **Testing**: Can test SQL logic independently
6. **No Conditionals**: PostgreSQL-only, no `isPostgres` checks needed

## Migration Strategy

1. **Start with one route**: Migrate `GET /api/tasks/:id` first
2. **Test thoroughly**: Ensure it works exactly like before
3. **Gradually expand**: Migrate more routes one by one
4. **Remove old code**: Once all routes are migrated, remove old SQL

## Next Steps

1. Test the proof-of-concept with a real route
2. Add more query functions as needed
3. Create sqlManager files for other domains (users, boards, etc.)
4. Gradually migrate all routes to use sqlManager

