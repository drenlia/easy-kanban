import express from 'express';
import { wrapQuery } from '../utils/queryLogger.js';
import redisService from '../services/redisService.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkBoardLimit } from '../middleware/licenseCheck.js';
import { getDefaultBoardColumns, getTranslator } from '../utils/i18n.js';
import { getTenantId } from '../middleware/tenantRouting.js';

const router = express.Router();

// Get all boards with columns and tasks (including tags)
router.get('/', authenticateToken, (req, res) => {
  try {
    const { db } = req.app.locals;
    const boards = wrapQuery(db.prepare('SELECT * FROM boards ORDER BY CAST(position AS INTEGER) ASC'), 'SELECT').all();
    const columnsStmt = wrapQuery(db.prepare('SELECT id, title, boardId, position, is_finished, is_archived FROM columns WHERE boardId = ? ORDER BY position ASC'), 'SELECT');
    
        // Updated query to include tags, watchers, and collaborators
    const tasksStmt = wrapQuery(
      db.prepare(`
        SELECT t.id, t.position, t.title, t.description, t.ticket, t.memberId, t.requesterId, 
               t.startDate, t.dueDate, t.effort, t.priority, t.priority_id, t.columnId, t.boardId, t.sprint_id,
               t.created_at, t.updated_at,
               p.id as priorityId,
               p.priority as priorityName,
               p.color as priorityColor,
               CASE WHEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) > 0 
                    THEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) 
                    ELSE NULL END as attachmentCount,
          json_group_array(
            DISTINCT CASE WHEN c.id IS NOT NULL THEN json_object(
              'id', c.id,
              'text', c.text,
              'authorId', c.authorId,
              'createdAt', c.createdAt
            ) ELSE NULL END
          ) as comments,
          json_group_array(
            DISTINCT CASE WHEN tag.id IS NOT NULL THEN json_object(
              'id', tag.id,
              'tag', tag.tag,
              'description', tag.description,
              'color', tag.color
            ) ELSE NULL END
          ) as tags,
          json_group_array(
            DISTINCT CASE WHEN watcher.id IS NOT NULL THEN json_object(
              'id', watcher.id,
              'name', watcher.name,
              'color', watcher.color,
              'user_id', watcher.user_id,
              'email', watcher_user.email,
              'avatarUrl', watcher_user.avatar_path,
              'googleAvatarUrl', watcher_user.google_avatar_url
            ) ELSE NULL END
          ) as watchers,
          json_group_array(
            DISTINCT CASE WHEN collaborator.id IS NOT NULL THEN json_object(
              'id', collaborator.id,
              'name', collaborator.name,
              'color', collaborator.color,
              'user_id', collaborator.user_id,
              'email', collaborator_user.email,
              'avatarUrl', collaborator_user.avatar_path,
              'googleAvatarUrl', collaborator_user.google_avatar_url
            ) ELSE NULL END
          ) as collaborators
        FROM tasks t
        LEFT JOIN comments c ON c.taskId = t.id
        LEFT JOIN task_tags tt ON tt.taskId = t.id
        LEFT JOIN tags tag ON tag.id = tt.tagId
        LEFT JOIN watchers w ON w.taskId = t.id
        LEFT JOIN members watcher ON watcher.id = w.memberId
        LEFT JOIN users watcher_user ON watcher_user.id = watcher.user_id
        LEFT JOIN collaborators col ON col.taskId = t.id
        LEFT JOIN members collaborator ON collaborator.id = col.memberId
        LEFT JOIN users collaborator_user ON collaborator_user.id = collaborator.user_id
        LEFT JOIN attachments a ON a.taskId = t.id
        LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
        WHERE t.columnId = ?
        GROUP BY t.id, p.id
        ORDER BY t.position ASC
`),
      'SELECT'
    );

    const boardsWithData = boards.map(board => {
      const columns = columnsStmt.all(board.id);
      const columnsObj = {};
      
      columns.forEach(column => {
        const tasks = tasksStmt.all(column.id).map(task => ({
          ...task,
          // Use priorityName from JOIN (current name) or fallback to stored priority
          priority: task.priorityName || task.priority || null,
          priorityId: task.priorityId || null,
          priorityName: task.priorityName || task.priority || null,
          priorityColor: task.priorityColor || null,
          sprintId: task.sprint_id || null, // Map snake_case to camelCase
          createdAt: task.created_at, // Map snake_case to camelCase
          updatedAt: task.updated_at, // Map snake_case to camelCase
          comments: task.comments === '[null]' ? [] : JSON.parse(task.comments).filter(Boolean),
          tags: task.tags === '[null]' ? [] : JSON.parse(task.tags).filter(Boolean),
          watchers: task.watchers === '[null]' ? [] : JSON.parse(task.watchers).filter(Boolean),
          collaborators: task.collaborators === '[null]' ? [] : JSON.parse(task.collaborators).filter(Boolean)
        }));
        
        // Get all comment IDs from all tasks in this column
        const allCommentIds = tasks.flatMap(task => 
          task.comments.map(comment => comment.id)
        ).filter(Boolean);
        
        // Fetch all attachments for all comments in one query (more efficient)
        if (allCommentIds.length > 0) {
          const placeholders = allCommentIds.map(() => '?').join(',');
          const allAttachments = wrapQuery(db.prepare(`
            SELECT commentId, id, name, url, type, size, created_at as createdAt
            FROM attachments
            WHERE commentId IN (${placeholders})
          `), 'SELECT').all(...allCommentIds);
          
          // Group attachments by commentId
          const attachmentsByCommentId = {};
          allAttachments.forEach(att => {
            if (!attachmentsByCommentId[att.commentId]) {
              attachmentsByCommentId[att.commentId] = [];
            }
            attachmentsByCommentId[att.commentId].push(att);
          });
          
          // Add attachments to each comment
          tasks.forEach(task => {
            task.comments.forEach(comment => {
              comment.attachments = attachmentsByCommentId[comment.id] || [];
            });
          });
        }
        
        columnsObj[column.id] = {
          ...column,
          tasks: tasks
        };
      });
      
      return {
        ...board,
        columns: columnsObj
      };
    });


    res.json(boardsWithData);
  } catch (error) {
    console.error('Error fetching boards:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToFetch', { resource: 'boards' }) });
  }
});

