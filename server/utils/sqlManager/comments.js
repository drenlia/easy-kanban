/**
 * Comment Query Manager
 * 
 * Centralized PostgreSQL-native queries for comment operations.
 * All queries use PostgreSQL syntax ($1, $2, $3 placeholders, json_agg, etc.)
 * 
 * @module sqlManager/comments
 */

import { wrapQuery } from '../queryLogger.js';

/**
 * Create a comment
 * 
 * @param {Database} db - Database connection
 * @param {string} id - Comment ID
 * @param {string} taskId - Task ID
 * @param {string} text - Comment text
 * @param {string} authorId - Author member ID
 * @param {string} createdAt - Creation timestamp
 * @returns {Promise<Object>} Result object
 */
export async function createComment(db, id, taskId, text, authorId, createdAt) {
  const query = `
    INSERT INTO comments (id, taskid, text, authorid, createdat)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  return await stmt.run(id, taskId, text, authorId, createdAt);
}

/**
 * Get comment by ID with author info
 * 
 * @param {Database} db - Database connection
 * @param {string} commentId - Comment ID
 * @returns {Promise<Object|null>} Comment object with author info or null
 */
export async function getCommentById(db, commentId) {
  const query = `
    SELECT 
      c.id,
      c.taskid as "taskId",
      c.text,
      c.authorid as "authorId",
      c.createdat as "createdAt",
      c.updated_at as "updatedAt",
      m.name as "authorName",
      m.color as "authorColor"
    FROM comments c
    LEFT JOIN members m ON c.authorid = m.id
    WHERE c.id = $1
  `;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(commentId);
}

/**
 * Get all comments for a task
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @returns {Promise<Array>} Array of comment objects
 */
export async function getCommentsForTask(db, taskId) {
  const query = `
    SELECT 
      c.id,
      c.taskid as "taskId",
      c.text,
      c.authorid as "authorId",
      c.createdat as "createdAt",
      c.updated_at as "updatedAt",
      m.name as "authorName",
      m.color as "authorColor"
    FROM comments c
    LEFT JOIN members m ON c.authorid = m.id
    WHERE c.taskid = $1
    ORDER BY c.createdat ASC
  `;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(taskId);
}

/**
 * Update comment text
 * 
 * @param {Database} db - Database connection
 * @param {string} commentId - Comment ID
 * @param {string} text - New comment text
 * @returns {Promise<Object>} Result object
 */
export async function updateComment(db, commentId, text) {
  const query = `UPDATE comments SET text = $1 WHERE id = $2`;
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  return await stmt.run(text, commentId);
}

/**
 * Delete comment
 * 
 * @param {Database} db - Database connection
 * @param {string} commentId - Comment ID
 * @returns {Promise<Object>} Result object
 */
export async function deleteComment(db, commentId) {
  const query = `DELETE FROM comments WHERE id = $1`;
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(commentId);
}

/**
 * Get comment by ID (simple, no joins)
 * 
 * @param {Database} db - Database connection
 * @param {string} commentId - Comment ID
 * @returns {Promise<Object|null>} Comment object or null
 */
export async function getCommentSimple(db, commentId) {
  const query = `SELECT * FROM comments WHERE id = $1`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(commentId);
}


