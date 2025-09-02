import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import multer from 'multer';
import { mkdir } from 'fs/promises';
import { writeFileSync } from 'fs';
import crypto from 'crypto';
import path from 'path';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
// import { createServer } from 'http';
// import { Server as SocketIOServer } from 'socket.io'; // Disabled due to loop issues

const __dirname = dirname(fileURLToPath(import.meta.url));
// In Docker, use the data volume path; otherwise use local path
const dbPath = process.env.NODE_ENV === 'development' && process.env.DOCKER_ENV 
  ? '/app/server/data/kanban.db'
  : join(__dirname, 'kanban.db');

// Ensure the directory exists
const dbDir = dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, '');
}

// Initialize database
const db = new Database(dbPath);
const app = express();

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());



// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Role-based access control middleware
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
};

// Query logging
const queryLogs = [];
let queryId = 0;

// Authentication endpoints
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  try {
    // Find user by email
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Get user roles
    const roles = db.prepare(`
      SELECT r.name 
      FROM roles r 
      JOIN user_roles ur ON r.id = ur.role_id 
      WHERE ur.user_id = ?
    `).all(user.id);
    
    const userRoles = roles.map(r => r.name);
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: userRoles.includes('admin') ? 'admin' : 'user',
        roles: userRoles
      }, 
      JWT_SECRET, 
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    // Return user info and token
    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        roles: userRoles
      },
      token
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/register', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { email, password, firstName, lastName, role } = req.body;
  
  if (!email || !password || !firstName || !lastName || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  try {
    // Check if user already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user
    const userId = crypto.randomUUID();
    const userStmt = db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name) 
      VALUES (?, ?, ?, ?, ?)
    `);
    userStmt.run(userId, email, passwordHash, firstName, lastName);
    
    // Assign role
    const roleId = db.prepare('SELECT id FROM roles WHERE name = ?').get(role)?.id;
    if (roleId) {
      const userRoleStmt = db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)');
      userRoleStmt.run(userId, roleId);
    }
    
    // Create member for the user
    const memberId = crypto.randomUUID();
    const memberColor = '#4ECDC4'; // Default color
    const memberStmt = db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)');
    memberStmt.run(memberId, `${firstName} ${lastName}`, memberColor, userId);
    
    res.json({ 
      message: 'User created successfully',
      user: { id: userId, email, firstName, lastName, role }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user roles
    const roles = db.prepare(`
      SELECT r.name 
      FROM roles r 
      JOIN user_roles ur ON r.id = ur.role_id 
      WHERE ur.user_id = ?
    `).all(user.id);
    
    const userRoles = roles.map(r => r.name);
    
    // Determine the correct avatar URL based on auth provider
    let avatarUrl = null;
    if (user.auth_provider === 'google' && user.google_avatar_url) {
      avatarUrl = user.google_avatar_url;
    } else if (user.avatar_path) {
      avatarUrl = user.avatar_path;
    }
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        roles: userRoles,
        avatarUrl: avatarUrl,
        authProvider: user.auth_provider || 'local',
        googleAvatarUrl: user.google_avatar_url
      }
    });
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Admin API endpoints
app.get('/api/admin/users', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const users = db.prepare(`
      SELECT 
        u.id, u.email, u.first_name, u.last_name, u.is_active, u.created_at,
        u.avatar_path, u.auth_provider, u.google_avatar_url,
        m.color as member_color, m.name as member_name,
        GROUP_CONCAT(r.name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN members m ON u.id = m.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all();
    
    const formattedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      displayName: user.member_name || `${user.first_name} ${user.last_name}`,
      isActive: user.is_active,
      roles: user.roles ? user.roles.split(',') : [],
      joined: new Date(user.created_at).toLocaleDateString(),
      createdAt: user.created_at,
      avatarUrl: user.avatar_path,
      authProvider: user.auth_provider || 'local',
      googleAvatarUrl: user.google_avatar_url,
      memberColor: user.member_color || '#4ECDC4'
    }));
    
    res.json(formattedUsers);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

app.put('/api/admin/users/:userId', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, email, isActive } = req.body;
    
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: 'First name, last name, and email are required' });
    }
    
    // Check if email already exists for another user
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, userId);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    // Update user
    const updateStmt = db.prepare(`
      UPDATE users 
      SET first_name = ?, last_name = ?, email = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    updateStmt.run(firstName, lastName, email, isActive ? 1 : 0, userId);
    
    // Update team member name if it exists
    try {
      const memberUpdateStmt = db.prepare('UPDATE members SET name = ? WHERE user_id = ?');
      memberUpdateStmt.run(`${firstName} ${lastName}`, userId);
    } catch (error) {
      console.log('Member update not needed or failed:', error.message);
    }
    
    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.put('/api/admin/users/:userId/role', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { userId } = req.params;
    const { action } = req.body; // 'promote' or 'demote'
    
    if (!['promote', 'demote'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }
    
    // Prevent users from demoting themselves
    if (action === 'demote' && userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot demote yourself' });
    }
    
    // Get current role
    const currentRole = db.prepare(`
      SELECT r.name FROM roles r 
      JOIN user_roles ur ON r.id = ur.role_id 
      WHERE ur.user_id = ?
    `).get(userId);
    
    if (!currentRole) {
      return res.status(404).json({ error: 'User role not found' });
    }
    
    // Remove current role
    db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(userId);
    
    // Assign new role
    const newRoleName = action === 'promote' ? 'admin' : 'user';
    const newRole = db.prepare('SELECT id FROM roles WHERE name = ?').get(newRoleName);
    
    if (!newRole) {
      return res.status(500).json({ error: 'Role not found' });
    }
    
    db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, newRole.id);
    
    res.json({ message: `User ${action}d successfully` });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

app.post('/api/admin/users', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { email, password, firstName, lastName, displayName, role } = req.body;
    
    if (!email || !password || !firstName || !lastName || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Check if email already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    // Generate user ID
    const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Hash password
    const passwordHash = bcrypt.hashSync(password, 10);
    
    // Create user
    const userStmt = db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name) 
      VALUES (?, ?, ?, ?, ?)
    `);
    userStmt.run(userId, email, passwordHash, firstName, lastName);
    
    // Assign role
    const roleId = db.prepare('SELECT id FROM roles WHERE name = ?').get(role);
    if (!roleId) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, roleId.id);
    
    // Create team member automatically with custom display name if provided
    const memberName = displayName && displayName.trim() ? displayName.trim() : `${firstName} ${lastName}`;
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    const memberStmt = db.prepare(`
      INSERT INTO members (id, name, color, user_id) 
      VALUES (?, ?, ?, ?)
    `);
    memberStmt.run(userId, memberName, randomColor, userId);
    
    // Generate default avatar SVG for new local users
    const defaultAvatarSvg = generateDefaultAvatar(firstName, lastName, randomColor);
    const avatarFilename = `default-${userId}.svg`;
    const avatarPath = path.join(AVATARS_DIR, avatarFilename);
    
    try {
      fs.writeFileSync(avatarPath, defaultAvatarSvg);
      // Update user with default avatar path
      const avatarUpdateStmt = db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?');
      avatarUpdateStmt.run(`/avatars/${avatarFilename}`, userId);
    } catch (error) {
      console.error('Error creating default avatar:', error);
    }
    
    res.json({ 
      message: 'User created successfully',
      user: {
        id: userId,
        email,
        firstName,
        lastName,
        displayName: memberName,
        role
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Get task count for a user (for deletion confirmation)
app.get('/api/admin/users/:userId/task-count', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { userId } = req.params;
    
    // Count tasks where this user is either the assignee (memberId) or requester (requesterId)
    // First get the member ID for this user
    const member = db.prepare('SELECT id FROM members WHERE user_id = ?').get(userId);
    
    let taskCount = { count: 0 };
    if (member) {
      taskCount = db.prepare(`
        SELECT COUNT(*) as count
        FROM tasks
        WHERE memberId = ? OR requesterId = ?
      `).get(member.id, member.id);
    }
    
    res.json({ count: taskCount.count || 0 });
  } catch (error) {
    console.error('Get user task count error:', error);
    res.status(500).json({ error: 'Failed to get task count' });
  }
});

app.delete('/api/admin/users/:userId', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check if user is trying to delete themselves
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    // Delete user (cascade will handle related records)
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Update member color
app.put('/api/admin/users/:userId/color', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { userId } = req.params;
    const { color } = req.body;
    
    if (!color) {
      return res.status(400).json({ error: 'Color is required' });
    }
    
    // Validate color format (hex color)
    if (!/^#[0-9A-F]{6}$/i.test(color)) {
      return res.status(400).json({ error: 'Invalid color format. Use hex color (e.g., #FF6B6B)' });
    }
    
    // Update member color
    const updateStmt = db.prepare('UPDATE members SET color = ? WHERE user_id = ?');
    const result = updateStmt.run(color, userId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    res.json({ 
      message: 'Member color updated successfully',
      color: color
    });
  } catch (error) {
    console.error('Update member color error:', error);
    res.status(500).json({ error: 'Failed to update member color' });
  }
});





app.get('/api/admin/settings', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const settings = db.prepare('SELECT key, value FROM settings').all();
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });
    res.json(settingsObj);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

