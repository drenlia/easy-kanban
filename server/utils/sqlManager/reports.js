/**
 * Reports Query Manager
 * 
 * Centralized PostgreSQL-native queries for report operations.
 * All queries use PostgreSQL syntax ($1, $2, $3 placeholders, etc.)
 * 
 * @module sqlManager/reports
 */

import { wrapQuery } from '../queryLogger.js';

/**
 * Get report-related settings
 * 
 * @param {Database} db - Database connection
 * @returns {Promise<Array>} Array of setting objects with key and value
 */
export async function getReportSettings(db) {
  const query = `
    SELECT key, value 
    FROM settings 
    WHERE key LIKE 'REPORTS_%'
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all();
}

/**
 * Get setting value by key
 * 
 * @param {Database} db - Database connection
 * @param {string} key - Setting key
 * @returns {Promise<Object|null>} Setting object or null
 */
export async function getSettingByKey(db, key) {
  const query = `
    SELECT value 
    FROM settings 
    WHERE key = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(key);
}

/**
 * Get member info by user_id
 * 
 * @param {Database} db - Database connection
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Member object with user_id and user_name or null
 */
export async function getMemberInfoByUserId(db, userId) {
  const query = `
    SELECT 
      m.user_id as "userId",
      m.name as "userName"
    FROM members m
    WHERE m.user_id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(userId);
}

/**
 * Get user's total points (sum across all periods)
 * 
 * @param {Database} db - Database connection
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User points summary or null
 */
export async function getUserTotalPoints(db, userId) {
  const query = `
    SELECT 
      SUM(total_points) as "totalPoints",
      SUM(tasks_created) as "tasksCreated",
      SUM(tasks_completed) as "tasksCompleted",
      SUM(total_effort_completed) as "totalEffortCompleted",
      SUM(comments_added) as "commentsAdded",
      SUM(collaborations) as "collaborations"
    FROM user_points
    WHERE user_id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(userId);
}

/**
 * Get user's monthly points breakdown (last 12 months)
 * 
 * @param {Database} db - Database connection
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of monthly point objects
 */
export async function getUserMonthlyPoints(db, userId) {
  const query = `
    SELECT 
      period_year,
      period_month,
      total_points as "totalPoints",
      tasks_created as "tasksCreated",
      tasks_completed as "tasksCompleted",
      total_effort_completed as "totalEffortCompleted",
      comments_added as "commentsAdded",
      collaborations,
      last_updated as "lastUpdated"
    FROM user_points
    WHERE user_id = $1
    ORDER BY period_year DESC, period_month DESC
    LIMIT 12
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(userId);
}

/**
 * Get user achievements with badge info
 * 
 * @param {Database} db - Database connection
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of achievement objects
 */
export async function getUserAchievements(db, userId) {
  const query = `
    SELECT 
      ua.id,
      ua.achievement_type as "achievementType",
      ua.badge_id as "badgeId",
      ua.badge_name as "badgeName",
      ua.badge_icon as "badgeIcon",
      ua.badge_color as "badgeColor",
      ua.points_earned as "pointsEarned",
      ua.earned_at as "earnedAt",
      b.description as "badgeDescription"
    FROM user_achievements ua
    LEFT JOIN badges b ON ua.badge_id = b.id
    WHERE ua.user_id = $1
    ORDER BY ua.earned_at DESC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(userId);
}

/**
 * Get count of active members
 * 
 * @param {Database} db - Database connection
 * @returns {Promise<Object>} Object with count
 */
