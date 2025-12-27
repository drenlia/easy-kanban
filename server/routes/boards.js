import express from 'express';
import { wrapQuery } from '../utils/queryLogger.js';
import notificationService from '../services/notificationService.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkBoardLimit } from '../middleware/licenseCheck.js';
import { getDefaultBoardColumns, getTranslator } from '../utils/i18n.js';
import { getTenantId, getRequestDatabase } from '../middleware/tenantRouting.js';
import { dbTransaction, isProxyDatabase } from '../utils/dbAsync.js';
// MIGRATED: Import sqlManager
import { boards as boardQueries, tasks as taskQueries, helpers } from '../utils/sqlManager/index.js';

const router = express.Router();

// Get all boards with columns and tasks (including tags)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    // MIGRATED: Use sqlManager
    const boards = await boardQueries.getAllBoards(db);

    const boardsWithData = await Promise.all(boards.map(async board => {
      // MIGRATED: Use sqlManager
      const columns = await helpers.getColumnsForBoard(db, board.id);
      const columnsObj = {};
      
      await Promise.all(columns.map(async column => {
        // MIGRATED: Use sqlManager to get tasks for column
        const tasksRaw = await taskQueries.getTasksForColumn(db, column.id);
        // Helper to parse JSON (handles both string and object from PostgreSQL)
        const parseJsonField = (field) => {
          // Handle null, undefined, or empty values
          if (field === null || field === undefined || field === '' || field === '[null]' || field === 'null') {
            return [];
          }
          // PostgreSQL returns JSON as objects/arrays directly
          if (Array.isArray(field)) {
            return field.filter(Boolean);
          }
          // If it's already an object (PostgreSQL JSON type), wrap in array if needed
          if (typeof field === 'object') {
            return Array.isArray(field) ? field.filter(Boolean) : [field].filter(Boolean);
          }
          // If it's a string, try to parse it (SQLite format)
          if (typeof field === 'string') {
            // Handle empty string or whitespace
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
        
        // Helper to deduplicate by id
        const deduplicateById = (arr) => {
          const seen = new Set();
          return arr.filter(item => {
            if (!item || !item.id) return false;
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          });
        };
        
        const tasks = tasksRaw.map(task => ({
          ...task,
          // CRITICAL: Use priorityName from JOIN only - never use task.priority (text field can be stale)
          // If priorityName is null, the priority was deleted or doesn't exist, so return null
          priority: task.priorityName || null, // Use JOIN value only, not task.priority
          priorityId: task.priorityId || null,
          priorityName: task.priorityName || null, // Use JOIN value only, not task.priority
          priorityColor: task.priorityColor || null,
          sprintId: task.sprint_id || null, // Map snake_case to camelCase
          createdAt: task.created_at, // Map snake_case to camelCase
          updatedAt: task.updated_at, // Map snake_case to camelCase
          comments: deduplicateById(parseJsonField(task.comments)),
          tags: deduplicateById(parseJsonField(task.tags)),
          watchers: deduplicateById(parseJsonField(task.watchers)),
          collaborators: deduplicateById(parseJsonField(task.collaborators))
        }));
        
        // Get all comment IDs from all tasks in this column
        const allCommentIds = tasks.flatMap(task => 
          task.comments.map(comment => comment.id)
        ).filter(Boolean);
        
        // Fetch all attachments for all comments in one query (more efficient)
        if (allCommentIds.length > 0) {
          // MIGRATED: Use sqlManager
          const allAttachments = await helpers.getAttachmentsForComments(db, allCommentIds);
          
          // Group attachments by commentId (normalize field name)
          const attachmentsByCommentId = {};
          allAttachments.forEach(att => {
            const commentId = att.commentId || att.commentid;
            if (!attachmentsByCommentId[commentId]) {
              attachmentsByCommentId[commentId] = [];
            }
            attachmentsByCommentId[commentId].push(att);
          });
          
          // Add attachments to each comment
          tasks.forEach(task => {
            task.comments.forEach(comment => {
              comment.attachments = attachmentsByCommentId[comment.id] || [];
            });
          });
        }
        
        columnsObj[column.id] = {
          ...column,
          tasks: tasks
        };
      }));
      
      return {
        ...board,
        columns: columnsObj
      };
    }));


    res.json(boardsWithData);
  } catch (error) {
    console.error('Error fetching boards:', error);
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToFetch', { resource: 'boards' }) });
  }
});

