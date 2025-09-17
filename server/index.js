import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import http from 'http';

// Import our extracted modules
import { initializeDatabase } from './config/database.js';
import { authenticateToken, requireRole, generateToken, JWT_SECRET, JWT_EXPIRES_IN } from './middleware/auth.js';
import { attachmentUpload, avatarUpload } from './config/multer.js';
import { wrapQuery, getQueryLogs, clearQueryLogs } from './utils/queryLogger.js';
import { createDefaultAvatar } from './utils/avatarGenerator.js';
import { initActivityLogger, logActivity, logCommentActivity } from './services/activityLogger.js';
import { initNotificationService, getNotificationService } from './services/notificationService.js';
import { TAG_ACTIONS, COMMENT_ACTIONS } from './constants/activityActions.js';

// Import route modules
import boardsRouter from './routes/boards.js';
import tasksRouter from './routes/tasks.js';
import membersRouter from './routes/members.js';
import columnsRouter from './routes/columns.js';
import authRouter from './routes/auth.js';
import passwordResetRouter from './routes/password-reset.js';
import viewsRouter from './routes/views.js';

// Import real-time services
import redisService from './services/redisService.js';
import websocketService from './services/websocketService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize database using extracted module
const db = initializeDatabase();

// Initialize activity logger and notification service with database instance
initActivityLogger(db);
initNotificationService(db);

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
// DEBUG ENDPOINTS
// ================================

app.post('/api/debug/log', (req, res) => {
  const { message, data } = req.body;
  console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  res.status(200).json({ success: true });
});

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
    
    // Clear force_logout flag on successful login
    db.prepare('UPDATE users SET force_logout = 0 WHERE id = ?').run(user.id);
    
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

// Account activation endpoint
app.post('/api/auth/activate-account', async (req, res) => {
  const { token, email, newPassword } = req.body;
  
  if (!token || !email || !newPassword) {
    return res.status(400).json({ error: 'Token, email, and new password are required' });
  }
  
  try {
    // Find the invitation token
    const invitation = wrapQuery(db.prepare(`
      SELECT ui.*, u.id as user_id, u.email, u.first_name, u.last_name, u.is_active 
      FROM user_invitations ui
      JOIN users u ON ui.user_id = u.id
      WHERE ui.token = ? AND u.email = ? AND ui.used_at IS NULL
    `), 'SELECT').get(token, email);
    
    if (!invitation) {
      return res.status(400).json({ error: 'Invalid or expired invitation token' });
    }
    
    // Check if token has expired
    const tokenExpiry = new Date(invitation.expires_at);
    if (tokenExpiry < new Date()) {
      return res.status(400).json({ error: 'Invitation token has expired' });
    }
    
    // Check if user is already active
    if (invitation.is_active) {
      return res.status(400).json({ error: 'Account is already active' });
    }
    
    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    // Activate user and update password
    wrapQuery(db.prepare(`
      UPDATE users 
      SET is_active = 1, password_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `), 'UPDATE').run(passwordHash, invitation.user_id);
    
    // Mark invitation as used
    wrapQuery(db.prepare(`
      UPDATE user_invitations 
      SET used_at = datetime('now')
      WHERE id = ?
    `), 'UPDATE').run(invitation.id);
    
    // Log activation activity
    wrapQuery(db.prepare(`
      INSERT INTO activity (action, details, userId, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `), 'INSERT').run(
      'account_activated',
      `User ${invitation.first_name} ${invitation.last_name} (${invitation.email}) activated their account`,
      invitation.user_id
    );
    
    console.log('✅ Account activated successfully for:', invitation.email);
    
    res.json({ 
      message: 'Account activated successfully. You can now log in.',
      user: {
        id: invitation.user_id,
        email: invitation.email,
        firstName: invitation.first_name,
        lastName: invitation.last_name
      }
    });
    
  } catch (error) {
    console.error('Account activation error:', error);
    res.status(500).json({ error: 'Failed to activate account' });
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
    res.json({ exists: !!defaultAdmin });
  } catch (error) {
    console.error('Error checking default admin:', error);
    res.status(500).json({ error: 'Failed to check default admin' });
  }
});

