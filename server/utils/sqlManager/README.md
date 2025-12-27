# SQL Manager - Proof of Concept

This is a proof-of-concept implementation of a centralized SQL query manager for PostgreSQL.

## Structure

```
server/utils/sqlManager/
├── index.js          # Main export, organizes all domains
├── tasks.js          # Task-related queries (proof-of-concept)
└── README.md         # This file
```

## Current Status

✅ **Tasks Domain** - Proof-of-concept complete with:
- `getTaskWithRelationships()` - Get task with all relationships
- `getTaskByTicket()` - Get task by ticket number
- `getTaskById()` - Get simple task by ID
- `getTasksForColumn()` - Get all tasks for a column
- `getAllTasks()` - Get all tasks
- `createTask()` - Create a new task
- `updateTask()` - Update a task
- `deleteTask()` - Delete a task
- `getTaskTicket()` - Get ticket by task ID
- `generateTaskTicket()` - Generate next ticket number
- `incrementTaskPositions()` - Increment positions in column
- `getTasksByIds()` - Get multiple tasks by IDs

## Usage

```javascript
import { tasks } from '../utils/sqlManager/index.js';

// Get task with all relationships
const task = await tasks.getTaskWithRelationships(db, taskId);

// Create a task
const result = await tasks.createTask(db, {
  id: 'uuid',
  title: 'Task Title',
  columnId: 'column-id',
  boardId: 'board-id',
  // ... other fields
});

// Update a task
await tasks.updateTask(db, taskId, {
  title: 'New Title',
  description: 'New Description',
  // ... only include changed fields
});
```

## Design Principles

1. **PostgreSQL-Native**: All queries use PostgreSQL syntax (`$1, $2, $3` placeholders, `json_agg`, etc.)
2. **No SQLite Conditionals**: No `isPostgresDatabase()` checks needed
3. **Reusable**: Functions can be used across multiple route files
4. **Well-Documented**: JSDoc comments for IDE support
5. **Query Logging**: Integrated with existing `wrapQuery` utility

## Next Steps

1. Test the proof-of-concept with a real route
2. Add more query functions as needed
3. Create sqlManager files for other domains:
   - `users.js`
   - `boards.js`
   - `columns.js`
   - `comments.js`
   - `priorities.js`
   - etc.
4. Gradually migrate all routes to use sqlManager

## Testing

To test the proof-of-concept:

1. Import sqlManager in a route file:
   ```javascript
   import { tasks } from '../utils/sqlManager/index.js';
   ```

2. Replace existing SQL queries with sqlManager function calls

3. Test the route to ensure it works correctly

4. Compare results with the old implementation to ensure compatibility

## Benefits

- ✅ **Single Source of Truth**: All SQL in one place
- ✅ **Reusability**: Query functions can be reused
- ✅ **Maintainability**: Update queries in one place
- ✅ **Type Safety**: JSDoc provides IDE autocomplete
- ✅ **Testing**: Can test SQL logic independently
- ✅ **No Conditionals**: PostgreSQL-only, cleaner code

