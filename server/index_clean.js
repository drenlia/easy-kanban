import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

// Import our extracted modules
import { initializeDatabase } from './config/database.js';
import { authenticateToken, requireRole, generateToken } from './middleware/auth.js';
import { attachmentUpload, avatarUpload } from './config/multer.js';
import { wrapQuery, getQueryLogs, clearQueryLogs } from './utils/queryLogger.js';
import { createDefaultAvatar } from './utils/avatarGenerator.js';

// Import route modules
import boardsRouter from './routes/boards.js';
import tasksRouter from './routes/tasks.js';
import membersRouter from './routes/members.js';
import columnsRouter from './routes/columns.js';

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
    const user = wrapQuery(db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1'), 'SELECT').get(email);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Get user roles
    const roles = wrapQuery(db.prepare(`
      SELECT r.name 
      FROM roles r 
      JOIN user_roles ur ON r.id = ur.role_id 
      WHERE ur.user_id = ?
    `), 'SELECT').all(user.id);
    
    const userRoles = roles.map(r => r.name);
    
    // Generate JWT token
    const token = generateToken({ 
      id: user.id, 
      email: user.email, 
      role: userRoles.includes('admin') ? 'admin' : 'user',
      roles: userRoles
    });
    
    // Return user info and token
    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        roles: userRoles,
        avatarUrl: user.avatar_path,
        authProvider: user.auth_provider || 'local',
        googleAvatarUrl: user.google_avatar_url,
        displayName: user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.email
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
    const user = wrapQuery(db.prepare('SELECT * FROM users WHERE id = ?'), 'SELECT').get(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user roles
    const roles = wrapQuery(db.prepare(`
      SELECT r.name 
      FROM roles r 
      JOIN user_roles ur ON r.id = ur.role_id 
      WHERE ur.user_id = ?
    `), 'SELECT').all(user.id);
    
    const userRoles = roles.map(r => r.name);
    
    // Determine the correct avatar URL based on auth provider
    let avatarUrl = user.avatar_path;
    if (user.auth_provider === 'google' && user.google_avatar_url) {
      avatarUrl = user.google_avatar_url;
    }
    
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      roles: userRoles,
      avatarUrl,
      authProvider: user.auth_provider || 'local',
      googleAvatarUrl: user.google_avatar_url,
      displayName: user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.email
    });
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user information' });
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

// ================================
// ADDITIONAL ENDPOINTS
// ================================

// Comments endpoints
app.post('/api/comments', (req, res) => {
  const { id, taskId, text, authorId, createdAt, attachments = [] } = req.body;
  try {
    db.transaction(() => {
      // Insert comment
      wrapQuery(db.prepare(`
        INSERT INTO comments (id, taskId, text, authorId, createdAt) 
        VALUES (?, ?, ?, ?, ?)
      `), 'INSERT').run(id, taskId, text, authorId, createdAt);

      // Insert attachments if any
      if (attachments && attachments.length > 0) {
        const attachmentStmt = wrapQuery(db.prepare(`
          INSERT INTO attachments (id, commentId, name, url, type, size) 
          VALUES (?, ?, ?, ?, ?, ?)
        `), 'INSERT');
        
        attachments.forEach(attachment => {
          attachmentStmt.run(
            attachment.id,
            id, // commentId
            attachment.name,
            attachment.url,
            attachment.type,
            attachment.size
          );
        });
      }
    })();

    res.json({ id, taskId, text, authorId, createdAt, attachments });
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

app.delete('/api/comments/:id', (req, res) => {
  const { id } = req.params;
  try {
    // Delete the comment (cascades to attachments)
    wrapQuery(db.prepare('DELETE FROM comments WHERE id = ?'), 'DELETE').run(id);
    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
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

// User profile update
app.put('/api/users/profile', authenticateToken, (req, res) => {
  const { displayName } = req.body;
  
  if (!displayName) {
    return res.status(400).json({ error: 'Display name is required' });
  }

  try {
    wrapQuery(db.prepare('UPDATE members SET name = ? WHERE user_id = ?'), 'UPDATE').run(displayName, req.user.id);
    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Basic admin endpoints
app.get('/api/admin/users', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
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

// Settings endpoints
app.get('/api/settings', (req, res) => {
  try {
    const settings = wrapQuery(db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?)'), 'SELECT').all('SITE_NAME', 'SITE_URL');
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });
    res.json(settingsObj);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
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
  const settings = req.body;
  
  try {
    const updateStmt = wrapQuery(db.prepare('UPDATE settings SET value = ? WHERE key = ?'), 'UPDATE');
    
    Object.entries(settings).forEach(([key, value]) => {
      updateStmt.run(value, key);
    });
    
    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
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
