/**
 * Files Query Manager
 * 
 * Centralized PostgreSQL-native queries for file/attachment operations.
 * All queries use PostgreSQL syntax ($1, $2, $3 placeholders, etc.)
 * 
 * @module sqlManager/files
 */

import { wrapQuery } from '../queryLogger.js';

/**
 * Get attachment by ID
 * 
 * @param {Database} db - Database connection
 * @param {string} attachmentId - Attachment ID
 * @returns {Promise<Object|null>} Attachment object or null
 */
export async function getAttachmentById(db, attachmentId) {
  const query = `
    SELECT * FROM attachments 
    WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(attachmentId);
}

/**
 * Get user by ID (for file access verification)
 * 
 * @param {Database} db - Database connection
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User object with id or null
 */
export async function getUserByIdForFileAccess(db, userId) {
  const query = `
    SELECT id FROM users 
    WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(userId);
}

/**
 * Get task by ID (for attachment operations)
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @returns {Promise<Object|null>} Task object with boardId or null
 */
export async function getTaskByIdForFiles(db, taskId) {
  const query = `
    SELECT boardid as "boardId" 
    FROM tasks 
    WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(taskId);
}

/**
 * Delete attachment by ID
 * 
 * @param {Database} db - Database connection
 * @param {string} attachmentId - Attachment ID
 * @returns {Promise<Object>} Result object with changes count
 */
export async function deleteAttachment(db, attachmentId) {
  const query = `
    DELETE FROM attachments 
    WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(attachmentId);
}

