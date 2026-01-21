/**
 * Task Query Manager
 * 
 * Centralized PostgreSQL-native queries for task operations.
 * All queries use PostgreSQL syntax ($1, $2, $3 placeholders, json_agg, etc.)
 * 
 * @module sqlManager/tasks
 */

import { wrapQuery } from '../queryLogger.js';

/**
 * Get task by ID with all relationships (comments, watchers, collaborators, tags, attachments)
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID (UUID)
 * @returns {Promise<Object|null>} Task object with relationships or null if not found
 */
export async function getTaskWithRelationships(db, taskId) {
  const query = `
    SELECT t.*, 
           p.id as "priorityId",
           p.priority as "priorityName",
           p.color as "priorityColor",
           CASE WHEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) > 0 
                THEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) 
                ELSE NULL END as attachmentCount,
           COALESCE(json_agg(json_build_object(
               'id', c.id,
               'text', c.text,
               'authorId', c.authorid,
               'createdAt', c.createdat,
               'updated_at', c.updated_at,
               'taskId', c.taskid,
               'authorName', comment_author.name,
               'authorColor', comment_author.color
           )) FILTER (WHERE c.id IS NOT NULL), '[]'::json) as comments,
           COALESCE(json_agg(json_build_object(
               'id', tag.id,
               'tag', tag.tag,
               'description', tag.description,
               'color', tag.color
           )) FILTER (WHERE tag.id IS NOT NULL), '[]'::json) as tags,
           COALESCE(json_agg(json_build_object(
               'id', watcher.id,
               'name', watcher.name,
               'color', watcher.color,
               'user_id', watcher.user_id,
               'email', watcher_user.email,
               'avatarUrl', watcher_user.avatar_path,
               'googleAvatarUrl', watcher_user.google_avatar_url
           )) FILTER (WHERE watcher.id IS NOT NULL), '[]'::json) as watchers,
           COALESCE(json_agg(json_build_object(
               'id', collaborator.id,
               'name', collaborator.name,
               'color', collaborator.color,
               'user_id', collaborator.user_id,
               'email', collaborator_user.email,
               'avatarUrl', collaborator_user.avatar_path,
               'googleAvatarUrl', collaborator_user.google_avatar_url
           )) FILTER (WHERE collaborator.id IS NOT NULL), '[]'::json) as collaborators
    FROM tasks t
    LEFT JOIN attachments a ON a.taskid = t.id AND a.commentid IS NULL
    LEFT JOIN comments c ON c.taskid = t.id
    LEFT JOIN members comment_author ON comment_author.id = c.authorid
    LEFT JOIN task_tags tt ON tt.taskid = t.id
    LEFT JOIN tags tag ON tag.id = tt.tagid
    LEFT JOIN watchers w ON w.taskid = t.id
    LEFT JOIN members watcher ON watcher.id = w.memberid
    LEFT JOIN users watcher_user ON watcher_user.id = watcher.user_id
    LEFT JOIN collaborators col ON col.taskid = t.id
    LEFT JOIN members collaborator ON collaborator.id = col.memberid
    LEFT JOIN users collaborator_user ON collaborator_user.id = collaborator.user_id
    LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
    WHERE t.id = $1
    GROUP BY t.id, p.id
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const task = await stmt.get(taskId);
  
  if (!task) return null;
  
  // Parse JSON fields (PostgreSQL returns JSON as objects/arrays, but handle both)
  const parseJsonField = (field) => {
    if (field === null || field === undefined || field === '' || field === '[null]' || field === 'null') {
      return [];
    }
    if (Array.isArray(field)) {
      return field.filter(Boolean);
    }
    if (typeof field === 'object') {
      return Array.isArray(field) ? field.filter(Boolean) : [field].filter(Boolean);
    }
    if (typeof field === 'string') {
      const trimmed = field.trim();
      if (!trimmed || trimmed === '[]' || trimmed === '[null]' || trimmed === 'null') {
        return [];
      }
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : (parsed ? [parsed] : []);
      } catch (e) {
        console.warn('Failed to parse JSON field:', e.message, 'Value:', field);
        return [];
      }
    }
    return [];
  };
  
  // Deduplicate arrays by id
  const deduplicateById = (arr) => {
    const seen = new Set();
    return arr.filter(item => {
      if (!item || !item.id) return false;
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  };
  
  // Parse and deduplicate JSON fields
  task.comments = deduplicateById(parseJsonField(task.comments));
  task.tags = deduplicateById(parseJsonField(task.tags));
  task.watchers = deduplicateById(parseJsonField(task.watchers));
  task.collaborators = deduplicateById(parseJsonField(task.collaborators));
  
  return task;
}

/**
 * Get task by ticket number (e.g., "TASK-00032")
 * 
 * @param {Database} db - Database connection
 * @param {string} ticket - Task ticket number
 * @returns {Promise<Object|null>} Task object or null if not found
 */
export async function getTaskByTicket(db, ticket) {
  const query = `
    SELECT t.*, 
           p.id as "priorityId",
           p.priority as "priorityName",
           p.color as "priorityColor",
           c.title as status,
           CASE WHEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) > 0 
                THEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) 
                ELSE NULL END as attachmentCount
    FROM tasks t
    LEFT JOIN attachments a ON a.taskid = t.id
    LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
    LEFT JOIN columns c ON c.id = t.columnid
    WHERE t.ticket = $1
    GROUP BY t.id, p.id, c.id
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(ticket);
}

