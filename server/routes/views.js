import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import redisService from '../services/redisService.js';
import { getRequestDatabase } from '../middleware/tenantRouting.js';

const router = express.Router();

// Helper function to validate filter data
const validateFilterData = (filters) => {
  const allowedFields = [
    'textFilter', 'dateFromFilter', 'dateToFilter', 'dueDateFromFilter', 
    'dueDateToFilter', 'memberFilters', 'priorityFilters', 'tagFilters',
    'projectFilter', 'taskFilter', 'boardColumnFilter'
  ];
  
  const validatedFilters = {};
  
  for (const [key, value] of Object.entries(filters)) {
    if (allowedFields.includes(key)) {
      // Convert arrays to JSON strings for database storage
      if (Array.isArray(value)) {
        validatedFilters[key] = JSON.stringify(value);
      } else if (typeof value === 'string' || value === null || value === undefined) {
        validatedFilters[key] = value || null;
      }
    }
  }
  
  return validatedFilters;
};

// Helper function to convert database row to API response format
const formatViewForResponse = (view) => {
  if (!view) return null;
  
  const formatted = { ...view };
  
  // Convert boolean fields from SQLite (0/1) to JavaScript booleans
  formatted.shared = Boolean(formatted.shared);
  
  // Parse JSON fields back to arrays
  const jsonFields = ['memberFilters', 'priorityFilters', 'tagFilters'];
  jsonFields.forEach(field => {
    if (formatted[field]) {
      try {
        formatted[field] = JSON.parse(formatted[field]);
      } catch (e) {
        formatted[field] = [];
      }
    } else {
      formatted[field] = [];
    }
  });
  
  return formatted;
};

// GET /api/views - Get all saved filter views for the current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }
    const userId = req.user.id;
    
    const views = await wrapQuery(db.prepare(`
      SELECT * FROM views 
      WHERE userId = ? 
      ORDER BY filterName ASC
    `), 'SELECT').all(userId);
    const formattedViews = views.map(formatViewForResponse);
    
    res.json(formattedViews);
  } catch (error) {
    console.error('Error fetching views:', error);
    res.status(500).json({ error: 'Failed to fetch saved filter views' });
  }
});

// GET /api/views/shared - Get shared filter views from other users
router.get('/shared', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }
    const userId = req.user.id;
    
    const views = await wrapQuery(db.prepare(`
      SELECT v.*, 
             CASE 
               WHEN u.first_name IS NOT NULL AND u.last_name IS NOT NULL 
               THEN u.first_name || ' ' || u.last_name
               WHEN u.first_name IS NOT NULL 
               THEN u.first_name
               ELSE u.email
             END as creatorName
      FROM views v
      LEFT JOIN users u ON v.userId = u.id
      WHERE v.shared = 1 AND v.userId != ?
      ORDER BY v.filterName ASC
    `), 'SELECT').all(userId);
    
    const formattedViews = views.map(view => {
      const formatted = formatViewForResponse(view);
      formatted.creatorName = view.creatorName;
      return formatted;
    });
    
    res.json(formattedViews);
  } catch (error) {
    console.error('❌ [GET /api/views/shared] Error fetching shared views:', error);
    res.status(500).json({ error: 'Failed to fetch shared filter views' });
  }
});

// GET /api/views/:id - Get a specific saved filter view
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }
    const userId = req.user.id;
    const viewId = req.params.id;
    
    const view = await wrapQuery(db.prepare(`
      SELECT * FROM views 
      WHERE id = ? AND userId = ?
    `), 'SELECT').get(viewId, userId);
    
    if (!view) {
      return res.status(404).json({ error: 'Filter view not found' });
    }
    
    const formattedView = formatViewForResponse(view);
    res.json(formattedView);
  } catch (error) {
    console.error('Error fetching view:', error);
    res.status(500).json({ error: 'Failed to fetch filter view' });
  }
});

// POST /api/views - Create a new saved filter view
router.post('/', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }
    const userId = req.user.id;
    const { filterName, filters, shared = false } = req.body;
    
    if (!filterName || !filterName.trim()) {
      return res.status(400).json({ error: 'Filter name is required' });
    }
    
    if (!filters || typeof filters !== 'object') {
      return res.status(400).json({ error: 'Filter data is required' });
    }
    
    // Check if a view with this name already exists for this user
    const existingView = await wrapQuery(db.prepare(`
      SELECT id FROM views 
      WHERE filterName = ? AND userId = ?
    `), 'SELECT').get(filterName.trim(), userId);
    
    if (existingView) {
      return res.status(409).json({ error: 'A filter with this name already exists' });
    }
    
    const validatedFilters = validateFilterData(filters);
    
    const result = await wrapQuery(db.prepare(`
      INSERT INTO views (
        filterName, userId, shared, textFilter, dateFromFilter, dateToFilter,
        dueDateFromFilter, dueDateToFilter, memberFilters, priorityFilters,
        tagFilters, projectFilter, taskFilter
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `), 'INSERT').run(
      filterName.trim(),
      userId,
      shared ? 1 : 0,
      validatedFilters.textFilter,
      validatedFilters.dateFromFilter,
      validatedFilters.dateToFilter,
      validatedFilters.dueDateFromFilter,
      validatedFilters.dueDateToFilter,
      validatedFilters.memberFilters,
      validatedFilters.priorityFilters,
      validatedFilters.tagFilters,
      validatedFilters.projectFilter,
      validatedFilters.taskFilter
    );
    
    // Fetch the created view to return
    const createdView = await wrapQuery(db.prepare('SELECT * FROM views WHERE id = ?'), 'SELECT').get(result.lastInsertRowid);
    const formattedView = formatViewForResponse(createdView);
    
    // Publish to Redis for real-time updates if the filter is shared
    if (shared) {
      console.log('📤 Publishing filter-created to Redis for shared filter:', formattedView.filterName);
      await redisService.publish('filter-created', {
        filter: formattedView,
        timestamp: new Date().toISOString()
      });
      console.log('✅ Filter-created published to Redis');
    }
    
    res.status(201).json(formattedView);
  } catch (error) {
    console.error('Error creating view:', error);
    res.status(500).json({ error: 'Failed to create filter view' });
  }
});