app.get('/api/auth/check-demo-user', (req, res) => {
  try {
    const demoUser = wrapQuery(db.prepare('SELECT id FROM users WHERE email = ?'), 'SELECT').get('demo@example.com');
    res.json({ exists: !!demoUser });
  } catch (error) {
    console.error('Error checking demo user:', error);
    res.status(500).json({ error: 'Failed to check demo user' });
  }
});

app.get('/api/auth/demo-credentials', (req, res) => {
  try {
    const adminPassword = wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('ADMIN_PASSWORD')?.value;
    const demoPassword = wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('DEMO_PASSWORD')?.value;
    
    res.json({
      admin: {
        email: 'admin@example.com',
        password: adminPassword || 'admin' // Fallback to default if not found
      },
      demo: {
        email: 'demo@example.com',
        password: demoPassword || 'demo' // Fallback to default if not found
      }
    });
  } catch (error) {
    console.error('Error getting demo credentials:', error);
    res.status(500).json({ error: 'Failed to get demo credentials' });
  }
});

// ================================
// API ROUTES
// ================================

// Use route modules
app.use('/api/members', membersRouter);
app.use('/api/boards', boardsRouter);
app.use('/api/columns', columnsRouter);
app.use('/api/tasks', authenticateToken, tasksRouter);
app.use('/api/views', viewsRouter);
app.use('/api/auth', authRouter);
app.use('/api/password-reset', passwordResetRouter);

// ================================
// ADDITIONAL ENDPOINTS
// ================================

