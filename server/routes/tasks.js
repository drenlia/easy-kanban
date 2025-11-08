import express from 'express';
import { wrapQuery } from '../utils/queryLogger.js';
import { logTaskActivity, generateTaskUpdateDetails } from '../services/activityLogger.js';
import * as reportingLogger from '../services/reportingLogger.js';
import { TASK_ACTIONS } from '../constants/activityActions.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkTaskLimit } from '../middleware/licenseCheck.js';
import redisService from '../services/redisService.js';
import { getTranslator } from '../utils/i18n.js';

const router = express.Router();

// Helper function to fetch a task with all relationships (comments, watchers, collaborators, tags, attachmentCount)
function fetchTaskWithRelationships(db, taskId) {
  const task = wrapQuery(
    db.prepare(`
      SELECT t.*, 
             CASE WHEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) > 0 
                  THEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) 
                  ELSE NULL END as attachmentCount,
             json_group_array(
               DISTINCT CASE WHEN c.id IS NOT NULL THEN json_object(
                 'id', c.id,
                 'text', c.text,
                 'authorId', c.authorId,
                 'createdAt', c.createdAt,
                 'updated_at', c.updated_at,
                 'taskId', c.taskId,
                 'authorName', comment_author.name,
                 'authorColor', comment_author.color
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
                 'color', watcher.color
               ) ELSE NULL END
             ) as watchers,
             json_group_array(
               DISTINCT CASE WHEN collaborator.id IS NOT NULL THEN json_object(
                 'id', collaborator.id,
                 'name', collaborator.name,
                 'color', collaborator.color
               ) ELSE NULL END
             ) as collaborators
      FROM tasks t
      LEFT JOIN attachments a ON a.taskId = t.id AND a.commentId IS NULL
      LEFT JOIN comments c ON c.taskId = t.id
      LEFT JOIN members comment_author ON comment_author.id = c.authorId
      LEFT JOIN task_tags tt ON tt.taskId = t.id
      LEFT JOIN tags tag ON tag.id = tt.tagId
      LEFT JOIN watchers w ON w.taskId = t.id
      LEFT JOIN members watcher ON watcher.id = w.memberId
      LEFT JOIN collaborators col ON col.taskId = t.id
      LEFT JOIN members collaborator ON collaborator.id = col.memberId
      WHERE t.id = ?
      GROUP BY t.id
    `),
    'SELECT'
  ).get(taskId);
  
  if (!task) return null;
  
  // Parse JSON arrays and handle null values
  task.comments = task.comments === '[null]' || !task.comments 
    ? [] 
    : JSON.parse(task.comments).filter(Boolean);
  
  // Get attachments for each comment
  for (const comment of task.comments) {
    const attachments = wrapQuery(db.prepare(`
      SELECT id, name, url, type, size, created_at as createdAt
      FROM attachments
      WHERE commentId = ?
    `), 'SELECT').all(comment.id);
    comment.attachments = attachments || [];
  }
  
  task.tags = task.tags === '[null]' || !task.tags 
    ? [] 
    : JSON.parse(task.tags).filter(Boolean);
  task.watchers = task.watchers === '[null]' || !task.watchers 
    ? [] 
    : JSON.parse(task.watchers).filter(Boolean);
  task.collaborators = task.collaborators === '[null]' || !task.collaborators 
    ? [] 
    : JSON.parse(task.collaborators).filter(Boolean);
  
  // Convert snake_case to camelCase
  return {
    ...task,
    sprintId: task.sprint_id || null,
    createdAt: task.created_at,
    updatedAt: task.updated_at
  };
}

// Helper function to check for circular dependencies in task relationships
function checkForCycles(db, sourceTaskId, targetTaskId, relationship) {
  // Simple cycle detection:
  // If A wants to become parent of B, check if A is already a child of B
  // If A wants to become child of B, check if A is already a parent of B
  
  let oppositeRelationship;
  let checkTaskId, checkTargetId;
  
  if (relationship === 'parent') {
    // sourceTask wants to become parent of targetTask
    // Check if sourceTask is already a child of targetTask
    oppositeRelationship = 'child';
    checkTaskId = sourceTaskId;  // A
    checkTargetId = targetTaskId; // B
  } else if (relationship === 'child') {
    // sourceTask wants to become child of targetTask  
    // Check if sourceTask is already a parent of targetTask
    oppositeRelationship = 'parent';
    checkTaskId = sourceTaskId;  // A
    checkTargetId = targetTaskId; // B
  } else {
    // 'related' relationships don't create cycles
    return { hasCycle: false };
  }
  
  // Check if the opposite relationship already exists
  const existingOppositeRel = wrapQuery(db.prepare(`
    SELECT id FROM task_rels 
    WHERE task_id = ? AND relationship = ? AND to_task_id = ?
  `), 'SELECT').get(checkTaskId, oppositeRelationship, checkTargetId);
  
  if (existingOppositeRel) {
    const sourceTicket = getTaskTicket(db, sourceTaskId);
    const targetTicket = getTaskTicket(db, targetTaskId);
    
    return {
      hasCycle: true,
      reason: `${sourceTicket} is already ${oppositeRelationship} of ${targetTicket}`
    };
  }
  
  return { hasCycle: false };
}

