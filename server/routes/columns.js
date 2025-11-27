import express from 'express';
import { wrapQuery } from '../utils/queryLogger.js';
import redisService from '../services/redisService.js';
import { authenticateToken } from '../middleware/auth.js';
import { getTranslator } from '../utils/i18n.js';
import { getTenantId, getRequestDatabase } from '../middleware/tenantRouting.js';
import { dbTransaction } from '../utils/dbAsync.js';

const router = express.Router();

// Create column
router.post('/', authenticateToken, async (req, res) => {
  const { id, title, boardId, position } = req.body;
  try {
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    
    // Check for duplicate column name within the same board
    const existingColumn = await wrapQuery(
      db.prepare('SELECT id FROM columns WHERE boardId = ? AND LOWER(title) = LOWER(?)'), 
      'SELECT'
    ).get(boardId, title);
    
    if (existingColumn) {
      return res.status(400).json({ error: t('errors.columnNameExists') });
    }
    
    // Get finished column names from settings
    const finishedColumnNamesSetting = await wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'), 
      'SELECT'
    ).get('DEFAULT_FINISHED_COLUMN_NAMES');
    
    let finishedColumnNames = ['Done', 'Terminé', 'Completed', 'Complété', 'Finished', 'Fini']; // Default values
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
      const maxPos = await wrapQuery(db.prepare('SELECT MAX(position) as maxPos FROM columns WHERE boardId = ?'), 'SELECT').get(boardId)?.maxPos || -1;
      finalPosition = maxPos + 1;
    }
    
    await wrapQuery(db.prepare('INSERT INTO columns (id, title, boardId, position, is_finished, is_archived) VALUES (?, ?, ?, ?, ?, ?)'), 'INSERT').run(id, title, boardId, finalPosition, isFinished ? 1 : 0, isArchived ? 1 : 0);
    
    // Publish to Redis for real-time updates
    const tenantId = getTenantId(req);
    await redisService.publish('column-created', {
      boardId: boardId,
      column: { id, title, boardId, position: finalPosition, is_finished: isFinished, is_archived: isArchived },
      updatedBy: req.user?.id || 'system',
      timestamp: new Date().toISOString()
    }, tenantId);
    
    res.json({ id, title, boardId, position: finalPosition, is_finished: isFinished, is_archived: isArchived });
  } catch (error) {
    console.error('Error creating column:', error);
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToCreateColumn') });
  }
});

// Update column
router.put("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, is_finished, is_archived } = req.body;
  try {
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    
    // Get the column's board ID
    const column = await wrapQuery(db.prepare('SELECT boardId FROM columns WHERE id = ?'), 'SELECT').get(id);
    if (!column) {
      return res.status(404).json({ error: t('errors.columnNotFound') });
    }
    
    // Check for duplicate column name within the same board (excluding current column)
    const existingColumn = await wrapQuery(
      db.prepare('SELECT id FROM columns WHERE boardId = ? AND LOWER(title) = LOWER(?) AND id != ?'), 
      'SELECT'
    ).get(column.boardId, title, id);
    
    if (existingColumn) {
      return res.status(400).json({ error: t('errors.columnNameExists') });
    }
    
    // Get finished column names from settings
    const finishedColumnNamesSetting = await wrapQuery(
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
    
    await wrapQuery(db.prepare('UPDATE columns SET title = ?, is_finished = ?, is_archived = ? WHERE id = ?'), 'UPDATE').run(title, finalIsFinishedValue ? 1 : 0, finalIsArchived ? 1 : 0, id);
    
    // Publish to Redis for real-time updates
    const tenantId = getTenantId(req);
    await redisService.publish('column-updated', {
      boardId: column.boardId,
      column: { id, title, is_finished: finalIsFinishedValue, is_archived: finalIsArchived },
      updatedBy: req.user?.id || 'system',
      timestamp: new Date().toISOString()
    }, tenantId);
    
    res.json({ id, title, is_finished: finalIsFinishedValue, is_archived: finalIsArchived });
  } catch (error) {
    console.error('Error updating column:', error);
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToUpdateColumn') });
  }
});

