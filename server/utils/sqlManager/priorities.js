/**
 * Priority Query Manager
 * 
 * Centralized PostgreSQL-native queries for priority operations.
 * All queries use PostgreSQL syntax ($1, $2, $3 placeholders, etc.)
 * 
 * @module sqlManager/priorities
 */

import { wrapQuery } from '../queryLogger.js';

/**
 * Get all priorities ordered by position
 * 
 * @param {Database} db - Database connection
 * @returns {Promise<Array>} Array of priority objects
 */
export async function getAllPriorities(db) {
  const query = `
    SELECT * FROM priorities 
    ORDER BY position ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all();
}

/**
 * Get priority by ID
 * 
 * @param {Database} db - Database connection
 * @param {number} priorityId - Priority ID
 * @returns {Promise<Object|null>} Priority object or null
 */
export async function getPriorityById(db, priorityId) {
  const query = `
    SELECT * FROM priorities 
    WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(priorityId);
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
    SELECT * FROM priorities 
    WHERE priority = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(priorityName);
}

/**
 * Get default priority (where initial = 1)
 * 
 * @param {Database} db - Database connection
 * @returns {Promise<Object|null>} Default priority or null
 */
export async function getDefaultPriority(db) {
  const query = `
    SELECT * FROM priorities 
    WHERE initial = 1
    LIMIT 1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get();
}

/**
 * Get maximum position value
 * 
 * @param {Database} db - Database connection
 * @returns {Promise<number>} Maximum position value
 */
export async function getMaxPriorityPosition(db) {
  const query = `
    SELECT MAX(position) as maxPos 
    FROM priorities
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const result = await stmt.get();
  return result?.maxPos ?? -1;
}

/**
 * Create a new priority
 * 
 * @param {Database} db - Database connection
 * @param {string} priority - Priority name
 * @param {string} color - Priority color
 * @param {number} position - Position value
 * @returns {Promise<Object>} Created priority object
 */
export async function createPriority(db, priority, color, position) {
  const query = `
    INSERT INTO priorities (priority, color, position, initial) 
    VALUES ($1, $2, $3, 0)
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  const result = await stmt.run(priority, color, position);
  
  // For SQLite, use lastInsertRowid
  if (result.lastInsertRowid) {
    return await getPriorityById(db, result.lastInsertRowid);
  }
  
  // For PostgreSQL, query by priority name (unique constraint)
  return await getPriorityByName(db, priority);
}

/**
 * Update priority
 * 
 * @param {Database} db - Database connection
 * @param {number} priorityId - Priority ID
 * @param {string} priority - Priority name
 * @param {string} color - Priority color
 * @returns {Promise<Object>} Updated priority object
 */
export async function updatePriority(db, priorityId, priority, color) {
  const query = `
    UPDATE priorities 
    SET priority = $1, color = $2 
    WHERE id = $3
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  await stmt.run(priority, color, priorityId);
  
  // Query by ID to get updated priority
  return await getPriorityById(db, priorityId);
}

/**
 * Delete priority
 * 
 * @param {Database} db - Database connection
 * @param {number} priorityId - Priority ID
 * @returns {Promise<Object>} Result object with changes count
 */
export async function deletePriority(db, priorityId) {
  const query = `
    DELETE FROM priorities 
    WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(priorityId);
}

/**
 * Update priority positions (for reordering)
 * 
 * @param {Database} db - Database connection
 * @param {Array<{id: number, position: number}>} updates - Array of priority updates
 * @returns {Promise<void>}
 */
export async function updatePriorityPositions(db, updates) {
  // This will be called within a transaction
  for (const update of updates) {
    const query = `
      UPDATE priorities 
      SET position = $1 
      WHERE id = $2
    `;
    
    const stmt = wrapQuery(db.prepare(query), 'UPDATE');
    await stmt.run(update.position, update.id);
  }
}

/**
 * Set priority as default (removes default from all others)
 * Note: This should be called within a transaction
 * 
 * @param {Database} db - Database connection
 * @param {number} priorityId - Priority ID to set as default
 * @returns {Promise<void>}
 */
export async function setDefaultPriority(db, priorityId) {
  // First, remove default flag from all priorities
  const clearQuery = `
    UPDATE priorities 
    SET initial = 0
  `;
  const clearStmt = wrapQuery(db.prepare(clearQuery), 'UPDATE');
  await clearStmt.run();
  
  // Then set the specified priority as default
  const setQuery = `
    UPDATE priorities 
    SET initial = 1 
    WHERE id = $1
  `;
  const setStmt = wrapQuery(db.prepare(setQuery), 'UPDATE');
  await setStmt.run(priorityId);
}

/**
 * Get priority usage count (tasks using this priority)
 * 
 * @param {Database} db - Database connection
 * @param {number} priorityId - Priority ID
 * @returns {Promise<number>} Usage count
 */
export async function getPriorityUsageCount(db, priorityId) {
  const query = `
    SELECT COUNT(*) as count 
    FROM tasks 
    WHERE priority_id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const result = await stmt.get(priorityId);
  return result?.count ?? 0;
}

/**
 * Get batch priority usage counts
 * 
 * @param {Database} db - Database connection
 * @param {Array<number>} priorityIds - Array of priority IDs
 * @returns {Promise<Object>} Map of priorityId to usage count
 */
export async function getBatchPriorityUsageCounts(db, priorityIds) {
  if (!priorityIds || priorityIds.length === 0) {
    return {};
  }
  
  const placeholders = priorityIds.map((_, i) => `$${i + 1}`).join(', ');
  const query = `
    SELECT priority_id, COUNT(*) as count 
    FROM tasks 
    WHERE priority_id IN (${placeholders})
    GROUP BY priority_id
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const results = await stmt.all(...priorityIds);
  
  // Create map of usage counts by priorityId
  const usageMap = {};
  results.forEach(usage => {
    usageMap[usage.priority_id] = { count: parseInt(usage.count) };
  });
  
  // Include zero counts for priorities with no usage
  priorityIds.forEach(priorityId => {
    if (!usageMap[priorityId]) {
      usageMap[priorityId] = { count: 0 };
    }
  });
  
  return usageMap;
}

/**
 * Get tasks using a priority (for reassignment)
 * 
 * @param {Database} db - Database connection
 * @param {number} priorityId - Priority ID
 * @returns {Promise<Array>} Array of task objects with id, ticket, title, boardid
 */
export async function getTasksUsingPriority(db, priorityId) {
  const query = `
    SELECT id, ticket, title, boardid as "boardId"
    FROM tasks 
    WHERE priority_id = $1
    ORDER BY ticket
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(priorityId);
}

/**
 * Reassign tasks from one priority to another
 * 
 * @param {Database} db - Database connection
 * @param {number} fromPriorityId - Source priority ID
 * @param {number} toPriorityId - Target priority ID
 * @param {string} toPriorityName - Target priority name
 * @returns {Promise<number>} Number of tasks updated
 */
export async function reassignTasksPriority(db, fromPriorityId, toPriorityId, toPriorityName) {
  const query = `
    UPDATE tasks 
    SET priority_id = $1, priority = $2 
    WHERE priority_id = $3
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  const result = await stmt.run(toPriorityId, toPriorityName, fromPriorityId);
  return result.changes || 0;
}

