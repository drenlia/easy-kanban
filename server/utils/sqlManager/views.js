/**
 * Views Query Manager
 * 
 * Centralized PostgreSQL-native queries for saved filter view operations.
 * All queries use PostgreSQL syntax ($1, $2, $3 placeholders, etc.)
 * 
 * @module sqlManager/views
 */

import { wrapQuery } from '../queryLogger.js';

/**
 * Get all views for a user
 * 
 * @param {Database} db - Database connection
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of view objects
 */
export async function getAllViewsForUser(db, userId) {
  const query = `
    SELECT * FROM views 
    WHERE "userId" = $1 
    ORDER BY "filterName" ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(userId);
}

/**
 * Get shared views from other users
 * 
 * @param {Database} db - Database connection
 * @param {string} userId - User ID (to exclude)
 * @returns {Promise<Array>} Array of view objects with creatorName
 */
export async function getSharedViews(db, userId) {
  const query = `
    SELECT v.*, 
           CASE 
             WHEN u.first_name IS NOT NULL AND u.last_name IS NOT NULL 
             THEN u.first_name || ' ' || u.last_name
             WHEN u.first_name IS NOT NULL 
             THEN u.first_name
             ELSE u.email
           END as "creatorName"
    FROM views v
    LEFT JOIN users u ON v."userId" = u.id
    WHERE v.shared = true AND v."userId" != $1
    ORDER BY v."filterName" ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(userId);
}

/**
 * Get view by ID and user ID
 * 
 * @param {Database} db - Database connection
 * @param {number} viewId - View ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} View object or null
 */
export async function getViewById(db, viewId, userId) {
  const query = `
    SELECT * FROM views 
    WHERE id = $1 AND "userId" = $2
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(viewId, userId);
}

/**
 * Check if a view name already exists for a user
 * 
 * @param {Database} db - Database connection
 * @param {string} filterName - Filter name
 * @param {string} userId - User ID
 * @param {number|null} excludeViewId - View ID to exclude (for updates)
 * @returns {Promise<Object|null>} View object with id or null
 */
export async function checkViewNameExists(db, filterName, userId, excludeViewId = null) {
  if (excludeViewId) {
    const query = `
      SELECT id FROM views 
      WHERE "filterName" = $1 AND "userId" = $2 AND id != $3
    `;
    const stmt = wrapQuery(db.prepare(query), 'SELECT');
    return await stmt.get(filterName, userId, excludeViewId);
  } else {
    const query = `
      SELECT id FROM views 
      WHERE "filterName" = $1 AND "userId" = $2
    `;
    const stmt = wrapQuery(db.prepare(query), 'SELECT');
    return await stmt.get(filterName, userId);
  }
}

/**
 * Create a new view
 * 
 * @param {Database} db - Database connection
 * @param {string} filterName - Filter name
 * @param {string} userId - User ID
 * @param {boolean} shared - Whether the view is shared
 * @param {Object} filters - Filter data object
 * @returns {Promise<Object>} Result object with lastInsertRowid (SQLite) or returning (PostgreSQL)
 */
export async function createView(db, filterName, userId, shared, filters) {
  const query = `
    INSERT INTO views (
      "filterName", "userId", shared, "textFilter", "dateFromFilter", "dateToFilter",
      "dueDateFromFilter", "dueDateToFilter", "memberFilters", "priorityFilters",
      "tagFilters", "projectFilter", "taskFilter"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  return await stmt.run(
    filterName,
    userId,
    shared ? 1 : 0, // Convert boolean to integer for compatibility
    filters.textFilter || null,
    filters.dateFromFilter || null,
    filters.dateToFilter || null,
    filters.dueDateFromFilter || null,
    filters.dueDateToFilter || null,
    filters.memberFilters || null,
    filters.priorityFilters || null,
    filters.tagFilters || null,
    filters.projectFilter || null,
    filters.taskFilter || null
  );
}

/**
 * Update a view
 * 
 * @param {Database} db - Database connection
 * @param {number} viewId - View ID
 * @param {string} userId - User ID
 * @param {Object} updates - Object with fields to update
 * @returns {Promise<Object>} Result object
 */
export async function updateView(db, viewId, userId, updates) {
  // Build dynamic UPDATE query
  const setClause = [];
  const params = [];
  let paramIndex = 1;
  
  if (updates.filterName !== undefined) {
    setClause.push(`"filterName" = $${paramIndex++}`);
    params.push(updates.filterName);
  }
  
  if (updates.shared !== undefined) {
    setClause.push(`shared = $${paramIndex++}`);
    params.push(updates.shared ? 1 : 0); // Convert boolean to integer
  }
  
  // Add filter fields (using quoted camelCase for PostgreSQL)
  const filterFields = [
    'textFilter', 'dateFromFilter', 'dateToFilter', 'dueDateFromFilter',
    'dueDateToFilter', 'memberFilters', 'priorityFilters', 'tagFilters',
    'projectFilter', 'taskFilter'
  ];
  
  filterFields.forEach(field => {
    if (updates[field] !== undefined) {
      setClause.push(`"${field}" = $${paramIndex++}`);
      params.push(updates[field]);
    }
  });
  
  // Always update updated_at
  setClause.push('updated_at = CURRENT_TIMESTAMP');
  
  // Add WHERE clause params
  params.push(viewId, userId);
  
  const query = `
    UPDATE views 
    SET ${setClause.join(', ')}
    WHERE id = $${paramIndex} AND "userId" = $${paramIndex + 1}
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  return await stmt.run(...params);
}

/**
 * Delete a view
 * 
 * @param {Database} db - Database connection
 * @param {number} viewId - View ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Result object with changes count
 */
export async function deleteView(db, viewId, userId) {
  const query = `
    DELETE FROM views 
    WHERE id = $1 AND "userId" = $2
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(viewId, userId);
}
