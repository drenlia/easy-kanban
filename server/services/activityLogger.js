import { isValidAction } from '../constants/activityActions.js';
import { getNotificationService } from './notificationService.js';
import redisService from './redisService.js';
import { getTranslator } from '../utils/i18n.js';

/**
 * Activity Logger Service
 * Handles logging of user activities in the system
 */

let db; // Database instance will be injected

/**
 * Initialize the activity logger with database instance
 */
export const initActivityLogger = (database) => {
  db = database;
};

/**
 * Log a task-related activity with automatic role detection
 * @param {string} userId - User ID
 * @param {string} action - Action constant
 * @param {string} taskId - Task ID
 * @param {string} details - Description of the change
 * @param {Object} [additionalData] - Additional data (columnId, boardId, tenantId, db, etc.)
 * @param {Database} [additionalData.db] - Database instance (for multi-tenant mode, falls back to global db)
 */
export const logTaskActivity = async (userId, action, taskId, details, additionalData = {}) => {
  // Use database from additionalData if provided (multi-tenant mode), otherwise use global db
  const database = additionalData.db || db;
  
  if (!database) {
    console.warn('Activity logger: No database available, skipping log');
    return;
  }

  if (!userId || !action || !taskId || !details) {
    console.warn('Missing required parameters for activity logging');
    return;
  }

  if (!isValidAction(action)) {
    console.warn(`Warning: Unknown action "${action}" being logged`);
  }

  try {
    // Get task and board information for context
    let taskTitle = 'Unknown Task';
    let boardId = null;
    let boardTitle = 'Unknown Board';
    let columnId = null;

    try {
      const taskInfo = database.prepare(
        `SELECT t.title, t.boardId, t.columnId, b.title as boardTitle 
         FROM tasks t 
         LEFT JOIN boards b ON t.boardId = b.id 
         WHERE t.id = ?`
      ).get(taskId);
      
      if (taskInfo) {
        taskTitle = taskInfo.title || 'Unknown Task';
        boardId = taskInfo.boardId;
        boardTitle = taskInfo.boardTitle || 'Unknown Board';
        columnId = taskInfo.columnId;
      }
    } catch (taskError) {
      console.warn('Failed to get task/board info for task activity:', taskError.message);
    }

    // Get user's current role
    const userRole = database.prepare(`
      SELECT r.id as roleId 
      FROM user_roles ur 
      JOIN roles r ON ur.role_id = r.id 
      WHERE ur.user_id = ? 
      ORDER BY r.name DESC 
      LIMIT 1
    `).get(userId);

    // Get the first available role as fallback
    const fallbackRole = database.prepare(`SELECT id FROM roles ORDER BY id ASC LIMIT 1`).get();
    const roleId = userRole?.roleId || fallbackRole?.id || null;

    // Check if user exists
    const userExists = database.prepare(`SELECT id FROM users WHERE id = ?`).get(userId);

    if (!userExists || !roleId) {
      console.warn(`Skipping activity log: User ${userId} or role ${roleId} not found in database`);
      return;
    }

    // Get project identifier and task ticket for enhanced context
    let projectIdentifier = null;
    let taskTicket = null;
    
    try {
      const taskDetails = database.prepare(
        `SELECT t.ticket, b.project 
         FROM tasks t 
         LEFT JOIN boards b ON t.boardId = b.id 
         WHERE t.id = ?`
      ).get(taskId);
      
      if (taskDetails) {
        projectIdentifier = taskDetails.project;
        taskTicket = taskDetails.ticket;
      }
    } catch (prefixError) {
      console.warn('Failed to get project/task identifiers:', prefixError.message);
    }

    // Get translator for activity messages
    const t = getTranslator(database);
    
    // Translate task and board titles if they are default values
    const translatedTaskTitle = taskTitle === 'Unknown Task' ? t('activity.unknownTask') : taskTitle;
    const translatedBoardTitle = boardTitle === 'Unknown Board' ? t('activity.unknownBoard') : boardTitle;
    
    // Create enhanced details with context for specific actions
    let enhancedDetails = details;
    const taskRef = taskTicket ? ` (${taskTicket})` : '';
    
    if (action === 'create_task') {
      // Check if this is a "create at top" action
      if (details && details.includes('at top')) {
        enhancedDetails = t('activity.createdTaskAtTop', {
          taskTitle: translatedTaskTitle
        });
      } else {
        enhancedDetails = t('activity.createdTask', {
          taskTitle: translatedTaskTitle,
          taskRef,
          boardTitle: translatedBoardTitle
        });
      }
    } else if (action === 'delete_task') {
      // For delete_task, if taskTitle is "Unknown Task", use the provided details
      if (taskTitle === 'Unknown Task' && details.includes('deleted task')) {
        enhancedDetails = details; // Use the provided details as-is (already translated)
      } else {
        enhancedDetails = t('activity.deletedTask', {
          taskTitle: translatedTaskTitle,
          taskRef,
          boardTitle: translatedBoardTitle
        });
      }
    } else if (action === 'move_task') {
      // Board move already includes task name, add task reference if available
      enhancedDetails = t('activity.movedTask', {
        details,
        taskRef,
        boardTitle: translatedBoardTitle
      });
    } else if (action === 'update_task') {
      // Check if this is a column move (already includes task name in details)
      if (details.includes('moved task') && details.includes('from') && details.includes('to')) {
        // Column move already includes task reference, just add board context
        enhancedDetails = t('activity.movedTaskColumn', {
          details,
          boardTitle: translatedBoardTitle
        });
      } else {
        enhancedDetails = t('activity.updatedTask', {
          details,
          taskTitle: translatedTaskTitle,
          taskRef,
          boardTitle: translatedBoardTitle
        });
      }
    }

    // Append project and task identifiers (always enabled)
    if (projectIdentifier || taskTicket) {
      const identifiers = [];
      if (projectIdentifier) identifiers.push(projectIdentifier);
      if (taskTicket) identifiers.push(taskTicket);
      if (identifiers.length > 0) {
        enhancedDetails += ` (${identifiers.join('/')})`;
      }
    }

    // Debug logging

    // Insert activity into database
    const stmt = db.prepare(`
      INSERT INTO activity (
        userId, roleId, action, taskId, columnId, boardId, tagId, details, 
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      userId,
      roleId,
      action,
      taskId,
      columnId || additionalData.columnId || null,
      boardId || additionalData.boardId || null,
      additionalData.tagId || null,
      enhancedDetails
    );

    // Publish activity update to Redis for real-time updates
    try {
      if (redisService) {
        // Get the latest activities for the activity feed
        const latestActivities = database.prepare(`
          SELECT 
            a.id, a.userId, a.roleId, a.action, a.taskId, a.columnId, a.boardId, a.tagId, a.details,
            datetime(a.created_at) || 'Z' as created_at,
            a.updated_at,
            m.name as member_name,
            r.name as role_name,
            b.title as board_title,
            c.title as column_title
          FROM activity a
          LEFT JOIN members m ON a.userId = m.user_id
          LEFT JOIN roles r ON a.roleId = r.id
          LEFT JOIN boards b ON a.boardId = b.id
          LEFT JOIN columns c ON a.columnId = c.id
          ORDER BY a.created_at DESC
          LIMIT 20
        `).all();

        // Get tenantId from additionalData if provided (for multi-tenant isolation)
        const tenantId = additionalData.tenantId || null;
        await redisService.publish('activity-updated', {
          activities: latestActivities,
          timestamp: new Date().toISOString()
        }, tenantId);
      }
    } catch (redisError) {
      console.warn('Failed to publish activity update to Redis:', redisError.message);
    }
    
    // Send notification email in the background (fire-and-forget)
    // This improves UX by not blocking the API response while emails are being sent
    const notificationService = getNotificationService();
    if (notificationService) {
      notificationService.sendTaskNotification({
        userId,
        action,
        taskId,
        details: enhancedDetails,
        oldValue: additionalData.oldValue,
        newValue: additionalData.newValue
      }).catch(notificationError => {
        console.error('❌ Error sending notification:', notificationError);
        // Errors are logged but don't affect the main flow
      });
    }
    
  } catch (error) {
    console.error('❌ Error logging activity:', error);
    // Don't throw - activity logging should never break the main functionality
  }
};

/**
 * Log a general activity (non-task specific)
 * @param {string} userId - User ID
 * @param {string} action - Action constant
 * @param {string} details - Description of the change
 * @param {Object} [additionalData] - Additional data (columnId, boardId, tagId, etc.)
 */
export const logActivity = async (userId, action, details, additionalData = {}) => {
  // Use database from additionalData if provided (multi-tenant mode), otherwise use global db
  const database = additionalData.db || db;
  
  if (!database) {
    console.warn('Activity logger: No database available, skipping log');
    return;
  }

  if (!userId || !action || !details) {
    console.warn('Missing required parameters for activity logging');
    return;
  }

  if (!isValidAction(action)) {
    console.warn(`Warning: Unknown action "${action}" being logged`);
  }

  try {
    // Get translator for activity messages
    const t = getTranslator(database);
    
    // Get user's current role
    const userRole = database.prepare(`
      SELECT r.id as roleId 
      FROM user_roles ur 
      JOIN roles r ON ur.role_id = r.id 
      WHERE ur.user_id = ? 
      ORDER BY r.name DESC 
      LIMIT 1
    `).get(userId);

    // Get the first available role as fallback
    const fallbackRole = database.prepare(`SELECT id FROM roles ORDER BY id ASC LIMIT 1`).get();
    const roleId = userRole?.roleId || fallbackRole?.id || null;

    // Check if user exists
    const userExists = database.prepare(`SELECT id FROM users WHERE id = ?`).get(userId);

    if (!userExists || !roleId) {
      console.warn(`Skipping activity log: User ${userId} or role ${roleId} not found in database`);
      return;
    }

    // Try to translate common activity patterns
    // For now, we'll use the details as-is if it doesn't match a known pattern
    // This allows callers to pass pre-translated strings or custom messages
    let translatedDetails = details;
    
    // Simple pattern matching for common activities (can be expanded)
    // For tag associations, relationships, etc., we'll keep the details as-is
    // since they may contain dynamic content that's already formatted

    // Insert activity into database
    const stmt = db.prepare(`
      INSERT INTO activity (
        userId, roleId, action, taskId, columnId, boardId, tagId, details, 
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      userId,
      roleId,
      action,
      additionalData.taskId || null,
      additionalData.columnId || null,
      additionalData.boardId || null,
      additionalData.tagId || null,
      translatedDetails
    );

    
  } catch (error) {
    console.error('❌ Error logging activity:', error);
    // Don't throw - activity logging should never break the main functionality
  }
};

/**
 * Helper function to generate detailed descriptions for common task changes
 */
/**
 * Analyze HTML content to extract images and text content
 */
const analyzeHTMLContent = (html) => {
  if (!html) return { text: '', images: [] };
  
  // Extract images (look for img tags with src)
  const imageRegex = /<img[^>]*src="([^"]*)"[^>]*>/g;
  const images = [];
  let match;
  while ((match = imageRegex.exec(html)) !== null) {
    images.push(match[1]); // src URL
  }
  
  // Extract text content (remove HTML tags)
  const textContent = html
    .replace(/<img[^>]*>/g, '') // Remove img tags
    .replace(/<[^>]*>/g, '') // Remove all other HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  return { text: textContent, images };
};

