import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { getRequestDatabase } from '../middleware/tenantRouting.js';

const router = express.Router();

// Activity Feed endpoint
router.get('/feed', authenticateToken, (req, res) => {
  const { limit = 20 } = req.query;
  const db = getRequestDatabase(req);
  
  try {
    const activities = wrapQuery(db.prepare(`
      SELECT 
        a.id, a.userId, a.roleId, a.action, a.taskId, a.columnId, a.boardId, a.tagId, a.details,
        datetime(a.created_at) || 'Z' as created_at,
        a.updated_at,
        m.name as member_name,
        r.name as role_name,
        b.title as board_title,
        c.title as column_title
      FROM activity a
      LEFT JOIN users u ON a.userId = u.id
      LEFT JOIN members m ON u.id = m.user_id
      LEFT JOIN roles r ON a.roleId = r.id
      LEFT JOIN boards b ON a.boardId = b.id
      LEFT JOIN columns c ON a.columnId = c.id
      ORDER BY a.created_at DESC
      LIMIT ?
    `), 'SELECT').all(parseInt(limit));
    
    res.json(activities);
  } catch (error) {
    console.error('Error fetching activity feed:', error);
    res.status(500).json({ error: 'Failed to fetch activity feed' });
  }
});

// User Status endpoint for permission refresh
router.get('/status', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const db = getRequestDatabase(req);
  
  try {
    // Get current user status and permissions
    const user = wrapQuery(db.prepare(`
      SELECT u.is_active, u.force_logout, r.name as role 
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = ?
    `), 'SELECT').get(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      isActive: Boolean(user.is_active),
      isAdmin: user.role === 'admin',
      forceLogout: !user.is_active || Boolean(user.force_logout) // Force logout if user is deactivated or role changed
    });
  } catch (error) {
    console.error('Error fetching user status:', error);
    res.status(500).json({ error: 'Failed to fetch user status' });
  }
});

export default router;

