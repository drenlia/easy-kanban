import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { dbTransaction } from '../utils/dbAsync.js';
import { logActivity } from '../services/activityLogger.js';
import { TAG_ACTIONS } from '../constants/activityActions.js';
import * as reportingLogger from '../services/reportingLogger.js';
import notificationService from '../services/notificationService.js';
import { getRequestDatabase, getTenantId } from '../middleware/tenantRouting.js';
// MIGRATED: Import sqlManager
import { tags as tagQueries } from '../utils/sqlManager/index.js';
import { parseBody, createTagBodySchema, updateTagBodySchema } from '../utils/requestValidation.js';

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
    // MIGRATED: Get all tags using sqlManager
    const tags = await tagQueries.getAllTags(db);
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
  
  const parsed = parseBody(createTagBodySchema, req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error });
  }
  const { tag, description, color } = parsed.data;
  const db = getRequestDatabase(req);

  try {
    // MIGRATED: Create tag using sqlManager
    const result = await tagQueries.createTag(db, tag, description, color);
    
    // Get the created tag - PostgreSQL returns it in result, SQLite needs separate query
    let newTag;
    if (result.lastInsertRowid) {
      // SQLite: use lastInsertRowid
      newTag = await tagQueries.getTagById(db, result.lastInsertRowid);
    } else if (result.id) {
      // PostgreSQL: tag is in result
      newTag = result;
    } else {
      // Fallback: query by tag name
      const allTags = await tagQueries.getAllTags(db);
      newTag = allTags.find(t => t.tag === tag);
    }
    
    // Publish for real-time updates (tenant-scoped channel in multi-tenant mode)
    console.log('📤 Publishing tag-created (user-created)');
    await notificationService.publish('tag-created', {
      tag: newTag,
      timestamp: new Date().toISOString()
    }, getTenantId(req));
    console.log('✅ Tag-created published');
    
    res.json(newTag);
  } catch (error) {
    if (error.message?.includes('UNIQUE constraint') || error.code === '23505') {
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
    // MIGRATED: Get all tags using sqlManager
    const tags = await tagQueries.getAllTags(db);
    res.json(tags);
  } catch (error) {
    console.error('Error fetching admin tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

router.post('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  const parsed = parseBody(createTagBodySchema, req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error });
  }
  const { tag, description, color } = parsed.data;
  const db = getRequestDatabase(req);

  try {
    // MIGRATED: Create tag using sqlManager
    const result = await tagQueries.createTag(db, tag, description, color);
    
    // Get the created tag - PostgreSQL returns it in result, SQLite needs separate query
    let newTag;
    if (result.lastInsertRowid) {
      // SQLite: use lastInsertRowid
      newTag = await tagQueries.getTagById(db, result.lastInsertRowid);
    } else if (result.id) {
      // PostgreSQL: tag is in result
      newTag = result;
    } else {
      // Fallback: query by tag name
      const allTags = await tagQueries.getAllTags(db);
      newTag = allTags.find(t => t.tag === tag);
    }
    
    console.log('📤 Publishing tag-created');
    await notificationService.publish('tag-created', {
      tag: newTag,
      timestamp: new Date().toISOString()
    }, getTenantId(req));
    console.log('✅ Tag-created published');
    
    res.json(newTag);
  } catch (error) {
    if (error.message?.includes('UNIQUE constraint') || error.code === '23505') {
      return res.status(400).json({ error: 'Tag already exists' });
    }
    console.error('Error creating tag:', error);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

router.put('/:tagId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { tagId } = req.params;
  const parsed = parseBody(updateTagBodySchema, req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error });
  }
  const { tag, description, color } = parsed.data;
  const db = getRequestDatabase(req);

  try {
    // MIGRATED: Update tag using sqlManager
    await tagQueries.updateTag(db, tagId, tag, description, color);
    
    // MIGRATED: Get updated tag using sqlManager
    const updatedTag = await tagQueries.getTagById(db, tagId);
    
    console.log('📤 Publishing tag-updated');
    await notificationService.publish('tag-updated', {
      tag: updatedTag,
      timestamp: new Date().toISOString()
    }, getTenantId(req));
    console.log('✅ Tag-updated published');
    
    res.json(updatedTag);
  } catch (error) {
    if (error.message?.includes('UNIQUE constraint') || error.code === '23505') {
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
    // MIGRATED: Get tag usage count using sqlManager
    const usageCount = await tagQueries.getTagUsageCount(db, tagId);
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
    
    // MIGRATED: Batch fetch all usage counts using sqlManager
    const usageCounts = await tagQueries.getBatchTagUsageCounts(db, tagIds);
    
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
  const tenantId = getTenantId(req);
  const parsedTagId = parseInt(tagId, 10);
  
  try {
    // MIGRATED: Get tag info before deletion using sqlManager
    const tagToDelete = await tagQueries.getTagById(db, tagId);

    // Capture associations before delete so other clients can strip tags from cards
    const tasksUsingTag = await tagQueries.getTasksUsingTag(db, parsedTagId);
    
    // Use transaction to ensure both operations succeed or fail together
    await dbTransaction(db, async () => {
      // MIGRATED: First remove all task associations using sqlManager
      await tagQueries.deleteTagAssociations(db, tagId);
      
      // MIGRATED: Then delete the tag using sqlManager
      await tagQueries.deleteTag(db, tagId);
    });
    
    // Publish catalog update
    console.log('📤 Publishing tag-deleted to Redis');
    await notificationService.publish('tag-deleted', {
      tagId: parsedTagId,
      tag: tagToDelete,
      timestamp: new Date().toISOString()
    }, tenantId);
    console.log('✅ Tag-deleted published to Redis');

    // Mirror per-task removal so Kanban caches drop the tag (same path as taskRelations)
    for (const task of tasksUsingTag) {
      if (!task?.id || !task?.boardId) continue;
      await notificationService.publish('task-tag-removed', {
        boardId: task.boardId,
        taskId: task.id,
        tagId: parsedTagId,
        tag: tagToDelete,
        timestamp: new Date().toISOString()
      }, tenantId);
    }
    if (tasksUsingTag.length > 0) {
      console.log(`✅ Published task-tag-removed for ${tasksUsingTag.length} task(s)`);
    }
    
    res.json({ message: 'Tag deleted successfully', affectedTasks: tasksUsingTag.length });
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// Note: Task-tag association routes are in index.js under /api/tasks/:taskId/tags
// They will be extracted to routes/taskRelations.js later

export default router;