// PUT /api/views/:id - Update an existing saved filter view
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }
    const userId = req.user.id;
    const viewId = req.params.id;
    const { filterName, filters, shared } = req.body;
    
    // Check if view exists and belongs to user
    const existingView = await wrapQuery(db.prepare(`
      SELECT * FROM views 
      WHERE id = ? AND userId = ?
    `), 'SELECT').get(viewId, userId);
    
    if (!existingView) {
      return res.status(404).json({ error: 'Filter view not found' });
    }
    
    // Validate filter name if provided
    if (filterName !== undefined) {
      if (!filterName || !filterName.trim()) {
        return res.status(400).json({ error: 'Filter name cannot be empty' });
      }
      
      // Check if another view with this name exists (excluding current view)
      const nameConflict = await wrapQuery(db.prepare(`
        SELECT id FROM views 
        WHERE filterName = ? AND userId = ? AND id != ?
      `), 'SELECT').get(filterName.trim(), userId, viewId);
      
      if (nameConflict) {
        return res.status(409).json({ error: 'A filter with this name already exists' });
      }
    }
    
    const updates = {};
    const params = [];
    
    if (filterName !== undefined) {
      updates.filterName = '?';
      params.push(filterName.trim());
    }
    
    if (filters !== undefined) {
      const validatedFilters = validateFilterData(filters);
      Object.entries(validatedFilters).forEach(([key, value]) => {
        updates[key] = '?';
        params.push(value);
      });
    }
    
    if (shared !== undefined) {
      updates.shared = '?';
      params.push(shared ? 1 : 0);
    }
    
    updates.updated_at = 'CURRENT_TIMESTAMP';
    
    if (Object.keys(updates).length === 1) { // Only updated_at
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    const setClause = Object.entries(updates)
      .map(([key, value]) => `${key} = ${value}`)
      .join(', ');
    
    params.push(viewId, userId);
    
    await wrapQuery(db.prepare(`
      UPDATE views 
      SET ${setClause}
      WHERE id = ? AND userId = ?
    `), 'UPDATE').run(...params);
    
    // Fetch updated view
    const updatedView = await wrapQuery(db.prepare('SELECT * FROM views WHERE id = ?'), 'SELECT').get(viewId);
    const formattedView = formatViewForResponse(updatedView);
    
    // Publish to Redis for real-time updates if shared status changed or filter is shared
    // We need to check if the shared status changed by comparing with the original view
    const originalShared = Boolean(existingView.shared);
    const newShared = formattedView.shared;
    
    
    if (originalShared !== newShared || newShared) {
      console.log('📤 Publishing filter-updated to Redis for filter:', formattedView.filterName, 'shared:', newShared);
      await redisService.publish('filter-updated', {
        filter: formattedView,
        timestamp: new Date().toISOString()
      });
      console.log('✅ Filter-updated published to Redis');
    } else {
      console.log('⏭️ Skipping Redis publish - no shared status change and filter not shared');
    }
    
    res.json(formattedView);
  } catch (error) {
    console.error('Error updating view:', error);
    res.status(500).json({ error: 'Failed to update filter view' });
  }
});

// DELETE /api/views/:id - Delete a saved filter view
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }
    const userId = req.user.id;
    const viewId = req.params.id;
    
    // Get the view before deleting to check if it was shared
    const viewToDelete = await wrapQuery(db.prepare('SELECT * FROM views WHERE id = ? AND userId = ?'), 'SELECT').get(viewId, userId);
    
    if (!viewToDelete) {
      return res.status(404).json({ error: 'Filter view not found' });
    }
    
    const result = await wrapQuery(db.prepare(`
      DELETE FROM views 
      WHERE id = ? AND userId = ?
    `), 'DELETE').run(viewId, userId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Filter view not found' });
    }
    
    // Publish to Redis for real-time updates if the filter was shared
    if (viewToDelete.shared) {
      console.log('📤 Publishing filter-deleted to Redis for shared filter:', viewToDelete.filterName);
      await redisService.publish('filter-deleted', {
        filterId: viewId,
        filterName: viewToDelete.filterName,
        timestamp: new Date().toISOString()
      });
      console.log('✅ Filter-deleted published to Redis');
    }
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting view:', error);
    res.status(500).json({ error: 'Failed to delete filter view' });
  }
});

export default router;