/**
 * Get task by ID (simple, without relationships)
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID (UUID)
 * @returns {Promise<Object|null>} Task object or null if not found
 */
export async function getTaskById(db, taskId) {
  const query = `
    SELECT * FROM tasks WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(taskId);
}

/**
 * Get all tasks for a column with relationships
 * 
 * @param {Database} db - Database connection
 * @param {string} columnId - Column ID
 * @returns {Promise<Array>} Array of task objects with relationships
 */
export async function getTasksForColumn(db, columnId) {
  const query = `
    SELECT t.id, t.position, t.title, t.description, t.ticket, 
           t.memberid as "memberId", t.requesterid as "requesterId", 
           t.startdate as "startDate", t.duedate as "dueDate", 
           t.effort, t.priority, t.priority_id as "priority_id", 
           t.columnid as "columnId", t.boardid as "boardId", 
           t.sprint_id as "sprint_id", t.created_at, t.updated_at,
           p.id as "priorityId", p.priority as "priorityName", 
           p.color as "priorityColor",
           CASE WHEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) > 0 
                THEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) 
                ELSE NULL END as attachmentCount,
           COALESCE(json_agg(json_build_object(
               'id', c.id,
               'text', c.text,
               'authorId', c.authorid,
               'createdAt', c.createdat
           )) FILTER (WHERE c.id IS NOT NULL), '[]'::json) as comments,
           COALESCE(json_agg(json_build_object(
               'id', tag.id,
               'tag', tag.tag,
               'description', tag.description,
               'color', tag.color
           )) FILTER (WHERE tag.id IS NOT NULL), '[]'::json) as tags,
           COALESCE(json_agg(json_build_object(
               'id', watcher.id,
               'name', watcher.name,
               'color', watcher.color
           )) FILTER (WHERE watcher.id IS NOT NULL), '[]'::json) as watchers,
           COALESCE(json_agg(json_build_object(
               'id', collaborator.id,
               'name', collaborator.name,
               'color', collaborator.color
           )) FILTER (WHERE collaborator.id IS NOT NULL), '[]'::json) as collaborators
    FROM tasks t
    LEFT JOIN comments c ON c.taskid = t.id
    LEFT JOIN task_tags tt ON tt.taskid = t.id
    LEFT JOIN tags tag ON tag.id = tt.tagid
    LEFT JOIN watchers w ON w.taskid = t.id
    LEFT JOIN members watcher ON watcher.id = w.memberid
    LEFT JOIN collaborators col ON col.taskid = t.id
    LEFT JOIN members collaborator ON collaborator.id = col.memberid
    LEFT JOIN attachments a ON a.taskid = t.id
    LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
    WHERE t.columnid = $1
    GROUP BY t.id, p.id
    ORDER BY t.position ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const tasks = await stmt.all(columnId);
  
  // Parse JSON fields for each task
  return tasks.map(task => {
    const parseJsonField = (field) => {
      if (!field || field === '[]' || field === '[null]') return [];
      if (Array.isArray(field)) return field.filter(Boolean);
      if (typeof field === 'string') {
        try {
          const parsed = JSON.parse(field);
          return Array.isArray(parsed) ? parsed.filter(Boolean) : (parsed ? [parsed] : []);
        } catch {
          return [];
        }
      }
      return [];
    };
    
    const deduplicateById = (arr) => {
      const seen = new Set();
      return arr.filter(item => {
        if (!item || !item.id) return false;
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    };
    
    task.comments = deduplicateById(parseJsonField(task.comments));
    task.tags = deduplicateById(parseJsonField(task.tags));
    task.watchers = deduplicateById(parseJsonField(task.watchers));
    task.collaborators = deduplicateById(parseJsonField(task.collaborators));
    
    return task;
  });
}

/**
 * Get all tasks for multiple columns (batch query for performance)
 * 
 * @param {Database} db - Database connection
 * @param {Array<string>} columnIds - Array of column IDs
 * @returns {Promise<Array>} Array of task objects with relationships
 */
export async function getTasksForColumns(db, columnIds) {
  if (!columnIds || columnIds.length === 0) {
    return [];
  }
  
  const placeholders = columnIds.map((_, index) => `$${index + 1}`).join(', ');
  const query = `
    SELECT t.id, t.position, t.title, t.description, t.ticket, 
           t.memberid as "memberId", t.requesterid as "requesterId", 
           t.startdate as "startDate", t.duedate as "dueDate", 
           t.effort, t.priority, t.priority_id as "priority_id", 
           t.columnid as "columnId", t.boardid as "boardId", 
           t.sprint_id as "sprint_id", t.created_at, t.updated_at,
           p.id as "priorityId", p.priority as "priorityName", 
           p.color as "priorityColor",
           CASE WHEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) > 0 
                THEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) 
                ELSE NULL END as attachmentCount,
           COALESCE(json_agg(json_build_object(
               'id', c.id,
               'text', c.text,
               'authorId', c.authorid,
               'createdAt', c.createdat
           )) FILTER (WHERE c.id IS NOT NULL), '[]'::json) as comments,
           COALESCE(json_agg(json_build_object(
               'id', tag.id,
               'tag', tag.tag,
               'description', tag.description,
               'color', tag.color
           )) FILTER (WHERE tag.id IS NOT NULL), '[]'::json) as tags,
           COALESCE(json_agg(json_build_object(
               'id', watcher.id,
               'name', watcher.name,
               'color', watcher.color
           )) FILTER (WHERE watcher.id IS NOT NULL), '[]'::json) as watchers,
           COALESCE(json_agg(json_build_object(
               'id', collaborator.id,
               'name', collaborator.name,
               'color', collaborator.color
           )) FILTER (WHERE collaborator.id IS NOT NULL), '[]'::json) as collaborators
    FROM tasks t
    LEFT JOIN comments c ON c.taskid = t.id
    LEFT JOIN task_tags tt ON tt.taskid = t.id
    LEFT JOIN tags tag ON tag.id = tt.tagid
    LEFT JOIN watchers w ON w.taskid = t.id
    LEFT JOIN members watcher ON watcher.id = w.memberid
    LEFT JOIN collaborators col ON col.taskid = t.id
    LEFT JOIN members collaborator ON collaborator.id = col.memberid
    LEFT JOIN attachments a ON a.taskid = t.id
    LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
    WHERE t.columnid IN (${placeholders})
    GROUP BY t.id, p.id
    ORDER BY t.columnid, t.position ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const tasks = await stmt.all(...columnIds);
  
  // Parse JSON fields for each task
  return tasks.map(task => {
    const parseJsonField = (field) => {
      if (!field || field === '[]' || field === '[null]') return [];
      if (Array.isArray(field)) return field.filter(Boolean);
      if (typeof field === 'string') {
        try {
          const parsed = JSON.parse(field);
          return Array.isArray(parsed) ? parsed.filter(Boolean) : (parsed ? [parsed] : []);
        } catch {
          return [];
        }
      }
      return [];
    };
    
    const deduplicateById = (arr) => {
      const seen = new Set();
      return arr.filter(item => {
        if (!item || !item.id) return false;
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    };
    
    task.comments = deduplicateById(parseJsonField(task.comments));
    task.tags = deduplicateById(parseJsonField(task.tags));
    task.watchers = deduplicateById(parseJsonField(task.watchers));
    task.collaborators = deduplicateById(parseJsonField(task.collaborators));
    
    return task;
  });
}

/**
 * Get all tasks (simple list)
 * 
 * @param {Database} db - Database connection
 * @returns {Promise<Array>} Array of all tasks
 */
export async function getAllTasks(db) {
  const query = `
    SELECT t.*, 
           CASE WHEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) > 0 
                THEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) 
                ELSE NULL END as attachmentCount
    FROM tasks t
    LEFT JOIN attachments a ON a.taskid = t.id
    GROUP BY t.id
    ORDER BY t.position ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all();
}

