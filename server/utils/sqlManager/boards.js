import { wrapQuery } from '../queryLogger.js';

/**
 * Get all boards ordered by position
 * 
 * @param {Database} db - Database connection
 * @returns {Promise<Array>} Array of board objects
 */
export async function getAllBoards(db) {
  const query = `
    SELECT * FROM boards 
    ORDER BY CAST(position AS INTEGER) ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all();
}

/**
 * Get board by ID
 * 
 * @param {Database} db - Database connection
 * @param {string} boardId - Board ID
 * @returns {Promise<Object|null>} Board object or null
 */
export async function getBoardById(db, boardId) {
  const query = `
    SELECT 
      id,
      title,
      project,
      position,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM boards 
    WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.get(boardId);
}

/**
 * Check if board with title exists (case-insensitive)
 * 
 * @param {Database} db - Database connection
 * @param {string} title - Board title
 * @param {string} excludeBoardId - Optional board ID to exclude from check
 * @returns {Promise<Object|null>} Existing board or null
 */
export async function getBoardByTitle(db, title, excludeBoardId = null) {
  if (excludeBoardId) {
    const query = `
      SELECT id FROM boards 
      WHERE LOWER(title) = LOWER($1) AND id != $2
    `;
    const stmt = wrapQuery(db.prepare(query), 'SELECT');
    return await stmt.get(title, excludeBoardId);
  } else {
    const query = `
      SELECT id FROM boards 
      WHERE LOWER(title) = LOWER($1)
    `;
    const stmt = wrapQuery(db.prepare(query), 'SELECT');
    return await stmt.get(title);
  }
}

/**
 * Get maximum position from boards
 * 
 * @param {Database} db - Database connection
 * @returns {Promise<number>} Maximum position or -1
 */
export async function getMaxBoardPosition(db) {
  // Cast to INTEGER to ensure proper numeric comparison in PostgreSQL
  // Use quoted alias to preserve case in PostgreSQL
  const query = `
    SELECT MAX(CAST(position AS INTEGER)) as "maxPos" FROM boards
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const result = await stmt.get();
  console.log(`[getMaxBoardPosition] Query result:`, result);
  // PostgreSQL returns lowercase unless quoted, so check both
  const maxPos = result?.maxPos ?? result?.maxpos ?? null;
  console.log(`[getMaxBoardPosition] maxPos value:`, maxPos, `type:`, typeof maxPos);
  
  // Also check how many boards exist to debug
  const countQuery = `SELECT COUNT(*) as count FROM boards`;
  const countStmt = wrapQuery(db.prepare(countQuery), 'SELECT');
  const countResult = await countStmt.get();
  console.log(`[getMaxBoardPosition] Total boards in database:`, countResult?.count);
  
  // Use nullish coalescing to handle PostgreSQL NULL values properly
  const finalMaxPos = maxPos ?? -1;
  console.log(`[getMaxBoardPosition] Returning:`, finalMaxPos);
  return finalMaxPos;
}

/**
 * Create a new board
 * 
 * @param {Database} db - Database connection
 * @param {string} id - Board ID
 * @param {string} title - Board title
 * @param {string} project - Project identifier
 * @param {number} position - Board position
 * @returns {Promise<Object>} Created board object
 */
export async function createBoard(db, id, title, project, position) {
  const query = `
    INSERT INTO boards (id, title, project, position) 
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  return await stmt.run(id, title, project, position);
}

/**
 * Update board title
 * 
 * @param {Database} db - Database connection
 * @param {string} id - Board ID
 * @param {string} title - New board title
 * @returns {Promise<Object>} Updated board object
 */
export async function updateBoard(db, id, title) {
  const query = `
    UPDATE boards 
    SET title = $1 
    WHERE id = $2
    RETURNING *
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  return await stmt.run(title, id);
}

/**
 * Delete board
 * 
 * @param {Database} db - Database connection
 * @param {string} id - Board ID
 * @returns {Promise<void>}
 */
export async function deleteBoard(db, id) {
  const query = `
    DELETE FROM boards 
    WHERE id = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(id);
}

/**
 * Get all boards with their positions
 * 
 * @param {Database} db - Database connection
 * @returns {Promise<Array>} Array of boards with id and position
 */
export async function getAllBoardsWithPositions(db) {
  const query = `
    SELECT id, position FROM boards 
    ORDER BY CAST(position AS INTEGER) ASC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all();
}

/**
 * Update board position
 * 
 * @param {Database} db - Database connection
 * @param {string} id - Board ID
 * @param {number} position - New position
 * @returns {Promise<void>}
 */
export async function updateBoardPosition(db, id, position) {
  const query = `
    UPDATE boards 
    SET position = $1 
    WHERE id = $2
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'UPDATE');
  return await stmt.run(position, id);
}

/**
 * Get project identifier prefix from settings
 * 
 * @param {Database} db - Database connection
 * @returns {Promise<string>} Project prefix (default: 'PROJ-')
 */
export async function getProjectPrefix(db) {
  const query = `
    SELECT value FROM settings 
    WHERE key = $1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const result = await stmt.get('DEFAULT_PROJ_PREFIX');
  return result?.value || 'PROJ-';
}

/**
 * Generate next project identifier
 * 
 * @param {Database} db - Database connection
 * @param {string} prefix - Project prefix (e.g., 'PROJ-')
 * @returns {Promise<string>} Next project identifier (e.g., 'PROJ-00001')
 */
export async function generateProjectIdentifier(db, prefix = 'PROJ-') {
  // PostgreSQL: Use SUBSTRING and CAST for numeric extraction
  const query = `
    SELECT project FROM boards 
    WHERE project IS NOT NULL AND project LIKE $1
    ORDER BY CAST(SUBSTRING(project FROM '\\d+$') AS INTEGER) DESC 
    LIMIT 1
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const result = await stmt.get(`${prefix}%`);
  
  let nextNumber = 1;
  if (result && result.project) {
    const currentNumber = parseInt(result.project.substring(prefix.length));
    if (!isNaN(currentNumber)) {
      nextNumber = currentNumber + 1;
    }
  }
  
  return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
}

/**
 * Get all task relationships for a board
 * 
 * @param {Database} db - Database connection
 * @param {string} boardId - Board ID
 * @returns {Promise<Array>} Array of task relationships
 */
export async function getBoardTaskRelationships(db, boardId) {
  // PostgreSQL converts unquoted identifiers to lowercase
  // The tasks table has boardId (camelCase) which becomes boardid (lowercase) in PostgreSQL
  // Use lowercase boardid to match PostgreSQL's behavior
  const query = `
    SELECT 
      tr.id,
      tr.task_id as "taskId",
      tr.relationship,
      tr.to_task_id as "toTaskId",
      tr.created_at as "createdAt"
    FROM task_rels tr
    JOIN tasks t1 ON tr.task_id = t1.id
    JOIN tasks t2 ON tr.to_task_id = t2.id
    WHERE t1.boardid = $1 AND t2.boardid = $1
    ORDER BY tr.created_at DESC
  `;
  
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  const result = await stmt.all(boardId);
  console.log(`🔗 [getBoardTaskRelationships] Found ${result.length} relationships for board ${boardId}`, result);
  return result;
}

