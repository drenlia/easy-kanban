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
    
    // Generate new task ID outside transaction
    const newTaskId = `${taskId}-moved-${Date.now()}`;
    
    // Start transaction for atomic operation
    db.transaction(() => {
      // Shift existing tasks in target column to make room at position 0
      wrapQuery(
        db.prepare('UPDATE tasks SET position = position + 1 WHERE columnId = ?'), 
        'UPDATE'
      ).run(targetColumn.id);
      
      // Create new task in target board/column
      wrapQuery(
        db.prepare(`
          INSERT INTO tasks (
            id, position, title, description, memberId, requesterId, 
            startDate, dueDate, effort, priority, columnId, boardId,
            created_at, updated_at
          ) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `), 
        'INSERT'
      ).run(
        newTaskId, task.title, task.description, task.memberId, task.requesterId,
        task.startDate, task.dueDate, task.effort, task.priority, 
        targetColumn.id, targetBoardId, task.created_at, new Date().toISOString()
      );
      
      // Copy tags
      if (task.tags_json && task.tags_json !== '[null]') {
        const tags = JSON.parse(task.tags_json).filter(tag => tag !== null);
        tags.forEach(tag => {
          wrapQuery(
            db.prepare('INSERT OR IGNORE INTO task_tags (taskId, tagId) VALUES (?, ?)'),
            'INSERT'
          ).run(newTaskId, tag.id);
        });
      }
      
      // Copy watchers
      if (task.watchers_json && task.watchers_json !== '[null]') {
        const watchers = JSON.parse(task.watchers_json).filter(watcher => watcher !== null);
        watchers.forEach(watcher => {
          try {
            wrapQuery(
              db.prepare('INSERT OR IGNORE INTO watchers (taskId, memberId, createdAt) VALUES (?, ?, ?)'),
              'INSERT'
            ).run(newTaskId, watcher.id, watcher.createdAt);
          } catch (error) {
            console.log('Warning: Could not copy watcher:', watcher, error.message);
          }
        });
      }
      
      // Copy collaborators
      if (task.collaborators_json && task.collaborators_json !== '[null]') {
        const collaborators = JSON.parse(task.collaborators_json).filter(collab => collab !== null);
        collaborators.forEach(collab => {
          try {
            wrapQuery(
              db.prepare('INSERT OR IGNORE INTO collaborators (taskId, memberId, createdAt) VALUES (?, ?, ?)'),
              'INSERT'
            ).run(newTaskId, collab.id, collab.createdAt);
          } catch (error) {
            console.log('Warning: Could not copy collaborator:', collab, error.message);
          }
        });
      }
      
      // Copy comments
      const comments = wrapQuery(
        db.prepare('SELECT * FROM comments WHERE taskId = ?'),
        'SELECT'
      ).all(taskId);
      
      comments.forEach(comment => {
        const newCommentId = `${comment.id}-moved-${Date.now()}`;
        wrapQuery(
          db.prepare('INSERT INTO comments (id, taskId, text, authorId, createdAt) VALUES (?, ?, ?, ?, ?)'),
          'INSERT'
        ).run(newCommentId, newTaskId, comment.text, comment.authorId, comment.createdAt);
        
        // Copy attachments for this comment
        const attachments = wrapQuery(
          db.prepare('SELECT * FROM attachments WHERE commentId = ?'),
          'SELECT'
        ).all(comment.id);
        
        attachments.forEach(attachment => {
          const newAttachmentId = `${attachment.id}-moved-${Date.now()}`;
          wrapQuery(
            db.prepare('INSERT INTO attachments (id, commentId, name, url, type, size) VALUES (?, ?, ?, ?, ?, ?)'),
            'INSERT'
          ).run(newAttachmentId, newCommentId, attachment.name, attachment.url, attachment.type, attachment.size);
        });
      });
      
      // Delete original task (cascade will handle related data)
      wrapQuery(
        db.prepare('DELETE FROM tasks WHERE id = ?'),
        'DELETE'
      ).run(taskId);
      
    })();
    
    res.json({ 
      success: true, 
      newTaskId,
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