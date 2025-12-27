import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import { authenticateToken } from '../middleware/auth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { dbTransaction, isProxyDatabase } from '../utils/dbAsync.js';
import { updateStorageUsage } from '../utils/storageUtils.js';
import { logCommentActivity } from '../services/activityLogger.js';
import * as reportingLogger from '../services/reportingLogger.js';
import { COMMENT_ACTIONS } from '../constants/activityActions.js';
import notificationService from '../services/notificationService.js';
import { getTenantId, getRequestDatabase } from '../middleware/tenantRouting.js';
// MIGRATED: Import sqlManager
import { comments as commentQueries, helpers, tasks as taskQueries } from '../utils/sqlManager/index.js';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

// Create comment endpoint
router.post('/', authenticateToken, async (req, res) => {
  const comment = req.body;
  const userId = req.user.id;
  const db = getRequestDatabase(req);
  
  try {
    if (isProxyDatabase(db)) {
      // Proxy mode: Collect all queries and send as batch
      const batchQueries = [];
      
      // Add comment INSERT
      batchQueries.push({
        query: `
          INSERT INTO comments (id, taskId, text, authorId, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `,
        params: [
          comment.id,
          comment.taskId,
          comment.text,
          comment.authorId,
          comment.createdAt
        ]
      });
      
      // Add attachment INSERTs if any
      if (comment.attachments?.length > 0) {
        const attachmentQuery = `
          INSERT INTO attachments (id, commentId, name, url, type, size)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        for (const attachment of comment.attachments) {
          batchQueries.push({
            query: attachmentQuery,
            params: [
              attachment.id,
              comment.id,
              attachment.name,
              attachment.url,
              attachment.type,
              attachment.size
            ]
          });
        }
      }
      
      // Execute all inserts in a single batched transaction
      await db.executeBatchTransaction(batchQueries);
    } else {
      // Direct DB mode: Use standard transaction
      // MIGRATED: Use sqlManager to create comment
      await dbTransaction(db, async () => {
        await commentQueries.createComment(
          db,
          comment.id,
          comment.taskId,
          comment.text,
          comment.authorId,
          comment.createdAt
        );
        
        // Insert attachments if any (attachments are handled separately, not in sqlManager yet)
        if (comment.attachments?.length > 0) {
          for (const attachment of comment.attachments) {
            await wrapQuery(db.prepare(`
              INSERT INTO attachments (id, commentid, name, url, type, size)
              VALUES ($1, $2, $3, $4, $5, $6)
            `), 'INSERT').run(
              attachment.id,
              comment.id,
              attachment.name,
              attachment.url,
              attachment.type,
              attachment.size
            );
          }
        }
      });
    }
    
    // Update storage usage if attachments were added
    if (comment.attachments?.length > 0) {
      await updateStorageUsage(db);
    }
    
    // Log comment creation activity
    await logCommentActivity(
      userId,
      COMMENT_ACTIONS.CREATE,
      comment.id,
      comment.taskId,
      `added comment: "${comment.text.length > 50 ? comment.text.substring(0, 50) + '...' : comment.text}"`,
      { commentContent: comment.text, db: db, tenantId: getTenantId(req) }
    );
    
    // Log to reporting system
    try {
      const userInfo = await reportingLogger.getUserInfo(db, userId);
      // MIGRATED: Use sqlManager to get task info (simplified - reporting logger may need full task with relationships)
      // Note: This query is for reporting, so we keep it inline for now as it's specific to reporting needs
      const taskInfo = await wrapQuery(db.prepare(`
        SELECT t.*, b.title as board_title, c.title as column_title
        FROM tasks t
        LEFT JOIN boards b ON t.boardid = b.id
        LEFT JOIN columns c ON t.columnid = c.id
        WHERE t.id = $1
      `), 'SELECT').get(comment.taskId);
      
      if (userInfo && taskInfo) {
        await reportingLogger.logActivity(db, {
          eventType: 'comment_added',
          userId: userInfo.id,
          userName: userInfo.name,
          userEmail: userInfo.email,
          taskId: taskInfo.id,
          taskTitle: taskInfo.title,
          taskTicket: taskInfo.ticket,
          boardId: taskInfo.boardId,
          boardName: taskInfo.board_title,
          columnId: taskInfo.columnId,
          columnName: taskInfo.column_title,
          effortPoints: taskInfo.effort,
          priorityName: taskInfo.priority
        });
      }
    } catch (reportError) {
      console.error('Failed to log comment to reporting system:', reportError);
    }
    
    // MIGRATED: Get the task's board ID using sqlManager
    const task = await taskQueries.getTaskBoardId(db, comment.taskId);
    
    // MIGRATED: Fetch the complete comment with attachments using sqlManager
    const createdComment = await commentQueries.getCommentById(db, comment.id);
    
    if (!createdComment) {
      return res.status(500).json({ error: 'Failed to retrieve created comment' });
    }
    
    // MIGRATED: Get attachments using sqlManager
    const attachments = await helpers.getAttachmentsForComment(db, comment.id);
    createdComment.attachments = attachments || [];
    
    // Ensure taskId is included in the comment object
    if (!createdComment.taskId) {
      createdComment.taskId = comment.taskId;
    }
    
    // Publish to Redis for real-time updates
    // Note: getTaskBoardId returns boardId string or null
    if (task) {
      const tenantId = getTenantId(req);
      console.log('📤 Publishing comment-created to Redis for board:', task);
      await notificationService.publish('comment-created', {
        boardId: task,  // task is already the boardId string
        taskId: comment.taskId,
        comment: createdComment,
        timestamp: new Date().toISOString()
      }, tenantId);
      console.log('✅ Comment-created published to Redis');
    } else {
      console.warn('⚠️ Cannot publish comment-created: task boardId not found for taskId:', comment.taskId);
    }
    
    res.json(createdComment);
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// Update comment endpoint
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  const userId = req.user.id;
  const db = getRequestDatabase(req);
  
  try {
    // MIGRATED: Get original comment using sqlManager
    const originalComment = await commentQueries.getCommentSimple(db, id);
    
    if (!originalComment) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    // MIGRATED: Update comment text using sqlManager
    const result = await commentQueries.updateComment(db, id, text);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    // Log comment update activity
    await logCommentActivity(
      userId,
      COMMENT_ACTIONS.UPDATE,
      id,
      originalComment.taskId,
      `updated comment from: "${originalComment.text.length > 30 ? originalComment.text.substring(0, 30) + '...' : originalComment.text}" to: "${text.length > 30 ? text.substring(0, 30) + '...' : text}"`,
      { db: db, tenantId: getTenantId(req) }
    );
    
    // MIGRATED: Get the task's board ID using sqlManager
    const task = await taskQueries.getTaskBoardId(db, originalComment.taskid || originalComment.taskId);
    
    // MIGRATED: Return updated comment with attachments using sqlManager
    const updatedComment = await commentQueries.getCommentById(db, id);
    
    if (!updatedComment) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    // MIGRATED: Get attachments using sqlManager
    const attachments = await helpers.getAttachmentsForComment(db, id);
    updatedComment.attachments = attachments || [];
    
    // Publish to Redis for real-time updates
    // Note: getTaskBoardId returns boardId string or null
    const taskId = originalComment.taskid || originalComment.taskId;
    if (task) {
      const tenantId = getTenantId(req);
      console.log('📤 Publishing comment-updated to Redis for board:', task);
      await notificationService.publish('comment-updated', {
        boardId: task,
        taskId: taskId,
        comment: updatedComment,
        timestamp: new Date().toISOString()
      }, tenantId);
      console.log('✅ Comment-updated published to Redis');
    }
    
    res.json(updatedComment);
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

// Delete comment endpoint
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const db = getRequestDatabase(req);
  
  try {
    // MIGRATED: Get comment details before deleting using sqlManager
    const commentToDelete = await commentQueries.getCommentSimple(db, id);
    
    if (!commentToDelete) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    // MIGRATED: Get attachments before deleting the comment using sqlManager
    const attachments = await helpers.getAttachmentsForComment(db, id);

    // Get tenant-specific storage paths (set by tenant routing middleware)
    const getStoragePaths = (req) => {
      // Check req.locals first (multi-tenant mode) then req.app.locals (single-tenant mode)
      if (req.locals?.tenantStoragePaths) {
        return req.locals.tenantStoragePaths;
      }
      if (req.app.locals?.tenantStoragePaths) {
        return req.app.locals.tenantStoragePaths;
      }
      // Fallback to base paths (single-tenant mode)
      const basePath = process.env.DOCKER_ENV === 'true'
        ? '/app/server'
        : dirname(__dirname);
      return {
        attachments: path.join(basePath, 'attachments'),
        avatars: path.join(basePath, 'avatars')
      };
    };
    
    const storagePaths = getStoragePaths(req);
    
    // Delete the files from disk
    for (const attachment of attachments) {
      // Extract filename from URL (e.g., "/attachments/filename.ext" or "/api/files/attachments/filename.ext" -> "filename.ext")
      const filename = attachment.url.replace('/attachments/', '').replace('/api/files/attachments/', '');
      const filePath = path.join(storagePaths.attachments, filename);
      try {
        await fs.promises.unlink(filePath);
        console.log(`✅ Deleted file: ${filename}`);
      } catch (error) {
        console.error('Error deleting file:', error);
      }
    }

    // MIGRATED: Delete the comment using sqlManager (cascades to attachments)
    await commentQueries.deleteComment(db, id);
    
    // Update storage usage after deleting comment (which cascades to attachments)
    await updateStorageUsage(db);

    // Log comment deletion activity
    await logCommentActivity(
      userId,
      COMMENT_ACTIONS.DELETE,
      id,
      commentToDelete.taskId,
      `deleted comment: "${commentToDelete.text.length > 50 ? commentToDelete.text.substring(0, 50) + '...' : commentToDelete.text}"`,
      { db: db, tenantId: getTenantId(req) }
    );

    // MIGRATED: Get the task's board ID using sqlManager
    const taskId = commentToDelete.taskid || commentToDelete.taskId;
    const task = await taskQueries.getTaskBoardId(db, taskId);
    
    // Publish to Redis for real-time updates
    // Note: getTaskBoardId returns boardId string or null
    if (task) {
      const tenantId = getTenantId(req);
      console.log('📤 Publishing comment-deleted to Redis for board:', task);
      await notificationService.publish('comment-deleted', {
        boardId: task,
        taskId: taskId,
        commentId: id,
        timestamp: new Date().toISOString()
      }, tenantId);
      console.log('✅ Comment-deleted published to Redis');
    }

    res.json({ message: 'Comment and attachments deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Get comment attachments endpoint
router.get('/:commentId/attachments', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    // MIGRATED: Get attachments using sqlManager
    const attachments = await helpers.getAttachmentsForComment(db, req.params.commentId);

    res.json(attachments);
  } catch (error) {
    console.error('Error fetching comment attachments:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

export default router;

