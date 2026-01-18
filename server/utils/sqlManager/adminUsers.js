/**
 * Admin Users Query Manager
 * 
 * Centralized PostgreSQL-native queries for admin user management operations.
 * All queries use PostgreSQL syntax ($1, $2, $3 placeholders, etc.)
 * 
 * @module sqlManager/adminUsers
 */

import { wrapQuery } from '../queryLogger.js';

/**
 * Create user invitation
 * 
 * @param {Database} db - Database connection
 * @param {string} id - Invitation ID (UUID)
 * @param {string} userId - User ID
 * @param {string} token - Invitation token
 * @param {string} expiresAt - Expiration timestamp (ISO string)
 * @returns {Promise<Object>} Result object
 */
export async function createUserInvitation(db, id, userId, token, expiresAt) {
  const query = `
    INSERT INTO user_invitations (id, user_id, token, expires_at, created_at) 
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  return await stmt.run(id, userId, token, expiresAt);
}

/**
 * Delete all user invitations for a user
 * 
 * @param {Database} db - Database connection
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Result object
 */
export async function deleteUserInvitations(db, userId) {
  const query = `
    DELETE FROM user_invitations 
    WHERE user_id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(userId);
}

/**
 * Delete activity records for a user
 * 
 * @param {Database} db - Database connection
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Result object
 */
export async function deleteUserActivity(db, userId) {
  const query = `
    DELETE FROM activity 
    WHERE userId = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(userId);
}

/**
 * Delete comments by author member
 * 
 * @param {Database} db - Database connection
 * @param {string} memberId - Member ID
 * @returns {Promise<Object>} Result object
 */
export async function deleteCommentsByMember(db, memberId) {
  const query = `
    DELETE FROM comments 
    WHERE authorId = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(memberId);
}

/**
 * Delete watchers by member
 * 
 * @param {Database} db - Database connection
 * @param {string} memberId - Member ID
 * @returns {Promise<Object>} Result object
 */
export async function deleteWatchersByMember(db, memberId) {
  const query = `
    DELETE FROM watchers 
    WHERE memberId = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(memberId);
}

/**
 * Delete collaborators by member
 * 
 * @param {Database} db - Database connection
 * @param {string} memberId - Member ID
 * @returns {Promise<Object>} Result object
 */
export async function deleteCollaboratorsByMember(db, memberId) {
  const query = `
    DELETE FROM collaborators 
    WHERE memberId = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(memberId);
}

/**
 * Update planning periods to set created_by to NULL
 * 
 * @param {Database} db - Database connection
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Result object
 */
export async function clearPlanningPeriodsCreatedBy(db, userId) {
  const query = `
    UPDATE planning_periods 
    SET created_by = NULL 
    WHERE created_by = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  return await stmt.run(userId);
}

/**
 * Delete all user settings for a user
 * 
 * @param {Database} db - Database connection
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Result object
 */
export async function deleteAllUserSettings(db, userId) {
  const query = `
    DELETE FROM user_settings 
    WHERE userid = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(userId);
}

/**
 * Delete views by user
 * 
 * @param {Database} db - Database connection
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Result object
 */
export async function deleteViewsByUser(db, userId) {
  const query = `
    DELETE FROM views 
    WHERE userId = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(userId);
}

/**
 * Delete password reset tokens for a user
 * 
 * @param {Database} db - Database connection
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Result object
 */
export async function deletePasswordResetTokensByUser(db, userId) {
  const query = `
    DELETE FROM password_reset_tokens 
    WHERE user_id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(userId);
}

/**
 * Reassign tasks assigned to a member to system member
 * 
 * @param {Database} db - Database connection
 * @param {string} systemMemberId - System member ID
 * @param {string} oldMemberId - Old member ID
 * @returns {Promise<Object>} Result object
 */
export async function reassignTasksToSystemMember(db, systemMemberId, oldMemberId) {
  const query = `
    UPDATE tasks 
    SET memberId = $1 
    WHERE memberId = $2
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  return await stmt.run(systemMemberId, oldMemberId);
}

/**
 * Reassign tasks requested by a member to system member
 * 
 * @param {Database} db - Database connection
 * @param {string} systemMemberId - System member ID
 * @param {string} oldMemberId - Old member ID
 * @returns {Promise<Object>} Result object
 */
export async function reassignTaskRequestersToSystemMember(db, systemMemberId, oldMemberId) {
  const query = `
    UPDATE tasks 
    SET requesterId = $1 
    WHERE requesterId = $2
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  return await stmt.run(systemMemberId, oldMemberId);
}

/**
 * Delete member by user ID
 * 
 * @param {Database} db - Database connection
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Result object
 */
export async function deleteMemberByUserId(db, userId) {
  const query = `
    DELETE FROM members 
    WHERE user_id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(userId);
}

/**
 * Delete user account
 * 
 * @param {Database} db - Database connection
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Result object
 */
export async function deleteUser(db, userId) {
  const query = `
    DELETE FROM users 
    WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(userId);
}

/**
 * Create system member if it doesn't exist
 * 
 * @param {Database} db - Database connection
 * @param {string} systemMemberId - System member ID
 * @param {string} systemUserId - System user ID
 * @returns {Promise<Object>} Result object
 */
export async function createSystemMember(db, systemMemberId, systemUserId) {
  const query = `
    INSERT INTO members (id, name, color, user_id) 
    VALUES ($1, 'SYSTEM', '#1E40AF', $2)
    ON CONFLICT (id) DO NOTHING
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  return await stmt.run(systemMemberId, systemUserId);
}
