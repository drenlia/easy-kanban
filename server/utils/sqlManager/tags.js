/**
 * Tags Query Manager
 * 
 * Centralized PostgreSQL-native queries for tag operations.
 * All queries use PostgreSQL syntax ($1, $2, $3 placeholders, etc.)
 * 
 * @module sqlManager/tags
 */

import { wrapQuery } from '../queryLogger.js';

/**
 * Get all tags ordered by tag name
 * 
 * @param {Database} db - Database connection
 * @returns {Promise<Array>} Array of tag objects
 */
export async function getAllTags(db) {
  const query = `
    SELECT * FROM tags 
    ORDER BY tag ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all();
}

/**
 * Get tag by ID
 * 
 * @param {Database} db - Database connection
 * @param {number} tagId - Tag ID
 * @returns {Promise<Object|null>} Tag object or null
 */
export async function getTagById(db, tagId) {
  const query = `
    SELECT * FROM tags 
    WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(tagId);
}

/**
 * Create a new tag
 * 
 * @param {Database} db - Database connection
 * @param {string} tag - Tag name
 * @param {string} description - Tag description
 * @param {string} color - Tag color
 * @returns {Promise<Object>} Result object with lastInsertRowid (SQLite) or returning (PostgreSQL)
 */
export async function createTag(db, tag, description, color) {
  const query = `
    INSERT INTO tags (tag, description, color) 
    VALUES ($1, $2, $3)
    RETURNING *
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  return await stmt.run(tag, description || '', color || '#4F46E5');
}

/**
 * Update a tag
 * 
 * @param {Database} db - Database connection
 * @param {number} tagId - Tag ID
 * @param {string} tag - Tag name
 * @param {string} description - Tag description
 * @param {string} color - Tag color
 * @returns {Promise<Object>} Result object
 */
export async function updateTag(db, tagId, tag, description, color) {
  const query = `
    UPDATE tags 
    SET tag = $1, description = $2, color = $3 
    WHERE id = $4
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  return await stmt.run(tag, description || '', color || '#4F46E5', tagId);
}

/**
 * Get tag usage count (number of tasks using this tag)
 * 
 * @param {Database} db - Database connection
 * @param {number} tagId - Tag ID
 * @returns {Promise<Object>} Object with count property
 */
export async function getTagUsageCount(db, tagId) {
  const query = `
    SELECT COUNT(*) as count 
    FROM task_tags 
    WHERE "tagId" = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(tagId);
}

/**
 * Get batch tag usage counts for multiple tags
 * 
 * @param {Database} db - Database connection
 * @param {Array<number>} tagIds - Array of tag IDs
 * @returns {Promise<Array>} Array of objects with tagId and count
 */
export async function getBatchTagUsageCounts(db, tagIds) {
  if (!tagIds || tagIds.length === 0) {
    return [];
  }
  
  const placeholders = tagIds.map((_, i) => `$${i + 1}`).join(', ');
  const query = `
    SELECT "tagId", COUNT(*) as count 
    FROM task_tags 
    WHERE "tagId" IN (${placeholders})
    GROUP BY "tagId"
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(...tagIds);
}

/**
 * Delete all task associations for a tag
 * 
 * @param {Database} db - Database connection
 * @param {number} tagId - Tag ID
 * @returns {Promise<Object>} Result object
 */
export async function deleteTagAssociations(db, tagId) {
  const query = `
    DELETE FROM task_tags 
    WHERE "tagId" = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(tagId);
}

/**
 * Delete a tag
 * 
 * @param {Database} db - Database connection
 * @param {number} tagId - Tag ID
 * @returns {Promise<Object>} Result object
 */
export async function deleteTag(db, tagId) {
  const query = `
    DELETE FROM tags 
    WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(tagId);
}
