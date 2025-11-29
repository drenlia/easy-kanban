import crypto from 'crypto';
import { wrapQuery } from '../utils/queryLogger.js';
import redisService from '../services/redisService.js';
import { dbTransaction, dbRun, isProxyDatabase } from '../utils/dbAsync.js';

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
        t.startDate, t.dueDate, t.created_at,
        t.boardId, b.title as board_name,
        t.columnId, c.title as column_name, c.is_finished as is_done,
        t.memberId, m.name as assignee_name,
        t.requesterId, r.name as requester_name
      FROM tasks t
      LEFT JOIN boards b ON t.boardId = b.id
      LEFT JOIN columns c ON t.columnId = c.id
      LEFT JOIN members m ON t.memberId = m.id
      LEFT JOIN members r ON t.requesterId = r.id
      WHERE (c.is_archived IS NULL OR c.is_archived = 0)
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
      const placeholders = taskIds.map(() => '?').join(',');
      
      // Batch fetch all tags for all tasks
      const allTags = await wrapQuery(db.prepare(`
        SELECT tt.taskId, t.tag as name 
        FROM task_tags tt
        JOIN tags t ON tt.tagId = t.id
        WHERE tt.taskId IN (${placeholders})
      `), 'SELECT').all(...taskIds);
      
      // Group tags by taskId
      allTags.forEach(tag => {
        if (!tagsByTaskId.has(tag.taskId)) {
          tagsByTaskId.set(tag.taskId, []);
        }
        tagsByTaskId.get(tag.taskId).push({ name: tag.name });
      });
      
      // Batch fetch all watchers counts
      const watchersCounts = await wrapQuery(db.prepare(`
        SELECT taskId, COUNT(*) as count 
        FROM watchers
        WHERE taskId IN (${placeholders})
        GROUP BY taskId
      `), 'SELECT').all(...taskIds);
      
      // Create map of watchers counts by taskId
      watchersCounts.forEach(w => watchersByTaskId.set(w.taskId, w.count));
      
      // Batch fetch all collaborators counts
      const collaboratorsCounts = await wrapQuery(db.prepare(`
        SELECT taskId, COUNT(*) as count 
        FROM collaborators
        WHERE taskId IN (${placeholders})
        GROUP BY taskId
      `), 'SELECT').all(...taskIds);
      
      // Create map of collaborators counts by taskId
      collaboratorsCounts.forEach(c => collaboratorsByTaskId.set(c.taskId, c.count));
      
      // Batch check for existing snapshots
      const existingSnapshots = await wrapQuery(db.prepare(`
        SELECT id, task_id 
        FROM task_snapshots
        WHERE task_id IN (${placeholders}) AND snapshot_date = ?
      `), 'SELECT').all(...taskIds, snapshotDate);
      
      // Create map of existing snapshot IDs by taskId
      existingSnapshots.forEach(s => existingByTaskId.set(s.task_id, s.id));
    }
    
    // Prepare statements for batch operations
    const updateStmt = db.prepare(`
      UPDATE task_snapshots SET
        task_title = ?,
        task_ticket = ?,
        task_description = ?,
        board_id = ?,
        board_name = ?,
        column_id = ?,
        column_name = ?,
        assignee_id = ?,
        assignee_name = ?,
        requester_id = ?,
        requester_name = ?,
        effort_points = ?,
        priority_name = ?,
        start_date = ?,
        due_date = ?,
        is_completed = ?,
        tags = ?,
        watchers_count = ?,
        collaborators_count = ?,
        updated_at = ?
      WHERE id = ?
    `);
    
    const insertStmt = db.prepare(`
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    let newSnapshotCount = 0;
    let updatedSnapshotCount = 0;
    const now = new Date().toISOString();
    
    // Process all tasks in a single transaction for better performance
    if (isProxyDatabase(db)) {
      // Proxy mode: Collect all queries and send as batch
      const batchQueries = [];
      const updateQuery = `
        UPDATE task_snapshots SET
          task_title = ?,
          task_ticket = ?,
          task_description = ?,
          board_id = ?,
          board_name = ?,
          column_id = ?,
          column_name = ?,
          assignee_id = ?,
          assignee_name = ?,
          requester_id = ?,
          requester_name = ?,
          effort_points = ?,
          priority_name = ?,
          start_date = ?,
          due_date = ?,
          is_completed = ?,
          tags = ?,
          watchers_count = ?,
          collaborators_count = ?,
          updated_at = ?
        WHERE id = ?
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                task.is_done ? 1 : 0,
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
                task.is_done ? 1 : 0,
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
    } else {
      // Direct DB mode: Use standard transaction
      await dbTransaction(db, async () => {
        // Wrap statements for async support
        const wrappedUpdateStmt = wrapQuery(updateStmt, 'UPDATE');
        const wrappedInsertStmt = wrapQuery(insertStmt, 'INSERT');
        
        for (const task of tasks) {
          try {
            const tags = tagsByTaskId.get(task.id) || [];
            const watchersCount = watchersByTaskId.get(task.id) || 0;
            const collaboratorsCount = collaboratorsByTaskId.get(task.id) || 0;
            const existingId = existingByTaskId.get(task.id);
            
            if (existingId) {
              // Update existing snapshot (in case task changed during the day)
              await dbRun(wrappedUpdateStmt,
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
                task.is_done ? 1 : 0,
                tags.length > 0 ? JSON.stringify(tags) : null,
                watchersCount,
                collaboratorsCount,
                now,
                existingId
              );
              updatedSnapshotCount++;
            } else {
              // Create new snapshot
              const snapshotId = crypto.randomUUID();
              await dbRun(wrappedInsertStmt,
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
                task.is_done ? 1 : 0,
                tags.length > 0 ? JSON.stringify(tags) : null,
                watchersCount,
                collaboratorsCount,
                snapshotDate,
                now
              );
              newSnapshotCount++;
            }
          } catch (taskError) {
            console.error(`❌ Failed to snapshot task ${task.id}:`, taskError);
          }
        }
      });
    }
    
    const duration = Date.now() - startTime;
    const totalSnapshots = newSnapshotCount + updatedSnapshotCount;
    console.log(`✅ Task snapshots completed: ${newSnapshotCount} new, ${updatedSnapshotCount} updated (${totalSnapshots} total) in ${duration}ms`);
    
    // Broadcast snapshot update to all connected clients via WebSocket
    try {
      await redisService.publish('task-snapshots-updated', JSON.stringify({
        snapshotDate,
        taskCount: tasks.length,
        newSnapshots: newSnapshotCount,
        updatedSnapshots: updatedSnapshotCount,
        timestamp: new Date().toISOString()
      }));
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

