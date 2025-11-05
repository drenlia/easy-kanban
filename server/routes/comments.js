import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import { authenticateToken } from '../middleware/auth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { updateStorageUsage } from '../utils/storageUtils.js';
import { logCommentActivity } from '../services/activityLogger.js';
import * as reportingLogger from '../services/reportingLogger.js';
import { COMMENT_ACTIONS } from '../constants/activityActions.js';
import redisService from '../services/redisService.js';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

// Create comment endpoint
router.post('/', authenticateToken, async (req, res) => {
  const comment = req.body;
  const userId = req.user.id;
  const db = req.app.locals.db;
  
  try {
    // Begin transaction
    db.prepare('BEGIN').run();

    try {
      // Insert comment
      const commentStmt = db.prepare(`
        INSERT INTO comments (id, taskId, text, authorId, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      commentStmt.run(
        comment.id,
        comment.taskId,
        comment.text,
        comment.authorId,
        comment.createdAt
      );
      
      // Insert attachments if any
      if (comment.attachments?.length > 0) {
        const attachmentStmt = db.prepare(`
          INSERT INTO attachments (id, commentId, name, url, type, size)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        comment.attachments.forEach(attachment => {
          attachmentStmt.run(
            attachment.id,
            comment.id,
            attachment.name,
            attachment.url,
            attachment.type,
            attachment.size
          );
        });
      }

      // Commit transaction
      db.prepare('COMMIT').run();
      
      // Update storage usage if attachments were added
      if (comment.attachments?.length > 0) {
        updateStorageUsage(db);
      }
      
      // Log comment creation activity
      await logCommentActivity(
        userId,
        COMMENT_ACTIONS.CREATE,
        comment.id,
        comment.taskId,
        `added comment: "${comment.text.length > 50 ? comment.text.substring(0, 50) + '...' : comment.text}"`,
        { commentContent: comment.text }
      );
      
      // Log to reporting system
      try {
        const userInfo = reportingLogger.getUserInfo(db, userId);
        const taskInfo = wrapQuery(db.prepare(`
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
      const task = wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(comment.taskId);
      
      // Fetch the complete comment with attachments from database
      // Include author info (name and color) like in tasks.js
      const createdComment = wrapQuery(db.prepare(`
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
      
      const attachments = wrapQuery(db.prepare('SELECT id, name, url, type, size, created_at as createdAt FROM attachments WHERE commentId = ?'), 'SELECT').all(comment.id);
      createdComment.attachments = attachments || [];
      
      // Ensure taskId is included in the comment object
      if (!createdComment.taskId) {
        createdComment.taskId = comment.taskId;
      }
      
      // Publish to Redis for real-time updates
      if (task?.boardId) {
        console.log('📤 Publishing comment-created to Redis for board:', task.boardId);
        await redisService.publish('comment-created', {
          boardId: task.boardId,
          taskId: comment.taskId,
          comment: createdComment,
          timestamp: new Date().toISOString()
        });
        console.log('✅ Comment-created published to Redis');
      } else {
        console.warn('⚠️ Cannot publish comment-created: task boardId not found for taskId:', comment.taskId);
      }
      
      res.json(createdComment);
    } catch (error) {
      // Rollback on error
      db.prepare('ROLLBACK').run();
      throw error;
    }
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
  const db = req.app.locals.db;
  
  try {
    // Get original comment first
    const originalComment = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    
    if (!originalComment) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    // Update comment text in database
    const stmt = db.prepare('UPDATE comments SET text = ? WHERE id = ?');
    const result = stmt.run(text, id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    // Log comment update activity
    await logCommentActivity(
      userId,
      COMMENT_ACTIONS.UPDATE,
      id,
      originalComment.taskId,
      `updated comment from: "${originalComment.text.length > 30 ? originalComment.text.substring(0, 30) + '...' : originalComment.text}" to: "${text.length > 30 ? text.substring(0, 30) + '...' : text}"`
    );
    
    // Get the task's board ID for Redis publishing
    const task = wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(originalComment.taskId);
    
    // Return updated comment with attachments
    // Include author info (name and color) like in tasks.js
    const updatedComment = wrapQuery(db.prepare(`
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
    
    const attachments = wrapQuery(db.prepare('SELECT id, name, url, type, size, created_at as createdAt FROM attachments WHERE commentId = ?'), 'SELECT').all(id);
    updatedComment.attachments = attachments || [];
    
    // Publish to Redis for real-time updates
    if (task?.boardId) {
      console.log('📤 Publishing comment-updated to Redis for board:', task.boardId);
      await redisService.publish('comment-updated', {
        boardId: task.boardId,
        taskId: originalComment.taskId,
        comment: updatedComment,
        timestamp: new Date().toISOString()
      });
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
  const db = req.app.locals.db;
  
  try {
    // Get comment details before deleting
    const commentToDelete = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    
    if (!commentToDelete) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    // Get attachments before deleting the comment
    const attachmentsStmt = db.prepare('SELECT url FROM attachments WHERE commentId = ?');
    const attachments = attachmentsStmt.all(id);

    // Delete the files from disk
    for (const attachment of attachments) {
      // Extract filename from URL (e.g., "/attachments/filename.ext" -> "filename.ext")
      const filename = attachment.url.replace('/attachments/', '');
      const filePath = path.join(__dirname, '..', 'attachments', filename);
      try {
        await fs.promises.unlink(filePath);
        console.log(`✅ Deleted file: ${filename}`);
      } catch (error) {
        console.error('Error deleting file:', error);
      }
    }

    // Delete the comment (cascades to attachments)
    const stmt = db.prepare('DELETE FROM comments WHERE id = ?');
    stmt.run(id);

    // Log comment deletion activity
    await logCommentActivity(
      userId,
      COMMENT_ACTIONS.DELETE,
      id,
      commentToDelete.taskId,
      `deleted comment: "${commentToDelete.text.length > 50 ? commentToDelete.text.substring(0, 50) + '...' : commentToDelete.text}"`
    );

    // Get the task's board ID for Redis publishing
    const task = wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(commentToDelete.taskId);
    
    // Publish to Redis for real-time updates
    if (task?.boardId) {
      console.log('📤 Publishing comment-deleted to Redis for board:', task.boardId);
      await redisService.publish('comment-deleted', {
        boardId: task.boardId,
        taskId: commentToDelete.taskId,
        commentId: id,
        timestamp: new Date().toISOString()
      });
      console.log('✅ Comment-deleted published to Redis');
    }

    res.json({ message: 'Comment and attachments deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Get comment attachments endpoint
router.get('/:commentId/attachments', authenticateToken, (req, res) => {
  try {
    const db = req.app.locals.db;
    const attachments = db.prepare(`
      SELECT 
        id,
        name,
        url,
        type,
        size
      FROM attachments
      WHERE commentId = ?
    `).all(req.params.commentId);

    res.json(attachments);
  } catch (error) {
    console.error('Error fetching comment attachments:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

export default router;