// Get columns for a specific board
router.get('/:boardId/columns', authenticateToken, async (req, res) => {
  const { boardId } = req.params;
  try {
    const db = getRequestDatabase(req);
    
    const t = getTranslator(db);
    
    // MIGRATED: Verify board exists using sqlManager
    const board = await boardQueries.getBoardById(db, boardId);
    if (!board) {
      return res.status(404).json({ error: t('errors.boardNotFound') });
    }
    
    // MIGRATED: Get columns using sqlManager
    const columns = await helpers.getColumnsForBoard(db, boardId);
    
    res.json(columns);
  } catch (error) {
    console.error('Error fetching board columns:', error);
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToFetchBoardColumns') });
  }
});

// Get default column names for new boards (based on APP_LANGUAGE)
router.get('/default-columns', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const defaultColumns = getDefaultBoardColumns(db);
    res.json(defaultColumns);
  } catch (error) {
    console.error('Error fetching default columns:', error);
    res.status(500).json({ error: 'Failed to fetch default columns' });
  }
});

// Create board
router.post('/', authenticateToken, checkBoardLimit, async (req, res) => {
  const { id, title } = req.body;
  try {
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    
    // MIGRATED: Check for duplicate board name using sqlManager
    const existingBoard = await boardQueries.getBoardByTitle(db, title);
    
    if (existingBoard) {
      return res.status(400).json({ error: t('errors.boardNameExists') });
    }
    
    // MIGRATED: Generate project identifier using sqlManager
    const projectPrefix = await boardQueries.getProjectPrefix(db);
    const projectIdentifier = await boardQueries.generateProjectIdentifier(db, projectPrefix);
    
    // MIGRATED: Get max position and create board using sqlManager
    const position = await boardQueries.getMaxBoardPosition(db);
    await boardQueries.createBoard(db, id, title, projectIdentifier, position + 1);
    
    // Automatically create default columns based on APP_LANGUAGE
    const defaultColumns = getDefaultBoardColumns(db);
    const tenantId = getTenantId(req);
    
    for (const [index, col] of defaultColumns.entries()) {
      const columnId = `${col.id}-${id}`;
      const isFinished = col.id === 'completed';
      const isArchived = col.id === 'archive';
      
      // MIGRATED: Create column using sqlManager
      await helpers.createColumn(db, columnId, col.title, id, index, isFinished, isArchived);
      
      // Publish column creation to Redis for real-time updates
      notificationService.publish('column-created', {
        boardId: id,
        column: { 
          id: columnId, 
          title: col.title, 
          boardId: id, 
          position: index, 
          isFinished: isFinished,  // camelCase for WebSocket
          isArchived: isArchived   // camelCase for WebSocket
        },
        updatedBy: req.user?.id || 'system',
        timestamp: new Date().toISOString()
      }, tenantId);
    }
    
    const newBoard = { id, title, project: projectIdentifier, position: position + 1 };
    
    // Publish to Redis for real-time updates
    notificationService.publish('board-created', {
      boardId: id,
      board: newBoard,
      timestamp: new Date().toISOString()
    }, tenantId);
    
    res.json(newBoard);
  } catch (error) {
    console.error('Error creating board:', error);
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToCreateBoard') });
  }
});

// MIGRATED: generateProjectIdentifier is now in sqlManager/boards.js

// Update board
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  try {
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    
    // MIGRATED: Check for duplicate board name using sqlManager
    const existingBoard = await boardQueries.getBoardByTitle(db, title, id);
    
    if (existingBoard) {
      return res.status(400).json({ error: t('errors.boardNameExists') });
    }
    
    // MIGRATED: Update board using sqlManager
    await boardQueries.updateBoard(db, id, title);
    
    // Publish to Redis for real-time updates
    const tenantId = getTenantId(req);
    await notificationService.publish('board-updated', {
      boardId: id,
      board: { id, title },
      timestamp: new Date().toISOString()
    }, tenantId);
    
    res.json({ id, title });
  } catch (error) {
    console.error('Error updating board:', error);
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToUpdateBoard') });
  }
});

