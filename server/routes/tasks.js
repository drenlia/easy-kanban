import express from 'express';
import { wrapQuery } from '../utils/queryLogger.js';
import { logTaskActivity, generateTaskUpdateDetails } from '../services/activityLogger.js';
import * as reportingLogger from '../services/reportingLogger.js';
import { TASK_ACTIONS } from '../constants/activityActions.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkTaskLimit } from '../middleware/licenseCheck.js';
import redisService from '../services/redisService.js';
import { getTranslator } from '../utils/i18n.js';
import { getRequestDatabase } from '../middleware/tenantRouting.js';
import { dbTransaction, dbRun, isProxyDatabase } from '../utils/dbAsync.js';

const router = express.Router();

// Helper function to get tenantId from request (for Redis channel isolation)
const getTenantId = (req) => {
  return req.tenantId || null;
};

// Helper function to fetch a task with all relationships (comments, watchers, collaborators, tags, attachmentCount)
async function fetchTaskWithRelationships(db, taskId) {
  const task = await wrapQuery(
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
      LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
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
  
  // Get attachments for all comments in one batch query (fixes N+1 problem)
  if (task.comments.length > 0) {
    const commentIds = task.comments.map(c => c.id).filter(Boolean);
    if (commentIds.length > 0) {
      const placeholders = commentIds.map(() => '?').join(',');
      const allAttachments = await wrapQuery(db.prepare(`
        SELECT commentId, id, name, url, type, size, created_at as createdAt
        FROM attachments
        WHERE commentId IN (${placeholders})
      `), 'SELECT').all(...commentIds);
      
      // Group attachments by commentId
      const attachmentsByCommentId = new Map();
      allAttachments.forEach(att => {
        if (!attachmentsByCommentId.has(att.commentId)) {
          attachmentsByCommentId.set(att.commentId, []);
        }
        attachmentsByCommentId.get(att.commentId).push(att);
      });
      
      // Assign attachments to each comment
      task.comments.forEach(comment => {
        comment.attachments = attachmentsByCommentId.get(comment.id) || [];
      });
    }
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
  
  // Get priority information if not already included
  let priorityId = task.priority_id || null;
  let priorityName = task.priority || null;
  let priorityColor = null;
  
  if (priorityId) {
    const priority = await wrapQuery(db.prepare('SELECT priority, color FROM priorities WHERE id = ?'), 'SELECT').get(priorityId);
    if (priority) {
      priorityName = priority.priority;
      priorityColor = priority.color;
    }
  } else if (priorityName) {
    const priority = await wrapQuery(db.prepare('SELECT id, color FROM priorities WHERE priority = ?'), 'SELECT').get(priorityName);
    if (priority) {
      priorityId = priority.id;
      priorityColor = priority.color;
    }
  }
  
  // Convert snake_case to camelCase
  return {
    ...task,
    priority: priorityName,
    priorityId: priorityId,
    priorityName: priorityName,
    priorityColor: priorityColor,
    sprintId: task.sprint_id || null,
    createdAt: task.created_at,
    updatedAt: task.updated_at
  };
}

// Batched version: Fetch multiple tasks with relationships in one query
// This is much faster than calling fetchTaskWithRelationships() for each task
async function fetchTasksWithRelationshipsBatch(db, taskIds) {
  if (!taskIds || taskIds.length === 0) {
    return [];
  }

  const placeholders = taskIds.map(() => '?').join(',');
  
  // Fetch all tasks with relationships in a single query
  const tasks = await wrapQuery(
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
      LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
      WHERE t.id IN (${placeholders})
      GROUP BY t.id
    `),
    'SELECT'
  ).all(...taskIds);

  if (tasks.length === 0) {
    return [];
  }

  // Collect all comment IDs to fetch attachments in one batch
  const allCommentIds = [];
  const commentIdToTaskId = new Map();
  
  tasks.forEach(task => {
    if (task.comments && task.comments !== '[null]') {
      try {
        const comments = JSON.parse(task.comments).filter(Boolean);
        comments.forEach(comment => {
          if (comment.id) {
            allCommentIds.push(comment.id);
            commentIdToTaskId.set(comment.id, task.id);
          }
        });
      } catch (e) {
        // Invalid JSON, skip
      }
    }
  });

  // Fetch all comment attachments in one query
  const allAttachments = [];
  if (allCommentIds.length > 0) {
    const attachmentPlaceholders = allCommentIds.map(() => '?').join(',');
    allAttachments.push(...await wrapQuery(db.prepare(`
      SELECT commentId, id, name, url, type, size, created_at as createdAt
      FROM attachments
      WHERE commentId IN (${attachmentPlaceholders})
    `), 'SELECT').all(...allCommentIds));
  }

  // Group attachments by commentId
  const attachmentsByCommentId = new Map();
  allAttachments.forEach(att => {
    if (!attachmentsByCommentId.has(att.commentId)) {
      attachmentsByCommentId.set(att.commentId, []);
    }
    attachmentsByCommentId.get(att.commentId).push(att);
  });

  // Collect all unique priority IDs and names to fetch in one batch
  const priorityIds = new Set();
  const priorityNames = new Set();
  
  tasks.forEach(task => {
    if (task.priority_id) {
      priorityIds.add(task.priority_id);
    }
    if (task.priority && !task.priority_id) {
      priorityNames.add(task.priority);
    }
  });

  // Fetch all priorities in one or two queries
  const priorityMap = new Map();
  
  if (priorityIds.size > 0) {
    const priorityIdPlaceholders = Array.from(priorityIds).map(() => '?').join(',');
    const priorities = await wrapQuery(db.prepare(`
      SELECT id, priority, color FROM priorities WHERE id IN (${priorityIdPlaceholders})
    `), 'SELECT').all(...Array.from(priorityIds));
    
    priorities.forEach(p => {
      priorityMap.set(p.id, p);
    });
  }
  
  if (priorityNames.size > 0) {
    const priorityNamePlaceholders = Array.from(priorityNames).map(() => '?').join(',');
    const priorities = await wrapQuery(db.prepare(`
      SELECT id, priority, color FROM priorities WHERE priority IN (${priorityNamePlaceholders})
    `), 'SELECT').all(...Array.from(priorityNames));
    
    priorities.forEach(p => {
      priorityMap.set(p.priority, p);
    });
  }

  // Process each task and attach relationships
  return tasks.map(task => {
    // Parse JSON arrays
    task.comments = task.comments === '[null]' || !task.comments 
      ? [] 
      : JSON.parse(task.comments).filter(Boolean);
    
    // Attach attachments to comments
    task.comments.forEach(comment => {
      comment.attachments = attachmentsByCommentId.get(comment.id) || [];
    });
    
    task.tags = task.tags === '[null]' || !task.tags 
      ? [] 
      : JSON.parse(task.tags).filter(Boolean);
    task.watchers = task.watchers === '[null]' || !task.watchers 
      ? [] 
      : JSON.parse(task.watchers).filter(Boolean);
    task.collaborators = task.collaborators === '[null]' || !task.collaborators 
      ? [] 
      : JSON.parse(task.collaborators).filter(Boolean);

    // Get priority information
    let priorityId = task.priority_id || null;
    let priorityName = task.priority || null;
    let priorityColor = null;

    if (priorityId && priorityMap.has(priorityId)) {
      const priority = priorityMap.get(priorityId);
      priorityName = priority.priority;
      priorityColor = priority.color;
    } else if (priorityName && priorityMap.has(priorityName)) {
      const priority = priorityMap.get(priorityName);
      priorityId = priority.id;
      priorityColor = priority.color;
    }

    // Convert snake_case to camelCase
    return {
      ...task,
      priority: priorityName,
      priorityId: priorityId,
      priorityName: priorityName,
      priorityColor: priorityColor,
      sprintId: task.sprint_id || null,
      createdAt: task.created_at,
      updatedAt: task.updated_at
    };
  });
}

// Helper function to check for circular dependencies in task relationships
async function checkForCycles(db, sourceTaskId, targetTaskId, relationship) {
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
  const existingOppositeRel = await wrapQuery(db.prepare(`
    SELECT id FROM task_rels 
    WHERE task_id = ? AND relationship = ? AND to_task_id = ?
  `), 'SELECT').get(checkTaskId, oppositeRelationship, checkTargetId);
  
  if (existingOppositeRel) {
    const sourceTicket = await getTaskTicket(db, sourceTaskId);
    const targetTicket = await getTaskTicket(db, targetTaskId);
    
    return {
      hasCycle: true,
      reason: `${sourceTicket} is already ${oppositeRelationship} of ${targetTicket}`
    };
  }
  
  return { hasCycle: false };
}

// Helper function to get task ticket by ID
async function getTaskTicket(db, taskId) {
  const task = await wrapQuery(db.prepare('SELECT ticket FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
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
    const userInfo = await reportingLogger.getUserInfo(db, userId);
    if (!userInfo) {
      console.warn(`User ${userId} not found for reporting activity log`);
      return;
    }

    // Get task info
    const task = await wrapQuery(db.prepare(`
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
    const taskTags = await wrapQuery(db.prepare(`
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
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const tasks = await wrapQuery(db.prepare(`
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
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToFetchTasks') });
  }
});

// Get task by ID or ticket
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { id } = req.params;
    
    console.log('🔍 [TASK API] Getting task by ID:', { id, url: req.url });
    
    // Check if the ID looks like a ticket (e.g., TASK-00032) or a UUID
    const isTicket = /^[A-Z]+-\d+$/i.test(id);
    console.log('🔍 [TASK API] ID type detection:', { id, isTicket });
    
    // Get task with attachment count and priority info
    // Use separate prepared statements to avoid SQL injection
    // Join on priority_id (preferred) or fallback to priority name for backward compatibility
    const task = isTicket 
      ? await wrapQuery(db.prepare(`
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
          LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
          LEFT JOIN columns c ON c.id = t.columnId
          WHERE t.ticket = ?
          GROUP BY t.id, p.id, c.id
        `), 'SELECT').get(id)
      : await wrapQuery(db.prepare(`
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
          LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
          LEFT JOIN columns c ON c.id = t.columnId
          WHERE t.id = ?
          GROUP BY t.id, p.id, c.id
        `), 'SELECT').get(id);
    
    if (!task) {
      console.log('❌ [TASK API] Task not found for ID:', id);
      const t = await getTranslator(db);
      return res.status(404).json({ error: t('errors.taskNotFound') });
    }
    
    console.log('✅ [TASK API] Found task:', { 
      id: task.id, 
      title: task.title, 
      priorityId: task.priorityId,
      status: task.status 
    });
    
    // Get comments for the task
    const comments = await wrapQuery(db.prepare(`
      SELECT c.*, 
             m.name as authorName,
             m.color as authorColor
      FROM comments c
      LEFT JOIN members m ON c.authorId = m.id
      WHERE c.taskId = ?
      ORDER BY c.createdAt ASC
    `), 'SELECT').all(task.id);
    console.log('📝 [TASK API] Found comments:', comments.length);
    
    // Get attachments for all comments in one batch query (fixes N+1 problem)
    if (comments.length > 0) {
      const commentIds = comments.map(c => c.id).filter(Boolean);
      if (commentIds.length > 0) {
        const placeholders = commentIds.map(() => '?').join(',');
        const allAttachments = await wrapQuery(db.prepare(`
          SELECT commentId, id, name, url, type, size, created_at as createdAt
          FROM attachments
          WHERE commentId IN (${placeholders})
        `), 'SELECT').all(...commentIds);
        
        // Group attachments by commentId
        const attachmentsByCommentId = new Map();
        allAttachments.forEach(att => {
          if (!attachmentsByCommentId.has(att.commentId)) {
            attachmentsByCommentId.set(att.commentId, []);
          }
          attachmentsByCommentId.get(att.commentId).push(att);
        });
        
        // Assign attachments to each comment
        comments.forEach(comment => {
          comment.attachments = attachmentsByCommentId.get(comment.id) || [];
        });
      }
    }
    
    // Get watchers for the task
    const watchers = await wrapQuery(db.prepare(`
      SELECT m.* 
      FROM watchers w
      JOIN members m ON w.memberId = m.id
      WHERE w.taskId = ?
    `), 'SELECT').all(task.id);
    console.log('👀 [TASK API] Found watchers:', watchers.length);
    
    // Get collaborators for the task
    const collaborators = await wrapQuery(db.prepare(`
      SELECT m.* 
      FROM collaborators c
      JOIN members m ON c.memberId = m.id
      WHERE c.taskId = ?
    `), 'SELECT').all(task.id);
    console.log('🤝 [TASK API] Found collaborators:', collaborators.length);
    
    // Get tags for the task
    const tags = await wrapQuery(db.prepare(`
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
    // Ensure priority information is available (from JOIN or fallback to task.priority)
    const taskResponse = {
      ...task,
      priority: task.priorityName || task.priority || null,
      priorityId: task.priorityId || null,
      priorityName: task.priorityName || task.priority || null,
      priorityColor: task.priorityColor || null,
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
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToFetchTask') });
  }
});

// Create task
router.post('/', authenticateToken, checkTaskLimit, async (req, res) => {
  const task = req.body;
  const userId = req.user?.id || 'system'; // Fallback for now
  
  try {
    const db = getRequestDatabase(req);
    const now = new Date().toISOString();
    
    // Generate task ticket number
    const taskPrefixSetting = await wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('DEFAULT_TASK_PREFIX');
    const taskPrefix = taskPrefixSetting?.value || 'TASK-';
    const ticket = generateTaskTicket(db, taskPrefix);
    
    // Ensure dueDate defaults to startDate if not provided
    const dueDate = task.dueDate || task.startDate;
    
    // Handle priority: prefer priority_id, but support priority name for backward compatibility
    let priorityId = task.priorityId || null;
    let priorityName = task.priority || null;
    
    // If priority_id is not provided but priority name is, look up the ID
    if (!priorityId && priorityName) {
      const priority = await wrapQuery(db.prepare('SELECT id FROM priorities WHERE priority = ?'), 'SELECT').get(priorityName);
      if (priority) {
        priorityId = priority.id;
      } else {
        // Fallback to default priority if name not found
        const defaultPriority = await wrapQuery(db.prepare('SELECT id FROM priorities WHERE initial = 1'), 'SELECT').get();
        priorityId = defaultPriority ? defaultPriority.id : null;
      }
    }
    
    // If still no priority_id, use default
    if (!priorityId) {
      const defaultPriority = await wrapQuery(db.prepare('SELECT id FROM priorities WHERE initial = 1'), 'SELECT').get();
      priorityId = defaultPriority ? defaultPriority.id : null;
      if (priorityId && !priorityName) {
        // Get the name for the default priority
        const defaultPriorityFull = await wrapQuery(db.prepare('SELECT priority FROM priorities WHERE id = ?'), 'SELECT').get(priorityId);
        priorityName = defaultPriorityFull ? defaultPriorityFull.priority : null;
      }
    }
    
    // Create the task
    await wrapQuery(db.prepare(`
      INSERT INTO tasks (id, title, description, ticket, memberId, requesterId, startDate, dueDate, effort, priority, priority_id, columnId, boardId, position, sprint_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `), 'INSERT').run(
      task.id, task.title, task.description || '', ticket, task.memberId, task.requesterId,
      task.startDate, dueDate, task.effort, priorityName, priorityId, task.columnId, task.boardId, task.position || 0, task.sprintId || null, now, now
    );
    
    // Log the activity (console only for now)
    const t = await getTranslator(db);
    const board = await wrapQuery(db.prepare('SELECT title FROM boards WHERE id = ?'), 'SELECT').get(task.boardId);
    const boardTitle = board ? board.title : 'Unknown Board';
    const taskRef = ticket ? ` (${ticket})` : '';
    // Fire-and-forget: Don't await activity logging to avoid blocking API response
    logTaskActivity(
      userId,
      TASK_ACTIONS.CREATE,
      task.id,
      t('activity.createdTask', { taskTitle: task.title, taskRef, boardTitle }),
      { 
        columnId: task.columnId,
        boardId: task.boardId,
        tenantId: getTenantId(req),
        db: db
      }
    ).catch(error => {
      console.error('Background activity logging failed:', error);
    });
    
    // Log to reporting system
    await logReportingActivity(db, 'task_created', userId, task.id);
    
    // Add the generated ticket to the task object before publishing
    task.ticket = ticket;
    
    // Fetch the created task with all relationships (including priority info from JOIN)
    // This ensures the WebSocket event includes complete task data with current priority name
    const taskResponse = await fetchTaskWithRelationships(db, task.id);
    
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
      task: taskResponse || task, // Use taskResponse if available, fallback to task
      timestamp: publishTimestamp
    }, getTenantId(req));
    
    console.log(`✅ [${publishTimestamp}] task-created published to Redis successfully`);
    
    res.json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToCreateTask') });
  }
});

// Create task at top
router.post('/add-at-top', authenticateToken, checkTaskLimit, async (req, res) => {
  const task = req.body;
  const userId = req.user?.id || 'system';
  
  try {
    const db = getRequestDatabase(req);
    const now = new Date().toISOString();
    
    // Generate task ticket number
    const taskPrefixSetting = await wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('DEFAULT_TASK_PREFIX');
    const taskPrefix = taskPrefixSetting?.value || 'TASK-';
    const ticket = generateTaskTicket(db, taskPrefix);
    
    // Ensure dueDate defaults to startDate if not provided
    const dueDate = task.dueDate || task.startDate;
    
    // Handle priority: prefer priority_id, but support priority name for backward compatibility
    let priorityId = task.priorityId || null;
    let priorityName = task.priority || null;
    
    // If priority_id is not provided but priority name is, look up the ID
    if (!priorityId && priorityName) {
      const priority = await wrapQuery(db.prepare('SELECT id FROM priorities WHERE priority = ?'), 'SELECT').get(priorityName);
      if (priority) {
        priorityId = priority.id;
      } else {
        // Fallback to default priority if name not found
        const defaultPriority = await wrapQuery(db.prepare('SELECT id FROM priorities WHERE initial = 1'), 'SELECT').get();
        priorityId = defaultPriority ? defaultPriority.id : null;
      }
    }
    
    // If still no priority_id, use default
    if (!priorityId) {
      const defaultPriority = await wrapQuery(db.prepare('SELECT id FROM priorities WHERE initial = 1'), 'SELECT').get();
      priorityId = defaultPriority ? defaultPriority.id : null;
      if (priorityId && !priorityName) {
        // Get the name for the default priority
        const defaultPriorityFull = await wrapQuery(db.prepare('SELECT priority FROM priorities WHERE id = ?'), 'SELECT').get(priorityId);
        priorityName = defaultPriorityFull ? defaultPriorityFull.priority : null;
      }
    }
    
    await dbTransaction(db, async () => {
      await wrapQuery(db.prepare('UPDATE tasks SET position = position + 1 WHERE columnId = ?'), 'UPDATE').run(task.columnId);
      await wrapQuery(db.prepare(`
        INSERT INTO tasks (id, title, description, ticket, memberId, requesterId, startDate, dueDate, effort, priority, priority_id, columnId, boardId, position, sprint_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `), 'INSERT').run(
        task.id, task.title, task.description || '', ticket, task.memberId, task.requesterId,
        task.startDate, dueDate, task.effort, priorityName, priorityId, task.columnId, task.boardId, task.sprintId || null, now, now
      );
    });
    
    // Log task creation activity (fire-and-forget: Don't await to avoid blocking API response)
    logTaskActivity(
      userId,
      TASK_ACTIONS.CREATE,
      task.id,
      `created task "${task.title}" at top of column`,
      { 
        columnId: task.columnId,
        boardId: task.boardId,
        tenantId: getTenantId(req),
        db: db
      }
    ).catch(error => {
      console.error('Background activity logging failed:', error);
    });
    
    // Log to reporting system
    await logReportingActivity(db, 'task_created', userId, task.id);
    
    // Add the generated ticket to the task object
    task.ticket = ticket;
    
    // Fetch the created task with all relationships (including priority info from JOIN)
    // This ensures the WebSocket event includes complete task data with current priority name
    const taskResponse = await fetchTaskWithRelationships(db, task.id);
    
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
      task: taskResponse || task, // Use taskResponse if available, fallback to task
      timestamp: publishTimestamp
    }, getTenantId(req));
    
    console.log(`✅ [${publishTimestamp}] task-created (at top) published to Redis successfully`);
    
    res.json(task);
  } catch (error) {
    console.error('Error creating task at top:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToCreateTaskAtTop') });
  }
});

// Update task
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const task = req.body;
  const userId = req.user?.id || 'system';
  
  const endpointStartTime = Date.now();
  
  try {
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    const now = new Date().toISOString();
    
    // Get current task for change tracking and previous location
    const validationStartTime = Date.now();
    const currentTask = await wrapQuery(db.prepare('SELECT * FROM tasks WHERE id = ?'), 'SELECT').get(id);
    if (!currentTask) {
      return res.status(404).json({ error: t('errors.taskNotFound') });
    }
    
    const previousColumnId = currentTask.columnId;
    const previousBoardId = currentTask.boardId;
    
    // Handle priority: prefer priority_id, but support priority name for backward compatibility
    let priorityId = task.priorityId || null;
    let priorityName = task.priority || null;
    
    // Get current task's priority info for comparison
    let currentPriorityId = currentTask.priority_id;
    let currentPriorityName = currentTask.priority;
    
    // If current task has priority_id but not priority name, look it up
    if (currentPriorityId && !currentPriorityName) {
      const currentPriority = await wrapQuery(db.prepare('SELECT priority FROM priorities WHERE id = ?'), 'SELECT').get(currentPriorityId);
      if (currentPriority) {
        currentPriorityName = currentPriority.priority;
      }
    }
    
    // If priority_id is not provided but priority name is, look up the ID
    if (!priorityId && priorityName) {
      const priority = await wrapQuery(db.prepare('SELECT id FROM priorities WHERE priority = ?'), 'SELECT').get(priorityName);
      if (priority) {
        priorityId = priority.id;
      } else {
        // Priority name not found, keep existing priority_id
        priorityId = currentTask.priority_id;
        // Get the name for the existing priority_id
        if (priorityId) {
          const existingPriority = await wrapQuery(db.prepare('SELECT priority FROM priorities WHERE id = ?'), 'SELECT').get(priorityId);
          priorityName = existingPriority ? existingPriority.priority : priorityName;
        }
      }
    }
    
    // If priority_id is provided, get the name for change tracking
    if (priorityId && !priorityName) {
      const priority = await wrapQuery(db.prepare('SELECT priority FROM priorities WHERE id = ?'), 'SELECT').get(priorityId);
      priorityName = priority ? priority.priority : null;
    }
    
    // If neither is provided, keep existing values
    if (!priorityId && !priorityName) {
      priorityId = currentTask.priority_id;
      priorityName = currentTask.priority || currentPriorityName;
    }
    
    // Generate change details
    const changes = [];
    const fieldsToTrack = ['title', 'description', 'memberId', 'requesterId', 'startDate', 'dueDate', 'effort', 'columnId'];
    
    // Check if priority changed (by ID or name) - only if values are actually different
    const priorityIdChanged = priorityId && currentPriorityId && priorityId !== currentPriorityId;
    const priorityNameChanged = priorityName && currentPriorityName && priorityName !== currentPriorityName;
    const priorityChanged = priorityIdChanged || priorityNameChanged;
    
    if (priorityChanged) {
      const oldPriority = currentPriorityName || 'Unknown';
      const newPriority = priorityName || 'Unknown';
      changes.push(await generateTaskUpdateDetails('priorityId', oldPriority, newPriority, '', db));
    }
    
    // Process fields sequentially to handle async operations
    for (const field of fieldsToTrack) {
      if (currentTask[field] !== task[field]) {
        if (field === 'columnId') {
          // Special handling for column moves - get column titles for better readability
          const oldColumn = await wrapQuery(db.prepare('SELECT title FROM columns WHERE id = ?'), 'SELECT').get(currentTask[field]);
          const newColumn = await wrapQuery(db.prepare('SELECT title FROM columns WHERE id = ?'), 'SELECT').get(task[field]);
          const taskRef = task.ticket ? ` (${task.ticket})` : '';
          const movedTaskText = t('activity.movedTaskFromTo', {
            taskTitle: task.title,
            taskRef,
            fromColumn: oldColumn?.title || 'Unknown',
            toColumn: newColumn?.title || 'Unknown'
          });
          changes.push(movedTaskText);
        } else {
          changes.push(await generateTaskUpdateDetails(field, currentTask[field], task[field], '', db));
        }
      }
    }
    
    const validationTime = Date.now() - validationStartTime;
    console.log(`⏱️  [PUT /tasks/:id] Task validation took ${validationTime}ms`);
    
    const dbUpdateStartTime = Date.now();
    await wrapQuery(db.prepare(`
      UPDATE tasks SET title = ?, description = ?, memberId = ?, requesterId = ?, startDate = ?, 
      dueDate = ?, effort = ?, priority = ?, priority_id = ?, columnId = ?, boardId = ?, position = ?, 
      sprint_id = ?, pre_boardId = ?, pre_columnId = ?, updated_at = ? WHERE id = ?
    `), 'UPDATE').run(
      task.title, task.description, task.memberId, task.requesterId, task.startDate,
      task.dueDate, task.effort, priorityName, priorityId, task.columnId, task.boardId, task.position || 0,
      task.sprintId || null, previousBoardId, previousColumnId, now, id
    );
    const dbUpdateTime = Date.now() - dbUpdateStartTime;
    console.log(`⏱️  [PUT /tasks/:id] Database updates took ${dbUpdateTime}ms`);
    
    // Log activity if there were changes
    if (changes.length > 0) {
      const activityStartTime = Date.now();
      const details = changes.length === 1 ? changes[0] : `${t('activity.updatedTaskPrefix')} ${changes.join(', ')}`;
      
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
      
      // Fire-and-forget: Don't await activity logging to avoid blocking API response
      // Activity logging can take 500-600ms on EFS, but we don't need to wait for it
      logTaskActivity(
        userId,
        TASK_ACTIONS.UPDATE,
        id,
        details,
        {
          columnId: task.columnId,
          boardId: task.boardId,
          oldValue,
          newValue,
          tenantId: getTenantId(req),
          db: db
        }
      ).catch(error => {
        console.error('Background activity logging failed:', error);
        // Don't throw - activity logging should never break main flow
      });
      const activityTime = Date.now() - activityStartTime;
      console.log(`⏱️  [PUT /tasks/:id] Activity logging took ${activityTime}ms`);
      
      // Log to reporting system (fire-and-forget: Don't await to avoid blocking API response)
      // Check if this is a column move
      if (currentTask.columnId !== task.columnId) {
        // Get column info to check if task is completed
        const newColumn = await wrapQuery(db.prepare('SELECT title, is_finished as is_done FROM columns WHERE id = ?'), 'SELECT').get(task.columnId);
        const oldColumn = await wrapQuery(db.prepare('SELECT title FROM columns WHERE id = ?'), 'SELECT').get(currentTask.columnId);
        
        const eventType = newColumn?.is_done ? 'task_completed' : 'task_moved';
        logReportingActivity(db, eventType, userId, id, {
          fromColumnId: currentTask.columnId,
          fromColumnName: oldColumn?.title,
          toColumnId: task.columnId,
          toColumnName: newColumn?.title
        }).catch(error => {
          console.error('Background reporting activity logging failed:', error);
        });
      } else {
        // Regular update
        logReportingActivity(db, 'task_updated', userId, id).catch(error => {
          console.error('Background reporting activity logging failed:', error);
        });
      }
    }
    
    // Fetch the updated task with all relationships (comments, watchers, collaborators, tags)
    // This ensures the WebSocket event includes complete task data so frontend doesn't need to merge
    const fetchStartTime = Date.now();
    const taskResponse = await fetchTaskWithRelationships(db, id);
    const fetchTime = Date.now() - fetchStartTime;
    console.log(`⏱️  [PUT /tasks/:id] Fetching task with relationships took ${fetchTime}ms`);
    
    // Publish to Redis for real-time updates (includes complete task data with relationships)
    const wsStartTime = Date.now();
    const webSocketData = {
      boardId: taskResponse.boardId,
      task: {
        ...taskResponse,
        updatedBy: userId
      },
      timestamp: new Date().toISOString()
    };
    await redisService.publish('task-updated', webSocketData, getTenantId(req));
    const wsTime = Date.now() - wsStartTime;
    console.log(`⏱️  [PUT /tasks/:id] WebSocket publishing took ${wsTime}ms`);
    
    const totalTime = Date.now() - endpointStartTime;
    console.log(`⏱️  [PUT /tasks/:id] Total endpoint time: ${totalTime}ms`);
    
    res.json(taskResponse);
  } catch (error) {
    console.error('Error updating task:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToUpdateTask') });
  }
});

// Batch update tasks (for timeline arrow key movements and other bulk updates)
router.post('/batch-update', authenticateToken, async (req, res) => {
  const { tasks } = req.body; // Array of task objects to update
  const userId = req.user?.id || 'system';
  
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return res.status(400).json({ error: 'Invalid tasks array' });
  }
  
  try {
    const endpointStartTime = Date.now();
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    const now = new Date().toISOString();
    
    // Validate all tasks exist
    const taskIds = tasks.map(t => t.id);
    const taskIdPlaceholders = taskIds.map(() => '?').join(',');
    const existingTasks = await wrapQuery(
      db.prepare(`SELECT id, columnId, boardId, priority_id, priority FROM tasks WHERE id IN (${taskIdPlaceholders})`),
      'SELECT'
    ).all(...taskIds);
    
    const existingTaskMap = new Map(existingTasks.map(t => [t.id, t]));
    const missingTasks = taskIds.filter(id => !existingTaskMap.has(id));
    
    if (missingTasks.length > 0) {
      return res.status(404).json({ error: t('errors.taskNotFound') + `: ${missingTasks.join(', ')}` });
    }
    
    // Get all priorities for lookup
    const allPriorities = await wrapQuery(db.prepare('SELECT id, priority FROM priorities'), 'SELECT').all();
    const priorityMap = new Map(allPriorities.map(p => [p.priority, p.id]));
    const priorityIdMap = new Map(allPriorities.map(p => [p.id, p.priority]));
    
    if (isProxyDatabase(db)) {
      // Proxy mode: Collect all queries and send as batch
      const batchQueries = [];
      const updateQuery = `
        UPDATE tasks SET 
          title = ?, description = ?, memberId = ?, requesterId = ?, startDate = ?, 
          dueDate = ?, effort = ?, priority = ?, priority_id = ?, columnId = ?, boardId = ?, position = ?, 
          sprint_id = ?, pre_boardId = ?, pre_columnId = ?, updated_at = ? 
        WHERE id = ?
      `;
      
      for (const task of tasks) {
        const currentTask = existingTaskMap.get(task.id);
        if (!currentTask) continue;
        
        const previousColumnId = currentTask.columnId;
        const previousBoardId = currentTask.boardId;
        
        // Handle priority: prefer priority_id, but support priority name for backward compatibility
        let priorityId = task.priorityId || null;
        let priorityName = task.priority || null;
        
        // If priority_id is not provided but priority name is, look it up
        if (!priorityId && priorityName) {
          priorityId = priorityMap.get(priorityName) || null;
        }
        
        // If priority_id is provided, get the name
        if (priorityId && !priorityName) {
          priorityName = priorityIdMap.get(priorityId) || null;
        }
        
        // If neither is provided, keep existing values
        if (!priorityId && !priorityName) {
          priorityId = currentTask.priority_id;
          priorityName = currentTask.priority;
        }
        
        batchQueries.push({
          query: updateQuery,
          params: [
            task.title, task.description, task.memberId, task.requesterId, task.startDate,
            task.dueDate, task.effort, priorityName, priorityId, task.columnId, task.boardId, task.position || 0,
            task.sprintId || null, previousBoardId, previousColumnId, now, task.id
          ]
        });
      }
      
      // Execute all updates in a single batched transaction
      console.log(`🚀 [batch-update] Using batched transaction for ${batchQueries.length} updates (proxy mode)`);
      await db.executeBatchTransaction(batchQueries);
      console.log(`✅ [batch-update] Batched transaction completed in ${Date.now() - endpointStartTime}ms for ${batchQueries.length} updates`);
    } else {
      // Direct DB mode: Use standard transaction
      await dbTransaction(db, async () => {
        const updateStmt = db.prepare(`
          UPDATE tasks SET 
            title = ?, description = ?, memberId = ?, requesterId = ?, startDate = ?, 
            dueDate = ?, effort = ?, priority = ?, priority_id = ?, columnId = ?, boardId = ?, position = ?, 
            sprint_id = ?, pre_boardId = ?, pre_columnId = ?, updated_at = ? 
          WHERE id = ?
        `);
        
        for (const task of tasks) {
          const currentTask = existingTaskMap.get(task.id);
          if (!currentTask) continue;
          
          const previousColumnId = currentTask.columnId;
          const previousBoardId = currentTask.boardId;
          
          // Handle priority
          let priorityId = task.priorityId || null;
          let priorityName = task.priority || null;
          
          if (!priorityId && priorityName) {
            priorityId = priorityMap.get(priorityName) || null;
          }
          
          if (priorityId && !priorityName) {
            priorityName = priorityIdMap.get(priorityId) || null;
          }
          
          if (!priorityId && !priorityName) {
            priorityId = currentTask.priority_id;
            priorityName = currentTask.priority;
          }
          
          await wrapQuery(updateStmt, 'UPDATE').run(
            task.title, task.description, task.memberId, task.requesterId, task.startDate,
            task.dueDate, task.effort, priorityName, priorityId, task.columnId, task.boardId, task.position || 0,
            task.sprintId || null, previousBoardId, previousColumnId, now, task.id
          );
        }
      });
    }
    
    // Fetch all updated tasks with relationships (batched)
    const fetchStartTime = Date.now();
    const taskResponses = await fetchTasksWithRelationshipsBatch(db, taskIds);
    console.log(`⏱️  [batch-update] Fetching ${taskIds.length} tasks with relationships (batched) took ${Date.now() - fetchStartTime}ms`);
    
    // Publish WebSocket updates for all changed tasks in the background (non-blocking)
    // JSON.stringify() on large task objects can be slow, so we don't block the response
    const publishPromises = taskResponses.map(task =>
      redisService.publish('task-updated', {
        boardId: task.boardId,
        task: {
          ...task,
          updatedBy: userId
        },
        timestamp: new Date().toISOString()
      }, getTenantId(req)).catch(error => {
        console.error('❌ Background WebSocket publish failed:', error);
      })
    );
    
    // Start publishing in background (fire-and-forget)
    Promise.all(publishPromises).catch(error => {
      console.error('❌ Background WebSocket publish batch failed:', error);
    });
    
    console.log(`⏱️  [batch-update] Total endpoint time: ${Date.now() - endpointStartTime}ms for ${tasks.length} updates (WebSocket publishing in background)`);
    
    res.json({ tasks: taskResponses, updated: taskResponses.length });
  } catch (error) {
    console.error('Error batch updating tasks:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToUpdateTask') });
  }
});

// Delete task
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id || 'system';
  
  try {
    const db = getRequestDatabase(req);
    
    // Get task details before deletion for logging
    const t = await getTranslator(db);
    const task = await wrapQuery(db.prepare('SELECT * FROM tasks WHERE id = ?'), 'SELECT').get(id);
    if (!task) {
      return res.status(404).json({ error: t('errors.taskNotFound') });
    }
    
    // Get board title for activity logging
    const board = await wrapQuery(db.prepare('SELECT title FROM boards WHERE id = ?'), 'SELECT').get(task.boardId);
    const boardTitle = board ? board.title : 'Unknown Board';
    
    // Log to reporting system BEFORE deletion (while we can still fetch task data)
    await logReportingActivity(db, 'task_deleted', userId, id);
    
    // Get task attachments before deleting the task
    const attachmentsStmt = db.prepare('SELECT url FROM attachments WHERE taskId = ?');
    const attachments = await wrapQuery(attachmentsStmt, 'SELECT').all(id);

    // Delete the attachment files from disk
    const path = await import('path');
    const fs = await import('fs');
    const { fileURLToPath } = await import('url');
    const { dirname } = await import('path');
    const __filename = fileURLToPath(import.meta.url);
    // Get tenant-specific storage paths (set by tenant routing middleware)
    const getStoragePaths = (req) => {
      // Check req.locals first (multi-tenant mode) then req.app.locals (single-tenant mode)
      if (req.locals?.tenantStoragePaths) {
        return req.locals.tenantStoragePaths;
      }
      if (req.app.locals?.tenantStoragePaths) {
        return req.app.locals.tenantStoragePaths;
      }
      // Fallback to base paths (single-tenant mode)
      const basePath = process.env.DOCKER_ENV === 'true'
        ? '/app/server'
        : dirname(dirname(__filename));
      return {
        attachments: path.join(basePath, 'attachments'),
        avatars: path.join(basePath, 'avatars')
      };
    };
    
    const storagePaths = getStoragePaths(req);
    
    for (const attachment of attachments) {
      // Extract filename from URL (e.g., "/attachments/filename.ext" or "/api/files/attachments/filename.ext" -> "filename.ext")
      const filename = attachment.url.replace('/attachments/', '').replace('/api/files/attachments/', '');
      const filePath = path.join(storagePaths.attachments, filename);
      try {
        await fs.promises.unlink(filePath);
        console.log(`✅ Deleted file: ${filename}`);
      } catch (error) {
        console.error('Error deleting file:', error);
      }
    }
    
    // Delete the task (cascades to attachments and comments)
    await wrapQuery(db.prepare('DELETE FROM tasks WHERE id = ?'), 'DELETE').run(id);
    
    // Update storage usage after deleting task (which cascades to attachments)
    // Import updateStorageUsage dynamically to avoid circular dependencies
    const { updateStorageUsage } = await import('../utils/storageUtils.js');
    await updateStorageUsage(db);
    
    // Renumber remaining tasks in the same column sequentially from 0
    const remainingTasksStmt = db.prepare(`
      SELECT id, position FROM tasks 
      WHERE columnId = ? AND boardId = ? 
      ORDER BY position ASC
    `);
    const remainingTasks = await wrapQuery(remainingTasksStmt, 'SELECT').all(task.columnId, task.boardId);
    
    // Update positions sequentially from 0
    const updatePositionStmt = db.prepare('UPDATE tasks SET position = ? WHERE id = ?');
    for (let index = 0; index < remainingTasks.length; index++) {
      const remainingTask = remainingTasks[index];
      if (remainingTask.position !== index) {
        await wrapQuery(updatePositionStmt, 'UPDATE').run(index, remainingTask.id);
      }
    }
    
    // Log deletion activity
    // Fire-and-forget: Don't await activity logging to avoid blocking API response
    logTaskActivity(
      userId,
      TASK_ACTIONS.DELETE,
      id,
      t('activity.deletedTask', { taskTitle: task.title, taskRef: '', boardTitle: boardTitle }),
      {
        columnId: task.columnId,
        boardId: task.boardId,
        tenantId: getTenantId(req),
        db: db
      }
    ).catch(error => {
      console.error('Background activity logging failed:', error);
    });
    
    // Publish to Redis for real-time updates
    await redisService.publish('task-deleted', {
      boardId: task.boardId,
      taskId: id,
      timestamp: new Date().toISOString()
    }, getTenantId(req));
    
    res.json({ message: 'Task and attachments deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToDeleteTask') });
  }
});

// Batch update task positions (optimized for drag-and-drop reordering)
router.post('/batch-update-positions', authenticateToken, async (req, res) => {
  const { updates } = req.body; // Array of { taskId, position, columnId }
  const userId = req.user?.id || 'system';
  
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'Invalid updates array' });
  }
  
  try {
    const endpointStartTime = Date.now();
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    const now = new Date().toISOString();
    
    // Validate all tasks exist and get their current data
    const validateStartTime = Date.now();
    const taskIds = updates.map(u => u.taskId);
    const placeholders = taskIds.map(() => '?').join(',');
    const currentTasks = await wrapQuery(
      db.prepare(`SELECT id, position, columnId, boardId, title FROM tasks WHERE id IN (${placeholders})`),
      'SELECT'
    ).all(...taskIds);
    console.log(`⏱️  [batch-update-positions] Task validation took ${Date.now() - validateStartTime}ms`);
    
    if (currentTasks.length !== taskIds.length) {
      return res.status(404).json({ error: t('errors.taskNotFound') });
    }
    
    const taskMap = new Map(currentTasks.map(t => [t.id, t]));
    
    // Group updates by column for efficient batch processing
    const updatesByColumn = new Map();
    updates.forEach(update => {
      const currentTask = taskMap.get(update.taskId);
      if (!currentTask) return;
      
      const columnId = update.columnId || currentTask.columnId;
      if (!updatesByColumn.has(columnId)) {
        updatesByColumn.set(columnId, []);
      }
      updatesByColumn.get(columnId).push({
        taskId: update.taskId,
        position: update.position,
        columnId: columnId,
        previousColumnId: currentTask.columnId,
        previousBoardId: currentTask.boardId,
        previousPosition: currentTask.position,
        title: currentTask.title
      });
    });
    
    // Execute all updates in a single transaction
    // For proxy databases, use batched transaction endpoint for better performance
    // For direct databases, use standard transaction
    if (isProxyDatabase(db)) {
      // Proxy mode: Collect all queries and send as batch
      const batchQueries = [];
      const updateQuery = `
        UPDATE tasks SET 
          position = ?, 
          columnId = ?,
          pre_boardId = ?, 
          pre_columnId = ?,
          updated_at = ?
        WHERE id = ?
      `;
      
      for (const columnUpdates of updatesByColumn.values()) {
        for (const update of columnUpdates) {
          batchQueries.push({
            query: updateQuery,
            params: [
              update.position,
              update.columnId,
              update.previousBoardId,
              update.previousColumnId,
              now,
              update.taskId
            ]
          });
        }
      }
      
      console.log(`🚀 [batch-update-positions] Using batched transaction for ${batchQueries.length} updates (proxy mode)`);
      const startTime = Date.now();
      
      // Execute all updates in a single batched transaction
      await db.executeBatchTransaction(batchQueries);
      
      const duration = Date.now() - startTime;
      console.log(`✅ [batch-update-positions] Batched transaction completed in ${duration}ms for ${batchQueries.length} updates`);
    } else {
      // Direct DB mode: Use standard transaction
      await dbTransaction(db, async () => {
        const updateStmt = db.prepare(`
          UPDATE tasks SET 
            position = ?, 
            columnId = ?,
            pre_boardId = ?, 
            pre_columnId = ?,
            updated_at = ?
          WHERE id = ?
        `);
        
        // Wrap the statement for async support
        const wrappedStmt = wrapQuery(updateStmt, 'UPDATE');
        
        // Execute all updates
        for (const columnUpdates of updatesByColumn.values()) {
          for (const update of columnUpdates) {
            await dbRun(wrappedStmt,
              update.position,
              update.columnId,
              update.previousBoardId,
              update.previousColumnId,
              now,
              update.taskId
            );
          }
        }
      });
    }
    
    // Log activity for tasks that changed columns (batch these too if possible)
    const columnMoves = [];
    updatesByColumn.forEach((columnUpdates, columnId) => {
      columnUpdates.forEach(update => {
        if (update.previousColumnId !== update.columnId) {
          columnMoves.push(update);
        }
      });
    });
    
    // Batch fetch column info for activity logging
    if (columnMoves.length > 0) {
      const activityStartTime = Date.now();
      const columnIds = [...new Set([...columnMoves.map(m => m.columnId), ...columnMoves.map(m => m.previousColumnId)])];
      const columnPlaceholders = columnIds.map(() => '?').join(',');
      const columns = await wrapQuery(
        db.prepare(`SELECT id, title, is_finished as is_done FROM columns WHERE id IN (${columnPlaceholders})`),
        'SELECT'
      ).all(...columnIds);
      const columnMap = new Map(columns.map(c => [c.id, c]));
      console.log(`⏱️  [batch-update-positions] Column fetch took ${Date.now() - activityStartTime}ms`);
      
      // Log activities (fire-and-forget: Don't await to avoid blocking API response)
      // Start all activity logs in parallel but don't wait for them
      columnMoves.forEach((move) => {
        const oldColumn = columnMap.get(move.previousColumnId);
        const newColumn = columnMap.get(move.columnId);
        
        logTaskActivity(
          userId,
          TASK_ACTIONS.UPDATE,
          move.taskId,
          t('activity.movedTaskFromTo', {
            taskTitle: move.title,
            taskRef: '',
            fromColumn: oldColumn?.title || 'Unknown',
            toColumn: newColumn?.title || 'Unknown'
          }),
          {
            columnId: move.columnId,
            boardId: move.previousBoardId,
            tenantId: getTenantId(req),
            db: db
          }
        ).catch(error => {
          console.error('Background activity logging failed:', error);
        });
        
        // Log to reporting system (also fire-and-forget)
        const eventType = newColumn?.is_done ? 'task_completed' : 'task_moved';
        logReportingActivity(db, eventType, userId, move.taskId, {
          fromColumnId: move.previousColumnId,
          fromColumnName: oldColumn?.title,
          toColumnId: move.columnId,
          toColumnName: newColumn?.title
        }).catch(error => {
          console.error('Background reporting activity logging failed:', error);
        });
      });
      // Note: Activity logging is now fire-and-forget, so timing measurement removed
    }
    
    // Publish WebSocket updates for all changed tasks
    // Use batched fetching for much better performance (1 query instead of N queries)
    const fetchStartTime = Date.now();
    const taskResponses = await fetchTasksWithRelationshipsBatch(db, taskIds);
    console.log(`⏱️  [batch-update-positions] Fetching ${taskIds.length} tasks with relationships (batched) took ${Date.now() - fetchStartTime}ms`);
    
    // Publish individual WebSocket events for each task (grouped by board for efficiency)
    const tasksByBoard = new Map();
    taskResponses.forEach(task => {
      if (!tasksByBoard.has(task.boardId)) {
        tasksByBoard.set(task.boardId, []);
      }
      tasksByBoard.get(task.boardId).push({
        ...task,
        updatedBy: userId
      });
    });
    
    // Publish individual events in the background (non-blocking)
    // JSON.stringify() on large task objects can be slow, so we don't block the response
    const tenantId = getTenantId(req);
    const publishPromises = Array.from(tasksByBoard.entries()).flatMap(([boardId, tasks]) =>
      tasks.map(task =>
        redisService.publish('task-updated', {
          boardId,
          task, // Single task per event (WebSocket handler expects this format)
          timestamp: now
        }, tenantId).catch(error => {
          console.error('❌ Background WebSocket publish failed:', error);
        })
      )
    );
    
    // Start publishing in background (fire-and-forget)
    Promise.all(publishPromises).then(() => {
      // Optional: log success in background
    }).catch(error => {
      console.error('❌ Background WebSocket publish batch failed:', error);
    });
    
    const totalTime = Date.now() - endpointStartTime;
    console.log(`⏱️  [batch-update-positions] Total endpoint time: ${totalTime}ms for ${updates.length} updates (WebSocket publishing in background)`);
    
    res.json({ message: `Updated ${updates.length} task positions successfully` });
  } catch (error) {
    console.error('Error batch updating task positions:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToUpdateTask') });
  }
});

// Reorder tasks
router.post('/reorder', authenticateToken, async (req, res) => {
  const { taskId, newPosition, columnId } = req.body;
  const userId = req.user?.id || 'system';
  
  try {
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    const currentTask = await wrapQuery(db.prepare('SELECT position, columnId, boardId, title FROM tasks WHERE id = ?'), 'SELECT').get(taskId);

    if (!currentTask) {
      return res.status(404).json({ error: t('errors.taskNotFound') });
    }

    const currentPosition = currentTask.position;
    const previousColumnId = currentTask.columnId;
    const previousBoardId = currentTask.boardId;

    if (isProxyDatabase(db)) {
      // Proxy mode: Collect all queries and send as batch
      const batchQueries = [];
      const now = new Date().toISOString();
      
      if (newPosition > currentPosition) {
        // Moving down: shift tasks between current and new position up by 1
        batchQueries.push({
          query: `
            UPDATE tasks SET position = position - 1 
            WHERE columnId = ? AND position > ? AND position <= ?
          `,
          params: [columnId, currentPosition, newPosition]
        });
      } else {
        // Moving up: shift tasks between new and current position down by 1
        batchQueries.push({
          query: `
            UPDATE tasks SET position = position + 1 
            WHERE columnId = ? AND position >= ? AND position < ?
          `,
          params: [columnId, newPosition, currentPosition]
        });
      }

      // Update the moved task to its new position and track previous location
      batchQueries.push({
        query: `
          UPDATE tasks SET 
            position = ?, 
            columnId = ?,
            pre_boardId = ?, 
            pre_columnId = ?,
            updated_at = ?
          WHERE id = ?
        `,
        params: [newPosition, columnId, previousBoardId, previousColumnId, now, taskId]
      });
      
      // Execute all updates in a single batched transaction
      await db.executeBatchTransaction(batchQueries);
    } else {
      // Direct DB mode: Use standard transaction
      await dbTransaction(db, async () => {
        if (newPosition > currentPosition) {
          // Moving down: shift tasks between current and new position up by 1
          await wrapQuery(db.prepare(`
            UPDATE tasks SET position = position - 1 
            WHERE columnId = ? AND position > ? AND position <= ?
          `), 'UPDATE').run(columnId, currentPosition, newPosition);
        } else {
          // Moving up: shift tasks between new and current position down by 1
          await wrapQuery(db.prepare(`
            UPDATE tasks SET position = position + 1 
            WHERE columnId = ? AND position >= ? AND position < ?
          `), 'UPDATE').run(columnId, newPosition, currentPosition);
        }

        // Update the moved task to its new position and track previous location
        await wrapQuery(db.prepare(`
          UPDATE tasks SET 
            position = ?, 
            columnId = ?,
            pre_boardId = ?, 
            pre_columnId = ?,
            updated_at = ?
          WHERE id = ?
        `), 'UPDATE').run(newPosition, columnId, previousBoardId, previousColumnId, new Date().toISOString(), taskId);
      });
    }

    // Log reorder activity (fire-and-forget: Don't await to avoid blocking API response)
    logTaskActivity(
      userId,
      TASK_ACTIONS.UPDATE, // Reorder is a type of update
      taskId,
      t('activity.reorderedTask', { 
        taskTitle: currentTask.title, 
        fromPosition: currentPosition, 
        toPosition: newPosition 
      }),
      {
        columnId: columnId,
        boardId: currentTask.boardId,
        tenantId: getTenantId(req),
        db: db
      }
    ).catch(error => {
      console.error('Background activity logging failed:', error);
    });
    
    // Log to reporting system - check if column changed
    if (previousColumnId !== columnId) {
      // This is a column move
      const newColumn = await wrapQuery(db.prepare('SELECT title, is_finished as is_done FROM columns WHERE id = ?'), 'SELECT').get(columnId);
      const oldColumn = await wrapQuery(db.prepare('SELECT title FROM columns WHERE id = ?'), 'SELECT').get(previousColumnId);
      
      const eventType = newColumn?.is_done ? 'task_completed' : 'task_moved';
      await logReportingActivity(db, eventType, userId, taskId, {
        fromColumnId: previousColumnId,
        fromColumnName: oldColumn?.title,
        toColumnId: columnId,
        toColumnName: newColumn?.title
      });
    }

    // Get the updated task data with all relationships for WebSocket
    const taskResponse = await fetchTaskWithRelationships(db, taskId);
    
    // Publish to Redis for real-time updates (includes complete task data with relationships)
    await redisService.publish('task-updated', {
      boardId: currentTask.boardId,
      task: {
        ...taskResponse,
        updatedBy: userId
      },
      timestamp: new Date().toISOString()
    }, getTenantId(req));

    res.json({ message: 'Task reordered successfully' });
  } catch (error) {
    console.error('Error reordering task:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
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
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    
    // Get the task to move
    const task = await wrapQuery(
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
    const sourceColumn = await wrapQuery(
      db.prepare('SELECT title FROM columns WHERE id = ?'), 
      'SELECT'
    ).get(task.columnId);
    
    let targetColumn = null;
    
    // Try to find a column with the same title in the target board
    if (sourceColumn) {
      targetColumn = await wrapQuery(
        db.prepare('SELECT id, title FROM columns WHERE boardId = ? AND title = ? ORDER BY position ASC LIMIT 1'), 
        'SELECT'
      ).get(targetBoardId, sourceColumn.title);
      
      if (targetColumn) {
        console.log(`🎯 Smart placement: Found matching column "${sourceColumn.title}" in target board`);
      }
    }
    
    // Fallback to first column if no matching column found
    if (!targetColumn) {
      targetColumn = await wrapQuery(
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
    if (isProxyDatabase(db)) {
      // Proxy mode: Collect all queries and send as batch
      const batchQueries = [];
      const now = new Date().toISOString();
      
      // Shift existing tasks in target column to make room at position 0
      batchQueries.push({
        query: 'UPDATE tasks SET position = position + 1 WHERE columnId = ?',
        params: [targetColumn.id]
      });
      
      // Update the existing task to move it to the new location
      batchQueries.push({
        query: `
          UPDATE tasks SET 
            columnId = ?, 
            boardId = ?, 
            position = 0,
            pre_boardId = ?, 
            pre_columnId = ?,
            updated_at = ?
          WHERE id = ?
        `,
        params: [targetColumn.id, targetBoardId, originalBoardId, originalColumnId, now, taskId]
      });
      
      // Execute all updates in a single batched transaction
      await db.executeBatchTransaction(batchQueries);
    } else {
      // Direct DB mode: Use standard transaction
      await dbTransaction(db, async () => {
        // Shift existing tasks in target column to make room at position 0
        await wrapQuery(
          db.prepare('UPDATE tasks SET position = position + 1 WHERE columnId = ?'), 
          'UPDATE'
        ).run(targetColumn.id);
        
        // Update the existing task to move it to the new location
        await wrapQuery(
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
      });
    }
    
    // Log move activity
    const originalBoard = await wrapQuery(db.prepare('SELECT title FROM boards WHERE id = ?'), 'SELECT').get(originalBoardId);
    const targetBoard = await wrapQuery(db.prepare('SELECT title FROM boards WHERE id = ?'), 'SELECT').get(targetBoardId);
    const moveDetails = t('activity.movedTaskBoard', {
      taskTitle: task.title,
      fromBoard: originalBoard?.title || 'Unknown',
      toBoard: targetBoard?.title || 'Unknown'
    });
    
    // Fire-and-forget: Don't await activity logging to avoid blocking API response
    logTaskActivity(
      userId,
      TASK_ACTIONS.MOVE,
      taskId,
      moveDetails,
      {
        columnId: targetColumn.id,
        boardId: targetBoardId,
        tenantId: getTenantId(req),
        db: db
      }
    ).catch(error => {
      console.error('Background activity logging failed:', error);
    });
    
    // Log to reporting system
    const newColumn = await wrapQuery(db.prepare('SELECT title, is_finished as is_done FROM columns WHERE id = ?'), 'SELECT').get(targetColumn.id);
    const oldColumn = await wrapQuery(db.prepare('SELECT title FROM columns WHERE id = ?'), 'SELECT').get(originalColumnId);
    
    const eventType = newColumn?.is_done ? 'task_completed' : 'task_moved';
    await logReportingActivity(db, eventType, userId, taskId, {
      fromColumnId: originalColumnId,
      fromColumnName: oldColumn?.title,
      toColumnId: targetColumn.id,
      toColumnName: newColumn?.title
    });
    
    // Get the updated task data with all relationships for WebSocket
    const taskResponse = await fetchTaskWithRelationships(db, taskId);
    
    // Publish to Redis for real-time updates (both boards need to be notified)
    // Includes complete task data with relationships
    const tenantId = getTenantId(req);
    await redisService.publish('task-updated', {
      boardId: originalBoardId,
      task: {
        ...taskResponse,
        updatedBy: userId
      },
      timestamp: new Date().toISOString()
    }, tenantId);
    
    await redisService.publish('task-updated', {
      boardId: targetBoardId,
      task: {
        ...taskResponse,
        updatedBy: userId
      },
      timestamp: new Date().toISOString()
    }, tenantId);
    
    res.json({ 
      success: true, 
      newTaskId: taskId, // Return original taskId since we're not changing it
      targetColumnId: targetColumn.id,
      targetBoardId,
      message: 'Task moved successfully' 
    });
    
  } catch (error) {
    console.error('Error moving task to board:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToMoveTaskToBoard') });
  }
});

// Get tasks by board
router.get('/by-board/:boardId', authenticateToken, async (req, res) => {
  const { boardId } = req.params;
  try {
    const db = getRequestDatabase(req);
    const tasks = await wrapQuery(db.prepare(`
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
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToGetTasks') });
  }
});

// Add watcher to task
router.post('/:taskId/watchers/:memberId', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { taskId, memberId } = req.params;
    const userId = req.user?.id || 'system';
    
    const t = await getTranslator(db);
    // Get task's board ID for Redis publishing
    const task = await wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
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
    }, getTenantId(req));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding watcher:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToAddWatcher') });
  }
});

