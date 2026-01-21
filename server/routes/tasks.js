import express from 'express';
import { wrapQuery } from '../utils/queryLogger.js';
import { logTaskActivity, generateTaskUpdateDetails } from '../services/activityLogger.js';
import * as reportingLogger from '../services/reportingLogger.js';
import { TASK_ACTIONS } from '../constants/activityActions.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkTaskLimit } from '../middleware/licenseCheck.js';
import notificationService from '../services/notificationService.js';
import { getTranslator, t } from '../utils/i18n.js';
import { getRequestDatabase } from '../middleware/tenantRouting.js';
import { dbTransaction, dbRun, isProxyDatabase, isPostgresDatabase } from '../utils/dbAsync.js';
// MIGRATED: Import sqlManager
import { tasks as taskQueries, boards as boardQueries, helpers, sprints as sprintQueries } from '../utils/sqlManager/index.js';

const router = express.Router();

// Helper function to get tenantId from request (for Redis channel isolation)
const getTenantId = (req) => {
  return req.tenantId || null;
};

// Helper function to build minimal WebSocket payload with only changed fields
// This reduces payload size from 5-30KB to 500-1000 bytes (70-90% reduction)
// Includes essential fields for frontend display (title, boardId, memberId, ticket)
function buildMinimalTaskUpdatePayload(currentTask, updatedTask, changedFields, priorityChanged, priorityInfo) {
  // Always include essential fields for frontend display (required when task doesn't exist in target column)
  const minimalTask = {
    id: updatedTask.id || currentTask.id,
    title: updatedTask.title || currentTask.title, // Required for display
    boardId: updatedTask.boardId || currentTask.boardId, // Required for routing
    memberId: updatedTask.memberId || currentTask.memberId || null, // For assignee display
    ticket: updatedTask.ticket || currentTask.ticket || null // For task reference display
  };
  
  // Always include boardId (required for frontend routing)
  const targetBoardId = updatedTask.boardId || currentTask.boardId;
  
  // Include only changed fields
  if (changedFields.includes('title') || currentTask.title !== updatedTask.title) {
    minimalTask.title = updatedTask.title;
  }
  if (changedFields.includes('description') || currentTask.description !== updatedTask.description) {
    minimalTask.description = updatedTask.description;
  }
  if (changedFields.includes('memberId') || currentTask.memberId !== updatedTask.memberId) {
    minimalTask.memberId = updatedTask.memberId;
  }
  if (changedFields.includes('requesterId') || currentTask.requesterId !== updatedTask.requesterId) {
    minimalTask.requesterId = updatedTask.requesterId;
  }
  if (changedFields.includes('startDate') || currentTask.startDate !== updatedTask.startDate) {
    minimalTask.startDate = updatedTask.startDate;
  }
  if (changedFields.includes('dueDate') || currentTask.dueDate !== updatedTask.dueDate) {
    minimalTask.dueDate = updatedTask.dueDate;
  }
  if (changedFields.includes('effort') || currentTask.effort !== updatedTask.effort) {
    minimalTask.effort = updatedTask.effort;
  }
  if (changedFields.includes('columnId') || currentTask.columnId !== updatedTask.columnId) {
    minimalTask.columnId = updatedTask.columnId;
    // Include position when column changes (usually changes together)
    minimalTask.position = updatedTask.position ?? currentTask.position;
    // Include previous location for cross-column moves
    minimalTask.previousColumnId = currentTask.columnId;
  }
  if (changedFields.includes('position') || currentTask.position !== (updatedTask.position ?? 0)) {
    minimalTask.position = updatedTask.position ?? 0;
  }
  if (changedFields.includes('boardId') || currentTask.boardId !== updatedTask.boardId) {
    // Board change - include previous location for cross-board moves
    minimalTask.previousBoardId = currentTask.boardId;
    minimalTask.previousColumnId = currentTask.columnId;
  }
  if (changedFields.includes('sprintId')) {
    minimalTask.sprintId = updatedTask.sprintId || null;
  }
  
  // Handle priority changes
  if (priorityChanged && priorityInfo) {
    minimalTask.priority = priorityInfo.priorityName;
    minimalTask.priorityId = priorityInfo.priorityId;
    minimalTask.priorityName = priorityInfo.priorityName;
    minimalTask.priorityColor = priorityInfo.priorityColor;
  }
  
  return { minimalTask, targetBoardId };
}

