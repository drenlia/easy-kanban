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
import redisService from '../services/redisService.js';
import { getTenantId, getRequestDatabase } from '../middleware/tenantRouting.js';

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
      await dbTransaction(db, async () => {
        // Insert comment
        await wrapQuery(db.prepare(`
          INSERT INTO comments (id, taskId, text, authorId, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `), 'INSERT').run(
          comment.id,
          comment.taskId,
          comment.text,
          comment.authorId,
          comment.createdAt
        );
        
        // Insert attachments if any
        if (comment.attachments?.length > 0) {
          for (const attachment of comment.attachments) {
            await wrapQuery(db.prepare(`
              INSERT INTO attachments (id, commentId, name, url, type, size)
              VALUES (?, ?, ?, ?, ?, ?)
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
      const taskInfo = await wrapQuery(db.prepare(`
        SELECT t.*, b.title as board_title, c.title as column_title
        FROM tasks t
        LEFT JOIN boards b ON t.boardId = b.id
        LEFT JOIN columns c ON t.columnId = c.id
        WHERE t.id = ?
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
    
    // Get the task's board ID for Redis publishing
    const task = await wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(comment.taskId);
    
    // Fetch the complete comment with attachments from database
    // Include author info (name and color) like in tasks.js
    const createdComment = await wrapQuery(db.prepare(`
      SELECT 
        c.id,
        c.taskId,
        c.text,
        c.authorId,
        c.createdAt,
        c.updated_at as updatedAt,
        m.name as authorName,
        m.color as authorColor
      FROM comments c
      LEFT JOIN members m ON c.authorId = m.id
      WHERE c.id = ?
    `), 'SELECT').get(comment.id);
    
    if (!createdComment) {
      return res.status(500).json({ error: 'Failed to retrieve created comment' });
    }
    
    const attachments = await wrapQuery(db.prepare('SELECT id, name, url, type, size, created_at as createdAt FROM attachments WHERE commentId = ?'), 'SELECT').all(comment.id);
    createdComment.attachments = attachments || [];
    
    // Ensure taskId is included in the comment object
    if (!createdComment.taskId) {
      createdComment.taskId = comment.taskId;
    }
    
    // Publish to Redis for real-time updates
    if (task?.boardId) {
      const tenantId = getTenantId(req);
      console.log('📤 Publishing comment-created to Redis for board:', task.boardId);
      await redisService.publish('comment-created', {
        boardId: task.boardId,
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
    // Get original comment first
    const originalComment = await wrapQuery(db.prepare('SELECT * FROM comments WHERE id = ?'), 'SELECT').get(id);
    
    if (!originalComment) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    // Update comment text in database
    const result = await wrapQuery(db.prepare('UPDATE comments SET text = ? WHERE id = ?'), 'UPDATE').run(text, id);
    
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
    
    // Get the task's board ID for Redis publishing
    const task = await wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(originalComment.taskId);
    
    // Return updated comment with attachments
    // Include author info (name and color) like in tasks.js
    const updatedComment = await wrapQuery(db.prepare(`
      SELECT 
        c.id,
        c.taskId,
        c.text,
        c.authorId,
        c.createdAt,
        c.updated_at as updatedAt,
        m.name as authorName,
        m.color as authorColor
      FROM comments c
      LEFT JOIN members m ON c.authorId = m.id
      WHERE c.id = ?
    `), 'SELECT').get(id);
    
    if (!updatedComment) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    const attachments = await wrapQuery(db.prepare('SELECT id, name, url, type, size, created_at as createdAt FROM attachments WHERE commentId = ?'), 'SELECT').all(id);
    updatedComment.attachments = attachments || [];
    
    // Publish to Redis for real-time updates
    if (task?.boardId) {
      const tenantId = getTenantId(req);
      console.log('📤 Publishing comment-updated to Redis for board:', task.boardId);
      await redisService.publish('comment-updated', {
        boardId: task.boardId,
        taskId: originalComment.taskId,
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
    // Get comment details before deleting
    const commentToDelete = await wrapQuery(db.prepare('SELECT * FROM comments WHERE id = ?'), 'SELECT').get(id);
    
    if (!commentToDelete) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    // Get attachments before deleting the comment
    const attachments = await wrapQuery(db.prepare('SELECT url FROM attachments WHERE commentId = ?'), 'SELECT').all(id);

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

    // Delete the comment (cascades to attachments)
    await wrapQuery(db.prepare('DELETE FROM comments WHERE id = ?'), 'DELETE').run(id);
    
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

    // Get the task's board ID for Redis publishing
    const task = await wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(commentToDelete.taskId);
    
    // Publish to Redis for real-time updates
    if (task?.boardId) {
      const tenantId = getTenantId(req);
      console.log('📤 Publishing comment-deleted to Redis for board:', task.boardId);
      await redisService.publish('comment-deleted', {
        boardId: task.boardId,
        taskId: commentToDelete.taskId,
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
    const attachments = await wrapQuery(db.prepare(`
      SELECT 
        id,
        name,
        url,
        type,
        size
      FROM attachments
      WHERE commentId = ?
    `), 'SELECT').all(req.params.commentId);

    res.json(attachments);
  } catch (error) {
    console.error('Error fetching comment attachments:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

export default router;