/**
 * Create a new task
 * 
 * @param {Database} db - Database connection
 * @param {Object} taskData - Task data object
 * @param {string} taskData.id - Task ID (UUID)
 * @param {string} taskData.title - Task title
 * @param {string} [taskData.description] - Task description
 * @param {string} [taskData.ticket] - Task ticket number
 * @param {string} [taskData.memberId] - Assigned member ID
 * @param {string} [taskData.requesterId] - Requester member ID
 * @param {string} [taskData.startDate] - Start date (ISO string)
 * @param {string} [taskData.dueDate] - Due date (ISO string)
 * @param {number} [taskData.effort] - Effort estimate
 * @param {string} [taskData.priority] - Priority name
 * @param {string} [taskData.priorityId] - Priority ID
 * @param {string} taskData.columnId - Column ID
 * @param {string} taskData.boardId - Board ID
 * @param {number} [taskData.position] - Position in column
 * @param {string} [taskData.sprintId] - Sprint ID
 * @returns {Promise<Object>} Result object with changes and lastInsertRowid
 */
export async function createTask(db, taskData) {
  const now = new Date().toISOString();
  
  const query = `
    INSERT INTO tasks (
      id, title, description, ticket, memberid, requesterid,
      startdate, duedate, effort, priority, priority_id,
      columnid, boardid, position, sprint_id, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
    ) RETURNING *
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  // Handle effort: default to 0 if not provided, but allow 0 as a valid value
  // Use nullish coalescing to only default when effort is null/undefined, not when it's 0
  const effort = taskData.effort != null ? taskData.effort : 0;
  
  return await stmt.run(
    taskData.id,
    taskData.title,
    taskData.description || '',
    taskData.ticket || null,
    taskData.memberId || null,
    taskData.requesterId || null,
    taskData.startDate || null,
    taskData.dueDate || null,
    effort,
    taskData.priority || null,
    taskData.priorityId || null,
    taskData.columnId,
    taskData.boardId,
    taskData.position != null ? taskData.position : 0,
    taskData.sprintId || null,
    now,
    now
  );
}

/**
 * Update a task
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID to update
 * @param {Object} updates - Fields to update (only include fields that changed)
 * @returns {Promise<Object>} Result object with changes count
 */
export async function updateTask(db, taskId, updates) {
  const setClauses = [];
  const values = [];
  let paramIndex = 1;
  
  // Build dynamic UPDATE query
  const allowedFields = [
    'title', 'description', 'memberid', 'requesterid', 'startdate', 'duedate',
    'effort', 'priority', 'priority_id', 'columnid', 'boardid', 'position',
    'sprint_id', 'pre_boardid', 'pre_columnid'
  ];
  
  Object.entries(updates).forEach(([key, value]) => {
    // Convert camelCase to snake_case for column names
    const columnName = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    
    if (allowedFields.includes(columnName) || allowedFields.includes(key)) {
      const fieldName = allowedFields.includes(columnName) ? columnName : key;
      setClauses.push(`${fieldName} = $${paramIndex++}`);
      values.push(value);
    }
  });
  
  if (setClauses.length === 0) {
    throw new Error('No valid fields to update');
  }
  
  // Always update updated_at
  setClauses.push(`updated_at = $${paramIndex++}`);
  values.push(new Date().toISOString());
  
  // Add taskId for WHERE clause
  values.push(taskId);
  
  const query = `
    UPDATE tasks 
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  return await stmt.run(...values);
}

