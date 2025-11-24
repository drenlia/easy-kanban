import express from 'express';
import crypto from 'crypto';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { getRequestDatabase } from '../middleware/tenantRouting.js';
import { initializeDemoData, createDemoUsers } from '../config/demoData.js';
import { wrapQuery } from '../utils/queryLogger.js';

const router = express.Router();

/**
 * Performance Testing Routes
 * Admin-only routes for performance testing
 * All routes require admin authentication
 */

// Helper to get a default board and columns
function getDefaultBoardAndColumns(db) {
  const board = wrapQuery(db.prepare('SELECT * FROM boards ORDER BY position LIMIT 1'), 'SELECT').get();
  if (!board) {
    throw new Error('No board found. Please create a board first.');
  }
  
  const columns = wrapQuery(db.prepare('SELECT * FROM columns WHERE boardId = ? ORDER BY position'), 'SELECT').all(board.id);
  if (columns.length === 0) {
    throw new Error('No columns found. Please create columns first.');
  }
  
  return { board, columns };
}

/**
 * POST /api/admin/perftest/demo-content
 * Create demo content (background operation)
 */
router.post('/demo-content', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { boardId } = req.body;
    
    // Get board and columns
    let board, columns;
    if (boardId) {
      board = wrapQuery(db.prepare('SELECT * FROM boards WHERE id = ?'), 'SELECT').get(boardId);
      if (!board) {
        return res.status(404).json({ error: 'Board not found' });
      }
      columns = wrapQuery(db.prepare('SELECT * FROM columns WHERE boardId = ? ORDER BY position'), 'SELECT').all(boardId);
    } else {
      const result = getDefaultBoardAndColumns(db);
      board = result.board;
      columns = result.columns;
    }
    
    const startTime = Date.now();
    
    // Temporarily enable demo mode for this operation
    const originalDemoEnabled = process.env.DEMO_ENABLED;
    process.env.DEMO_ENABLED = 'true';
    
    try {
      // Create demo content using existing function
      initializeDemoData(db, board.id, columns);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Restore original demo mode
      process.env.DEMO_ENABLED = originalDemoEnabled;
      
      res.json({
        success: true,
        duration: duration,
        message: 'Demo content created successfully',
        boardId: board.id
      });
    } catch (error) {
      // Restore original demo mode on error
      process.env.DEMO_ENABLED = originalDemoEnabled;
      throw error;
    }
  } catch (error) {
    console.error('Error creating demo content:', error);
    res.status(500).json({ error: error.message || 'Failed to create demo content' });
  }
});

/**
 * POST /api/admin/perftest/tags
 * Create 20 tags and associate them to tasks
 */
router.post('/tags', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const startTime = Date.now();
    
    // Get some tasks to associate tags with
    const tasks = wrapQuery(db.prepare('SELECT id FROM tasks LIMIT 20'), 'SELECT').all();
    if (tasks.length === 0) {
      return res.status(400).json({ error: 'No tasks found. Please create tasks first.' });
    }
    
    const createdTags = [];
    const tagStmt = db.prepare('INSERT INTO tags (id, name, color, board_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    const taskTagStmt = db.prepare('INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)');
    
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
    const now = new Date().toISOString();
    
    // Get a default board
    const board = wrapQuery(db.prepare('SELECT id FROM boards ORDER BY position LIMIT 1'), 'SELECT').get();
    if (!board) {
      return res.status(400).json({ error: 'No board found' });
    }
    
    // Create 20 tags
    for (let i = 1; i <= 20; i++) {
      const tagId = crypto.randomUUID();
      const tagName = `Tag ${i}`;
      const color = colors[i % colors.length];
      
      tagStmt.run(tagId, tagName, color, board.id, now, now);
      createdTags.push({ id: tagId, name: tagName });
      
      // Associate tag to a task (round-robin)
      const taskIndex = (i - 1) % tasks.length;
      taskTagStmt.run(tasks[taskIndex].id, tagId);
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    res.json({
      success: true,
      duration: duration,
      tagsCreated: createdTags.length,
      associationsCreated: createdTags.length,
      message: `Created ${createdTags.length} tags and associated them to tasks`
    });
  } catch (error) {
    console.error('Error creating tags:', error);
    res.status(500).json({ error: error.message || 'Failed to create tags' });
  }
});

