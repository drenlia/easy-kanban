import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { getRequestDatabase } from '../middleware/tenantRouting.js';
import { isPostgresDatabase, convertSqlToPostgres } from '../utils/dbAsync.js';
import { activity as activityQueries } from '../utils/sqlManager/index.js';

const router = express.Router();

// Activity Feed endpoint
router.get('/feed', authenticateToken, async (req, res) => {
  const { limit = 20 } = req.query;
  const db = getRequestDatabase(req);
  
  try {
    // MIGRATED: Get activity feed using sqlManager
    const activities = await activityQueries.getActivityFeed(db, parseInt(limit));
    
    res.json(activities);
  } catch (error) {
    console.error('Error fetching activity feed:', error);
    res.status(500).json({ error: 'Failed to fetch activity feed' });
  }
});

// User Status endpoint for permission refresh
router.get('/status', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const db = getRequestDatabase(req);
  
  try {
    // MIGRATED: Get user status using sqlManager
    const user = await activityQueries.getUserStatus(db, userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      isActive: Boolean(user.isActive),
      isAdmin: user.role === 'admin',
      forceLogout: !user.isActive || Boolean(user.forceLogout) // Force logout if user is deactivated or role changed
    });
  } catch (error) {
    console.error('Error fetching user status:', error);
    res.status(500).json({ error: 'Failed to fetch user status' });
  }
});

export default router;