// Helper function to get task ticket by ID
function getTaskTicket(db, taskId) {
  const task = wrapQuery(db.prepare('SELECT ticket FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
  return task ? task.ticket : 'Unknown';
}

// Utility function to generate task ticket numbers
const generateTaskTicket = (db, prefix = 'TASK-') => {
  const result = db.prepare(`
    SELECT ticket FROM tasks
    WHERE ticket IS NOT NULL AND ticket LIKE ?
    ORDER BY CAST(SUBSTR(ticket, ?) AS INTEGER) DESC
    LIMIT 1
  `).get(`${prefix}%`, prefix.length + 1);

  let nextNumber = 1;
  if (result && result.ticket) {
    const currentNumber = parseInt(result.ticket.substring(prefix.length));
    nextNumber = currentNumber + 1;
  }
  return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
};

// Helper function to log activity to reporting system
const logReportingActivity = async (db, eventType, userId, taskId, metadata = {}) => {
  try {
    // Get user info
    const userInfo = reportingLogger.getUserInfo(db, userId);
    if (!userInfo) {
      console.warn(`User ${userId} not found for reporting activity log`);
      return;
    }

    // Get task info
    const task = wrapQuery(db.prepare(`
      SELECT t.*, b.title as board_title, c.title as column_title, b.id as board_id
      FROM tasks t
      LEFT JOIN boards b ON t.boardId = b.id
      LEFT JOIN columns c ON t.columnId = c.id
      WHERE t.id = ?
    `), 'SELECT').get(taskId);

    if (!task) {
      console.warn(`Task ${taskId} not found for reporting activity log`);
      return;
    }

    // Get tags if any
    const taskTags = wrapQuery(db.prepare(`
      SELECT t.tag as name FROM task_tags tt
      JOIN tags t ON tt.tagId = t.id
      WHERE tt.taskId = ?
    `), 'SELECT').all(taskId);

    // Prepare event data
    const eventData = {
      eventType,
      userId: userInfo.id,
      userName: userInfo.name,
      userEmail: userInfo.email,
      taskId: task.id,
      taskTitle: task.title,
      taskTicket: task.ticket,
      boardId: task.boardId,
      boardName: task.board_title,
      columnId: task.columnId,
      columnName: task.column_title,
      effortPoints: task.effort,
      priorityName: task.priority,
      tags: taskTags.length > 0 ? taskTags.map(t => t.name) : null,
      ...metadata
    };

    // Log the activity
    await reportingLogger.logActivity(db, eventData);
  } catch (error) {
    console.error('Failed to log reporting activity:', error);
    // Don't throw - reporting should never break main functionality
  }
};

// Get all tasks
router.get('/', authenticateToken, (req, res) => {
  try {
    const { db } = req.app.locals;
    const tasks = wrapQuery(db.prepare(`
      SELECT t.*, 
             CASE WHEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) > 0 
                  THEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) 
                  ELSE NULL END as attachmentCount
      FROM tasks t
      LEFT JOIN attachments a ON a.taskId = t.id
      GROUP BY t.id
      ORDER BY t.position ASC
    `), 'SELECT').all();
    
    // Convert snake_case to camelCase for frontend
    const tasksWithCamelCase = tasks.map(task => ({
      ...task,
      sprintId: task.sprint_id || null,
      createdAt: task.created_at,
      updatedAt: task.updated_at
    }));
    
    res.json(tasksWithCamelCase);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToFetchTasks') });
  }
});

// Get task by ID or ticket
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const { db } = req.app.locals;
    const { id } = req.params;
    
    console.log('🔍 [TASK API] Getting task by ID:', { id, url: req.url });
    
    // Check if the ID looks like a ticket (e.g., TASK-00032) or a UUID
    const isTicket = /^[A-Z]+-\d+$/i.test(id);
    console.log('🔍 [TASK API] ID type detection:', { id, isTicket });
    
    // Get task with attachment count and priority info
    // Use separate prepared statements to avoid SQL injection
    const task = isTicket 
      ? wrapQuery(db.prepare(`
          SELECT t.*, 
                 p.id as priorityId,
                 p.priority as priorityName,
                 p.color as priorityColor,
                 c.title as status,
                 CASE WHEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) > 0 
                      THEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) 
                      ELSE NULL END as attachmentCount
          FROM tasks t
          LEFT JOIN attachments a ON a.taskId = t.id
          LEFT JOIN priorities p ON p.priority = t.priority
          LEFT JOIN columns c ON c.id = t.columnId
          WHERE t.ticket = ?
          GROUP BY t.id, p.id, c.id
        `), 'SELECT').get(id)
      : wrapQuery(db.prepare(`
          SELECT t.*, 
                 p.id as priorityId,
                 p.priority as priorityName,
                 p.color as priorityColor,
                 c.title as status,
                 CASE WHEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) > 0 
                      THEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) 
                      ELSE NULL END as attachmentCount
          FROM tasks t
          LEFT JOIN attachments a ON a.taskId = t.id
          LEFT JOIN priorities p ON p.priority = t.priority
          LEFT JOIN columns c ON c.id = t.columnId
          WHERE t.id = ?
          GROUP BY t.id, p.id, c.id
        `), 'SELECT').get(id);
    
    if (!task) {
      console.log('❌ [TASK API] Task not found for ID:', id);
      const t = getTranslator(db);
      return res.status(404).json({ error: t('errors.taskNotFound') });
    }
    
    console.log('✅ [TASK API] Found task:', { 
      id: task.id, 
      title: task.title, 
      priorityId: task.priorityId,
      status: task.status 
    });
    
    // Get comments for the task
    const comments = wrapQuery(db.prepare(`
      SELECT c.*, 
             m.name as authorName,
             m.color as authorColor
      FROM comments c
      LEFT JOIN members m ON c.authorId = m.id
      WHERE c.taskId = ?
      ORDER BY c.createdAt ASC
    `), 'SELECT').all(task.id);
    console.log('📝 [TASK API] Found comments:', comments.length);
    
    // Get attachments for each comment
    for (const comment of comments) {
      const attachments = wrapQuery(db.prepare(`
        SELECT id, name, url, type, size, created_at as createdAt
        FROM attachments
        WHERE commentId = ?
      `), 'SELECT').all(comment.id);
      comment.attachments = attachments;
    }
    
    // Get watchers for the task
    const watchers = wrapQuery(db.prepare(`
      SELECT m.* 
      FROM watchers w
      JOIN members m ON w.memberId = m.id
      WHERE w.taskId = ?
    `), 'SELECT').all(task.id);
    console.log('👀 [TASK API] Found watchers:', watchers.length);
    
    // Get collaborators for the task
    const collaborators = wrapQuery(db.prepare(`
      SELECT m.* 
      FROM collaborators c
      JOIN members m ON c.memberId = m.id
      WHERE c.taskId = ?
    `), 'SELECT').all(task.id);
    console.log('🤝 [TASK API] Found collaborators:', collaborators.length);
    
    // Get tags for the task
    const tags = wrapQuery(db.prepare(`
      SELECT t.* 
      FROM task_tags tt
      JOIN tags t ON tt.tagId = t.id
      WHERE tt.taskId = ?
    `), 'SELECT').all(task.id);
    console.log('🏷️ [TASK API] Found tags:', tags.length);
    
    // Add all related data to task
    task.comments = comments || [];
    task.watchers = watchers || [];
    task.collaborators = collaborators || [];
    task.tags = tags || [];
    
    // Convert snake_case to camelCase for frontend
    const taskResponse = {
      ...task,
      sprintId: task.sprint_id || null,
      createdAt: task.created_at,
      updatedAt: task.updated_at
    };
    
    console.log('📦 [TASK API] Final task data:', {
      id: taskResponse.id,
      title: taskResponse.title,
      commentsCount: taskResponse.comments.length,
      watchersCount: taskResponse.watchers.length,
      collaboratorsCount: taskResponse.collaborators.length,
      tagsCount: taskResponse.tags.length,
      priority: taskResponse.priority,
      priorityId: taskResponse.priorityId,
      status: taskResponse.status,
      sprintId: taskResponse.sprintId
    });
    
    res.json(taskResponse);
  } catch (error) {
    console.error('Error fetching task:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToFetchTask') });
  }
});

