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
      task.id, task.title, task.description, task.memberId, task.requesterId,
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
        task.id, task.title, task.description, task.memberId, task.requesterId,
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
    wrapQuery(db.prepare(`
      UPDATE tasks SET title = ?, description = ?, memberId = ?, requesterId = ?, startDate = ?, 
      dueDate = ?, effort = ?, priority = ?, columnId = ?, boardId = ?, position = ?, updated_at = ? WHERE id = ?
    `), 'UPDATE').run(
      task.title, task.description, task.memberId, task.requesterId, task.startDate,
      task.dueDate, task.effort, task.priority, task.columnId, task.boardId, task.position || 0, now, id
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
    const currentTask = wrapQuery(db.prepare('SELECT position FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
    if (!currentTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const currentPosition = currentTask.position;

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

      // Update the moved task to its new position
      wrapQuery(db.prepare('UPDATE tasks SET position = ? WHERE id = ?'), 'UPDATE').run(newPosition, taskId);
    })();

    res.json({ message: 'Task reordered successfully' });
  } catch (error) {
    console.error('Error reordering task:', error);
    res.status(500).json({ error: 'Failed to reorder task' });
  }
});

export default router;
