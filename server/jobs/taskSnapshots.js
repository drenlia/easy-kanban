import crypto from 'crypto';
import { wrapQuery } from '../utils/queryLogger.js';
import redisService from '../services/redisService.js';

/**
 * Create daily snapshots of all tasks for historical reporting
 * @param {Database} db - SQLite database instance
 */
export const createDailyTaskSnapshots = async (db) => {
  try {
    const startTime = Date.now();
    console.log('📸 Starting daily task snapshots...');
    
    // Get all tasks with their current state
    const tasks = wrapQuery(db.prepare(`
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
      LEFT JOIN members m ON t.memberId = m.user_id
      LEFT JOIN members r ON t.requesterId = r.user_id
    `), 'SELECT').all();
    
    if (tasks.length === 0) {
      console.log('ℹ️  No tasks to snapshot');
      return;
    }
    
    const snapshotDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    let snapshotCount = 0;
    
    // Process each task
    for (const task of tasks) {
      try {
        // Get tags for this task
        const tags = wrapQuery(db.prepare(`
          SELECT t.tag as name FROM task_tags tt
          JOIN tags t ON tt.tagId = t.id
          WHERE tt.taskId = ?
        `), 'SELECT').all(task.id);
        
        // Get watchers count
        const watchersCount = wrapQuery(db.prepare(
          'SELECT COUNT(*) as count FROM watchers WHERE taskId = ?'
        ), 'SELECT').get(task.id)?.count || 0;
        
        // Get collaborators count
        const collaboratorsCount = wrapQuery(db.prepare(
          'SELECT COUNT(*) as count FROM collaborators WHERE taskId = ?'
        ), 'SELECT').get(task.id)?.count || 0;
        
        // Check if snapshot for this task and date already exists
        const existing = wrapQuery(db.prepare(`
          SELECT id FROM task_snapshots 
          WHERE task_id = ? AND snapshot_date = ?
        `), 'SELECT').get(task.id, snapshotDate);
        
        if (existing) {
          // Update existing snapshot (in case task changed during the day)
          wrapQuery(db.prepare(`
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
          `), 'UPDATE').run(
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
            new Date().toISOString(),
            existing.id
          );
        } else {
          // Create new snapshot
          const snapshotId = crypto.randomUUID();
          wrapQuery(db.prepare(`
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
          `), 'INSERT').run(
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
            new Date().toISOString()
          );
          snapshotCount++;
        }
      } catch (taskError) {
        console.error(`❌ Failed to snapshot task ${task.id}:`, taskError);
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`✅ Task snapshots completed: ${snapshotCount} new snapshots created in ${duration}ms`);
    
    // Broadcast snapshot update to all connected clients via WebSocket
    try {
      await redisService.publish('task-snapshots-updated', JSON.stringify({
        snapshotDate,
        taskCount: tasks.length,
        newSnapshots: snapshotCount,
        timestamp: new Date().toISOString()
      }));
      console.log('✅ Task snapshots update broadcasted via Redis');
    } catch (publishError) {
      console.error('❌ Failed to publish task snapshots update:', publishError);
      // Don't fail the entire job if broadcasting fails
    }
    
    return { success: true, count: snapshotCount, duration };
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
    
    const result = wrapQuery(db.prepare(`
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

