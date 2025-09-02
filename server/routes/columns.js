import express from 'express';
import { wrapQuery } from '../utils/queryLogger.js';

const router = express.Router();

// Create column
router.post('/', (req, res) => {
  const { id, title, boardId } = req.body;
  try {
    const { db } = req.app.locals;
    const position = wrapQuery(db.prepare('SELECT MAX(position) as maxPos FROM columns WHERE boardId = ?'), 'SELECT').get(boardId)?.maxPos || -1;
    wrapQuery(db.prepare('INSERT INTO columns (id, title, boardId, position) VALUES (?, ?, ?, ?)'), 'INSERT').run(id, title, boardId, position + 1);
    res.json({ id, title, boardId, position: position + 1 });
  } catch (error) {
    console.error('Error creating column:', error);
    res.status(500).json({ error: 'Failed to create column' });
  }
});

// Update column
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  try {
    const { db } = req.app.locals;
    wrapQuery(db.prepare('UPDATE columns SET title = ? WHERE id = ?'), 'UPDATE').run(title, id);
    res.json({ id, title });
  } catch (error) {
    console.error('Error updating column:', error);
    res.status(500).json({ error: 'Failed to update column' });
  }
});

// Delete column
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  try {
    const { db } = req.app.locals;
    wrapQuery(db.prepare('DELETE FROM columns WHERE id = ?'), 'DELETE').run(id);
    res.json({ message: 'Column deleted successfully' });
  } catch (error) {
    console.error('Error deleting column:', error);
    res.status(500).json({ error: 'Failed to delete column' });
  }
});

// Reorder columns
router.post('/reorder', (req, res) => {
  const { columnId, newPosition, boardId } = req.body;
  try {
    const { db } = req.app.locals;
    const currentColumn = wrapQuery(db.prepare('SELECT position FROM columns WHERE id = ?'), 'SELECT').get(columnId);
    if (!currentColumn) {
      return res.status(404).json({ error: 'Column not found' });
    }

    const currentPosition = currentColumn.position;

    db.transaction(() => {
      if (newPosition > currentPosition) {
        // Moving down: shift columns between current and new position up by 1
        wrapQuery(db.prepare(`
          UPDATE columns SET position = position - 1 
          WHERE boardId = ? AND position > ? AND position <= ?
        `), 'UPDATE').run(boardId, currentPosition, newPosition);
      } else {
        // Moving up: shift columns between new and current position down by 1
        wrapQuery(db.prepare(`
          UPDATE columns SET position = position + 1 
          WHERE boardId = ? AND position >= ? AND position < ?
        `), 'UPDATE').run(boardId, newPosition, currentPosition);
      }

      // Update the moved column to its new position
      wrapQuery(db.prepare('UPDATE columns SET position = ? WHERE id = ?'), 'UPDATE').run(newPosition, columnId);
    })();

    res.json({ message: 'Column reordered successfully' });
  } catch (error) {
    console.error('Error reordering column:', error);
    res.status(500).json({ error: 'Failed to reorder column' });
  }
});

export default router;
