/**
 * Sprint Query Manager
 * 
 * Centralized PostgreSQL-native queries for sprint (planning_periods) operations.
 * All queries use PostgreSQL syntax ($1, $2, $3 placeholders, etc.)
 * 
 * @module sqlManager/sprints
 */

import { wrapQuery } from '../queryLogger.js';

/**
 * Get all sprints ordered by start_date DESC
 * 
 * @param {Database} db - Database connection
 * @returns {Promise<Array>} Array of sprint objects
 */
export async function getAllSprints(db) {
  const query = `
    SELECT 
      id, 
      name, 
      start_date as "startDate",
      end_date as "endDate", 
      is_active as "isActive", 
      description, 
      created_at as "createdAt", 
      updated_at as "updatedAt"
    FROM planning_periods
    ORDER BY start_date DESC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all();
}

/**
 * Get active sprint
 * 
 * @param {Database} db - Database connection
 * @returns {Promise<Object|null>} Active sprint or null
 */
export async function getActiveSprint(db) {
  const query = `
    SELECT 
      id, 
      name, 
      start_date as "startDate",
      end_date as "endDate", 
      is_active as "isActive", 
      description, 
      created_at as "createdAt"
    FROM planning_periods
    WHERE is_active = 1
    ORDER BY start_date DESC
    LIMIT 1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get();
}

/**
 * Get sprint by ID
 * 
 * @param {Database} db - Database connection
 * @param {string} sprintId - Sprint ID
 * @returns {Promise<Object|null>} Sprint object or null
 */
export async function getSprintById(db, sprintId) {
  const query = `
    SELECT * FROM planning_periods 
    WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(sprintId);
}

/**
 * Get sprint usage count (tasks using this sprint)
 * 
 * @param {Database} db - Database connection
 * @param {string} sprintId - Sprint ID
 * @returns {Promise<number>} Usage count
 */
export async function getSprintUsageCount(db, sprintId) {
  const query = `
    SELECT COUNT(*) as count 
    FROM tasks 
    WHERE sprint_id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const result = await stmt.get(sprintId);
  return result?.count ?? 0;
}

/**
 * Get tasks using a sprint (for reassignment)
 * 
 * @param {Database} db - Database connection
 * @param {string} sprintId - Sprint ID
 * @returns {Promise<Array>} Array of task objects with id, ticket, title, boardid
 */
export async function getTasksUsingSprint(db, sprintId) {
  const query = `
    SELECT id, ticket, title, boardid as "boardId"
    FROM tasks 
    WHERE sprint_id = $1
    ORDER BY ticket
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(sprintId);
}

/**
 * Deactivate all sprints (set is_active = 0 for all)
 * 
 * @param {Database} db - Database connection
 * @returns {Promise<void>}
 */
export async function deactivateAllSprints(db) {
  const query = `
    UPDATE planning_periods 
    SET is_active = 0 
    WHERE is_active = 1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  await stmt.run();
}

/**
 * Deactivate all sprints except one
 * 
 * @param {Database} db - Database connection
 * @param {string} sprintId - Sprint ID to keep active
 * @returns {Promise<void>}
 */
export async function deactivateAllSprintsExcept(db, sprintId) {
  const query = `
    UPDATE planning_periods 
    SET is_active = 0 
    WHERE is_active = 1 AND id != $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  await stmt.run(sprintId);
}

/**
 * Create a new sprint
 * 
 * @param {Database} db - Database connection
 * @param {string} sprintId - Sprint ID (UUID)
 * @param {string} name - Sprint name
 * @param {string} startDate - Start date (ISO string)
 * @param {string} endDate - End date (ISO string)
 * @param {boolean} isActive - Whether sprint is active
 * @param {string|null} description - Sprint description
 * @returns {Promise<Object>} Created sprint object
 */
export async function createSprint(db, sprintId, name, startDate, endDate, isActive, description) {
  const now = new Date().toISOString();
  const query = `
    INSERT INTO planning_periods (
      id, name, start_date, end_date, is_active, description, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  await stmt.run(
    sprintId,
    name.trim(),
    startDate,
    endDate,
    isActive ? 1 : 0,
    description?.trim() || null,
    now,
    now
  );
  
  // Return created sprint
  return await getSprintById(db, sprintId);
}

/**
 * Update sprint
 * 
 * @param {Database} db - Database connection
 * @param {string} sprintId - Sprint ID
 * @param {string} name - Sprint name
 * @param {string} startDate - Start date (ISO string)
 * @param {string} endDate - End date (ISO string)
 * @param {boolean} isActive - Whether sprint is active
 * @param {string|null} description - Sprint description
 * @returns {Promise<Object>} Updated sprint object
 */
export async function updateSprint(db, sprintId, name, startDate, endDate, isActive, description) {
  const query = `
    UPDATE planning_periods
    SET name = $1, start_date = $2, end_date = $3, is_active = $4, description = $5, updated_at = $6
    WHERE id = $7
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  await stmt.run(
    name.trim(),
    startDate,
    endDate,
    isActive ? 1 : 0,
    description?.trim() || null,
    new Date().toISOString(),
    sprintId
  );
  
  // Return updated sprint
  return await getSprintById(db, sprintId);
}

/**
 * Delete sprint
 * 
 * @param {Database} db - Database connection
 * @param {string} sprintId - Sprint ID
 * @returns {Promise<Object>} Result object with changes count
 */
export async function deleteSprint(db, sprintId) {
  const query = `
    DELETE FROM planning_periods 
    WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(sprintId);
}

/**
 * Remove sprint assignment from tasks (set sprint_id to NULL)
 * 
 * @param {Database} db - Database connection
 * @param {string} sprintId - Sprint ID
 * @returns {Promise<number>} Number of tasks updated
 */
export async function unassignTasksFromSprint(db, sprintId) {
  const query = `
    UPDATE tasks 
    SET sprint_id = NULL
    WHERE sprint_id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  const result = await stmt.run(sprintId);
  return result.changes || 0;
}