/**
 * Delete a task
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID to delete
 * @returns {Promise<Object>} Result object with changes count
 */
export async function deleteTask(db, taskId) {
  const query = `
    DELETE FROM tasks WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(taskId);
}

/**
 * Get task ticket by task ID
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @returns {Promise<string|null>} Ticket number or null
 */
export async function getTaskTicket(db, taskId) {
  const query = `
    SELECT ticket FROM tasks WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const result = await stmt.get(taskId);
  return result ? result.ticket : null;
}

/**
 * Generate next task ticket number
 * 
 * @param {Database} db - Database connection
 * @param {string} prefix - Ticket prefix (e.g., "TASK-")
 * @returns {Promise<string>} Next ticket number (e.g., "TASK-00033")
 */
export async function generateTaskTicket(db, prefix) {
  const query = `
    SELECT ticket FROM tasks
    WHERE ticket IS NOT NULL AND ticket LIKE $1
    ORDER BY CAST(SUBSTRING(ticket FROM $2) AS INTEGER) DESC
    LIMIT 1
  `;
  
  const pattern = `${prefix}%`;
  const prefixLength = prefix.length + 1; // +1 for the dash
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const result = await stmt.get(pattern, prefixLength);
  
  if (!result || !result.ticket) {
    return `${prefix}00001`;
  }
  
  const lastNumber = parseInt(result.ticket.substring(prefix.length + 1), 10);
  const nextNumber = lastNumber + 1;
  const paddedNumber = String(nextNumber).padStart(5, '0');
  
  return `${prefix}${paddedNumber}`;
}

