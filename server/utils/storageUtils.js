import { wrapQuery } from './queryLogger.js';

/**
 * Storage utility functions for tracking attachment storage usage
 */

/**
 * Calculate total storage usage from all attachments
 * @param {Database} db - Database instance
 * @returns {number} Total storage usage in bytes
 */
export const calculateStorageUsage = async (db) => {
  try {
    const result = await wrapQuery(
      db.prepare('SELECT SUM(size) as totalSize FROM attachments'),
      'SELECT'
    ).get();
    
    return result.totalSize || 0;
  } catch (error) {
    console.error('Error calculating storage usage:', error);
    return 0;
  }
};

/**
 * Update the STORAGE_USED setting in the database
 * @param {Database} db - Database instance
 * @param {number} usage - Storage usage in bytes (optional, will calculate if not provided)
 * @returns {number} The updated storage usage
 */
export const updateStorageUsage = async (db, usage = null) => {
  try {
    const currentUsage = usage !== null ? usage : await calculateStorageUsage(db);
    
    await wrapQuery(
      db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'),
      'INSERT'
    ).run('STORAGE_USED', currentUsage.toString());
    
    console.log(`📊 Storage usage updated: ${formatBytes(currentUsage)}`);
    return currentUsage;
  } catch (error) {
    console.error('Error updating storage usage:', error);
    return 0;
  }
};

/**
 * Get current storage limit from settings
 * @param {Database} db - Database instance
 * @returns {number} Storage limit in bytes
 */
export const getStorageLimit = async (db) => {
  try {
    const result = await wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'),
      'SELECT'
    ).get('STORAGE_LIMIT');
    
    return result ? parseInt(result.value) : 5368709120; // Default 5GB
  } catch (error) {
    console.error('Error getting storage limit:', error);
    return 5368709120; // Default 5GB
  }
};

/**
 * Get current storage usage from settings
 * @param {Database} db - Database instance
 * @returns {number} Storage usage in bytes
 */
export const getStorageUsage = async (db) => {
  try {
    const result = await wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'),
      'SELECT'
    ).get('STORAGE_USED');
    
    return result ? parseInt(result.value) : 0;
  } catch (error) {
    console.error('Error getting storage usage:', error);
    return 0;
  }
};

/**
 * Check if adding a file would exceed storage limit
 * @param {Database} db - Database instance
 * @param {number} fileSize - Size of file to add in bytes
 * @returns {Object} { allowed: boolean, currentUsage: number, limit: number, remaining: number }
 */
export const checkStorageLimit = async (db, fileSize = 0) => {
  try {
    const currentUsage = await getStorageUsage(db);
    const limit = await getStorageLimit(db);
    const newUsage = currentUsage + fileSize;
    const remaining = limit - currentUsage;
    
    return {
      allowed: newUsage <= limit,
      currentUsage,
      limit,
      remaining,
      newUsage
    };
  } catch (error) {
    console.error('Error checking storage limit:', error);
    return {
      allowed: false,
      currentUsage: 0,
      limit: 0,
      remaining: 0,
      newUsage: 0
    };
  }
};

/**
 * Format bytes to human readable format
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string (e.g., "1.5 MB", "2.3 GB")
 */
export const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Initialize storage usage on app startup
 * This should be called when the app starts to ensure storage usage is accurate
 * @param {Database} db - Database instance
 */
export const initializeStorageUsage = async (db) => {
  try {
    console.log('📊 Initializing storage usage...');
    const calculatedUsage = await calculateStorageUsage(db);
    const storedUsage = await getStorageUsage(db);
    
    if (calculatedUsage !== storedUsage) {
      console.log(`📊 Storage usage mismatch detected. Calculated: ${formatBytes(calculatedUsage)}, Stored: ${formatBytes(storedUsage)}`);
      await updateStorageUsage(db, calculatedUsage);
    } else {
      console.log(`📊 Storage usage is accurate: ${formatBytes(calculatedUsage)}`);
    }
  } catch (error) {
    console.error('Error initializing storage usage:', error);
  }
};
