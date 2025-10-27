import express from 'express';
import { wrapQuery } from '../utils/queryLogger.js';
import { authenticateToken } from '../middleware/auth.js';
import { getLeaderboard } from '../jobs/achievements.js';

const router = express.Router();

/**
 * GET /api/reports/settings
 * Get report visibility settings (public endpoint for all authenticated users)
 */
router.get('/settings', authenticateToken, (req, res) => {
  try {
    const { db } = req.app.locals;
    
    // Fetch only report-related settings (no sensitive admin settings)
    const reportSettings = wrapQuery(db.prepare(`
      SELECT key, value FROM settings 
      WHERE key LIKE 'REPORTS_%'
    `), 'SELECT').all();
    
    const settingsObj = {};
    reportSettings.forEach(row => {
      settingsObj[row.key] = row.value;
    });
    
    // Return with defaults for any missing keys
    res.json({
      REPORTS_ENABLED: settingsObj.REPORTS_ENABLED || 'true',
      REPORTS_GAMIFICATION_ENABLED: settingsObj.REPORTS_GAMIFICATION_ENABLED || 'true',
      REPORTS_LEADERBOARD_ENABLED: settingsObj.REPORTS_LEADERBOARD_ENABLED || 'true',
      REPORTS_ACHIEVEMENTS_ENABLED: settingsObj.REPORTS_ACHIEVEMENTS_ENABLED || 'true',
      REPORTS_VISIBLE_TO: settingsObj.REPORTS_VISIBLE_TO || 'all'
    });
  } catch (error) {
    console.error('Failed to fetch report settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * GET /api/reports/user-points
 * Get points and achievements for current user or specified user
 * Query params: userId (optional, admin only)
 */
router.get('/user-points', authenticateToken, (req, res) => {
  try {
    const { db } = req.app.locals;
    const { userId } = req.query;
    const targetUserId = userId || req.user.id;
    
    // If requesting another user's points, check if admin
    if (userId && userId !== req.user.id && !req.user.roles?.includes('admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    // ALWAYS fetch current user info from members table (source of truth)
    const currentUserInfo = wrapQuery(db.prepare(`
      SELECT m.user_id, m.name as user_name
      FROM members m
      WHERE m.user_id = ?
    `), 'SELECT').get(targetUserId);
    
    if (!currentUserInfo) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's total points (sum across all periods)
    const userPoints = wrapQuery(db.prepare(`
      SELECT 
        SUM(total_points) as total_points,
        SUM(tasks_created) as tasks_created,
        SUM(tasks_completed) as tasks_completed,
        SUM(total_effort_completed) as total_effort_completed,
        SUM(comments_added) as comments_added,
        SUM(collaborations) as collaborations
      FROM user_points
      WHERE user_id = ?
    `), 'SELECT').get(targetUserId);
    
    // Get monthly breakdown (last 12 months)
    const monthlyPoints = wrapQuery(db.prepare(`
      SELECT 
        period_year,
        period_month,
        total_points,
        tasks_created,
        tasks_completed,
        total_effort_completed,
        comments_added,
        collaborations,
        last_updated
      FROM user_points
      WHERE user_id = ?
      ORDER BY period_year DESC, period_month DESC
      LIMIT 12
    `), 'SELECT').all(targetUserId);
    
    // Get achievements/badges
    const achievements = wrapQuery(db.prepare(`
      SELECT 
        id,
        achievement_type,
        badge_name,
        badge_icon,
        badge_color,
        points_earned,
        earned_at
      FROM user_achievements
      WHERE user_id = ?
      ORDER BY earned_at DESC
    `), 'SELECT').all(targetUserId);
    
    // Get ALL active members count (source of truth)
    const totalActiveMembers = wrapQuery(db.prepare(`
      SELECT COUNT(DISTINCT m.user_id) as count
      FROM members m
      JOIN users u ON m.user_id = u.id
      WHERE u.is_active = 1
    `), 'SELECT').get();
    
    // Get user's rank among all active members
    const allUsers = getLeaderboard(db);
    let userRank = allUsers.findIndex(u => u.user_id === targetUserId) + 1;
    
    // If user not in leaderboard (no activity yet), they're ranked last
    if (userRank === 0) {
      userRank = totalActiveMembers.count;
    }
    
    // Merge current user info with points data
    const userStats = {
      user_id: currentUserInfo.user_id,
      user_name: currentUserInfo.user_name,
      total_points: userPoints?.total_points || 0,
      tasks_created: userPoints?.tasks_created || 0,
      tasks_completed: userPoints?.tasks_completed || 0,
      total_effort_completed: userPoints?.total_effort_completed || 0,
      comments_added: userPoints?.comments_added || 0,
      collaborations: userPoints?.collaborations || 0
    };
    
    res.json({
      success: true,
      user: userStats,
      rank: userRank,
      totalUsers: totalActiveMembers.count,
      monthlyBreakdown: monthlyPoints,
      achievements: achievements
    });
  } catch (error) {
    console.error('Error fetching user points:', error);
    res.status(500).json({ error: 'Failed to fetch user points' });
  }
});

/**
 * GET /api/reports/leaderboard
 * Get team rankings
 * Query params: year, month (optional)
 */
router.get('/leaderboard', authenticateToken, (req, res) => {
  try {
    const { db } = req.app.locals;
    const { year, month } = req.query;
    
    const leaderboard = getLeaderboard(
      db,
      year ? parseInt(year) : null,
      month ? parseInt(month) : null
    );
    
    // Get total active members (source of truth)
    const totalActiveMembers = wrapQuery(db.prepare(`
      SELECT COUNT(DISTINCT m.user_id) as count
      FROM members m
      JOIN users u ON m.user_id = u.id
      WHERE u.is_active = 1
    `), 'SELECT').get();
    
    res.json({
      success: true,
      period: {
        year: year ? parseInt(year) : 'all-time',
        month: month ? parseInt(month) : null
      },
      totalMembers: totalActiveMembers.count,
      leaderboard
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

/**
 * GET /api/reports/burndown
 * Get burndown data for a planning period
 * Query params: startDate, endDate, boardId (optional)
 */
router.get('/burndown', authenticateToken, (req, res) => {
  try {
    const { db } = req.app.locals;
    const { startDate, endDate, boardId } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        error: 'startDate and endDate are required',
        example: '?startDate=2025-01-01&endDate=2025-01-31'
      });
    }
    
    // Build query based on filters
    let snapshotQuery = `
      SELECT 
        snapshot_date,
        COUNT(DISTINCT task_id) as total_tasks,
        COUNT(DISTINCT CASE WHEN is_completed = 1 THEN task_id END) as completed_tasks,
        SUM(effort_points) as total_effort,
        SUM(CASE WHEN is_completed = 1 THEN effort_points ELSE 0 END) as completed_effort
      FROM task_snapshots
      WHERE snapshot_date BETWEEN ? AND ?
    `;
    
    const params = [startDate, endDate];
    
    if (boardId) {
      snapshotQuery += ' AND board_id = ?';
      params.push(boardId);
    }
    
    snapshotQuery += ' GROUP BY snapshot_date ORDER BY snapshot_date ASC';
    
    const snapshots = wrapQuery(db.prepare(snapshotQuery), 'SELECT').all(...params);
    
    // Get planning baseline (tasks at first available snapshot in range)
    let baselineQuery = `
      SELECT 
        COUNT(DISTINCT task_id) as planned_tasks,
        SUM(effort_points) as planned_effort
      FROM task_snapshots
      WHERE snapshot_date = (
        SELECT MIN(snapshot_date) 
        FROM task_snapshots 
        WHERE snapshot_date BETWEEN ? AND ?
        ${boardId ? 'AND board_id = ?' : ''}
      )
    `;
    
    const baselineParams = [startDate, endDate];
    if (boardId) {
      baselineParams.push(boardId); // For the subquery
      baselineQuery += ' AND board_id = ?';
      baselineParams.push(boardId); // For the outer query
    }
    
    const baseline = wrapQuery(db.prepare(baselineQuery), 'SELECT').get(...baselineParams);
    
    // Calculate ideal burndown line
    const dayCount = snapshots.length;
    const idealBurndown = [];
    
    if (baseline && dayCount > 0) {
      const plannedTasks = baseline.planned_tasks || 0;
      const plannedEffort = baseline.planned_effort || 0;
      const tasksPerDay = plannedTasks / dayCount;
      const effortPerDay = plannedEffort / dayCount;
      
      snapshots.forEach((snapshot, index) => {
        idealBurndown.push({
          date: snapshot.snapshot_date,
          idealRemainingTasks: Math.max(0, plannedTasks - (tasksPerDay * (index + 1))),
          idealRemainingEffort: Math.max(0, plannedEffort - (effortPerDay * (index + 1)))
        });
      });
    }
    
    // Calculate actual remaining tasks
    const actualBurndown = snapshots.map(snapshot => ({
      date: snapshot.snapshot_date,
      total_tasks: snapshot.total_tasks,
      completed_tasks: snapshot.completed_tasks,
      remaining_tasks: snapshot.total_tasks - snapshot.completed_tasks,
      total_effort: snapshot.total_effort,
      completed_effort: snapshot.completed_effort,
      remaining_effort: snapshot.total_effort - snapshot.completed_effort
    }));
    
    res.json({
      success: true,
      period: {
        startDate,
        endDate,
        boardId: boardId || 'all'
      },
      baseline: baseline || { planned_tasks: 0, planned_effort: 0 },
      idealBurndown,
      actualBurndown,
      metrics: {
        totalTasks: baseline?.planned_tasks || 0,
        totalEffort: baseline?.planned_effort || 0,
        totalDays: dayCount
      },
      data: actualBurndown,
      summary: {
        totalDays: dayCount,
        tasksPlanned: baseline?.planned_tasks || 0,
        tasksCompleted: snapshots[snapshots.length - 1]?.completed_tasks || 0,
        effortPlanned: baseline?.planned_effort || 0,
        effortCompleted: snapshots[snapshots.length - 1]?.completed_effort || 0
      }
    });
  } catch (error) {
    console.error('Error fetching burndown data:', error);
    res.status(500).json({ error: 'Failed to fetch burndown data' });
  }
});

/**
 * GET /api/reports/team-performance
 * Get team performance metrics
 * Query params: startDate, endDate, boardId (optional)
 */
router.get('/team-performance', authenticateToken, (req, res) => {
  try {
    const { db } = req.app.locals;
    const { startDate, endDate, boardId } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        error: 'startDate and endDate are required',
        example: '?startDate=2025-01-01&endDate=2025-01-31'
      });
    }
    
    // Get activity events for the period
    let activityQuery = `
      SELECT 
        user_id,
        user_name,
        event_type,
        COUNT(*) as event_count,
        SUM(CASE WHEN event_type = 'task_completed' THEN effort_points ELSE 0 END) as total_effort_completed
      FROM activity_events
      WHERE DATE(created_at) BETWEEN ? AND ?
    `;
    
    const params = [startDate, endDate];
    
    if (boardId) {
      activityQuery += ' AND board_id = ?';
      params.push(boardId);
    }
    
    activityQuery += `
      GROUP BY user_id, user_name, event_type
      ORDER BY user_id, event_type
    `;
    
    const activities = wrapQuery(db.prepare(activityQuery), 'SELECT').all(...params);
    
    // Aggregate by user
    const userPerformance = {};
    
    activities.forEach(activity => {
      if (!userPerformance[activity.user_id]) {
        userPerformance[activity.user_id] = {
          user_id: activity.user_id,
          user_name: activity.user_name,
          tasks_created: 0,
          tasks_completed: 0,
          tasks_updated: 0,
          tasks_moved: 0,
          comments_added: 0,
          collaborations: 0,
          total_effort_completed: 0,
          total_points: 0
        };
      }
      
      const user = userPerformance[activity.user_id];
      
      switch (activity.event_type) {
        case 'task_created':
          user.tasks_created += activity.event_count;
          break;
        case 'task_completed':
          user.tasks_completed += activity.event_count;
          user.total_effort_completed += activity.total_effort_completed || 0;
          break;
        case 'task_updated':
          user.tasks_updated += activity.event_count;
          break;
        case 'task_moved':
          user.tasks_moved += activity.event_count;
          break;
        case 'comment_added':
          user.comments_added += activity.event_count;
          break;
        case 'collaborator_added':
        case 'watcher_added':
          user.collaborations += activity.event_count;
          break;
      }
    });
    
    // Convert to array and sort by tasks completed
    const performanceArray = Object.values(userPerformance).sort((a, b) => 
      b.tasks_completed - a.tasks_completed
    );
    
    // Get total points for each user from user_points table
    performanceArray.forEach(user => {
      const currentYear = new Date(startDate).getFullYear();
      const currentMonth = new Date(startDate).getMonth() + 1;
      
      const pointsData = wrapQuery(db.prepare(`
        SELECT total_points
        FROM user_points
        WHERE user_id = ? AND period_year = ? AND period_month = ?
      `), 'SELECT').get(user.user_id, currentYear, currentMonth);
      
      user.total_points = pointsData?.total_points || 0;
    });
    
    res.json({
      success: true,
      period: {
        startDate,
        endDate,
        boardId: boardId || 'all'
      },
      users: performanceArray,
      summary: {
        totalUsers: performanceArray.length,
        totalTasksCompleted: performanceArray.reduce((sum, u) => sum + u.tasks_completed, 0),
        totalEffortCompleted: performanceArray.reduce((sum, u) => sum + u.total_effort_completed, 0),
        totalComments: performanceArray.reduce((sum, u) => sum + u.comments_added, 0),
        totalCollaborations: performanceArray.reduce((sum, u) => sum + u.collaborations, 0)
      }
    });
  } catch (error) {
    console.error('Error fetching team performance:', error);
    res.status(500).json({ error: 'Failed to fetch team performance' });
  }
});

/**
 * GET /api/reports/task-list
 * Get comprehensive task list with metrics
 * Query params: startDate, endDate, boardId, status, assigneeId, priorityName (all optional)
 */
router.get('/task-list', authenticateToken, (req, res) => {
  try {
    const { db } = req.app.locals;
    const { startDate, endDate, boardId, status, assigneeId, priorityName } = req.query;
    
    let query = `
      SELECT 
        t.id,
        t.ticket,
        t.title,
        t.description,
        t.effort,
        t.priority,
        t.startDate,
        t.dueDate,
        t.created_at,
        t.updated_at,
        b.title as board_name,
        c.title as column_name,
        c.is_finished as is_done,
        m.name as assignee_name,
        r.name as requester_name,
        (SELECT COUNT(*) FROM comments WHERE taskId = t.id) as comment_count,
        (SELECT COUNT(*) FROM watchers WHERE taskId = t.id) as watcher_count,
        (SELECT COUNT(*) FROM collaborators WHERE taskId = t.id) as collaborator_count
      FROM tasks t
      LEFT JOIN boards b ON t.boardId = b.id
      LEFT JOIN columns c ON t.columnId = c.id
      LEFT JOIN members m ON t.memberId = m.user_id
      LEFT JOIN members r ON t.requesterId = r.user_id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (startDate) {
      query += ' AND DATE(t.created_at) >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND DATE(t.created_at) <= ?';
      params.push(endDate);
    }
    
    if (boardId) {
      query += ' AND t.boardId = ?';
      params.push(boardId);
    }
    
    if (status === 'completed') {
      query += ' AND c.is_finished = 1';
    } else if (status === 'active') {
      query += ' AND c.is_finished = 0';
    }
    
    if (assigneeId) {
      query += ' AND t.memberId = ?';
      params.push(assigneeId);
    }
    
    if (priorityName) {
      query += ' AND t.priority = ?';
      params.push(priorityName);
    }
    
    query += ' ORDER BY t.created_at DESC LIMIT 1000';
    
    const tasks = wrapQuery(db.prepare(query), 'SELECT').all(...params);
    
    // Get tags for each task
    const tasksWithTags = tasks.map(task => {
      const tags = wrapQuery(db.prepare(`
        SELECT t.tag
        FROM task_tags tt
        JOIN tags t ON tt.tagId = t.id
        WHERE tt.taskId = ?
      `), 'SELECT').all(task.id).map(t => t.tag);
      
      return {
        task_id: task.id,
        task_ticket: task.ticket,
        task_title: task.title,
        board_name: task.board_name,
        column_name: task.column_name,
        assignee_name: task.assignee_name,
        requester_name: task.requester_name,
        priority_name: task.priority,
        effort: task.effort,
        start_date: task.startDate,
        due_date: task.dueDate,
        is_completed: task.is_done === 1,
        tags,
        comment_count: task.comment_count,
        created_at: task.created_at,
        completed_at: task.is_done === 1 ? task.updated_at : null
      };
    });
    
    // Calculate metrics
    const metrics = {
      totalTasks: tasksWithTags.length,
      completedTasks: tasksWithTags.filter(t => t.is_completed).length,
      activeTasks: tasksWithTags.filter(t => !t.is_completed).length,
      totalEffort: tasksWithTags.reduce((sum, t) => sum + (t.effort || 0), 0),
      completedEffort: tasksWithTags.filter(t => t.is_completed).reduce((sum, t) => sum + (t.effort || 0), 0),
      totalComments: tasksWithTags.reduce((sum, t) => sum + t.comment_count, 0),
      avgCommentsPerTask: tasksWithTags.length > 0 ? 
        (tasksWithTags.reduce((sum, t) => sum + t.comment_count, 0) / tasksWithTags.length).toFixed(1) : 0
    };
    
    res.json({
      success: true,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        boardId: boardId || null,
        status: status || null,
        assigneeId: assigneeId || null,
        priorityName: priorityName || null
      },
      metrics,
      tasks: tasksWithTags
    });
  } catch (error) {
    console.error('Error fetching task list:', error);
    res.status(500).json({ error: 'Failed to fetch task list' });
  }
});

export default router;

