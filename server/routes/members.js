import express from 'express';
import { wrapQuery } from '../utils/queryLogger.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Get all members
router.get('/', authenticateToken, (req, res) => {
  try {
    // Prevent browser caching of member data
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    const { db } = req.app.locals;
    
    // Check if user is admin and if includeSystem parameter is true
    const isAdmin = req.user && req.user.roles && req.user.roles.includes('admin');
    const includeSystem = req.query.includeSystem === 'true';
    
    const whereClause = (isAdmin && includeSystem) 
      ? '' // Include all members (including System User) for admins when requested
      : "WHERE m.id != '00000000-0000-0000-0000-000000000001'"; // Exclude System User otherwise
    
    const stmt = wrapQuery(db.prepare(`
      SELECT 
        m.id, m.name, m.color, m.user_id, m.created_at,
        u.avatar_path, u.auth_provider, u.google_avatar_url
      FROM members m
      LEFT JOIN users u ON m.user_id = u.id
      ${whereClause}
      ORDER BY m.created_at ASC
    `), 'SELECT');
    const members = stmt.all();
    
    const transformedMembers = members.map(member => ({
      id: member.id,
      name: member.name,
      color: member.color,
      user_id: member.user_id,
      avatarUrl: member.avatar_path,
      authProvider: member.auth_provider,
      googleAvatarUrl: member.google_avatar_url
    }));
    

    res.json(transformedMembers);
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Create member
router.post('/', (req, res) => {
  const { id, name, color } = req.body;
  try {
    const { db } = req.app.locals;
    
    // Check for duplicate member name
    const existingMember = wrapQuery(
      db.prepare('SELECT id FROM members WHERE LOWER(name) = LOWER(?)'), 
      'SELECT'
    ).get(name);
    
    if (existingMember) {
      return res.status(400).json({ error: 'This display name is already taken by another user' });
    }
    
    wrapQuery(db.prepare('INSERT INTO members (id, name, color) VALUES (?, ?, ?)'), 'INSERT').run(id, name, color);
    res.json({ id, name, color });
  } catch (error) {
    console.error('Error creating member:', error);
    res.status(500).json({ error: 'Failed to create member' });
  }
});

// Delete member
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  try {
    const { db } = req.app.locals;
    wrapQuery(db.prepare('DELETE FROM members WHERE id = ?'), 'DELETE').run(id);
    res.json({ message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Error deleting member:', error);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

export default router;
