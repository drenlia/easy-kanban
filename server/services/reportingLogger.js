import crypto from 'crypto';
import { TASK_ACTIONS, TAG_ACTIONS, COMMENT_ACTIONS } from '../constants/activityActions.js';

// Global database instance (will be set by initReportingLogger)
let dbInstance = null;

/**
 * Initialize the reporting logger with database instance
 * @param {Database} db - SQLite database instance
 */
export const initReportingLogger = (db) => {
  dbInstance = db;
  console.log('✅ Reporting logger initialized');
};

// Default points configuration for gamification (fallback if settings not found)
const DEFAULT_POINTS_CONFIG = {
  // Task Actions
  TASK_CREATED: 5,
  TASK_COMPLETED: 10,
  TASK_MOVED: 2,
  TASK_UPDATED: 1,
  TASK_DELETED: 0,
  
  // Effort Multipliers
  EFFORT_MULTIPLIER: 2, // 2 points per effort point
  
  // Collaboration
  COMMENT_ADDED: 3,
  WATCHER_ADDED: 1,
  COLLABORATOR_ADDED: 2,
  
  // Metadata Changes
  TAG_ADDED: 1,
  PRIORITY_CHANGED: 1,
  ASSIGNEE_CHANGED: 2,
  REQUESTER_CHANGED: 1,
  
  // Bonus Multipliers
  FAST_COMPLETION_BONUS: 1.5, // Completed within 1 day
  HIGH_PRIORITY_BONUS: 1.3 // High priority tasks
};

/**
 * Get points configuration from database settings
 * Falls back to default values if settings not found
 */
export const getPointsConfig = (db) => {
  if (!db) return DEFAULT_POINTS_CONFIG;
  
  try {
    const settings = {};
    const rows = db.prepare('SELECT key, value FROM settings WHERE key LIKE "REPORTS_POINTS_%"').all();
    
    rows.forEach(row => {
      settings[row.key] = row.value;
    });
    
    return {
      TASK_CREATED: parseInt(settings.REPORTS_POINTS_TASK_CREATED) || DEFAULT_POINTS_CONFIG.TASK_CREATED,
      TASK_COMPLETED: parseInt(settings.REPORTS_POINTS_TASK_COMPLETED) || DEFAULT_POINTS_CONFIG.TASK_COMPLETED,
      TASK_MOVED: parseInt(settings.REPORTS_POINTS_TASK_MOVED) || DEFAULT_POINTS_CONFIG.TASK_MOVED,
      TASK_UPDATED: parseInt(settings.REPORTS_POINTS_TASK_UPDATED) || DEFAULT_POINTS_CONFIG.TASK_UPDATED,
      TASK_DELETED: 0,
      EFFORT_MULTIPLIER: parseInt(settings.REPORTS_POINTS_EFFORT_MULTIPLIER) || DEFAULT_POINTS_CONFIG.EFFORT_MULTIPLIER,
      COMMENT_ADDED: parseInt(settings.REPORTS_POINTS_COMMENT_ADDED) || DEFAULT_POINTS_CONFIG.COMMENT_ADDED,
      WATCHER_ADDED: parseInt(settings.REPORTS_POINTS_WATCHER_ADDED) || DEFAULT_POINTS_CONFIG.WATCHER_ADDED,
      COLLABORATOR_ADDED: parseInt(settings.REPORTS_POINTS_COLLABORATOR_ADDED) || DEFAULT_POINTS_CONFIG.COLLABORATOR_ADDED,
      TAG_ADDED: parseInt(settings.REPORTS_POINTS_TAG_ADDED) || DEFAULT_POINTS_CONFIG.TAG_ADDED,
      PRIORITY_CHANGED: DEFAULT_POINTS_CONFIG.PRIORITY_CHANGED,
      ASSIGNEE_CHANGED: DEFAULT_POINTS_CONFIG.ASSIGNEE_CHANGED,
      REQUESTER_CHANGED: DEFAULT_POINTS_CONFIG.REQUESTER_CHANGED,
      FAST_COMPLETION_BONUS: DEFAULT_POINTS_CONFIG.FAST_COMPLETION_BONUS,
      HIGH_PRIORITY_BONUS: DEFAULT_POINTS_CONFIG.HIGH_PRIORITY_BONUS
    };
  } catch (error) {
    console.error('Failed to load points configuration from settings:', error);
    return DEFAULT_POINTS_CONFIG;
  }
};