/**
 * Generate intelligent description change details
 */
const generateDescriptionChangeDetails = (oldValue, newValue, t) => {
  if (!t) {
    // Fallback if translator not provided
    t = (key, params = {}) => {
      if (key === 'activity.updatedDescription') return 'updated description';
      if (key === 'activity.addedAttachment') return `added ${params.count} attachment${params.count > 1 ? 's' : ''}`;
      if (key === 'activity.removedAttachment') return `removed ${params.count} attachment${params.count > 1 ? 's' : ''}`;
      return key;
    };
  }

  const oldContent = analyzeHTMLContent(oldValue);
  const newContent = analyzeHTMLContent(newValue);
  
  const textChanged = oldContent.text !== newContent.text;
  const imagesAdded = newContent.images.filter(img => !oldContent.images.includes(img));
  const imagesRemoved = oldContent.images.filter(img => !newContent.images.includes(img));
  
  const actions = [];
  
  // Check for text changes
  if (textChanged) {
    actions.push(t('activity.updatedDescription'));
  }
  
  // Check for image changes
  if (imagesAdded.length > 0) {
    const count = imagesAdded.length;
    const key = count === 1 ? 'activity.addedAttachment' : 'activity.addedAttachments';
    actions.push(t(key, { count }));
  }
  
  if (imagesRemoved.length > 0) {
    const count = imagesRemoved.length;
    const key = count === 1 ? 'activity.removedAttachment' : 'activity.removedAttachments';
    actions.push(t(key, { count }));
  }
  
  // If no meaningful changes detected, fall back to generic message
  if (actions.length === 0) {
    return t('activity.updatedDescription');
  }
  
  // Join actions with " and " - this needs to be translated too, but for now we'll use English
  return actions.join(' and ');
};