// Create task
router.post('/', authenticateToken, checkTaskLimit, async (req, res) => {
  const task = req.body;
  const userId = req.user?.id || 'system'; // Fallback for now
  
  try {
    const { db } = req.app.locals;
    const now = new Date().toISOString();
    
    // Generate task ticket number
    const taskPrefix = wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('DEFAULT_TASK_PREFIX')?.value || 'TASK-';
    const ticket = generateTaskTicket(db, taskPrefix);
    
    // Ensure dueDate defaults to startDate if not provided
    const dueDate = task.dueDate || task.startDate;
    
    // Create the task
    wrapQuery(db.prepare(`
      INSERT INTO tasks (id, title, description, ticket, memberId, requesterId, startDate, dueDate, effort, priority, columnId, boardId, position, sprint_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `), 'INSERT').run(
      task.id, task.title, task.description || '', ticket, task.memberId, task.requesterId,
      task.startDate, dueDate, task.effort, task.priority, task.columnId, task.boardId, task.position || 0, task.sprintId || null, now, now
    );
    
    // Log the activity (console only for now)
    await logTaskActivity(
      userId,
      TASK_ACTIONS.CREATE,
      task.id,
      `created task "${task.title}"`,
      { 
        columnId: task.columnId,
        boardId: task.boardId 
      }
    );
    
    // Log to reporting system
    await logReportingActivity(db, 'task_created', userId, task.id);
    
    // Add the generated ticket to the task object before publishing
    task.ticket = ticket;
    
    // Publish to Redis for real-time updates
    const publishTimestamp = new Date().toISOString();
    console.log(`📤 [${publishTimestamp}] Publishing task-created to Redis:`, {
      taskId: task.id,
      ticket: task.ticket,
      title: task.title,
      boardId: task.boardId
    });
    
    await redisService.publish('task-created', {
      boardId: task.boardId,
      task: task,
      timestamp: publishTimestamp
    });
    
    console.log(`✅ [${publishTimestamp}] task-created published to Redis successfully`);
    
    res.json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToCreateTask') });
  }
});

// Create task at top
router.post('/add-at-top', authenticateToken, checkTaskLimit, async (req, res) => {
  const task = req.body;
  const userId = req.user?.id || 'system';
  
  try {
    const { db } = req.app.locals;
    const now = new Date().toISOString();
    
    // Generate task ticket number
    const taskPrefix = wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('DEFAULT_TASK_PREFIX')?.value || 'TASK-';
    const ticket = generateTaskTicket(db, taskPrefix);
    
    // Ensure dueDate defaults to startDate if not provided
    const dueDate = task.dueDate || task.startDate;
    
    db.transaction(() => {
      wrapQuery(db.prepare('UPDATE tasks SET position = position + 1 WHERE columnId = ?'), 'UPDATE').run(task.columnId);
      wrapQuery(db.prepare(`
        INSERT INTO tasks (id, title, description, ticket, memberId, requesterId, startDate, dueDate, effort, priority, columnId, boardId, position, sprint_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `), 'INSERT').run(
        task.id, task.title, task.description || '', ticket, task.memberId, task.requesterId,
        task.startDate, dueDate, task.effort, task.priority, task.columnId, task.boardId, task.sprintId || null, now, now
      );
    })();
    
    // Log task creation activity
    await logTaskActivity(
      userId,
      TASK_ACTIONS.CREATE,
      task.id,
      `created task "${task.title}" at top of column`,
      { 
        columnId: task.columnId,
        boardId: task.boardId 
      }
    );
    
    // Log to reporting system
    await logReportingActivity(db, 'task_created', userId, task.id);
    
    // Add the generated ticket to the task object
    task.ticket = ticket;
    
    // Publish to Redis for real-time updates
    const publishTimestamp = new Date().toISOString();
    console.log(`📤 [${publishTimestamp}] Publishing task-created (at top) to Redis:`, {
      taskId: task.id,
      ticket: task.ticket,
      title: task.title,
      boardId: task.boardId
    });
    
    await redisService.publish('task-created', {
      boardId: task.boardId,
      task: task,
      timestamp: publishTimestamp
    });
    
    console.log(`✅ [${publishTimestamp}] task-created (at top) published to Redis successfully`);
    
    res.json(task);
  } catch (error) {
    console.error('Error creating task at top:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToCreateTaskAtTop') });
  }
});

