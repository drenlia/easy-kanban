import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import redisService from '../services/redisService.js';
import { getRequestDatabase } from '../middleware/tenantRouting.js';

const router = express.Router();

// Get all priorities (authenticated users only) - must come BEFORE admin routes
// Skip if mounted at /api/admin/priorities (admin routes will handle it)
router.get('/', authenticateToken, (req, res, next) => {
  // If this is mounted at /api/admin/priorities, skip to next handler (admin route)
  if (req.baseUrl === '/api/admin/priorities') {
    return next();
  }
  
  try {
    const db = getRequestDatabase(req);
    const priorities = wrapQuery(db.prepare('SELECT * FROM priorities ORDER BY position ASC'), 'SELECT').all();
    res.json(priorities);
  } catch (error) {
    console.error('Error fetching priorities:', error);
    res.status(500).json({ error: 'Failed to fetch priorities' });
  }
});

// Get priority usage count (for deletion confirmation)
router.get('/:priorityId/usage', authenticateToken, requireRole(['admin']), (req, res) => {
  const { priorityId } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    // First get the priority name from the priority ID
    const priority = wrapQuery(db.prepare('SELECT priority FROM priorities WHERE id = ?'), 'SELECT').get(priorityId);
    if (!priority) {
      return res.status(404).json({ error: 'Priority not found' });
    }
    
    // Count tasks that use this priority (by priority_id)
    const usageCount = wrapQuery(db.prepare('SELECT COUNT(*) as count FROM tasks WHERE priority_id = ?'), 'SELECT').get(priorityId);
    res.json({ count: usageCount.count });
  } catch (error) {
    console.error('Error fetching priority usage:', error);
    res.status(500).json({ error: 'Failed to fetch priority usage' });
  }
});

// Get batch priority usage counts (fixes N+1 problem)
router.get('/usage/batch', authenticateToken, requireRole(['admin']), (req, res) => {
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
    
    // Batch fetch all usage counts in one query
    const placeholders = priorityIds.map(() => '?').join(',');
    const usageCounts = wrapQuery(db.prepare(`
      SELECT priority_id, COUNT(*) as count 
      FROM tasks 
      WHERE priority_id IN (${placeholders})
      GROUP BY priority_id
    `), 'SELECT').all(...priorityIds);
    
    // Create map of usage counts by priorityId
    const usageMap = {};
    usageCounts.forEach(usage => {
      usageMap[usage.priority_id] = { count: usage.count };
    });
    
    // Include zero counts for priorities with no usage
    priorityIds.forEach(priorityId => {
      if (!usageMap[priorityId]) {
        usageMap[priorityId] = { count: 0 };
      }
    });
    
    res.json(usageMap);
  } catch (error) {
    console.error('Error fetching batch priority usage:', error);
    res.status(500).json({ error: 'Failed to fetch batch priority usage' });
  }
});