// Badge definitions
export const BADGES = [
  // Task Completion Badges
  { name: 'Starter', icon: '🌱', threshold: 10, type: 'tasks_completed', color: '#10B981' },
  { name: 'Achiever', icon: '⭐', threshold: 50, type: 'tasks_completed', color: '#3B82F6' },
  { name: 'Master', icon: '👑', threshold: 200, type: 'tasks_completed', color: '#F59E0B' },
  { name: 'Legend', icon: '🏆', threshold: 500, type: 'tasks_completed', color: '#EF4444' },
  
  // Effort Badges
  { name: 'Hard Worker', icon: '💪', threshold: 100, type: 'total_effort', color: '#8B5CF6' },
  { name: 'Powerhouse', icon: '⚡', threshold: 500, type: 'total_effort', color: '#EC4899' },
  
  // Collaboration Badges
  { name: 'Team Player', icon: '🤝', threshold: 50, type: 'collaborations', color: '#06B6D4' },
  { name: 'Mentor', icon: '🎓', threshold: 200, type: 'collaborations', color: '#84CC16' },
  
  // Comment Badges
  { name: 'Communicator', icon: '💬', threshold: 100, type: 'comments_added', color: '#14B8A6' }
];

/**
 * Log an activity event to the database
 */
export const logActivity = async (db, eventData) => {
  try {
    const {
      eventType,
      userId,
      userName,
      userEmail,
      taskId,
      taskTitle,
      taskTicket,
      boardId,
      boardName,
      columnId,
      columnName,
      fromColumnId,
      fromColumnName,
      toColumnId,
      toColumnName,
      effortPoints,
      priorityName,
      tags,
      metadata
    } = eventData;

    const eventId = crypto.randomUUID();
    const now = new Date();
    const periodYear = now.getFullYear();
    const periodMonth = now.getMonth() + 1;
    const periodWeek = getWeekNumber(now);

    db.prepare(`
      INSERT INTO activity_events (
        id, event_type, user_id, user_name, user_email,
        task_id, task_title, task_ticket,
        board_id, board_name,
        column_id, column_name,
        from_column_id, from_column_name,
        to_column_id, to_column_name,
        effort_points, priority_name,
        tags, metadata,
        created_at, period_year, period_month, period_week
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId, eventType, userId, userName, userEmail,
      taskId, taskTitle, taskTicket,
      boardId, boardName,
      columnId, columnName,
      fromColumnId, fromColumnName,
      toColumnId, toColumnName,
      effortPoints, priorityName,
      tags ? JSON.stringify(tags) : null,
      metadata ? JSON.stringify(metadata) : null,
      now.toISOString(), periodYear, periodMonth, periodWeek
    );

    // Calculate and award points
    await awardPoints(db, eventType, userId, userName, eventData);

    return eventId;
  } catch (error) {
    console.error('❌ Failed to log activity:', error);
    throw error;
  }
};

/**
 * Award points to a user based on activity
 */
const awardPoints = async (db, eventType, userId, userName, eventData) => {
  try {
    // Get current points configuration from database settings
    const POINTS = getPointsConfig(db);
    
    let points = 0;

    // Base points for event type
    switch (eventType) {
      case 'task_created':
        points = POINTS.TASK_CREATED;
        break;
      case 'task_completed':
        points = POINTS.TASK_COMPLETED;
        // Add effort multiplier
        if (eventData.effortPoints) {
          points += eventData.effortPoints * POINTS.EFFORT_MULTIPLIER;
        }
        // Fast completion bonus (within 1 day)
        if (eventData.metadata?.completedFast) {
          points = Math.round(points * POINTS.FAST_COMPLETION_BONUS);
        }
        // High priority bonus
        if (eventData.priorityName?.toLowerCase().includes('high') || 
            eventData.priorityName?.toLowerCase().includes('urgent')) {
          points = Math.round(points * POINTS.HIGH_PRIORITY_BONUS);
        }
        break;
      case 'task_moved':
        points = POINTS.TASK_MOVED;
        break;
      case 'task_updated':
        points = POINTS.TASK_UPDATED;
        break;
      case 'comment_added':
        points = POINTS.COMMENT_ADDED;
        break;
      case 'watcher_added':
        points = POINTS.WATCHER_ADDED;
        break;
      case 'collaborator_added':
        points = POINTS.COLLABORATOR_ADDED;
        break;
      case 'tag_added':
        points = POINTS.TAG_ADDED;
        break;
      case 'priority_changed':
        points = POINTS.PRIORITY_CHANGED;
        break;
      case 'assignee_changed':
        points = POINTS.ASSIGNEE_CHANGED;
        break;
      default:
        points = 0;
    }

    if (points > 0) {
      await updateUserPoints(db, userId, userName, eventType, points, eventData);
    }
  } catch (error) {
    console.error('❌ Failed to award points:', error);
  }
};

/**
 * Update user points and check for achievements
 */
const updateUserPoints = async (db, userId, userName, eventType, points, eventData = {}) => {
  try {
    // Get current points configuration
    const POINTS = getPointsConfig(db);
    
    const now = new Date();
    const periodYear = now.getFullYear();
    const periodMonth = now.getMonth() + 1;

    // Get or create user points record
    const existing = db.prepare(`
      SELECT * FROM user_points 
      WHERE user_id = ? AND period_year = ? AND period_month = ?
    `).get(userId, periodYear, periodMonth);

    if (existing) {
      // Update existing record
      const updates = {
        total_points: existing.total_points + points,
        tasks_completed: existing.tasks_completed + (eventType === 'task_completed' ? 1 : 0),
        total_effort_completed: existing.total_effort_completed + (eventType === 'task_completed' ? (eventData.effortPoints || 0) : 0),
        comments_added: existing.comments_added + (eventType === 'comment_added' ? 1 : 0),
        tasks_created: existing.tasks_created + (eventType === 'task_created' ? 1 : 0),
        collaborations: existing.collaborations + (eventType === 'collaborator_added' ? 1 : 0),
        watchers_added: (existing.watchers_added || 0) + (eventType === 'watcher_added' ? 1 : 0)
      };

      db.prepare(`
        UPDATE user_points 
        SET total_points = ?, tasks_completed = ?, total_effort_completed = ?,
            comments_added = ?, tasks_created = ?, collaborations = ?,
            watchers_added = ?, last_updated = ?
        WHERE id = ?
      `).run(
        updates.total_points, updates.tasks_completed, updates.total_effort_completed,
        updates.comments_added, updates.tasks_created, updates.collaborations,
        updates.watchers_added, now.toISOString(), existing.id
      );

      // Check for new achievements
      await checkAchievements(db, userId, userName, updates, periodYear, periodMonth);
    } else {
      // Create new record
      const newId = crypto.randomUUID();
      const newRecord = {
        id: newId,
        user_id: userId,
        user_name: userName,
        total_points: points,
        tasks_completed: eventType === 'task_completed' ? 1 : 0,
        total_effort_completed: eventType === 'task_completed' ? (eventData.effortPoints || 0) : 0,
        comments_added: eventType === 'comment_added' ? 1 : 0,
        tasks_created: eventType === 'task_created' ? 1 : 0,
        collaborations: eventType === 'collaborator_added' ? 1 : 0,
        watchers_added: eventType === 'watcher_added' ? 1 : 0,
        period_year: periodYear,
        period_month: periodMonth,
        last_updated: now.toISOString()
      };

      db.prepare(`
        INSERT INTO user_points (
          id, user_id, user_name, total_points, tasks_completed,
          total_effort_completed, comments_added, tasks_created,
          collaborations, watchers_added, period_year, period_month, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newRecord.id, newRecord.user_id, newRecord.user_name,
        newRecord.total_points, newRecord.tasks_completed,
        newRecord.total_effort_completed, newRecord.comments_added,
        newRecord.tasks_created, newRecord.collaborations,
        newRecord.watchers_added, newRecord.period_year, newRecord.period_month, newRecord.last_updated
      );

      await checkAchievements(db, userId, userName, newRecord, periodYear, periodMonth);
    }
  } catch (error) {
    console.error('❌ Failed to update user points:', error);
  }
};

