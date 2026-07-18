/**
 * License Settings Query Manager
 * 
 * Centralized PostgreSQL-native queries for license settings operations.
 * All queries use PostgreSQL syntax ($1, $2, $3 placeholders, etc.)
 * 
 * @module sqlManager/licenseSettings
 */

import { wrapQuery } from '../queryLogger.js';

/**
 * Get all license settings
 * 
 * @param {Database} db - Database connection
 * @returns {Promise<Array>} Array of license setting objects
 */
export async function getAllLicenseSettings(db) {
  const query = `
    SELECT setting_key as "settingKey", setting_value as "settingValue"
    FROM license_settings
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all();
}

/**
 * Get license setting by key
 * 
 * @param {Database} db - Database connection
 * @param {string} key - Setting key
 * @returns {Promise<Object|null>} License setting object or null
 */
export async function getLicenseSettingByKey(db, key) {
  const query = `
    SELECT id, setting_key as "settingKey", setting_value as "settingValue"
    FROM license_settings
    WHERE setting_key = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(key);
}

/**
 * Upsert license setting (insert or update)
 * 
 * @param {Database} db - Database connection
 * @param {string} key - Setting key
 * @param {string} value - Setting value
 * @returns {Promise<Object>} Result object
 */
export async function upsertLicenseSetting(db, key, value) {
  const query = `
    INSERT INTO license_settings (setting_key, setting_value, updated_at)
    VALUES ($1, $2, CURRENT_TIMESTAMP)
    ON CONFLICT (setting_key) 
    DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  return await stmt.run(key, value);
}

/**
 * Update license setting
 * 
 * @param {Database} db - Database connection
 * @param {string} key - Setting key
 * @param {string} value - Setting value
 * @returns {Promise<Object>} Result object
 */
export async function updateLicenseSetting(db, key, value) {
  const query = `
    UPDATE license_settings 
    SET setting_value = $1, updated_at = CURRENT_TIMESTAMP 
    WHERE setting_key = $2
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  return await stmt.run(value, key);
}

/**
 * Delete license setting
 * 
 * @param {Database} db - Database connection
 * @param {string} key - Setting key
 * @returns {Promise<Object>} Result object
 */
export async function deleteLicenseSetting(db, key) {
  const query = `
    DELETE FROM license_settings 
    WHERE setting_key = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(key);
}
