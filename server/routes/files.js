import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { authenticateToken, JWT_SECRET } from '../middleware/auth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { updateStorageUsage } from '../utils/storageUtils.js';
import notificationService from '../services/notificationService.js';
import { isMultiTenant, getRequestDatabase } from '../middleware/tenantRouting.js';
import { files as fileQueries, tasks as taskQueries } from '../utils/sqlManager/index.js';

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
router.get('/attachments/:filename', async (req, res) => {
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
        // MIGRATED: Check user using sqlManager
        const userInDb = await fileQueries.getUserByIdForFileAccess(db, decoded.id);
        
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
router.get('/avatars/:filename', async (req, res) => {
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
        // MIGRATED: Check user using sqlManager
        const userInDb = await fileQueries.getUserByIdForFileAccess(db, decoded.id);
        
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
    // MIGRATED: Get attachment info using sqlManager
    const attachment = await fileQueries.getAttachmentById(db, id);
    
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
    
    // MIGRATED: Delete attachment using sqlManager
    const result = await fileQueries.deleteAttachment(db, id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Attachment record not found' });
    }
    
    // Update storage usage after deleting attachment
    await updateStorageUsage(db);
    
    // MIGRATED: Get the task's board ID using sqlManager
    const task = await fileQueries.getTaskByIdForFiles(db, attachment.taskId);
    
    // Publish to Redis for real-time updates
    if (task?.boardId) {
      // MIGRATED: Fetch complete task with all relationships using sqlManager
      const taskWithRelationships = await taskQueries.getTaskWithRelationships(db, attachment.taskId);
      
      if (taskWithRelationships) {
        // Task already has proper structure from getTaskWithRelationships
        // Comments, tags, watchers, collaborators are already arrays (not JSON strings)
        const taskResponse = taskWithRelationships;
        
        // Publish task-updated event with complete task data (includes updated attachmentCount)
        const tenantId = req.tenantId || null;
        await notificationService.publish('task-updated', {
          boardId: task.boardId,
          task: taskResponse,
          timestamp: new Date().toISOString()
        }, tenantId);
      }
      
      // Also publish attachment-deleted for any handlers that might need it
      console.log('📤 Publishing attachment-deleted to Redis for board:', task.boardId);
      const tenantId = req.tenantId || null;
      await notificationService.publish('attachment-deleted', {
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

