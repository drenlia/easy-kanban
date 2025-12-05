import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import notificationService from '../services/notificationService.js';
import { getRequestDatabase } from '../middleware/tenantRouting.js';
import { dbTransaction, isProxyDatabase, isPostgresDatabase } from '../utils/dbAsync.js';

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
    const priorities = await wrapQuery(db.prepare('SELECT * FROM priorities ORDER BY position ASC'), 'SELECT').all();
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
    // First get the priority name from the priority ID
    const priority = await wrapQuery(db.prepare('SELECT priority FROM priorities WHERE id = ?'), 'SELECT').get(priorityId);
    if (!priority) {
      return res.status(404).json({ error: 'Priority not found' });
    }
    
    // Count tasks that use this priority (by priority_id)
    const usageCount = await wrapQuery(db.prepare('SELECT COUNT(*) as count FROM tasks WHERE priority_id = ?'), 'SELECT').get(priorityId);
    res.json({ count: usageCount.count });
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
    
    // Batch fetch all usage counts in one query
    const placeholders = priorityIds.map(() => '?').join(',');
    const usageCounts = await wrapQuery(db.prepare(`
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
router.get('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const priorities = await wrapQuery(db.prepare('SELECT * FROM priorities ORDER BY position ASC'), 'SELECT').all();
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
    const maxPosition = await wrapQuery(db.prepare('SELECT MAX(position) as maxPos FROM priorities'), 'SELECT').get();
    const position = (maxPosition?.maxPos || -1) + 1;
    
    // Insert the priority
    // For PostgreSQL, we'll query by priority name (unique) after insert
    // For SQLite, we can use lastInsertRowid
    const isPostgres = isPostgresDatabase(db);
    let newPriority;
    
    if (isPostgres) {
      // PostgreSQL: Insert and then query by unique priority name
      await wrapQuery(db.prepare(`
        INSERT INTO priorities (priority, color, position, initial) 
        VALUES ($1, $2, $3, 0)
      `), 'INSERT').run(priority, color, position);
      
      // Query by priority name (unique constraint) to get the full record
      newPriority = await wrapQuery(db.prepare('SELECT * FROM priorities WHERE priority = $1'), 'SELECT').get(priority);
    } else {
      // SQLite: Use lastInsertRowid
      const result = await wrapQuery(db.prepare(`
        INSERT INTO priorities (priority, color, position, initial) 
        VALUES (?, ?, ?, 0)
      `), 'INSERT').run(priority, color, position);
      
      newPriority = await wrapQuery(db.prepare('SELECT * FROM priorities WHERE id = ?'), 'SELECT').get(result.lastInsertRowid);
    }
    
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
    
    // Update positions in a transaction
    const priorityUpdates = priorities.map((priority, index) => ({
      id: priority.id,
      position: index
    }));
    
    if (isProxyDatabase(db)) {
      // Proxy mode: Collect all queries and send as batch
      const batchQueries = [];
      const updateQuery = 'UPDATE priorities SET position = ? WHERE id = ?';
      
      for (const update of priorityUpdates) {
        batchQueries.push({
          query: updateQuery,
          params: [update.position, update.id]
        });
      }
      
      // Execute all updates in a single batched transaction
      await db.executeBatchTransaction(batchQueries);
    } else {
      // Direct DB mode: Use standard transaction
      await dbTransaction(db, async () => {
        for (const update of priorityUpdates) {
          await wrapQuery(db.prepare('UPDATE priorities SET position = ? WHERE id = ?'), 'UPDATE').run(update.position, update.id);
        }
      });
    }
    
    // Return updated priorities
    const updatedPriorities = await wrapQuery(db.prepare('SELECT * FROM priorities ORDER BY position ASC'), 'SELECT').all();
    
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
    await wrapQuery(db.prepare(`
      UPDATE priorities SET priority = ?, color = ? WHERE id = ?
    `), 'UPDATE').run(priority, color, priorityId);
    
    const updatedPriority = await wrapQuery(db.prepare('SELECT * FROM priorities WHERE id = ?'), 'SELECT').get(priorityId);
    
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
    // Get priority info before deletion for Redis publishing
    const priorityToDelete = await wrapQuery(db.prepare('SELECT * FROM priorities WHERE id = ?'), 'SELECT').get(priorityId);
    
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
    const defaultPriority = await wrapQuery(db.prepare('SELECT * FROM priorities WHERE initial = 1'), 'SELECT').get();
    
    if (!defaultPriority) {
      return res.status(400).json({ 
        error: 'Cannot delete priority: no default priority is set. Please set a default priority first.'
      });
    }
    
    // Check if priority is being used (by priority_id)
    // For PostgreSQL, use lowercase column name with alias to preserve camelCase
    const isPostgres = isPostgresDatabase(db);
    const tasksQuery = isPostgres
      ? `SELECT id, ticket, title, boardid as "boardId" FROM tasks WHERE priority_id = $1 ORDER BY ticket`
      : `SELECT id, ticket, title, boardId FROM tasks WHERE priority_id = ? ORDER BY ticket`;
    const tasksUsingPriority = await wrapQuery(db.prepare(tasksQuery), 'SELECT').all(priorityId);
    
    // Use transaction to ensure atomicity
    await dbTransaction(db, async () => {
      // If priority is in use, reassign all tasks to the default priority (by priority_id)
      if (tasksUsingPriority.length > 0) {
        console.log(`📋 Reassigning ${tasksUsingPriority.length} tasks from priority ID ${priorityId} to default priority "${defaultPriority.priority}" (ID: ${defaultPriority.id})`);
        
        await wrapQuery(db.prepare(`
          UPDATE tasks 
          SET priority_id = ?, priority = ? 
          WHERE priority_id = ?
        `), 'UPDATE').run(defaultPriority.id, defaultPriority.priority, priorityId);
        
        console.log(`✅ Reassigned ${tasksUsingPriority.length} tasks to default priority`);
      }
      
      // Now delete the priority
      await wrapQuery(db.prepare('DELETE FROM priorities WHERE id = ?'), 'DELETE').run(priorityId);
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
          // Fetch updated task data with priority information (including color)
          // This ensures the frontend receives complete priority data for proper display
          const updatedTask = await wrapQuery(
            db.prepare(`
              SELECT t.*, 
                     p.id as priorityId,
                     p.priority as priorityName,
                     p.color as priorityColor
              FROM tasks t
              LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
              WHERE t.id = ?
            `),
            'SELECT'
          ).get(task.id);
          
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
    // Check if priority exists
    const priority = await wrapQuery(db.prepare('SELECT * FROM priorities WHERE id = ?'), 'SELECT').get(priorityId);
    if (!priority) {
      return res.status(404).json({ error: 'Priority not found' });
    }

    // Start transaction to ensure only one priority can be default
    await dbTransaction(db, async () => {
      // First, remove default flag from all priorities
      await wrapQuery(db.prepare('UPDATE priorities SET initial = 0'), 'UPDATE').run();
      // Then set the specified priority as default
      await wrapQuery(db.prepare('UPDATE priorities SET initial = 1 WHERE id = ?'), 'UPDATE').run(priorityId);
    });

    // Return updated priority
    const updatedPriority = await wrapQuery(db.prepare('SELECT * FROM priorities WHERE id = ?'), 'SELECT').get(priorityId);
    res.json(updatedPriority);
  } catch (error) {
    console.error('Error setting default priority:', error);
    res.status(500).json({ error: 'Failed to set default priority' });
  }
});

export default router;

