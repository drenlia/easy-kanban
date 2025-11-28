import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { authenticateToken } from '../middleware/auth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { dbTransaction, isProxyDatabase } from '../utils/dbAsync.js';
import { logActivity } from '../services/activityLogger.js';
import { TAG_ACTIONS } from '../constants/activityActions.js';
import * as reportingLogger from '../services/reportingLogger.js';
import redisService from '../services/redisService.js';
import { updateStorageUsage } from '../utils/storageUtils.js';
import { getTenantId, getRequestDatabase } from '../middleware/tenantRouting.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const router = express.Router();

// Task-Tag association endpoints
router.get('/:taskId/tags', authenticateToken, async (req, res) => {
  const { taskId } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    const taskTags = await wrapQuery(db.prepare(`
      SELECT t.* FROM tags t
      JOIN task_tags tt ON t.id = tt.tagId
      WHERE tt.taskId = ?
      ORDER BY t.tag ASC
    `), 'SELECT').all(taskId);
    
    res.json(taskTags);
  } catch (error) {
    console.error('Error fetching task tags:', error);
    res.status(500).json({ error: 'Failed to fetch task tags' });
  }
});

router.post('/:taskId/tags/:tagId', authenticateToken, async (req, res) => {
  const { taskId, tagId } = req.params;
  const userId = req.user?.id || 'system';
  const db = getRequestDatabase(req);
  
  try {
    // Check if association already exists
    const existing = await wrapQuery(db.prepare('SELECT id FROM task_tags WHERE taskId = ? AND tagId = ?'), 'SELECT').get(taskId, tagId);
    
    if (existing) {
      return res.status(409).json({ error: 'Tag already associated with this task' });
    }
    
    // Get tag and task details for logging
    const tag = await wrapQuery(db.prepare('SELECT tag FROM tags WHERE id = ?'), 'SELECT').get(tagId);
    const task = await wrapQuery(db.prepare('SELECT title, columnId, boardId FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
    
    await wrapQuery(db.prepare('INSERT INTO task_tags (taskId, tagId) VALUES (?, ?)'), 'INSERT').run(taskId, tagId);
    
    // Log tag association activity
    if (tag && task) {
      await logActivity(
        userId,
        TAG_ACTIONS.ASSOCIATE,
        `associated tag "${tag.tag}" with task "${task.title}"`,
        {
          taskId: taskId,
          tagId: parseInt(tagId),
          columnId: task.columnId,
          boardId: task.boardId,
          tenantId: getTenantId(req),
          db: db
        }
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
        `), 'SELECT').get(taskId);
        
        if (userInfo && taskInfo) {
          await reportingLogger.logActivity(db, {
            eventType: 'tag_added',
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
            priorityName: taskInfo.priority,
            metadata: { tagName: tag.tag }
          });
        }
      } catch (reportError) {
        console.error('Failed to log tag to reporting system:', reportError);
      }
    }
    
    // Publish to Redis for real-time updates
    if (task?.boardId) {
      const tenantId = getTenantId(req);
      console.log('📤 Publishing task-tag-added to Redis for board:', task.boardId);
      await redisService.publish('task-tag-added', {
        boardId: task.boardId,
        taskId: taskId,
        tagId: parseInt(tagId),
        tag: tag,
        timestamp: new Date().toISOString()
      }, tenantId);
      console.log('✅ Task-tag-added published to Redis');
    }
    
    res.json({ message: 'Tag added to task successfully' });
  } catch (error) {
    console.error('Error adding tag to task:', error);
    res.status(500).json({ error: 'Failed to add tag to task' });
  }
});

router.delete('/:taskId/tags/:tagId', authenticateToken, async (req, res) => {
  const { taskId, tagId } = req.params;
  const userId = req.user?.id || 'system';
  const db = getRequestDatabase(req);
  
  try {
    // Get tag and task details for logging before deletion
    const tag = await wrapQuery(db.prepare('SELECT tag FROM tags WHERE id = ?'), 'SELECT').get(tagId);
    const task = await wrapQuery(db.prepare('SELECT title, columnId, boardId FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
    
    const result = await wrapQuery(db.prepare('DELETE FROM task_tags WHERE taskId = ? AND tagId = ?'), 'DELETE').run(taskId, tagId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Tag association not found' });
    }
    
    // Log tag disassociation activity
    if (tag && task) {
      await logActivity(
        userId,
        TAG_ACTIONS.DISASSOCIATE,
        `removed tag "${tag.tag}" from task "${task.title}"`,
        {
          taskId: taskId,
          tagId: parseInt(tagId),
          columnId: task.columnId,
          boardId: task.boardId,
          tenantId: getTenantId(req),
          db: db
        }
      );
    }
    
    // Publish to Redis for real-time updates
    if (task?.boardId) {
      const tenantId = getTenantId(req);
      console.log('📤 Publishing task-tag-removed to Redis for board:', task.boardId);
      await redisService.publish('task-tag-removed', {
        boardId: task.boardId,
        taskId: taskId,
        tagId: parseInt(tagId),
        tag: tag,
        timestamp: new Date().toISOString()
      }, tenantId);
      console.log('✅ Task-tag-removed published to Redis');
    }
    
    res.json({ message: 'Tag removed from task successfully' });
  } catch (error) {
    console.error('Error removing tag from task:', error);
    res.status(500).json({ error: 'Failed to remove tag from task' });
  }
});

// Task-Watchers association endpoints
router.get('/:taskId/watchers', authenticateToken, async (req, res) => {
  const { taskId } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    const watchers = await wrapQuery(db.prepare(`
      SELECT m.* FROM members m
      JOIN watchers w ON m.id = w.memberId
      WHERE w.taskId = ?
      ORDER BY m.name ASC
    `), 'SELECT').all(taskId);
    
    res.json(watchers);
  } catch (error) {
    console.error('Error fetching task watchers:', error);
    res.status(500).json({ error: 'Failed to fetch task watchers' });
  }
});

router.post('/:taskId/watchers/:memberId', authenticateToken, async (req, res) => {
  const { taskId, memberId } = req.params;
  const userId = req.user?.id || 'system';
  const db = getRequestDatabase(req);
  
  try {
    // Check if association already exists
    const existing = await wrapQuery(db.prepare('SELECT id FROM watchers WHERE taskId = ? AND memberId = ?'), 'SELECT').get(taskId, memberId);
    
    if (existing) {
      return res.status(409).json({ error: 'Member is already watching this task' });
    }
    
    await wrapQuery(db.prepare('INSERT INTO watchers (taskId, memberId) VALUES (?, ?)'), 'INSERT').run(taskId, memberId);
    
    // Log to reporting system
    try {
      const userInfo = await reportingLogger.getUserInfo(db, userId);
      const taskInfo = await wrapQuery(db.prepare(`
        SELECT t.*, b.title as board_title, c.title as column_title
        FROM tasks t
        LEFT JOIN boards b ON t.boardId = b.id
        LEFT JOIN columns c ON t.columnId = c.id
        WHERE t.id = ?
      `), 'SELECT').get(taskId);
      
      if (userInfo && taskInfo) {
        await reportingLogger.logActivity(db, {
          eventType: 'watcher_added',
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
      console.error('Failed to log watcher to reporting system:', reportError);
    }
    
    res.json({ message: 'Watcher added to task successfully' });
  } catch (error) {
    console.error('Error adding watcher to task:', error);
    res.status(500).json({ error: 'Failed to add watcher to task' });
  }
});

router.delete('/:taskId/watchers/:memberId', authenticateToken, async (req, res) => {
  const { taskId, memberId } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    const result = await wrapQuery(db.prepare('DELETE FROM watchers WHERE taskId = ? AND memberId = ?'), 'DELETE').run(taskId, memberId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Watcher association not found' });
    }
    
    res.json({ message: 'Watcher removed from task successfully' });
  } catch (error) {
    console.error('Error removing watcher from task:', error);
    res.status(500).json({ error: 'Failed to remove watcher from task' });
  }
});

// Task-Collaborators association endpoints
router.get('/:taskId/collaborators', authenticateToken, async (req, res) => {
  const { taskId } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    const collaborators = await wrapQuery(db.prepare(`
      SELECT m.* FROM members m
      JOIN collaborators c ON m.id = c.memberId
      WHERE c.taskId = ?
      ORDER BY m.name ASC
    `), 'SELECT').all(taskId);
    
    res.json(collaborators);
  } catch (error) {
    console.error('Error fetching task collaborators:', error);
    res.status(500).json({ error: 'Failed to fetch task collaborators' });
  }
});

router.post('/:taskId/collaborators/:memberId', authenticateToken, async (req, res) => {
  const { taskId, memberId } = req.params;
  const userId = req.user?.id || 'system';
  const db = getRequestDatabase(req);
  
  try {
    // Check if association already exists
    const existing = await wrapQuery(db.prepare('SELECT id FROM collaborators WHERE taskId = ? AND memberId = ?'), 'SELECT').get(taskId, memberId);
    
    if (existing) {
      return res.status(409).json({ error: 'Member is already collaborating on this task' });
    }
    
    await wrapQuery(db.prepare('INSERT INTO collaborators (taskId, memberId) VALUES (?, ?)'), 'INSERT').run(taskId, memberId);
    
    // Log to reporting system
    try {
      const userInfo = await reportingLogger.getUserInfo(db, userId);
      const taskInfo = await wrapQuery(db.prepare(`
        SELECT t.*, b.title as board_title, c.title as column_title
        FROM tasks t
        LEFT JOIN boards b ON t.boardId = b.id
        LEFT JOIN columns c ON t.columnId = c.id
        WHERE t.id = ?
      `), 'SELECT').get(taskId);
      
      if (userInfo && taskInfo) {
        await reportingLogger.logActivity(db, {
          eventType: 'collaborator_added',
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
      console.error('Failed to log collaborator to reporting system:', reportError);
    }
    
    res.json({ message: 'Collaborator added to task successfully' });
  } catch (error) {
    console.error('Error adding collaborator to task:', error);
    res.status(500).json({ error: 'Failed to add collaborator to task' });
  }
});

router.delete('/:taskId/collaborators/:memberId', authenticateToken, async (req, res) => {
  const { taskId, memberId } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    const result = await wrapQuery(db.prepare('DELETE FROM collaborators WHERE taskId = ? AND memberId = ?'), 'DELETE').run(taskId, memberId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Collaborator association not found' });
    }
    
    res.json({ message: 'Collaborator removed from task successfully' });
  } catch (error) {
    console.error('Error removing collaborator from task:', error);
    res.status(500).json({ error: 'Failed to remove collaborator from task' });
  }
});

// Task-Attachments association endpoints
router.get('/:taskId/attachments', authenticateToken, async (req, res) => {
  const { taskId } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    const attachments = await wrapQuery(db.prepare(`
      SELECT id, name, url, type, size, created_at
      FROM attachments 
      WHERE taskId = ?
      ORDER BY created_at DESC
    `), 'SELECT').all(taskId);
    
    res.json(attachments);
  } catch (error) {
    console.error('Error fetching task attachments:', error);
    res.status(500).json({ error: 'Failed to fetch task attachments' });
  }
});

router.post('/:taskId/attachments', authenticateToken, async (req, res) => {
  const { taskId } = req.params;
  const { attachments } = req.body;
  const userId = req.user.id;
  const db = getRequestDatabase(req);
  
  try {
    const insertedAttachments = [];
    
    if (attachments?.length > 0) {
      if (isProxyDatabase(db)) {
        // Proxy mode: Collect all queries and send as batch
        const batchQueries = [];
        const insertQuery = `
          INSERT INTO attachments (id, taskId, name, url, type, size)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        for (const attachment of attachments) {
          batchQueries.push({
            query: insertQuery,
            params: [
              attachment.id,
              taskId,
              attachment.name,
              attachment.url,
              attachment.type,
              attachment.size
            ]
          });
          insertedAttachments.push(attachment);
        }
        
        // Execute all inserts in a single batched transaction
        await db.executeBatchTransaction(batchQueries);
      } else {
        // Direct DB mode: Use standard transaction
        await dbTransaction(db, async () => {
          for (const attachment of attachments) {
            await wrapQuery(db.prepare(`
              INSERT INTO attachments (id, taskId, name, url, type, size)
              VALUES (?, ?, ?, ?, ?, ?)
            `), 'INSERT').run(
              attachment.id,
              taskId,
              attachment.name,
              attachment.url,
              attachment.type,
              attachment.size
            );
            insertedAttachments.push(attachment);
          }
        });
      }
    }
    
    // Update storage usage after adding attachments
    if (insertedAttachments.length > 0) {
      await updateStorageUsage(db);
    }
    
    // Get the task's board ID and fetch complete task data for Redis publishing
    const task = await wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
    
    // Publish to Redis for real-time updates
    if (task?.boardId && insertedAttachments.length > 0) {
        // Fetch complete task with all relationships including updated attachmentCount
        const taskWithRelationships = await wrapQuery(
          db.prepare(`
            SELECT t.*, 
                   CASE WHEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) > 0 
                        THEN COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN a.id END) 
                        ELSE NULL END as attachmentCount,
                   json_group_array(
                     DISTINCT CASE WHEN c.id IS NOT NULL THEN json_object(
                       'id', c.id,
                       'text', c.text,
                       'authorId', c.authorId,
                       'createdAt', c.createdAt,
                       'updated_at', c.updated_at,
                       'taskId', c.taskId,
                       'authorName', comment_author.name,
                       'authorColor', comment_author.color
                     ) ELSE NULL END
                   ) as comments,
                   json_group_array(
                     DISTINCT CASE WHEN tag.id IS NOT NULL THEN json_object(
                       'id', tag.id,
                       'tag', tag.tag,
                       'description', tag.description,
                       'color', tag.color
                     ) ELSE NULL END
                   ) as tags,
                   json_group_array(
                     DISTINCT CASE WHEN watcher.id IS NOT NULL THEN json_object(
                       'id', watcher.id,
                       'name', watcher.name,
                       'color', watcher.color
                     ) ELSE NULL END
                   ) as watchers,
                   json_group_array(
                     DISTINCT CASE WHEN collaborator.id IS NOT NULL THEN json_object(
                       'id', collaborator.id,
                       'name', collaborator.name,
                       'color', collaborator.color
                     ) ELSE NULL END
                   ) as collaborators
            FROM tasks t
            LEFT JOIN attachments a ON a.taskId = t.id AND a.commentId IS NULL
            LEFT JOIN comments c ON c.taskId = t.id
            LEFT JOIN members comment_author ON comment_author.id = c.authorId
            LEFT JOIN task_tags tt ON tt.taskId = t.id
            LEFT JOIN tags tag ON tag.id = tt.tagId
            LEFT JOIN watchers w ON w.taskId = t.id
            LEFT JOIN members watcher ON watcher.id = w.memberId
            LEFT JOIN collaborators col ON col.taskId = t.id
            LEFT JOIN members collaborator ON collaborator.id = col.memberId
            WHERE t.id = ?
            GROUP BY t.id
          `),
          'SELECT'
        ).get(taskId);
        
        if (taskWithRelationships) {
          // Parse JSON arrays and handle null values
          taskWithRelationships.comments = taskWithRelationships.comments === '[null]' || !taskWithRelationships.comments 
            ? [] 
            : JSON.parse(taskWithRelationships.comments).filter(Boolean);
          
          // Get attachments for all comments in one batch query (fixes N+1 problem)
          if (taskWithRelationships.comments.length > 0) {
            const commentIds = taskWithRelationships.comments.map(c => c.id).filter(Boolean);
            if (commentIds.length > 0) {
              const placeholders = commentIds.map(() => '?').join(',');
              const allAttachments = await wrapQuery(db.prepare(`
                SELECT commentId, id, name, url, type, size, created_at as createdAt
                FROM attachments
                WHERE commentId IN (${placeholders})
              `), 'SELECT').all(...commentIds);
              
              // Group attachments by commentId
              const attachmentsByCommentId = new Map();
              allAttachments.forEach(att => {
                if (!attachmentsByCommentId.has(att.commentId)) {
                  attachmentsByCommentId.set(att.commentId, []);
                }
                attachmentsByCommentId.get(att.commentId).push(att);
              });
              
              // Assign attachments to each comment
              taskWithRelationships.comments.forEach(comment => {
                comment.attachments = attachmentsByCommentId.get(comment.id) || [];
              });
            }
          }
          
          taskWithRelationships.tags = taskWithRelationships.tags === '[null]' || !taskWithRelationships.tags 
            ? [] 
            : JSON.parse(taskWithRelationships.tags).filter(Boolean);
          taskWithRelationships.watchers = taskWithRelationships.watchers === '[null]' || !taskWithRelationships.watchers 
            ? [] 
            : JSON.parse(taskWithRelationships.watchers).filter(Boolean);
          taskWithRelationships.collaborators = taskWithRelationships.collaborators === '[null]' || !taskWithRelationships.collaborators 
            ? [] 
            : JSON.parse(taskWithRelationships.collaborators).filter(Boolean);
          
          // Convert snake_case to camelCase
          const taskResponse = {
            ...taskWithRelationships,
            sprintId: taskWithRelationships.sprint_id || null,
            createdAt: taskWithRelationships.created_at,
            updatedAt: taskWithRelationships.updated_at
          };
          
          // Publish task-updated event with complete task data (includes updated attachmentCount)
          const tenantId = getTenantId(req);
          await redisService.publish('task-updated', {
            boardId: task.boardId,
            task: {
              ...taskResponse,
              updatedBy: userId
            },
            timestamp: new Date().toISOString()
          }, tenantId);
        }
        
        // Also publish task-attachments-added for any handlers that might need it
        const tenantId = getTenantId(req);
        console.log('📤 Publishing task-attachments-added to Redis for board:', task.boardId);
        await redisService.publish('task-attachments-added', {
          boardId: task.boardId,
          taskId: taskId,
          attachments: insertedAttachments,
          timestamp: new Date().toISOString()
        }, tenantId);
        console.log('✅ Task-attachments-added published to Redis');
      }
    
    res.json({ 
      message: 'Attachments added successfully',
      attachments: insertedAttachments
    });
  } catch (error) {
    console.error('Error adding attachments to task:', error);
    res.status(500).json({ error: 'Failed to add attachments to task' });
  }
});

// Note: Attachment deletion is handled by /api/attachments/:id in routes/files.js
// This endpoint was removed to avoid duplication

export default router;