app.put('/api/admin/settings', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { key, value } = req.body;
    
    if (!key) {
      return res.status(400).json({ error: 'Setting key is required' });
    }
    
    const result = db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at) 
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(key, value);
    
    // If this is a Google OAuth setting, reload the OAuth configuration
    if (key === 'GOOGLE_CLIENT_ID' || key === 'GOOGLE_CLIENT_SECRET' || key === 'GOOGLE_CALLBACK_URL') {
      console.log(`Google OAuth setting updated: ${key} - Hot reloading OAuth config...`);
      // Invalidate OAuth configuration cache
      if (global.oauthConfigCache) {
        global.oauthConfigCache.invalidated = true;
        console.log('✅ OAuth configuration cache invalidated - new settings will be loaded on next OAuth request');
      }
    }
    
    res.json({ message: 'Setting updated successfully' });
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// Public tags endpoint (for all authenticated users)
app.get('/api/tags', authenticateToken, (req, res) => {
  try {
    const tags = db.prepare('SELECT * FROM tags ORDER BY tag ASC').all();
    res.json(tags);
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: 'Failed to get tags' });
  }
});

// Tags management endpoints (admin only)
app.get('/api/admin/tags', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const tags = db.prepare('SELECT * FROM tags ORDER BY tag ASC').all();
    res.json(tags);
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: 'Failed to get tags' });
  }
});

app.post('/api/admin/tags', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { tag, description, color } = req.body;
    
    if (!tag || !tag.trim()) {
      return res.status(400).json({ error: 'Tag name is required' });
    }
    
    const stmt = db.prepare('INSERT INTO tags (tag, description, color) VALUES (?, ?, ?)');
    const result = stmt.run(tag.trim(), description || null, color || null);
    
    const newTag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
    res.json(newTag);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(400).json({ error: 'Tag already exists' });
    } else {
      console.error('Create tag error:', error);
      res.status(500).json({ error: 'Failed to create tag' });
    }
  }
});

app.put('/api/admin/tags/:tagId', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { tagId } = req.params;
    const { tag, description, color } = req.body;
    
    if (!tag || !tag.trim()) {
      return res.status(400).json({ error: 'Tag name is required' });
    }
    
    const stmt = db.prepare('UPDATE tags SET tag = ?, description = ?, color = ? WHERE id = ?');
    const result = stmt.run(tag.trim(), description || null, color || null, tagId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    
    const updatedTag = db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId);
    res.json(updatedTag);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(400).json({ error: 'Tag already exists' });
    } else {
      console.error('Update tag error:', error);
      res.status(500).json({ error: 'Failed to update tag' });
    }
  }
});

// Get tag usage count (for deletion confirmation)
app.get('/api/admin/tags/:tagId/usage', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { tagId } = req.params;
    
    const usage = db.prepare('SELECT COUNT(*) as count FROM task_tags WHERE tagId = ?').get(tagId);
    res.json({ count: usage.count || 0 });
  } catch (error) {
    console.error('Get tag usage error:', error);
    res.status(500).json({ error: 'Failed to get tag usage' });
  }
});

app.delete('/api/admin/tags/:tagId', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { tagId } = req.params;
    
    // Use transaction to ensure both operations succeed or fail together
    const transaction = db.transaction(() => {
      // First remove all task associations
      db.prepare('DELETE FROM task_tags WHERE tagId = ?').run(tagId);
      
      // Then delete the tag
      const result = db.prepare('DELETE FROM tags WHERE id = ?').run(tagId);
      
      if (result.changes === 0) {
        throw new Error('Tag not found');
      }
    });
    
    transaction();
    res.json({ message: 'Tag and all associations deleted successfully' });
  } catch (error) {
    if (error.message === 'Tag not found') {
      res.status(404).json({ error: 'Tag not found' });
    } else {
      console.error('Delete tag error:', error);
      res.status(500).json({ error: 'Failed to delete tag' });
    }
  }
});

// Priorities management endpoints
app.get('/api/priorities', authenticateToken, (req, res) => {
  try {
    const priorities = db.prepare('SELECT * FROM priorities ORDER BY position ASC').all();
    res.json(priorities);
  } catch (error) {
    console.error('Get priorities error:', error);
    res.status(500).json({ error: 'Failed to get priorities' });
  }
});

app.get('/api/admin/priorities', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const priorities = db.prepare('SELECT * FROM priorities ORDER BY position ASC').all();
    res.json(priorities);
  } catch (error) {
    console.error('Get priorities error:', error);
    res.status(500).json({ error: 'Failed to get priorities' });
  }
});

app.post('/api/admin/priorities', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { priority, color } = req.body;
    
    if (!priority || !priority.trim()) {
      return res.status(400).json({ error: 'Priority name is required' });
    }
    
    if (!color || !color.trim()) {
      return res.status(400).json({ error: 'Priority color is required' });
    }
    
    // Get the next position
    const maxPosition = db.prepare('SELECT MAX(position) as maxPos FROM priorities').get();
    const nextPosition = (maxPosition.maxPos || -1) + 1;
    
    const stmt = db.prepare('INSERT INTO priorities (priority, color, position) VALUES (?, ?, ?)');
    const result = stmt.run(priority.trim().toLowerCase(), color.trim(), nextPosition);
    
    const newPriority = db.prepare('SELECT * FROM priorities WHERE id = ?').get(result.lastInsertRowid);
    res.json(newPriority);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(400).json({ error: 'Priority already exists' });
    } else {
      console.error('Create priority error:', error);
      res.status(500).json({ error: 'Failed to create priority' });
    }
  }
});

// Reorder priorities (must come before :priorityId route)
app.put('/api/admin/priorities/reorder', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { priorities } = req.body;
    
    if (!Array.isArray(priorities)) {
      return res.status(400).json({ error: 'Priorities array is required' });
    }
    
    // Update positions in a transaction
    const updatePosition = db.prepare('UPDATE priorities SET position = ? WHERE id = ?');
    const transaction = db.transaction((priorityUpdates) => {
      for (const update of priorityUpdates) {
        updatePosition.run(update.position, update.id);
      }
    });
    
    transaction(priorities.map((priority, index) => ({
      id: priority.id,
      position: index
    })));
    
    // Return updated priorities
    const updatedPriorities = db.prepare('SELECT * FROM priorities ORDER BY position ASC').all();
    res.json(updatedPriorities);
  } catch (error) {
    console.error('Reorder priorities error:', error);
    res.status(500).json({ error: 'Failed to reorder priorities' });
  }
});

app.put('/api/admin/priorities/:priorityId', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { priorityId } = req.params;
    const { priority, color } = req.body;
    
    if (!priority || !priority.trim()) {
      return res.status(400).json({ error: 'Priority name is required' });
    }
    
    if (!color || !color.trim()) {
      return res.status(400).json({ error: 'Priority color is required' });
    }
    
    const stmt = db.prepare('UPDATE priorities SET priority = ?, color = ? WHERE id = ?');
    const result = stmt.run(priority.trim().toLowerCase(), color.trim(), priorityId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Priority not found' });
    }
    
    const updatedPriority = db.prepare('SELECT * FROM priorities WHERE id = ?').get(priorityId);
    res.json(updatedPriority);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(400).json({ error: 'Priority already exists' });
    } else {
      console.error('Update priority error:', error);
      res.status(500).json({ error: 'Failed to update priority' });
    }
  }
});

app.delete('/api/admin/priorities/:priorityId', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { priorityId } = req.params;
    
    // Check if priority is being used
    const usage = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE priority = (SELECT priority FROM priorities WHERE id = ?)').get(priorityId);
    if (usage.count > 0) {
      return res.status(400).json({ 
        error: `Cannot delete priority. It is currently used by ${usage.count} task${usage.count !== 1 ? 's' : ''}.` 
      });
    }
    
    const stmt = db.prepare('DELETE FROM priorities WHERE id = ?');
    const result = stmt.run(priorityId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Priority not found' });
    }
    
    res.json({ message: 'Priority deleted successfully' });
  } catch (error) {
    console.error('Delete priority error:', error);
    res.status(500).json({ error: 'Failed to delete priority' });
  }
});

