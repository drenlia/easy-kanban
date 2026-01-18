/**
 * Helper Query Functions
 * 
 * Shared query functions used across multiple domains
 */

import { wrapQuery } from '../queryLogger.js';

/**
 * Get priority by ID
 */
export async function getPriorityById(db, priorityId) {
  const query = `SELECT priority, color FROM priorities WHERE id = $1`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(priorityId);
}

/**
 * Get priority by name
 */
export async function getPriorityByName(db, priorityName) {
  const query = `SELECT id, color FROM priorities WHERE priority = $1`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(priorityName);
}

/**
 * Get default priority (where initial = 1)
 */
export async function getDefaultPriority(db) {
  const query = `SELECT id FROM priorities WHERE initial = 1`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get();
}

/**
 * Get priority name by ID
 */
export async function getPriorityNameById(db, priorityId) {
  const query = `SELECT priority FROM priorities WHERE id = $1`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const result = await stmt.get(priorityId);
  return result ? result.priority : null;
}

/**
 * Get all priorities
 */
export async function getAllPriorities(db) {
  const query = `SELECT id, priority FROM priorities`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all();
}

/**
 * Get priorities by IDs
 */
export async function getPrioritiesByIds(db, priorityIds) {
  if (!priorityIds || priorityIds.length === 0) {
    return [];
  }
  
  const placeholders = priorityIds.map((_, i) => `$${i + 1}`).join(', ');
  const query = `SELECT id, priority, color FROM priorities WHERE id IN (${placeholders})`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(...priorityIds);
}

/**
 * Get priorities by names
 */
export async function getPrioritiesByNames(db, priorityNames) {
  if (!priorityNames || priorityNames.length === 0) {
    return [];
  }
  
  const placeholders = priorityNames.map((_, i) => `$${i + 1}`).join(', ');
  const query = `SELECT id, priority, color FROM priorities WHERE priority IN (${placeholders})`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(...priorityNames);
}

/**
 * Get setting value by key
 */
export async function getSetting(db, key) {
  const query = `SELECT value FROM settings WHERE key = $1`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const result = await stmt.get(key);
  return result ? result.value : null;
}

/**
 * Get column by ID
 */
export async function getColumnById(db, columnId) {
  const query = `SELECT id, title FROM columns WHERE id = $1`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(columnId);
}

/**
 * Get full column info by ID (including boardId and position)
 */
export async function getColumnFullInfo(db, columnId) {
  const query = `SELECT id, title, boardid as "boardId", position FROM columns WHERE id = $1`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(columnId);
}

/**
 * Check for duplicate column name in board (excluding a specific column)
 */
export async function checkColumnNameDuplicate(db, boardId, title, excludeColumnId) {
  const query = `SELECT id FROM columns WHERE boardid = $1 AND LOWER(title) = LOWER($2) AND id != $3`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(boardId, title, excludeColumnId);
}

/**
 * Get column with is_finished flag
 */
export async function getColumnWithStatus(db, columnId) {
  const query = `SELECT id, title, is_finished as "isFinished" FROM columns WHERE id = $1`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(columnId);
}

/**
 * Get first column in board
 */
export async function getFirstColumnInBoard(db, boardId) {
  const query = `SELECT id, title FROM columns WHERE boardid = $1 ORDER BY position ASC LIMIT 1`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(boardId);
}

/**
 * Get column by title in board
 */
export async function getColumnByTitleInBoard(db, boardId, title) {
  const query = `SELECT id, title, boardid as "boardId" FROM columns WHERE boardid = $1 AND LOWER(title) = LOWER($2) ORDER BY position ASC LIMIT 1`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(boardId, title);
}

/**
 * Get all columns for a board
 */
export async function getColumnsForBoard(db, boardId) {
  const query = `
    SELECT 
      id, 
      title, 
      boardid as "boardId", 
      position, 
      is_finished as "isFinished", 
      is_archived as "isArchived"
    FROM columns 
    WHERE boardid = $1 
    ORDER BY position ASC
  `;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(boardId);
}

