import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import notificationService from '../services/notificationService.js';
import { getRequestDatabase } from '../middleware/tenantRouting.js';
import { dbTransaction, isProxyDatabase, isPostgresDatabase } from '../utils/dbAsync.js';
import { priorities as priorityQueries } from '../utils/sqlManager/index.js';
import { tasks as taskQueries } from '../utils/sqlManager/index.js';

const router = express.Router();

// Helper to get the actual notification system being used (for accurate logging)
const getNotificationSystem = () => {
  return process.env.DB_TYPE === 'postgresql' ? 'PostgreSQL' : 'Redis';
};

// Get all priorities (authenticated users only) - must come BEFORE admin routes
// Skip if mounted at /api/admin/priorities (admin routes will handle it)
router.get('/', authenticateToken, async (req, res, next) => {
  // If this is mounted at /api/admin/priorities, skip to next handler (admin route)
  if (req.baseUrl === '/api/admin/priorities') {
    return next();
  }
  
  try {
    const db = getRequestDatabase(req);
    // MIGRATED: Use sqlManager to get all priorities
    const priorities = await priorityQueries.getAllPriorities(db);
    res.json(priorities);
  } catch (error) {
    console.error('Error fetching priorities:', error);
    res.status(500).json({ error: 'Failed to fetch priorities' });
  }
});

// Get priority usage count (for deletion confirmation)
router.get('/:priorityId/usage', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { priorityId } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    // MIGRATED: Check if priority exists using sqlManager
    const priority = await priorityQueries.getPriorityById(db, parseInt(priorityId));
    if (!priority) {
      return res.status(404).json({ error: 'Priority not found' });
    }
    
    // MIGRATED: Get usage count using sqlManager
    const count = await priorityQueries.getPriorityUsageCount(db, parseInt(priorityId));
    res.json({ count });
  } catch (error) {
    console.error('Error fetching priority usage:', error);
    res.status(500).json({ error: 'Failed to fetch priority usage' });
  }
});

// Get batch priority usage counts (fixes N+1 problem)
router.get('/usage/batch', authenticateToken, requireRole(['admin']), async (req, res) => {
  const db = getRequestDatabase(req);
  
  try {
    // Get all priority IDs from query params
    // Handle both array format (?priorityIds=id1&priorityIds=id2) and comma-separated (?priorityIds=id1,id2)
    let priorityIds = [];
    if (req.query.priorityIds) {
      if (Array.isArray(req.query.priorityIds)) {
        priorityIds = req.query.priorityIds.filter(id => id);
      } else if (typeof req.query.priorityIds === 'string') {
        // Handle comma-separated string
        priorityIds = req.query.priorityIds.split(',').map(id => id.trim()).filter(id => id);
      }
    }
    
    if (priorityIds.length === 0) {
      return res.json({});
    }
    
    // MIGRATED: Get batch usage counts using sqlManager
    const priorityIdsInt = priorityIds.map(id => parseInt(id));
    const usageMap = await priorityQueries.getBatchPriorityUsageCounts(db, priorityIdsInt);
    
    res.json(usageMap);
  } catch (error) {
    console.error('Error fetching batch priority usage:', error);
    res.status(500).json({ error: 'Failed to fetch batch priority usage' });
  }
});

// Admin priorities endpoints
router.get('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    // MIGRATED: Use sqlManager to get all priorities
    const priorities = await priorityQueries.getAllPriorities(db);
    res.json(priorities);
  } catch (error) {
    console.error('Error fetching admin priorities:', error);
    res.status(500).json({ error: 'Failed to fetch priorities' });
  }
});

