import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { checkUserLimit } from '../middleware/licenseCheck.js';
import notificationService from '../services/notificationService.js';
import { getRequestDatabase } from '../middleware/tenantRouting.js';
import { members as memberQueries } from '../utils/sqlManager/index.js';

const router = express.Router();

// Get all members
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Prevent browser caching of member data
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    const db = getRequestDatabase(req);
    
    // Check if includeSystem parameter is true
    const includeSystem = req.query.includeSystem === 'true';
    
    // MIGRATED: Use sqlManager to get all members
    const members = await memberQueries.getAllMembers(db, includeSystem);
    
    res.json(members);
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Create member
router.post('/', checkUserLimit, async (req, res) => {
  const { id, name, color } = req.body;
  try {
    const db = getRequestDatabase(req);
    
    // MIGRATED: Check for duplicate member name using sqlManager
    const existingMember = await memberQueries.checkMemberNameExists(db, name);
    
    if (existingMember) {
      return res.status(400).json({ error: 'This display name is already taken by another user' });
    }
    
    // MIGRATED: Create member using sqlManager
    await memberQueries.createMember(db, id, name, color);
    
    // Publish to Redis for real-time updates
    console.log('📤 Publishing member-created to Redis');
    await notificationService.publish('member-created', {
      member: { id, name, color },
      timestamp: new Date().toISOString()
    });
    console.log('✅ Member-created published to Redis');
    
    res.json({ id, name, color });
  } catch (error) {
    console.error('Error creating member:', error);
    res.status(500).json({ error: 'Failed to create member' });
  }
});

// Delete member
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = getRequestDatabase(req);
    
    // MIGRATED: Delete member using sqlManager
    await memberQueries.deleteMember(db, id);
    
    // Publish to Redis for real-time updates
    console.log('📤 Publishing member-deleted to Redis');
    await notificationService.publish('member-deleted', {
      memberId: id,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Member-deleted published to Redis');
    
    res.json({ message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Error deleting member:', error);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

export default router;
