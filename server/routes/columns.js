import express from 'express';
import { wrapQuery } from '../utils/queryLogger.js';

const router = express.Router();

// Create column
router.post('/', (req, res) => {
  const { id, title, boardId, position } = req.body;
  try {
    const { db } = req.app.locals;
    
    // Check for duplicate column name within the same board
    const existingColumn = wrapQuery(
      db.prepare('SELECT id FROM columns WHERE boardId = ? AND LOWER(title) = LOWER(?)'), 
      'SELECT'
    ).get(boardId, title);
    
    if (existingColumn) {
      return res.status(400).json({ error: 'A column with this name already exists in this board' });
    }
    
    // Get finished column names from settings
    const finishedColumnNamesSetting = wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'), 
      'SELECT'
    ).get('DEFAULT_FINISHED_COLUMN_NAMES');
    
    let finishedColumnNames = ['Done', 'Completed', 'Finished']; // Default values
    if (finishedColumnNamesSetting?.value) {
      try {
        finishedColumnNames = JSON.parse(finishedColumnNamesSetting.value);
      } catch (error) {
        console.error('Error parsing finished column names:', error);
      }
    }
    
    // Check if this column should be marked as finished
    const isFinished = finishedColumnNames.some(finishedName => 
      finishedName.toLowerCase() === title.toLowerCase()
    );
    
    let finalPosition;
    if (position !== undefined) {
      // Use provided position (for inserting between columns)
      finalPosition = position;
    } else {
      // Default behavior: append to end
      const maxPos = wrapQuery(db.prepare('SELECT MAX(position) as maxPos FROM columns WHERE boardId = ?'), 'SELECT').get(boardId)?.maxPos || -1;
      finalPosition = maxPos + 1;
    }
    
    wrapQuery(db.prepare('INSERT INTO columns (id, title, boardId, position, is_finished) VALUES (?, ?, ?, ?, ?)'), 'INSERT').run(id, title, boardId, finalPosition, isFinished ? 1 : 0);
    res.json({ id, title, boardId, position: finalPosition, is_finished: isFinished });
  } catch (error) {
    console.error('Error creating column:', error);
    res.status(500).json({ error: 'Failed to create column' });
  }
});

// Update column
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { title, is_finished } = req.body;
  try {
    const { db } = req.app.locals;
    
    // Get the column's board ID
    const column = wrapQuery(db.prepare('SELECT boardId FROM columns WHERE id = ?'), 'SELECT').get(id);
    if (!column) {
      return res.status(404).json({ error: 'Column not found' });
    }
    
    // Check for duplicate column name within the same board (excluding current column)
    const existingColumn = wrapQuery(
      db.prepare('SELECT id FROM columns WHERE boardId = ? AND LOWER(title) = LOWER(?) AND id != ?'), 
      'SELECT'
    ).get(column.boardId, title, id);
    
    if (existingColumn) {
      return res.status(400).json({ error: 'A column with this name already exists in this board' });
    }
    
    // Get finished column names from settings
    const finishedColumnNamesSetting = wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'), 
      'SELECT'
    ).get('DEFAULT_FINISHED_COLUMN_NAMES');
    
    let finishedColumnNames = ['Done', 'Completed', 'Finished']; // Default values
    if (finishedColumnNamesSetting?.value) {
      try {
        finishedColumnNames = JSON.parse(finishedColumnNamesSetting.value);
      } catch (error) {
        console.error('Error parsing finished column names:', error);
      }
    }
    
    // Check if this column should be marked as finished
    const isFinished = finishedColumnNames.some(finishedName => 
      finishedName.toLowerCase() === title.toLowerCase()
    );
    
    // If is_finished is provided, use it; otherwise, auto-detect based on title
    const finalIsFinished = is_finished !== undefined ? is_finished : isFinished;
    
    wrapQuery(db.prepare('UPDATE columns SET title = ?, is_finished = ? WHERE id = ?'), 'UPDATE').run(title, finalIsFinished ? 1 : 0, id);
    res.json({ id, title, is_finished: finalIsFinished });
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