// Helper function to get default priority
function getDefaultPriority() {
  // First try to get priority with initial = 1
  let defaultPriority = db.prepare('SELECT priority FROM priorities WHERE initial = 1 LIMIT 1').get();
  
  if (!defaultPriority) {
    // Fallback to lowest ID (first priority created) if no initial priority set
    defaultPriority = db.prepare('SELECT priority FROM priorities ORDER BY id ASC LIMIT 1').get();
  }
  
  return defaultPriority ? defaultPriority.priority : 'low'; // Ultimate fallback
}

// Set default priority endpoint
app.put('/api/admin/priorities/:priorityId/set-default', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { priorityId } = req.params;
    
    // Check if priority exists
    const priority = db.prepare('SELECT * FROM priorities WHERE id = ?').get(priorityId);
    if (!priority) {
      return res.status(404).json({ error: 'Priority not found' });
    }
    
    // Start transaction to ensure only one priority can be default
    const transaction = db.transaction(() => {
      // First, set all priorities to non-default
      db.prepare('UPDATE priorities SET initial = 0').run();
      
      // Then set the specified priority as default
      db.prepare('UPDATE priorities SET initial = 1 WHERE id = ?').run(priorityId);
    });
    
    transaction();
    
    // Return updated priority
    const updatedPriority = db.prepare('SELECT * FROM priorities WHERE id = ?').get(priorityId);
    res.json(updatedPriority);
  } catch (error) {
    console.error('Set default priority error:', error);
    res.status(500).json({ error: 'Failed to set default priority' });
  }
});

// Task-Tag association endpoints
app.get('/api/tasks/:taskId/tags', authenticateToken, (req, res) => {
  try {
    const { taskId } = req.params;
    
    const tags = db.prepare(`
      SELECT t.* FROM tags t
      JOIN task_tags tt ON t.id = tt.tagId
      WHERE tt.taskId = ?
      ORDER BY t.tag ASC
    `).all(taskId);
    
    res.json(tags);
  } catch (error) {
    console.error('Get task tags error:', error);
    res.status(500).json({ error: 'Failed to get task tags' });
  }
});

app.post('/api/tasks/:taskId/tags/:tagId', authenticateToken, (req, res) => {
  try {
    const { taskId, tagId } = req.params;
    
    // Check if association already exists
    const existing = db.prepare('SELECT id FROM task_tags WHERE taskId = ? AND tagId = ?').get(taskId, tagId);
    if (existing) {
      return res.status(400).json({ error: 'Tag already associated with this task' });
    }
    
    const stmt = db.prepare('INSERT INTO task_tags (taskId, tagId) VALUES (?, ?)');
    stmt.run(taskId, tagId);
    
    res.json({ message: 'Tag associated with task successfully' });
  } catch (error) {
    console.error('Associate tag error:', error);
    res.status(500).json({ error: 'Failed to associate tag with task' });
  }
});

app.delete('/api/tasks/:taskId/tags/:tagId', authenticateToken, (req, res) => {
  try {
    const { taskId, tagId } = req.params;
    
    const stmt = db.prepare('DELETE FROM task_tags WHERE taskId = ? AND tagId = ?');
    const result = stmt.run(taskId, tagId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Tag association not found' });
    }
    
    res.json({ message: 'Tag removed from task successfully' });
  } catch (error) {
    console.error('Remove tag association error:', error);
    res.status(500).json({ error: 'Failed to remove tag from task' });
  }
});

// Views (saved filters) endpoints
app.get('/api/views', authenticateToken, (req, res) => {
  try {
    // Get user's private views and all shared views
    const views = db.prepare(`
      SELECT v.*, u.first_name || ' ' || u.last_name as ownerName
      FROM views v
      JOIN users u ON v.userId = u.id
      WHERE v.userId = ? OR v.shared = 1
      ORDER BY v.shared DESC, v.created_at DESC
    `).all(req.user.id);
    
    // Parse JSON fields
    const parsedViews = views.map(view => ({
      ...view,
      memberFilters: JSON.parse(view.memberFilters || '[]'),
      priorityFilters: JSON.parse(view.priorityFilters || '[]')
    }));
    
    res.json(parsedViews);
  } catch (error) {
    console.error('Get views error:', error);
    res.status(500).json({ error: 'Failed to get views' });
  }
});