export async function getActiveMembersCount(db) {
  const query = `
    SELECT COUNT(DISTINCT m.user_id) as count
    FROM members m
    JOIN users u ON m.user_id = u.id
    WHERE u.is_active = true
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get();
}

/**
 * Get burndown snapshots for a date range
 * 
 * @param {Database} db - Database connection
 * @param {string} startDate - Start date (ISO string)
 * @param {string} endDate - End date (ISO string)
 * @param {string|null} boardId - Optional board ID filter
 * @returns {Promise<Array>} Array of snapshot objects
 */
export async function getBurndownSnapshots(db, startDate, endDate, boardId = null) {
  let query = `
    SELECT 
      ts.snapshot_date as "snapshotDate",
      COUNT(DISTINCT ts.task_id) as "totalTasks",
      COUNT(DISTINCT CASE WHEN ts.is_completed = true OR ts.is_completed = 1 THEN ts.task_id END) as "completedTasks",
      COALESCE(SUM(ts.effort_points), 0) as "totalEffort",
      COALESCE(SUM(CASE WHEN ts.is_completed = true OR ts.is_completed = 1 THEN ts.effort_points ELSE 0 END), 0) as "completedEffort"
    FROM task_snapshots ts
    LEFT JOIN columns c ON ts.column_id = c.id
    WHERE ts.snapshot_date BETWEEN $1::date AND $2::date
    AND (ts.is_deleted = false OR ts.is_deleted = 0 OR ts.is_deleted IS NULL)
    AND (c.id IS NULL OR c.is_archived = false)
  `;
  
  const params = [startDate, endDate];
  
  if (boardId) {
    query += ' AND ts.board_id = $3';
    params.push(boardId);
  }
  
  query += ' GROUP BY ts.snapshot_date ORDER BY ts.snapshot_date ASC';
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(...params);
}

/**
 * Get burndown baseline (all tasks that existed at the start of the period)
 * Uses actual tasks table instead of snapshots to get accurate baseline
 * 
 * @param {Database} db - Database connection
 * @param {string} startDate - Start date (ISO string)
 * @param {string} endDate - End date (ISO string)
 * @param {string|null} boardId - Optional board ID filter
 * @returns {Promise<Object|null>} Baseline object or null
 */
export async function getBurndownBaseline(db, startDate, endDate, boardId = null) {
  // For burndown baseline, we want to count ALL tasks that existed during the period
  // This should match the task list report totals
  // Use the same pattern as getTaskList which works correctly
  let query = `
    SELECT 
      COUNT(DISTINCT t.id) as "plannedTasks",
      COALESCE(SUM(t.effort), 0) as "plannedEffort"
    FROM tasks t
    LEFT JOIN columns c ON t.columnid = c.id
    WHERE 1=1
    AND (c.is_archived IS NULL OR c.is_archived = false)
  `;
  
  const params = [];
  let paramIndex = 1;
  
  // For baseline, count all tasks in the date range (not just before start date)
  // This matches what the task list report does
  if (startDate) {
    query += ` AND DATE(t.created_at) >= $${paramIndex++}`;
    params.push(startDate);
  }
  
  if (endDate) {
    query += ` AND DATE(t.created_at) <= $${paramIndex++}`;
    params.push(endDate);
  }
  
  // Add board filter if specified
  if (boardId) {
    query += ` AND t.boardid = $${paramIndex++}`;
    params.push(boardId);
  }
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const result = await stmt.get(...params);
  
  // Ensure we return an object with numeric values, even if result is null
  const baseline = result || { plannedTasks: 0, plannedEffort: 0 };
  
  // Convert to numbers to ensure they're not strings
  return {
    plannedTasks: Number(baseline.plannedTasks) || 0,
    plannedEffort: Number(baseline.plannedEffort) || 0
  };
}

/**
 * Get unique boards in date range
 * 
 * @param {Database} db - Database connection
 * @param {string} startDate - Start date (ISO string)
 * @param {string} endDate - End date (ISO string)
 * @returns {Promise<Array>} Array of board objects
 */
export async function getBoardsInDateRange(db, startDate, endDate) {
  const query = `
    SELECT DISTINCT 
      ts.board_id as "boardId",
      ts.board_name as "boardName"
    FROM task_snapshots ts
    LEFT JOIN columns c ON ts.column_id = c.id
    WHERE ts.snapshot_date BETWEEN $1::date AND $2::date
    AND ts.board_id IS NOT NULL
    AND (ts.is_deleted = false OR ts.is_deleted = 0 OR ts.is_deleted IS NULL)
    AND (c.id IS NULL OR c.is_archived = false)
    ORDER BY ts.board_name
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(startDate, endDate);
}

/**
 * Get board-specific burndown snapshots
 * 
 * @param {Database} db - Database connection
 * @param {string} startDate - Start date (ISO string)
 * @param {string} endDate - End date (ISO string)
 * @param {string} boardId - Board ID
 * @returns {Promise<Array>} Array of snapshot objects
 */
