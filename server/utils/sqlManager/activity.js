/**
 * Activity Query Manager
 * 
 * Centralized PostgreSQL-native queries for activity log operations.
 * All queries use PostgreSQL syntax ($1, $2, $3 placeholders, etc.)
 * 
 * @module sqlManager/activity
 */

import { wrapQuery } from '../queryLogger.js';

/**
 * Get activity feed
 * 
 * @param {Database} db - Database connection
 * @param {number} limit - Maximum number of activities to return
 * @returns {Promise<Array>} Array of activity objects
 */
export async function getActivityFeed(db, limit = 20) {
  const query = `
    SELECT 
      a.id, 
      a.userid as "userId", 
      a.roleid as "roleId", 
      a.action, 
      a.taskid as "taskId", 
      a.columnid as "columnId", 
      a.boardid as "boardId", 
      a.tagid as "tagId", 
      a.details,
      a.created_at as "createdAt",
      a.updated_at as "updatedAt",
      m.name as "memberName",
      r.name as "roleName",
      b.title as "boardTitle",
      c.title as "columnTitle"
    FROM activity a
    LEFT JOIN users u ON a.userid = u.id
    LEFT JOIN members m ON u.id = m.user_id
    LEFT JOIN roles r ON a.roleid = r.id
    LEFT JOIN boards b ON a.boardid = b.id
    LEFT JOIN columns c ON a.columnid = c.id
    ORDER BY a.created_at DESC
    LIMIT $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(limit);
}

/**
 * Get user status and permissions
 * 
 * @param {Database} db - Database connection
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User status object or null
 */
export async function getUserStatus(db, userId) {
  const query = `
    SELECT 
      u.is_active as "isActive", 
      u.force_logout as "forceLogout", 
      r.name as role 
    FROM users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.id
    WHERE u.id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(userId);
}