// Delete board
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const db = getRequestDatabase(req);
    // MIGRATED: Delete board using sqlManager
    await boardQueries.deleteBoard(db, id);
    
    // Publish to Redis for real-time updates
    const tenantId = getTenantId(req);
    await notificationService.publish('board-deleted', {
      boardId: id,
      timestamp: new Date().toISOString()
    }, tenantId);
    
    res.json({ message: 'Board deleted successfully' });
  } catch (error) {
    console.error('Error deleting board:', error);
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToDeleteBoard') });
  }
});

// Reorder boards
router.post('/reorder', authenticateToken, async (req, res) => {
  const { boardId, newPosition } = req.body;
  try {
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    // MIGRATED: Get board using sqlManager
    const currentBoard = await boardQueries.getBoardById(db, boardId);
    if (!currentBoard) {
      return res.status(404).json({ error: t('errors.boardNotFound') });
    }

    // MIGRATED: Get all boards with positions using sqlManager
    const allBoards = await boardQueries.getAllBoardsWithPositions(db);

    // Reset all positions to simple integers (0, 1, 2, 3, etc.)
    // Now get the normalized positions and find the target and dragged boards
    const normalizedBoards = allBoards.map((board, index) => ({ ...board, position: index }));
    const currentIndex = normalizedBoards.findIndex(b => b.id === boardId);
    
    if (isProxyDatabase(db)) {
      // Proxy mode: Collect all queries and send as batch
      const batchQueries = [];
      const updateQuery = 'UPDATE boards SET position = ? WHERE id = ?';
      
      // Reset all positions
      for (let index = 0; index < allBoards.length; index++) {
        batchQueries.push({
          query: updateQuery,
          params: [index, allBoards[index].id]
        });
      }
      
      // Swap positions if needed
      if (currentIndex !== -1 && currentIndex !== newPosition) {
        const targetBoard = normalizedBoards[newPosition];
        if (targetBoard) {
          batchQueries.push({
            query: updateQuery,
            params: [newPosition, boardId]
          });
          batchQueries.push({
            query: updateQuery,
            params: [currentIndex, targetBoard.id]
          });
        }
      }
      
      // Execute all updates in a single batched transaction
      await db.executeBatchTransaction(batchQueries);
    } else {
      // Direct DB mode: Use standard transaction
      await dbTransaction(db, async () => {
        for (let index = 0; index < allBoards.length; index++) {
          // MIGRATED: Update board position using sqlManager
          await boardQueries.updateBoardPosition(db, allBoards[index].id, index);
        }

        if (currentIndex !== -1 && currentIndex !== newPosition) {
          // Simple swap: just swap the two positions
          const targetBoard = normalizedBoards[newPosition];
          if (targetBoard) {
            // MIGRATED: Update board positions using sqlManager
            await boardQueries.updateBoardPosition(db, boardId, newPosition);
            await boardQueries.updateBoardPosition(db, targetBoard.id, currentIndex);
          }
        }
      });
    }

    // Publish to Redis for real-time updates
    const tenantId = getTenantId(req);
    await notificationService.publish('board-reordered', {
      boardId: boardId,
      newPosition: newPosition,
      timestamp: new Date().toISOString()
    }, tenantId);

    res.json({ message: 'Board reordered successfully' });
  } catch (error) {
    console.error('Error reordering board:', error);
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToReorderBoard') });
  }
});

// Get all task relationships for a board
router.get('/:boardId/relationships', authenticateToken, async (req, res) => {
  const { boardId } = req.params;
  try {
    const db = getRequestDatabase(req);
    
    // MIGRATED: Get all relationships for tasks in this board using sqlManager
    const relationships = await boardQueries.getBoardTaskRelationships(db, boardId);
    
    res.json(relationships);
  } catch (error) {
    console.error('Error fetching board relationships:', error);
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    res.status(500).json({ error: t('errors.failedToFetchBoardRelationships') });
  }
});

export default router;