// Update task
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const task = req.body;
  const userId = req.user?.id || 'system';
  
  try {
    const { db } = req.app.locals;
    const t = getTranslator(db);
    const now = new Date().toISOString();
    
    // Get current task for change tracking and previous location
    const currentTask = wrapQuery(db.prepare('SELECT * FROM tasks WHERE id = ?'), 'SELECT').get(id);
    if (!currentTask) {
      return res.status(404).json({ error: t('errors.taskNotFound') });
    }
    
    const previousColumnId = currentTask.columnId;
    const previousBoardId = currentTask.boardId;
    
    // Generate change details
    const changes = [];
    const fieldsToTrack = ['title', 'description', 'memberId', 'requesterId', 'startDate', 'dueDate', 'effort', 'priority', 'columnId'];
    
    fieldsToTrack.forEach(field => {
      if (currentTask[field] !== task[field]) {
        if (field === 'columnId') {
          // Special handling for column moves - get column titles for better readability
          const oldColumn = wrapQuery(db.prepare('SELECT title FROM columns WHERE id = ?'), 'SELECT').get(currentTask[field]);
          const newColumn = wrapQuery(db.prepare('SELECT title FROM columns WHERE id = ?'), 'SELECT').get(task[field]);
          const taskRef = task.ticket ? ` (${task.ticket})` : '';
          changes.push(`moved task "${task.title}"${taskRef} from "${oldColumn?.title || 'Unknown'}" to "${newColumn?.title || 'Unknown'}"`);
        } else {
          changes.push(generateTaskUpdateDetails(field, currentTask[field], task[field]));
        }
      }
    });
    
    wrapQuery(db.prepare(`
      UPDATE tasks SET title = ?, description = ?, memberId = ?, requesterId = ?, startDate = ?, 
      dueDate = ?, effort = ?, priority = ?, columnId = ?, boardId = ?, position = ?, 
      sprint_id = ?, pre_boardId = ?, pre_columnId = ?, updated_at = ? WHERE id = ?
    `), 'UPDATE').run(
      task.title, task.description, task.memberId, task.requesterId, task.startDate,
      task.dueDate, task.effort, task.priority, task.columnId, task.boardId, task.position || 0,
      task.sprintId || null, previousBoardId, previousColumnId, now, id
    );
    
    // Log activity if there were changes
    if (changes.length > 0) {
      const details = changes.length === 1 ? changes[0] : `updated task: ${changes.join(', ')}`;
      
      // For single field changes, pass old and new values for better email templates
      let oldValue, newValue;
      if (changes.length === 1) {
        // Find which field changed
        const changedField = fieldsToTrack.find(field => currentTask[field] !== task[field]);
        if (changedField) {
          oldValue = currentTask[changedField];
          newValue = task[changedField];
        }
      }
      
      await logTaskActivity(
        userId,
        TASK_ACTIONS.UPDATE,
        id,
        details,
        {
          columnId: task.columnId,
          boardId: task.boardId,
          oldValue,
          newValue
        }
      );
      
      // Log to reporting system
      // Check if this is a column move
      if (currentTask.columnId !== task.columnId) {
        // Get column info to check if task is completed
        const newColumn = wrapQuery(db.prepare('SELECT title, is_finished as is_done FROM columns WHERE id = ?'), 'SELECT').get(task.columnId);
        const oldColumn = wrapQuery(db.prepare('SELECT title FROM columns WHERE id = ?'), 'SELECT').get(currentTask.columnId);
        
        const eventType = newColumn?.is_done ? 'task_completed' : 'task_moved';
        await logReportingActivity(db, eventType, userId, id, {
          fromColumnId: currentTask.columnId,
          fromColumnName: oldColumn?.title,
          toColumnId: task.columnId,
          toColumnName: newColumn?.title
        });
      } else {
        // Regular update
        await logReportingActivity(db, 'task_updated', userId, id);
      }
    }
    
    // Fetch the updated task with all relationships (comments, watchers, collaborators, tags)
    // This ensures the WebSocket event includes complete task data so frontend doesn't need to merge
    const taskResponse = fetchTaskWithRelationships(db, id);
    
    // Publish to Redis for real-time updates (includes complete task data with relationships)
    const webSocketData = {
      boardId: taskResponse.boardId,
      task: {
        ...taskResponse,
        updatedBy: userId
      },
      timestamp: new Date().toISOString()
    };
    await redisService.publish('task-updated', webSocketData);
    
    res.json(taskResponse);
  } catch (error) {
    console.error('Error updating task:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToUpdateTask') });
  }
});

// Delete task
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id || 'system';
  
  try {
    const { db } = req.app.locals;
    
    // Get task details before deletion for logging
    const t = getTranslator(db);
    const task = wrapQuery(db.prepare('SELECT * FROM tasks WHERE id = ?'), 'SELECT').get(id);
    if (!task) {
      return res.status(404).json({ error: t('errors.taskNotFound') });
    }
    
    // Get board title for activity logging
    const board = wrapQuery(db.prepare('SELECT title FROM boards WHERE id = ?'), 'SELECT').get(task.boardId);
    const boardTitle = board ? board.title : 'Unknown Board';
    
    // Log to reporting system BEFORE deletion (while we can still fetch task data)
    await logReportingActivity(db, 'task_deleted', userId, id);
    
    // Get task attachments before deleting the task
    const attachmentsStmt = db.prepare('SELECT url FROM attachments WHERE taskId = ?');
    const attachments = wrapQuery(attachmentsStmt, 'SELECT').all(id);

    // Delete the attachment files from disk
    const path = await import('path');
    const fs = await import('fs');
    const { fileURLToPath } = await import('url');
    const { dirname } = await import('path');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    
    for (const attachment of attachments) {
      // Extract filename from URL (e.g., "/attachments/filename.ext" -> "filename.ext")
      const filename = attachment.url.replace('/attachments/', '');
      const filePath = path.join(__dirname, '..', 'attachments', filename);
      try {
        await fs.promises.unlink(filePath);
        console.log(`✅ Deleted file: ${filename}`);
      } catch (error) {
        console.error('Error deleting file:', error);
      }
    }
    
    // Delete the task (cascades to attachments and comments)
    wrapQuery(db.prepare('DELETE FROM tasks WHERE id = ?'), 'DELETE').run(id);
    
    // Renumber remaining tasks in the same column sequentially from 0
    const remainingTasksStmt = db.prepare(`
      SELECT id, position FROM tasks 
      WHERE columnId = ? AND boardId = ? 
      ORDER BY position ASC
    `);
    const remainingTasks = wrapQuery(remainingTasksStmt, 'SELECT').all(task.columnId, task.boardId);
    
    // Update positions sequentially from 0
    const updatePositionStmt = db.prepare('UPDATE tasks SET position = ? WHERE id = ?');
    remainingTasks.forEach((remainingTask, index) => {
      if (remainingTask.position !== index) {
        wrapQuery(updatePositionStmt, 'UPDATE').run(index, remainingTask.id);
      }
    });
    
    // Log deletion activity
    await logTaskActivity(
      userId,
      TASK_ACTIONS.DELETE,
      id,
      `deleted task "${task.title}" from board "${boardTitle}"`,
      {
        columnId: task.columnId,
        boardId: task.boardId
      }
    );
    
    // Publish to Redis for real-time updates
    await redisService.publish('task-deleted', {
      boardId: task.boardId,
      taskId: id,
      timestamp: new Date().toISOString()
    });
    
    res.json({ message: 'Task and attachments deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToDeleteTask') });
  }
});

