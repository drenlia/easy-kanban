import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { dbTransaction } from '../utils/dbAsync.js';
import { logActivity } from '../services/activityLogger.js';
import { TAG_ACTIONS } from '../constants/activityActions.js';
import * as reportingLogger from '../services/reportingLogger.js';
import notificationService from '../services/notificationService.js';
import { getRequestDatabase } from '../middleware/tenantRouting.js';

const router = express.Router();

// Get all tags (authenticated users only) - must come BEFORE admin routes
// Skip if mounted at /api/admin/tags (admin routes will handle it)
router.get('/', authenticateToken, async (req, res, next) => {
  // If this is mounted at /api/admin/tags, skip to next handler (admin route)
  if (req.baseUrl === '/api/admin/tags') {
    return next();
  }
  
  try {
    const db = getRequestDatabase(req);
    const tags = await wrapQuery(db.prepare('SELECT * FROM tags ORDER BY tag ASC'), 'SELECT').all();
    res.json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// User tags endpoints (allow any authenticated user to create tags)
// Skip if mounted at /api/admin/tags (admin routes will handle it)
router.post('/', authenticateToken, async (req, res, next) => {
  // If this is mounted at /api/admin/tags, skip to next handler (admin route)
  if (req.baseUrl === '/api/admin/tags') {
    return next();
  }
  
  const { tag, description, color } = req.body;
  const db = getRequestDatabase(req);
  
  if (!tag) {
    return res.status(400).json({ error: 'Tag name is required' });
  }

  try {
    const result = await wrapQuery(db.prepare(`
      INSERT INTO tags (tag, description, color) 
      VALUES (?, ?, ?)
    `), 'INSERT').run(tag, description || '', color || '#4F46E5');
    
    const newTag = await wrapQuery(db.prepare('SELECT * FROM tags WHERE id = ?'), 'SELECT').get(result.lastInsertRowid);
    
    // Publish to Redis for real-time updates
    console.log('📤 Publishing tag-created to Redis (user-created)');
    await notificationService.publish('tag-created', {
      tag: newTag,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Tag-created published to Redis');
    
    res.json(newTag);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Tag already exists' });
    }
    console.error('Error creating tag:', error);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// Admin tags endpoints (mounted at /api/admin/tags)
router.get('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const tags = await wrapQuery(db.prepare('SELECT * FROM tags ORDER BY tag ASC'), 'SELECT').all();
    res.json(tags);
  } catch (error) {
    console.error('Error fetching admin tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

router.post('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { tag, description, color } = req.body;
  const db = getRequestDatabase(req);
  
  if (!tag) {
    return res.status(400).json({ error: 'Tag name is required' });
  }

  try {
    const result = await wrapQuery(db.prepare(`
      INSERT INTO tags (tag, description, color) 
      VALUES (?, ?, ?)
    `), 'INSERT').run(tag, description || '', color || '#4F46E5');
    
    const newTag = await wrapQuery(db.prepare('SELECT * FROM tags WHERE id = ?'), 'SELECT').get(result.lastInsertRowid);
    
    // Publish to Redis for real-time updates
    console.log('📤 Publishing tag-created to Redis');
    await notificationService.publish('tag-created', {
      tag: newTag,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Tag-created published to Redis');
    
    res.json(newTag);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Tag already exists' });
    }
    console.error('Error creating tag:', error);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

router.put('/:tagId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { tagId } = req.params;
  const { tag, description, color } = req.body;
  const db = getRequestDatabase(req);
  
  if (!tag) {
    return res.status(400).json({ error: 'Tag name is required' });
  }

  try {
    await wrapQuery(db.prepare(`
      UPDATE tags SET tag = ?, description = ?, color = ? WHERE id = ?
    `), 'UPDATE').run(tag, description || '', color || '#4F46E5', tagId);
    
    const updatedTag = await wrapQuery(db.prepare('SELECT * FROM tags WHERE id = ?'), 'SELECT').get(tagId);
    
    // Publish to Redis for real-time updates
    console.log('📤 Publishing tag-updated to Redis');
    await notificationService.publish('tag-updated', {
      tag: updatedTag,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Tag-updated published to Redis');
    
    res.json(updatedTag);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Tag already exists' });
    }
    console.error('Error updating tag:', error);
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

// Get tag usage count (for deletion confirmation)
router.get('/:tagId/usage', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { tagId } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    const usageCount = await wrapQuery(db.prepare('SELECT COUNT(*) as count FROM task_tags WHERE tagId = ?'), 'SELECT').get(tagId);
    res.json({ count: usageCount.count });
  } catch (error) {
    console.error('Error fetching tag usage:', error);
    res.status(500).json({ error: 'Failed to fetch tag usage' });
  }
});

// Get batch tag usage counts (fixes N+1 problem)
router.get('/usage/batch', authenticateToken, requireRole(['admin']), async (req, res) => {
  const db = getRequestDatabase(req);
  
  try {
    // Get all tag IDs from query params
    // Handle both array format (?tagIds=1&tagIds=2) and comma-separated (?tagIds=1,2)
    let tagIds = [];
    if (req.query.tagIds) {
      if (Array.isArray(req.query.tagIds)) {
        tagIds = req.query.tagIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      } else if (typeof req.query.tagIds === 'string') {
        // Handle comma-separated string
        tagIds = req.query.tagIds.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      }
    }
    
    if (tagIds.length === 0) {
      return res.json({});
    }
    
    // Batch fetch all usage counts in one query
    const placeholders = tagIds.map(() => '?').join(',');
    const usageCounts = await wrapQuery(db.prepare(`
      SELECT tagId, COUNT(*) as count 
      FROM task_tags 
      WHERE tagId IN (${placeholders})
      GROUP BY tagId
    `), 'SELECT').all(...tagIds);
    
    // Create map of usage counts by tagId
    const usageMap = {};
    usageCounts.forEach(usage => {
      usageMap[usage.tagId] = { count: usage.count };
    });
    
    // Include zero counts for tags with no usage
    tagIds.forEach(tagId => {
      if (!usageMap[tagId]) {
        usageMap[tagId] = { count: 0 };
      }
    });
    
    res.json(usageMap);
  } catch (error) {
    console.error('Error fetching batch tag usage:', error);
    res.status(500).json({ error: 'Failed to fetch batch tag usage' });
  }
});

router.delete('/:tagId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { tagId } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    // Get tag info before deletion for Redis publishing
    const tagToDelete = await wrapQuery(db.prepare('SELECT * FROM tags WHERE id = ?'), 'SELECT').get(tagId);
    
    // Use transaction to ensure both operations succeed or fail together
    await dbTransaction(db, async () => {
      // First remove all task associations
      await wrapQuery(db.prepare('DELETE FROM task_tags WHERE tagId = ?'), 'DELETE').run(tagId);
      
      // Then delete the tag
      await wrapQuery(db.prepare('DELETE FROM tags WHERE id = ?'), 'DELETE').run(tagId);
    });
    
    // Publish to Redis for real-time updates
    console.log('📤 Publishing tag-deleted to Redis');
    await notificationService.publish('tag-deleted', {
      tagId: tagId,
      tag: tagToDelete,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Tag-deleted published to Redis');
    
    res.json({ message: 'Tag deleted successfully' });
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// Note: Task-tag association routes are in index.js under /api/tasks/:taskId/tags
// They will be extracted to routes/taskRelations.js later

export default router;