// Get columns for a specific board
router.get('/:boardId/columns', authenticateToken, (req, res) => {
  const { boardId } = req.params;
  try {
    const { db } = req.app.locals;
    
    const t = getTranslator(db);
    
    // Verify board exists
    const board = wrapQuery(db.prepare('SELECT id FROM boards WHERE id = ?'), 'SELECT').get(boardId);
    if (!board) {
      return res.status(404).json({ error: t('errors.boardNotFound') });
    }
    
    // Get columns for this board
    const columns = wrapQuery(
      db.prepare('SELECT id, title, boardId, position, is_finished, is_archived FROM columns WHERE boardId = ? ORDER BY position ASC'), 
      'SELECT'
    ).all(boardId);
    
    res.json(columns);
  } catch (error) {
    console.error('Error fetching board columns:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToFetchBoardColumns') });
  }
});

// Get default column names for new boards (based on APP_LANGUAGE)
router.get('/default-columns', authenticateToken, (req, res) => {
  try {
    const { db } = req.app.locals;
    const defaultColumns = getDefaultBoardColumns(db);
    res.json(defaultColumns);
  } catch (error) {
    console.error('Error fetching default columns:', error);
    res.status(500).json({ error: 'Failed to fetch default columns' });
  }
});

// Create board
router.post('/', authenticateToken, checkBoardLimit, async (req, res) => {
  const { id, title } = req.body;
  try {
    const { db } = req.app.locals;
    const t = getTranslator(db);
    
    // Check for duplicate board name
    const existingBoard = wrapQuery(
      db.prepare('SELECT id FROM boards WHERE LOWER(title) = LOWER(?)'), 
      'SELECT'
    ).get(title);
    
    if (existingBoard) {
      return res.status(400).json({ error: t('errors.boardNameExists') });
    }
    
    // Generate project identifier
    const projectPrefix = wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('DEFAULT_PROJ_PREFIX')?.value || 'PROJ-';
    const projectIdentifier = generateProjectIdentifier(db, projectPrefix);
    
    const position = wrapQuery(db.prepare('SELECT MAX(position) as maxPos FROM boards'), 'SELECT').get()?.maxPos || -1;
    wrapQuery(db.prepare('INSERT INTO boards (id, title, project, position) VALUES (?, ?, ?, ?)'), 'INSERT').run(id, title, projectIdentifier, position + 1);
    
    // Automatically create default columns based on APP_LANGUAGE
    const defaultColumns = getDefaultBoardColumns(db);
    const columnStmt = db.prepare('INSERT INTO columns (id, title, boardId, position, is_finished, is_archived) VALUES (?, ?, ?, ?, ?, ?)');
    
    const tenantId = getTenantId(req);
    
    defaultColumns.forEach((col, index) => {
      const columnId = `${col.id}-${id}`;
      const isFinished = col.id === 'completed';
      const isArchived = col.id === 'archive';
      
      columnStmt.run(columnId, col.title, id, index, isFinished ? 1 : 0, isArchived ? 1 : 0);
      
      // Publish column creation to Redis for real-time updates
      redisService.publish('column-created', {
        boardId: id,
        column: { 
          id: columnId, 
          title: col.title, 
          boardId: id, 
          position: index, 
          is_finished: isFinished, 
          is_archived: isArchived 
        },
        updatedBy: req.user?.id || 'system',
        timestamp: new Date().toISOString()
      }, tenantId);
    });
    
    const newBoard = { id, title, project: projectIdentifier, position: position + 1 };
    
    // Publish to Redis for real-time updates
    redisService.publish('board-created', {
      boardId: id,
      board: newBoard,
      timestamp: new Date().toISOString()
    }, tenantId);
    
    res.json(newBoard);
  } catch (error) {
    console.error('Error creating board:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToCreateBoard') });
  }
});

