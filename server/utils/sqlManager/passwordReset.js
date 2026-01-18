/**
 * Password Reset Query Manager
 * 
 * Centralized PostgreSQL-native queries for password reset operations.
 * All queries use PostgreSQL syntax ($1, $2, $3 placeholders, etc.)
 * 
 * @module sqlManager/passwordReset
 */

import { wrapQuery } from '../queryLogger.js';

/**
 * Get user by email for password reset (active users only)
 * 
 * @param {Database} db - Database connection
 * @param {string} email - User email
 * @returns {Promise<Object|null>} User object with id, email, first_name, last_name or null
 */
export async function getUserByEmailForPasswordReset(db, email) {
  const query = `
    SELECT id, email, first_name as "firstName", last_name as "lastName" 
    FROM users 
    WHERE email = $1 AND is_active = true
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(email);
}

/**
 * Create password reset token
 * 
 * @param {Database} db - Database connection
 * @param {string} userId - User ID
 * @param {string} token - Reset token
 * @param {string} expiresAt - Expiration timestamp (ISO string)
 * @returns {Promise<Object>} Result object with created token data
 */
export async function createPasswordResetToken(db, userId, token, expiresAt) {
  // Use RETURNING to get the created row (PostgreSQL) or rely on lastInsertRowid (SQLite)
  const query = `
    INSERT INTO password_reset_tokens (user_id, token, expires_at) 
    VALUES ($1, $2, $3)
    RETURNING *
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  return await stmt.run(userId, token, expiresAt);
}

/**
 * Get password reset token with user info
 * 
 * @param {Database} db - Database connection
 * @param {string} token - Reset token
 * @returns {Promise<Object|null>} Reset token object with user info or null
 */
export async function getPasswordResetToken(db, token) {
  const query = `
    SELECT 
      rt.id,
      rt.user_id as "userId",
      rt.token,
      rt.expires_at as "expiresAt",
      rt.used,
      rt.created_at as "createdAt",
      u.email, 
      u.first_name as "firstName", 
      u.last_name as "lastName" 
    FROM password_reset_tokens rt
    JOIN users u ON rt.user_id = u.id
    WHERE rt.token = $1 AND rt.expires_at > CURRENT_TIMESTAMP AND rt.used = false
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(token);
}

/**
 * Update user password
 * 
 * @param {Database} db - Database connection
 * @param {string} userId - User ID
 * @param {string} passwordHash - Hashed password
 * @returns {Promise<Object>} Result object
 */
export async function updateUserPassword(db, userId, passwordHash) {
  const query = `
    UPDATE users 
    SET password_hash = $1, updated_at = CURRENT_TIMESTAMP 
    WHERE id = $2
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  return await stmt.run(passwordHash, userId);
}

/**
 * Mark password reset token as used
 * 
 * @param {Database} db - Database connection
 * @param {number} tokenId - Token ID
 * @returns {Promise<Object>} Result object
 */
export async function markPasswordResetTokenAsUsed(db, tokenId) {
  const query = `
    UPDATE password_reset_tokens 
    SET used = true 
    WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  return await stmt.run(tokenId);
}

/**
 * Verify password reset token (for frontend validation)
 * 
 * @param {Database} db - Database connection
 * @param {string} token - Reset token
 * @returns {Promise<Object|null>} Token object with email and expires_at or null
 */
export async function verifyPasswordResetToken(db, token) {
  const query = `
    SELECT 
      rt.id,
      rt.user_id as "userId",
      rt.token,
      rt.expires_at as "expiresAt",
      rt.used,
      rt.created_at as "createdAt",
      u.email 
    FROM password_reset_tokens rt
    JOIN users u ON rt.user_id = u.id
    WHERE rt.token = $1 AND rt.expires_at > CURRENT_TIMESTAMP AND rt.used = false
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(token);
}

/**
 * Get max ID from password_reset_tokens (for sequence sync)
 * 
 * @param {Database} db - Database connection
 * @returns {Promise<number>} Max ID or 0 if no tokens exist
 */
export async function getMaxPasswordResetTokenId(db) {
  const query = `
    SELECT COALESCE(MAX(id), 0) as "maxId" 
    FROM password_reset_tokens
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const result = await stmt.get();
  return result?.maxId || 0;
}