/**
 * Get maximum position for columns in a board
 */
export async function getMaxColumnPosition(db, boardId) {
  const query = `SELECT MAX(position) as maxPos FROM columns WHERE boardid = $1`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const result = await stmt.get(boardId);
  return result?.maxPos ?? -1;
}

/**
 * Get column position by ID
 */
export async function getColumnPosition(db, columnId) {
  const query = `SELECT position FROM columns WHERE id = $1`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(columnId);
}

/**
 * Update column position
 */
export async function updateColumnPosition(db, columnId, position) {
  const query = `UPDATE columns SET position = $1 WHERE id = $2`;
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  return await stmt.run(position, columnId);
}

/**
 * Shift column positions (for reordering)
 * @param {Database} db - Database connection
 * @param {string} boardId - Board ID
 * @param {number} minPosition - Minimum position to shift
 * @param {number} maxPosition - Maximum position to shift
 * @param {number} shiftBy - Amount to shift (positive or negative)
 * @param {string} excludeColumnId - Optional column ID to exclude from shifting
 */
export async function shiftColumnPositions(db, boardId, minPosition, maxPosition, shiftBy, excludeColumnId = null) {
  let query = `
    UPDATE columns 
    SET position = position + $1 
    WHERE boardid = $2 AND position >= $3 AND position <= $4
  `;
  const params = [shiftBy, boardId, minPosition, maxPosition];
  
  // Exclude the column being moved from the shift operation
  if (excludeColumnId) {
    query += ` AND id != $5`;
    params.push(excludeColumnId);
  }
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  return await stmt.run(...params);
}

/**
 * Get all columns for a board ordered by position
 */
export async function getAllColumnsForBoard(db, boardId) {
  const query = `
    SELECT 
      id, 
      title, 
      boardid as "boardId", 
      position, 
      is_finished as "isFinished", 
      is_archived as "isArchived"
    FROM columns 
    WHERE boardid = $1 
    ORDER BY position ASC
  `;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(boardId);
}

/**
 * Get all column IDs for a board ordered by position
 */
export async function getColumnIdsForBoard(db, boardId) {
  const query = `SELECT id FROM columns WHERE boardid = $1 ORDER BY position, id`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(boardId);
}

/**
 * Update column (title, is_finished, is_archived)
 */
export async function updateColumn(db, columnId, title, isFinished, isArchived) {
  const query = `
    UPDATE columns 
    SET title = $1, is_finished = $2, is_archived = $3 
    WHERE id = $4
  `;
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  return await stmt.run(title, isFinished ? 1 : 0, isArchived ? 1 : 0, columnId);
}

/**
 * Delete column
 */
export async function deleteColumn(db, columnId) {
  const query = `DELETE FROM columns WHERE id = $1`;
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(columnId);
}

/**
 * Create a column
 */
export async function createColumn(db, id, title, boardId, position, isFinished, isArchived) {
  const query = `
    INSERT INTO columns (id, title, boardid, position, is_finished, is_archived) 
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  return await stmt.run(id, title, boardId, position, isFinished ? 1 : 0, isArchived ? 1 : 0);
}

/**
 * Get board by ID
 */
export async function getBoardById(db, boardId) {
  const query = `SELECT title FROM boards WHERE id = $1`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(boardId);
}

/**
 * Get attachments for task
 */
export async function getAttachmentsForTask(db, taskId) {
  const query = `SELECT url FROM attachments WHERE taskid = $1`;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(taskId);
}

/**
 * Get attachments for a single comment
 */
export async function getAttachmentsForComment(db, commentId) {
  const query = `
    SELECT 
      id, 
      name, 
      url, 
      type, 
      size, 
      created_at as "createdAt"
    FROM attachments 
    WHERE commentid = $1
  `;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(commentId);
}

/**
 * Get attachments for comments
 */
export async function getAttachmentsForComments(db, commentIds) {
  if (!commentIds || commentIds.length === 0) {
    return [];
  }
  
  const placeholders = commentIds.map((_, i) => `$${i + 1}`).join(', ');
  const query = `
    SELECT commentid, id, name, url, type, size, created_at as createdAt
    FROM attachments
    WHERE commentid IN (${placeholders})
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(...commentIds);
}