// Delete column
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    
    // Get the column's board ID before deleting
    const column = await wrapQuery(db.prepare('SELECT boardId FROM columns WHERE id = ?'), 'SELECT').get(id);
    if (!column) {
      return res.status(404).json({ error: t('errors.columnNotFound') });
    }
    
    await wrapQuery(db.prepare('DELETE FROM columns WHERE id = ?'), 'DELETE').run(id);
    
    // Publish to Redis for real-time updates
    const tenantId = getTenantId(req);
    await redisService.publish('column-deleted', {
      boardId: column.boardId,
      columnId: id,
      updatedBy: req.user?.id || 'system',
      timestamp: new Date().toISOString()
    }, tenantId);
    
    res.json({ message: 'Column deleted successfully' });
  } catch (error) {
    console.error('Error deleting column:', error);
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToDeleteColumn') });
  }
});

// Reorder columns
router.post('/reorder', authenticateToken, async (req, res) => {
  const { columnId, newPosition, boardId } = req.body;
  try {
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    const currentColumn = await wrapQuery(db.prepare('SELECT position FROM columns WHERE id = ?'), 'SELECT').get(columnId);
    if (!currentColumn) {
      return res.status(404).json({ error: t('errors.columnNotFound') });
    }

    const currentPosition = currentColumn.position;

    await dbTransaction(db, async () => {
      if (newPosition > currentPosition) {
        // Moving down: shift columns between current and new position up by 1
        await wrapQuery(db.prepare(`
          UPDATE columns SET position = position - 1 
          WHERE boardId = ? AND position > ? AND position <= ?
        `), 'UPDATE').run(boardId, currentPosition, newPosition);
      } else {
        // Moving up: shift columns between new and current position down by 1
        await wrapQuery(db.prepare(`
          UPDATE columns SET position = position + 1 
          WHERE boardId = ? AND position >= ? AND position < ?
        `), 'UPDATE').run(boardId, newPosition, currentPosition);
      }

      // Update the moved column to its new position
      await wrapQuery(db.prepare('UPDATE columns SET position = ? WHERE id = ?'), 'UPDATE').run(newPosition, columnId);
    });

    // Fetch all updated columns for this board to send in WebSocket event
    const updatedColumns = await wrapQuery(
      db.prepare('SELECT * FROM columns WHERE boardId = ? ORDER BY position'), 
      'SELECT'
    ).all(boardId);

    // Publish to Redis for real-time updates - include all columns
    const tenantId = getTenantId(req);
    await redisService.publish('column-reordered', {
      boardId: boardId,
      columnId: columnId,
      newPosition: newPosition,
      columns: updatedColumns, // Send all updated columns
      updatedBy: req.user?.id || 'system',
      timestamp: new Date().toISOString()
    }, tenantId);

    res.json({ message: 'Column reordered successfully' });
  } catch (error) {
    console.error('Error reordering column:', error);
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToReorderColumn') });
  }
});

// Renumber all columns in a board to ensure clean integer positions
router.post('/renumber', authenticateToken, async (req, res) => {
  const { boardId } = req.body;
  try {
    const db = getRequestDatabase(req);
    
    await dbTransaction(db, async () => {
      // Get all columns for this board ordered by current position
      const columns = await wrapQuery(
        db.prepare('SELECT id FROM columns WHERE boardId = ? ORDER BY position, id'), 
        'SELECT'
      ).all(boardId);
      
      // Renumber them sequentially starting from 0
      for (let index = 0; index < columns.length; index++) {
        await wrapQuery(
          db.prepare('UPDATE columns SET position = ? WHERE id = ?'), 
          'UPDATE'
        ).run(index, columns[index].id);
      }
    });

    res.json({ message: 'Columns renumbered successfully' });
  } catch (error) {
    console.error('Error renumbering columns:', error);
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToRenumberColumns') });
  }
});

export default router;