// Comments endpoints
app.post('/api/comments', authenticateToken, async (req, res) => {
  const comment = req.body;
  const userId = req.user.id;
  
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
      
      // Log comment creation activity
      await logCommentActivity(
        userId,
        COMMENT_ACTIONS.CREATE,
        comment.id,
        comment.taskId,
        `added comment: "${comment.text.length > 50 ? comment.text.substring(0, 50) + '...' : comment.text}"`,
        { commentContent: comment.text }
      );
      
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

// Update comment endpoint
app.put('/api/comments/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  const userId = req.user.id;
  
  try {
    // Get original comment first
    const originalComment = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    
    if (!originalComment) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    // Update comment text in database
    const stmt = db.prepare('UPDATE comments SET text = ? WHERE id = ?');
    const result = stmt.run(text, id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    // Log comment update activity
    await logCommentActivity(
      userId,
      COMMENT_ACTIONS.UPDATE,
      id,
      originalComment.taskId,
      `updated comment from: "${originalComment.text.length > 30 ? originalComment.text.substring(0, 30) + '...' : originalComment.text}" to: "${text.length > 30 ? text.substring(0, 30) + '...' : text}"`
    );
    
    // Return updated comment
    const updatedComment = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    res.json(updatedComment);
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

app.delete('/api/comments/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
    // Get comment details before deleting
    const commentToDelete = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    
    if (!commentToDelete) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    // Get attachments before deleting the comment
    const attachmentsStmt = db.prepare('SELECT url FROM attachments WHERE commentId = ?');
    const attachments = attachmentsStmt.all(id);

    // Delete the files from disk
    for (const attachment of attachments) {
      // Extract filename from URL (e.g., "/attachments/filename.ext" -> "filename.ext")
      const filename = attachment.url.replace('/attachments/', '');
      const filePath = path.join(__dirname, 'attachments', filename);
      try {
        await fs.promises.unlink(filePath);
        console.log(`✅ Deleted file: ${filename}`);
      } catch (error) {
        console.error('Error deleting file:', error);
      }
    }

    // Delete the comment (cascades to attachments)
    const stmt = db.prepare('DELETE FROM comments WHERE id = ?');
    stmt.run(id);

    // Log comment deletion activity
    await logCommentActivity(
      userId,
      COMMENT_ACTIONS.DELETE,
      id,
      commentToDelete.taskId,
      `deleted comment: "${commentToDelete.text.length > 50 ? commentToDelete.text.substring(0, 50) + '...' : commentToDelete.text}"`
    );

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
    id: crypto.randomUUID(),
    name: req.file.originalname,
    url: `/attachments/${req.file.filename}`,
    type: req.file.mimetype,
    size: req.file.size
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

      // Update the user's updated_at timestamp
      wrapQuery(db.prepare(`
        UPDATE users 
        SET updated_at = datetime('now')
        WHERE id = ?
      `), 'UPDATE').run(userId);

      console.log(`🔄 User ${userId} role changed to ${role} - no logout required`);
    }

    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// Create new user
app.post('/api/admin/users', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { email, password, firstName, lastName, role, displayName, baseUrl } = req.body;
  
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
    
    // Create user (inactive by default for local accounts - they need to activate via email)
    wrapQuery(db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, is_active, auth_provider) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `), 'INSERT').run(userId, email, passwordHash, firstName, lastName, 0, 'local');
    
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
    
    // Generate invitation token for email verification
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    
    // Store invitation token
    wrapQuery(db.prepare(`
      INSERT INTO user_invitations (id, user_id, token, expires_at, created_at) 
      VALUES (?, ?, ?, ?, datetime('now'))
    `), 'INSERT').run(
      crypto.randomUUID(),
      userId,
      inviteToken,
      tokenExpiry.toISOString()
    );
    
    // Get admin user info for email
    const adminUser = wrapQuery(
      db.prepare('SELECT first_name, last_name FROM users WHERE id = ?'), 
      'SELECT'
    ).get(req.user.userId);
    const adminName = adminUser ? `${adminUser.first_name} ${adminUser.last_name}` : 'Administrator';
    
    // Send invitation email
    try {
      const notificationService = getNotificationService();
      await notificationService.sendUserInvitation(userId, inviteToken, adminName, baseUrl);
      console.log('✅ Invitation email sent for new user:', email);
    } catch (emailError) {
      console.warn('⚠️ Failed to send invitation email:', emailError.message);
      // Don't fail user creation if email fails
    }
    
    res.json({ 
      message: 'User created successfully. An invitation email has been sent.',
      user: { id: userId, email, firstName, lastName, role, isActive: false }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Resend user invitation
app.post('/api/admin/users/:userId/resend-invitation', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { userId } = req.params;
  const { baseUrl } = req.body;
  
  try {
    // Get user details
    const user = wrapQuery(
      db.prepare('SELECT id, email, first_name, last_name, is_active, auth_provider FROM users WHERE id = ?'), 
      'SELECT'
    ).get(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only allow resending for inactive local users
    if (user.auth_provider !== 'local') {
      return res.status(400).json({ error: 'Cannot resend invitation for non-local accounts' });
    }

    if (user.is_active) {
      return res.status(400).json({ error: 'User account is already active' });
    }

    // Delete any existing invitation tokens for this user
    wrapQuery(db.prepare('DELETE FROM user_invitations WHERE user_id = ?'), 'DELETE').run(userId);

    // Generate new invitation token
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    
    // Store new invitation token
    wrapQuery(db.prepare(`
      INSERT INTO user_invitations (id, user_id, token, expires_at, created_at) 
      VALUES (?, ?, ?, ?, datetime('now'))
    `), 'INSERT').run(
      crypto.randomUUID(),
      userId,
      inviteToken,
      tokenExpiry.toISOString()
    );
    
    // Get admin user info for email
    const adminUser = wrapQuery(
      db.prepare('SELECT first_name, last_name FROM users WHERE id = ?'), 
      'SELECT'
    ).get(req.user.userId);
    const adminName = adminUser ? `${adminUser.first_name} ${adminUser.last_name}` : 'Administrator';
    
    // Send invitation email
    try {
      const notificationService = getNotificationService();
      await notificationService.sendUserInvitation(userId, inviteToken, adminName, baseUrl);
      console.log('✅ Invitation resent successfully for user:', user.email);
      
      res.json({ 
        message: 'Invitation email sent successfully',
        email: user.email
      });
    } catch (emailError) {
      console.error('⚠️ Failed to send invitation email:', emailError.message);
      res.status(500).json({ error: 'Failed to send invitation email' });
    }
    
  } catch (error) {
    console.error('Resend invitation error:', error);
    res.status(500).json({ error: 'Failed to resend invitation' });
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
    
    res.json({ count: taskCount }); // Fixed: return 'count' instead of 'taskCount'
  } catch (error) {
    console.error('Error getting user task count:', error);
    res.status(500).json({ error: 'Failed to get task count' });
  }
});

// Delete user
app.delete('/api/admin/users/:userId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { userId } = req.params;
  
  try {
    // Check if user is trying to delete themselves
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Get the SYSTEM user ID (00000000-0000-0000-0000-000000000000)
    const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
    
    // Get the member ID for the user being deleted (before deletion)
    const userMember = wrapQuery(db.prepare('SELECT id FROM members WHERE user_id = ?'), 'SELECT').get(userId);
    
    if (userMember) {
      // Get the SYSTEM user's member ID
      const systemMember = wrapQuery(db.prepare('SELECT id FROM members WHERE user_id = ?'), 'SELECT').get(SYSTEM_USER_ID);
      
      if (systemMember) {
        // Reassign all tasks assigned to this user to the SYSTEM user
        wrapQuery(db.prepare('UPDATE tasks SET memberId = ? WHERE memberId = ?'), 'UPDATE').run(systemMember.id, userMember.id);
        
        // Reassign all tasks requested by this user to the SYSTEM user
        wrapQuery(db.prepare('UPDATE tasks SET requesterId = ? WHERE requesterId = ?'), 'UPDATE').run(systemMember.id, userMember.id);
        
        console.log(`✅ Reassigned tasks from user ${userId} to SYSTEM user`);
      } else {
        console.warn('⚠️ SYSTEM user member not found, tasks will be orphaned');
      }
    }

    // Delete user (cascade will handle related records including the member)
    const result = wrapQuery(db.prepare('DELETE FROM users WHERE id = ?'), 'DELETE').run(userId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Publish member-deleted event for real-time updates
    if (userMember) {
      console.log('📤 Publishing member-deleted to Redis for user deletion');
      await redisService.publish('member-deleted', {
        memberId: userMember.id,
        timestamp: new Date().toISOString()
      });
      console.log('✅ Member-deleted published to Redis');
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
    const settings = db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?, ?, ?, ?)').all('SITE_NAME', 'SITE_URL', 'USE_PREFIXES', 'MAIL_ENABLED', 'GOOGLE_CLIENT_ID', 'HIGHLIGHT_OVERDUE_TASKS', 'DEFAULT_FINISHED_COLUMN_NAMES');
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

// Test email configuration endpoint
app.post('/api/admin/test-email', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    console.log('🧪 Test email endpoint called');
    
    // Check if demo mode is enabled
    if (process.env.DEMO_ENABLED === 'true') {
      return res.status(400).json({ 
        error: 'Email testing disabled in demo mode',
        details: 'Email functionality is disabled in demo environments to prevent sending emails',
        demoMode: true
      });
    }
    
    // Use EmailService for clean, reusable email functionality
    const EmailService = await import('./services/emailService.js');
    const emailService = new EmailService.default(db);
    
    try {
      const result = await emailService.sendTestEmail(req.user.email || 'admin@example.com');
      res.json(result);
    } catch (error) {
      console.error('❌ Email test failed:', error);
      
      // If it's a validation error, return the validation details
      if (error.valid === false) {
        return res.status(400).json(error);
      }
      
      // Return detailed error information for SMTP failures
      return res.status(500).json({ 
        error: 'Failed to send test email',
        details: error.message,
        errorCode: error.code,
        command: error.command,
        troubleshooting: {
          common_issues: [
            'Check SMTP credentials (username/password)',
            'Verify SMTP host and port',
            'Check if less secure app access is enabled (Gmail)',
            'Verify firewall/network settings',
            'Check if 2FA requires app password (Gmail)'
          ]
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Test email error:', error);
    res.status(500).json({ 
      error: 'Failed to test email configuration',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
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

app.post('/api/tasks/:taskId/tags/:tagId', authenticateToken, async (req, res) => {
  const { taskId, tagId } = req.params;
  const userId = req.user?.id || 'system';
  
  try {
    // Check if association already exists
    const existing = wrapQuery(db.prepare('SELECT id FROM task_tags WHERE taskId = ? AND tagId = ?'), 'SELECT').get(taskId, tagId);
    
    if (existing) {
      return res.status(409).json({ error: 'Tag already associated with this task' });
    }
    
    // Get tag and task details for logging
    const tag = wrapQuery(db.prepare('SELECT tag FROM tags WHERE id = ?'), 'SELECT').get(tagId);
    const task = wrapQuery(db.prepare('SELECT title, columnId, boardId FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
    
    wrapQuery(db.prepare('INSERT INTO task_tags (taskId, tagId) VALUES (?, ?)'), 'INSERT').run(taskId, tagId);
    
    // Log tag association activity
    if (tag && task) {
      await logActivity(
        userId,
        TAG_ACTIONS.ASSOCIATE,
        `associated tag "${tag.tag}" with task "${task.title}"`,
        {
          taskId: taskId,
          tagId: parseInt(tagId),
          columnId: task.columnId,
          boardId: task.boardId
        }
      );
    }
    
    res.json({ message: 'Tag added to task successfully' });
  } catch (error) {
    console.error('Error adding tag to task:', error);
    res.status(500).json({ error: 'Failed to add tag to task' });
  }
});

app.delete('/api/tasks/:taskId/tags/:tagId', authenticateToken, async (req, res) => {
  const { taskId, tagId } = req.params;
  const userId = req.user?.id || 'system';
  
  try {
    // Get tag and task details for logging before deletion
    const tag = wrapQuery(db.prepare('SELECT tag FROM tags WHERE id = ?'), 'SELECT').get(tagId);
    const task = wrapQuery(db.prepare('SELECT title, columnId, boardId FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
    
    const result = wrapQuery(db.prepare('DELETE FROM task_tags WHERE taskId = ? AND tagId = ?'), 'DELETE').run(taskId, tagId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Tag association not found' });
    }
    
    // Log tag disassociation activity
    if (tag && task) {
      await logActivity(
        userId,
        TAG_ACTIONS.DISASSOCIATE,
        `removed tag "${tag.tag}" from task "${task.title}"`,
        {
          taskId: taskId,
          tagId: parseInt(tagId),
          columnId: task.columnId,
          boardId: task.boardId
        }
      );
    }
    
    res.json({ message: 'Tag removed from task successfully' });
  } catch (error) {
    console.error('Error removing tag from task:', error);
    res.status(500).json({ error: 'Failed to remove tag from task' });
  }
});

// Activity Feed endpoint
app.get('/api/activity/feed', authenticateToken, (req, res) => {
  const { limit = 20 } = req.query;
  
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
app.get('/api/user/status', authenticateToken, (req, res) => {
  const userId = req.user.id;
  
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

// User Settings endpoints
app.get('/api/user/settings', authenticateToken, (req, res) => {
  const userId = req.user.id;
  
  try {
    // Create user_settings table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        setting_key TEXT NOT NULL,
        setting_value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(userId, setting_key)
      )
    `);
    
    const settings = wrapQuery(db.prepare(`
      SELECT setting_key, setting_value 
      FROM user_settings 
      WHERE userId = ?
    `), 'SELECT').all(userId);
    
    // Convert to object format
    const settingsObj = settings.reduce((acc, setting) => {
      let value = setting.setting_value;
      
      // Convert booleans
      if (value === 'true') {
        value = true;
      } else if (value === 'false') {
        value = false;
      } else if (!isNaN(value) && !isNaN(parseFloat(value))) {
        // Convert numbers (but only if it's actually a pure number)
        value = parseFloat(value);
      }
      // Leave strings (including JSON strings) as strings
      
      acc[setting.setting_key] = value;
      return acc;
    }, {});
    
    // Don't set defaults here - let the client handle smart merging
    // This allows the client to properly merge cookie vs database values
    res.json(settingsObj);
  } catch (error) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({ error: 'Failed to fetch user settings' });
  }
});

app.put('/api/user/settings', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { setting_key, setting_value } = req.body;
  
  try {
    // Handle undefined/null values
    if (setting_value === undefined || setting_value === null) {
      console.warn(`Skipping save for ${setting_key}: value is ${setting_value}`);
      return res.json({ message: 'Setting skipped (undefined/null value)' });
    }
    
    // Convert value to string safely
    const valueString = typeof setting_value === 'string' ? setting_value : String(setting_value);
    
    wrapQuery(db.prepare(`
      INSERT OR REPLACE INTO user_settings (userId, setting_key, setting_value, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `), 'INSERT').run(userId, setting_key, valueString);
    
    res.json({ message: 'Setting updated successfully' });
  } catch (error) {
    console.error('Error updating user setting:', error);
    res.status(500).json({ error: 'Failed to update user setting' });
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

// Task-Attachments association endpoints
app.get('/api/tasks/:taskId/attachments', authenticateToken, (req, res) => {
  const { taskId } = req.params;
  
  try {
    const attachments = db.prepare(`
      SELECT id, name, url, type, size, created_at
      FROM attachments 
      WHERE taskId = ?
      ORDER BY created_at DESC
    `).all(taskId);
    
    res.json(attachments);
  } catch (error) {
    console.error('Error fetching task attachments:', error);
    res.status(500).json({ error: 'Failed to fetch task attachments' });
  }
});

app.post('/api/tasks/:taskId/attachments', authenticateToken, async (req, res) => {
  const { taskId } = req.params;
  const { attachments } = req.body;
  const userId = req.user.id;
  
  try {
    // Begin transaction
    db.prepare('BEGIN').run();

    try {
      const insertedAttachments = [];
      
      if (attachments?.length > 0) {
        const attachmentStmt = db.prepare(`
          INSERT INTO attachments (id, taskId, name, url, type, size)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        attachments.forEach(attachment => {
          attachmentStmt.run(
            attachment.id,
            taskId,
            attachment.name,
            attachment.url,
            attachment.type,
            attachment.size
          );
          insertedAttachments.push(attachment);
        });
      }

      // Commit transaction
      db.prepare('COMMIT').run();
      
      res.json(insertedAttachments);
    } catch (error) {
      // Rollback on error
      db.prepare('ROLLBACK').run();
      throw error;
    }
  } catch (error) {
    console.error('Error adding task attachments:', error);
    res.status(500).json({ error: 'Failed to add task attachments' });
  }
});

app.delete('/api/attachments/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  try {
    // First, get the attachment info to find the file path
    const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
    
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    // Extract filename from URL (e.g., "/attachments/filename.ext" -> "filename.ext")
    const filename = attachment.url.replace('/attachments/', '');
    const filePath = path.join(__dirname, 'attachments', filename);
    
    // Delete the physical file if it exists
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`✅ Deleted file: ${filename}`);
      } catch (fileError) {
        console.error('Error deleting file:', fileError);
        // Continue with database deletion even if file deletion fails
      }
    } else {
      console.log(`⚠️ File not found: ${filename}`);
    }
    
    // Delete the database record
    const result = db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Attachment record not found' });
    }
    
    res.json({ message: 'Attachment and file deleted successfully' });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
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
      database: 'connected',
      redis: redisService.isRedisConnected(),
      websocket: websocketService.getClientCount()
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
// SPA FALLBACK FOR CLIENT-SIDE ROUTING
// ================================

// Serve the React app for all non-API routes
app.get('*', (req, res) => {
  // Skip API routes
  if (req.path.startsWith('/api/') || req.path.startsWith('/attachments/') || req.path.startsWith('/avatars/') || req.path === '/health') {
    return res.status(404).json({ error: 'Not Found' });
  }
  
  // For all other routes (including /project/, /task/, etc.), serve the React app
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// ================================
// START SERVER
// ================================

const PORT = process.env.PORT || 3222;

// Create HTTP server
const server = http.createServer(app);

// Initialize real-time services
async function initializeServices() {
  try {
    // Initialize Redis
    await redisService.connect();
    
    // Initialize WebSocket
    websocketService.initialize(server);
    
    console.log('✅ Real-time services initialized');
  } catch (error) {
    console.error('❌ Failed to initialize real-time services:', error);
    // Continue without real-time features
  }
}

// Start server
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Debug logs: http://localhost:${PORT}/api/debug/logs`);
  console.log(`✨ Refactored server with modular architecture`);
  
  // Initialize real-time services
  await initializeServices();
});
