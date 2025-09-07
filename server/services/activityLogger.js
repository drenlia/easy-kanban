import { isValidAction } from '../constants/activityActions.js';

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
 * @param {Object} [additionalData] - Additional data (columnId, boardId, etc.)
 */
export const logTaskActivity = async (userId, action, taskId, details, additionalData = {}) => {
  if (!db) {
    console.warn('Activity logger not initialized, skipping log');
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
      const taskInfo = db.prepare(
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
    const userRole = db.prepare(`
      SELECT r.id as roleId 
      FROM user_roles ur 
      JOIN roles r ON ur.role_id = r.id 
      WHERE ur.user_id = ? 
      ORDER BY r.name DESC 
      LIMIT 1
    `).get(userId);

    // Get the first available role as fallback
    const fallbackRole = db.prepare(`SELECT id FROM roles ORDER BY id ASC LIMIT 1`).get();
    const roleId = userRole?.roleId || fallbackRole?.id || null;

    // Check if user exists
    const userExists = db.prepare(`SELECT id FROM users WHERE id = ?`).get(userId);

    if (!userExists || !roleId) {
      console.warn(`Skipping activity log: User ${userId} or role ${roleId} not found in database`);
      return;
    }

    // Create enhanced details with context for specific actions
    let enhancedDetails = details;
    if (action === 'create_task') {
      enhancedDetails = `created task "${taskTitle}" in board "${boardTitle}"`;
    } else if (action === 'delete_task') {
      enhancedDetails = `deleted task "${taskTitle}" from board "${boardTitle}"`;
    } else if (action === 'move_task') {
      enhancedDetails = `${details} in board "${boardTitle}"`;
    } else if (action === 'update_task') {
      enhancedDetails = `${details} in task "${taskTitle}" in board "${boardTitle}"`;
    }

    // Debug logging
    console.log('📝 Attempting to log activity with values:', {
      userId,
      roleId,
      action,
      taskId,
      columnId: columnId || additionalData.columnId || null,
      boardId: boardId || additionalData.boardId || null,
      tagId: additionalData.tagId || null,
      details: enhancedDetails
    });

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

    console.log(`📝 Activity logged: User ${userId} performed ${action} on task ${taskId} - ${enhancedDetails}`);
    
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
  if (!db) {
    console.warn('Activity logger not initialized, skipping log');
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
    // Get user's current role
    const userRole = db.prepare(`
      SELECT r.id as roleId 
      FROM user_roles ur 
      JOIN roles r ON ur.role_id = r.id 
      WHERE ur.user_id = ? 
      ORDER BY r.name DESC 
      LIMIT 1
    `).get(userId);

    // Get the first available role as fallback
    const fallbackRole = db.prepare(`SELECT id FROM roles ORDER BY id ASC LIMIT 1`).get();
    const roleId = userRole?.roleId || fallbackRole?.id || null;

    // Check if user exists
    const userExists = db.prepare(`SELECT id FROM users WHERE id = ?`).get(userId);

    if (!userExists || !roleId) {
      console.warn(`Skipping activity log: User ${userId} or role ${roleId} not found in database`);
      return;
    }

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
      details
    );

    console.log(`📝 Activity logged: User ${userId} performed ${action} - ${details}`);
    
  } catch (error) {
    console.error('❌ Error logging activity:', error);
    // Don't throw - activity logging should never break the main functionality
  }
};

/**
 * Helper function to generate detailed descriptions for common task changes
 */
export const generateTaskUpdateDetails = (field, oldValue, newValue, additionalContext = '') => {
  const fieldLabels = {
    title: 'title',
    description: 'description',
    dueDate: 'due date',
    startDate: 'start date',
    effort: 'effort',
    priorityId: 'priority',
    memberId: 'assignee',
    columnId: 'status'
  };

  const fieldLabel = fieldLabels[field] || field;
  const context = additionalContext ? ` ${additionalContext}` : '';

  if (oldValue === null || oldValue === undefined || oldValue === '') {
    return `set ${fieldLabel} to "${newValue}"${context}`;
  } else if (newValue === null || newValue === undefined || newValue === '') {
    return `cleared ${fieldLabel} (was "${oldValue}")${context}`;
  } else {
    return `changed ${fieldLabel} from "${oldValue}" to "${newValue}"${context}`;
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
  if (!db) {
    console.warn('Activity logger not initialized, skipping comment log');
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
      const taskInfo = db.prepare(
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
      const roleResult = db.prepare(
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
        const memberRoleResult = db.prepare(`SELECT id FROM roles WHERE name = 'Member'`).get();
        fallbackRole = memberRoleResult?.id || null;
      } catch (fallbackError) {
        console.warn('Failed to get fallback Member role:', fallbackError.message);
      }
    }

    const finalRoleId = userRole || fallbackRole;

    // Check if user exists
    const userExists = db.prepare(`SELECT id FROM users WHERE id = ?`).get(userId);
    if (!userExists) {
      console.warn(`User ${userId} not found for comment activity logging`);
    }

    // Create enhanced details with context
    const actionText = action === 'create_comment' ? 'added comment' : 
                      action === 'update_comment' ? 'updated comment' : 
                      action === 'delete_comment' ? 'deleted comment' : 'modified comment';
    
    const enhancedDetails = `${actionText}: "${details.replace(/^(added comment|updated comment|deleted comment): "/, '').replace(/"$/, '')}" to task "${taskTitle}" in board "${boardTitle}"`;

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

    db.prepare(
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
  } catch (error) {
    console.error('Failed to log comment activity:', error);
  }
};
