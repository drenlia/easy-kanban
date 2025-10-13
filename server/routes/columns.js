import express from 'express';
import { wrapQuery } from '../utils/queryLogger.js';
import redisService from '../services/redisService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Create column
router.post('/', authenticateToken, async (req, res) => {
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
    
    // Check if this column should be marked as archived (auto-detect "Archive" column)
    const isArchived = title.toLowerCase() === 'archive';
    
    let finalPosition;
    if (position !== undefined) {
      // Use provided position (for inserting between columns)
      finalPosition = position;
    } else {
      // Default behavior: append to end
      const maxPos = wrapQuery(db.prepare('SELECT MAX(position) as maxPos FROM columns WHERE boardId = ?'), 'SELECT').get(boardId)?.maxPos || -1;
      finalPosition = maxPos + 1;
    }
    
    wrapQuery(db.prepare('INSERT INTO columns (id, title, boardId, position, is_finished, is_archived) VALUES (?, ?, ?, ?, ?, ?)'), 'INSERT').run(id, title, boardId, finalPosition, isFinished ? 1 : 0, isArchived ? 1 : 0);
    
    // Publish to Redis for real-time updates
    console.log('📤 Publishing column-created to Redis for board:', boardId);
    await redisService.publish('column-created', {
      boardId: boardId,
      column: { id, title, boardId, position: finalPosition, is_finished: isFinished, is_archived: isArchived },
      updatedBy: req.user?.id || 'system',
      timestamp: new Date().toISOString()
    });
    console.log('✅ Column-created published to Redis');
    
    res.json({ id, title, boardId, position: finalPosition, is_finished: isFinished, is_archived: isArchived });
  } catch (error) {
    console.error('Error creating column:', error);
    res.status(500).json({ error: 'Failed to create column' });
  }
});

// Update column
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, is_finished, is_archived } = req.body;
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
    
    // Check if this column should be marked as archived
    const isArchived = title.toLowerCase() === 'archive';
    
    // If is_finished is provided, use it; otherwise, auto-detect based on title
    const finalIsFinished = is_finished !== undefined ? is_finished : isFinished;
    
    // If is_archived is provided, use it; otherwise, auto-detect based on title
    const finalIsArchived = is_archived !== undefined ? is_archived : isArchived;
    
    // Ensure a column cannot be both finished and archived
    const finalIsFinishedValue = finalIsArchived ? false : finalIsFinished;
    
    wrapQuery(db.prepare('UPDATE columns SET title = ?, is_finished = ?, is_archived = ? WHERE id = ?'), 'UPDATE').run(title, finalIsFinishedValue ? 1 : 0, finalIsArchived ? 1 : 0, id);
    
    // Publish to Redis for real-time updates
    console.log('📤 Publishing column-updated to Redis for board:', column.boardId);
    await redisService.publish('column-updated', {
      boardId: column.boardId,
      column: { id, title, is_finished: finalIsFinishedValue, is_archived: finalIsArchived },
      updatedBy: req.user?.id || 'system',
      timestamp: new Date().toISOString()
    });
    console.log('✅ Column-updated published to Redis');
    
    res.json({ id, title, is_finished: finalIsFinishedValue, is_archived: finalIsArchived });
  } catch (error) {
    console.error('Error updating column:', error);
    res.status(500).json({ error: 'Failed to update column' });
  }
});

// Delete column
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const { db } = req.app.locals;
    
    // Get the column's board ID before deleting
    const column = wrapQuery(db.prepare('SELECT boardId FROM columns WHERE id = ?'), 'SELECT').get(id);
    if (!column) {
      return res.status(404).json({ error: 'Column not found' });
    }
    
    wrapQuery(db.prepare('DELETE FROM columns WHERE id = ?'), 'DELETE').run(id);
    
    // Publish to Redis for real-time updates
    console.log('📤 Publishing column-deleted to Redis for board:', column.boardId);
    await redisService.publish('column-deleted', {
      boardId: column.boardId,
      columnId: id,
      updatedBy: req.user?.id || 'system',
      timestamp: new Date().toISOString()
    });
    console.log('✅ Column-deleted published to Redis');
    
    res.json({ message: 'Column deleted successfully' });
  } catch (error) {
    console.error('Error deleting column:', error);
    res.status(500).json({ error: 'Failed to delete column' });
  }
});

// Reorder columns
router.post('/reorder', authenticateToken, async (req, res) => {
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

    // Publish to Redis for real-time updates
    console.log('📤 Publishing column-reordered to Redis for board:', boardId);
    await redisService.publish('column-reordered', {
      boardId: boardId,
      columnId: columnId,
      newPosition: newPosition,
      updatedBy: req.user?.id || 'system',
      timestamp: new Date().toISOString()
    });
    console.log('✅ Column-reordered published to Redis');

    res.json({ message: 'Column reordered successfully' });
  } catch (error) {
    console.error('Error reordering column:', error);
    res.status(500).json({ error: 'Failed to reorder column' });
  }
});

// Renumber all columns in a board to ensure clean integer positions
router.post('/renumber', authenticateToken, async (req, res) => {
  const { boardId } = req.body;
  try {
    const { db } = req.app.locals;
    
    db.transaction(() => {
      // Get all columns for this board ordered by current position
      const columns = wrapQuery(
        db.prepare('SELECT id FROM columns WHERE boardId = ? ORDER BY position, id'), 
        'SELECT'
      ).all(boardId);
      
      // Renumber them sequentially starting from 0
      columns.forEach((column, index) => {
        wrapQuery(
          db.prepare('UPDATE columns SET position = ? WHERE id = ?'), 
          'UPDATE'
        ).run(index, column.id);
      });
    })();

    res.json({ message: 'Columns renumbered successfully' });
  } catch (error) {
    console.error('Error renumbering columns:', error);
    res.status(500).json({ error: 'Failed to renumber columns' });
  }
});

export default router;