export const generateTaskUpdateDetails = (field, oldValue, newValue, additionalContext = '', db = null) => {
  // Use provided db parameter, or fall back to global db
  const finalDb = db || (typeof additionalContext === 'object' && additionalContext?.db) || null;
  // If additionalContext is a string, use it as context; otherwise extract context from object
  const context = typeof additionalContext === 'string' ? additionalContext : (additionalContext?.context || '');
  
  if (!finalDb) {
    console.warn('Database not available for generateTaskUpdateDetails');
    return '';
  }

  const t = getTranslator(finalDb);
  // Map field names to translation keys (handle legacy field names)
  const fieldKeyMap = {
    'priority': 'priorityId',
    'priorityId': 'priorityId'
  };
  const translationKey = fieldKeyMap[field] || field;
  const fieldLabel = t(`activity.fieldLabels.${translationKey}`, {}, field);
  // Use context from parameter (already extracted above)

  // Special handling for description changes
  if (field === 'description') {
    if (oldValue === null || oldValue === undefined || oldValue === '') {
      return newValue ? t('activity.addedDescription') : t('activity.updatedDescription');
    } else if (newValue === null || newValue === undefined || newValue === '') {
      return t('activity.clearedDescription');
    } else {
      return generateDescriptionChangeDetails(oldValue, newValue, t);
    }
  }

  // Special handling for memberId and requesterId changes - resolve member IDs to member names
  if (field === 'memberId' || field === 'requesterId') {
    const getMemberName = (memberId) => {
      if (!memberId || !finalDb) return t('activity.unassigned');
      try {
        const member = finalDb.prepare(`
          SELECT m.name 
          FROM members m 
          WHERE m.id = ?
        `).get(memberId);
        return member?.name || t('activity.unknownUser');
      } catch (error) {
        console.warn('Failed to resolve member name for member ID:', memberId, error.message);
        return t('activity.unknownUser');
      }
    };

    const oldName = getMemberName(oldValue);
    const newName = getMemberName(newValue);

    if (field === 'memberId') {
      if (oldValue === null || oldValue === undefined || oldValue === '') {
        return t('activity.setAssignee', { newName }) + context;
      } else if (newValue === null || newValue === undefined || newValue === '') {
        return t('activity.clearedAssignee', { oldName }) + context;
      } else {
        return t('activity.changedAssignee', { oldName, newName }) + context;
      }
    } else if (field === 'requesterId') {
      if (oldValue === null || oldValue === undefined || oldValue === '') {
        return t('activity.setRequester', { newName }) + context;
      } else if (newValue === null || newValue === undefined || newValue === '') {
        return t('activity.clearedRequester', { oldName }) + context;
      } else {
        return t('activity.changedRequester', { oldName, newName }) + context;
      }
    }
  }

  // Handle other fields as before
  if (oldValue === null || oldValue === undefined || oldValue === '') {
      return t('activity.setField', { fieldLabel, newValue }) + context;
    } else if (newValue === null || newValue === undefined || newValue === '') {
      return t('activity.clearedField', { fieldLabel, oldValue }) + context;
    } else {
      return t('activity.changedField', { fieldLabel, oldValue, newValue }) + context;
    }
};

