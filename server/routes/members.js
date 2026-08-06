import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { checkUserLimit } from '../middleware/licenseCheck.js';
import notificationService from '../services/notificationService.js';
import { getRequestDatabase, getTenantId } from '../middleware/tenantRouting.js';
import { members as memberQueries } from '../utils/sqlManager/index.js';
import { isAiEnabled } from '../utils/aiEnabled.js';
import { parseBody, createMemberBodySchema } from '../utils/requestValidation.js';

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
    const includeAgent = await isAiEnabled(db);
    
    // MIGRATED: Use sqlManager to get all members (Agent only when AI_ENABLED)
    const members = await memberQueries.getAllMembers(db, { includeSystem, includeAgent });
    
    res.json(members);
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Create member (admin only — user invite flows create members via auth/admin routes)
router.post('/', authenticateToken, requireRole(['admin']), checkUserLimit, async (req, res) => {
  const parsed = parseBody(createMemberBodySchema, req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error });
  }
  const { id, name, color } = parsed.data;
  try {
    const db = getRequestDatabase(req);

    // MIGRATED: Check for duplicate member name using sqlManager
    const existingMember = await memberQueries.checkMemberNameExists(db, name);
    
    if (existingMember) {
      return res.status(400).json({ error: 'This display name is already taken by another user' });
    }
    
    // MIGRATED: Create member using sqlManager
    await memberQueries.createMember(db, id, name, color);
    
    console.log('📤 Publishing member-created');
    await notificationService.publish('member-created', {
      member: { id, name, color },
      timestamp: new Date().toISOString()
    }, getTenantId(req));
    console.log('✅ Member-created published');
    
    res.json({ id, name, color });
  } catch (error) {
    console.error('Error creating member:', error);
    res.status(500).json({ error: 'Failed to create member' });
  }
});

// Delete member (admin only)
router.delete('/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  try {
    const db = getRequestDatabase(req);
    
    // MIGRATED: Delete member using sqlManager
    await memberQueries.deleteMember(db, id);
    
    console.log('📤 Publishing member-deleted');
    await notificationService.publish('member-deleted', {
      memberId: id,
      timestamp: new Date().toISOString()
    }, getTenantId(req));
    console.log('✅ Member-deleted published');
    
    res.json({ message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Error deleting member:', error);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

export default router;