// Admin priorities endpoints
router.get('/', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const priorities = wrapQuery(db.prepare('SELECT * FROM priorities ORDER BY position ASC'), 'SELECT').all();
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
    // Get the next position
    const maxPosition = wrapQuery(db.prepare('SELECT MAX(position) as maxPos FROM priorities'), 'SELECT').get();
    const position = (maxPosition?.maxPos || -1) + 1;
    
    const result = wrapQuery(db.prepare(`
      INSERT INTO priorities (priority, color, position, initial) 
      VALUES (?, ?, ?, 0)
    `), 'INSERT').run(priority, color, position);
    
    const newPriority = wrapQuery(db.prepare('SELECT * FROM priorities WHERE id = ?'), 'SELECT').get(result.lastInsertRowid);
    
    // Publish to Redis for real-time updates
    console.log('📤 Publishing priority-created to Redis');
    await redisService.publish('priority-created', {
      priority: newPriority,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Priority-created published to Redis');
    
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
    
    // Update positions in a transaction
    const updatePosition = db.prepare('UPDATE priorities SET position = ? WHERE id = ?');
    const transaction = db.transaction((priorityUpdates) => {
      for (const update of priorityUpdates) {
        updatePosition.run(update.position, update.id);
      }
    });
    
    transaction(priorities.map((priority, index) => ({
      id: priority.id,
      position: index
    })));
    
    // Return updated priorities
    const updatedPriorities = db.prepare('SELECT * FROM priorities ORDER BY position ASC').all();
    
    // Publish to Redis for real-time updates
    console.log('📤 Publishing priority-reordered to Redis');
    await redisService.publish('priority-reordered', {
      priorities: updatedPriorities,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Priority-reordered published to Redis');
    
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
    wrapQuery(db.prepare(`
      UPDATE priorities SET priority = ?, color = ? WHERE id = ?
    `), 'UPDATE').run(priority, color, priorityId);
    
    const updatedPriority = wrapQuery(db.prepare('SELECT * FROM priorities WHERE id = ?'), 'SELECT').get(priorityId);
    
    // Publish to Redis for real-time updates
    console.log('📤 Publishing priority-updated to Redis');
    await redisService.publish('priority-updated', {
      priority: updatedPriority,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Priority-updated published to Redis');
    
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
    // Get priority info before deletion for Redis publishing
    const priorityToDelete = wrapQuery(db.prepare('SELECT * FROM priorities WHERE id = ?'), 'SELECT').get(priorityId);
    
    if (!priorityToDelete) {
      return res.status(404).json({ error: 'Priority not found' });
    }
    
    // Check if this is the default priority
    if (priorityToDelete.initial === 1) {
      return res.status(400).json({ 
        error: 'Cannot delete the default priority. Please set another priority as default first.'
      });
    }
    
    // Get the default priority to reassign tasks
    const defaultPriority = wrapQuery(db.prepare('SELECT * FROM priorities WHERE initial = 1'), 'SELECT').get();
    
    if (!defaultPriority) {
      return res.status(400).json({ 
        error: 'Cannot delete priority: no default priority is set. Please set a default priority first.'
      });
    }
    
    // Check if priority is being used (by priority_id)
    const tasksUsingPriority = wrapQuery(db.prepare(`
      SELECT id, ticket, title, boardId
      FROM tasks 
      WHERE priority_id = ?
      ORDER BY ticket
    `), 'SELECT').all(priorityId);
    
    // Use transaction to ensure atomicity
    db.transaction(() => {
      // If priority is in use, reassign all tasks to the default priority (by priority_id)
      if (tasksUsingPriority.length > 0) {
        console.log(`📋 Reassigning ${tasksUsingPriority.length} tasks from priority ID ${priorityId} to default priority "${defaultPriority.priority}" (ID: ${defaultPriority.id})`);
        
        wrapQuery(db.prepare(`
          UPDATE tasks 
          SET priority_id = ?, priority = ? 
          WHERE priority_id = ?
        `), 'UPDATE').run(defaultPriority.id, defaultPriority.priority, priorityId);
        
        console.log(`✅ Reassigned ${tasksUsingPriority.length} tasks to default priority`);
      }
      
      // Now delete the priority
      wrapQuery(db.prepare('DELETE FROM priorities WHERE id = ?'), 'DELETE').run(priorityId);
    })();
    
    // Publish priority deletion to Redis for real-time updates
    console.log('📤 Publishing priority-deleted to Redis');
    await redisService.publish('priority-deleted', {
      priorityId: priorityId,
      priority: priorityToDelete,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Priority-deleted published to Redis');
    
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
          // Fetch updated task data
          const updatedTask = wrapQuery(db.prepare('SELECT * FROM tasks WHERE id = ?'), 'SELECT').get(task.id);
          
          if (updatedTask) {
            await redisService.publish('task-updated', {
              boardId: boardId,
              task: updatedTask,
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

router.put('/:priorityId/set-default', authenticateToken, requireRole(['admin']), (req, res) => {
  const { priorityId } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    // Check if priority exists
    const priority = wrapQuery(db.prepare('SELECT * FROM priorities WHERE id = ?'), 'SELECT').get(priorityId);
    if (!priority) {
      return res.status(404).json({ error: 'Priority not found' });
    }

    // Start transaction to ensure only one priority can be default
    db.transaction(() => {
      // First, remove default flag from all priorities
      wrapQuery(db.prepare('UPDATE priorities SET initial = 0'), 'UPDATE').run();
      // Then set the specified priority as default
      wrapQuery(db.prepare('UPDATE priorities SET initial = 1 WHERE id = ?'), 'UPDATE').run(priorityId);
    })();

    // Return updated priority
    const updatedPriority = wrapQuery(db.prepare('SELECT * FROM priorities WHERE id = ?'), 'SELECT').get(priorityId);
    res.json(updatedPriority);
  } catch (error) {
    console.error('Error setting default priority:', error);
    res.status(500).json({ error: 'Failed to set default priority' });
  }
});

export default router;

