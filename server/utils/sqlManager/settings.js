/**
 * Settings Query Manager
 * 
 * Centralized PostgreSQL-native queries for settings operations.
 * All queries use PostgreSQL syntax ($1, $2, $3 placeholders, etc.)
 * 
 * @module sqlManager/settings
 */

import { wrapQuery } from '../queryLogger.js';

/**
 * Get settings by keys
 * 
 * @param {Database} db - Database connection
 * @param {Array<string>} keys - Array of setting keys
 * @returns {Promise<Array>} Array of setting objects with key and value
 */
export async function getSettingsByKeys(db, keys) {
  if (!keys || keys.length === 0) {
    return [];
  }
  
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const query = `
    SELECT key, value 
    FROM settings 
    WHERE key IN (${placeholders})
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(...keys);
}

/**
 * Get all settings
 * 
 * @param {Database} db - Database connection
 * @returns {Promise<Array>} Array of setting objects with key and value
 */
export async function getAllSettings(db) {
  const query = `
    SELECT key, value 
    FROM settings
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all();
}

/**
 * Get setting by key
 * 
 * @param {Database} db - Database connection
 * @param {string} key - Setting key
 * @returns {Promise<Object|null>} Setting object or null
 */
export async function getSettingByKey(db, key) {
  const query = `
    SELECT key, value 
    FROM settings 
    WHERE key = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(key);
}

/**
 * Upsert setting (insert or update)
 * 
 * @param {Database} db - Database connection
 * @param {string} key - Setting key
 * @param {string} value - Setting value
 * @returns {Promise<Object>} Result object
 */
export async function upsertSetting(db, key, value) {
  const query = `
    INSERT INTO settings (key, value, updated_at)
    VALUES ($1, $2, CURRENT_TIMESTAMP)
    ON CONFLICT (key) 
    DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  return await stmt.run(key, value);
}

/**
 * Upsert setting with custom timestamp
 * 
 * @param {Database} db - Database connection
 * @param {string} key - Setting key
 * @param {string} value - Setting value
 * @param {string} timestamp - ISO timestamp string
 * @returns {Promise<Object>} Result object
 */
export async function upsertSettingWithTimestamp(db, key, value, timestamp) {
  const query = `
    INSERT INTO settings (key, value, updated_at)
    VALUES ($1, $2, $3)
    ON CONFLICT (key) 
    DO UPDATE SET value = $2, updated_at = $3
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  return await stmt.run(key, value, timestamp);
}

