import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { authenticateToken } from '../middleware/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();

const dbPath = path.join(__dirname, '../data/kanban.db');
const db = new Database(dbPath);

// Helper function to validate filter data
const validateFilterData = (filters) => {
  const allowedFields = [
    'textFilter', 'dateFromFilter', 'dateToFilter', 'dueDateFromFilter', 
    'dueDateToFilter', 'memberFilters', 'priorityFilters', 'tagFilters',
    'projectFilter', 'taskFilter'
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
router.get('/', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    
    const stmt = db.prepare(`
      SELECT * FROM views 
      WHERE userId = ? 
      ORDER BY filterName ASC
    `);
    
    const views = stmt.all(userId);
    const formattedViews = views.map(formatViewForResponse);
    
    res.json(formattedViews);
  } catch (error) {
    console.error('Error fetching views:', error);
    res.status(500).json({ error: 'Failed to fetch saved filter views' });
  }
});

// GET /api/views/:id - Get a specific saved filter view
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const viewId = req.params.id;
    
    const stmt = db.prepare(`
      SELECT * FROM views 
      WHERE id = ? AND userId = ?
    `);
    
    const view = stmt.get(viewId, userId);
    
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
router.post('/', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { filterName, filters, shared = false } = req.body;
    
    if (!filterName || !filterName.trim()) {
      return res.status(400).json({ error: 'Filter name is required' });
    }
    
    if (!filters || typeof filters !== 'object') {
      return res.status(400).json({ error: 'Filter data is required' });
    }
    
    // Check if a view with this name already exists for this user
    const existingView = db.prepare(`
      SELECT id FROM views 
      WHERE filterName = ? AND userId = ?
    `).get(filterName.trim(), userId);
    
    if (existingView) {
      return res.status(409).json({ error: 'A filter with this name already exists' });
    }
    
    const validatedFilters = validateFilterData(filters);
    
    const stmt = db.prepare(`
      INSERT INTO views (
        filterName, userId, shared, textFilter, dateFromFilter, dateToFilter,
        dueDateFromFilter, dueDateToFilter, memberFilters, priorityFilters,
        tagFilters, projectFilter, taskFilter
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
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
    const createdView = db.prepare('SELECT * FROM views WHERE id = ?').get(result.lastInsertRowid);
    const formattedView = formatViewForResponse(createdView);
    
    res.status(201).json(formattedView);
  } catch (error) {
    console.error('Error creating view:', error);
    res.status(500).json({ error: 'Failed to create filter view' });
  }
});

// PUT /api/views/:id - Update an existing saved filter view
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const viewId = req.params.id;
    const { filterName, filters, shared } = req.body;
    
    // Check if view exists and belongs to user
    const existingView = db.prepare(`
      SELECT * FROM views 
      WHERE id = ? AND userId = ?
    `).get(viewId, userId);
    
    if (!existingView) {
      return res.status(404).json({ error: 'Filter view not found' });
    }
    
    // Validate filter name if provided
    if (filterName !== undefined) {
      if (!filterName || !filterName.trim()) {
        return res.status(400).json({ error: 'Filter name cannot be empty' });
      }
      
      // Check if another view with this name exists (excluding current view)
      const nameConflict = db.prepare(`
        SELECT id FROM views 
        WHERE filterName = ? AND userId = ? AND id != ?
      `).get(filterName.trim(), userId, viewId);
      
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
    
    const stmt = db.prepare(`
      UPDATE views 
      SET ${setClause}
      WHERE id = ? AND userId = ?
    `);
    
    stmt.run(...params);
    
    // Fetch updated view
    const updatedView = db.prepare('SELECT * FROM views WHERE id = ?').get(viewId);
    const formattedView = formatViewForResponse(updatedView);
    
    res.json(formattedView);
  } catch (error) {
    console.error('Error updating view:', error);
    res.status(500).json({ error: 'Failed to update filter view' });
  }
});

// DELETE /api/views/:id - Delete a saved filter view
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const viewId = req.params.id;
    
    const stmt = db.prepare(`
      DELETE FROM views 
      WHERE id = ? AND userId = ?
    `);
    
    const result = stmt.run(viewId, userId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Filter view not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting view:', error);
    res.status(500).json({ error: 'Failed to delete filter view' });
  }
});

export default router;
