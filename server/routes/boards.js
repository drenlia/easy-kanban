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

    // OPTIMIZATION: Batch fetch all columns for all boards first
    const allBoardIds = boards.map(b => b.id);
    const allColumns = allBoardIds.length > 0 
      ? await helpers.getColumnsForAllBoards(db, allBoardIds)
      : [];
    
    // Group columns by boardId
    const columnsByBoardId = {};
    allColumns.forEach(column => {
      if (!columnsByBoardId[column.boardId]) {
        columnsByBoardId[column.boardId] = [];
      }
      columnsByBoardId[column.boardId].push(column);
    });
    
    // OPTIMIZATION: Batch fetch all tasks for all columns
    const allColumnIds = allColumns.map(c => c.id);
    const allTasks = allColumnIds.length > 0
      ? await taskQueries.getTasksForColumns(db, allColumnIds)
      : [];
    
    // Group tasks by columnId
    const tasksByColumnId = {};
    allTasks.forEach(task => {
      if (!tasksByColumnId[task.columnId]) {
        tasksByColumnId[task.columnId] = [];
      }
      tasksByColumnId[task.columnId].push(task);
    });
    
    // Collect all comment IDs for batch attachment fetch
    const allCommentIds = allTasks.flatMap(task => {
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
      const comments = parseJsonField(task.comments);
      return comments.map(c => c.id).filter(Boolean);
    });
    
    // OPTIMIZATION: Batch fetch all attachments for all comments in one query
    const allAttachments = allCommentIds.length > 0
      ? await helpers.getAttachmentsForComments(db, allCommentIds)
      : [];
    
    // Group attachments by commentId
    const attachmentsByCommentId = {};
    allAttachments.forEach(att => {
      const commentId = att.commentId || att.commentid;
      if (!attachmentsByCommentId[commentId]) {
        attachmentsByCommentId[commentId] = [];
      }
      attachmentsByCommentId[commentId].push(att);
    });
    
    // Helper functions for processing
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
    
    const deduplicateById = (arr) => {
      const seen = new Set();
      return arr.filter(item => {
        if (!item || !item.id) return false;
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    };
    
    // Process boards with pre-fetched data
    const boardsWithData = boards.map(board => {
      const columns = columnsByBoardId[board.id] || [];
      const columnsObj = {};
      
      columns.forEach(column => {
        const tasksRaw = tasksByColumnId[column.id] || [];
        
        const tasks = tasksRaw.map(task => ({
          ...task,
          priority: task.priorityName || null,
          priorityId: task.priorityId || null,
          priorityName: task.priorityName || null,
          priorityColor: task.priorityColor || null,
          sprintId: task.sprint_id || null,
          createdAt: task.created_at,
          updatedAt: task.updated_at,
          comments: deduplicateById(parseJsonField(task.comments)).map(comment => ({
            ...comment,
            attachments: attachmentsByCommentId[comment.id] || []
          })),
          tags: deduplicateById(parseJsonField(task.tags)),
          watchers: deduplicateById(parseJsonField(task.watchers)),
          collaborators: deduplicateById(parseJsonField(task.collaborators))
        }));
        
        columnsObj[column.id] = {
          ...column,
          tasks: tasks
        };
      });
      
      return {
        ...board,
        columns: columnsObj
      };
    });


    res.json(boardsWithData);
  } catch (error) {
    console.error('Error fetching boards:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToFetch', { resource: 'boards' }) });
  }
});