router.post('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { priority, color } = req.body;
  const db = getRequestDatabase(req);
  
  if (!priority || !color) {
    return res.status(400).json({ error: 'Priority name and color are required' });
  }

  try {
    // MIGRATED: Get the next position using sqlManager
    const maxPosition = await priorityQueries.getMaxPriorityPosition(db);
    const position = maxPosition + 1;
    
    // MIGRATED: Create priority using sqlManager
    const newPriority = await priorityQueries.createPriority(db, priority, color, position);
    
    // Publish to Redis for real-time updates
    console.log(`📤 Publishing priority-created via ${getNotificationSystem()}`);
    await notificationService.publish('priority-created', {
      priority: newPriority,
      timestamp: new Date().toISOString()
    });
    console.log(`✅ Priority-created published via ${getNotificationSystem()}`);
    
    res.json(newPriority);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Priority already exists' });
    }
    console.error('Error creating priority:', error);
    res.status(500).json({ error: 'Failed to create priority' });
  }
});

// Reorder priorities (must come before :priorityId route)
router.put('/reorder', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { priorities } = req.body;
  const db = getRequestDatabase(req);
  
  try {
    if (!Array.isArray(priorities)) {
      return res.status(400).json({ error: 'Priorities array is required' });
    }
    
    // MIGRATED: Update positions using sqlManager
    const priorityUpdates = priorities.map((priority, index) => ({
      id: priority.id,
      position: index
    }));
    
    // Use transaction to ensure atomicity
    await dbTransaction(db, async () => {
      await priorityQueries.updatePriorityPositions(db, priorityUpdates);
    });
    
    // MIGRATED: Return updated priorities using sqlManager
    const updatedPriorities = await priorityQueries.getAllPriorities(db);
    
    // Publish to Redis for real-time updates
    console.log(`📤 Publishing priority-reordered via ${getNotificationSystem()}`);
    await notificationService.publish('priority-reordered', {
      priorities: updatedPriorities,
      timestamp: new Date().toISOString()
    });
    console.log(`✅ Priority-reordered published via ${getNotificationSystem()}`);
    
    res.json(updatedPriorities);
  } catch (error) {
    console.error('Reorder priorities error:', error);
    res.status(500).json({ error: 'Failed to reorder priorities' });
  }
});

router.put('/:priorityId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { priorityId } = req.params;
  const { priority, color } = req.body;
  const db = getRequestDatabase(req);
  
  if (!priority || !color) {
    return res.status(400).json({ error: 'Priority name and color are required' });
  }

  try {
    // MIGRATED: Update priority using sqlManager
    const updatedPriority = await priorityQueries.updatePriority(db, parseInt(priorityId), priority, color);
    
    // Publish to Redis for real-time updates
    console.log(`📤 Publishing priority-updated via ${getNotificationSystem()}`);
    await notificationService.publish('priority-updated', {
      priority: updatedPriority,
      timestamp: new Date().toISOString()
    });
    console.log(`✅ Priority-updated published via ${getNotificationSystem()}`);
    
    res.json(updatedPriority);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Priority already exists' });
    }
    console.error('Error updating priority:', error);
    res.status(500).json({ error: 'Failed to update priority' });
  }
});