// Reorder tasks
router.post('/reorder', authenticateToken, async (req, res) => {
  const { taskId, newPosition, columnId } = req.body;
  const userId = req.user?.id || 'system';
  
  try {
    const { db } = req.app.locals;
    const t = getTranslator(db);
    const currentTask = wrapQuery(db.prepare('SELECT position, columnId, boardId, title FROM tasks WHERE id = ?'), 'SELECT').get(taskId);

    if (!currentTask) {
      return res.status(404).json({ error: t('errors.taskNotFound') });
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

    // Log reorder activity
    await logTaskActivity(
      userId,
      TASK_ACTIONS.UPDATE, // Reorder is a type of update
      taskId,
      `reordered task "${currentTask.title}" from position ${currentPosition} to ${newPosition}`,
      {
        columnId: columnId,
        boardId: currentTask.boardId
      }
    );
    
    // Log to reporting system - check if column changed
    if (previousColumnId !== columnId) {
      // This is a column move
      const newColumn = wrapQuery(db.prepare('SELECT title, is_finished as is_done FROM columns WHERE id = ?'), 'SELECT').get(columnId);
      const oldColumn = wrapQuery(db.prepare('SELECT title FROM columns WHERE id = ?'), 'SELECT').get(previousColumnId);
      
      const eventType = newColumn?.is_done ? 'task_completed' : 'task_moved';
      await logReportingActivity(db, eventType, userId, taskId, {
        fromColumnId: previousColumnId,
        fromColumnName: oldColumn?.title,
        toColumnId: columnId,
        toColumnName: newColumn?.title
      });
    }

    // Get the updated task data with all relationships for WebSocket
    const taskResponse = fetchTaskWithRelationships(db, taskId);
    
    // Publish to Redis for real-time updates (includes complete task data with relationships)
    await redisService.publish('task-updated', {
      boardId: currentTask.boardId,
      task: {
        ...taskResponse,
        updatedBy: userId
      },
      timestamp: new Date().toISOString()
    });

    res.json({ message: 'Task reordered successfully' });
  } catch (error) {
    console.error('Error reordering task:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToReorderTask') });
  }
});

// Move task to different board
router.post('/move-to-board', authenticateToken, async (req, res) => {
  console.log('🔄 Cross-board move endpoint hit:', { taskId: req.body.taskId, targetBoardId: req.body.targetBoardId });
  const { taskId, targetBoardId } = req.body;
  const userId = req.user?.id || 'system';
  
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
      return res.status(404).json({ error: t('errors.taskNotFound') });
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
      }
    }
    
    if (!targetColumn) {
      return res.status(404).json({ error: t('errors.targetBoardHasNoColumns') });
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
    
    // Log move activity
    const originalBoard = wrapQuery(db.prepare('SELECT title FROM boards WHERE id = ?'), 'SELECT').get(originalBoardId);
    const targetBoard = wrapQuery(db.prepare('SELECT title FROM boards WHERE id = ?'), 'SELECT').get(targetBoardId);
    
    await logTaskActivity(
      userId,
      TASK_ACTIONS.MOVE,
      taskId,
      `moved task "${task.title}" from board "${originalBoard?.title || 'Unknown'}" to "${targetBoard?.title || 'Unknown'}"`,
      {
        columnId: targetColumn.id,
        boardId: targetBoardId
      }
    );
    
    // Log to reporting system
    const newColumn = wrapQuery(db.prepare('SELECT title, is_finished as is_done FROM columns WHERE id = ?'), 'SELECT').get(targetColumn.id);
    const oldColumn = wrapQuery(db.prepare('SELECT title FROM columns WHERE id = ?'), 'SELECT').get(originalColumnId);
    
    const eventType = newColumn?.is_done ? 'task_completed' : 'task_moved';
    await logReportingActivity(db, eventType, userId, taskId, {
      fromColumnId: originalColumnId,
      fromColumnName: oldColumn?.title,
      toColumnId: targetColumn.id,
      toColumnName: newColumn?.title
    });
    
    // Get the updated task data with all relationships for WebSocket
    const taskResponse = fetchTaskWithRelationships(db, taskId);
    
    // Publish to Redis for real-time updates (both boards need to be notified)
    // Includes complete task data with relationships
    await redisService.publish('task-updated', {
      boardId: originalBoardId,
      task: {
        ...taskResponse,
        updatedBy: userId
      },
      timestamp: new Date().toISOString()
    });
    
    await redisService.publish('task-updated', {
      boardId: targetBoardId,
      task: {
        ...taskResponse,
        updatedBy: userId
      },
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      newTaskId: taskId, // Return original taskId since we're not changing it
      targetColumnId: targetColumn.id,
      targetBoardId,
      message: 'Task moved successfully' 
    });
    
  } catch (error) {
    console.error('Error moving task to board:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToMoveTaskToBoard') });
  }
});