app.post('/api/views', authenticateToken, (req, res) => {
  try {
    const { filterName, shared, textFilter, dateFromFilter, dateToFilter, memberFilters, priorityFilters } = req.body;
    
    if (!filterName || !filterName.trim()) {
      return res.status(400).json({ error: 'Filter name is required' });
    }
    
    const stmt = db.prepare(`
      INSERT INTO views (filterName, userId, shared, textFilter, dateFromFilter, dateToFilter, memberFilters, priorityFilters)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      filterName.trim(),
      req.user.id,
      shared || false,
      textFilter || null,
      dateFromFilter || null,
      dateToFilter || null,
      JSON.stringify(memberFilters || []),
      JSON.stringify(priorityFilters || [])
    );
    
    const newView = db.prepare('SELECT * FROM views WHERE id = ?').get(result.lastInsertRowid);
    res.json(newView);
  } catch (error) {
    console.error('Create view error:', error);
    res.status(500).json({ error: 'Failed to create view' });
  }
});

app.delete('/api/views/:viewId', authenticateToken, (req, res) => {
  try {
    const { viewId } = req.params;
    
    // Only allow deletion of own views or if admin
    const view = db.prepare('SELECT userId FROM views WHERE id = ?').get(viewId);
    if (!view) {
      return res.status(404).json({ error: 'View not found' });
    }
    
    if (view.userId !== req.user.id && !req.user.roles.includes('admin')) {
      return res.status(403).json({ error: 'You can only delete your own views' });
    }
    
    const stmt = db.prepare('DELETE FROM views WHERE id = ?');
    const result = stmt.run(viewId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'View not found' });
    }
    
    res.json({ message: 'View deleted successfully' });
  } catch (error) {
    console.error('Delete view error:', error);
    res.status(500).json({ error: 'Failed to delete view' });
  }
});

// Test email configuration endpoint
app.post('/api/admin/test-email', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    // Get mail server settings
    const settings = db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?, ?, ?, ?, ?)').all(
      'SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD', 
      'SMTP_FROM_EMAIL', 'SMTP_FROM_NAME', 'SMTP_SECURE', 'MAIL_ENABLED'
    );
    
    const mailSettings = {};
    settings.forEach(setting => {
      mailSettings[setting.key] = setting.value;
    });
    
    // Check if mail is enabled
    if (mailSettings.MAIL_ENABLED !== 'true') {
      return res.status(400).json({ error: 'Mail server is not enabled. Please enable it first.' });
    }
    
    // Check if all required settings are present
    const requiredFields = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'SMTP_FROM_EMAIL', 'SMTP_FROM_NAME'];
    for (const field of requiredFields) {
      if (!mailSettings[field]) {
        console.log(`Missing field: ${field}, value: ${mailSettings[field]}`);
        return res.status(400).json({ error: `Missing required setting: ${field}` });
      }
    }
    
    // Create a safe copy of mail settings for logging (hide password)
    const safeMailSettings = { ...mailSettings };
    if (safeMailSettings.SMTP_PASSWORD) {
      safeMailSettings.SMTP_PASSWORD = '*'.repeat(safeMailSettings.SMTP_PASSWORD.length);
    }
    console.log('Mail settings validation passed:', safeMailSettings);
    
    // Create transporter with the configured settings
    const transporter = nodemailer.createTransport({
      host: mailSettings.SMTP_HOST,
      port: parseInt(mailSettings.SMTP_PORT),
      secure: mailSettings.SMTP_SECURE === 'ssl', // true for 465, false for other ports
      auth: {
        user: mailSettings.SMTP_USERNAME,
        pass: mailSettings.SMTP_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false // Allow self-signed certificates
      }
    });
    
    // Send test email to the logged-in admin user
    const testEmail = {
      from: `"${mailSettings.SMTP_FROM_NAME}" <${mailSettings.SMTP_FROM_EMAIL}>`,
      to: req.user.email, // Send to the logged-in admin user
      subject: 'Kanban Mail Server Test - Configuration Validated',
      html: `
        <h2>✅ Mail Server Configuration Test Successful!</h2>
        <p>Your Kanban mail server configuration is working correctly.</p>
        <h3>Configuration Details:</h3>
        <ul>
          <li><strong>SMTP Host:</strong> ${mailSettings.SMTP_HOST}</li>
          <li><strong>SMTP Port:</strong> ${mailSettings.SMTP_PORT}</li>
          <li><strong>Security:</strong> ${mailSettings.SMTP_SECURE}</li>
          <li><strong>From Email:</strong> ${mailSettings.SMTP_FROM_EMAIL}</li>
          <li><strong>From Name:</strong> ${mailSettings.SMTP_FROM_NAME}</li>
        </ul>
        <p><em>This email was sent automatically to test your mail server configuration.</em></p>
      `
    };
    
    // Send the email
    const info = await transporter.sendMail(testEmail);
    
    res.json({ 
      message: 'Test email sent successfully! Check your inbox.',
      messageId: info.messageId,
      settings: {
        host: mailSettings.SMTP_HOST,
        port: mailSettings.SMTP_PORT,
        secure: mailSettings.SMTP_SECURE,
        from: `${mailSettings.SMTP_FROM_NAME} <${mailSettings.SMTP_FROM_EMAIL}>`,
        to: req.user.email
      }
    });
    
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ error: 'Failed to test email configuration' });
  }
});

// Manual OAuth config reload endpoint (for testing)
app.post('/api/admin/reload-oauth', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    if (global.oauthConfigCache) {
      global.oauthConfigCache.invalidated = true;
      console.log('🔄 Manual OAuth config reload triggered by admin');
    }
    res.json({ message: 'OAuth configuration reloaded successfully' });
  } catch (error) {
    console.error('Reload OAuth error:', error);
    res.status(500).json({ error: 'Failed to reload OAuth configuration' });
  }
});

// Public settings endpoint for non-admin users
app.get('/api/settings', (req, res) => {
  try {
    const settings = db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?, ?)').all('SITE_NAME', 'SITE_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL');
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });
    res.json(settingsObj);
  } catch (error) {
    console.error('Get public settings error:', error);
    res.status(500).json({ error: 'Failed to get public settings' });
  }
});

// Check if default admin account exists (public endpoint)
app.get('/api/auth/check-default-admin', (req, res) => {
  try {
    const defaultAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@example.com');
    res.json({ exists: !!defaultAdmin });
  } catch (error) {
    console.error('Error checking default admin:', error);
    res.status(500).json({ error: 'Failed to check default admin status' });
  }
});

// Helper function to get OAuth settings with caching
function getOAuthSettings() {
  // Check if we have cached settings and no cache invalidation flag
  if (global.oauthConfigCache && !global.oauthConfigCache.invalidated) {
    return global.oauthConfigCache.settings;
  }
  
  // Fetch fresh settings from database
  const settings = db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?, ?)').all('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL');
  const settingsObj = {};
  settings.forEach(setting => {
    settingsObj[setting.key] = setting.value;
  });
  
  // Cache the settings
  global.oauthConfigCache = {
    settings: settingsObj,
    invalidated: false,
    timestamp: Date.now()
  };
  
  console.log('🔄 OAuth settings loaded from database:', Object.keys(settingsObj).map(k => `${k}: ${settingsObj[k] ? '✓' : '✗'}`).join(', '));
  return settingsObj;
}

// Google OAuth endpoints
app.get('/api/auth/google/url', (req, res) => {
  try {
    const settingsObj = getOAuthSettings();
    
    if (!settingsObj.GOOGLE_CLIENT_ID || !settingsObj.GOOGLE_CLIENT_SECRET || !settingsObj.GOOGLE_CALLBACK_URL) {
      return res.status(400).json({ error: 'Google OAuth not fully configured. Please set Client ID, Client Secret, and Callback URL.' });
    }
    
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(settingsObj.GOOGLE_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(settingsObj.GOOGLE_CALLBACK_URL)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent('openid email profile')}` +
      `&access_type=offline`;
    
    res.json({ url: googleAuthUrl });
  } catch (error) {
    console.error('Error generating Google OAuth URL:', error);
    res.status(500).json({ error: 'Failed to generate OAuth URL' });
  }
});

app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.redirect('/?error=oauth_failed');
    }
    
    // Get OAuth settings
    const settingsObj = getOAuthSettings();
    
    if (!settingsObj.GOOGLE_CLIENT_ID || !settingsObj.GOOGLE_CLIENT_SECRET || !settingsObj.GOOGLE_CALLBACK_URL) {
      return res.redirect('/?error=oauth_not_configured');
    }
    
    // Exchange code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: settingsObj.GOOGLE_CLIENT_ID,
        client_secret: settingsObj.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: settingsObj.GOOGLE_CALLBACK_URL
      })
    });
    
    if (!tokenResponse.ok) {
      console.error('Google token exchange failed:', await tokenResponse.text());
      return res.redirect('/?error=oauth_token_failed');
    }
    
    const tokenData = await tokenResponse.json();
    
    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    
    if (!userInfoResponse.ok) {
      console.error('Google user info failed:', await userInfoResponse.text());
      return res.redirect('/?error=oauth_userinfo_failed');
    }
    
    const userInfo = await userInfoResponse.json();
    
    // Check if user exists
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(userInfo.email);
    let isNewUser = false;
    
    if (!user) {
      // Create new user
      const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      // Generate a dummy password hash for Google users (they don't have passwords)
      const dummyPasswordHash = bcrypt.hashSync('google-oauth-user', 10);
      const userStmt = db.prepare(`
        INSERT INTO users (id, email, first_name, last_name, auth_provider, google_avatar_url, password_hash) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      userStmt.run(userId, userInfo.email, userInfo.given_name || '', userInfo.family_name || '', 'google', userInfo.picture, dummyPasswordHash);
      
      // Assign user role
      const userRoleId = db.prepare('SELECT id FROM roles WHERE name = ?').get('user').id;
      const userRoleStmt = db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)');
      userRoleStmt.run(userId, userRoleId);
      
      // Create team member
      const memberName = userInfo.name || `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim();
      const memberColor = '#' + Math.floor(Math.random()*16777215).toString(16);
      const memberStmt = db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)');
      memberStmt.run(userId, memberName, memberColor, userId);
      
      user = { id: userId, email: userInfo.email, firstName: userInfo.given_name, lastName: userInfo.family_name };
      isNewUser = true;
    }
    
    // Get user roles from database (for both new and existing users)
    const roles = db.prepare(`
      SELECT r.name 
      FROM roles r 
      JOIN user_roles ur ON r.id = ur.role_id 
      WHERE ur.user_id = ?
    `).all(user.id);
    
    const userRoles = roles.map(r => r.name);
    
    // Generate JWT token - must match local login structure
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        role: userRoles.includes('admin') ? 'admin' : 'user',
        roles: userRoles
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Redirect to login page with token and newUser flag
    if (isNewUser) {
      res.redirect(`/#login?token=${token}&newUser=true`);
    } else {
      res.redirect(`/#login?token=${token}`);
    }
    
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.redirect('/?error=oauth_failed');
  }
});