// Remove watcher from task
router.delete('/:taskId/watchers/:memberId', async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    const { taskId, memberId } = req.params;
    
    // Get task's board ID for Redis publishing
    const task = await wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
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
    }, getTenantId(req));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing watcher:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToRemoveWatcher') });
  }
});

// Add collaborator to task
router.post('/:taskId/collaborators/:memberId', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    const { taskId, memberId } = req.params;
    const userId = req.user?.id || 'system';
    
    // Get task's board ID for Redis publishing
    const task = await wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
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
    }, getTenantId(req));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding collaborator:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToAddCollaborator') });
  }
});

// Remove collaborator from task
router.delete('/:taskId/collaborators/:memberId', async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    const { taskId, memberId } = req.params;
    
    // Get task's board ID for Redis publishing
    const task = await wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
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
    }, getTenantId(req));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing collaborator:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToRemoveCollaborator') });
  }
});

// Task Relationships endpoints

// Get all relationships for a task
router.get('/:taskId/relationships', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { taskId } = req.params;
    
    // Get all relationships where this task is involved (as either task_id or to_task_id)
    const relationships = await wrapQuery(db.prepare(`
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
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToFetchTaskRelationships') });
  }
});

// Create a task relationship
router.post('/:taskId/relationships', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
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
    const taskExists = await wrapQuery(db.prepare('SELECT id FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
    const toTaskExists = await wrapQuery(db.prepare('SELECT id FROM tasks WHERE id = ?'), 'SELECT').get(toTaskId);
    
    if (!taskExists || !toTaskExists) {
      return res.status(404).json({ error: t('errors.oneOrBothTasksNotFound') });
    }
    
    // Check if relationship already exists
    const existingRelationship = await wrapQuery(db.prepare(`
      SELECT id FROM task_rels 
      WHERE task_id = ? AND relationship = ? AND to_task_id = ?
    `), 'SELECT').get(taskId, relationship, toTaskId);
    
    if (existingRelationship) {
      return res.status(409).json({ error: t('errors.relationshipAlreadyExists') });
    }
    
    // Check for circular relationships (prevent cycles in parent/child hierarchies)
    if (relationship === 'parent' || relationship === 'child') {
      const wouldCreateCycle = await checkForCycles(db, taskId, toTaskId, relationship);
      if (wouldCreateCycle.hasCycle) {
        return res.status(409).json({ 
          error: `Cannot create relationship: This would create a circular dependency. ${wouldCreateCycle.reason}` 
        });
      }
    }
    
    // Use a transaction to ensure atomicity
    let insertResult;
    await dbTransaction(db, async () => {
      // Insert the relationship (use regular INSERT since we've validated above)
      insertResult = await wrapQuery(db.prepare(`
        INSERT INTO task_rels (task_id, relationship, to_task_id)
        VALUES (?, ?, ?)
      `), 'INSERT').run(taskId, relationship, toTaskId);
      
      // For parent/child relationships, also create the inverse relationship
      // Check if inverse already exists to avoid UNIQUE constraint violations
      if (relationship === 'parent') {
        const inverseExists = await wrapQuery(db.prepare(`
          SELECT id FROM task_rels 
          WHERE task_id = ? AND relationship = 'child' AND to_task_id = ?
        `), 'SELECT').get(toTaskId, taskId);
        
        if (!inverseExists) {
          await wrapQuery(db.prepare(`
            INSERT INTO task_rels (task_id, relationship, to_task_id)
            VALUES (?, 'child', ?)
          `), 'INSERT').run(toTaskId, taskId);
        }
      } else if (relationship === 'child') {
        const inverseExists = await wrapQuery(db.prepare(`
          SELECT id FROM task_rels 
          WHERE task_id = ? AND relationship = 'parent' AND to_task_id = ?
        `), 'SELECT').get(toTaskId, taskId);
        
        if (!inverseExists) {
          await wrapQuery(db.prepare(`
            INSERT INTO task_rels (task_id, relationship, to_task_id)
            VALUES (?, 'parent', ?)
          `), 'INSERT').run(toTaskId, taskId);
        }
      }
    });
    
    console.log(`✅ Created relationship: ${taskId} (${relationship}) → ${toTaskId}`);
    
    // Verify the insertion was successful
    if (!insertResult || insertResult.changes === 0) {
      return res.status(500).json({ error: t('errors.failedToCreateRelationship') });
    }
    
    // Get the board ID for the source task to publish the update
    const sourceTask = await wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
    const targetTask = await wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(toTaskId);
    
    // Publish to Redis for real-time updates (both boards need to be notified)
    const tenantId = getTenantId(req);
    if (sourceTask?.boardId) {
      await redisService.publish('task-relationship-created', {
        boardId: sourceTask.boardId,
        taskId: taskId,
        relationship: relationship,
        toTaskId: toTaskId,
        timestamp: new Date().toISOString()
      }, tenantId);
    }
    
    if (targetTask?.boardId && targetTask.boardId !== sourceTask?.boardId) {
      await redisService.publish('task-relationship-created', {
        boardId: targetTask.boardId,
        taskId: taskId,
        relationship: relationship,
        toTaskId: toTaskId,
        timestamp: new Date().toISOString()
      }, tenantId);
    }
    
    res.json({ success: true, message: 'Task relationship created successfully' });
  } catch (error) {
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: t('errors.relationshipAlreadyExists') });
    }
    console.error('Error creating task relationship:', error);
    res.status(500).json({ error: t('errors.failedToCreateTaskRelationship') });
  }
});

// Delete a task relationship
router.delete('/:taskId/relationships/:relationshipId', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    const { taskId, relationshipId } = req.params;
    
    // Get the relationship details before deleting
    const relationship = await wrapQuery(db.prepare(`
      SELECT * FROM task_rels WHERE id = ? AND task_id = ?
    `), 'SELECT').get(relationshipId, taskId);
    
    if (!relationship) {
      return res.status(404).json({ error: t('errors.relationshipNotFound') });
    }
    
    // Delete the main relationship
    await wrapQuery(db.prepare(`
      DELETE FROM task_rels WHERE id = ?
    `), 'DELETE').run(relationshipId);
    
    // For parent/child relationships, also delete the inverse relationship
    if (relationship.relationship === 'parent') {
      await wrapQuery(db.prepare(`
        DELETE FROM task_rels WHERE task_id = ? AND relationship = 'child' AND to_task_id = ?
      `), 'DELETE').run(relationship.to_task_id, relationship.task_id);
    } else if (relationship.relationship === 'child') {
      await wrapQuery(db.prepare(`
        DELETE FROM task_rels WHERE task_id = ? AND relationship = 'parent' AND to_task_id = ?
      `), 'DELETE').run(relationship.to_task_id, relationship.task_id);
    }
    
    // Get the board ID for the source task to publish the update
    const sourceTask = await wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
    const targetTask = await wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(relationship.to_task_id);
    
    // Publish to Redis for real-time updates (both boards need to be notified)
    const tenantId = getTenantId(req);
    if (sourceTask?.boardId) {
      await redisService.publish('task-relationship-deleted', {
        boardId: sourceTask.boardId,
        taskId: taskId,
        relationship: relationship.relationship,
        toTaskId: relationship.to_task_id,
        timestamp: new Date().toISOString()
      }, tenantId);
    }
    
    if (targetTask?.boardId && targetTask.boardId !== sourceTask?.boardId) {
      await redisService.publish('task-relationship-deleted', {
        boardId: targetTask.boardId,
        taskId: taskId,
        relationship: relationship.relationship,
        toTaskId: relationship.to_task_id,
        timestamp: new Date().toISOString()
      }, tenantId);
    }
    
    res.json({ success: true, message: 'Task relationship deleted successfully' });
  } catch (error) {
    console.error('Error deleting task relationship:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToDeleteTaskRelationship') });
  }
});

// Get tasks available for creating relationships (excludes current task and already related tasks)
router.get('/:taskId/available-for-relationship', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    const { taskId } = req.params;
    
    // Get all tasks except the current one and already related ones
    const availableTasks = await wrapQuery(db.prepare(`
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
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToFetchAvailableTasks') });
  }
});