/**
 * POST /api/admin/perftest/sprints
 * Create 3 sprints and associate tasks
 */
router.post('/sprints', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const startTime = Date.now();
    
    // Get a default board
    const board = wrapQuery(db.prepare('SELECT id FROM boards ORDER BY position LIMIT 1'), 'SELECT').get();
    if (!board) {
      return res.status(400).json({ error: 'No board found' });
    }
    
    // Get some tasks to associate
    const tasks = wrapQuery(db.prepare('SELECT id FROM tasks LIMIT 30'), 'SELECT').all();
    if (tasks.length === 0) {
      return res.status(400).json({ error: 'No tasks found. Please create tasks first.' });
    }
    
    const createdSprints = [];
    const sprintStmt = db.prepare(`
      INSERT INTO planning_periods (id, name, start_date, end_date, description, is_active, board_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const taskSprintStmt = db.prepare('INSERT INTO task_sprints (task_id, sprint_id) VALUES (?, ?)');
    
    const now = new Date().toISOString();
    const today = new Date();
    
    // Create 3 sprints
    for (let i = 1; i <= 3; i++) {
      const sprintId = crypto.randomUUID();
      const startDate = new Date(today);
      startDate.setDate(today.getDate() + (i - 1) * 14); // 2 weeks apart
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 13); // 2 week sprints
      
      sprintStmt.run(
        sprintId,
        `Sprint ${i}`,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0],
        `Performance test sprint ${i}`,
        i === 1 ? 1 : 0, // First sprint is active
        board.id,
        now,
        now
      );
      
      createdSprints.push({ id: sprintId, name: `Sprint ${i}` });
      
      // Associate 10 tasks per sprint (round-robin)
      const tasksPerSprint = 10;
      for (let j = 0; j < tasksPerSprint && j < tasks.length; j++) {
        const taskIndex = ((i - 1) * tasksPerSprint + j) % tasks.length;
        taskSprintStmt.run(tasks[taskIndex].id, sprintId);
      }
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    res.json({
      success: true,
      duration: duration,
      sprintsCreated: createdSprints.length,
      associationsCreated: createdSprints.length * 10,
      message: `Created ${createdSprints.length} sprints and associated tasks`
    });
  } catch (error) {
    console.error('Error creating sprints:', error);
    res.status(500).json({ error: error.message || 'Failed to create sprints' });
  }
});

/**
 * POST /api/admin/perftest/bulk-tasks
 * Create 50-100 tasks across multiple columns/boards
 */
router.post('/bulk-tasks', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { count = 50 } = req.body;
    const startTime = Date.now();
    
    const { board, columns } = getDefaultBoardAndColumns(db);
    
    // Get a default member for assignment
    const member = wrapQuery(db.prepare('SELECT id FROM members LIMIT 1'), 'SELECT').get();
    if (!member) {
      return res.status(400).json({ error: 'No members found. Please create members first.' });
    }
    
    const taskStmt = db.prepare(`
      INSERT INTO tasks (id, title, description, ticket, assignee_id, requester_id, startDate, dueDate, effort, priority_id, columnId, boardId, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const now = new Date().toISOString();
    const today = new Date().toISOString().split('T')[0];
    const priority = wrapQuery(db.prepare('SELECT id FROM priorities ORDER BY position LIMIT 1'), 'SELECT').get();
    
    let ticketNumber = 1;
    const createdTasks = [];
    
    for (let i = 0; i < count; i++) {
      const taskId = crypto.randomUUID();
      const columnIndex = i % columns.length;
      const positionInColumn = Math.floor(i / columns.length);
      const ticket = `TASK-${String(ticketNumber++).padStart(5, '0')}`;
      
      taskStmt.run(
        taskId,
        `Bulk Task ${i + 1}`,
        `Performance test task ${i + 1}`,
        ticket,
        member.id,
        member.id,
        today,
        null,
        null,
        priority?.id || null,
        columns[columnIndex].id,
        board.id,
        positionInColumn,
        now,
        now
      );
      
      createdTasks.push({ id: taskId, ticket });
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    res.json({
      success: true,
      duration: duration,
      tasksCreated: createdTasks.length,
      message: `Created ${createdTasks.length} tasks`
    });
  } catch (error) {
    console.error('Error creating bulk tasks:', error);
    res.status(500).json({ error: error.message || 'Failed to create bulk tasks' });
  }
});

export default router;

