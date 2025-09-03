import express from 'express';
import { wrapQuery } from '../utils/queryLogger.js';

const router = express.Router();

// Get all boards with columns and tasks (including tags)
router.get('/', (req, res) => {
  try {
    const { db } = req.app.locals;
    const boards = wrapQuery(db.prepare('SELECT * FROM boards ORDER BY CAST(position AS INTEGER) ASC'), 'SELECT').all();
    const columnsStmt = wrapQuery(db.prepare('SELECT * FROM columns WHERE boardId = ? ORDER BY position ASC'), 'SELECT');
    
    // Updated query to include tags - matches index_old.js working version
    const tasksStmt = wrapQuery(
      db.prepare(`
        SELECT t.*, 
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
          ) as tags
        FROM tasks t
        LEFT JOIN comments c ON c.taskId = t.id
        LEFT JOIN task_tags tt ON tt.taskId = t.id
        LEFT JOIN tags tag ON tag.id = tt.tagId
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
          comments: task.comments === '[null]' ? [] : JSON.parse(task.comments).filter(Boolean),
          tags: task.tags === '[null]' ? [] : JSON.parse(task.tags).filter(Boolean)
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

    console.log('📋 Boards endpoint called, returning', boardsWithData.length, 'boards with tags included');
    res.json(boardsWithData);
  } catch (error) {
    console.error('Error fetching boards:', error);
    res.status(500).json({ error: 'Failed to fetch boards' });
  }
});

// Create board
router.post('/', (req, res) => {
  const { id, title } = req.body;
  try {
    const { db } = req.app.locals;
    const position = wrapQuery(db.prepare('SELECT MAX(position) as maxPos FROM boards'), 'SELECT').get()?.maxPos || -1;
    wrapQuery(db.prepare('INSERT INTO boards (id, title, position) VALUES (?, ?, ?)'), 'INSERT').run(id, title, position + 1);
    res.json({ id, title, position: position + 1 });
  } catch (error) {
    console.error('Error creating board:', error);
    res.status(500).json({ error: 'Failed to create board' });
  }
});

// Update board
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  try {
    const { db } = req.app.locals;
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