/**
 * Update task positions in a column (increment positions for tasks after a certain position)
 * 
 * @param {Database} db - Database connection
 * @param {string} columnId - Column ID
 * @returns {Promise<Object>} Result object with changes count
 */
export async function incrementTaskPositions(db, columnId) {
  const query = `
    UPDATE tasks SET position = position + 1 WHERE columnid = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  return await stmt.run(columnId);
}

/**
 * Get tasks by multiple IDs with relationships
 * 
 * @param {Database} db - Database connection
 * @param {Array<string>} taskIds - Array of task IDs
 * @returns {Promise<Array>} Array of task objects with relationships
 */
export async function getTasksByIds(db, taskIds) {
  if (!taskIds || taskIds.length === 0) {
    return [];
  }
  
  // Build parameterized query with $1, $2, $3, etc.
  const placeholders = taskIds.map((_, index) => `$${index + 1}`).join(', ');
  
  const query = `
    SELECT t.*, 
           p.id as "priorityId",
           p.priority as "priorityName",
           p.color as "priorityColor",
           CASE WHEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) > 0 
                THEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) 
                ELSE NULL END as attachmentCount
    FROM tasks t
    LEFT JOIN attachments a ON a.taskid = t.id
    LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
    WHERE t.id IN (${placeholders})
    GROUP BY t.id, p.id
    ORDER BY t.position ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(...taskIds);
}

/**
 * Get tasks by board ID
 * 
 * @param {Database} db - Database connection
 * @param {string} boardId - Board ID
 * @returns {Promise<Array>} Array of tasks
 */
export async function getTasksByBoard(db, boardId) {
  const query = `
    SELECT * FROM tasks WHERE boardid = $1 ORDER BY position ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(boardId);
}

/**
 * Get tasks by sprint ID
 * 
 * @param {Database} db - Database connection
 * @param {string} sprintId - Sprint ID
 * @returns {Promise<Array>} Array of tasks
 */
export async function getTasksBySprint(db, sprintId) {
  const query = `
    SELECT * FROM tasks WHERE sprint_id = $1 ORDER BY position ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(sprintId);
}

