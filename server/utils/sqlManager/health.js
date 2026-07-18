/**
 * Health Check Query Manager
 * 
 * Centralized PostgreSQL-native queries for health check operations.
 * All queries use PostgreSQL syntax ($1, $2, $3 placeholders, etc.)
 * 
 * @module sqlManager/health
 */

import { wrapQuery } from '../queryLogger.js';

/**
 * Check database connection
 * 
 * @param {Database} db - Database connection
 * @returns {Promise<Object|null>} Result object or null
 */
export async function checkDatabaseConnection(db) {
  const query = `SELECT 1 as test`;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get();
}