// Get complete task flow chart data (optimized for visualization)
router.get('/:taskId/flow-chart', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    
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
      const connected = await wrapQuery(db.prepare(`
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
          t.priority_id,
          p.priority as priority_name,
          t.startDate,
          t.dueDate,
          b.project as projectId
        FROM tasks t
        LEFT JOIN members mem ON t.memberId = mem.id
        LEFT JOIN columns c ON t.columnId = c.id
        LEFT JOIN boards b ON t.boardId = b.id
        LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
        WHERE t.id IN (${placeholders})
      `;
      
      const tasks = await wrapQuery(db.prepare(tasksQuery), 'SELECT').all(...Array.from(connectedTaskIds));
      
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
      
      const relationships = await wrapQuery(db.prepare(relationshipsQuery), 'SELECT').all(...Array.from(connectedTaskIds), ...Array.from(connectedTaskIds));
      
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
          priority: task.priority_name || task.priority || 'medium',
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
          t.priority_id,
          p.priority as priority_name,
          t.startDate,
          t.dueDate,
          b.project as projectId
        FROM tasks t
        LEFT JOIN members mem ON t.memberId = mem.id
        LEFT JOIN columns c ON t.columnId = c.id
        LEFT JOIN boards b ON t.boardId = b.id
        LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
        WHERE t.id = ?
      `;
      
      const rootTask = await wrapQuery(db.prepare(rootTaskQuery), 'SELECT').get(taskId);
      
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
            priority: rootTask.priority_name || rootTask.priority || 'medium',
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
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToGetFlowChartData') });
  }
});


export default router;