export async function getBoardBurndownSnapshots(db, startDate, endDate, boardId) {
  const query = `
    SELECT 
      ts.snapshot_date as "snapshotDate",
      COUNT(DISTINCT ts.task_id) as "totalTasks",
      COUNT(DISTINCT CASE WHEN ts.is_completed = true OR ts.is_completed = 1 THEN ts.task_id END) as "completedTasks",
      COALESCE(SUM(ts.effort_points), 0) as "totalEffort",
      COALESCE(SUM(CASE WHEN ts.is_completed = true OR ts.is_completed = 1 THEN ts.effort_points ELSE 0 END), 0) as "completedEffort"
    FROM task_snapshots ts
    LEFT JOIN columns c ON ts.column_id = c.id
    WHERE ts.snapshot_date BETWEEN $1::date AND $2::date
    AND ts.board_id = $3
    AND (ts.is_deleted = false OR ts.is_deleted = 0 OR ts.is_deleted IS NULL)
    AND (c.id IS NULL OR c.is_archived = false)
    GROUP BY ts.snapshot_date
    ORDER BY ts.snapshot_date ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(startDate, endDate, boardId);
}

/**
 * Get activity events for team performance
 * 
 * @param {Database} db - Database connection
 * @param {string} startDate - Start date (ISO string)
 * @param {string} endDate - End date (ISO string)
 * @param {string|null} boardId - Optional board ID filter
 * @returns {Promise<Array>} Array of activity event objects
 */
export async function getActivityEvents(db, startDate, endDate, boardId = null) {
  let query = `
    SELECT 
      user_id as "userId",
      user_name as "userName",
      event_type as "eventType",
      COUNT(*) as "eventCount",
      SUM(CASE WHEN event_type = 'task_completed' THEN effort_points ELSE 0 END) as "totalEffortCompleted"
    FROM activity_events
    WHERE DATE(created_at) BETWEEN $1 AND $2
  `;
  
  const params = [startDate, endDate];
  
  if (boardId) {
    query += ' AND board_id = $3';
    params.push(boardId);
  }
  
  query += `
    GROUP BY user_id, user_name, event_type
    ORDER BY user_id, event_type
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(...params);
}

/**
 * Get user points for a specific period
 * 
 * @param {Database} db - Database connection
 * @param {string} userId - User ID
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object|null>} User points object or null
 */
export async function getUserPointsForPeriod(db, userId, year, month) {
  const query = `
    SELECT total_points as "totalPoints"
    FROM user_points
    WHERE user_id = $1 AND period_year = $2 AND period_month = $3
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(userId, year, month);
}

/**
 * Get priority by name
 * 
 * @param {Database} db - Database connection
 * @param {string} priorityName - Priority name
 * @returns {Promise<Object|null>} Priority object or null
 */
export async function getPriorityByName(db, priorityName) {
  const query = `
    SELECT id 
    FROM priorities 
    WHERE priority = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(priorityName);
}

/**
 * Get task list with filters
 * 
 * @param {Database} db - Database connection
 * @param {Object} filters - Filter object with optional: startDate, endDate, boardId, status, assigneeId, priorityId
 * @returns {Promise<Array>} Array of task objects
 */
export async function getTaskList(db, filters = {}) {
  let query = `
    SELECT 
      t.id,
      t.ticket,
      t.title,
      t.description,
      t.effort,
      t.priority,
      t.priority_id as "priorityId",
      p.priority as "priorityName",
      t.startDate as "startDate",
      t.dueDate as "dueDate",
      t.created_at as "createdAt",
      t.updated_at as "updatedAt",
      b.title as "boardName",
      c.title as "columnName",
      c.is_finished as "isFinished",
      m.name as "assigneeName",
      r.name as "requesterName",
      (SELECT COUNT(*) FROM comments WHERE taskId = t.id) as "commentCount",
      (SELECT COUNT(*) FROM watchers WHERE taskId = t.id) as "watcherCount",
      (SELECT COUNT(*) FROM collaborators WHERE taskId = t.id) as "collaboratorCount"
    FROM tasks t
    LEFT JOIN boards b ON t.boardId = b.id
    LEFT JOIN columns c ON t.columnId = c.id
    LEFT JOIN members m ON t.memberId = m.id
    LEFT JOIN members r ON t.requesterId = r.id
    LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
    WHERE 1=1
    AND (c.is_archived IS NULL OR c.is_archived = false)
  `;
  
  const params = [];
  let paramIndex = 1;
  
  if (filters.startDate) {
    query += ` AND DATE(t.created_at) >= $${paramIndex++}`;
    params.push(filters.startDate);
  }
  
  if (filters.endDate) {
    query += ` AND DATE(t.created_at) <= $${paramIndex++}`;
    params.push(filters.endDate);
  }
  
  if (filters.boardId) {
    query += ` AND t.boardId = $${paramIndex++}`;
    params.push(filters.boardId);
  }
  
  if (filters.status === 'completed') {
    query += ' AND c.is_finished = true';
  } else if (filters.status === 'active') {
    query += ' AND c.is_finished = false';
  }
  
  if (filters.assigneeId) {
    query += ` AND t.memberId = $${paramIndex++}`;
    params.push(filters.assigneeId);
  }
  
  if (filters.priorityId) {
    query += ` AND t.priority_id = $${paramIndex++}`;
    params.push(filters.priorityId);
  }
  
  query += ` ORDER BY t.created_at DESC LIMIT 1000`;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(...params);
}

/**
 * Get tags for a task
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @returns {Promise<Array>} Array of tag names
 */
export async function getTagsForTask(db, taskId) {
  const query = `
    SELECT t.tag
    FROM task_tags tt
    JOIN tags t ON tt.tagId = t.id
    WHERE tt.taskId = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const results = await stmt.all(taskId);
  return results.map(r => r.tag);
}

