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
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        roles: userRoles
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
        GROUP_CONCAT(r.name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all();
    
    const formattedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isActive: user.is_active,
      roles: user.roles ? user.roles.split(',') : [],
      joined: new Date(user.created_at).toLocaleDateString(),
      createdAt: user.created_at
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
    const { email, password, firstName, lastName, role } = req.body;
    
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
    
    // Create team member automatically
    const memberName = `${firstName} ${lastName}`;
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
        role
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
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
    if (key === 'GOOGLE_CLIENT_ID' || key === 'GOOGLE_CLIENT_SECRET') {
      // Reload OAuth config (we'll implement this later)
      console.log(`Google OAuth setting updated: ${key}`);
    }
    
    res.json({ message: 'Setting updated successfully' });
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({ error: 'Failed to update setting' });
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

// Initialize database tables
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
  insertSetting.run('SITE_NAME', 'Easy Kanban');
  insertSetting.run('SITE_URL', 'http://localhost:3000');
  
  // Create admin member
  const adminMember = {
    id: 'admin-member',
    name: 'Admin User',
    color: '#FF6B6B'
  };
  
  const memberStmt = db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)');
  memberStmt.run(adminMember.id, adminMember.name, adminMember.color, adminUser.id);
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
            m.id, m.name, m.color, m.created_at,
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
            json_object(
              'id', c.id,
              'text', c.text,
              'authorId', c.authorId,
              'createdAt', c.createdAt
            )
          ) as comments
        FROM tasks t
        LEFT JOIN comments c ON c.taskId = t.id
        WHERE t.boardId = ?
        GROUP BY t.id
      `),
      'SELECT'
    );
    
    const boardsWithData = boards.map(board => {
      const columns = columnsStmt.all(board.id);
      const tasks = tasksStmt.all(board.id).map(task => ({
        ...task,
        comments: task.comments === '[null]' ? [] : JSON.parse(task.comments)
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
    
    res.json({ id, title, columns });
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
          CASE WHEN c.id IS NOT NULL THEN json_object(
            'id', c.id,
            'text', c.text,
            'authorId', c.authorId,
            'createdAt', c.createdAt,
            'taskId', t.id
          ) ELSE NULL END
        ) as comments
      FROM tasks t
      LEFT JOIN comments c ON t.id = c.taskId
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
        }))
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
          effort, columnId, priority, requesterId, boardId
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      task.boardId
    );
    
    res.json({ ...task, comments: [] });
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
          priority = ?, requesterId = ?, boardId = ?
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
      id
    );
    
    res.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    const stmt = wrapQuery(
      db.prepare('DELETE FROM tasks WHERE id = ?'),
      'DELETE'
    );
    stmt.run(id);
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



const PORT = process.env.PORT || 3222;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
