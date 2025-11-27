import express from 'express';
import { wrapQuery } from '../utils/queryLogger.js';
import { authenticateToken } from '../middleware/auth.js';
import { getLeaderboard } from '../jobs/achievements.js';
import { getTranslator, t as translate } from '../utils/i18n.js';
import { getRequestDatabase } from '../middleware/tenantRouting.js';

const router = express.Router();

/**
 * GET /api/reports/settings
 * Get report visibility settings (public endpoint for all authenticated users)
 */
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    
    // Fetch only report-related settings (no sensitive admin settings)
    const reportSettings = await wrapQuery(db.prepare(`
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
router.get('/user-points', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { userId, lang } = req.query;
    const targetUserId = userId || req.user.id;
    
    // Use user's language preference if provided, otherwise fall back to APP_LANGUAGE
    // lang parameter takes precedence over APP_LANGUAGE for user-facing content
    const userLanguage = (lang === 'fr' || lang === 'en') ? lang : null;
    
    // If requesting another user's points, check if admin
    if (userId && userId !== req.user.id && !req.user.roles?.includes('admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    // ALWAYS fetch current user info from members table (source of truth)
    const currentUserInfo = await wrapQuery(db.prepare(`
      SELECT m.user_id, m.name as user_name
      FROM members m
      WHERE m.user_id = ?
    `), 'SELECT').get(targetUserId);
    
    if (!currentUserInfo) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's total points (sum across all periods)
    const userPoints = await wrapQuery(db.prepare(`
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
    const monthlyPoints = await wrapQuery(db.prepare(`
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
    
    // Get achievements/badges with badge_id for translation
    const achievementsRaw = await wrapQuery(db.prepare(`
      SELECT 
        ua.id,
        ua.achievement_type,
        ua.badge_id,
        ua.badge_name,
        ua.badge_icon,
        ua.badge_color,
        ua.points_earned,
        ua.earned_at,
        b.description as badge_description
      FROM user_achievements ua
      LEFT JOIN badges b ON ua.badge_id = b.id
      WHERE ua.user_id = ?
      ORDER BY ua.earned_at DESC
    `), 'SELECT').all(targetUserId);
    
    // Translate achievement names and descriptions
    // Use user's language preference if provided, otherwise use APP_LANGUAGE
    let translationLang = 'en';
    if (userLanguage) {
      translationLang = userLanguage;
    } else {
      const appLang = await wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('APP_LANGUAGE');
      translationLang = (appLang?.value || 'EN').toUpperCase() === 'FR' ? 'fr' : 'en';
    }
    
    // Create translator function with the determined language
    const t = (key, params = {}) => translate(key, params, translationLang);
    
    const achievements = achievementsRaw.map(achievement => {
      const badgeId = achievement.badge_id;
      let translatedName = achievement.badge_name;
      let translatedDescription = achievement.badge_description || '';
      
      // Map badge IDs to translation keys (new system badges)
      const badgeIdToTranslationKey = {
        'getting-started': { name: 'achievements.names.gettingStarted', desc: 'achievements.descriptions.completedFirstTask' },
        'productive': { name: 'achievements.names.productive', desc: 'achievements.descriptions.completed10Tasks' },
        'achiever': { name: 'achievements.names.achiever', desc: 'achievements.descriptions.completed50Tasks' },
        'champion': { name: 'achievements.names.champion', desc: 'achievements.descriptions.completed100Tasks' },
        'unstoppable': { name: 'achievements.names.unstoppable', desc: 'achievements.descriptions.completed250Tasks' },
        'task-master': { name: 'achievements.names.taskMaster', desc: 'achievements.descriptions.created50Tasks' },
        'task-legend': { name: 'achievements.names.taskLegend', desc: 'achievements.descriptions.created100Tasks' },
        'team-player': { name: 'achievements.names.teamPlayer', desc: 'achievements.descriptions.added5Collaborators' },
        'collaborator': { name: 'achievements.names.collaborator', desc: 'achievements.descriptions.added25Collaborators' },
        'team-builder': { name: 'achievements.names.teamBuilder', desc: 'achievements.descriptions.added50Collaborators' },
        'communicator': { name: 'achievements.names.communicator', desc: 'achievements.descriptions.added10Comments' },
        'conversationalist': { name: 'achievements.names.conversationalist', desc: 'achievements.descriptions.added50Comments' },
        'commentator': { name: 'achievements.names.commentator', desc: 'achievements.descriptions.added100Comments' },
        'hard-worker': { name: 'achievements.names.hardWorker', desc: 'achievements.descriptions.completed50EffortPoints' },
        'powerhouse': { name: 'achievements.names.powerhouse', desc: 'achievements.descriptions.completed200EffortPoints' },
        'juggernaut': { name: 'achievements.names.juggernaut', desc: 'achievements.descriptions.completed500EffortPoints' },
        'observer': { name: 'achievements.names.observer', desc: 'achievements.descriptions.added10Watchers' },
        'watchful': { name: 'achievements.names.watchful', desc: 'achievements.descriptions.added50Watchers' },
        'first-task': { name: 'achievements.names.firstTask', desc: 'achievements.descriptions.createdFirstTask' },
        'task-creator': { name: 'achievements.names.taskCreator', desc: 'achievements.descriptions.created10Tasks' },
        'point-getter': { name: 'achievements.names.pointGetter', desc: 'achievements.descriptions.earned100Points' },
        'point-collector': { name: 'achievements.names.pointCollector', desc: 'achievements.descriptions.earned500Points' }
      };
      
      // Map old badge names to translation keys (fallback for old system badges without badge_id)
      const badgeNameToTranslationKey = {
        'Starter': { name: 'achievements.names.starter', desc: 'achievements.descriptions.completed10TasksStarter' },
        'Achiever': { name: 'achievements.names.achiever', desc: 'achievements.descriptions.completed50Tasks' },
        'Master': { name: 'achievements.names.master', desc: 'achievements.descriptions.completed200TasksMaster' },
        'Legend': { name: 'achievements.names.legend', desc: 'achievements.descriptions.completed500TasksLegend' },
        'Hard Worker': { name: 'achievements.names.hardWorker', desc: 'achievements.descriptions.completed100EffortPoints' },
        'Powerhouse': { name: 'achievements.names.powerhouse', desc: 'achievements.descriptions.completed500EffortPointsPowerhouse' },
        'Team Player': { name: 'achievements.names.teamPlayer', desc: 'achievements.descriptions.added50CollaboratorsTeamPlayer' },
        'Mentor': { name: 'achievements.names.mentor', desc: 'achievements.descriptions.added200CollaboratorsMentor' },
        'Communicator': { name: 'achievements.names.communicator', desc: 'achievements.descriptions.added100CommentsCommunicator' }
      };
      
      // First try to translate by badge_id (new system)
      if (badgeId && badgeIdToTranslationKey[badgeId]) {
        const translationKeys = badgeIdToTranslationKey[badgeId];
        translatedName = t(translationKeys.name);
        translatedDescription = t(translationKeys.desc);
      } 
      // Fallback: translate by badge_name (old system badges without badge_id)
      else if (badgeNameToTranslationKey[achievement.badge_name]) {
        const translationKeys = badgeNameToTranslationKey[achievement.badge_name];
        translatedName = t(translationKeys.name);
        translatedDescription = t(translationKeys.desc);
      }
      
      return {
        ...achievement,
        badge_name: translatedName,
        badge_description: translatedDescription
      };
    });
    
    // Get ALL active members count (source of truth)
    const totalActiveMembers = await wrapQuery(db.prepare(`
      SELECT COUNT(DISTINCT m.user_id) as count
      FROM members m
      JOIN users u ON m.user_id = u.id
      WHERE u.is_active = 1
    `), 'SELECT').get();
    
    // Get user's rank among all active members
    const allUsers = await getLeaderboard(db);
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
router.get('/leaderboard', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { year, month } = req.query;
    
    const leaderboard = await getLeaderboard(
      db,
      year ? parseInt(year) : null,
      month ? parseInt(month) : null
    );
    
    // Get total active members (source of truth)
    const totalActiveMembers = await wrapQuery(db.prepare(`
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
router.get('/burndown', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { startDate, endDate, boardId } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        error: 'startDate and endDate are required',
        example: '?startDate=2025-01-01&endDate=2025-01-31'
      });
    }
    
    // Build query based on filters (exclude archived columns via JOIN)
    let snapshotQuery = `
      SELECT 
        ts.snapshot_date,
        COUNT(DISTINCT ts.task_id) as total_tasks,
        COUNT(DISTINCT CASE WHEN ts.is_completed = 1 THEN ts.task_id END) as completed_tasks,
        SUM(ts.effort_points) as total_effort,
        SUM(CASE WHEN ts.is_completed = 1 THEN ts.effort_points ELSE 0 END) as completed_effort
      FROM task_snapshots ts
      LEFT JOIN columns c ON ts.column_id = c.id
      WHERE ts.snapshot_date BETWEEN ? AND ?
      AND (c.is_archived IS NULL OR c.is_archived = 0)
    `;
    
    const params = [startDate, endDate];
    
    if (boardId) {
      snapshotQuery += ' AND ts.board_id = ?';
      params.push(boardId);
    }
    
    snapshotQuery += ' GROUP BY ts.snapshot_date ORDER BY ts.snapshot_date ASC';
    
    const snapshots = await wrapQuery(db.prepare(snapshotQuery), 'SELECT').all(...params);
    
    // Get planning baseline (tasks at first available snapshot in range, excluding archived)
    let baselineQuery = `
      SELECT 
        COUNT(DISTINCT ts.task_id) as planned_tasks,
        SUM(ts.effort_points) as planned_effort
      FROM task_snapshots ts
      LEFT JOIN columns c ON ts.column_id = c.id
      WHERE ts.snapshot_date = (
        SELECT MIN(ts2.snapshot_date) 
        FROM task_snapshots ts2
        LEFT JOIN columns c2 ON ts2.column_id = c2.id
        WHERE ts2.snapshot_date BETWEEN ? AND ?
        AND (c2.is_archived IS NULL OR c2.is_archived = 0)
        ${boardId ? 'AND ts2.board_id = ?' : ''}
      )
      AND (c.is_archived IS NULL OR c.is_archived = 0)
    `;
    
    const baselineParams = [startDate, endDate];
    if (boardId) {
      baselineParams.push(boardId); // For the subquery
      baselineQuery += ' AND ts.board_id = ?';
      baselineParams.push(boardId); // For the outer query
    }
    
    const baseline = await wrapQuery(db.prepare(baselineQuery), 'SELECT').get(...baselineParams);
    
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
    
    // If no boardId filter, get per-board breakdown
    let boardsData = [];
    if (!boardId) {
      // Get all unique boards in the date range (excluding archived columns)
      const boardsQuery = `
        SELECT DISTINCT ts.board_id, ts.board_name
        FROM task_snapshots ts
        LEFT JOIN columns c ON ts.column_id = c.id
        WHERE ts.snapshot_date BETWEEN ? AND ?
        AND ts.board_id IS NOT NULL
        AND (c.is_archived IS NULL OR c.is_archived = 0)
        ORDER BY ts.board_name
      `;
      const boards = await wrapQuery(db.prepare(boardsQuery), 'SELECT').all(startDate, endDate);
      
      // Get data for each board
      boardsData = await Promise.all(boards.map(async board => {
        const boardSnapshotsQuery = `
          SELECT 
            ts.snapshot_date,
            COUNT(DISTINCT ts.task_id) as total_tasks,
            COUNT(DISTINCT CASE WHEN ts.is_completed = 1 THEN ts.task_id END) as completed_tasks,
            SUM(ts.effort_points) as total_effort,
            SUM(CASE WHEN ts.is_completed = 1 THEN ts.effort_points ELSE 0 END) as completed_effort
          FROM task_snapshots ts
          LEFT JOIN columns c ON ts.column_id = c.id
          WHERE ts.snapshot_date BETWEEN ? AND ?
          AND ts.board_id = ?
          AND (c.is_archived IS NULL OR c.is_archived = 0)
          GROUP BY ts.snapshot_date
          ORDER BY ts.snapshot_date ASC
        `;
        
        const boardSnapshots = await wrapQuery(
          db.prepare(boardSnapshotsQuery),
          'SELECT'
        ).all(startDate, endDate, board.board_id);
        
        const boardData = boardSnapshots.map(snapshot => ({
          date: snapshot.snapshot_date,
          total_tasks: snapshot.total_tasks,
          completed_tasks: snapshot.completed_tasks,
          remaining_tasks: snapshot.total_tasks - snapshot.completed_tasks,
          total_effort: snapshot.total_effort,
          completed_effort: snapshot.completed_effort,
          remaining_effort: snapshot.total_effort - snapshot.completed_effort
        }));
        
        return {
          boardId: board.board_id,
          boardName: board.board_name,
          data: boardData
        };
      }));
    }
    
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
      boards: boardsData, // NEW: Per-board breakdown
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
router.get('/team-performance', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
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
    
    const activities = await wrapQuery(db.prepare(activityQuery), 'SELECT').all(...params);
    
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
    for (const user of performanceArray) {
      const currentYear = new Date(startDate).getFullYear();
      const currentMonth = new Date(startDate).getMonth() + 1;
      
      const pointsData = await wrapQuery(db.prepare(`
        SELECT total_points
        FROM user_points
        WHERE user_id = ? AND period_year = ? AND period_month = ?
      `), 'SELECT').get(user.user_id, currentYear, currentMonth);
      
      user.total_points = pointsData?.total_points || 0;
    }
    
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
router.get('/task-list', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { startDate, endDate, boardId, status, assigneeId, priorityName } = req.query;
    
    let query = `
      SELECT 
        t.id,
        t.ticket,
        t.title,
        t.description,
        t.effort,
        t.priority,
        t.priority_id,
        p.priority as priority_name,
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
      LEFT JOIN members m ON t.memberId = m.id
      LEFT JOIN members r ON t.requesterId = r.id
      LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
      WHERE 1=1
      AND (c.is_archived IS NULL OR c.is_archived = 0)
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
      // Support both priority name and priority_id lookup
      // First try to find priority by name to get its ID
      const priority = await wrapQuery(db.prepare('SELECT id FROM priorities WHERE priority = ?'), 'SELECT').get(priorityName);
      if (priority) {
        query += ' AND t.priority_id = ?';
        params.push(priority.id);
      } else {
        // Fallback to old priority name matching for backward compatibility
        query += ' AND t.priority = ?';
        params.push(priorityName);
      }
    }
    
    query += ' ORDER BY t.created_at DESC LIMIT 1000';
    
    const tasks = await wrapQuery(db.prepare(query), 'SELECT').all(...params);
    
    // Get tags for each task
    const tasksWithTags = await Promise.all(tasks.map(async task => {
      const tagsResult = await wrapQuery(db.prepare(`
        SELECT t.tag
        FROM task_tags tt
        JOIN tags t ON tt.tagId = t.id
        WHERE tt.taskId = ?
      `), 'SELECT').all(task.id);
      const tags = tagsResult.map(t => t.tag);
      
      return {
        task_id: task.id,
        task_ticket: task.ticket,
        task_title: task.title,
        board_name: task.board_name,
        column_name: task.column_name,
        assignee_name: task.assignee_name,
        requester_name: task.requester_name,
        priority_name: task.priority_name || task.priority, // Use current name from JOIN or fallback to stored name
        effort: task.effort,
        start_date: task.startDate,
        due_date: task.dueDate,
        is_completed: task.is_done === 1,
        tags,
        comment_count: task.comment_count,
        created_at: task.created_at,
        completed_at: task.is_done === 1 ? task.updated_at : null
      };
    }));
    
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