/**
 * Get tasks by member ID
 * 
 * @param {Database} db - Database connection
 * @param {string} memberId - Member ID
 * @returns {Promise<Array>} Array of tasks
 */
export async function getTasksByMember(db, memberId) {
  const query = `
    SELECT * FROM tasks WHERE memberid = $1 ORDER BY position ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(memberId);
}

/**
 * Get task with board and column info
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @returns {Promise<Object|null>} Task with board and column info
 */
export async function getTaskWithBoardColumnInfo(db, taskId) {
  const query = `
    SELECT t.*, b.title as board_title, c.title as column_title, b.id as board_id
    FROM tasks t
    LEFT JOIN boards b ON t.boardid = b.id
    LEFT JOIN columns c ON t.columnid = c.id
    WHERE t.id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(taskId);
}

/**
 * Get task tags
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @returns {Promise<Array>} Array of tags
 */
export async function getTaskTags(db, taskId) {
  const query = `
    SELECT t.tag as name FROM task_tags tt
    JOIN tags t ON tt.tagid = t.id
    WHERE tt.taskid = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(taskId);
}

/**
 * Get remaining tasks in column (for renumbering after delete)
 * 
 * @param {Database} db - Database connection
 * @param {string} columnId - Column ID
 * @param {string} boardId - Board ID
 * @returns {Promise<Array>} Array of tasks with id and position
 */
export async function getRemainingTasksInColumn(db, columnId, boardId) {
  const query = `
    SELECT id, position FROM tasks 
    WHERE columnid = $1 AND boardid = $2 
    ORDER BY position ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(columnId, boardId);
}

/**
 * Update task position
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @param {number} position - New position
 * @returns {Promise<Object>} Result object
 */
export async function updateTaskPosition(db, taskId, position) {
  const query = `
    UPDATE tasks SET position = $1 WHERE id = $2
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  return await stmt.run(position, taskId);
}

/**
 * Renumber tasks in column sequentially from 0
 * 
 * @param {Database} db - Database connection
 * @param {Array} tasks - Array of {id, position} objects
 * @returns {Promise<void>}
 */
export async function renumberTasksInColumn(db, tasks) {
  const updateStmt = wrapQuery(db.prepare('UPDATE tasks SET position = $1 WHERE id = $2'), 'UPDATE');
  
  for (let index = 0; index < tasks.length; index++) {
    const task = tasks[index];
    if (task.position !== index) {
      await updateStmt.run(index, task.id);
    }
  }
}

/**
 * Get tasks by IDs with basic info (for validation)
 * 
 * @param {Database} db - Database connection
 * @param {Array<string>} taskIds - Array of task IDs
 * @returns {Promise<Array>} Array of tasks with basic fields
 */
export async function getTasksByIdsBasic(db, taskIds) {
  if (!taskIds || taskIds.length === 0) {
    return [];
  }
  
  const placeholders = taskIds.map((_, index) => `$${index + 1}`).join(', ');
  
  const query = `
    SELECT 
      id, 
      columnid as "columnId", 
      boardid as "boardId", 
      priority_id as "priorityId", 
      priority, 
      position, 
      title,
      memberid as "memberId",
      requesterid as "requesterId",
      ticket
    FROM tasks 
    WHERE id IN (${placeholders})
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(...taskIds);
}

/**
 * Check if task exists
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @returns {Promise<boolean>} True if task exists
 */
export async function taskExists(db, taskId) {
  const query = `
    SELECT id FROM tasks WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const result = await stmt.get(taskId);
  return !!result;
}

/**
 * Get task board ID
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @returns {Promise<string|null>} Board ID or null
 */
export async function getTaskBoardId(db, taskId) {
  const query = `
    SELECT boardid as "boardId" FROM tasks WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const result = await stmt.get(taskId);
  return result ? result.boardId : null;
}

/**
 * Update task positions in column (shift positions)
 * 
 * @param {Database} db - Database connection
 * @param {string} columnId - Column ID
 * @param {number} minPosition - Minimum position (exclusive)
 * @param {number} maxPosition - Maximum position (inclusive)
 * @param {number} shiftBy - Amount to shift (positive or negative)
 * @returns {Promise<Object>} Result object
 */
