import express from 'express';
import { wrapQuery } from '../utils/queryLogger.js';

const router = express.Router();

// Get all tasks
router.get('/', (req, res) => {
  try {
    const { db } = req.app.locals;
    const tasks = wrapQuery(db.prepare('SELECT * FROM tasks ORDER BY position ASC'), 'SELECT').all();
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Create task
router.post('/', (req, res) => {
  const task = req.body;
  try {
    const { db } = req.app.locals;
    const now = new Date().toISOString();
    wrapQuery(db.prepare(`
      INSERT INTO tasks (id, title, description, memberId, requesterId, startDate, dueDate, effort, priority, columnId, boardId, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `), 'INSERT').run(
      task.id, task.title, task.description || '', task.memberId, task.requesterId,
      task.startDate, task.dueDate, task.effort, task.priority, task.columnId, task.boardId, task.position || 0, now, now
    );
    res.json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Create task at top
router.post('/add-at-top', (req, res) => {
  const task = req.body;
  try {
    const { db } = req.app.locals;
    const now = new Date().toISOString();
    db.transaction(() => {
      wrapQuery(db.prepare('UPDATE tasks SET position = position + 1 WHERE columnId = ?'), 'UPDATE').run(task.columnId);
      wrapQuery(db.prepare(`
        INSERT INTO tasks (id, title, description, memberId, requesterId, startDate, dueDate, effort, priority, columnId, boardId, position, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `), 'INSERT').run(
        task.id, task.title, task.description || '', task.memberId, task.requesterId,
        task.startDate, task.dueDate, task.effort, task.priority, task.columnId, task.boardId, now, now
      );
    })();
    res.json(task);
  } catch (error) {
    console.error('Error creating task at top:', error);
    res.status(500).json({ error: 'Failed to create task at top' });
  }
});

// Update task
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const task = req.body;
  try {
    const { db } = req.app.locals;
    const now = new Date().toISOString();
    
    // Get current task to track previous location
    const currentTask = wrapQuery(db.prepare('SELECT columnId, boardId FROM tasks WHERE id = ?'), 'SELECT').get(id);
    const previousColumnId = currentTask ? currentTask.columnId : null;
    const previousBoardId = currentTask ? currentTask.boardId : null;
    
    wrapQuery(db.prepare(`
      UPDATE tasks SET title = ?, description = ?, memberId = ?, requesterId = ?, startDate = ?, 
      dueDate = ?, effort = ?, priority = ?, columnId = ?, boardId = ?, position = ?, 
      pre_boardId = ?, pre_columnId = ?, updated_at = ? WHERE id = ?
    `), 'UPDATE').run(
      task.title, task.description, task.memberId, task.requesterId, task.startDate,
      task.dueDate, task.effort, task.priority, task.columnId, task.boardId, task.position || 0,
      previousBoardId, previousColumnId, now, id
    );
    res.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  try {
    const { db } = req.app.locals;
    wrapQuery(db.prepare('DELETE FROM tasks WHERE id = ?'), 'DELETE').run(id);
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Reorder tasks
router.post('/reorder', (req, res) => {
  const { taskId, newPosition, columnId } = req.body;
  try {
    const { db } = req.app.locals;
    const currentTask = wrapQuery(db.prepare('SELECT position, columnId, boardId FROM tasks WHERE id = ?'), 'SELECT').get(taskId);

    if (!currentTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const currentPosition = currentTask.position;
    const previousColumnId = currentTask.columnId;
    const previousBoardId = currentTask.boardId;

    db.transaction(() => {
      if (newPosition > currentPosition) {
        // Moving down: shift tasks between current and new position up by 1
        wrapQuery(db.prepare(`
          UPDATE tasks SET position = position - 1 
          WHERE columnId = ? AND position > ? AND position <= ?
        `), 'UPDATE').run(columnId, currentPosition, newPosition);
      } else {
        // Moving up: shift tasks between new and current position down by 1
        wrapQuery(db.prepare(`
          UPDATE tasks SET position = position + 1 
          WHERE columnId = ? AND position >= ? AND position < ?
        `), 'UPDATE').run(columnId, newPosition, currentPosition);
      }

      // Update the moved task to its new position and track previous location
      wrapQuery(db.prepare(`
        UPDATE tasks SET 
          position = ?, 
          columnId = ?,
          pre_boardId = ?, 
          pre_columnId = ?,
          updated_at = ?
        WHERE id = ?
      `), 'UPDATE').run(newPosition, columnId, previousBoardId, previousColumnId, new Date().toISOString(), taskId);
    })();

    res.json({ message: 'Task reordered successfully' });
  } catch (error) {
    console.error('Error reordering task:', error);
    res.status(500).json({ error: 'Failed to reorder task' });
  }
});

// Move task to different board
router.post('/move-to-board', (req, res) => {
  console.log('🔄 Cross-board move endpoint hit:', { taskId: req.body.taskId, targetBoardId: req.body.targetBoardId });
  const { taskId, targetBoardId } = req.body;
  
  if (!taskId || !targetBoardId) {
    console.error('❌ Missing required fields:', { taskId, targetBoardId });
    return res.status(400).json({ error: 'taskId and targetBoardId are required' });
  }
  
  try {
    const { db } = req.app.locals;
    
    // Get the task to move
    const task = wrapQuery(
      db.prepare(`
        SELECT t.*, 
               JSON_GROUP_ARRAY(
                 CASE WHEN tg.tagId IS NOT NULL THEN 
                   JSON_OBJECT('id', tg.tagId, 'tag', tags.tag, 'description', tags.description, 'color', tags.color)
                 ELSE NULL END
               ) as tags_json,
               JSON_GROUP_ARRAY(
                 CASE WHEN w.id IS NOT NULL THEN 
                   JSON_OBJECT('id', w.id, 'memberId', w.memberId, 'createdAt', w.createdAt)
                 ELSE NULL END
               ) as watchers_json,
               JSON_GROUP_ARRAY(
                 CASE WHEN c.id IS NOT NULL THEN 
                   JSON_OBJECT('id', c.id, 'memberId', c.memberId, 'createdAt', c.createdAt)
                 ELSE NULL END
               ) as collaborators_json
        FROM tasks t
        LEFT JOIN task_tags tg ON t.id = tg.taskId
        LEFT JOIN tags ON tg.tagId = tags.id
        LEFT JOIN watchers w ON t.id = w.taskId
        LEFT JOIN collaborators c ON t.id = c.taskId
        WHERE t.id = ?
        GROUP BY t.id
      `), 
      'SELECT'
    ).get(taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Get source column title for intelligent placement
    const sourceColumn = wrapQuery(
      db.prepare('SELECT title FROM columns WHERE id = ?'), 
      'SELECT'
    ).get(task.columnId);
    
    let targetColumn = null;
    
    // Try to find a column with the same title in the target board
    if (sourceColumn) {
      targetColumn = wrapQuery(
        db.prepare('SELECT id, title FROM columns WHERE boardId = ? AND title = ? ORDER BY position ASC LIMIT 1'), 
        'SELECT'
      ).get(targetBoardId, sourceColumn.title);
      
      if (targetColumn) {
        console.log(`🎯 Smart placement: Found matching column "${sourceColumn.title}" in target board`);
      }
    }
    
    // Fallback to first column if no matching column found
    if (!targetColumn) {
      targetColumn = wrapQuery(
        db.prepare('SELECT id, title FROM columns WHERE boardId = ? ORDER BY position ASC LIMIT 1'), 
        'SELECT'
      ).get(targetBoardId);
      
      if (sourceColumn && targetColumn) {
        console.log(`📋 Fallback placement: No matching column "${sourceColumn.title}" found, using first column "${targetColumn.title}"`);
      }
    }
    
    if (!targetColumn) {
      return res.status(404).json({ error: 'Target board has no columns' });
    }
    
    // Store original location for tracking
    const originalBoardId = task.boardId;
    const originalColumnId = task.columnId;
    
    // Start transaction for atomic operation
    db.transaction(() => {
      // Shift existing tasks in target column to make room at position 0
      wrapQuery(
        db.prepare('UPDATE tasks SET position = position + 1 WHERE columnId = ?'), 
        'UPDATE'
      ).run(targetColumn.id);
      
      // Update the existing task to move it to the new location
      wrapQuery(
        db.prepare(`
          UPDATE tasks SET 
            columnId = ?, 
            boardId = ?, 
            position = 0,
            pre_boardId = ?, 
            pre_columnId = ?,
            updated_at = ?
          WHERE id = ?
        `), 
        'UPDATE'
      ).run(
        targetColumn.id, targetBoardId, originalBoardId, originalColumnId,
        new Date().toISOString(), taskId
      );
      
    })();
    
    res.json({ 
      success: true, 
      newTaskId: taskId, // Return original taskId since we're not changing it
      targetColumnId: targetColumn.id,
      targetBoardId,
      message: 'Task moved successfully' 
    });
    
  } catch (error) {
    console.error('Error moving task to board:', error);
    res.status(500).json({ error: 'Failed to move task to board' });
  }
});

// Get tasks by board
router.get('/by-board/:boardId', (req, res) => {
  const { boardId } = req.params;
  try {
    const { db } = req.app.locals;
    const tasks = wrapQuery(db.prepare('SELECT * FROM tasks WHERE boardId = ?'), 'SELECT').all(boardId);
    res.json(tasks);
  } catch (error) {
    console.error('Error getting tasks by board:', error);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

export default router;