/**
 * Log a comment-related activity
 * @param {string} userId - User ID
 * @param {string} action - Action constant from COMMENT_ACTIONS
 * @param {string} commentId - Comment ID (TEXT/UUID)
 * @param {string} taskId - Task ID that the comment belongs to
 * @param {string} details - Description of the change
 * @param {Object} [additionalData] - Additional data (boardId, columnId, etc.)
 */
export const logCommentActivity = async (userId, action, commentId, taskId, details, additionalData = {}) => {
  // Use database from additionalData if provided (multi-tenant mode), otherwise use global db
  const database = additionalData.db || db;
  
  if (!database) {
    console.warn('Activity logger: No database available, skipping comment log');
    return;
  }

  if (!isValidAction(action)) {
    console.warn(`Unknown comment action "${action}" being logged`);
  }

  try {
    // Get task and board information for context
    let taskTitle = 'Unknown Task';
    let boardId = null;
    let boardTitle = 'Unknown Board';
    let columnId = null;

    try {
      const taskInfo = database.prepare(
        `SELECT t.title, t.boardId, t.columnId, b.title as boardTitle 
         FROM tasks t 
         LEFT JOIN boards b ON t.boardId = b.id 
         WHERE t.id = ?`
      ).get(taskId);
      
      if (taskInfo) {
        taskTitle = taskInfo.title || 'Unknown Task';
        boardId = taskInfo.boardId;
        boardTitle = taskInfo.boardTitle || 'Unknown Board';
        columnId = taskInfo.columnId;
      }
    } catch (taskError) {
      console.warn('Failed to get task/board info for comment activity:', taskError.message);
    }

    // Get user role with fallback
    let userRole = null;
    let fallbackRole = null;

    try {
      const roleResult = database.prepare(
        `SELECT ur.role_id, r.name as role_name 
         FROM user_roles ur 
         JOIN roles r ON ur.role_id = r.id 
         WHERE ur.user_id = ?`
      ).get(userId);
      userRole = roleResult?.role_id || null;
    } catch (roleError) {
      console.warn('Failed to get user role for comment activity:', roleError.message);
    }

    // Fallback to Member role if no role found
    if (!userRole) {
      try {
        const memberRoleResult = database.prepare(`SELECT id FROM roles WHERE name = 'Member'`).get();
        fallbackRole = memberRoleResult?.id || null;
      } catch (fallbackError) {
        console.warn('Failed to get fallback Member role:', fallbackError.message);
      }
    }

    const finalRoleId = userRole || fallbackRole;

    // Check if user exists
    const userExists = database.prepare(`SELECT id FROM users WHERE id = ?`).get(userId);
    if (!userExists) {
      console.warn(`User ${userId} not found for comment activity logging`);
    }

    // Get translator for activity messages
    const t = getTranslator(database);
    
    // Translate task and board titles if they are default values
    const translatedTaskTitle = taskTitle === 'Unknown Task' ? t('activity.unknownTask') : taskTitle;
    const translatedBoardTitle = boardTitle === 'Unknown Board' ? t('activity.unknownBoard') : boardTitle;
    
    // Get task reference for enhanced context
    let taskRef = '';
    try {
      const taskDetails = database.prepare(`SELECT ticket FROM tasks WHERE id = ?`).get(taskId);
      if (taskDetails?.ticket) {
        taskRef = ` (${taskDetails.ticket})`;
      }
    } catch (refError) {
      console.warn('Failed to get task reference for comment activity:', refError.message);
    }
    
    // Create clean, user-friendly details without exposing raw comment content
    let enhancedDetails;
    if (action === 'create_comment') {
      enhancedDetails = t('activity.addedComment', {
        taskTitle: translatedTaskTitle,
        taskRef,
        boardTitle: translatedBoardTitle
      });
    } else if (action === 'update_comment') {
      enhancedDetails = t('activity.updatedComment', {
        taskTitle: translatedTaskTitle,
        taskRef,
        boardTitle: translatedBoardTitle
      });
    } else if (action === 'delete_comment') {
      enhancedDetails = t('activity.deletedComment', {
        taskTitle: translatedTaskTitle,
        taskRef,
        boardTitle: translatedBoardTitle
      });
    } else {
      enhancedDetails = t('activity.updatedComment', {
        taskTitle: translatedTaskTitle,
        taskRef,
        boardTitle: translatedBoardTitle
      });
    }

    // Get project identifier and task ticket for enhanced context (always enabled)
    try {
      const taskDetails = database.prepare(
        `SELECT t.ticket, b.project 
         FROM tasks t 
         LEFT JOIN boards b ON t.boardId = b.id 
         WHERE t.id = ?`
      ).get(taskId);
      
      if (taskDetails && (taskDetails.project || taskDetails.ticket)) {
        const identifiers = [];
        if (taskDetails.project) identifiers.push(taskDetails.project);
        if (taskDetails.ticket) identifiers.push(taskDetails.ticket);
        if (identifiers.length > 0) {
          enhancedDetails += ` (${identifiers.join('/')})`;
        }
      }
    } catch (prefixError) {
      console.warn('Failed to get project/task identifiers for comment activity:', prefixError.message);
    }

    console.log('Logging comment activity:', {
      userId,
      roleId: finalRoleId,
      action,
      taskId,
      commentId,
      boardId,
      columnId,
      details: enhancedDetails,
      additionalData
    });

    database.prepare(
      `INSERT INTO activity (userId, roleId, action, taskId, commentId, columnId, boardId, tagId, details) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      finalRoleId,
      action,
      taskId,
      commentId,
      columnId || additionalData.columnId || null,
      boardId || additionalData.boardId || null,
      additionalData.tagId || null,
      enhancedDetails
    );

    console.log('Comment activity logged successfully');
    
    // Send notification email for comment activities in the background (fire-and-forget)
    // This improves UX by not blocking the API response while emails are being sent
    const notificationService = getNotificationService();
    if (notificationService) {
      // Use setImmediate or Promise without await to run in background
      notificationService.sendCommentNotification({
        userId,
        action,
        taskId,
        commentContent: additionalData.commentContent
      }).catch(notificationError => {
        console.error('❌ Error sending comment notification:', notificationError);
        // Errors are logged but don't affect the main flow
      });
    }
    
  } catch (error) {
    console.error('Failed to log comment activity:', error);
  }
};