export async function shiftTaskPositions(db, columnId, minPosition, maxPosition, shiftBy) {
  if (shiftBy > 0) {
    const query = `
      UPDATE tasks SET position = position + $1 
      WHERE columnid = $2 AND position > $3 AND position <= $4
    `;
    const stmt = wrapQuery(db.prepare(query), 'UPDATE');
    return await stmt.run(shiftBy, columnId, minPosition, maxPosition);
  } else {
    const query = `
      UPDATE tasks SET position = position - $1 
      WHERE columnid = $2 AND position >= $3 AND position < $4
    `;
    const stmt = wrapQuery(db.prepare(query), 'UPDATE');
    return await stmt.run(Math.abs(shiftBy), columnId, maxPosition, minPosition);
  }
}

/**
 * Update task position and column (for reordering)
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @param {number} position - New position
 * @param {string} columnId - New column ID
 * @param {string} previousBoardId - Previous board ID
 * @param {string} previousColumnId - Previous column ID
 * @returns {Promise<Object>} Result object
 */
export async function updateTaskPositionAndColumn(db, taskId, position, columnId, previousBoardId, previousColumnId) {
  const query = `
    UPDATE tasks SET 
      position = $1, 
      columnid = $2,
      pre_boardid = $3, 
      pre_columnid = $4,
      updated_at = $5
    WHERE id = $6
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  return await stmt.run(position, columnId, previousBoardId, previousColumnId, new Date().toISOString(), taskId);
}

/**
 * Get task relationships
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @returns {Promise<Array>} Array of relationships
 */
export async function getTaskRelationships(db, taskId) {
  const query = `
    SELECT 
      tr.*,
      t1.title as task_title,
      t1.ticket as task_ticket,
      t1.boardid as task_board_id,
      t2.title as related_task_title,
      t2.ticket as related_task_ticket,
      t2.boardid as related_task_board_id,
      b1.project as task_project_id,
      b2.project as related_task_project_id
    FROM task_rels tr
    JOIN tasks t1 ON tr.task_id = t1.id
    JOIN tasks t2 ON tr.to_task_id = t2.id
    LEFT JOIN boards b1 ON t1.boardid = b1.id
    LEFT JOIN boards b2 ON t2.boardid = b2.id
    WHERE tr.task_id = $1 OR tr.to_task_id = $1
    ORDER BY tr.created_at DESC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(taskId);
}

/**
 * Check if relationship exists
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @param {string} relationship - Relationship type
 * @param {string} toTaskId - Target task ID
 * @returns {Promise<Object|null>} Relationship object or null
 */
export async function getTaskRelationship(db, taskId, relationship, toTaskId) {
  const query = `
    SELECT id FROM task_rels 
    WHERE task_id = $1 AND relationship = $2 AND to_task_id = $3
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(taskId, relationship, toTaskId);
}

/**
 * Check for opposite relationship (for cycle detection)
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @param {string} relationship - Relationship type
 * @param {string} toTaskId - Target task ID
 * @returns {Promise<Object|null>} Opposite relationship or null
 */
export async function getOppositeRelationship(db, taskId, relationship, toTaskId) {
  const oppositeMap = {
    'parent': 'child',
    'child': 'parent',
    'related': 'related'
  };
  
  const oppositeRelationship = oppositeMap[relationship] || relationship;
  
  const query = `
    SELECT id FROM task_rels 
    WHERE task_id = $1 AND relationship = $2 AND to_task_id = $3
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(toTaskId, oppositeRelationship, taskId);
}

/**
 * Create task relationship
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @param {string} relationship - Relationship type
 * @param {string} toTaskId - Target task ID
 * @returns {Promise<Object>} Result object
 */
