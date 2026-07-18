import crypto from 'crypto';
import { wrapQuery } from '../utils/queryLogger.js';
import notificationService from '../services/notificationService.js';

/**
 * Create daily snapshots of all tasks for historical reporting
 * @param {Database} db - SQLite database instance
 */
export const createDailyTaskSnapshots = async (db) => {
  try {
    const startTime = Date.now();
    console.log('📸 Starting daily task snapshots...');
    
    // Get all tasks with their current state (excluding archived columns)
    const tasks = await wrapQuery(db.prepare(`
      SELECT 
        t.id, t.title, t.ticket, t.description, t.effort, t.priority,
        t.startdate as "startDate", t.duedate as "dueDate", t.created_at,
        t.boardid as "boardId", b.title as board_name,
        t.columnid as "columnId", c.title as column_name, c.is_finished as is_done,
        t.memberid as "memberId", m.name as assignee_name,
        t.requesterid as "requesterId", r.name as requester_name
      FROM tasks t
      LEFT JOIN boards b ON t.boardid = b.id
      LEFT JOIN columns c ON t.columnid = c.id
      LEFT JOIN members m ON t.memberid = m.id
      LEFT JOIN members r ON t.requesterid = r.id
      WHERE (c.is_archived IS NULL OR c.is_archived = false)
    `), 'SELECT').all();
    
    if (tasks.length === 0) {
      console.log('ℹ️  No tasks to snapshot');
      return;
    }
    
    const snapshotDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const taskIds = tasks.map(t => t.id);
    
    // Initialize maps for batch data
    const tagsByTaskId = new Map();
    const watchersByTaskId = new Map();
    const collaboratorsByTaskId = new Map();
    const existingByTaskId = new Map();
    
    // Batch fetch all data if we have tasks (fixes N+1 problem)
    if (taskIds.length > 0) {
      const placeholders = taskIds.map((_, i) => `$${i + 1}`).join(',');
      
      // Batch fetch all tags for all tasks
      const allTags = await wrapQuery(db.prepare(`
        SELECT tt.taskid as "taskId", t.tag as name 
        FROM task_tags tt
        JOIN tags t ON tt.tagid = t.id
        WHERE tt.taskid IN (${placeholders})
      `), 'SELECT').all(...taskIds);
      
      // Group tags by task id
      allTags.forEach(tag => {
        if (!tagsByTaskId.has(tag.taskId)) {
          tagsByTaskId.set(tag.taskId, []);
        }
        tagsByTaskId.get(tag.taskId).push({ name: tag.name });
      });
      
      // Batch fetch all watchers counts
      const watchersPlaceholders = taskIds.map((_, i) => `$${i + 1}`).join(',');
      const watchersCounts = await wrapQuery(db.prepare(`
        SELECT taskid, COUNT(*) as count 
        FROM watchers
        WHERE taskid IN (${watchersPlaceholders})
        GROUP BY taskid
      `), 'SELECT').all(...taskIds);
      
      // Create map of watchers counts by taskId
      watchersCounts.forEach(w => watchersByTaskId.set(w.taskid, w.count));
      
      // Batch fetch all collaborators counts
      const collabPlaceholders = taskIds.map((_, i) => `$${i + 1}`).join(',');
      const collaboratorsCounts = await wrapQuery(db.prepare(`
        SELECT taskid, COUNT(*) as count 
        FROM collaborators
        WHERE taskid IN (${collabPlaceholders})
        GROUP BY taskid
      `), 'SELECT').all(...taskIds);
      
      // Create map of collaborators counts by taskId
      collaboratorsCounts.forEach(c => collaboratorsByTaskId.set(c.taskid, c.count));
      
      // Batch check for existing snapshots
      const existingPlaceholders = taskIds.map((_, i) => `$${i + 1}`).join(',');
      const snapshotDateParam = `$${taskIds.length + 1}`;
      const existingSnapshots = await wrapQuery(db.prepare(`
        SELECT id, task_id 
        FROM task_snapshots
        WHERE task_id IN (${existingPlaceholders}) AND snapshot_date = ${snapshotDateParam}
      `), 'SELECT').all(...taskIds, snapshotDate);
      
      // Create map of existing snapshot IDs by taskId
      existingSnapshots.forEach(s => existingByTaskId.set(s.task_id, s.id));
    }
    
    let newSnapshotCount = 0;
    let updatedSnapshotCount = 0;
    const now = new Date().toISOString();

    // Process all tasks in a single batched transaction
    const batchQueries = [];
    const updateQuery = `
      UPDATE task_snapshots SET
        task_title = $1,
        task_ticket = $2,
        task_description = $3,
        board_id = $4,
        board_name = $5,
        column_id = $6,
        column_name = $7,
        assignee_id = $8,
        assignee_name = $9,
        requester_id = $10,
        requester_name = $11,
        effort_points = $12,
        priority_name = $13,
        start_date = $14,
        due_date = $15,
        is_completed = $16,
        tags = $17,
        watchers_count = $18,
        collaborators_count = $19,
        updated_at = $20
      WHERE id = $21
    `;
    const insertQuery = `
      INSERT INTO task_snapshots (
        id, task_id, task_title, task_ticket, task_description,
        board_id, board_name,
        column_id, column_name,
        assignee_id, assignee_name,
        requester_id, requester_name,
        effort_points, priority_name,
        start_date, due_date,
        is_completed, tags,
        watchers_count, collaborators_count,
        snapshot_date, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
    `;
    
    for (const task of tasks) {
      try {
        const tags = tagsByTaskId.get(task.id) || [];
        const watchersCount = watchersByTaskId.get(task.id) || 0;
        const collaboratorsCount = collaboratorsByTaskId.get(task.id) || 0;
        const existingId = existingByTaskId.get(task.id);
        
        if (existingId) {
          // Update existing snapshot (in case task changed during the day)
          batchQueries.push({
            query: updateQuery,
            params: [
              task.title,
              task.ticket,
              task.description,
              task.boardId,
              task.board_name,
              task.columnId,
              task.column_name,
              task.memberId,
              task.assignee_name,
              task.requesterId,
              task.requester_name,
              task.effort,
              task.priority,
              task.startDate,
              task.dueDate,
              Boolean(task.is_done),
              tags.length > 0 ? JSON.stringify(tags) : null,
              watchersCount,
              collaboratorsCount,
              now,
              existingId
            ]
          });
          updatedSnapshotCount++;
        } else {
          // Create new snapshot
          const snapshotId = crypto.randomUUID();
          batchQueries.push({
            query: insertQuery,
            params: [
              snapshotId,
              task.id,
              task.title,
              task.ticket,
              task.description,
              task.boardId,
              task.board_name,
              task.columnId,
              task.column_name,
              task.memberId,
              task.assignee_name,
              task.requesterId,
              task.requester_name,
              task.effort,
              task.priority,
              task.startDate,
              task.dueDate,
              Boolean(task.is_done),
              tags.length > 0 ? JSON.stringify(tags) : null,
              watchersCount,
              collaboratorsCount,
              snapshotDate,
              now
            ]
          });
          newSnapshotCount++;
        }
      } catch (taskError) {
        console.error(`❌ Failed to snapshot task ${task.id}:`, taskError);
      }
    }
    
    // Execute all inserts/updates in a single batched transaction
    if (batchQueries.length > 0) {
      await db.executeBatchTransaction(batchQueries);
    }

    
    const duration = Date.now() - startTime;
    const totalSnapshots = newSnapshotCount + updatedSnapshotCount;
    console.log(`✅ Task snapshots completed: ${newSnapshotCount} new, ${updatedSnapshotCount} updated (${totalSnapshots} total) in ${duration}ms`);
    
    // Broadcast snapshot update to all connected clients via WebSocket
    try {
      await notificationService.publish('task-snapshots-updated', {
        snapshotDate,
        taskCount: tasks.length,
        newSnapshots: newSnapshotCount,
        updatedSnapshots: updatedSnapshotCount,
        timestamp: new Date().toISOString()
      });
      console.log('✅ Task snapshots update broadcasted via Redis');
    } catch (publishError) {
      console.error('❌ Failed to publish task snapshots update:', publishError);
      // Don't fail the entire job if broadcasting fails
    }
    
    return { 
      success: true, 
      count: totalSnapshots, 
      newCount: newSnapshotCount, 
      updatedCount: updatedSnapshotCount, 
      duration 
    };
  } catch (error) {
    console.error('❌ Failed to create daily task snapshots:', error);
    throw error;
  }
};

/**
 * Clean up old snapshots beyond retention period
 * @param {Database} db - SQLite database instance
 * @param {number} retentionDays - Number of days to retain (default: 730 = 2 years)
 */
export const cleanupOldSnapshots = async (db, retentionDays = 730) => {
  try {
    console.log(`🧹 Cleaning up snapshots older than ${retentionDays} days...`);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
    
    const result = await wrapQuery(db.prepare(`
      DELETE FROM task_snapshots WHERE snapshot_date < ?
    `), 'DELETE').run(cutoffDateStr);
    
    console.log(`✅ Cleaned up ${result.changes} old snapshots`);
    return { success: true, deletedCount: result.changes };
  } catch (error) {
    console.error('❌ Failed to cleanup old snapshots:', error);
    throw error;
  }
};

export default {
  createDailyTaskSnapshots,
  cleanupOldSnapshots
};

