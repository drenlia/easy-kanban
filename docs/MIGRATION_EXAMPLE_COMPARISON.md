# Migration Example: GET /api/tasks/:id

This document shows a side-by-side comparison of the route before and after migrating to sqlManager.

## Before Migration (Original Code)

```javascript
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { id } = req.params;
    
    console.log('🔍 [TASK API] Getting task by ID:', { id, url: req.url });
    
    // Check if the ID looks like a ticket (e.g., TASK-00032) or a UUID
    const isTicket = /^[A-Z]+-\d+$/i.test(id);
    console.log('🔍 [TASK API] ID type detection:', { id, isTicket });
    
    // Get task with attachment count and priority info
    // Use separate prepared statements to avoid SQL injection
    // Join on priority_id (preferred) or fallback to priority name for backward compatibility
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
      console.log('❌ [TASK API] Task not found for ID:', id);
      const t = await getTranslator(db);
      return res.status(404).json({ error: t('errors.taskNotFound') });
    }
    
    console.log('✅ [TASK API] Found task:', { 
      id: task.id, 
      title: task.title, 
      priorityId: task.priorityId,
      status: task.status 
    });
    
    // Get comments for the task
    const comments = await wrapQuery(db.prepare(`
      SELECT c.*, 
             m.name as authorName,
             m.color as authorColor
      FROM comments c
      LEFT JOIN members m ON c.authorId = m.id
      WHERE c.taskId = ?
      ORDER BY c.createdAt ASC
    `), 'SELECT').all(task.id);
    console.log('📝 [TASK API] Found comments:', comments.length);
    
    // Get attachments for all comments in one batch query (fixes N+1 problem)
    if (comments.length > 0) {
      const commentIds = comments.map(c => c.id).filter(Boolean);
      if (commentIds.length > 0) {
        const placeholders = commentIds.map(() => '?').join(',');
        const allAttachments = await wrapQuery(db.prepare(`
          SELECT commentId, id, name, url, type, size, created_at as createdAt
          FROM attachments
          WHERE commentId IN (${placeholders})
        `), 'SELECT').all(...commentIds);
        
        // Group attachments by commentId
        const attachmentsByCommentId = new Map();
        allAttachments.forEach(att => {
          if (!attachmentsByCommentId.has(att.commentId)) {
            attachmentsByCommentId.set(att.commentId, []);
          }
          attachmentsByCommentId.get(att.commentId).push(att);
        });
        
        // Assign attachments to each comment
        comments.forEach(comment => {
          comment.attachments = attachmentsByCommentId.get(comment.id) || [];
        });
      }
    }
    
    // Get watchers for the task
    const watchers = await wrapQuery(db.prepare(`
      SELECT m.* 
      FROM watchers w
      JOIN members m ON w.memberId = m.id
      WHERE w.taskId = ?
    `), 'SELECT').all(task.id);
    console.log('👀 [TASK API] Found watchers:', watchers.length);
    
    // Get collaborators for the task
    const collaborators = await wrapQuery(db.prepare(`
      SELECT m.* 
      FROM collaborators c
      JOIN members m ON c.memberId = m.id
      WHERE c.taskId = ?
    `), 'SELECT').all(task.id);
    console.log('🤝 [TASK API] Found collaborators:', collaborators.length);
    
    // Get tags for the task
    const tags = await wrapQuery(db.prepare(`
      SELECT t.* 
      FROM task_tags tt
      JOIN tags t ON tt.tagId = t.id
      WHERE tt.taskId = ?
    `), 'SELECT').all(task.id);
    console.log('🏷️ [TASK API] Found tags:', tags.length);
    
    // Add all related data to task
    task.comments = comments || [];
    task.watchers = watchers || [];
    task.collaborators = collaborators || [];
    task.tags = tags || [];
    
    // Convert snake_case to camelCase for frontend
    const taskResponse = {
      ...task,
      priority: task.priorityName || null,
      priorityId: task.priorityId || null,
      priorityName: task.priorityName || null,
      priorityColor: task.priorityColor || null,
      sprintId: task.sprint_id || null,
      createdAt: task.created_at,
      updatedAt: task.updated_at
    };
    
    console.log('📦 [TASK API] Final task data:', {
      id: taskResponse.id,
      title: taskResponse.title,
      commentsCount: taskResponse.comments.length,
      watchersCount: taskResponse.watchers.length,
      collaboratorsCount: taskResponse.collaborators.length,
      tagsCount: taskResponse.tags.length,
      priority: taskResponse.priority,
      priorityId: taskResponse.priorityId,
      status: taskResponse.status,
      sprintId: taskResponse.sprintId
    });
    
    res.json(taskResponse);
  } catch (error) {
    console.error('❌ [TASK API] Error fetching task:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToFetchTask') });
  }
});
```

**Lines of Code**: ~150 lines  
**SQL Queries**: 6 separate queries  
**Complexity**: High (SQL mixed with business logic)

---

## After Migration (Using sqlManager)

