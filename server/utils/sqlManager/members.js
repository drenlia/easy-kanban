/**
 * Members Query Manager
 * 
 * Centralized PostgreSQL-native queries for member operations.
 * All queries use PostgreSQL syntax ($1, $2, $3 placeholders, etc.)
 * 
 * @module sqlManager/members
 */

import { wrapQuery } from '../queryLogger.js';

/**
 * Get all members with user info
 * 
 * @param {Database} db - Database connection
 * @param {boolean} includeSystem - Whether to include System User (id: '00000000-0000-0000-0000-000000000001')
 * @returns {Promise<Array>} Array of member objects with user info
 */
export async function getAllMembers(db, includeSystem = false) {
  const whereClause = includeSystem 
    ? '' 
    : "WHERE m.id != '00000000-0000-0000-0000-000000000001'";
  
  const query = `
    SELECT 
      m.id, 
      m.name, 
      m.color, 
      m.user_id as "userId", 
      m.created_at as "createdAt",
      u.avatar_path as "avatarPath", 
      u.auth_provider as "authProvider", 
      u.google_avatar_url as "googleAvatarUrl"
    FROM members m
    LEFT JOIN users u ON m.user_id = u.id
    ${whereClause}
    ORDER BY m.created_at ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const members = await stmt.all();
  
  // Transform to match expected format (camelCase)
  return members.map(member => ({
    id: member.id,
    name: member.name,
    color: member.color,
    user_id: member.userId,
    avatarUrl: member.avatarPath,
    authProvider: member.authProvider,
    googleAvatarUrl: member.googleAvatarUrl
  }));
}

/**
 * Check if member name exists (case-insensitive)
 * 
 * @param {Database} db - Database connection
 * @param {string} name - Member name to check
 * @returns {Promise<Object|null>} Existing member or null
 */
export async function checkMemberNameExists(db, name) {
  const query = `
    SELECT id 
    FROM members 
    WHERE LOWER(name) = LOWER($1)
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(name);
}

/**
 * Create a new member
 * 
 * @param {Database} db - Database connection
 * @param {string} id - Member ID
 * @param {string} name - Member name
 * @param {string} color - Member color
 * @returns {Promise<Object>} Created member object
 */
export async function createMember(db, id, name, color) {
  const query = `
    INSERT INTO members (id, name, color) 
    VALUES ($1, $2, $3)
    RETURNING *
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  return await stmt.run(id, name, color);
}

/**
 * Delete a member
 * 
 * @param {Database} db - Database connection
 * @param {string} id - Member ID
 * @returns {Promise<Object>} Result object with changes count
 */
export async function deleteMember(db, id) {
  const query = `
    DELETE FROM members 
    WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(id);
}