/**
 * Get comments for task
 */
export async function getCommentsForTask(db, taskId) {
  const query = `
    SELECT c.*, 
           m.name as authorName,
           m.color as authorColor
    FROM comments c
    LEFT JOIN members m ON c.authorid = m.id
    WHERE c.taskid = $1
    ORDER BY c.createdat ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(taskId);
}

/**
 * Get watchers for task
 */
export async function getWatchersForTask(db, taskId) {
  const query = `
    SELECT m.* 
    FROM watchers w
    JOIN members m ON w.memberid = m.id
    WHERE w.taskid = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(taskId);
}

/**
 * Get collaborators for task
 */
export async function getCollaboratorsForTask(db, taskId) {
  const query = `
    SELECT m.* 
    FROM collaborators c
    JOIN members m ON c.memberid = m.id
    WHERE c.taskid = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(taskId);
}

/**
 * Add watcher to task
 */
export async function addWatcher(db, taskId, memberId) {
  const query = `
    INSERT INTO watchers (taskid, memberid, created_at)
    VALUES ($1, $2, $3)
    ON CONFLICT (taskid, memberid) DO NOTHING
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  return await stmt.run(taskId, memberId, new Date().toISOString());
}

/**
 * Remove watcher from task
 */
export async function removeWatcher(db, taskId, memberId) {
  const query = `DELETE FROM watchers WHERE taskid = $1 AND memberid = $2`;
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(taskId, memberId);
}

/**
 * Add collaborator to task
 */
export async function addCollaborator(db, taskId, memberId) {
  const query = `
    INSERT INTO collaborators (taskid, memberid, created_at)
    VALUES ($1, $2, $3)
    ON CONFLICT (taskid, memberid) DO NOTHING
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  return await stmt.run(taskId, memberId, new Date().toISOString());
}

/**
 * Remove collaborator from task
 */
export async function removeCollaborator(db, taskId, memberId) {
  const query = `DELETE FROM collaborators WHERE taskid = $1 AND memberid = $2`;
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(taskId, memberId);
}

/**
 * Get tags for task
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @returns {Promise<Array>} Array of tag objects with id, tag, description, color
 */
export async function getTagsForTask(db, taskId) {
  const query = `
    SELECT t.* 
    FROM tags t
    JOIN task_tags tt ON t.id = tt.tagid
    WHERE tt.taskid = $1
    ORDER BY t.tag ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(taskId);
}

/**
 * Check if tag is already associated with task
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @param {number} tagId - Tag ID
 * @returns {Promise<Object|null>} Association record or null
 */
export async function checkTagAssociation(db, taskId, tagId) {
  const query = `
    SELECT id FROM task_tags 
    WHERE taskid = $1 AND tagid = $2
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(taskId, tagId);
}

/**
 * Add tag to task
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @param {number} tagId - Tag ID
 * @returns {Promise<Object>} Result object
 */
export async function addTagToTask(db, taskId, tagId) {
  const query = `
    INSERT INTO task_tags (taskid, tagid, created_at)
    VALUES ($1, $2, $3)
    ON CONFLICT (taskid, tagid) DO NOTHING
    RETURNING *
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  return await stmt.run(taskId, tagId, new Date().toISOString());
}

/**
 * Remove tag from task
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @param {number} tagId - Tag ID
 * @returns {Promise<Object>} Result object with changes count
 */
export async function removeTagFromTask(db, taskId, tagId) {
  const query = `
    DELETE FROM task_tags 
    WHERE taskid = $1 AND tagid = $2
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(taskId, tagId);
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
    SELECT id, tag, description, color 
    FROM tags 
    WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(tagId);
}