```javascript
// NEW: Import sqlManager
import { tasks as taskQueries } from '../utils/sqlManager/index.js';

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { id } = req.params;
    
    console.log('🔍 [TASK API] Getting task by ID:', { id, url: req.url });
    
    // Check if the ID looks like a ticket (e.g., TASK-00032) or a UUID
    const isTicket = /^[A-Z]+-\d+$/i.test(id);
    console.log('🔍 [TASK API] ID type detection:', { id, isTicket });
    
    // MIGRATED: Use sqlManager instead of inline SQL
    // This replaces ~30 lines of SQL with a single function call
    const task = isTicket 
      ? await taskQueries.getTaskByTicket(db, id)
      : await taskQueries.getTaskWithRelationships(db, id);
    
    if (!task) {
      console.log('❌ [TASK API] Task not found for ID:', id);
      const t = await getTranslator(db);
      return res.status(404).json({ error: t('errors.taskNotFound') });
    }
    
    console.log('✅ [TASK API] Found task:', { 
      id: task.id, 
      title: task.title, 
      priorityId: task.priorityId,
      status: task.status 
    });
    
    // NOTE: getTaskWithRelationships already includes comments, watchers, collaborators, and tags
    // However, it doesn't include attachments for comments, so we still need to fetch those separately
    // TODO: Add getCommentAttachments() to sqlManager/comments.js in the future
    
    // Get attachments for comments (if any)
    if (task.comments && task.comments.length > 0) {
      const commentIds = task.comments.map(c => c.id).filter(Boolean);
      if (commentIds.length > 0) {
        // For now, keep this query inline - can be moved to sqlManager/comments.js later
        const placeholders = commentIds.map((_, i) => `$${i + 1}`).join(',');
        const allAttachments = await wrapQuery(db.prepare(`
          SELECT commentId, id, name, url, type, size, created_at as createdAt
          FROM attachments
          WHERE commentId IN (${placeholders})
        `), 'SELECT').all(...commentIds);
        
        // Group attachments by commentId
        const attachmentsByCommentId = new Map();
        allAttachments.forEach(att => {
          if (!attachmentsByCommentId.has(att.commentId)) {
            attachmentsByCommentId.set(att.commentId, []);
          }
          attachmentsByCommentId.get(att.commentId).push(att);
        });
        
        // Assign attachments to each comment
        task.comments.forEach(comment => {
          comment.attachments = attachmentsByCommentId.get(comment.id) || [];
        });
      }
    }
    
    // Convert snake_case to camelCase for frontend
    const taskResponse = {
      ...task,
      priority: task.priorityName || null,
      priorityId: task.priorityId || null,
      priorityName: task.priorityName || null,
      priorityColor: task.priorityColor || null,
      sprintId: task.sprint_id || null,
      createdAt: task.created_at,
      updatedAt: task.updated_at
    };
    
    console.log('📦 [TASK API] Final task data:', {
      id: taskResponse.id,
      title: taskResponse.title,
      commentsCount: taskResponse.comments?.length || 0,
      watchersCount: taskResponse.watchers?.length || 0,
      collaboratorsCount: taskResponse.collaborators?.length || 0,
      tagsCount: taskResponse.tags?.length || 0,
      priority: taskResponse.priority,
      priorityId: taskResponse.priorityId,
      status: taskResponse.status,
      sprintId: taskResponse.sprintId
    });
    
    res.json(taskResponse);
  } catch (error) {
    console.error('❌ [TASK API] Error fetching task:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToFetchTask') });
  }
});
```

**Lines of Code**: ~90 lines (40% reduction!)  
**SQL Queries**: 1 main query + 1 comment attachments query  
**Complexity**: Low (business logic only, SQL abstracted away)

---

## Key Improvements

### 1. **Code Reduction**
- **Before**: ~150 lines
- **After**: ~90 lines
- **Reduction**: 40% fewer lines

### 2. **Query Consolidation**
- **Before**: 6 separate queries (task, comments, attachments, watchers, collaborators, tags)
- **After**: 1 main query (getTaskWithRelationships) + 1 comment attachments query
- **Benefit**: Fewer database round trips, better performance

### 3. **SQL Abstraction**
- **Before**: SQL mixed with business logic in route file
- **After**: SQL in sqlManager, route file only has business logic
- **Benefit**: Easier to read, maintain, and test

### 4. **Reusability**
- **Before**: SQL queries duplicated if used in multiple routes
- **After**: `getTaskWithRelationships()` can be reused anywhere
- **Benefit**: Single source of truth, easier updates

### 5. **No SQLite Conditionals**
- **Before**: Would need `isPostgresDatabase()` checks if supporting both
- **After**: PostgreSQL-native, no conditionals needed
- **Benefit**: Cleaner code, better performance

### 6. **Better Error Handling**
- **Before**: SQL errors mixed with route logic
- **After**: SQL errors handled in sqlManager, route handles HTTP responses
- **Benefit**: Clearer separation of concerns

## What's Still Inline?

The comment attachments query is still inline because:
1. It's a specialized query (attachments for multiple comments)
2. It's not yet in sqlManager (can be added later)
3. It's a good example of gradual migration

**Future Improvement**: Create `sqlManager/comments.js` with:
```javascript
export async function getAttachmentsForComments(db, commentIds) {
  // ... query implementation
}
```

## Testing Checklist

When migrating this route, test:

- [ ] Get task by UUID
- [ ] Get task by ticket number
- [ ] Task with no relationships (no comments, watchers, etc.)
- [ ] Task with all relationships
- [ ] Task with comment attachments
- [ ] Task not found (404)
- [ ] Database error handling
- [ ] Response format matches frontend expectations
- [ ] Performance (should be same or better)

## Next Steps

1. **Test the migrated route** in a development environment
2. **Compare responses** with original implementation
3. **Verify performance** (should be same or better due to fewer queries)
4. **Add comment attachments** to sqlManager if needed
5. **Migrate other routes** using the same pattern

## Migration Pattern

This migration follows a clear pattern:

1. **Import sqlManager**: `import { tasks as taskQueries } from '../utils/sqlManager/index.js';`
2. **Replace SQL queries**: Use sqlManager functions instead of `db.prepare()`
3. **Keep business logic**: Route file focuses on HTTP handling
4. **Test thoroughly**: Ensure behavior matches original
5. **Remove old code**: Once verified, remove unused SQL

This pattern can be applied to all other routes!



