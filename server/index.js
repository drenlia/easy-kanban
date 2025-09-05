import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Import our extracted modules
import { initializeDatabase } from './config/database.js';
import { authenticateToken, requireRole, generateToken, JWT_SECRET, JWT_EXPIRES_IN } from './middleware/auth.js';
import { attachmentUpload, avatarUpload } from './config/multer.js';
import { wrapQuery, getQueryLogs, clearQueryLogs } from './utils/queryLogger.js';
import { createDefaultAvatar } from './utils/avatarGenerator.js';

// Import route modules
import boardsRouter from './routes/boards.js';
import tasksRouter from './routes/tasks.js';
import membersRouter from './routes/members.js';
import columnsRouter from './routes/columns.js';
import authRouter from './routes/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize database using extracted module
const db = initializeDatabase();
const app = express();

// Make database available to routes
app.locals.db = db;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static files
app.use('/attachments', express.static(path.join(__dirname, 'attachments')));
app.use('/avatars', express.static(path.join(__dirname, 'avatars')));

// ================================
// AUTHENTICATION ENDPOINTS
// ================================

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
    const existingUser = wrapQuery(db.prepare('SELECT id FROM users WHERE email = ?'), 'SELECT').get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user
    const userId = crypto.randomUUID();
    wrapQuery(db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name) 
      VALUES (?, ?, ?, ?, ?)
    `), 'INSERT').run(userId, email, passwordHash, firstName, lastName);
    
    // Assign role
    const roleId = wrapQuery(db.prepare('SELECT id FROM roles WHERE name = ?'), 'SELECT').get(role)?.id;
    if (roleId) {
      wrapQuery(db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)'), 'INSERT').run(userId, roleId);
    }
    
    // Create member for the user
    const memberId = crypto.randomUUID();
    const memberColor = '#4ECDC4'; // Default color
    wrapQuery(db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)'), 'INSERT')
      .run(memberId, `${firstName} ${lastName}`, memberColor, userId);
    
    // Generate default avatar
    const avatarPath = createDefaultAvatar(`${firstName} ${lastName}`, userId);
    if (avatarPath) {
      wrapQuery(db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?'), 'UPDATE').run(avatarPath, userId);
    }
    
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
    console.error('Auth/me error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

app.get('/api/auth/check-default-admin', (req, res) => {
  try {
    const defaultAdmin = wrapQuery(db.prepare('SELECT id FROM users WHERE email = ?'), 'SELECT').get('admin@example.com');
    res.json({ hasDefaultAdmin: !!defaultAdmin });
  } catch (error) {
    console.error('Error checking default admin:', error);
    res.status(500).json({ error: 'Failed to check default admin' });
  }
});

// ================================
// API ROUTES
// ================================

// Use route modules
app.use('/api/members', membersRouter);
app.use('/api/boards', boardsRouter);
app.use('/api/columns', columnsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/auth', authRouter);

// ================================
// ADDITIONAL ENDPOINTS
// ================================

// Comments endpoints
app.post('/api/comments', (req, res) => {
  const comment = req.body;
  
  try {
    // Begin transaction
    db.prepare('BEGIN').run();

    try {
      // Insert comment
      const commentStmt = db.prepare(`
        INSERT INTO comments (id, taskId, text, authorId, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      commentStmt.run(
        comment.id,
        comment.taskId,
        comment.text,
        comment.authorId,
        comment.createdAt
      );
      
      // Insert attachments if any
      if (comment.attachments?.length > 0) {
        const attachmentStmt = db.prepare(`
          INSERT INTO attachments (id, commentId, name, url, type, size)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        
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

app.delete('/api/comments/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Get attachments before deleting the comment
    const attachmentsStmt = db.prepare('SELECT url FROM attachments WHERE commentId = ?');
    const attachments = attachmentsStmt.all(id);

    // Delete the files from disk
    for (const attachment of attachments) {
      const filePath = path.join(__dirname, '..', attachment.url);
      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
        console.error('Error deleting file:', error);
      }
    }

    // Delete the comment (cascades to attachments)
    const stmt = db.prepare('DELETE FROM comments WHERE id = ?');
    stmt.run(id);

    res.json({ message: 'Comment and attachments deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
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

// File upload endpoints
app.post('/api/upload', attachmentUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  res.json({
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    url: `/attachments/${req.file.filename}`
  });
});

// Avatar upload endpoints
app.post('/api/users/avatar', authenticateToken, avatarUpload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No avatar file uploaded' });
  }

  try {
    const avatarPath = `/avatars/${req.file.filename}`;
    wrapQuery(db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?'), 'UPDATE').run(avatarPath, req.user.id);
    
    res.json({
      message: 'Avatar uploaded successfully',
      avatarUrl: avatarPath
    });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

app.delete('/api/users/avatar', authenticateToken, (req, res) => {
  try {
    wrapQuery(db.prepare('UPDATE users SET avatar_path = NULL WHERE id = ?'), 'UPDATE').run(req.user.id);
    res.json({ message: 'Avatar removed successfully' });
  } catch (error) {
    console.error('Error removing avatar:', error);
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
    
    // Check for duplicate display name (excluding current user)
    const existingMember = wrapQuery(
      db.prepare('SELECT id FROM members WHERE LOWER(name) = LOWER(?) AND user_id != ?'), 
      'SELECT'
    ).get(displayName.trim(), userId);
    
    if (existingMember) {
      return res.status(400).json({ error: 'This display name is already taken by another user' });
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

// Allow users to delete their own account
app.delete('/api/users/account', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    
    // Security validation: ensure user can only delete their own account
    // The authenticateToken middleware already validates the JWT and sets req.user
    // No additional user ID parameter needed - use the authenticated user's ID
    
    // Check if user exists and is active
    const user = wrapQuery(db.prepare('SELECT id, email, first_name, last_name FROM users WHERE id = ? AND is_active = 1'), 'SELECT').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found or already inactive' });
    }
    
    // Begin transaction for cascading deletion
    const transaction = db.transaction(() => {
      try {
        // 1. Delete user roles
        wrapQuery(db.prepare('DELETE FROM user_roles WHERE user_id = ?'), 'DELETE').run(userId);
        
        // 2. Delete comments made by the user
        wrapQuery(db.prepare('DELETE FROM comments WHERE authorId = (SELECT id FROM members WHERE user_id = ?)'), 'DELETE').run(userId);
        
        // 3. Reassign tasks assigned to the user to the system account (preserve task history)
        const systemMemberId = '00000000-0000-0000-0000-000000000001';
        
        wrapQuery(
          db.prepare('UPDATE tasks SET memberId = ? WHERE memberId = (SELECT id FROM members WHERE user_id = ?)'), 
          'UPDATE'
        ).run(systemMemberId, userId);
        
        // 4. Reassign tasks requested by the user to the system account
        wrapQuery(
          db.prepare('UPDATE tasks SET requesterId = ? WHERE requesterId = (SELECT id FROM members WHERE user_id = ?)'), 
          'UPDATE'
        ).run(systemMemberId, userId);
        
        // 5. Delete the member record
        wrapQuery(db.prepare('DELETE FROM members WHERE user_id = ?'), 'DELETE').run(userId);
        
        // 6. Finally, delete the user account
        wrapQuery(db.prepare('DELETE FROM users WHERE id = ?'), 'DELETE').run(userId);
        
        console.log(`🗑️ Account deleted successfully for user: ${user.email}`);
        
      } catch (error) {
        console.error('Error during account deletion transaction:', error);
        throw error;
      }
    });
    
    // Execute the transaction
    transaction();
    
    res.json({ 
      message: 'Account deleted successfully',
      deletedUser: {
        email: user.email,
        name: `${user.first_name} ${user.last_name}`
      }
    });
    
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Admin endpoints
app.get('/api/admin/users', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    // Prevent browser caching of admin user data
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    const users = wrapQuery(db.prepare(`
      SELECT u.*, GROUP_CONCAT(r.name) as roles, m.name as member_name, m.color as member_color
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN members m ON u.id = m.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `), 'SELECT').all();

    const transformedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      displayName: user.member_name || `${user.first_name} ${user.last_name}`,
      roles: user.roles ? user.roles.split(',') : [],
      isActive: !!user.is_active,
      createdAt: user.created_at,
      avatarUrl: user.avatar_path,
      authProvider: user.auth_provider || 'local',
      memberName: user.member_name,
      memberColor: user.member_color
    }));


    res.json(transformedUsers);
  } catch (error) {
    console.error('Error fetching admin users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Admin member name update endpoint (MUST come before /:userId route)
app.put('/api/admin/users/:userId/member-name', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { userId } = req.params;
    const { displayName } = req.body;
    
    if (!displayName || displayName.trim().length === 0) {
      return res.status(400).json({ error: 'Display name is required' });
    }
    
    // Check for duplicate display name (excluding current user)
    const existingMember = wrapQuery(
      db.prepare('SELECT id FROM members WHERE LOWER(name) = LOWER(?) AND user_id != ?'), 
      'SELECT'
    ).get(displayName.trim(), userId);
    
    if (existingMember) {
      return res.status(400).json({ error: 'This display name is already taken by another user' });
    }
    
    console.log('🏷️ Updating member name for user:', userId, 'to:', displayName.trim());
    
    // Update the member's name in the members table
    const updateMemberStmt = wrapQuery(db.prepare('UPDATE members SET name = ? WHERE user_id = ?'), 'UPDATE');
    const result = updateMemberStmt.run(displayName.trim(), userId);
    
    if (result.changes === 0) {
      console.log('❌ No member found for user:', userId);
      return res.status(404).json({ error: 'Member not found' });
    }
    
    console.log('✅ Member name updated successfully');
    res.json({ 
      message: 'Member name updated successfully',
      displayName: displayName.trim()
    });
  } catch (error) {
    console.error('Member name update error:', error);
    res.status(500).json({ error: 'Failed to update member name' });
  }
});

// Update user details (MUST come after more specific routes)
app.put('/api/admin/users/:userId', authenticateToken, requireRole(['admin']), (req, res) => {
  const { userId } = req.params;
  const { email, firstName, lastName, isActive } = req.body;
  
  if (!email || !firstName || !lastName) {
    return res.status(400).json({ error: 'Email, first name, and last name are required' });
  }

  try {
    // Check if email already exists for another user
    const existingUser = wrapQuery(db.prepare('SELECT id FROM users WHERE email = ? AND id != ?'), 'SELECT').get(email, userId);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Update user
    wrapQuery(db.prepare(`
      UPDATE users SET email = ?, first_name = ?, last_name = ?, is_active = ? 
      WHERE id = ?
    `), 'UPDATE').run(email, firstName, lastName, isActive ? 1 : 0, userId);

    // Note: Member name is updated separately via /api/admin/users/:userId/member-name
    // This allows for custom display names that differ from firstName + lastName

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Update user role
app.put('/api/admin/users/:userId/role', authenticateToken, requireRole(['admin']), (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;
  
  if (!role) {
    return res.status(400).json({ error: 'Role is required' });
  }

  try {
    // Prevent users from demoting themselves
    if (userId === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot change your own admin role' });
    }

    // Get current role
    const currentRoles = wrapQuery(db.prepare(`
      SELECT r.name FROM roles r 
      JOIN user_roles ur ON r.id = ur.role_id 
      WHERE ur.user_id = ?
    `), 'SELECT').all(userId);

    if (currentRoles.length > 0 && currentRoles[0].name !== role) {
      // Remove current role
      wrapQuery(db.prepare('DELETE FROM user_roles WHERE user_id = ?'), 'DELETE').run(userId);
      
      // Assign new role
      const roleId = wrapQuery(db.prepare('SELECT id FROM roles WHERE name = ?'), 'SELECT').get(role)?.id;
      if (roleId) {
        wrapQuery(db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)'), 'INSERT').run(userId, roleId);
      }
    }

    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// Create new user
app.post('/api/admin/users', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { email, password, firstName, lastName, role, displayName } = req.body;
  
  if (!email || !password || !firstName || !lastName || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  try {
    // Check if email already exists
    const existingUser = wrapQuery(db.prepare('SELECT id FROM users WHERE email = ?'), 'SELECT').get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Generate user ID
    const userId = crypto.randomUUID();
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user
    wrapQuery(db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name) 
      VALUES (?, ?, ?, ?, ?)
    `), 'INSERT').run(userId, email, passwordHash, firstName, lastName);
    
    // Assign role
    const roleId = wrapQuery(db.prepare('SELECT id FROM roles WHERE name = ?'), 'SELECT').get(role)?.id;
    if (roleId) {
      wrapQuery(db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)'), 'INSERT').run(userId, roleId);
    }
    
    // Create team member automatically with custom display name if provided
    const memberId = crypto.randomUUID();
    const memberName = displayName || `${firstName} ${lastName}`;
    const memberColor = '#4ECDC4'; // Default color
    wrapQuery(db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)'), 'INSERT')
      .run(memberId, memberName, memberColor, userId);
    
    // Generate default avatar SVG for new local users
    const avatarPath = createDefaultAvatar(memberName, userId);
    if (avatarPath) {
      // Update user with default avatar path
      wrapQuery(db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?'), 'UPDATE').run(avatarPath, userId);
    }
    
    res.json({ 
      message: 'User created successfully',
      user: { id: userId, email, firstName, lastName, role }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Get task count for a user (for deletion confirmation)
app.get('/api/admin/users/:userId/task-count', authenticateToken, requireRole(['admin']), (req, res) => {
  const { userId } = req.params;
  
  try {
    // Count tasks where this user is either the assignee (memberId) or requester (requesterId)
    // First get the member ID for this user
    const member = wrapQuery(db.prepare('SELECT id FROM members WHERE user_id = ?'), 'SELECT').get(userId);
    
    let taskCount = 0;
    if (member) {
      const assignedTasks = wrapQuery(db.prepare('SELECT COUNT(*) as count FROM tasks WHERE memberId = ?'), 'SELECT').get(member.id);
      const requestedTasks = wrapQuery(db.prepare('SELECT COUNT(*) as count FROM tasks WHERE requesterId = ?'), 'SELECT').get(member.id);
      taskCount = (assignedTasks?.count || 0) + (requestedTasks?.count || 0);
    }
    
    res.json({ taskCount });
  } catch (error) {
    console.error('Error getting user task count:', error);
    res.status(500).json({ error: 'Failed to get task count' });
  }
});

// Delete user
app.delete('/api/admin/users/:userId', authenticateToken, requireRole(['admin']), (req, res) => {
  const { userId } = req.params;
  
  try {
    // Check if user is trying to delete themselves
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Delete user (cascade will handle related records)
    const result = wrapQuery(db.prepare('DELETE FROM users WHERE id = ?'), 'DELETE').run(userId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Update member color
app.put('/api/admin/users/:userId/color', authenticateToken, requireRole(['admin']), (req, res) => {
  const { userId } = req.params;
  const { color } = req.body;
  
  if (!color) {
    return res.status(400).json({ error: 'Color is required' });
  }

  // Validate color format (hex color)
  if (!/^#[0-9A-F]{6}$/i.test(color)) {
    return res.status(400).json({ error: 'Invalid color format. Use hex format like #FF5733' });
  }

  try {
    // Update member color
    const result = wrapQuery(db.prepare('UPDATE members SET color = ? WHERE user_id = ?'), 'UPDATE').run(color, userId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Member not found for this user' });
    }
    
    res.json({ message: 'Member color updated successfully' });
  } catch (error) {
    console.error('Error updating member color:', error);
    res.status(500).json({ error: 'Failed to update member color' });
  }
});

// Admin avatar upload endpoint
app.post('/api/admin/users/:userId/avatar', authenticateToken, requireRole(['admin']), avatarUpload.single('avatar'), (req, res) => {
  const { userId } = req.params;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No avatar file uploaded' });
  }

  try {
    const avatarPath = `/avatars/${req.file.filename}`;
    // Update user's avatar_path in database
    wrapQuery(db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?'), 'UPDATE').run(avatarPath, userId);
    
    res.json({
      message: 'Avatar uploaded successfully',
      avatarUrl: avatarPath
    });
  } catch (error) {
    console.error('Error uploading admin avatar:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// Admin avatar removal endpoint
app.delete('/api/admin/users/:userId/avatar', authenticateToken, requireRole(['admin']), (req, res) => {
  const { userId } = req.params;
  
  try {
    // Clear avatar_path in database
    wrapQuery(db.prepare('UPDATE users SET avatar_path = NULL WHERE id = ?'), 'UPDATE').run(userId);
    
    res.json({ message: 'Avatar removed successfully' });
  } catch (error) {
    console.error('Error removing admin avatar:', error);
    res.status(500).json({ error: 'Failed to remove avatar' });
  }
});



// Admin tags endpoints
app.get('/api/admin/tags', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const tags = wrapQuery(db.prepare('SELECT * FROM tags ORDER BY tag ASC'), 'SELECT').all();
    res.json(tags);
  } catch (error) {
    console.error('Error fetching admin tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

app.post('/api/admin/tags', authenticateToken, requireRole(['admin']), (req, res) => {
  const { tag, description, color } = req.body;
  
  if (!tag) {
    return res.status(400).json({ error: 'Tag name is required' });
  }

  try {
    const result = wrapQuery(db.prepare(`
      INSERT INTO tags (tag, description, color) 
      VALUES (?, ?, ?)
    `), 'INSERT').run(tag, description || '', color || '#4F46E5');
    
    const newTag = wrapQuery(db.prepare('SELECT * FROM tags WHERE id = ?'), 'SELECT').get(result.lastInsertRowid);
    res.json(newTag);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Tag already exists' });
    }
    console.error('Error creating tag:', error);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

app.put('/api/admin/tags/:tagId', authenticateToken, requireRole(['admin']), (req, res) => {
  const { tagId } = req.params;
  const { tag, description, color } = req.body;
  
  if (!tag) {
    return res.status(400).json({ error: 'Tag name is required' });
  }

  try {
    wrapQuery(db.prepare(`
      UPDATE tags SET tag = ?, description = ?, color = ? WHERE id = ?
    `), 'UPDATE').run(tag, description || '', color || '#4F46E5', tagId);
    
    const updatedTag = wrapQuery(db.prepare('SELECT * FROM tags WHERE id = ?'), 'SELECT').get(tagId);
    res.json(updatedTag);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Tag already exists' });
    }
    console.error('Error updating tag:', error);
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

// Get tag usage count (for deletion confirmation)
app.get('/api/admin/tags/:tagId/usage', authenticateToken, requireRole(['admin']), (req, res) => {
  const { tagId } = req.params;
  
  try {
    const usageCount = wrapQuery(db.prepare('SELECT COUNT(*) as count FROM task_tags WHERE tagId = ?'), 'SELECT').get(tagId);
    res.json({ usageCount: usageCount.count });
  } catch (error) {
    console.error('Error fetching tag usage:', error);
    res.status(500).json({ error: 'Failed to fetch tag usage' });
  }
});

app.delete('/api/admin/tags/:tagId', authenticateToken, requireRole(['admin']), (req, res) => {
  const { tagId } = req.params;
  
  try {
    // Use transaction to ensure both operations succeed or fail together
    db.transaction(() => {
      // First remove all task associations
      wrapQuery(db.prepare('DELETE FROM task_tags WHERE tagId = ?'), 'DELETE').run(tagId);
      
      // Then delete the tag
      wrapQuery(db.prepare('DELETE FROM tags WHERE id = ?'), 'DELETE').run(tagId);
    })();
    
    res.json({ message: 'Tag deleted successfully' });
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// Admin priorities endpoints
app.get('/api/admin/priorities', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const priorities = wrapQuery(db.prepare('SELECT * FROM priorities ORDER BY position ASC'), 'SELECT').all();
    res.json(priorities);
  } catch (error) {
    console.error('Error fetching admin priorities:', error);
    res.status(500).json({ error: 'Failed to fetch priorities' });
  }
});

app.post('/api/admin/priorities', authenticateToken, requireRole(['admin']), (req, res) => {
  const { priority, color } = req.body;
  
  if (!priority || !color) {
    return res.status(400).json({ error: 'Priority name and color are required' });
  }

  try {
    // Get the next position
    const maxPosition = wrapQuery(db.prepare('SELECT MAX(position) as maxPos FROM priorities'), 'SELECT').get();
    const position = (maxPosition?.maxPos || -1) + 1;
    
    const result = wrapQuery(db.prepare(`
      INSERT INTO priorities (priority, color, position, initial) 
      VALUES (?, ?, ?, 0)
    `), 'INSERT').run(priority, color, position);
    
    const newPriority = wrapQuery(db.prepare('SELECT * FROM priorities WHERE id = ?'), 'SELECT').get(result.lastInsertRowid);
    res.json(newPriority);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Priority already exists' });
    }
    console.error('Error creating priority:', error);
    res.status(500).json({ error: 'Failed to create priority' });
  }
});

app.put('/api/admin/priorities/:priorityId', authenticateToken, requireRole(['admin']), (req, res) => {
  const { priorityId } = req.params;
  const { priority, color } = req.body;
  
  if (!priority || !color) {
    return res.status(400).json({ error: 'Priority name and color are required' });
  }

  try {
    wrapQuery(db.prepare(`
      UPDATE priorities SET priority = ?, color = ? WHERE id = ?
    `), 'UPDATE').run(priority, color, priorityId);
    
    const updatedPriority = wrapQuery(db.prepare('SELECT * FROM priorities WHERE id = ?'), 'SELECT').get(priorityId);
    res.json(updatedPriority);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Priority already exists' });
    }
    console.error('Error updating priority:', error);
    res.status(500).json({ error: 'Failed to update priority' });
  }
});

app.delete('/api/admin/priorities/:priorityId', authenticateToken, requireRole(['admin']), (req, res) => {
  const { priorityId } = req.params;
  
  try {
    // Check if priority is being used
    const taskCount = wrapQuery(db.prepare('SELECT COUNT(*) as count FROM tasks WHERE priority = (SELECT priority FROM priorities WHERE id = ?)'), 'SELECT').get(priorityId);
    
    if (taskCount.count > 0) {
      return res.status(400).json({ 
        error: `Cannot delete priority: ${taskCount.count} task(s) are using this priority` 
      });
    }
    
    const result = wrapQuery(db.prepare('DELETE FROM priorities WHERE id = ?'), 'DELETE').run(priorityId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Priority not found' });
    }
    
    res.json({ message: 'Priority deleted successfully' });
  } catch (error) {
    console.error('Error deleting priority:', error);
    res.status(500).json({ error: 'Failed to delete priority' });
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

app.put('/api/admin/priorities/:priorityId/set-default', authenticateToken, requireRole(['admin']), (req, res) => {
  const { priorityId } = req.params;
  
  try {
    // Check if priority exists
    const priority = wrapQuery(db.prepare('SELECT * FROM priorities WHERE id = ?'), 'SELECT').get(priorityId);
    if (!priority) {
      return res.status(404).json({ error: 'Priority not found' });
    }

    // Start transaction to ensure only one priority can be default
    db.transaction(() => {
      // First, remove default flag from all priorities
      wrapQuery(db.prepare('UPDATE priorities SET initial = 0'), 'UPDATE').run();
      // Then set the specified priority as default
      wrapQuery(db.prepare('UPDATE priorities SET initial = 1 WHERE id = ?'), 'UPDATE').run(priorityId);
    })();

    // Return updated priority
    const updatedPriority = wrapQuery(db.prepare('SELECT * FROM priorities WHERE id = ?'), 'SELECT').get(priorityId);
    res.json(updatedPriority);
  } catch (error) {
    console.error('Error setting default priority:', error);
    res.status(500).json({ error: 'Failed to set default priority' });
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

app.get('/api/admin/settings', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const settings = wrapQuery(db.prepare('SELECT key, value FROM settings'), 'SELECT').all();
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });
    res.json(settingsObj);
  } catch (error) {
    console.error('Error fetching admin settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
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


// Priorities endpoint
app.get('/api/priorities', authenticateToken, (req, res) => {
  try {
    const priorities = wrapQuery(db.prepare('SELECT * FROM priorities ORDER BY position ASC'), 'SELECT').all();
    res.json(priorities);
  } catch (error) {
    console.error('Error fetching priorities:', error);
    res.status(500).json({ error: 'Failed to fetch priorities' });
  }
});

// Tags endpoints
app.get('/api/tags', authenticateToken, (req, res) => {
  try {
    const tags = wrapQuery(db.prepare('SELECT * FROM tags ORDER BY tag ASC'), 'SELECT').all();
    res.json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// Task-Tag association endpoints
app.get('/api/tasks/:taskId/tags', authenticateToken, (req, res) => {
  const { taskId } = req.params;
  
  try {
    const taskTags = wrapQuery(db.prepare(`
      SELECT t.* FROM tags t
      JOIN task_tags tt ON t.id = tt.tagId
      WHERE tt.taskId = ?
      ORDER BY t.tag ASC
    `), 'SELECT').all(taskId);
    
    res.json(taskTags);
  } catch (error) {
    console.error('Error fetching task tags:', error);
    res.status(500).json({ error: 'Failed to fetch task tags' });
  }
});

app.post('/api/tasks/:taskId/tags/:tagId', authenticateToken, (req, res) => {
  const { taskId, tagId } = req.params;
  
  try {
    // Check if association already exists
    const existing = wrapQuery(db.prepare('SELECT id FROM task_tags WHERE taskId = ? AND tagId = ?'), 'SELECT').get(taskId, tagId);
    
    if (existing) {
      return res.status(409).json({ error: 'Tag already associated with this task' });
    }
    
    wrapQuery(db.prepare('INSERT INTO task_tags (taskId, tagId) VALUES (?, ?)'), 'INSERT').run(taskId, tagId);
    res.json({ message: 'Tag added to task successfully' });
  } catch (error) {
    console.error('Error adding tag to task:', error);
    res.status(500).json({ error: 'Failed to add tag to task' });
  }
});

app.delete('/api/tasks/:taskId/tags/:tagId', authenticateToken, (req, res) => {
  const { taskId, tagId } = req.params;
  
  try {
    const result = wrapQuery(db.prepare('DELETE FROM task_tags WHERE taskId = ? AND tagId = ?'), 'DELETE').run(taskId, tagId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Tag association not found' });
    }
    
    res.json({ message: 'Tag removed from task successfully' });
  } catch (error) {
    console.error('Error removing tag from task:', error);
    res.status(500).json({ error: 'Failed to remove tag from task' });
  }
});

// Task-Watchers association endpoints
app.get('/api/tasks/:taskId/watchers', authenticateToken, (req, res) => {
  const { taskId } = req.params;
  
  try {
    const watchers = wrapQuery(db.prepare(`
      SELECT m.* FROM members m
      JOIN watchers w ON m.id = w.memberId
      WHERE w.taskId = ?
      ORDER BY m.name ASC
    `), 'SELECT').all(taskId);
    
    res.json(watchers);
  } catch (error) {
    console.error('Error fetching task watchers:', error);
    res.status(500).json({ error: 'Failed to fetch task watchers' });
  }
});

app.post('/api/tasks/:taskId/watchers/:memberId', authenticateToken, (req, res) => {
  const { taskId, memberId } = req.params;
  
  try {
    // Check if association already exists
    const existing = wrapQuery(db.prepare('SELECT id FROM watchers WHERE taskId = ? AND memberId = ?'), 'SELECT').get(taskId, memberId);
    
    if (existing) {
      return res.status(409).json({ error: 'Member is already watching this task' });
    }
    
    wrapQuery(db.prepare('INSERT INTO watchers (taskId, memberId) VALUES (?, ?)'), 'INSERT').run(taskId, memberId);
    res.json({ message: 'Watcher added to task successfully' });
  } catch (error) {
    console.error('Error adding watcher to task:', error);
    res.status(500).json({ error: 'Failed to add watcher to task' });
  }
});

app.delete('/api/tasks/:taskId/watchers/:memberId', authenticateToken, (req, res) => {
  const { taskId, memberId } = req.params;
  
  try {
    const result = wrapQuery(db.prepare('DELETE FROM watchers WHERE taskId = ? AND memberId = ?'), 'DELETE').run(taskId, memberId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Watcher association not found' });
    }
    
    res.json({ message: 'Watcher removed from task successfully' });
  } catch (error) {
    console.error('Error removing watcher from task:', error);
    res.status(500).json({ error: 'Failed to remove watcher from task' });
  }
});

// Task-Collaborators association endpoints
app.get('/api/tasks/:taskId/collaborators', authenticateToken, (req, res) => {
  const { taskId } = req.params;
  
  try {
    const collaborators = wrapQuery(db.prepare(`
      SELECT m.* FROM members m
      JOIN collaborators c ON m.id = c.memberId
      WHERE c.taskId = ?
      ORDER BY m.name ASC
    `), 'SELECT').all(taskId);
    
    res.json(collaborators);
  } catch (error) {
    console.error('Error fetching task collaborators:', error);
    res.status(500).json({ error: 'Failed to fetch task collaborators' });
  }
});

app.post('/api/tasks/:taskId/collaborators/:memberId', authenticateToken, (req, res) => {
  const { taskId, memberId } = req.params;
  
  try {
    // Check if association already exists
    const existing = wrapQuery(db.prepare('SELECT id FROM collaborators WHERE taskId = ? AND memberId = ?'), 'SELECT').get(taskId, memberId);
    
    if (existing) {
      return res.status(409).json({ error: 'Member is already collaborating on this task' });
    }
    
    wrapQuery(db.prepare('INSERT INTO collaborators (taskId, memberId) VALUES (?, ?)'), 'INSERT').run(taskId, memberId);
    res.json({ message: 'Collaborator added to task successfully' });
  } catch (error) {
    console.error('Error adding collaborator to task:', error);
    res.status(500).json({ error: 'Failed to add collaborator to task' });
  }
});

app.delete('/api/tasks/:taskId/collaborators/:memberId', authenticateToken, (req, res) => {
  const { taskId, memberId } = req.params;
  
  try {
    const result = wrapQuery(db.prepare('DELETE FROM collaborators WHERE taskId = ? AND memberId = ?'), 'DELETE').run(taskId, memberId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Collaborator association not found' });
    }
    
    res.json({ message: 'Collaborator removed from task successfully' });
  } catch (error) {
    console.error('Error removing collaborator from task:', error);
    res.status(500).json({ error: 'Failed to remove collaborator from task' });
  }
});

// Serve attachment files
app.get('/attachments/:filename', (req, res) => {
  const { filename } = req.params;
  
  try {
    const filePath = path.join(__dirname, 'attachments', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving attachment:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// ================================
// DEBUG ENDPOINTS
// ================================

app.get('/api/debug/logs', (req, res) => {
  res.json(getQueryLogs());
});

app.post('/api/debug/logs/clear', (req, res) => {
  clearQueryLogs();
  res.json({ message: 'Query logs cleared' });
});

// ================================
// HEALTH CHECK
// ================================

app.get('/health', (req, res) => {
  try {
    wrapQuery(db.prepare('SELECT 1'), 'SELECT').get();
    res.status(200).json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ================================
// START SERVER
// ================================

const PORT = process.env.PORT || 3222;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Debug logs: http://localhost:${PORT}/api/debug/logs`);
  console.log(`✨ Refactored server with modular architecture`);
});