/**
 * Check if user earned any new achievements
 */
const checkAchievements = async (db, userId, userName, stats, periodYear, periodMonth) => {
  try {
    // Get already earned achievements for this user
    const earned = db.prepare(`
      SELECT achievement_type FROM user_achievements WHERE user_id = ?
    `).all(userId);
    
    const earnedTypes = new Set(earned.map(a => a.achievement_type));

    // Check each badge threshold
    for (const badge of BADGES) {
      const achievementKey = `${badge.type}_${badge.threshold}`;
      
      // Skip if already earned
      if (earnedTypes.has(achievementKey)) continue;

      let currentValue = 0;
      switch (badge.type) {
        case 'tasks_completed':
          currentValue = stats.tasks_completed;
          break;
        case 'total_effort':
          currentValue = stats.total_effort_completed;
          break;
        case 'collaborations':
          currentValue = stats.collaborations;
          break;
        case 'comments_added':
          currentValue = stats.comments_added;
          break;
      }

      // Award badge if threshold reached
      if (currentValue >= badge.threshold) {
        const achievementId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO user_achievements (
            id, user_id, user_name, achievement_type, badge_name,
            badge_icon, badge_color, points_earned, period_year, period_month
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          achievementId, userId, userName, achievementKey, badge.name,
          badge.icon, badge.color, badge.threshold, periodYear, periodMonth
        );

        console.log(`🏆 Achievement unlocked: ${userName} earned "${badge.name}" badge!`);
      }
    }
  } catch (error) {
    console.error('❌ Failed to check achievements:', error);
  }
};

