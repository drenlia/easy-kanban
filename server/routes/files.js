import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { authenticateToken, JWT_SECRET } from '../middleware/auth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { updateStorageUsage } from '../utils/storageUtils.js';
import redisService from '../services/redisService.js';
import { isMultiTenant, getRequestDatabase } from '../middleware/tenantRouting.js';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

// Get storage paths (tenant-aware in multi-tenant mode, fallback to base paths)
const getStoragePaths = (req) => {
  // Use tenant storage paths if available (set by tenant routing middleware)
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

// Helper function to determine content type
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const contentTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  return contentTypes[ext] || 'application/octet-stream';
}

// Serve attachment files (tenant-aware in multi-tenant mode)
router.get('/attachments/:filename', (req, res) => {
  const { filename } = req.params;
  const token = req.query.token;
  
  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // In multi-tenant mode, verify user exists in the current tenant's database
    const db = getRequestDatabase(req);
    if (isMultiTenant() && db) {
      try {
        const userInDb = db.prepare('SELECT id FROM users WHERE id = ?').get(decoded.id);
        
        if (!userInDb) {
          console.log(`❌ File access denied: User ${decoded.email} (${decoded.id}) does not exist in current tenant's database`);
          return res.status(401).json({ error: 'Invalid token for this tenant' });
        }
      } catch (dbError) {
        console.error('❌ Error checking user in tenant database for file access:', dbError);
        return res.status(401).json({ error: 'Authentication failed' });
      }
    }
    
    // Token is valid, serve the file
    
    // Use tenant-specific path if in multi-tenant mode
    const storagePaths = getStoragePaths(req);
    const filePath = path.join(storagePaths.attachments, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Set appropriate headers for file serving
    res.setHeader('Content-Type', getContentType(filename));
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving attachment:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Serve avatar files (tenant-aware in multi-tenant mode)
router.get('/avatars/:filename', (req, res) => {
  const { filename } = req.params;
  const token = req.query.token;
  
  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // In multi-tenant mode, verify user exists in the current tenant's database
    const db = getRequestDatabase(req);
    if (isMultiTenant() && db) {
      try {
        const userInDb = db.prepare('SELECT id FROM users WHERE id = ?').get(decoded.id);
        
        if (!userInDb) {
          console.log(`❌ File access denied: User ${decoded.email} (${decoded.id}) does not exist in current tenant's database`);
          return res.status(401).json({ error: 'Invalid token for this tenant' });
        }
      } catch (dbError) {
        console.error('❌ Error checking user in tenant database for file access:', dbError);
        return res.status(401).json({ error: 'Authentication failed' });
      }
    }
    
    // Token is valid, serve the file
    
    // Use tenant-specific path if in multi-tenant mode
    const storagePaths = getStoragePaths(req);
    const filePath = path.join(storagePaths.avatars, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Set appropriate headers for file serving
    res.setHeader('Content-Type', getContentType(filename));
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving avatar:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Delete attachment endpoint
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    // First, get the attachment info to find the file path
    const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
    
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    // Extract filename from URL (e.g., "/attachments/filename.ext" -> "filename.ext")
    const filename = attachment.url.replace('/attachments/', '').replace('/api/files/attachments/', '');
    // Use tenant-specific path if in multi-tenant mode
    const storagePaths = getStoragePaths(req);
    const filePath = path.join(storagePaths.attachments, filename);
    
    // Delete the physical file if it exists
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`✅ Deleted file: ${filename}`);
      } catch (fileError) {
        console.error('Error deleting file:', fileError);
        // Continue with database deletion even if file deletion fails
      }
    } else {
      console.log(`⚠️ File not found: ${filename}`);
    }
    
    // Delete the database record
    const result = db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Attachment record not found' });
    }
    
    // Update storage usage after deleting attachment
    updateStorageUsage(db);
    
    // Get the task's board ID for Redis publishing
    const task = wrapQuery(db.prepare('SELECT boardId FROM tasks WHERE id = ?'), 'SELECT').get(attachment.taskId);
    
    // Publish to Redis for real-time updates
    if (task?.boardId) {
      // Fetch complete task with all relationships including updated attachmentCount
      const taskWithRelationships = wrapQuery(
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
      ).get(attachment.taskId);
      
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
            const allAttachments = wrapQuery(db.prepare(`
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
        const tenantId = req.tenantId || null;
        await redisService.publish('task-updated', {
          boardId: task.boardId,
          task: taskResponse,
          timestamp: new Date().toISOString()
        }, tenantId);
      }
      
      // Also publish attachment-deleted for any handlers that might need it
      console.log('📤 Publishing attachment-deleted to Redis for board:', task.boardId);
      const tenantId = req.tenantId || null;
      await redisService.publish('attachment-deleted', {
        boardId: task.boardId,
        taskId: attachment.taskId,
        attachmentId: id,
        timestamp: new Date().toISOString()
      }, tenantId);
      console.log('✅ Attachment-deleted published to Redis');
    }
    
    res.json({ message: 'Attachment and file deleted successfully' });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

export default router;

