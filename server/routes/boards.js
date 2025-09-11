import express from 'express';
import { wrapQuery } from '../utils/queryLogger.js';

const router = express.Router();

// Get all boards with columns and tasks (including tags)
router.get('/', (req, res) => {
  try {
    const { db } = req.app.locals;
    const boards = wrapQuery(db.prepare('SELECT * FROM boards ORDER BY CAST(position AS INTEGER) ASC'), 'SELECT').all();
    const columnsStmt = wrapQuery(db.prepare('SELECT * FROM columns WHERE boardId = ? ORDER BY position ASC'), 'SELECT');
    
        // Updated query to include tags, watchers, and collaborators
    const tasksStmt = wrapQuery(
      db.prepare(`
        SELECT t.id, t.position, t.title, t.description, t.ticket, t.memberId, t.requesterId, 
               t.startDate, t.dueDate, t.effort, t.priority, t.columnId, t.boardId,
               t.created_at, t.updated_at,
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
        WHERE t.columnId = ?
        GROUP BY t.id
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
          createdAt: task.created_at, // Map snake_case to camelCase
          updatedAt: task.updated_at, // Map snake_case to camelCase
          comments: task.comments === '[null]' ? [] : JSON.parse(task.comments).filter(Boolean),
          tags: task.tags === '[null]' ? [] : JSON.parse(task.tags).filter(Boolean),
          watchers: task.watchers === '[null]' ? [] : JSON.parse(task.watchers).filter(Boolean),
          collaborators: task.collaborators === '[null]' ? [] : JSON.parse(task.collaborators).filter(Boolean)
        }));
        
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
    res.status(500).json({ error: 'Failed to fetch boards' });
  }
});

// Get columns for a specific board
router.get('/:boardId/columns', (req, res) => {
  const { boardId } = req.params;
  try {
    const { db } = req.app.locals;
    
    // Verify board exists
    const board = wrapQuery(db.prepare('SELECT id FROM boards WHERE id = ?'), 'SELECT').get(boardId);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    
    // Get columns for this board
    const columns = wrapQuery(
      db.prepare('SELECT id, title, boardId, position FROM columns WHERE boardId = ? ORDER BY position ASC'), 
      'SELECT'
    ).all(boardId);
    
    res.json(columns);
  } catch (error) {
    console.error('Error fetching board columns:', error);
    res.status(500).json({ error: 'Failed to fetch board columns' });
  }
});

// Create board
router.post('/', (req, res) => {
  const { id, title } = req.body;
  try {
    const { db } = req.app.locals;
    
    // Check for duplicate board name
    const existingBoard = wrapQuery(
      db.prepare('SELECT id FROM boards WHERE LOWER(title) = LOWER(?)'), 
      'SELECT'
    ).get(title);
    
    if (existingBoard) {
      return res.status(400).json({ error: 'A board with this name already exists' });
    }
    
    // Generate project identifier
    const projectPrefix = wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('DEFAULT_PROJ_PREFIX')?.value || 'PROJ-';
    const projectIdentifier = generateProjectIdentifier(db, projectPrefix);
    
    const position = wrapQuery(db.prepare('SELECT MAX(position) as maxPos FROM boards'), 'SELECT').get()?.maxPos || -1;
    wrapQuery(db.prepare('INSERT INTO boards (id, title, project, position) VALUES (?, ?, ?, ?)'), 'INSERT').run(id, title, projectIdentifier, position + 1);
    res.json({ id, title, project: projectIdentifier, position: position + 1 });
  } catch (error) {
    console.error('Error creating board:', error);
    res.status(500).json({ error: 'Failed to create board' });
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
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  try {
    const { db } = req.app.locals;
    
    // Check for duplicate board name (excluding current board)
    const existingBoard = wrapQuery(
      db.prepare('SELECT id FROM boards WHERE LOWER(title) = LOWER(?) AND id != ?'), 
      'SELECT'
    ).get(title, id);
    
    if (existingBoard) {
      return res.status(400).json({ error: 'A board with this name already exists' });
    }
    
    wrapQuery(db.prepare('UPDATE boards SET title = ? WHERE id = ?'), 'UPDATE').run(title, id);
    res.json({ id, title });
  } catch (error) {
    console.error('Error updating board:', error);
    res.status(500).json({ error: 'Failed to update board' });
  }
});

// Delete board
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  try {
    const { db } = req.app.locals;
    wrapQuery(db.prepare('DELETE FROM boards WHERE id = ?'), 'DELETE').run(id);
    res.json({ message: 'Board deleted successfully' });
  } catch (error) {
    console.error('Error deleting board:', error);
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

// Reorder boards
router.post('/reorder', (req, res) => {
  const { boardId, newPosition } = req.body;
  try {
    const { db } = req.app.locals;
    const currentBoard = wrapQuery(db.prepare('SELECT position FROM boards WHERE id = ?'), 'SELECT').get(boardId);
    if (!currentBoard) {
      return res.status(404).json({ error: 'Board not found' });
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

    res.json({ message: 'Board reordered successfully' });
  } catch (error) {
    console.error('Error reordering board:', error);
    res.status(500).json({ error: 'Failed to reorder board' });
  }
});

export default router;