/**
 * Get ISO week number for a date
 */
const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

/**
 * Helper to get user info from database
 */
export const getUserInfo = (db, userId) => {
  try {
    const user = db.prepare(`
      SELECT u.id, u.email, u.first_name, u.last_name, m.name as member_name
      FROM users u
      LEFT JOIN members m ON u.id = m.user_id
      WHERE u.id = ?
    `).get(userId);

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.member_name || `${user.first_name} ${user.last_name}`.trim()
    };
  } catch (error) {
    console.error('Failed to get user info:', error);
    return null;
  }
};

/**
 * Helper to get board info from database
 */
export const getBoardInfo = (db, boardId) => {
  try {
    const board = db.prepare('SELECT id, title FROM boards WHERE id = ?').get(boardId);
    return board ? { id: board.id, name: board.title } : null;
  } catch (error) {
    console.error('Failed to get board info:', error);
    return null;
  }
};

/**
 * Helper to get column info from database
 */
export const getColumnInfo = (db, columnId) => {
  try {
    const column = db.prepare('SELECT id, title FROM columns WHERE id = ?').get(columnId);
    return column ? { id: column.id, name: column.title } : null;
  } catch (error) {
    console.error('Failed to get column info:', error);
    return null;
  }
};

/**
 * Generate human-readable description for task updates
 * @param {object} oldTask - Task before update
 * @param {object} newTask - Task after update
 * @returns {string} Description of changes
 */
export const generateTaskUpdateDetails = (oldTask, newTask) => {
  const changes = [];
  
  if (oldTask.title !== newTask.title) {
    changes.push(`title from "${oldTask.title}" to "${newTask.title}"`);
  }
  if (oldTask.description !== newTask.description) {
    changes.push('description');
  }
  if (oldTask.memberId !== newTask.memberId) {
    changes.push('assignee');
  }
  if (oldTask.requesterId !== newTask.requesterId) {
    changes.push('requester');
  }
  if (oldTask.priority !== newTask.priority) {
    changes.push(`priority from "${oldTask.priority}" to "${newTask.priority}"`);
  }
  if (oldTask.effort !== newTask.effort) {
    changes.push(`effort from ${oldTask.effort} to ${newTask.effort}`);
  }
  if (oldTask.startDate !== newTask.startDate) {
    changes.push('start date');
  }
  if (oldTask.dueDate !== newTask.dueDate) {
    changes.push('due date');
  }
  if (oldTask.columnId !== newTask.columnId) {
    changes.push('column');
  }
  
  return changes.length > 0 ? `updated ${changes.join(', ')}` : 'updated task';
};

export default {
  initReportingLogger,
  logActivity,
  getUserInfo,
  getBoardInfo,
  getColumnInfo,
  generateTaskUpdateDetails,
  getPointsConfig,
  BADGES
};

