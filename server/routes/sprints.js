import express from 'express';
import crypto from 'crypto';
import { wrapQuery } from '../utils/queryLogger.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import notificationService from '../services/notificationService.js';
import { getRequestDatabase } from '../middleware/tenantRouting.js';
import { dbTransaction } from '../utils/dbAsync.js';
import { sprints as sprintQueries, tasks as taskQueries } from '../utils/sqlManager/index.js';

const router = express.Router();

// GET /api/admin/sprints - Get all planning periods/sprints (accessible to all authenticated users for filtering)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    
    // MIGRATED: Use sqlManager to get all sprints
    const sprints = await sprintQueries.getAllSprints(db);
    
    res.json({ sprints });
  } catch (error) {
    console.error('Failed to fetch sprints:', error);
    res.status(500).json({ error: 'Failed to fetch sprints' });
  }
});

// GET /api/admin/sprints/active - Get currently active sprint (must come before /:id routes)
router.get('/active', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    
    // MIGRATED: Use sqlManager to get active sprint
    const activeSprint = await sprintQueries.getActiveSprint(db);
    
    if (!activeSprint) {
      return res.status(404).json({ error: 'No active sprint found' });
    }
    
    res.json(activeSprint);
  } catch (error) {
    console.error('Failed to fetch active sprint:', error);
    res.status(500).json({ error: 'Failed to fetch active sprint' });
  }
});

// GET /api/admin/sprints/:id/usage - Get sprint usage count (for deletion confirmation)
// This route must come before the PUT /:id and DELETE /:id routes
router.get("/:id/usage", authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { id } = req.params;
    
    // MIGRATED: Check if sprint exists using sqlManager
    const sprint = await sprintQueries.getSprintById(db, id);
    
    if (!sprint) {
      return res.status(404).json({ error: 'Sprint not found' });
    }
    
    // MIGRATED: Get usage count using sqlManager
    const count = await sprintQueries.getSprintUsageCount(db, id);
    res.json({ count });
  } catch (error) {
    console.error('Error fetching sprint usage:', error);
    res.status(500).json({ error: 'Failed to fetch sprint usage' });
  }
});

// POST /api/admin/sprints - Create a new sprint
router.post('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = getRequestDatabase(req);
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
    
    // MIGRATED: If this sprint is being set as active, deactivate all others using sqlManager
    if (is_active) {
      await sprintQueries.deactivateAllSprints(db);
    }
    
    // MIGRATED: Create sprint using sqlManager
    const newSprint = await sprintQueries.createSprint(
      db, 
      sprintId, 
      name, 
      start_date, 
      end_date, 
      is_active, 
      description
    );
    
    // Publish to Redis for real-time updates
    console.log('📤 Publishing sprint-created to Redis');
    await notificationService.publish('sprint-created', {
      sprint: newSprint,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Sprint-created published to Redis');
    
    res.status(201).json(newSprint);
  } catch (error) {
    console.error('Failed to create sprint:', error);
    res.status(500).json({ error: 'Failed to create sprint' });
  }
});

// PUT /api/admin/sprints/:id - Update a sprint
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { id } = req.params;
    const { name, start_date, end_date, is_active, description } = req.body;
    
    // MIGRATED: Check if sprint exists using sqlManager
    const existing = await sprintQueries.getSprintById(db, id);
    
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
    
    // MIGRATED: If this sprint is being set as active, deactivate all others using sqlManager
    if (is_active) {
      await sprintQueries.deactivateAllSprintsExcept(db, id);
    }
    
    // MIGRATED: Update sprint using sqlManager
    const updated = await sprintQueries.updateSprint(
      db, 
      id, 
      name, 
      start_date, 
      end_date, 
      is_active, 
      description
    );
    
    // Publish to Redis for real-time updates
    console.log('📤 Publishing sprint-updated to Redis');
    await notificationService.publish('sprint-updated', {
      sprint: updated,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Sprint-updated published to Redis');
    
    res.json(updated);
  } catch (error) {
    console.error('Failed to update sprint:', error);
    res.status(500).json({ error: 'Failed to update sprint' });
  }
});

// DELETE /api/admin/sprints/:id - Delete a sprint
router.delete('/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { id } = req.params;
    
    // MIGRATED: Check if sprint exists using sqlManager
    const existing = await sprintQueries.getSprintById(db, id);
    
    if (!existing) {
      return res.status(404).json({ error: 'Sprint not found' });
    }
    
    // MIGRATED: Get tasks using this sprint using sqlManager
    const tasksUsingSprint = await sprintQueries.getTasksUsingSprint(db, id);
    
    // Use transaction to ensure atomicity
    await dbTransaction(db, async () => {
      // MIGRATED: If sprint is in use, unassign tasks using sqlManager
      if (tasksUsingSprint.length > 0) {
        console.log(`📋 Removing sprint assignment from ${tasksUsingSprint.length} tasks`);
        
        await sprintQueries.unassignTasksFromSprint(db, id);
        
        console.log(`✅ Removed sprint assignment from ${tasksUsingSprint.length} tasks`);
      }
      
      // MIGRATED: Delete the sprint using sqlManager
      await sprintQueries.deleteSprint(db, id);
    });
    
    // Publish to Redis for real-time updates
    console.log('📤 Publishing sprint-deleted to Redis');
    await notificationService.publish('sprint-deleted', {
      sprintId: id,
      sprint: existing,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Sprint-deleted published to Redis');
    
    // If tasks were updated, publish task updates for each affected board
    if (tasksUsingSprint.length > 0) {
      // Group tasks by board for efficient updates
      const tasksByBoard = tasksUsingSprint.reduce((acc, task) => {
        if (!acc[task.boardId]) acc[task.boardId] = [];
        acc[task.boardId].push(task);
        return acc;
      }, {});
      
      // Publish updates for each board
      for (const [boardId, tasks] of Object.entries(tasksByBoard)) {
        console.log(`📤 Publishing ${tasks.length} task updates for board ${boardId}`);
        
        for (const task of tasks) {
          // MIGRATED: Fetch updated task data using sqlManager
          const updatedTask = await taskQueries.getTaskWithRelationships(db, task.id);
          
          if (updatedTask) {
            await notificationService.publish('task-updated', {
              boardId: boardId,
              task: updatedTask,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
      
      console.log(`✅ Published task updates for ${tasksUsingSprint.length} tasks`);
    }
    
    res.json({ 
      success: true, 
      message: 'Sprint deleted successfully',
      unassignedTasks: tasksUsingSprint.length
    });
  } catch (error) {
    console.error('Failed to delete sprint:', error);
    res.status(500).json({ error: 'Failed to delete sprint' });
  }
});

export default router;