function wrapQuery(stmt, type) {
  return {
    run(...params) {
      try {
        const result = stmt.run(...params);
        queryLogs.push({
          id: `query-${queryId++}`,
          type,
          query: stmt.source,
          params,
          timestamp: new Date().toISOString()
        });
        return result;
      } catch (error) {
        queryLogs.push({
          id: `query-${queryId++}`,
          type: 'ERROR',
          query: stmt.source,
          params,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    },
    get(...params) {
      try {
        const result = stmt.get(...params);
        queryLogs.push({
          id: `query-${queryId++}`,
          type: 'SELECT',
          query: stmt.source,
          params,
          timestamp: new Date().toISOString()
        });
        return result;
      } catch (error) {
        queryLogs.push({
          id: `query-${queryId++}`,
          type: 'ERROR',
          query: stmt.source,
          params,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    },
    all(...params) {
      try {
        const result = stmt.all(...params);
        queryLogs.push({
          id: `query-${queryId++}`,
          type: 'SELECT',
          query: stmt.source,
          params,
          timestamp: new Date().toISOString()
        });
        return result;
      } catch (error) {
        queryLogs.push({
          id: `query-${queryId++}`,
          type: 'ERROR',
          query: stmt.source,
          params,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    }
  };
}

// Database initialization is now handled by the extracted database module

// API Endpoints
db.exec(`
  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    is_active BOOLEAN DEFAULT 1,
    avatar_path TEXT,
    auth_provider TEXT DEFAULT 'local',
    google_avatar_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    role_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    UNIQUE(user_id, role_id)
  );

  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    position INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS columns (
    id TEXT PRIMARY KEY,
    boardId TEXT NOT NULL,
    title TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    position INTEGER DEFAULT 0,
    title TEXT NOT NULL,
    description TEXT,
    memberId TEXT NOT NULL,
    startDate TEXT NOT NULL,
    dueDate TEXT,
    effort INTEGER NOT NULL,
    columnId TEXT NOT NULL,
    priority TEXT NOT NULL,
    requesterId TEXT NOT NULL,
    boardId TEXT NOT NULL,
    FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (columnId) REFERENCES columns(id) ON DELETE CASCADE,
    FOREIGN KEY (requesterId) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    taskId TEXT NOT NULL,
    text TEXT NOT NULL,
    authorId TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (authorId) REFERENCES members(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    commentId TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL,
    size INTEGER NOT NULL,
    FOREIGN KEY (commentId) REFERENCES comments(id) ON DELETE CASCADE
  );
  
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag TEXT NOT NULL UNIQUE,
    description TEXT,
    color TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS priorities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    priority TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    initial BOOLEAN DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filterName TEXT NOT NULL,
    userId TEXT NOT NULL,
    shared BOOLEAN DEFAULT 0,
    textFilter TEXT,
    dateFromFilter TEXT,
    dateToFilter TEXT,
    memberFilters TEXT, -- JSON array of member IDs
    priorityFilters TEXT, -- JSON array of priorities
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS task_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId TEXT NOT NULL,
    tagId INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (tagId) REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE(taskId, tagId)
  );

  CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    action TEXT NOT NULL,
    taskId TEXT,
    columnId TEXT,
    boardId TEXT,
    tagId INTEGER,
    viewId INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY (columnId) REFERENCES columns(id) ON DELETE SET NULL,
    FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE SET NULL,
    FOREIGN KEY (tagId) REFERENCES tags(id) ON DELETE SET NULL,
    FOREIGN KEY (viewId) REFERENCES views(id) ON DELETE SET NULL
  );
`);

// Initialize authentication data if no roles exist
const roleCount = db.prepare('SELECT COUNT(*) as count FROM roles').get();
if (roleCount.count === 0) {
  // Insert default roles
  const roleStmt = db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)');
  roleStmt.run('admin', 'Full system access and management');
  roleStmt.run('user', 'Standard user access');
  
  // Create default admin user
  const adminPassword = 'admin';
  const passwordHash = bcrypt.hashSync(adminPassword, 10);
  
  const adminUser = {
    id: 'admin-user',
    email: 'admin@example.com',
    passwordHash: passwordHash,
    firstName: 'Admin',
    lastName: 'User'
  };
  
  const userStmt = db.prepare(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, auth_provider) 
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  userStmt.run(adminUser.id, adminUser.email, adminUser.passwordHash, adminUser.firstName, adminUser.lastName, 'local');
  
  // Assign admin role to default user
  const adminRoleId = db.prepare('SELECT id FROM roles WHERE name = ?').get('admin').id;
  const userRoleStmt = db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)');
  userRoleStmt.run(adminUser.id, adminRoleId);
  
  // Initialize default settings
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('GOOGLE_CLIENT_ID', null);
  insertSetting.run('GOOGLE_CLIENT_SECRET', null);
  insertSetting.run('GOOGLE_CALLBACK_URL', 'http://localhost:3000/api/auth/google/callback');
  insertSetting.run('SITE_NAME', 'Easy Kanban');
  insertSetting.run('SITE_URL', 'http://localhost:3000');
  
  // Initialize mail server settings
  insertSetting.run('SMTP_HOST', 'smtp.gmail.com');
  insertSetting.run('SMTP_PORT', '587');
  insertSetting.run('SMTP_USERNAME', 'admin@example.com');
  insertSetting.run('SMTP_PASSWORD', 'xxxx xxxx xxxx xxxx');
  insertSetting.run('SMTP_FROM_EMAIL', 'admin@example.com');
  insertSetting.run('SMTP_FROM_NAME', 'Kanban Admin');
  insertSetting.run('SMTP_SECURE', 'tls');
  insertSetting.run('MAIL_ENABLED', 'false');
  
  // Create admin member
  const adminMember = {
    id: 'admin-member',
    name: 'Admin User',
    color: '#FF6B6B'
  };
  
  const memberStmt = db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)');
  memberStmt.run(adminMember.id, adminMember.name, adminMember.color, adminUser.id);
}

// Initialize default priorities if none exist
const priorityCount = db.prepare('SELECT COUNT(*) as count FROM priorities').get();
if (priorityCount.count === 0) {
  const defaultPriorities = [
    { priority: 'low', color: '#4CD964', position: 0, initial: 0 },      // Green
    { priority: 'normal', color: '#007AFF', position: 1, initial: 1 },   // Blue - DEFAULT
    { priority: 'medium', color: '#FF9500', position: 2, initial: 0 },   // Orange  
    { priority: 'high', color: '#FF3B30', position: 3, initial: 0 }      // Red
  ];
  
  const priorityStmt = db.prepare('INSERT INTO priorities (priority, color, position, initial) VALUES (?, ?, ?, ?)');
  defaultPriorities.forEach(p => {
    priorityStmt.run(p.priority, p.color, p.position, p.initial);
  });
  
  console.log('Default priorities initialized');
}

// Initialize default data if no boards exist
const boardCount = db.prepare('SELECT COUNT(*) as count FROM boards').get();
if (boardCount.count === 0) {
  const defaultBoard = {
    id: 'default-board',
    title: 'Main Board',
    columns: [
      { id: 'todo', title: 'To Do' },
      { id: 'progress', title: 'In Progress' },
      { id: 'testing', title: 'Testing' },
      { id: 'completed', title: 'Completed' }
    ]
  };

  // Create default demo user account (for testing purposes)
  // This maintains the 1:1 relationship between users and team members
  const demoUser = {
    id: 'demo-user',
    email: 'demo@example.com',
    password: 'demo123',
    firstName: 'Demo',
    lastName: 'User'
  };
  
  // Hash password and create user
  const demoPasswordHash = bcrypt.hashSync(demoUser.password, 10);
  const demoUserStmt = db.prepare(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, auth_provider) 
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  demoUserStmt.run(demoUser.id, demoUser.email, demoPasswordHash, demoUser.firstName, demoUser.lastName, 'local');
  
  // Assign user role to demo user
  const userRoleId = db.prepare('SELECT id FROM roles WHERE name = ?').get('user');
  const demoUserRoleStmt = db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)');
  demoUserRoleStmt.run(demoUser.id, userRoleId.id);
  
  // Create team member for demo user
  const demoMember = {
    id: demoUser.id, // Same ID as user for 1:1 relationship
    name: `${demoUser.firstName} ${demoUser.lastName}`,
    color: '#4ECDC4'
  };

  const memberStmt = wrapQuery(
    db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)'),
    'INSERT'
  );
  memberStmt.run(demoMember.id, demoMember.name, demoMember.color, demoUser.id);

  // Create default board
  const boardStmt = wrapQuery(
    db.prepare('INSERT INTO boards (id, title) VALUES (?, ?)'),
    'INSERT'
  );
  boardStmt.run(defaultBoard.id, defaultBoard.title);

  // Create default columns
  const columnStmt = wrapQuery(
    db.prepare('INSERT INTO columns (id, boardId, title, position) VALUES (?, ?, ?, ?)'),
    'INSERT'
  );
  defaultBoard.columns.forEach((column, index) => {
    columnStmt.run(column.id, defaultBoard.id, column.title, index);
  });

  // Create a sample task
  const sampleTask = {
    id: 'sample-task',
    title: 'Welcome to Kanban',
    description: 'This is a sample task to help you get started. Feel free to edit or delete it.',
    memberId: demoUser.id,
    startDate: new Date().toISOString().split('T')[0],
    effort: 1,
    columnId: 'todo',
    priority: 'medium',
    requesterId: demoUser.id,
    boardId: defaultBoard.id
  };

  const taskStmt = wrapQuery(
    db.prepare(`
      INSERT INTO tasks (
        id, title, description, memberId, startDate,
        effort, columnId, priority, requesterId, boardId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    'INSERT'
  );

  taskStmt.run(
    sampleTask.id,
    sampleTask.title,
    sampleTask.description,
    sampleTask.memberId,
    sampleTask.startDate,
    sampleTask.effort,
    sampleTask.columnId,
    sampleTask.priority,
    sampleTask.requesterId,
    sampleTask.boardId
  );
}

// API Endpoints
app.get('/api/members', (req, res) => {
  try {
    // First try the enhanced query with avatar information
    try {
              const stmt = wrapQuery(
          db.prepare(`
            SELECT 
              m.id, m.name, m.color, m.user_id, m.created_at,
              u.avatar_path, u.auth_provider, u.google_avatar_url
            FROM members m
            LEFT JOIN users u ON m.user_id = u.id
            ORDER BY m.created_at ASC
          `), 
          'SELECT'
        );
      const members = stmt.all();
      
      // Transform the data to match the expected format
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
    } catch (enhancedError) {
      // Fallback to basic query if enhanced query fails
      console.log('Enhanced query failed, falling back to basic query:', enhancedError.message);
      const basicStmt = wrapQuery(db.prepare('SELECT * FROM members'), 'SELECT');
      const basicMembers = basicStmt.all();
      
      // Transform basic members to include default avatar info
      const transformedMembers = basicMembers.map(member => ({
        id: member.id,
        name: member.name,
        color: member.color,
        user_id: member.user_id,
        avatarUrl: null,
        authProvider: 'local',
        googleAvatarUrl: null
      }));
      
      res.json(transformedMembers);
    }
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

app.post('/api/members', (req, res) => {
  const { id, name, color } = req.body;
  
  try {
    const stmt = wrapQuery(
      db.prepare('INSERT INTO members (id, name, color) VALUES (?, ?, ?)'),
      'INSERT'
    );
    stmt.run(id, name, color);
    res.json({ id, name, color });
  } catch (error) {
    console.error('Error creating member:', error);
    res.status(500).json({ error: 'Failed to create member' });
  }
});

app.delete('/api/members/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    const stmt = wrapQuery(
      db.prepare('DELETE FROM members WHERE id = ?'),
      'DELETE'
    );
    stmt.run(id);
    res.json({ message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Error deleting member:', error);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

app.get('/api/boards', (req, res) => {
  try {
    // Get all boards ordered by position (cast to integer for proper sorting)
    const boardsStmt = wrapQuery(db.prepare('SELECT * FROM boards ORDER BY CAST(position AS INTEGER)'), 'SELECT');
    const boards = boardsStmt.all();
    
    // Prepare statements for related data
    const columnsStmt = wrapQuery(
      db.prepare('SELECT * FROM columns WHERE boardId = ? ORDER BY position'),
      'SELECT'
    );
    const tasksStmt = wrapQuery(
      db.prepare(`
        SELECT t.*, 
          json_group_array(
            DISTINCT CASE WHEN c.id IS NOT NULL THEN json_object(
              'id', c.id,
              'text', c.text,
              'authorId', c.authorId,
              'createdAt', c.createdAt
            ) ELSE NULL END
          ) as comments,
          json_group_array(
            DISTINCT CASE WHEN tag.id IS NOT NULL THEN json_object(
              'id', tag.id,
              'tag', tag.tag,
              'description', tag.description,
              'color', tag.color
            ) ELSE NULL END
          ) as tags
        FROM tasks t
        LEFT JOIN comments c ON c.taskId = t.id
        LEFT JOIN task_tags tt ON tt.taskId = t.id
        LEFT JOIN tags tag ON tag.id = tt.tagId
        WHERE t.boardId = ?
        GROUP BY t.id
      `),
      'SELECT'
    );
    
    const boardsWithData = boards.map(board => {
      const columns = columnsStmt.all(board.id);
      const tasks = tasksStmt.all(board.id).map(task => ({
        ...task,
        comments: task.comments === '[null]' ? [] : JSON.parse(task.comments).filter(Boolean),
        tags: task.tags === '[null]' ? [] : JSON.parse(task.tags).filter(Boolean)
      }));
      
      // Create columns object with tasks
      const columnsObj = {};
      columns.forEach(column => {
        columnsObj[column.id] = {
          ...column,
          tasks: tasks.filter(task => task.columnId === column.id)
        };
      });
      
      return {
        ...board,
        columns: columnsObj
      };
    });
    
    res.json(boardsWithData);
  } catch (error) {
    console.error('Error fetching boards:', error);
    res.status(500).json({ error: 'Failed to fetch boards' });
  }
});

app.post('/api/boards', (req, res) => {
  const { id, title, columns } = req.body;
  
  try {
    // Get the highest position and add 1
    const maxPosition = db.prepare('SELECT COALESCE(MAX(CAST(position AS INTEGER)), -1) as maxPos FROM boards').get();
    const newPosition = maxPosition.maxPos + 1;
    
    const boardStmt = wrapQuery(
      db.prepare('INSERT INTO boards (id, title, position) VALUES (?, ?, ?)'),
      'INSERT'
    );
    boardStmt.run(id, title, newPosition);
    
    const columnStmt = wrapQuery(
      db.prepare('INSERT INTO columns (id, boardId, title, position) VALUES (?, ?, ?, ?)'),
      'INSERT'
    );
    
    Object.values(columns).forEach((column, index) => {
      columnStmt.run(column.id, id, column.title, index);
    });
    
    const boardWithColumns = { id, title, columns, position: newPosition };
    
    res.json(boardWithColumns);
  } catch (error) {
    console.error('Error creating board:', error);
    res.status(500).json({ error: 'Failed to create board' });
  }
});

app.put('/api/boards/:id', (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  
  try {
    const stmt = wrapQuery(
      db.prepare('UPDATE boards SET title = ? WHERE id = ?'),
      'UPDATE'
    );
    stmt.run(title, id);
    res.json({ id, title });
  } catch (error) {
    console.error('Error updating board:', error);
    res.status(500).json({ error: 'Failed to update board' });
  }
});

app.delete('/api/boards/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    const stmt = wrapQuery(
      db.prepare('DELETE FROM boards WHERE id = ?'),
      'DELETE'
    );
    stmt.run(id);
    res.json({ message: 'Board deleted successfully' });
  } catch (error) {
    console.error('Error deleting board:', error);
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

app.post('/api/boards/reorder', (req, res) => {
  const { boardId, newPosition } = req.body;
  
  try {
    // Get current board position
    const currentBoard = db.prepare('SELECT position FROM boards WHERE id = ?').get(boardId);
    if (!currentBoard) {
      return res.status(404).json({ error: 'Board not found' });
    }
    
    const currentPosition = parseInt(currentBoard.position) || 0;
    if (currentPosition === newPosition) {
      return res.json({ message: 'No change needed' });
    }
    
    const transaction = db.transaction(() => {
      // Get all boards ordered by current position
      const allBoards = db.prepare('SELECT id, position FROM boards ORDER BY position').all();
      
      // Reset all positions to simple integers (0, 1, 2, 3, etc.)
      allBoards.forEach((board, index) => {
        db.prepare('UPDATE boards SET position = ? WHERE id = ?').run(index, board.id);
      });
      
      // Now get the normalized positions and find the target and dragged boards
      const normalizedBoards = db.prepare('SELECT id, position FROM boards ORDER BY position').all();
      const draggedBoard = normalizedBoards.find(board => board.id === boardId);
      const targetBoard = normalizedBoards.find(board => board.position === newPosition);
      
      if (draggedBoard && targetBoard) {
        // Simple swap: just swap the two positions
        db.prepare('UPDATE boards SET position = ? WHERE id = ?').run(targetBoard.position, draggedBoard.id);
        db.prepare('UPDATE boards SET position = ? WHERE id = ?').run(draggedBoard.position, targetBoard.id);
      }
    });
    
    transaction();
    res.json({ message: 'Boards reordered successfully' });
  } catch (error) {
    console.error('Error reordering boards:', error);
    res.status(500).json({ error: 'Failed to reorder boards' });
  }
});

app.post('/api/columns', (req, res) => {
  const { id, boardId, title } = req.body;
  
  try {
    // Get the highest position for this board and add 1
    const maxPosition = db.prepare('SELECT COALESCE(MAX(position), -1) as maxPos FROM columns WHERE boardId = ?').get(boardId);
    const newPosition = maxPosition.maxPos + 1;
    
    const stmt = wrapQuery(
      db.prepare('INSERT INTO columns (id, boardId, title, position) VALUES (?, ?, ?, ?)'),
      'INSERT'
    );
    stmt.run(id, boardId, title, newPosition);
    res.json({ id, boardId, title, position: newPosition, tasks: [] });
  } catch (error) {
    console.error('Error creating column:', error);
    res.status(500).json({ error: 'Failed to create column' });
  }
});

app.put('/api/columns/:id', (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  
  try {
    const stmt = wrapQuery(
      db.prepare('UPDATE columns SET title = ? WHERE id = ?'),
      'UPDATE'
    );
    stmt.run(title, id);
    res.json({ id, title });
  } catch (error) {
    console.error('Error updating column:', error);
    res.status(500).json({ error: 'Failed to update column' });
  }
});

app.delete('/api/columns/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    const stmt = wrapQuery(
      db.prepare('DELETE FROM columns WHERE id = ?'),
      'DELETE'
    );
    stmt.run(id);
    res.json({ message: 'Column deleted successfully' });
  } catch (error) {
    console.error('Error deleting column:', error);
    res.status(500).json({ error: 'Failed to delete column' });
  }
});

// Add task at top endpoint
app.post('/api/tasks/add-at-top', (req, res) => {
  const task = req.body;
  
  try {
    // Begin transaction to add task at top and shift others
    const transaction = db.transaction(() => {
      // Shift all existing tasks in this column down by 1
      db.prepare(`
        UPDATE tasks 
        SET position = position + 1 
        WHERE columnId = ?
      `).run(task.columnId);
      
      // Insert new task at position 0
      db.prepare(`
        INSERT INTO tasks (
          id, title, description, memberId, startDate, 
          effort, columnId, priority, requesterId, boardId, position
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(
        task.id,
        task.title,
        task.description,
        task.memberId,
        task.startDate,
        task.effort,
        task.columnId,
        task.priority,
        task.requesterId,
        task.boardId
      );
    });
    
    transaction();
    res.json({ ...task, comments: [], position: 0 });
  } catch (error) {
    console.error('Error adding task at top:', error);
    res.status(500).json({ error: 'Failed to add task at top' });
  }
});

// Task reordering endpoint
app.post('/api/tasks/reorder', (req, res) => {
  const { taskId, newPosition, columnId } = req.body;
  
  try {
    // Get current position of the task being moved
    const currentTask = db.prepare('SELECT position FROM tasks WHERE id = ? AND columnId = ?').get(taskId, columnId);
    if (!currentTask) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const currentPosition = currentTask.position || 0;
    
    if (currentPosition === newPosition) {
      return res.json({ message: 'No change needed' });
    }
    
    // Begin transaction for position updates
    const transaction = db.transaction(() => {
      if (currentPosition < newPosition) {
        // Moving down: shift tasks between current and new position up by 1
        db.prepare(`
          UPDATE tasks 
          SET position = position - 1 
          WHERE columnId = ? AND position > ? AND position <= ?
        `).run(columnId, currentPosition, newPosition);
      } else {
        // Moving up: shift tasks between new and current position down by 1
        db.prepare(`
          UPDATE tasks 
          SET position = position + 1 
          WHERE columnId = ? AND position >= ? AND position < ?
        `).run(columnId, newPosition, currentPosition);
      }
      
      // Update the moved task to its new position
      db.prepare('UPDATE tasks SET position = ? WHERE id = ?').run(newPosition, taskId);
    });
    
    transaction();
    res.json({ message: 'Tasks reordered successfully' });
  } catch (error) {
    console.error('Error reordering tasks:', error);
    res.status(500).json({ error: 'Failed to reorder tasks' });
  }
});

app.post('/api/columns/reorder', (req, res) => {
  const { columnId, newPosition, boardId } = req.body;
  
  try {
    // Get current position of the column being moved
    const currentColumn = db.prepare('SELECT position FROM columns WHERE id = ? AND boardId = ?').get(columnId, boardId);
    if (!currentColumn) {
      return res.status(404).json({ error: 'Column not found' });
    }
    
    const currentPosition = currentColumn.position;
    
    if (currentPosition === newPosition) {
      return res.json({ message: 'No change needed' });
    }
    
    // Begin transaction for position updates
    const transaction = db.transaction(() => {
      if (currentPosition < newPosition) {
        // Moving down: shift columns between current and new position up by 1
        db.prepare(`
          UPDATE columns 
          SET position = position - 1 
          WHERE boardId = ? AND position > ? AND position <= ?
        `).run(boardId, currentPosition, newPosition);
      } else {
        // Moving up: shift columns between new and current position down by 1
        db.prepare(`
          UPDATE columns 
          SET position = position + 1 
          WHERE boardId = ? AND position >= ? AND position < ?
        `).run(boardId, newPosition, currentPosition);
      }
      
      // Update the moved column to its new position
      db.prepare('UPDATE columns SET position = ? WHERE id = ?').run(newPosition, columnId);
    });
    
    transaction();
    res.json({ message: 'Columns reordered successfully' });
  } catch (error) {
    console.error('Error reordering columns:', error);
    res.status(500).json({ error: 'Failed to reorder columns' });
  }
});

app.get('/api/tasks', (req, res) => {
  try {
    const tasks = db.prepare(`
      SELECT t.*,
        json_group_array(
          DISTINCT CASE WHEN c.id IS NOT NULL THEN json_object(
            'id', c.id,
            'text', c.text,
            'authorId', c.authorId,
            'createdAt', c.createdAt,
            'taskId', t.id
          ) ELSE NULL END
        ) as comments,
        json_group_array(
          DISTINCT CASE WHEN tag.id IS NOT NULL THEN json_object(
            'id', tag.id,
            'tag', tag.tag,
            'description', tag.description,
            'color', tag.color
          ) ELSE NULL END
        ) as tags
      FROM tasks t
      LEFT JOIN comments c ON t.id = c.taskId
      LEFT JOIN task_tags tt ON tt.taskId = t.id
      LEFT JOIN tags tag ON tag.id = tt.tagId
      GROUP BY t.id
    `).all();

    const processedTasks = tasks.map(task => ({
      ...task,
      comments: JSON.parse(task.comments)
        .filter(Boolean)
        .map(comment => ({
          ...comment,
          attachments: JSON.parse(comment.attachments || '[]')
            .filter(Boolean)
        })),
      tags: JSON.parse(task.tags).filter(Boolean)
    }));

    res.json(processedTasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.post('/api/tasks', (req, res) => {
  const task = req.body;
  
  try {
    const stmt = wrapQuery(
      db.prepare(`
        INSERT INTO tasks (
          id, title, description, memberId, startDate, 
          effort, columnId, priority, requesterId, boardId, position
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      'INSERT'
    );
    
    stmt.run(
      task.id,
      task.title,
      task.description,
      task.memberId,
      task.startDate,
      task.effort,
      task.columnId,
      task.priority,
      task.requesterId,
      task.boardId,
      task.position !== undefined ? task.position : 0 // Properly handle position
    );
    
    const taskWithComments = { ...task, comments: [] };
    
    // Real-time events disabled
    // TODO: Re-implement when Socket.IO is fixed
    
    res.json(taskWithComments);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const task = req.body;
  
  try {
    const stmt = wrapQuery(
      db.prepare(`
        UPDATE tasks SET 
          title = ?, description = ?, memberId = ?, 
          startDate = ?, effort = ?, columnId = ?, 
          priority = ?, requesterId = ?, boardId = ?, position = ?, dueDate = ?
        WHERE id = ?
      `),
      'UPDATE'
    );
    
    stmt.run(
      task.title,
      task.description,
      task.memberId,
      task.startDate,
      task.effort,
      task.columnId,
      task.priority,
      task.requesterId,
      task.boardId,
      task.position !== undefined ? task.position : 0, // Properly handle position
      task.dueDate || null,
      id
    );
    
    // Real-time events disabled
    // TODO: Re-implement when Socket.IO is fixed
    
    res.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    // Get task info before deleting for the real-time event
    const taskInfo = db.prepare('SELECT boardId, columnId FROM tasks WHERE id = ?').get(id);
    
    const stmt = wrapQuery(
      db.prepare('DELETE FROM tasks WHERE id = ?'),
      'DELETE'
    );
    stmt.run(id);
    
    // Real-time events disabled
    // TODO: Re-implement when Socket.IO is fixed
    
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

const ATTACHMENTS_DIR = join(__dirname, 'attachments');
const AVATARS_DIR = join(__dirname, 'avatars');

  // Ensure directories exist
  try {
    await mkdir(ATTACHMENTS_DIR, { recursive: true });
    await mkdir(AVATARS_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating directories:', error);
  }

  // Ensure members table has created_at column (migration)
  try {
    db.prepare('ALTER TABLE members ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP').run();
  } catch (error) {
    // Column already exists, ignore error
    console.log('Members table already has created_at column or migration not needed');
  }

  // Add dueDate column to tasks table (migration)
  try {
    db.prepare('ALTER TABLE tasks ADD COLUMN dueDate TEXT').run();
    console.log('Added dueDate column to tasks table');
  } catch (error) {
    // Column already exists, ignore error
    console.log('Tasks table already has dueDate column or migration not needed');
  }

  // Add position column to priorities table (migration)
  try {
    db.prepare('ALTER TABLE priorities ADD COLUMN position INTEGER NOT NULL DEFAULT 0').run();
    console.log('Added position column to priorities table');
  } catch (error) {
    // Column already exists, ignore error
    console.log('Priorities table already has position column or migration not needed');
  }

  // Clean up orphaned members (members without corresponding users)
  try {
    const orphanedMembers = db.prepare(`
      SELECT m.id, m.name 
      FROM members m 
      LEFT JOIN users u ON m.user_id = u.id 
      WHERE u.id IS NULL
    `).all();
    
    if (orphanedMembers.length > 0) {
      console.log(`Found ${orphanedMembers.length} orphaned members, removing them:`, orphanedMembers);
      db.prepare('DELETE FROM members WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM users)').run();
      console.log('Orphaned members cleaned up');
    }
  } catch (error) {
    console.log('Member cleanup not needed or failed:', error.message);
  }

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ATTACHMENTS_DIR);
  },
  filename: (req, file, cb) => {
    // Create unique filename
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = file.originalname.split('.').pop();
    cb(null, `${uniqueSuffix}.${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Add this to serve static files from the attachments directory
app.use('/attachments', express.static(ATTACHMENTS_DIR));

// Add this to serve static files from the avatars directory
app.use('/avatars', express.static(AVATARS_DIR));

// Add file upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/attachments/${req.file.filename}`;
    res.json({
      id: crypto.randomUUID(),
      name: req.file.originalname,
      url: fileUrl,
      type: req.file.mimetype,
      size: req.file.size
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Configure multer for avatar uploads
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, AVATARS_DIR);
  },
  filename: (req, file, cb) => {
    // Create unique filename for avatars
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = file.originalname.split('.').pop();
    cb(null, `avatar-${uniqueSuffix}.${ext}`);
  }
});

// Function to generate default avatar SVG
const generateDefaultAvatar = (firstName, lastName, color) => {
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  return `
    <svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="50" fill="${color}"/>
      <text x="50" y="60" font-family="Arial, sans-serif" font-size="32" font-weight="bold" 
            text-anchor="middle" fill="white">${initials}</text>
    </svg>
  `;
};

const avatarUpload = multer({ 
  storage: avatarStorage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit for avatars
  },
  fileFilter: (req, file, cb) => {
    // Only allow image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for avatars'));
    }
  }
});

// Add avatar upload endpoint
app.post('/api/users/avatar', authenticateToken, avatarUpload.single('avatar'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No avatar uploaded' });
    }

    const avatarUrl = `/avatars/${req.file.filename}`;
    
    // Update user's avatar_path in database
    const updateStmt = db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?');
    updateStmt.run(avatarUrl, req.user.id);
    
    res.json({
      message: 'Avatar updated successfully',
      avatarUrl: avatarUrl
    });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});



// Remove user avatar
app.delete('/api/users/avatar', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get current avatar path to delete file
    const user = db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(userId);
    
    if (user?.avatar_path) {
      // Delete the avatar file
      const avatarPath = join(AVATARS_DIR, user.avatar_path.split('/').pop());
      if (fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath);
      }
    }
    
    // Clear avatar_path in database
    const updateStmt = db.prepare('UPDATE users SET avatar_path = NULL WHERE id = ?');
    updateStmt.run(userId);
    
    res.json({ 
      message: 'Avatar removed successfully'
    });
  } catch (error) {
    console.error('Avatar removal error:', error);
    res.status(500).json({ error: 'Failed to remove avatar' });
  }
});

// Allow users to update their own profile (display name)
app.put('/api/users/profile', authenticateToken, (req, res) => {
  try {
    const { displayName } = req.body;
    const userId = req.user.id;
    
    if (!displayName || displayName.trim().length === 0) {
      return res.status(400).json({ error: 'Display name is required' });
    }
    
    // Update the member's name in the members table
    const updateMemberStmt = db.prepare('UPDATE members SET name = ? WHERE user_id = ?');
    updateMemberStmt.run(displayName.trim(), userId);
    
    res.json({ 
      message: 'Profile updated successfully',
      displayName: displayName.trim()
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Admin avatar upload endpoint
app.post('/api/admin/users/:userId/avatar', authenticateToken, requireRole(['admin']), avatarUpload.single('avatar'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No avatar uploaded' });
    }

    const userId = req.params.userId;
    const avatarUrl = `/avatars/${req.file.filename}`;
    
    // Update user's avatar_path in database
    const updateStmt = db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?');
    updateStmt.run(avatarUrl, userId);
    
    res.json({
      message: 'Avatar updated successfully',
      avatarUrl: avatarUrl
    });
  } catch (error) {
    console.error('Error uploading admin avatar:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// Admin avatar removal endpoint
app.delete('/api/admin/users/:userId/avatar', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const userId = req.params.userId;
    
    // Get current avatar path to delete file
    const user = db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(userId);
    
    if (user?.avatar_path) {
      // Delete the avatar file
      const avatarPath = join(AVATARS_DIR, user.avatar_path.split('/').pop());
      if (fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath);
      }
    }
    
    // Clear avatar_path in database
    const updateStmt = db.prepare('UPDATE users SET avatar_path = NULL WHERE id = ?');
    updateStmt.run(userId);
    
    res.json({ 
      message: 'Avatar removed successfully'
    });
  } catch (error) {
    console.error('Avatar removal error:', error);
    res.status(500).json({ error: 'Failed to remove avatar' });
  }
});

// Admin member name update endpoint
app.put('/api/admin/users/:userId/member-name', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { userId } = req.params;
    const { displayName } = req.body;
    
    if (!displayName || displayName.trim().length === 0) {
      return res.status(400).json({ error: 'Display name is required' });
    }
    
    // Update the member's name in the members table
    const updateMemberStmt = db.prepare('UPDATE members SET name = ? WHERE user_id = ?');
    const result = updateMemberStmt.run(displayName.trim(), userId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    res.json({ 
      message: 'Member name updated successfully',
      displayName: displayName.trim()
    });
  } catch (error) {
    console.error('Member name update error:', error);
    res.status(500).json({ error: 'Failed to update member name' });
  }
});

// Update the existing comments endpoint
app.post('/api/comments', (req, res) => {
  const comment = req.body;
  
  try {
    // Begin transaction
    db.prepare('BEGIN').run();

    try {
      // Insert comment
      const commentStmt = wrapQuery(
        db.prepare(`
          INSERT INTO comments (id, taskId, text, authorId, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `),
        'INSERT'
      );
      
      commentStmt.run(
        comment.id,
        comment.taskId,
        comment.text,
        comment.authorId,
        comment.createdAt
      );
      
      // Insert attachments if any
      if (comment.attachments?.length > 0) {
        const attachmentStmt = wrapQuery(
          db.prepare(`
            INSERT INTO attachments (id, commentId, name, url, type, size)
            VALUES (?, ?, ?, ?, ?, ?)
          `),
          'INSERT'
        );
        
        comment.attachments.forEach(attachment => {
          attachmentStmt.run(
            attachment.id,
            comment.id,
            attachment.name,
            attachment.url,
            attachment.type,
            attachment.size
          );
        });
      }

      // Commit transaction
      db.prepare('COMMIT').run();
      res.json(comment);
    } catch (error) {
      // Rollback on error
      db.prepare('ROLLBACK').run();
      throw error;
    }
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// Add comment deletion endpoint with file cleanup
app.delete('/api/comments/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Get attachments before deleting the comment
    const attachmentsStmt = wrapQuery(
      db.prepare('SELECT url FROM attachments WHERE commentId = ?'),
      'SELECT'
    );
    const attachments = attachmentsStmt.all(id);

    // Delete the files from disk
    for (const attachment of attachments) {
      const filePath = join(__dirname, '..', attachment.url);
      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
        console.error('Error deleting file:', error);
      }
    }

    // Delete the comment (cascades to attachments)
    const stmt = wrapQuery(
      db.prepare('DELETE FROM comments WHERE id = ?'),
      'DELETE'
    );
    stmt.run(id);

    res.json({ message: 'Comment and attachments deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

app.get('/api/debug/logs', (req, res) => {
  res.json(queryLogs);
});

app.post('/api/debug/logs/clear', (req, res) => {
  queryLogs.length = 0;
  res.json({ message: 'Logs cleared successfully' });
});

// New endpoint to fetch comment attachments
app.get('/api/comments/:commentId/attachments', (req, res) => {
  try {
    const attachments = db.prepare(`
      SELECT 
        id,
        name,
        url,
        type,
        size
      FROM attachments
      WHERE commentId = ?
    `).all(req.params.commentId);

    res.json(attachments);
  } catch (error) {
    console.error('Error fetching comment attachments:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

// Serve attachment files
app.get('/attachments/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    
    // Get the file path from the uploads directory
    const filePath = path.join(__dirname, 'uploads', filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error('File not found:', filePath);
      return res.status(404).send('File not found');
    }

    // Send the file with proper content type
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('Error sending file:', err);
        res.status(500).send('Error sending file');
      }
    });
    
  } catch (error) {
    console.error('Error serving attachment:', error);
    res.status(500).send('Error serving attachment');
  }
});

// Health check endpoint for Docker
app.get('/health', (req, res) => {
  try {
    // Check if database is accessible
    db.prepare('SELECT 1').get();
    res.status(200).json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message
    });
  }
});



// Socket.IO temporarily removed due to connection loop issues
// TODO: Implement simpler real-time solution

const PORT = process.env.PORT || 3222;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Real-time collaboration temporarily disabled`);
});