export async function createTaskRelationship(db, taskId, relationship, toTaskId) {
  const query = `
    INSERT INTO task_rels (task_id, relationship, to_task_id)
    VALUES ($1, $2, $3)
    RETURNING *
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  return await stmt.run(taskId, relationship, toTaskId);
}

/**
 * Get task relationship by ID
 * 
 * @param {Database} db - Database connection
 * @param {string} relationshipId - Relationship ID
 * @param {string} taskId - Task ID (for validation)
 * @returns {Promise<Object|null>} Relationship object or null
 */
export async function getTaskRelationshipById(db, relationshipId, taskId) {
  const query = `
    SELECT * FROM task_rels 
    WHERE id = $1 AND task_id = $2
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(relationshipId, taskId);
}

/**
 * Delete task relationship
 * 
 * @param {Database} db - Database connection
 * @param {string} relationshipId - Relationship ID
 * @returns {Promise<Object>} Result object
 */
export async function deleteTaskRelationship(db, relationshipId) {
  const query = `DELETE FROM task_rels WHERE id = $1`;
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(relationshipId);
}

/**
 * Get available tasks for relationship (excludes current task and already related tasks)
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @returns {Promise<Array>} Array of available tasks
 */
export async function getAvailableTasksForRelationship(db, taskId) {
  const query = `
    SELECT t.id, t.title, t.ticket, c.title as status, b.project as projectid
    FROM tasks t
    LEFT JOIN columns c ON t.columnid = c.id
    LEFT JOIN boards b ON t.boardid = b.id
    WHERE t.id != $1
    AND t.id NOT IN (
      SELECT to_task_id FROM task_rels WHERE task_id = $1
      UNION
      SELECT task_id FROM task_rels WHERE to_task_id = $1
    )
    ORDER BY t.ticket ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(taskId);
}

/**
 * Get connected task IDs (for flow chart)
 * 
 * @param {Database} db - Database connection
 * @param {string} taskId - Task ID
 * @returns {Promise<Array>} Array of connected task IDs
 */
export async function getConnectedTaskIds(db, taskId) {
  const query = `
    SELECT DISTINCT 
      CASE 
        WHEN task_id = $1 THEN to_task_id 
        ELSE task_id 
      END as connected_id
    FROM task_rels 
    WHERE task_id = $1 OR to_task_id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const results = await stmt.all(taskId);
  return results.map(r => r.connected_id);
}

/**
 * Get tasks for flow chart
 * 
 * @param {Database} db - Database connection
 * @param {Array<string>} taskIds - Array of task IDs
 * @returns {Promise<Array>} Array of tasks with flow chart data
 */
export async function getTasksForFlowChart(db, taskIds) {
  if (!taskIds || taskIds.length === 0) {
    return [];
  }
  
  const placeholders = taskIds.map((_, i) => `$${i + 1}`).join(', ');
  const query = `
    SELECT 
      t.id,
      t.ticket,
      t.title,
      t.memberid,
      mem.name as memberName,
      mem.color as memberColor,
      c.title as status,
      t.priority,
      t.priority_id,
      p.priority as priority_name,
      t.startdate,
      t.duedate,
      b.project as projectid
    FROM tasks t
    LEFT JOIN members mem ON t.memberid = mem.id
    LEFT JOIN columns c ON t.columnid = c.id
    LEFT JOIN boards b ON t.boardid = b.id
    LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
    WHERE t.id IN (${placeholders})
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(...taskIds);
}

/**
 * Get relationships for flow chart
 * 
 * @param {Database} db - Database connection
 * @param {Array<string>} taskIds - Array of task IDs
 * @returns {Promise<Array>} Array of relationships
 */
export async function getRelationshipsForFlowChart(db, taskIds) {
  if (!taskIds || taskIds.length === 0) {
    return [];
  }
  
  const placeholders = taskIds.map((_, i) => `$${i + 1}`).join(', ');
  const query = `
    SELECT 
      tr.id,
      tr.task_id,
      tr.relationship,
      tr.to_task_id,
      t1.ticket as task_ticket,
      t2.ticket as related_task_ticket
    FROM task_rels tr
    JOIN tasks t1 ON tr.task_id = t1.id
    JOIN tasks t2 ON tr.to_task_id = t2.id
    WHERE tr.task_id IN (${placeholders}) AND tr.to_task_id IN (${placeholders})
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(...taskIds, ...taskIds);
}