// MIGRATED: Use sqlManager instead of inline SQL
// Helper function to fetch a task with all relationships (comments, watchers, collaborators, tags, attachmentCount)
async function fetchTaskWithRelationships(db, taskId) {
  const task = await taskQueries.getTaskWithRelationships(db, taskId);
  if (!task) return null;
  
  // Get attachments for all comments in one batch query (fixes N+1 problem)
  if (task.comments && task.comments.length > 0) {
    const commentIds = task.comments.map(c => c.id).filter(Boolean);
    if (commentIds.length > 0) {
      const allAttachments = await helpers.getAttachmentsForComments(db, commentIds);
      
      // Group attachments by commentId
      const attachmentsByCommentId = new Map();
      allAttachments.forEach(att => {
        const commentId = att.commentid || att.commentId;
        if (!attachmentsByCommentId.has(commentId)) {
          attachmentsByCommentId.set(commentId, []);
        }
        attachmentsByCommentId.get(commentId).push(att);
      });
      
      // Assign attachments to each comment
      task.comments.forEach(comment => {
        comment.attachments = attachmentsByCommentId.get(comment.id) || [];
      });
    }
  }
  
  // Get priority information - prefer JOIN values over tasks.priority field (which can be stale)
  // CRITICAL: Use priorityId/priorityName/priorityColor from JOIN, not task.priority (text field can be outdated)
  let priorityId = task.priorityId || task.priority_id || null;
  let priorityName = task.priorityName || null; // Use JOIN value, not task.priority
  let priorityColor = task.priorityColor || null;
  
  // Fallback: If JOIN didn't return priority info, look it up by priority_id
  if (priorityId && !priorityName) {
    const priority = await helpers.getPriorityById(db, priorityId);
    if (priority) {
      priorityName = priority.priority;
      priorityColor = priority.color;
    }
  }
  // Last resort: If no priority_id but tasks.priority exists, look it up (backward compatibility)
  else if (!priorityId && task.priority) {
    const priority = await helpers.getPriorityByName(db, task.priority);
    if (priority) {
      priorityId = priority.id;
      priorityName = priority.priority;
      priorityColor = priority.color;
    } else {
      // Priority name doesn't exist in priorities table (was deleted), use null
      priorityName = null;
      priorityColor = null;
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
    updatedAt: task.updated_at,
    // Ensure columnId and boardId are in camelCase (frontend expects these)
    columnId: task.columnid || task.columnId,
    boardId: task.boardid || task.boardId,
    memberId: task.memberid || task.memberId,
    requesterId: task.requesterid || task.requesterId
  };
}

// MIGRATED: Use sqlManager instead of inline SQL
// Batched version: Fetch multiple tasks with relationships in one query
// This is much faster than calling fetchTaskWithRelationships() for each task
async function fetchTasksWithRelationshipsBatch(db, taskIds) {
  if (!taskIds || taskIds.length === 0) {
    return [];
  }

  // Use sqlManager function
  return await taskQueries.getTasksByIds(db, taskIds); `
      SELECT t.*, 
             p.id as priorityId,
             p.priority as priorityName,
             p.color as priorityColor,
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
      GROUP BY t.id, p.id
    `;
  
  // Fetch all tasks with relationships in a single query
  const tasks = await wrapQuery(
    db.prepare(query),
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

    // Get priority information - prefer JOIN values over tasks.priority field (which can be stale)
    // CRITICAL: Use priorityId/priorityName/priorityColor from JOIN, not task.priority (text field can be outdated)
    let priorityId = task.priorityId || task.priority_id || null;
    let priorityName = task.priorityName || null; // Use JOIN value, not task.priority
    let priorityColor = task.priorityColor || null;

    // Fallback: If JOIN didn't return priority info, look it up from priorityMap
    if (priorityId && !priorityName && priorityMap.has(priorityId)) {
      const priority = priorityMap.get(priorityId);
      priorityName = priority.priority;
      priorityColor = priority.color;
    } else if (!priorityId && task.priority && priorityMap.has(task.priority)) {
      // Last resort: Look up by priority name (backward compatibility)
      const priority = priorityMap.get(task.priority);
      priorityId = priority.id;
      priorityName = priority.priority;
      priorityColor = priority.color;
    } else if (!priorityId && task.priority && !priorityMap.has(task.priority)) {
      // Priority name doesn't exist in priorities table (was deleted), use null
      priorityName = null;
      priorityColor = null;
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
  
  // MIGRATED: Use sqlManager instead of inline SQL
  // Check if the opposite relationship already exists
  const existingOppositeRel = await taskQueries.getOppositeRelationship(db, checkTaskId, oppositeRelationship, checkTargetId);
  
  if (existingOppositeRel) {
    const sourceTicket = await taskQueries.getTaskTicket(db, sourceTaskId) || 'Unknown';
    const targetTicket = await taskQueries.getTaskTicket(db, targetTaskId) || 'Unknown';
    
    return {
      hasCycle: true,
      reason: `${sourceTicket} is already ${oppositeRelationship} of ${targetTicket}`
    };
  }
  
  return { hasCycle: false };
}

// MIGRATED: Use sqlManager instead of inline SQL
// Helper function to get task ticket by ID
async function getTaskTicket(db, taskId) {
  const ticket = await taskQueries.getTaskTicket(db, taskId);
  return ticket || 'Unknown';
}

// MIGRATED: Use sqlManager instead of inline SQL
// Utility function to generate task ticket numbers
const generateTaskTicket = async (db, prefix = 'TASK-') => {
  return await taskQueries.generateTaskTicket(db, prefix);
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

// MIGRATED: Get all tasks
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const tasks = await taskQueries.getAllTasks(db);
    
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
    
    // MIGRATED: Use sqlManager instead of inline SQL
    const task = isTicket 
      ? await taskQueries.getTaskByTicket(db, id)
      : await fetchTaskWithRelationships(db, id);
    
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
    
    // MIGRATED: If task doesn't have relationships (from getTaskByTicket), fetch them
    if (!task.comments || !task.watchers || !task.collaborators || !task.tags) {
      // Get comments for the task
      const comments = await helpers.getCommentsForTask(db, task.id);
      console.log('📝 [TASK API] Found comments:', comments.length);
      
      // Get attachments for all comments in one batch query (fixes N+1 problem)
      if (comments.length > 0) {
        const commentIds = comments.map(c => c.id).filter(Boolean);
        if (commentIds.length > 0) {
          const allAttachments = await helpers.getAttachmentsForComments(db, commentIds);
          
          // Group attachments by commentId
          const attachmentsByCommentId = new Map();
          allAttachments.forEach(att => {
            const commentId = att.commentid || att.commentId;
            if (!attachmentsByCommentId.has(commentId)) {
              attachmentsByCommentId.set(commentId, []);
            }
            attachmentsByCommentId.get(commentId).push(att);
          });
          
          // Assign attachments to each comment
          comments.forEach(comment => {
            comment.attachments = attachmentsByCommentId.get(comment.id) || [];
          });
        }
      }
      
      // Get watchers for the task
      const watchers = await helpers.getWatchersForTask(db, task.id);
      console.log('👀 [TASK API] Found watchers:', watchers.length);
      
      // Get collaborators for the task
      const collaborators = await helpers.getCollaboratorsForTask(db, task.id);
      console.log('🤝 [TASK API] Found collaborators:', collaborators.length);
      
      // Get tags for the task
      const tags = await taskQueries.getTaskTags(db, task.id);
      console.log('🏷️ [TASK API] Found tags:', tags.length);
      
      // Add all related data to task
      task.comments = comments || [];
      task.watchers = watchers || [];
      task.collaborators = collaborators || [];
      task.tags = tags || [];
    }
    
    // Convert snake_case to camelCase for frontend
    // CRITICAL: Use priorityName from JOIN only - never use task.priority (text field can be stale)
    // If priorityName is null, the priority was deleted or doesn't exist, so return null
    const taskResponse = {
      ...task,
      priority: task.priorityName || null, // Use JOIN value only, not task.priority
      priorityId: task.priorityId || null,
      priorityName: task.priorityName || null, // Use JOIN value only, not task.priority
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
    // MIGRATED: Use sqlManager instead of inline SQL
    const taskPrefix = await helpers.getSetting(db, 'DEFAULT_TASK_PREFIX') || 'TASK-';
    const ticket = await generateTaskTicket(db, taskPrefix);
    
    // Ensure dueDate defaults to startDate if not provided
    const dueDate = task.dueDate || task.startDate;
    
    // Handle priority: prefer priority_id, but support priority name for backward compatibility
    let priorityId = task.priorityId || null;
    let priorityName = task.priority || null;
    
    // If priority_id is not provided but priority name is, look up the ID
    if (!priorityId && priorityName) {
    // MIGRATED: Use sqlManager instead of inline SQL
    const priority = await helpers.getPriorityByName(db, priorityName);
    if (priority) {
      priorityId = priority.id;
    } else {
      // Fallback to default priority if name not found
      const defaultPriority = await helpers.getDefaultPriority(db);
      priorityId = defaultPriority ? defaultPriority.id : null;
    }
    }
    
    // If still no priority_id, use default
    if (!priorityId) {
      const defaultPriority = await helpers.getDefaultPriority(db);
      priorityId = defaultPriority ? defaultPriority.id : null;
      if (priorityId && !priorityName) {
        // Get the name for the default priority
        priorityName = await helpers.getPriorityNameById(db, priorityId);
      }
    }
    
    // MIGRATED: Create the task using sqlManager
    await taskQueries.createTask(db, {
      id: task.id,
      title: task.title,
      description: task.description || '',
      ticket: ticket,
      memberId: task.memberId,
      requesterId: task.requesterId,
      startDate: task.startDate,
      dueDate: dueDate,
      effort: task.effort != null ? task.effort : 0,
      priority: priorityName,
      priorityId: priorityId,
      columnId: task.columnId,
      boardId: task.boardId,
      position: task.position || 0,
      sprintId: task.sprintId || null
    });
    
    // Log the activity (console only for now)
    const t = await getTranslator(db);
    const board = await helpers.getBoardById(db, task.boardId);
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
    
    // Log to reporting system (fire-and-forget: Don't await to avoid blocking API response)
    logReportingActivity(db, 'task_created', userId, task.id).catch(error => {
      console.error('Background reporting activity logging failed:', error);
    });
    
    // Add the generated ticket to the task object before publishing
    task.ticket = ticket;
    
    // Fetch the created task with all relationships (including priority info from JOIN)
    // This ensures the WebSocket event includes complete task data with current priority name
    const taskResponse = await fetchTaskWithRelationships(db, task.id);
    
    // Ensure taskResponse has required fields for WebSocket event (frontend expects columnId and boardId in camelCase)
    const taskForWebSocket = taskResponse || task;
    if (!taskForWebSocket.columnId && task.columnId) {
      taskForWebSocket.columnId = task.columnId;
    }
    if (!taskForWebSocket.boardId && task.boardId) {
      taskForWebSocket.boardId = task.boardId;
    }
    
    // Publish to Redis for real-time updates
    const publishTimestamp = new Date().toISOString();
    console.log(`📤 [${publishTimestamp}] Publishing task-created to Redis:`, {
      taskId: task.id,
      ticket: task.ticket,
      title: task.title,
      boardId: task.boardId,
      columnId: task.columnId,
      hasTaskResponse: !!taskResponse,
      taskResponseColumnId: taskResponse?.columnId,
      taskResponseBoardId: taskResponse?.boardId
    });
    
    await notificationService.publish('task-created', {
      boardId: task.boardId,
      task: taskForWebSocket, // Use taskResponse with ensured columnId/boardId, fallback to task
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
    // MIGRATED: Use sqlManager instead of inline SQL
    const taskPrefix = await helpers.getSetting(db, 'DEFAULT_TASK_PREFIX') || 'TASK-';
    const ticket = await generateTaskTicket(db, taskPrefix);
    
    // Ensure dueDate defaults to startDate if not provided
    const dueDate = task.dueDate || task.startDate;
    
    // Handle priority: prefer priority_id, but support priority name for backward compatibility
    let priorityId = task.priorityId || null;
    let priorityName = task.priority || null;
    
    // If priority_id is not provided but priority name is, look up the ID
    if (!priorityId && priorityName) {
    // MIGRATED: Use sqlManager instead of inline SQL
    const priority = await helpers.getPriorityByName(db, priorityName);
    if (priority) {
      priorityId = priority.id;
    } else {
      // Fallback to default priority if name not found
      const defaultPriority = await helpers.getDefaultPriority(db);
      priorityId = defaultPriority ? defaultPriority.id : null;
    }
    }
    
    // If still no priority_id, use default
    if (!priorityId) {
      const defaultPriority = await helpers.getDefaultPriority(db);
      priorityId = defaultPriority ? defaultPriority.id : null;
      if (priorityId && !priorityName) {
        // Get the name for the default priority
        priorityName = await helpers.getPriorityNameById(db, priorityId);
      }
    }
    
    await dbTransaction(db, async () => {
      await taskQueries.incrementTaskPositions(db, task.columnId);
      await taskQueries.createTask(db, {
        id: task.id,
        title: task.title,
        description: task.description || '',
        ticket: ticket,
        memberId: task.memberId,
        requesterId: task.requesterId,
        startDate: task.startDate,
        dueDate: dueDate,
        effort: task.effort != null ? task.effort : 0,
        priority: priorityName,
        priorityId: priorityId,
        columnId: task.columnId,
        boardId: task.boardId,
        position: 0,
        sprintId: task.sprintId || null
      });
    });
    
    // Log task creation activity (fire-and-forget: Don't await to avoid blocking API response)
    // Create bilingual message for "create at top" (use imported t function with language parameter)
    const board = await helpers.getBoardById(db, task.boardId);
    const boardTitle = board ? board.title : 'Unknown Board';
    const createAtTopDetails = JSON.stringify({
      en: t('activity.createdTaskAtTop', { taskTitle: task.title, boardTitle }, 'en'),
      fr: t('activity.createdTaskAtTop', { taskTitle: task.title, boardTitle }, 'fr')
    });
    logTaskActivity(
      userId,
      TASK_ACTIONS.CREATE,
      task.id,
      createAtTopDetails,
      { 
        columnId: task.columnId,
        boardId: task.boardId,
        tenantId: getTenantId(req),
        db: db
      }
    ).catch(error => {
      console.error('Background activity logging failed:', error);
    });
    
    // Log to reporting system (fire-and-forget: Don't await to avoid blocking API response)
    logReportingActivity(db, 'task_created', userId, task.id).catch(error => {
      console.error('Background reporting activity logging failed:', error);
    });
    
    // Add the generated ticket to the task object
    task.ticket = ticket;
    
    // Fetch the created task with all relationships (including priority info from JOIN)
    // This ensures the WebSocket event includes complete task data with current priority name
    const taskResponse = await fetchTaskWithRelationships(db, task.id);
    
    // Ensure taskResponse has required fields for WebSocket event (frontend expects columnId and boardId in camelCase)
    const taskForWebSocket = taskResponse || task;
    if (!taskForWebSocket.columnId && task.columnId) {
      taskForWebSocket.columnId = task.columnId;
    }
    if (!taskForWebSocket.boardId && task.boardId) {
      taskForWebSocket.boardId = task.boardId;
    }
    
    // Publish to Redis for real-time updates
    const publishTimestamp = new Date().toISOString();
    console.log(`📤 [${publishTimestamp}] Publishing task-created (at top) to Redis:`, {
      taskId: task.id,
      ticket: task.ticket,
      title: task.title,
      boardId: task.boardId,
      columnId: task.columnId,
      hasTaskResponse: !!taskResponse,
      taskResponseColumnId: taskResponse?.columnId,
      taskResponseBoardId: taskResponse?.boardId
    });
    
    await notificationService.publish('task-created', {
      boardId: task.boardId,
      task: taskForWebSocket, // Use taskResponse with ensured columnId/boardId, fallback to task
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
    
    // MIGRATED: Get current task for change tracking and previous location
    const validationStartTime = Date.now();
    const currentTask = await taskQueries.getTaskById(db, id);
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
    
    // MIGRATED: Use sqlManager instead of inline SQL
    // If current task has priority_id but not priority name, look it up
    if (currentPriorityId && !currentPriorityName) {
      currentPriorityName = await helpers.getPriorityNameById(db, currentPriorityId);
    }
    
    // If priority_id is not provided but priority name is, look up the ID
    if (!priorityId && priorityName) {
      const priority = await helpers.getPriorityByName(db, priorityName);
      if (priority) {
        priorityId = priority.id;
      } else {
        // Priority name not found, keep existing priority_id
        priorityId = currentTask.priority_id;
        // Get the name for the existing priority_id
        if (priorityId) {
          priorityName = await helpers.getPriorityNameById(db, priorityId) || priorityName;
        }
      }
    }
    
    // If priority_id is provided, get the name for change tracking
    if (priorityId && !priorityName) {
      priorityName = await helpers.getPriorityNameById(db, priorityId);
    }
    
    // If neither is provided, keep existing values
    if (!priorityId && !priorityName) {
      priorityId = currentTask.priority_id;
      priorityName = currentTask.priority || currentPriorityName;
    }
    
    // Normalize currentTask field names (database returns snake_case, frontend uses camelCase)
    const normalizedCurrentTask = {
      title: currentTask.title || null,
      description: currentTask.description || null,
      memberId: currentTask.memberid || currentTask.memberId || null,
      requesterId: currentTask.requesterid || currentTask.requesterId || null,
      startDate: currentTask.startdate || currentTask.startDate || null,
      dueDate: currentTask.duedate || currentTask.dueDate || null,
      effort: currentTask.effort !== null && currentTask.effort !== undefined ? currentTask.effort : null,
      columnId: currentTask.columnid || currentTask.columnId || null,
      boardId: currentTask.boardid || currentTask.boardId || null
    };
    
    // Helper function to normalize values for comparison (treat null, undefined, empty string as equivalent)
    const normalizeValue = (value) => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      // For dates, normalize to ISO string format for comparison (handle both Date objects and date strings)
      if (value instanceof Date) {
        return value.toISOString().split('T')[0]; // YYYY-MM-DD format
      }
      // For date strings, normalize format (YYYY-MM-DD)
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        return value.split('T')[0]; // Extract date part if it's a datetime string
      }
      // For strings, trim whitespace
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' ? null : trimmed;
      }
      return value;
    };
    
    // Helper function to check if two values are actually different
    const hasChanged = (oldValue, newValue) => {
      const normalizedOld = normalizeValue(oldValue);
      const normalizedNew = normalizeValue(newValue);
      
      // Both null/empty - no change
      if (normalizedOld === null && normalizedNew === null) {
        return false;
      }
      
      // One is null, other is not - change
      if (normalizedOld === null || normalizedNew === null) {
        return normalizedOld !== normalizedNew;
      }
      
      // Both have values - compare
      return normalizedOld !== normalizedNew;
    };
    
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
    
    // Check if sprint changed - handle separately like priority
    const currentSprintId = currentTask.sprint_id || currentTask.sprintId || null;
    const newSprintId = task.sprintId || null;
    if (hasChanged(currentSprintId, newSprintId)) {
      // Get sprint names for bilingual activity message
      let oldSprintName = null;
      let newSprintName = null;
      
      if (currentSprintId) {
        try {
          const oldSprint = await sprintQueries.getSprintById(db, currentSprintId);
          oldSprintName = oldSprint?.name || null;
        } catch (error) {
          console.warn('Failed to get old sprint name:', error.message);
        }
      }
      
      if (newSprintId) {
        try {
          const newSprint = await sprintQueries.getSprintById(db, newSprintId);
          newSprintName = newSprint?.name || null;
        } catch (error) {
          console.warn('Failed to get new sprint name:', error.message);
        }
      }
      
      // Get task and board info for context
      const taskInfo = await taskQueries.getTaskWithBoardColumnInfo(db, id);
      const taskDetails = await taskQueries.getTaskById(db, id);
      const taskTicket = taskDetails?.ticket || null;
      const taskRef = taskTicket ? ` (${taskTicket})` : '';
      const taskTitle = taskInfo?.title || task.title;
      const boardTitle = taskInfo?.board_title || 'Unknown Board';
      
      // Get bilingual translations
      const unknownBoardEn = t('activity.unknownBoard', {}, 'en');
      const unknownBoardFr = t('activity.unknownBoard', {}, 'fr');
      
      const translatedBoardTitle = {
        en: boardTitle === 'Unknown Board' ? unknownBoardEn : boardTitle,
        fr: boardTitle === 'Unknown Board' ? unknownBoardFr : boardTitle
      };
      
      // Generate bilingual message
      let sprintChangeText;
      if (oldSprintName && newSprintName) {
        // Changed from one sprint to another
        sprintChangeText = JSON.stringify({
          en: t('activity.removedSprint', {
            sprintName: oldSprintName,
            taskTitle: taskTitle,
            taskRef: taskRef,
            boardTitle: translatedBoardTitle.en
          }, 'en') + ', ' + t('activity.associatedSprint', {
            sprintName: newSprintName,
            taskTitle: taskTitle,
            taskRef: taskRef,
            boardTitle: translatedBoardTitle.en
          }, 'en'),
          fr: t('activity.removedSprint', {
            sprintName: oldSprintName,
            taskTitle: taskTitle,
            taskRef: taskRef,
            boardTitle: translatedBoardTitle.fr
          }, 'fr') + ', ' + t('activity.associatedSprint', {
            sprintName: newSprintName,
            taskTitle: taskTitle,
            taskRef: taskRef,
            boardTitle: translatedBoardTitle.fr
          }, 'fr')
        });
      } else if (oldSprintName && !newSprintName) {
        // Removed from sprint
        sprintChangeText = JSON.stringify({
          en: t('activity.removedSprint', {
            sprintName: oldSprintName,
            taskTitle: taskTitle,
            taskRef: taskRef,
            boardTitle: translatedBoardTitle.en
          }, 'en'),
          fr: t('activity.removedSprint', {
            sprintName: oldSprintName,
            taskTitle: taskTitle,
            taskRef: taskRef,
            boardTitle: translatedBoardTitle.fr
          }, 'fr')
        });
      } else if (!oldSprintName && newSprintName) {
        // Associated with sprint
        sprintChangeText = JSON.stringify({
          en: t('activity.associatedSprint', {
            sprintName: newSprintName,
            taskTitle: taskTitle,
            taskRef: taskRef,
            boardTitle: translatedBoardTitle.en
          }, 'en'),
          fr: t('activity.associatedSprint', {
            sprintName: newSprintName,
            taskTitle: taskTitle,
            taskRef: taskRef,
            boardTitle: translatedBoardTitle.fr
          }, 'fr')
        });
      }
      
      if (sprintChangeText) {
        changes.push(sprintChangeText);
      }
    }
    
    // Process fields sequentially to handle async operations
    for (const field of fieldsToTrack) {
      const oldValue = normalizedCurrentTask[field];
      const newValue = task[field];
      
      if (hasChanged(oldValue, newValue)) {
        if (field === 'columnId') {
          // MIGRATED: Special handling for column moves - get column titles for better readability
          const oldColumn = await helpers.getColumnById(db, oldValue);
          const newColumn = await helpers.getColumnById(db, newValue);
          const taskRef = task.ticket ? ` (${task.ticket})` : '';
          // Create bilingual message for column move
          const movedTaskText = JSON.stringify({
            en: t('activity.movedTaskFromTo', {
              taskTitle: task.title,
              taskRef,
              fromColumn: oldColumn?.title || 'Unknown',
              toColumn: newColumn?.title || 'Unknown'
            }, 'en'),
            fr: t('activity.movedTaskFromTo', {
              taskTitle: task.title,
              taskRef,
              fromColumn: oldColumn?.title || 'Unknown',
              toColumn: newColumn?.title || 'Unknown'
            }, 'fr')
          });
          changes.push(movedTaskText);
        } else {
          changes.push(await generateTaskUpdateDetails(field, currentTask[field], task[field], '', db));
        }
      }
    }
    
    const validationTime = Date.now() - validationStartTime;
    console.log(`⏱️  [PUT /tasks/:id] Task validation took ${validationTime}ms`);
    
    // MIGRATED: Use sqlManager instead of inline SQL
    const dbUpdateStartTime = Date.now();
    await taskQueries.updateTask(db, id, {
      title: task.title,
      description: task.description,
      memberid: task.memberId,
      requesterid: task.requesterId,
      startdate: task.startDate,
      duedate: task.dueDate,
      effort: task.effort != null ? task.effort : 0,
      priority: priorityName,
      priority_id: priorityId,
      columnid: task.columnId,
      boardid: task.boardId,
      position: task.position || 0,
      sprint_id: task.sprintId || null,
      pre_boardid: previousBoardId,
      pre_columnid: previousColumnId
    });
    const dbUpdateTime = Date.now() - dbUpdateStartTime;
    console.log(`⏱️  [PUT /tasks/:id] Database updates took ${dbUpdateTime}ms`);
    
    // Log activity if there were changes
    if (changes.length > 0) {
      const activityStartTime = Date.now();
      
      // Parse bilingual JSON from changes and combine them properly
      // Note: We pass partial details (just the changes) and let logTaskActivity add task/board context
      let details;
      if (changes.length === 1) {
        // Single change - use as-is (already bilingual JSON)
        details = changes[0];
      } else {
        // Multiple changes - parse each JSON and combine
        const messagesEn = [];
        const messagesFr = [];
        
        for (const change of changes) {
          try {
            const parsed = JSON.parse(change);
            if (parsed.en && parsed.fr) {
              // Bilingual JSON
              messagesEn.push(parsed.en);
              messagesFr.push(parsed.fr);
            } else {
              // Not valid bilingual JSON, use as-is for both languages
              messagesEn.push(change);
              messagesFr.push(change);
            }
          } catch {
            // Not JSON, use as-is for both languages (backward compatibility)
            messagesEn.push(change);
            messagesFr.push(change);
          }
        }
        
        // Create combined bilingual message (without prefix - logTaskActivity will add context)
        details = JSON.stringify({
          en: messagesEn.join(', '),
          fr: messagesFr.join(', ')
        });
      }
      
      // For single field changes, pass old and new values for better email templates
      let oldValue, newValue;
      if (changes.length === 1) {
        // Find which field changed (use normalized values)
        const changedField = fieldsToTrack.find(field => hasChanged(normalizedCurrentTask[field], task[field]));
        if (changedField) {
          oldValue = normalizedCurrentTask[changedField];
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
      // Check if this is a column move (use normalized values)
      if (hasChanged(normalizedCurrentTask.columnId, task.columnId)) {
        // MIGRATED: Get column info to check if task is completed
        const newColumn = await helpers.getColumnWithStatus(db, task.columnId);
        const oldColumn = await helpers.getColumnById(db, currentTask.columnId);
        
        const eventType = newColumn?.isFinished ? 'task_completed' : 'task_moved';
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
    
    // Build minimal WebSocket payload with only changed fields (optimization: reduce payload size by 80-95%)
    const wsStartTime = Date.now();
    
    // MIGRATED: Get priority info only if priority changed (avoid unnecessary query)
    let priorityInfo = null;
    if (priorityChanged) {
      if (priorityId) {
        const priority = await helpers.getPriorityById(db, priorityId);
        if (priority) {
          priorityInfo = {
            priorityId: priorityId,
            priorityName: priority.priority,
            priorityColor: priority.color
          };
        }
      }
    }
    
    // Determine which fields changed (already tracked in changes array, but build explicit list)
    const changedFields = [];
    for (const field of fieldsToTrack) {
      const oldValue = normalizedCurrentTask[field];
      const newValue = task[field];
      if (hasChanged(oldValue, newValue)) {
        changedFields.push(field);
      }
    }
    const currentBoardId = normalizedCurrentTask.boardId;
    if (hasChanged(currentBoardId, task.boardId)) changedFields.push('boardId');
    const currentPosition = currentTask.position || 0;
    const newPosition = task.position ?? 0;
    if (currentPosition !== newPosition) changedFields.push('position');
    // Sprint change detection is handled earlier in the function (around line 1028)
    // where we also generate the bilingual activity log message
    // Reuse the same variables declared earlier for WebSocket tracking
    if (hasChanged(currentSprintId, newSprintId)) changedFields.push('sprintId');
    
    // Build minimal payload (only changed fields + required fields)
    const { minimalTask, targetBoardId } = buildMinimalTaskUpdatePayload(
      currentTask,
      task,
      changedFields,
      priorityChanged,
      priorityInfo
    );
    
    // Add updatedBy (always include for tracking)
    minimalTask.updatedBy = userId;
    
    const webSocketData = {
      boardId: targetBoardId,
      task: minimalTask,
      timestamp: new Date().toISOString()
    };
    
    await notificationService.publish('task-updated', webSocketData, getTenantId(req));
    const wsTime = Date.now() - wsStartTime;
    const payloadSize = JSON.stringify(webSocketData).length;
    console.log(`⏱️  [PUT /tasks/:id] WebSocket publishing took ${wsTime}ms (payload: ${payloadSize} bytes, ${changedFields.length} fields changed)`);
    
    // Still fetch full task for API response (frontend that made the request needs full data)
    const fetchStartTime = Date.now();
    const taskResponse = await fetchTaskWithRelationships(db, id);
    const fetchTime = Date.now() - fetchStartTime;
    console.log(`⏱️  [PUT /tasks/:id] Fetching task with relationships for API response took ${fetchTime}ms`);
    
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
    
    // MIGRATED: Validate all tasks exist
    const taskIds = tasks.map(t => t.id);
    const existingTasks = await taskQueries.getTasksByIdsBasic(db, taskIds);
    
    const existingTaskMap = new Map(existingTasks.map(t => [t.id, t]));
    const missingTasks = taskIds.filter(id => !existingTaskMap.has(id));
    
    if (missingTasks.length > 0) {
      return res.status(404).json({ error: t('errors.taskNotFound') + `: ${missingTasks.join(', ')}` });
    }
    
    // MIGRATED: Get all priorities for lookup
    const allPriorities = await helpers.getAllPriorities(db);
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
      notificationService.publish('task-updated', {
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
    
    // MIGRATED: Get task details before deletion for logging
    const tTranslator = await getTranslator(db); // Use different name to avoid shadowing imported t
    const task = await taskQueries.getTaskById(db, id);
    if (!task) {
      return res.status(404).json({ error: tTranslator('errors.taskNotFound') });
    }
    
    // MIGRATED: Get board title and project identifier for activity logging
    const board = await helpers.getBoardById(db, task.boardid || task.boardId);
    const boardTitle = board ? board.title : 'Unknown Board';
    // Get project identifier from board (explicitly selected in getBoardById query)
    const projectIdentifier = board?.project || null;
    const taskTicket = task.ticket || null;
    
    // Log to reporting system BEFORE deletion (while we can still fetch task data)
    // Fire-and-forget: Don't await to avoid blocking API response
    logReportingActivity(db, 'task_deleted', userId, id).catch(error => {
      console.error('Background reporting activity logging failed:', error);
    });
    
    // MIGRATED: Get task attachments before deleting the task
    const attachments = await helpers.getAttachmentsForTask(db, id);

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
    
    // MIGRATED: Delete the task (cascades to attachments and comments)
    await taskQueries.deleteTask(db, id);
    
    // Update storage usage after deleting task (which cascades to attachments)
    // Import updateStorageUsage dynamically to avoid circular dependencies
    const { updateStorageUsage } = await import('../utils/storageUtils.js');
    await updateStorageUsage(db);
    
    // MIGRATED: Renumber remaining tasks in the same column sequentially from 0
    // CRITICAL: Normalize snake_case to camelCase (getTaskById returns snake_case)
    const columnId = task.columnid || task.columnId;
    const boardId = task.boardid || task.boardId;
    const remainingTasks = await taskQueries.getRemainingTasksInColumn(db, columnId, boardId);
    
    // Update positions sequentially from 0
    await taskQueries.renumberTasksInColumn(db, remainingTasks);
    
    // Send batch position update WebSocket event to prevent frontend from making individual PUT requests
    // This avoids hundreds of individual update requests when many tasks need renumbering
    if (remainingTasks.length > 0) {
      const positionUpdates = remainingTasks.map((taskItem, index) => ({
        taskId: taskItem.id,
        position: index,
        columnId: columnId
      }));
      
      // Publish batch position update to prevent frontend from making individual PUT requests
      await notificationService.publish('tasks-positions-updated', {
        boardId: boardId,  // Use normalized boardId
        updates: positionUpdates,
        timestamp: new Date().toISOString()
      }, getTenantId(req));
    }
    
    // Log deletion activity
    // Fire-and-forget: Don't await activity logging to avoid blocking API response
    // Create bilingual message for delete (use imported t function with language parameter)
    // Pass task ticket and project identifier so they can be appended to the message
    const deleteDetails = JSON.stringify({
      en: t('activity.deletedTask', { taskTitle: task.title, taskRef: '', boardTitle: boardTitle }, 'en'),
      fr: t('activity.deletedTask', { taskTitle: task.title, taskRef: '', boardTitle: boardTitle }, 'fr')
    });
    logTaskActivity(
      userId,
      TASK_ACTIONS.DELETE,
      id,
      deleteDetails,
      {
        columnId: columnId,  // Use normalized columnId
        boardId: boardId,  // Use normalized boardId
        tenantId: getTenantId(req),
        db: db,
        taskTicket: taskTicket,  // Pass ticket so it can be appended to the message
        projectIdentifier: projectIdentifier  // Pass project identifier so it can be appended
      }
    ).catch(error => {
      console.error('Background activity logging failed:', error);
    });
    
    // Publish to Redis for real-time updates
    // CRITICAL: Use normalized boardId (not task.boardId which might be undefined)
    await notificationService.publish('task-deleted', {
      boardId: boardId,  // Use normalized boardId instead of task.boardId
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
    const tTranslator = await getTranslator(db); // Use different name to avoid shadowing imported t
    const now = new Date().toISOString();
    
    // MIGRATED: Validate all tasks exist and get their current data
    const validateStartTime = Date.now();
    const taskIds = updates.map(u => u.taskId);
    const currentTasks = await taskQueries.getTasksByIdsBasic(db, taskIds);
    console.log(`⏱️  [batch-update-positions] Task validation took ${Date.now() - validateStartTime}ms`);
    
    if (currentTasks.length !== taskIds.length) {
      return res.status(404).json({ error: tTranslator('errors.taskNotFound') });
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
      const isPostgres = isPostgresDatabase(db);
      const updateQuery = isPostgres ? `
        UPDATE tasks SET 
          position = $1, 
          columnid = $2,
          pre_boardid = $3, 
          pre_columnid = $4,
          updated_at = $5
        WHERE id = $6
      ` : `
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
      // MIGRATED: Use sqlManager to get columns (getColumnWithStatus now includes id)
      const columns = await Promise.all(columnIds.map(columnId => helpers.getColumnWithStatus(db, columnId)));
      const columnMap = new Map(columns.filter(c => c).map(c => [c.id, c]));
      console.log(`⏱️  [batch-update-positions] Column fetch took ${Date.now() - activityStartTime}ms`);
      
      // Log activities (fire-and-forget: Don't await to avoid blocking API response)
      // Start all activity logs in parallel but don't wait for them
      columnMoves.forEach((move) => {
        const oldColumn = columnMap.get(move.previousColumnId);
        const newColumn = columnMap.get(move.columnId);
        const taskRef = ''; // Batch moves don't include ticket ref in the move object
        
        // Create bilingual message for column move (same pattern as regular update route)
        const movedTaskText = JSON.stringify({
          en: t('activity.movedTaskFromTo', {
            taskTitle: move.title,
            taskRef,
            fromColumn: oldColumn?.title || 'Unknown',
            toColumn: newColumn?.title || 'Unknown'
          }, 'en'),
          fr: t('activity.movedTaskFromTo', {
            taskTitle: move.title,
            taskRef,
            fromColumn: oldColumn?.title || 'Unknown',
            toColumn: newColumn?.title || 'Unknown'
          }, 'fr')
        });
        
        logTaskActivity(
          userId,
          TASK_ACTIONS.UPDATE,
          move.taskId,
          movedTaskText,
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
        const eventType = newColumn?.isFinished ? 'task_completed' : 'task_moved';
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
    
    // Publish WebSocket updates for all changed tasks (optimized: send only position/columnId changes)
    // Build minimal payloads with only changed fields (80-95% payload reduction)
    const wsStartTime = Date.now();
    const tenantId = getTenantId(req);
    
    // Build minimal payloads for each task (only position and columnId changes)
    // Include essential fields for frontend display (title, boardId, memberId, ticket)
    const publishPromises = updates.map(update => {
      const currentTask = taskMap.get(update.taskId);
      if (!currentTask) return Promise.resolve();
      
      // Get target columnId (from update or keep current)
      // getTasksByIdsBasic now returns camelCase, but keep fallback for safety
      const currentBoardId = currentTask.boardId || currentTask.boardid;
      const currentColumnId = currentTask.columnId || currentTask.columnid;
      const targetColumnId = update.columnId || currentColumnId;
      const columnChanged = targetColumnId !== currentColumnId;
      
      // Build minimal task payload with essential fields for frontend display
      // Frontend needs these fields when task doesn't exist in target column yet
      const minimalTask = {
        id: update.taskId,
        title: currentTask.title, // Required for display
        boardId: currentBoardId, // Required for routing
        columnId: targetColumnId,
        position: update.position,
        memberId: currentTask.memberId || currentTask.memberid || null, // For assignee display
        ticket: currentTask.ticket || null, // For task reference display
        updatedBy: userId
      };
      
      // Include previous location for cross-column moves (helps frontend with cleanup)
      if (columnChanged && currentColumnId !== targetColumnId) {
        minimalTask.previousColumnId = currentColumnId;
      }
      
      // Use current task's boardId (batch position updates don't change board)
      const targetBoardId = currentBoardId;
      
      return notificationService.publish('task-updated', {
        boardId: targetBoardId,
        task: minimalTask,
        timestamp: now
      }, tenantId).catch(error => {
        console.error('❌ Background WebSocket publish failed:', error);
      });
    });
    
    const wsTime = Date.now() - wsStartTime;
    const totalPayloadSize = updates.length * 200; // Estimate ~200 bytes per minimal task
    console.log(`⏱️  [batch-update-positions] WebSocket payload preparation took ${wsTime}ms (estimated ${totalPayloadSize} bytes total, ${updates.length} tasks)`);
    
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
    // MIGRATED: Get current task using sqlManager
    const currentTask = await taskQueries.getTaskById(db, taskId);

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
    // Create bilingual message for reorder
    const reorderDetails = JSON.stringify({
      en: t('activity.reorderedTask', { 
        taskTitle: currentTask.title, 
        fromPosition: currentPosition, 
        toPosition: newPosition 
      }, 'en'),
      fr: t('activity.reorderedTask', { 
        taskTitle: currentTask.title, 
        fromPosition: currentPosition, 
        toPosition: newPosition 
      }, 'fr')
    });
    logTaskActivity(
      userId,
      TASK_ACTIONS.UPDATE, // Reorder is a type of update
      taskId,
      reorderDetails,
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
      // MIGRATED: Use sqlManager instead of inline SQL
      const newColumn = await helpers.getColumnWithStatus(db, columnId);
      const oldColumn = await helpers.getColumnById(db, previousColumnId);
      
      const eventType = newColumn?.isFinished ? 'task_completed' : 'task_moved';
      // Fire-and-forget: Don't await to avoid blocking API response
      logReportingActivity(db, eventType, userId, taskId, {
        fromColumnId: previousColumnId,
        fromColumnName: oldColumn?.title,
        toColumnId: columnId,
        toColumnName: newColumn?.title
      }).catch(error => {
        console.error('Background reporting activity logging failed:', error);
      });
    }

    // Publish to Redis for real-time updates (optimized: send only position change)
    // Include essential fields for frontend display (title, boardId, memberId, ticket)
    const minimalTask = {
      id: taskId,
      title: currentTask.title, // Required for display
      boardId: currentTask.boardId, // Required for routing
      columnId: columnId,
      position: newPosition,
      memberId: currentTask.memberId || null, // For assignee display
      ticket: currentTask.ticket || null, // For task reference display
      updatedBy: userId
    };
    
    // Include previous columnId if column changed (helps frontend with cleanup)
    if (previousColumnId !== columnId) {
      minimalTask.previousColumnId = previousColumnId;
    }
    
    await notificationService.publish('task-updated', {
      boardId: currentTask.boardId,
      task: minimalTask,
      timestamp: new Date().toISOString()
    }, getTenantId(req));
    
    // Still fetch full task for API response (frontend that made the request needs full data)
    const taskResponse = await fetchTaskWithRelationships(db, taskId);

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
    
    // MIGRATED: Get source column title for intelligent placement
    const sourceColumn = await helpers.getColumnById(db, task.columnid || task.columnId);
    
    let targetColumn = null;
    
    // Try to find a column with the same title in the target board
    if (sourceColumn) {
      targetColumn = await helpers.getColumnByTitleInBoard(db, targetBoardId, sourceColumn.title);
      
      if (targetColumn) {
        console.log(`🎯 Smart placement: Found matching column "${sourceColumn.title}" in target board`);
      }
    }
    
    // Fallback to first column if no matching column found
    if (!targetColumn) {
      targetColumn = await helpers.getFirstColumnInBoard(db, targetBoardId);
      
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
        // MIGRATED: Shift existing tasks in target column to make room at position 0
        await taskQueries.incrementTaskPositions(db, targetColumn.id);
        
        // MIGRATED: Update the existing task to move it to the new location
        await taskQueries.updateTaskPositionAndColumn(
          db, 
          taskId, 
          0, 
          targetColumn.id, 
          originalBoardId, 
          originalColumnId
        );
      });
    }
    
    // MIGRATED: Log move activity using sqlManager
    const originalBoard = await boardQueries.getBoardById(db, originalBoardId);
    const targetBoard = await boardQueries.getBoardById(db, targetBoardId);
    // Create bilingual message for board move
    const moveDetails = JSON.stringify({
      en: t('activity.movedTaskBoard', {
        taskTitle: task.title,
        fromBoard: originalBoard?.title || 'Unknown',
        toBoard: targetBoard?.title || 'Unknown'
      }, 'en'),
      fr: t('activity.movedTaskBoard', {
        taskTitle: task.title,
        fromBoard: originalBoard?.title || 'Unknown',
        toBoard: targetBoard?.title || 'Unknown'
      }, 'fr')
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
    // MIGRATED: Use sqlManager
    const newColumn = await helpers.getColumnWithStatus(db, targetColumn.id);
    const oldColumn = await helpers.getColumnById(db, originalColumnId);
    
    const eventType = newColumn?.isFinished ? 'task_completed' : 'task_moved';
    // Fire-and-forget: Don't await to avoid blocking API response
    logReportingActivity(db, eventType, userId, taskId, {
      fromColumnId: originalColumnId,
      fromColumnName: oldColumn?.title,
      toColumnId: targetColumn.id,
      toColumnName: newColumn?.title
    }).catch(error => {
      console.error('Background reporting activity logging failed:', error);
    });
    
    // Get the updated task data with all relationships for WebSocket
    const taskResponse = await fetchTaskWithRelationships(db, taskId);
    
    // Publish to Redis for real-time updates (both boards need to be notified)
    // Includes complete task data with relationships
    const tenantId = getTenantId(req);
    await notificationService.publish('task-updated', {
      boardId: originalBoardId,
      task: {
        ...taskResponse,
        updatedBy: userId
      },
      timestamp: new Date().toISOString()
    }, tenantId);
    
    await notificationService.publish('task-updated', {
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

// MIGRATED: Get tasks by board
router.get('/by-board/:boardId', authenticateToken, async (req, res) => {
  const { boardId } = req.params;
  try {
    const db = getRequestDatabase(req);
    const tasks = await taskQueries.getTasksByBoard(db, boardId);
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
    // MIGRATED: Get task's board ID for Redis publishing
    const boardId = await taskQueries.getTaskBoardId(db, taskId);
    if (!boardId) {
      return res.status(404).json({ error: t('errors.taskNotFound') });
    }
    
    // MIGRATED: Add watcher using sqlManager
    await helpers.addWatcher(db, taskId, memberId);
    
    // Log to reporting system (fire-and-forget: Don't await to avoid blocking API response)
    logReportingActivity(db, 'watcher_added', userId, taskId).catch(error => {
      console.error('Background reporting activity logging failed:', error);
    });
    
    // Publish to Redis for real-time updates
    await notificationService.publish('task-watcher-added', {
      boardId: boardId,
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
    
    // MIGRATED: Get task's board ID for Redis publishing
    const boardId = await taskQueries.getTaskBoardId(db, taskId);
    if (!boardId) {
      return res.status(404).json({ error: t('errors.taskNotFound') });
    }
    
    // MIGRATED: Remove watcher using sqlManager
    await helpers.removeWatcher(db, taskId, memberId);
    
    // Publish to Redis for real-time updates
    await notificationService.publish('task-watcher-removed', {
      boardId: boardId,
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
    
    // MIGRATED: Get task's board ID for Redis publishing
    const boardId = await taskQueries.getTaskBoardId(db, taskId);
    if (!boardId) {
      return res.status(404).json({ error: t('errors.taskNotFound') });
    }
    
    // MIGRATED: Add collaborator using sqlManager
    await helpers.addCollaborator(db, taskId, memberId);
    
    // Log to reporting system (fire-and-forget: Don't await to avoid blocking API response)
    logReportingActivity(db, 'collaborator_added', userId, taskId).catch(error => {
      console.error('Background reporting activity logging failed:', error);
    });
    
    // Publish to Redis for real-time updates
    await notificationService.publish('task-collaborator-added', {
      boardId: boardId,
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
    
    // MIGRATED: Get task's board ID for Redis publishing
    const boardId = await taskQueries.getTaskBoardId(db, taskId);
    if (!boardId) {
      return res.status(404).json({ error: t('errors.taskNotFound') });
    }
    
    // MIGRATED: Remove collaborator using sqlManager
    await helpers.removeCollaborator(db, taskId, memberId);
    
    // Publish to Redis for real-time updates
    await notificationService.publish('task-collaborator-removed', {
      boardId: boardId,
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
    
    // MIGRATED: Get all relationships where this task is involved
    const relationships = await taskQueries.getTaskRelationships(db, taskId);
    
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
    
    // MIGRATED: Verify both tasks exist
    const taskExistsResult = await taskQueries.taskExists(db, taskId);
    const toTaskExistsResult = await taskQueries.taskExists(db, toTaskId);
    
    if (!taskExistsResult || !toTaskExistsResult) {
      return res.status(404).json({ error: t('errors.oneOrBothTasksNotFound') });
    }
    
    // MIGRATED: Check if relationship already exists
    const existingRelationship = await taskQueries.getTaskRelationship(db, taskId, relationship, toTaskId);
    
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
    
    // MIGRATED: Use a transaction to ensure atomicity
    let insertResult;
    await dbTransaction(db, async () => {
      // MIGRATED: Insert the relationship using sqlManager
      insertResult = await taskQueries.createTaskRelationship(db, taskId, relationship, toTaskId);
      
      // For parent/child relationships, also create the inverse relationship
      // Check if inverse already exists to avoid UNIQUE constraint violations
      if (relationship === 'parent') {
        const inverseExists = await taskQueries.getTaskRelationship(db, toTaskId, 'child', taskId);
        
        if (!inverseExists) {
          await taskQueries.createTaskRelationship(db, toTaskId, 'child', taskId);
        }
      } else if (relationship === 'child') {
        const inverseExists = await taskQueries.getTaskRelationship(db, toTaskId, 'parent', taskId);
        
        if (!inverseExists) {
          await taskQueries.createTaskRelationship(db, toTaskId, 'parent', taskId);
        }
      }
    });
    
    console.log(`✅ Created relationship: ${taskId} (${relationship}) → ${toTaskId}`);
    
    // Verify the insertion was successful
    if (!insertResult || insertResult.changes === 0) {
      return res.status(500).json({ error: t('errors.failedToCreateRelationship') });
    }
    
    // MIGRATED: Get the board ID for the source task to publish the update
    const sourceBoardId = await taskQueries.getTaskBoardId(db, taskId);
    const targetBoardId = await taskQueries.getTaskBoardId(db, toTaskId);
    
    // Publish to Redis for real-time updates (both boards need to be notified)
    const tenantId = getTenantId(req);
    if (sourceBoardId) {
      await notificationService.publish('task-relationship-created', {
        boardId: sourceBoardId,
        taskId: taskId,
        relationship: relationship,
        toTaskId: toTaskId,
        timestamp: new Date().toISOString()
      }, tenantId);
    }
    
    if (targetBoardId && targetBoardId !== sourceBoardId) {
      await notificationService.publish('task-relationship-created', {
        boardId: targetBoardId,
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
    
    // MIGRATED: Get the relationship details before deleting
    // MIGRATED: Get relationship by ID using sqlManager
    const relationship = await taskQueries.getTaskRelationshipById(db, relationshipId, taskId);
    
    if (!relationship) {
      return res.status(404).json({ error: t('errors.relationshipNotFound') });
    }
    
    // MIGRATED: Delete the main relationship
    await taskQueries.deleteTaskRelationship(db, relationshipId);
    
    // For parent/child relationships, also delete the inverse relationship
    if (relationship.relationship === 'parent') {
      const inverseRel = await taskQueries.getTaskRelationship(db, relationship.to_task_id, 'child', relationship.task_id);
      if (inverseRel) {
        await taskQueries.deleteTaskRelationship(db, inverseRel.id);
      }
    } else if (relationship.relationship === 'child') {
      const inverseRel = await taskQueries.getTaskRelationship(db, relationship.to_task_id, 'parent', relationship.task_id);
      if (inverseRel) {
        await taskQueries.deleteTaskRelationship(db, inverseRel.id);
      }
    }
    
    // MIGRATED: Get the board ID for the source task to publish the update
    const sourceBoardId = await taskQueries.getTaskBoardId(db, taskId);
    const targetBoardId = await taskQueries.getTaskBoardId(db, relationship.to_task_id);
    
    // Publish to Redis for real-time updates (both boards need to be notified)
    const tenantId = getTenantId(req);
    if (sourceBoardId) {
      await notificationService.publish('task-relationship-deleted', {
        boardId: sourceBoardId,
        taskId: taskId,
        relationship: relationship.relationship,
        toTaskId: relationship.to_task_id,
        timestamp: new Date().toISOString()
      }, tenantId);
    }
    
    if (targetBoardId && targetBoardId !== sourceBoardId) {
      await notificationService.publish('task-relationship-deleted', {
        boardId: targetBoardId,
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
    
    // MIGRATED: Get all tasks except the current one and already related ones
    const availableTasks = await taskQueries.getAvailableTasksForRelationship(db, taskId);
    
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
      
      // MIGRATED: Find all tasks connected to current task
      const connectedIds = await taskQueries.getConnectedTaskIds(db, currentId);
      
      connectedIds.forEach(connectedId => {
        if (!connectedTaskIds.has(connectedId)) {
          connectedTaskIds.add(connectedId);
          toProcess.push(connectedId);
        }
      });
    }
    
    console.log(`🔍 FlowChart API: Found ${connectedTaskIds.size} connected tasks`);
    
    // MIGRATED: Step 2: Get full task data for all connected tasks
    if (connectedTaskIds.size > 0) {
      const taskIdsArray = Array.from(connectedTaskIds);
      const tasks = await taskQueries.getTasksForFlowChart(db, taskIdsArray);
      
      // MIGRATED: Step 3: Get all relationships between these tasks
      const relationships = await taskQueries.getRelationshipsForFlowChart(db, taskIdsArray);
      
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