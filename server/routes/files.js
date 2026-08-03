import express from 'express';
import path from 'path';
import jwt from 'jsonwebtoken';
import { authenticateToken, JWT_SECRET } from '../middleware/auth.js';
import { updateStorageUsage } from '../utils/storageUtils.js';
import notificationService from '../services/notificationService.js';
import { isMultiTenant, getRequestDatabase } from '../middleware/tenantRouting.js';
import { files as fileQueries, tasks as taskQueries } from '../utils/sqlManager/index.js';
import {
  getObject,
  deleteObject,
  getRequestStoragePaths,
  filenameFromPublicUrl
} from '../services/storage/index.js';

const router = express.Router();

// Serve attachment files (tenant-aware in multi-tenant mode)
router.get('/attachments/:filename', async (req, res) => {
  const { filename } = req.params;
  const token = req.query.token;
  
  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const db = getRequestDatabase(req);
    if (isMultiTenant() && db) {
      try {
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
    
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const storagePaths = getRequestStoragePaths(req);
    const safeName = path.basename(filename);
    const obj = await getObject(db, storagePaths, 'attachments', safeName);
    
    if (!obj) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.setHeader('Content-Type', obj.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(obj.buffer);
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
    
    const db = getRequestDatabase(req);
    if (isMultiTenant() && db) {
      try {
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
    
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const storagePaths = getRequestStoragePaths(req);
    const safeName = path.basename(filename);
    const obj = await getObject(db, storagePaths, 'avatars', safeName);
    
    if (!obj) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.setHeader('Content-Type', obj.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(obj.buffer);
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
    const attachment = await fileQueries.getAttachmentById(db, id);
    
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    const filename = filenameFromPublicUrl(attachment.url, 'attachments');
    if (filename) {
      const storagePaths = getRequestStoragePaths(req);
      try {
        await deleteObject(db, storagePaths, 'attachments', filename);
        console.log(`✅ Deleted file: ${filename}`);
      } catch (fileError) {
        console.error('Error deleting file:', fileError);
      }
    }
    
    const result = await fileQueries.deleteAttachment(db, id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Attachment record not found' });
    }
    
    await updateStorageUsage(db);
    
    const task = await fileQueries.getTaskByIdForFiles(db, attachment.taskId);
    
    if (task?.boardId) {
      const taskWithRelationships = await taskQueries.getTaskWithRelationships(db, attachment.taskId);
      
      if (taskWithRelationships) {
        const taskResponse = taskWithRelationships;
        const tenantId = req.tenantId || null;
        await notificationService.publish('task-updated', {
          boardId: task.boardId,
          task: taskResponse,
          timestamp: new Date().toISOString()
        }, tenantId);
      }
      
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