// Get tasks by board
router.get('/by-board/:boardId', authenticateToken, (req, res) => {
  const { boardId } = req.params;
  try {
    const { db } = req.app.locals;
    const tasks = wrapQuery(db.prepare(`
      SELECT t.*, 
             CASE WHEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) > 0 
                  THEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) 
                  ELSE NULL END as attachmentCount
      FROM tasks t
      LEFT JOIN attachments a ON a.taskId = t.id
      WHERE t.boardId = ?
      GROUP BY t.id
      ORDER BY t.position ASC
    `), 'SELECT').all(boardId);
    res.json(tasks);
  } catch (error) {
    console.error('Error getting tasks by board:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToGetTasks') });
  }
});

// Add watcher to task
router.post('/:taskId/watchers/:memberId', authenticateToken, async (req, res) => {
  try {
    const { db } = req.app.locals;
    const { taskId, memberId } = req.params;
    const userId = req.user?.id || 'system';
    
    const t = getTranslator(db);
    // Get task's board ID for Redis publishing
    const task = wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
    if (!task) {
      return res.status(404).json({ error: t('errors.taskNotFound') });
    }
    
    wrapQuery(db.prepare(`
      INSERT OR IGNORE INTO watchers (taskId, memberId, createdAt)
      VALUES (?, ?, ?)
    `), 'INSERT').run(taskId, memberId, new Date().toISOString());
    
    // Log to reporting system
    await logReportingActivity(db, 'watcher_added', userId, taskId);
    
    // Publish to Redis for real-time updates
    await redisService.publish('task-watcher-added', {
      boardId: task.boardId,
      taskId: taskId,
      memberId: memberId,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding watcher:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToAddWatcher') });
  }
});

// Remove watcher from task
router.delete('/:taskId/watchers/:memberId', async (req, res) => {
  try {
    const { db } = req.app.locals;
    const t = getTranslator(db);
    const { taskId, memberId } = req.params;
    
    // Get task's board ID for Redis publishing
    const task = wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
    if (!task) {
      return res.status(404).json({ error: t('errors.taskNotFound') });
    }
    
    wrapQuery(db.prepare(`
      DELETE FROM watchers WHERE taskId = ? AND memberId = ?
    `), 'DELETE').run(taskId, memberId);
    
    // Publish to Redis for real-time updates
    await redisService.publish('task-watcher-removed', {
      boardId: task.boardId,
      taskId: taskId,
      memberId: memberId,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing watcher:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToRemoveWatcher') });
  }
});

// Add collaborator to task
router.post('/:taskId/collaborators/:memberId', authenticateToken, async (req, res) => {
  try {
    const { db } = req.app.locals;
    const t = getTranslator(db);
    const { taskId, memberId } = req.params;
    const userId = req.user?.id || 'system';
    
    // Get task's board ID for Redis publishing
    const task = wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
    if (!task) {
      return res.status(404).json({ error: t('errors.taskNotFound') });
    }
    
    wrapQuery(db.prepare(`
      INSERT OR IGNORE INTO collaborators (taskId, memberId, createdAt)
      VALUES (?, ?, ?)
    `), 'INSERT').run(taskId, memberId, new Date().toISOString());
    
    // Log to reporting system
    await logReportingActivity(db, 'collaborator_added', userId, taskId);
    
    // Publish to Redis for real-time updates
    await redisService.publish('task-collaborator-added', {
      boardId: task.boardId,
      taskId: taskId,
      memberId: memberId,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding collaborator:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToAddCollaborator') });
  }
});

// Remove collaborator from task
router.delete('/:taskId/collaborators/:memberId', async (req, res) => {
  try {
    const { db } = req.app.locals;
    const t = getTranslator(db);
    const { taskId, memberId } = req.params;
    
    // Get task's board ID for Redis publishing
    const task = wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
    if (!task) {
      return res.status(404).json({ error: t('errors.taskNotFound') });
    }
    
    wrapQuery(db.prepare(`
      DELETE FROM collaborators WHERE taskId = ? AND memberId = ?
    `), 'DELETE').run(taskId, memberId);
    
    // Publish to Redis for real-time updates
    await redisService.publish('task-collaborator-removed', {
      boardId: task.boardId,
      taskId: taskId,
      memberId: memberId,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing collaborator:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToRemoveCollaborator') });
  }
});

// Task Relationships endpoints

// Get all relationships for a task
router.get('/:taskId/relationships', authenticateToken, (req, res) => {
  try {
    const { db } = req.app.locals;
    const { taskId } = req.params;
    
    // Get all relationships where this task is involved (as either task_id or to_task_id)
    const relationships = wrapQuery(db.prepare(`
      SELECT 
        tr.*,
        t1.title as task_title,
        t1.ticket as task_ticket,
        t1.boardId as task_board_id,
        t2.title as related_task_title,
        t2.ticket as related_task_ticket,
        t2.boardId as related_task_board_id,
        b1.project as task_project_id,
        b2.project as related_task_project_id
      FROM task_rels tr
      JOIN tasks t1 ON tr.task_id = t1.id
      JOIN tasks t2 ON tr.to_task_id = t2.id
      LEFT JOIN boards b1 ON t1.boardId = b1.id
      LEFT JOIN boards b2 ON t2.boardId = b2.id
      WHERE tr.task_id = ? OR tr.to_task_id = ?
      ORDER BY tr.created_at DESC
    `), 'SELECT').all(taskId, taskId);
    
    res.json(relationships);
  } catch (error) {
    console.error('Error fetching task relationships:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToFetchTaskRelationships') });
  }
});

// Create a task relationship
router.post('/:taskId/relationships', async (req, res) => {
  try {
    const { db } = req.app.locals;
    const t = getTranslator(db);
    const { taskId } = req.params;
    const { relationship, toTaskId } = req.body;
    
    // Validate relationship type
    if (!['child', 'parent', 'related'].includes(relationship)) {
      return res.status(400).json({ error: t('errors.invalidRelationshipType') });
    }
    
    // Prevent self-relationships
    if (taskId === toTaskId) {
      return res.status(400).json({ error: t('errors.cannotCreateRelationshipWithSelf') });
    }
    
    // Verify both tasks exist
    const taskExists = wrapQuery(db.prepare('SELECT id FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
    const toTaskExists = wrapQuery(db.prepare('SELECT id FROM tasks WHERE id = ?'), 'SELECT').get(toTaskId);
    
    if (!taskExists || !toTaskExists) {
      return res.status(404).json({ error: t('errors.oneOrBothTasksNotFound') });
    }
    
    // Check if relationship already exists
    const existingRelationship = wrapQuery(db.prepare(`
      SELECT id FROM task_rels 
      WHERE task_id = ? AND relationship = ? AND to_task_id = ?
    `), 'SELECT').get(taskId, relationship, toTaskId);
    
    if (existingRelationship) {
      return res.status(409).json({ error: t('errors.relationshipAlreadyExists') });
    }
    
    // Check for circular relationships (prevent cycles in parent/child hierarchies)
    if (relationship === 'parent' || relationship === 'child') {
      const wouldCreateCycle = checkForCycles(db, taskId, toTaskId, relationship);
      if (wouldCreateCycle.hasCycle) {
        return res.status(409).json({ 
          error: `Cannot create relationship: This would create a circular dependency. ${wouldCreateCycle.reason}` 
        });
      }
    }
    
    // Insert the relationship (use regular INSERT since we've validated above)
    const insertResult = wrapQuery(db.prepare(`
      INSERT INTO task_rels (task_id, relationship, to_task_id)
      VALUES (?, ?, ?)
    `), 'INSERT').run(taskId, relationship, toTaskId);
    
    // For parent/child relationships, also create the inverse relationship
    if (relationship === 'parent') {
      wrapQuery(db.prepare(`
        INSERT INTO task_rels (task_id, relationship, to_task_id)
        VALUES (?, 'child', ?)
      `), 'INSERT').run(toTaskId, taskId);
    } else if (relationship === 'child') {
      wrapQuery(db.prepare(`
        INSERT INTO task_rels (task_id, relationship, to_task_id)
        VALUES (?, 'parent', ?)
      `), 'INSERT').run(toTaskId, taskId);
    }
    
    console.log(`✅ Created relationship: ${taskId} (${relationship}) → ${toTaskId}`);
    
    // Verify the insertion was successful
    if (!insertResult || insertResult.changes === 0) {
      return res.status(500).json({ error: t('errors.failedToCreateRelationship') });
    }
    
    // Get the board ID for the source task to publish the update
    const sourceTask = wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
    const targetTask = wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(toTaskId);
    
    // Publish to Redis for real-time updates (both boards need to be notified)
    if (sourceTask?.boardId) {
      await redisService.publish('task-relationship-created', {
        boardId: sourceTask.boardId,
        taskId: taskId,
        relationship: relationship,
        toTaskId: toTaskId,
        timestamp: new Date().toISOString()
      });
    }
    
    if (targetTask?.boardId && targetTask.boardId !== sourceTask?.boardId) {
      await redisService.publish('task-relationship-created', {
        boardId: targetTask.boardId,
        taskId: taskId,
        relationship: relationship,
        toTaskId: toTaskId,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ success: true, message: 'Task relationship created successfully' });
  } catch (error) {
    const { db } = req.app.locals;
    const t = getTranslator(db);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: t('errors.relationshipAlreadyExists') });
    }
    console.error('Error creating task relationship:', error);
    res.status(500).json({ error: t('errors.failedToCreateTaskRelationship') });
  }
});

// Delete a task relationship
router.delete('/:taskId/relationships/:relationshipId', async (req, res) => {
  try {
    const { db } = req.app.locals;
    const t = getTranslator(db);
    const { taskId, relationshipId } = req.params;
    
    // Get the relationship details before deleting
    const relationship = wrapQuery(db.prepare(`
      SELECT * FROM task_rels WHERE id = ? AND task_id = ?
    `), 'SELECT').get(relationshipId, taskId);
    
    if (!relationship) {
      return res.status(404).json({ error: t('errors.relationshipNotFound') });
    }
    
    // Delete the main relationship
    wrapQuery(db.prepare(`
      DELETE FROM task_rels WHERE id = ?
    `), 'DELETE').run(relationshipId);
    
    // For parent/child relationships, also delete the inverse relationship
    if (relationship.relationship === 'parent') {
      wrapQuery(db.prepare(`
        DELETE FROM task_rels WHERE task_id = ? AND relationship = 'child' AND to_task_id = ?
      `), 'DELETE').run(relationship.to_task_id, relationship.task_id);
    } else if (relationship.relationship === 'child') {
      wrapQuery(db.prepare(`
        DELETE FROM task_rels WHERE task_id = ? AND relationship = 'parent' AND to_task_id = ?
      `), 'DELETE').run(relationship.to_task_id, relationship.task_id);
    }
    
    // Get the board ID for the source task to publish the update
    const sourceTask = wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
    const targetTask = wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(relationship.to_task_id);
    
    // Publish to Redis for real-time updates (both boards need to be notified)
    if (sourceTask?.boardId) {
      await redisService.publish('task-relationship-deleted', {
        boardId: sourceTask.boardId,
        taskId: taskId,
        relationship: relationship.relationship,
        toTaskId: relationship.to_task_id,
        timestamp: new Date().toISOString()
      });
    }
    
    if (targetTask?.boardId && targetTask.boardId !== sourceTask?.boardId) {
      await redisService.publish('task-relationship-deleted', {
        boardId: targetTask.boardId,
        taskId: taskId,
        relationship: relationship.relationship,
        toTaskId: relationship.to_task_id,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ success: true, message: 'Task relationship deleted successfully' });
  } catch (error) {
    console.error('Error deleting task relationship:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToDeleteTaskRelationship') });
  }
});

// Get tasks available for creating relationships (excludes current task and already related tasks)
router.get('/:taskId/available-for-relationship', authenticateToken, (req, res) => {
  try {
    const { db } = req.app.locals;
    const t = getTranslator(db);
    const { taskId } = req.params;
    
    // Get all tasks except the current one and already related ones
    const availableTasks = wrapQuery(db.prepare(`
      SELECT t.id, t.title, t.ticket, c.title as status, b.project as projectId
      FROM tasks t
      LEFT JOIN columns c ON t.columnId = c.id
      LEFT JOIN boards b ON t.boardId = b.id
      WHERE t.id != ?
      AND t.id NOT IN (
        SELECT to_task_id FROM task_rels WHERE task_id = ?
        UNION
        SELECT task_id FROM task_rels WHERE to_task_id = ?
      )
      ORDER BY t.ticket ASC
    `), 'SELECT').all(taskId, taskId, taskId);
    
    res.json(availableTasks);
  } catch (error) {
    console.error('Error fetching available tasks for relationship:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToFetchAvailableTasks') });
  }
});

// Get complete task flow chart data (optimized for visualization)
router.get('/:taskId/flow-chart', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { db } = req.app.locals;
    const t = getTranslator(db);
    
    console.log(`🌳 FlowChart API: Building flow chart for task: ${taskId}`);
    
    // Step 1: Get all connected tasks using a simpler approach
    // First, collect all task IDs that are connected through relationships
    const connectedTaskIds = new Set([taskId]);
    const processedIds = new Set();
    const toProcess = [taskId];
    
    // Iteratively find all connected tasks (avoiding recursion issues)
    while (toProcess.length > 0 && connectedTaskIds.size < 50) { // Limit to prevent infinite loops
      const currentId = toProcess.shift();
      if (processedIds.has(currentId)) continue;
      
      processedIds.add(currentId);
      
      // Find all tasks connected to current task
      const connected = wrapQuery(db.prepare(`
        SELECT DISTINCT 
          CASE 
            WHEN task_id = ? THEN to_task_id 
            ELSE task_id 
          END as connected_id
        FROM task_rels 
        WHERE task_id = ? OR to_task_id = ?
      `), 'SELECT').all(currentId, currentId, currentId);
      
      connected.forEach(row => {
        if (!connectedTaskIds.has(row.connected_id)) {
          connectedTaskIds.add(row.connected_id);
          toProcess.push(row.connected_id);
        }
      });
    }
    
    console.log(`🔍 FlowChart API: Found ${connectedTaskIds.size} connected tasks`);
    
    // Step 2: Get full task data for all connected tasks
    if (connectedTaskIds.size > 0) {
      const placeholders = Array(connectedTaskIds.size).fill('?').join(',');
      const tasksQuery = `
        SELECT 
          t.id,
          t.ticket,
          t.title,
          t.memberId,
          mem.name as memberName,
          mem.color as memberColor,
          c.title as status,
          t.priority,
          t.startDate,
          t.dueDate,
          b.project as projectId
        FROM tasks t
        LEFT JOIN members mem ON t.memberId = mem.id
        LEFT JOIN columns c ON t.columnId = c.id
        LEFT JOIN boards b ON t.boardId = b.id
        WHERE t.id IN (${placeholders})
      `;
      
      const tasks = wrapQuery(db.prepare(tasksQuery), 'SELECT').all(...Array.from(connectedTaskIds));
      
      // Step 3: Get all relationships between these tasks
      const relationshipsQuery = `
        SELECT 
          tr.id,
          tr.task_id,
          tr.relationship,
          tr.to_task_id,
          t1.ticket as task_ticket,
          t2.ticket as related_task_ticket
        FROM task_rels tr
        JOIN tasks t1 ON tr.task_id = t1.id
        JOIN tasks t2 ON tr.to_task_id = t2.id
        WHERE tr.task_id IN (${placeholders}) AND tr.to_task_id IN (${placeholders})
      `;
      
      const relationships = wrapQuery(db.prepare(relationshipsQuery), 'SELECT').all(...Array.from(connectedTaskIds), ...Array.from(connectedTaskIds));
      
      console.log(`✅ FlowChart API: Found ${tasks.length} tasks and ${relationships.length} relationships`);
      
      // Step 4: Build the response
      const response = {
        rootTaskId: taskId,
        tasks: tasks.map(task => ({
          id: task.id,
          ticket: task.ticket,
          title: task.title,
          memberId: task.memberId,
          memberName: task.memberName || 'Unknown',
          memberColor: task.memberColor || '#6366F1',
          status: task.status || 'Unknown',
          priority: task.priority || 'medium',
          startDate: task.startDate,
          dueDate: task.dueDate,
          projectId: task.projectId
        })),
        relationships: relationships.map(rel => ({
          id: rel.id,
          taskId: rel.task_id,
          relationship: rel.relationship,
          relatedTaskId: rel.to_task_id,
          taskTicket: rel.task_ticket,
          relatedTaskTicket: rel.related_task_ticket
        }))
      };
      
      res.json(response);
    } else {
      // No connected tasks, return just the root task
      const rootTaskQuery = `
        SELECT 
          t.id,
          t.ticket,
          t.title,
          t.memberId,
          mem.name as memberName,
          mem.color as memberColor,
          c.title as status,
          t.priority,
          t.startDate,
          t.dueDate,
          b.project as projectId
        FROM tasks t
        LEFT JOIN members mem ON t.memberId = mem.id
        LEFT JOIN columns c ON t.columnId = c.id
        LEFT JOIN boards b ON t.boardId = b.id
        WHERE t.id = ?
      `;
      
      const rootTask = wrapQuery(db.prepare(rootTaskQuery), 'SELECT').get(taskId);
      
      if (rootTask) {
        const response = {
          rootTaskId: taskId,
          tasks: [{
            id: rootTask.id,
            ticket: rootTask.ticket,
            title: rootTask.title,
            memberId: rootTask.memberId,
            memberName: rootTask.memberName || 'Unknown',
            memberColor: rootTask.memberColor || '#6366F1',
            status: rootTask.status || 'Unknown',
            priority: rootTask.priority || 'medium',
            startDate: rootTask.startDate,
            dueDate: rootTask.dueDate,
            projectId: rootTask.projectId
          }],
          relationships: []
        };
        
        res.json(response);
      } else {
        res.status(404).json({ error: t('errors.taskNotFound') });
      }
    }
    
  } catch (error) {
    console.error('❌ FlowChart API: Error getting flow chart data:', error);
    const { db } = req.app.locals;
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToGetFlowChartData') });
  }
});


export default router;