// Utility function to generate project identifiers
const generateProjectIdentifier = (db, prefix = 'PROJ-') => {
  // Get the highest existing project number
  const result = wrapQuery(db.prepare(`
    SELECT project FROM boards 
    WHERE project IS NOT NULL AND project LIKE ?
    ORDER BY CAST(SUBSTR(project, ?) AS INTEGER) DESC 
    LIMIT 1
  `), 'SELECT').get(`${prefix}%`, prefix.length + 1);
  
  let nextNumber = 1;
  if (result && result.project) {
    const currentNumber = parseInt(result.project.substring(prefix.length));
    nextNumber = currentNumber + 1;
  }
  
  return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
};

// Update board
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  try {
    const { db } = req.app.locals;
    const t = getTranslator(db);
    
    // Check for duplicate board name (excluding current board)
    const existingBoard = wrapQuery(
      db.prepare('SELECT id FROM boards WHERE LOWER(title) = LOWER(?) AND id != ?'), 
      'SELECT'
    ).get(title, id);
    
    if (existingBoard) {
      return res.status(400).json({ error: t('errors.boardNameExists') });
    }
    
    wrapQuery(db.prepare('UPDATE boards SET title = ? WHERE id = ?'), 'UPDATE').run(title, id);
    
    // Publish to Redis for real-time updates
    const tenantId = getTenantId(req);
    await redisService.publish('board-updated', {
      boardId: id,
      board: { id, title },
      timestamp: new Date().toISOString()
    }, tenantId);
    
    res.json({ id, title });
  } catch (error) {
    console.error('Error updating board:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToUpdateBoard') });
  }
});

// Delete board
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const { db } = req.app.locals;
    wrapQuery(db.prepare('DELETE FROM boards WHERE id = ?'), 'DELETE').run(id);
    
    // Publish to Redis for real-time updates
    const tenantId = getTenantId(req);
    await redisService.publish('board-deleted', {
      boardId: id,
      timestamp: new Date().toISOString()
    }, tenantId);
    
    res.json({ message: 'Board deleted successfully' });
  } catch (error) {
    console.error('Error deleting board:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToDeleteBoard') });
  }
});

// Reorder boards
router.post('/reorder', authenticateToken, async (req, res) => {
  const { boardId, newPosition } = req.body;
  try {
    const { db } = req.app.locals;
    const t = getTranslator(db);
    const currentBoard = wrapQuery(db.prepare('SELECT position FROM boards WHERE id = ?'), 'SELECT').get(boardId);
    if (!currentBoard) {
      return res.status(404).json({ error: t('errors.boardNotFound') });
    }

    // Get all boards ordered by current position
    const allBoards = wrapQuery(db.prepare('SELECT id, position FROM boards ORDER BY position ASC'), 'SELECT').all();

    // Reset all positions to simple integers (0, 1, 2, 3, etc.)
    db.transaction(() => {
      allBoards.forEach((board, index) => {
        wrapQuery(db.prepare('UPDATE boards SET position = ? WHERE id = ?'), 'UPDATE').run(index, board.id);
      });

      // Now get the normalized positions and find the target and dragged boards
      const normalizedBoards = allBoards.map((board, index) => ({ ...board, position: index }));
      const currentIndex = normalizedBoards.findIndex(b => b.id === boardId);
      
      if (currentIndex !== -1 && currentIndex !== newPosition) {
        // Simple swap: just swap the two positions
        const targetBoard = normalizedBoards[newPosition];
        if (targetBoard) {
          wrapQuery(db.prepare('UPDATE boards SET position = ? WHERE id = ?'), 'UPDATE').run(newPosition, boardId);
          wrapQuery(db.prepare('UPDATE boards SET position = ? WHERE id = ?'), 'UPDATE').run(currentIndex, targetBoard.id);
        }
      }
    })();

    // Publish to Redis for real-time updates
    const tenantId = getTenantId(req);
    await redisService.publish('board-reordered', {
      boardId: boardId,
      newPosition: newPosition,
      timestamp: new Date().toISOString()
    }, tenantId);

    res.json({ message: 'Board reordered successfully' });
  } catch (error) {
    console.error('Error reordering board:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToReorderBoard') });
  }
});

// Get all task relationships for a board
router.get('/:boardId/relationships', authenticateToken, (req, res) => {
  const { boardId } = req.params;
  try {
    const { db } = req.app.locals;
    
    // Get all relationships for tasks in this board
    const relationships = wrapQuery(db.prepare(`
      SELECT 
        tr.id,
        tr.task_id,
        tr.relationship,
        tr.to_task_id,
        tr.created_at
      FROM task_rels tr
      JOIN tasks t1 ON tr.task_id = t1.id
      JOIN tasks t2 ON tr.to_task_id = t2.id
      WHERE t1.boardId = ? AND t2.boardId = ?
      ORDER BY tr.created_at DESC
    `), 'SELECT').all(boardId, boardId);
    
    res.json(relationships);
  } catch (error) {
    console.error('Error fetching board relationships:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToFetchBoardRelationships') });
  }
});

export default router;