router.delete('/:priorityId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { priorityId } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    // MIGRATED: Get priority info before deletion using sqlManager
    const priorityToDelete = await priorityQueries.getPriorityById(db, parseInt(priorityId));
    
    if (!priorityToDelete) {
      return res.status(404).json({ error: 'Priority not found' });
    }
    
    // Check if this is the default priority
    if (priorityToDelete.initial === 1) {
      return res.status(400).json({ 
        error: 'Cannot delete the default priority. Please set another priority as default first.'
      });
    }
    
    // MIGRATED: Get the default priority using sqlManager
    const defaultPriority = await priorityQueries.getDefaultPriority(db);
    
    if (!defaultPriority) {
      return res.status(400).json({ 
        error: 'Cannot delete priority: no default priority is set. Please set a default priority first.'
      });
    }
    
    // MIGRATED: Get tasks using this priority using sqlManager
    const tasksUsingPriority = await priorityQueries.getTasksUsingPriority(db, parseInt(priorityId));
    
    // Use transaction to ensure atomicity
    await dbTransaction(db, async () => {
      // If priority is in use, reassign all tasks to the default priority
      if (tasksUsingPriority.length > 0) {
        console.log(`📋 Reassigning ${tasksUsingPriority.length} tasks from priority ID ${priorityId} to default priority "${defaultPriority.priority}" (ID: ${defaultPriority.id})`);
        
        // MIGRATED: Reassign tasks using sqlManager
        await priorityQueries.reassignTasksPriority(
          db, 
          parseInt(priorityId), 
          defaultPriority.id, 
          defaultPriority.priority
        );
        
        console.log(`✅ Reassigned ${tasksUsingPriority.length} tasks to default priority`);
      }
      
      // MIGRATED: Delete the priority using sqlManager
      await priorityQueries.deletePriority(db, parseInt(priorityId));
    });
    
    // Publish priority deletion for real-time updates
    console.log(`📤 Publishing priority-deleted via ${getNotificationSystem()}`);
    await notificationService.publish('priority-deleted', {
      priorityId: priorityId,
      priority: priorityToDelete,
      timestamp: new Date().toISOString()
    });
    console.log(`✅ Priority-deleted published via ${getNotificationSystem()}`);
    
    // If tasks were reassigned, publish task updates for each affected board
    if (tasksUsingPriority.length > 0) {
      // Group tasks by board for efficient updates
      const tasksByBoard = tasksUsingPriority.reduce((acc, task) => {
        if (!acc[task.boardId]) acc[task.boardId] = [];
        acc[task.boardId].push(task);
        return acc;
      }, {});
      
      // Publish updates for each board
      for (const [boardId, tasks] of Object.entries(tasksByBoard)) {
        console.log(`📤 Publishing ${tasks.length} task updates for board ${boardId}`);
        
        for (const task of tasks) {
          // MIGRATED: Fetch updated task data with priority information using sqlManager
          const updatedTask = await taskQueries.getTaskWithRelationships(db, task.id);
          
          if (updatedTask) {
            // Ensure priority fields are properly set for frontend
            // CRITICAL: Use priorityName from JOIN only - never use task.priority (text field can be stale)
            const priorityId = updatedTask.priorityId || updatedTask.priority_id || null;
            const priorityName = updatedTask.priorityName || null; // Use JOIN value only, not task.priority
            const priorityColor = updatedTask.priorityColor || null;
            
            // Build clean task object with explicit priority fields
            // CRITICAL: Exclude the stale priority field from tasks table, use priorityName from JOIN only
            // This ensures the frontend receives the correct priority data and overrides any cached values
            const { priority: stalePriority, priority_id: stalePriorityId, ...taskWithoutStalePriority } = updatedTask;
            const cleanTask = {
              ...taskWithoutStalePriority,
              // Explicitly set priority fields from JOIN (source of truth)
              priority: priorityName, // Use priorityName from JOIN, not stale tasks.priority field
              priorityId: priorityId,
              priorityName: priorityName,
              priorityColor: priorityColor
            };
            
            await notificationService.publish('task-updated', {
              boardId: boardId,
              task: cleanTask,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
      
      console.log(`✅ Published task updates for ${tasksUsingPriority.length} reassigned tasks`);
    }
    
    res.json({ 
      message: 'Priority deleted successfully',
      reassignedTasks: tasksUsingPriority.length
    });
  } catch (error) {
    console.error('Error deleting priority:', error);
    res.status(500).json({ error: 'Failed to delete priority' });
  }
});

router.put('/:priorityId/set-default', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { priorityId } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    // MIGRATED: Check if priority exists using sqlManager
    const priority = await priorityQueries.getPriorityById(db, parseInt(priorityId));
    if (!priority) {
      return res.status(404).json({ error: 'Priority not found' });
    }

    // MIGRATED: Set default priority using sqlManager (within transaction)
    await dbTransaction(db, async () => {
      await priorityQueries.setDefaultPriority(db, parseInt(priorityId));
    });

    // MIGRATED: Return updated priority using sqlManager
    const updatedPriority = await priorityQueries.getPriorityById(db, parseInt(priorityId));
    res.json(updatedPriority);
  } catch (error) {
    console.error('Error setting default priority:', error);
    res.status(500).json({ error: 'Failed to set default priority' });
  }
});

export default router;

