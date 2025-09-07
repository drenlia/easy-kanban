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

    // Debug logging
    console.log('📝 Attempting to log activity with values:', {
      userId,
      roleId,
      action,
      taskId,
      columnId: additionalData.columnId || null,
      boardId: additionalData.boardId || null,
      tagId: additionalData.tagId || null,
      details
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
      additionalData.columnId || null,
      additionalData.boardId || null,
      additionalData.tagId || null,
      details
    );

    console.log(`📝 Activity logged: User ${userId} performed ${action} on task ${taskId} - ${details}`);
    
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