// Get columns for a specific board
router.get('/:boardId/columns', authenticateToken, async (req, res) => {
  const { boardId } = req.params;
  try {
    const db = getRequestDatabase(req);
    
    const t = await getTranslator(db);
    
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
    const t = await getTranslator(db);
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
    const t = await getTranslator(db);
    
    // MIGRATED: Check for duplicate board name using sqlManager
    const existingBoard = await boardQueries.getBoardByTitle(db, title);
    
    if (existingBoard) {
      return res.status(400).json({ error: t('errors.boardNameExists') });
    }
    
    // MIGRATED: Generate project identifier using sqlManager
    const projectPrefix = await boardQueries.getProjectPrefix(db);
    const projectIdentifier = await boardQueries.generateProjectIdentifier(db, projectPrefix);
    
    // MIGRATED: Get max position and create board using sqlManager
    const maxPosition = await boardQueries.getMaxBoardPosition(db);
    // Always add 1 to max position (getMaxBoardPosition returns -1 if no boards exist, so -1 + 1 = 0)
    const position = maxPosition + 1;
    console.log(`[Board Creation] Creating board "${title}" (${id})`);
    console.log(`[Board Creation] maxPosition: ${maxPosition}, calculated position: ${position}`);
    console.log(`[Board Creation] position type: ${typeof position}, value: ${position}`);
    await boardQueries.createBoard(db, id, title, projectIdentifier, position);
    
    // Verify the board was created with the correct position
    const createdBoard = await boardQueries.getBoardById(db, id);
    console.log(`[Board Creation] Board created. Retrieved position from DB: ${createdBoard?.position} (type: ${typeof createdBoard?.position})`);
    
    // Automatically create default columns based on APP_LANGUAGE
    const defaultColumns = await getDefaultBoardColumns(db);
    const tenantId = getTenantId(req);
    
    for (const [index, col] of defaultColumns.entries()) {
      const columnId = `${col.id}-${id}`;
      const isFinished = col.id === 'completed';
      const isArchived = col.id === 'archive';
      
      // Check if column already exists (in case of partial board creation from previous attempt)
      const existingColumn = await helpers.getColumnById(db, columnId);
      if (existingColumn) {
        console.warn(`Column ${columnId} already exists, skipping creation`);
        continue;
      }
      
      // MIGRATED: Create column using sqlManager
      try {
        await helpers.createColumn(db, columnId, col.title, id, index, isFinished, isArchived);
      } catch (error) {
        // Handle duplicate key errors gracefully (race condition or retry)
        if (error.code === '23505' || error.message?.includes('duplicate key')) {
          console.warn(`Column ${columnId} already exists (duplicate key), skipping creation`);
          continue;
        }
        // Re-throw other errors
        throw error;
      }
      
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
    
    const newBoard = { id, title, project: projectIdentifier, position };
    console.log(`[Board Creation] Sending response with board:`, JSON.stringify(newBoard, null, 2));
    console.log(`[Board Creation] Publishing board-created event with position: ${position}`);
    
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
    const t = await getTranslator(db);
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
    const t = await getTranslator(db);
    
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
    const t = await getTranslator(db);
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
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToDeleteBoard') });
  }
});

// Reorder boards
router.post('/reorder', authenticateToken, async (req, res) => {
  const { boardId, newPosition } = req.body;
  try {
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    console.log(`[Board Reorder] boardId: ${boardId}, newPosition: ${newPosition}`);
    // MIGRATED: Get board using sqlManager
    const currentBoard = await boardQueries.getBoardById(db, boardId);
    if (!currentBoard) {
      return res.status(404).json({ error: t('errors.boardNotFound') });
    }

    // MIGRATED: Get all boards with positions using sqlManager
    const allBoards = await boardQueries.getAllBoardsWithPositions(db);

    // Find the current index of the board being moved
    const currentIndex = allBoards.findIndex(b => b.id === boardId);
    
    if (currentIndex === -1) {
      return res.status(404).json({ error: t('errors.boardNotFound') });
    }
    
    // Only proceed if the position is actually changing
    if (currentIndex === newPosition) {
      return res.json({ message: 'Board position unchanged' });
    }
    
    // Normalize positions to ensure they're sequential (0, 1, 2, 3, etc.)
    // This handles any gaps or inconsistencies in positions
    const normalizedBoards = allBoards.map((board, index) => ({ ...board, position: index }));
    const normalizedCurrentIndex = normalizedBoards.findIndex(b => b.id === boardId);
    
    if (isProxyDatabase(db)) {
      // Proxy mode: Collect all queries and send as batch
      const batchQueries = [];
      const updateQuery = 'UPDATE boards SET position = ? WHERE id = ?';
      
      // Only reset positions if there are gaps or inconsistencies
      // Check if positions need normalization
      const needsNormalization = allBoards.some((board, index) => {
        const pos = typeof board.position === 'number' ? board.position : parseInt(board.position) || 0;
        return pos !== index;
      });
      
      if (needsNormalization) {
        // Reset all positions to sequential integers
        for (let index = 0; index < allBoards.length; index++) {
          batchQueries.push({
            query: updateQuery,
            params: [index, allBoards[index].id]
          });
        }
      }
      
      // Swap positions if needed
      if (normalizedCurrentIndex !== -1 && normalizedCurrentIndex !== newPosition) {
        const targetBoard = normalizedBoards[newPosition];
        if (targetBoard) {
          // If we didn't normalize, we need to update the specific positions
          if (!needsNormalization) {
            batchQueries.push({
              query: updateQuery,
              params: [newPosition, boardId]
            });
            batchQueries.push({
              query: updateQuery,
              params: [normalizedCurrentIndex, targetBoard.id]
            });
          } else {
            // Positions were already reset, just swap the two
            batchQueries.push({
              query: updateQuery,
              params: [newPosition, boardId]
            });
            batchQueries.push({
              query: updateQuery,
              params: [normalizedCurrentIndex, targetBoard.id]
            });
          }
        }
      }
      
      // Execute all updates in a single batched transaction
      await db.executeBatchTransaction(batchQueries);
    } else {
      // Direct DB mode: Use standard transaction
      await dbTransaction(db, async () => {
        // Check if positions need normalization
        const needsNormalization = allBoards.some((board, index) => {
          const pos = typeof board.position === 'number' ? board.position : parseInt(board.position) || 0;
          return pos !== index;
        });
        
        if (needsNormalization) {
          // Reset all positions to sequential integers
          for (let index = 0; index < allBoards.length; index++) {
            await boardQueries.updateBoardPosition(db, allBoards[index].id, index);
          }
        }

        // Swap positions if needed
        if (normalizedCurrentIndex !== -1 && normalizedCurrentIndex !== newPosition) {
          const targetBoard = normalizedBoards[newPosition];
          if (targetBoard) {
            if (!needsNormalization) {
              // Just swap the two positions
              await boardQueries.updateBoardPosition(db, boardId, newPosition);
              await boardQueries.updateBoardPosition(db, targetBoard.id, normalizedCurrentIndex);
            } else {
              // Positions were reset, swap the two
              await boardQueries.updateBoardPosition(db, boardId, newPosition);
              await boardQueries.updateBoardPosition(db, targetBoard.id, normalizedCurrentIndex);
            }
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
    const t = await getTranslator(db);
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
    const t = await getTranslator(db);
    res.status(500).json({ error: t('errors.failedToFetchBoardRelationships') });
  }
});

export default router;
