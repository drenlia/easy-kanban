import express from 'express';
import crypto from 'crypto';
import { wrapQuery } from '../utils/queryLogger.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// GET /api/admin/sprints - Get all planning periods/sprints (accessible to all authenticated users for filtering)
router.get('/', authenticateToken, (req, res) => {
  try {
    const { db } = req.app.locals;
    
    const sprints = wrapQuery(
      db.prepare(`
        SELECT id, name, start_date, end_date, is_active, description, created_at, updated_at
        FROM planning_periods
        ORDER BY start_date DESC
      `),
      'SELECT'
    ).all();
    
    res.json({ sprints });
  } catch (error) {
    console.error('Failed to fetch sprints:', error);
    res.status(500).json({ error: 'Failed to fetch sprints' });
  }
});

// GET /api/admin/sprints/active - Get currently active sprint
router.get('/active', authenticateToken, (req, res) => {
  try {
    const { db } = req.app.locals;
    
    const activeSprint = wrapQuery(
      db.prepare(`
        SELECT id, name, start_date, end_date, is_active, description, created_at
        FROM planning_periods
        WHERE is_active = 1
        ORDER BY start_date DESC
        LIMIT 1
      `),
      'SELECT'
    ).get();
    
    if (!activeSprint) {
      return res.status(404).json({ error: 'No active sprint found' });
    }
    
    res.json(activeSprint);
  } catch (error) {
    console.error('Failed to fetch active sprint:', error);
    res.status(500).json({ error: 'Failed to fetch active sprint' });
  }
});

// POST /api/admin/sprints - Create a new sprint
router.post('/', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { db } = req.app.locals;
    const { name, start_date, end_date, is_active, description } = req.body;
    
    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Sprint name is required' });
    }
    if (!start_date) {
      return res.status(400).json({ error: 'Start date is required' });
    }
    if (!end_date) {
      return res.status(400).json({ error: 'End date is required' });
    }
    if (new Date(end_date) < new Date(start_date)) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }
    
    const sprintId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    // If this sprint is being set as active, deactivate all others
    if (is_active) {
      wrapQuery(
        db.prepare('UPDATE planning_periods SET is_active = 0 WHERE is_active = 1'),
        'UPDATE'
      ).run();
    }
    
    wrapQuery(
      db.prepare(`
        INSERT INTO planning_periods (
          id, name, start_date, end_date, is_active, description, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `),
      'INSERT'
    ).run(
      sprintId,
      name.trim(),
      start_date,
      end_date,
      is_active ? 1 : 0,
      description?.trim() || null,
      now,
      now
    );
    
    const newSprint = wrapQuery(
      db.prepare('SELECT * FROM planning_periods WHERE id = ?'),
      'SELECT'
    ).get(sprintId);
    
    res.status(201).json(newSprint);
  } catch (error) {
    console.error('Failed to create sprint:', error);
    res.status(500).json({ error: 'Failed to create sprint' });
  }
});

// PUT /api/admin/sprints/:id - Update a sprint
router.put('/:id', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { db } = req.app.locals;
    const { id } = req.params;
    const { name, start_date, end_date, is_active, description } = req.body;
    
    // Check if sprint exists
    const existing = wrapQuery(
      db.prepare('SELECT * FROM planning_periods WHERE id = ?'),
      'SELECT'
    ).get(id);
    
    if (!existing) {
      return res.status(404).json({ error: 'Sprint not found' });
    }
    
    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Sprint name is required' });
    }
    if (!start_date) {
      return res.status(400).json({ error: 'Start date is required' });
    }
    if (!end_date) {
      return res.status(400).json({ error: 'End date is required' });
    }
    if (new Date(end_date) < new Date(start_date)) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }
    
    // If this sprint is being set as active, deactivate all others
    if (is_active) {
      wrapQuery(
        db.prepare('UPDATE planning_periods SET is_active = 0 WHERE is_active = 1 AND id != ?'),
        'UPDATE'
      ).run(id);
    }
    
    wrapQuery(
      db.prepare(`
        UPDATE planning_periods
        SET name = ?, start_date = ?, end_date = ?, is_active = ?, description = ?, updated_at = ?
        WHERE id = ?
      `),
      'UPDATE'
    ).run(
      name.trim(),
      start_date,
      end_date,
      is_active ? 1 : 0,
      description?.trim() || null,
      new Date().toISOString(),
      id
    );
    
    const updated = wrapQuery(
      db.prepare('SELECT * FROM planning_periods WHERE id = ?'),
      'SELECT'
    ).get(id);
    
    res.json(updated);
  } catch (error) {
    console.error('Failed to update sprint:', error);
    res.status(500).json({ error: 'Failed to update sprint' });
  }
});

// DELETE /api/admin/sprints/:id - Delete a sprint
router.delete('/:id', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { db } = req.app.locals;
    const { id } = req.params;
    
    // Check if sprint exists
    const existing = wrapQuery(
      db.prepare('SELECT * FROM planning_periods WHERE id = ?'),
      'SELECT'
    ).get(id);
    
    if (!existing) {
      return res.status(404).json({ error: 'Sprint not found' });
    }
    
    wrapQuery(
      db.prepare('DELETE FROM planning_periods WHERE id = ?'),
      'DELETE'
    ).run(id);
    
    res.json({ success: true, message: 'Sprint deleted successfully' });
  } catch (error) {
    console.error('Failed to delete sprint:', error);
    res.status(500).json({ error: 'Failed to delete sprint' });
  }
});

export default router;

