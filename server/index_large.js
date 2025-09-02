import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Import our extracted modules
import { initializeDatabase } from './config/database.js';
import { authenticateToken, requireRole, generateToken } from './middleware/auth.js';
import { attachmentUpload, avatarUpload } from './config/multer.js';
import { wrapQuery, getQueryLogs, clearQueryLogs } from './utils/queryLogger.js';
import { createDefaultAvatar } from './utils/avatarGenerator.js';

// Other imports (keeping the existing functionality)
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize database
const db = initializeDatabase();
const app = express();

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
    // Check if database is accessible
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
});

// ================================
// CORE API ENDPOINTS
// ================================

// Members endpoints
app.get('/api/members', (req, res) => {
  try {
    const stmt = wrapQuery(db.prepare(`
      SELECT 
        m.id, m.name, m.color, m.user_id, m.created_at,
        u.avatar_path, u.auth_provider, u.google_avatar_url
      FROM members m
      LEFT JOIN users u ON m.user_id = u.id
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

app.post('/api/members', (req, res) => {
  const { id, name, color } = req.body;
  try {
    wrapQuery(db.prepare('INSERT INTO members (id, name, color) VALUES (?, ?, ?)'), 'INSERT').run(id, name, color);
    res.json({ id, name, color });
  } catch (error) {
    console.error('Error creating member:', error);
    res.status(500).json({ error: 'Failed to create member' });
  }
});

app.delete('/api/members/:id', (req, res) => {
  const { id } = req.params;
  try {
    wrapQuery(db.prepare('DELETE FROM members WHERE id = ?'), 'DELETE').run(id);
    res.json({ message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Error deleting member:', error);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

// Boards endpoints
app.get('/api/boards', (req, res) => {
  try {
    const boards = wrapQuery(db.prepare('SELECT * FROM boards ORDER BY CAST(position AS INTEGER) ASC'), 'SELECT').all();
    const columnsStmt = wrapQuery(db.prepare('SELECT * FROM columns WHERE boardId = ? ORDER BY position ASC'), 'SELECT');
    const tasksStmt = wrapQuery(db.prepare('SELECT * FROM tasks WHERE columnId = ? ORDER BY position ASC'), 'SELECT');
    const commentsStmt = wrapQuery(db.prepare('SELECT * FROM comments WHERE taskId = ? ORDER BY createdAt ASC'), 'SELECT');

    const boardsWithData = boards.map(board => {
      const columns = columnsStmt.all(board.id);
      const columnsObj = {};
      
      columns.forEach(column => {
        const tasks = tasksStmt.all(column.id);
        const tasksWithComments = tasks.map(task => ({
          ...task,
          comments: commentsStmt.all(task.id)
        }));
        
        columnsObj[column.id] = {
          ...column,
          tasks: tasksWithComments
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
  const { id, title } = req.body;
  try {
    const position = wrapQuery(db.prepare('SELECT MAX(position) as maxPos FROM boards'), 'SELECT').get()?.maxPos || -1;
    wrapQuery(db.prepare('INSERT INTO boards (id, title, position) VALUES (?, ?, ?)'), 'INSERT').run(id, title, position + 1);
    res.json({ id, title, position: position + 1 });
  } catch (error) {
    console.error('Error creating board:', error);
    res.status(500).json({ error: 'Failed to create board' });
  }
});

app.put('/api/boards/:id', (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  try {
    wrapQuery(db.prepare('UPDATE boards SET title = ? WHERE id = ?'), 'UPDATE').run(title, id);
    res.json({ id, title });
  } catch (error) {
    console.error('Error updating board:', error);
    res.status(500).json({ error: 'Failed to update board' });
  }
});

app.delete('/api/boards/:id', (req, res) => {
  const { id } = req.params;
  try {
    wrapQuery(db.prepare('DELETE FROM boards WHERE id = ?'), 'DELETE').run(id);
    res.json({ message: 'Board deleted successfully' });
  } catch (error) {
    console.error('Error deleting board:', error);
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

// Columns endpoints
app.post('/api/columns', (req, res) => {
  const { id, title, boardId } = req.body;
  try {
    const position = wrapQuery(db.prepare('SELECT MAX(position) as maxPos FROM columns WHERE boardId = ?'), 'SELECT').get(boardId)?.maxPos || -1;
    wrapQuery(db.prepare('INSERT INTO columns (id, title, boardId, position) VALUES (?, ?, ?, ?)'), 'INSERT').run(id, title, boardId, position + 1);
    res.json({ id, title, boardId, position: position + 1 });
  } catch (error) {
    console.error('Error creating column:', error);
    res.status(500).json({ error: 'Failed to create column' });
  }
});

app.put('/api/columns/:id', (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  try {
    wrapQuery(db.prepare('UPDATE columns SET title = ? WHERE id = ?'), 'UPDATE').run(title, id);
    res.json({ id, title });
  } catch (error) {
    console.error('Error updating column:', error);
    res.status(500).json({ error: 'Failed to update column' });
  }
});

app.delete('/api/columns/:id', (req, res) => {
  const { id } = req.params;
  try {
    wrapQuery(db.prepare('DELETE FROM columns WHERE id = ?'), 'DELETE').run(id);
    res.json({ message: 'Column deleted successfully' });
  } catch (error) {
    console.error('Error deleting column:', error);
    res.status(500).json({ error: 'Failed to delete column' });
  }
});

// Tasks endpoints
app.get('/api/tasks', (req, res) => {
  try {
    const tasks = wrapQuery(db.prepare('SELECT * FROM tasks ORDER BY position ASC'), 'SELECT').all();
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.post('/api/tasks', (req, res) => {
  const task = req.body;
  try {
    wrapQuery(db.prepare(`
      INSERT INTO tasks (id, title, description, memberId, requesterId, startDate, dueDate, effort, priority, columnId, boardId, position) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `), 'INSERT').run(
      task.id, task.title, task.description, task.memberId, task.requesterId,
      task.startDate, task.dueDate, task.effort, task.priority, task.columnId, task.boardId, task.position || 0
    );
    res.json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.post('/api/tasks/add-at-top', (req, res) => {
  const task = req.body;
  try {
    db.transaction(() => {
      wrapQuery(db.prepare('UPDATE tasks SET position = position + 1 WHERE columnId = ?'), 'UPDATE').run(task.columnId);
      wrapQuery(db.prepare(`
        INSERT INTO tasks (id, title, description, memberId, requesterId, startDate, dueDate, effort, priority, columnId, boardId, position) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `), 'INSERT').run(
        task.id, task.title, task.description, task.memberId, task.requesterId,
        task.startDate, task.dueDate, task.effort, task.priority, task.columnId, task.boardId
      );
    })();
    res.json(task);
  } catch (error) {
    console.error('Error creating task at top:', error);
    res.status(500).json({ error: 'Failed to create task at top' });
  }
});

app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const task = req.body;
  try {
    wrapQuery(db.prepare(`
      UPDATE tasks SET title = ?, description = ?, memberId = ?, requesterId = ?, startDate = ?, 
      dueDate = ?, effort = ?, priority = ?, columnId = ?, boardId = ?, position = ? WHERE id = ?
    `), 'UPDATE').run(
      task.title, task.description, task.memberId, task.requesterId, task.startDate,
      task.dueDate, task.effort, task.priority, task.columnId, task.boardId, task.position || 0, id
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
    wrapQuery(db.prepare('DELETE FROM tasks WHERE id = ?'), 'DELETE').run(id);
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
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

// Check default admin endpoint
app.get('/api/auth/check-default-admin', (req, res) => {
  try {
    const defaultAdmin = wrapQuery(db.prepare('SELECT id FROM users WHERE email = ?'), 'SELECT').get('admin@example.com');
    res.json({ hasDefaultAdmin: !!defaultAdmin });
  } catch (error) {
    console.error('Error checking default admin:', error);
    res.status(500).json({ error: 'Failed to check default admin' });
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

app.delete('/api/comments/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Get attachments before deleting the comment
    const attachments = wrapQuery(db.prepare('SELECT * FROM attachments WHERE commentId = ?'), 'SELECT').all(id);
    
    // Delete the comment (cascades to attachments)
    wrapQuery(db.prepare('DELETE FROM comments WHERE id = ?'), 'DELETE').run(id);
    
    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Task and board reordering endpoints
app.post('/api/tasks/reorder', (req, res) => {
  const { taskId, newPosition, columnId } = req.body;
  try {
    const currentTask = wrapQuery(db.prepare('SELECT position FROM tasks WHERE id = ?'), 'SELECT').get(taskId);
    if (!currentTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const currentPosition = currentTask.position;

    db.transaction(() => {
      if (newPosition > currentPosition) {
        // Moving down: shift tasks between current and new position up by 1
        wrapQuery(db.prepare(`
          UPDATE tasks SET position = position - 1 
          WHERE columnId = ? AND position > ? AND position <= ?
        `), 'UPDATE').run(columnId, currentPosition, newPosition);
      } else {
        // Moving up: shift tasks between new and current position down by 1
        wrapQuery(db.prepare(`
          UPDATE tasks SET position = position + 1 
          WHERE columnId = ? AND position >= ? AND position < ?
        `), 'UPDATE').run(columnId, newPosition, currentPosition);
      }

      // Update the moved task to its new position
      wrapQuery(db.prepare('UPDATE tasks SET position = ? WHERE id = ?'), 'UPDATE').run(newPosition, taskId);
    })();

    res.json({ message: 'Task reordered successfully' });
  } catch (error) {
    console.error('Error reordering task:', error);
    res.status(500).json({ error: 'Failed to reorder task' });
  }
});

app.post('/api/columns/reorder', (req, res) => {
  const { columnId, newPosition, boardId } = req.body;
  try {
    const currentColumn = wrapQuery(db.prepare('SELECT position FROM columns WHERE id = ?'), 'SELECT').get(columnId);
    if (!currentColumn) {
      return res.status(404).json({ error: 'Column not found' });
    }

    const currentPosition = currentColumn.position;

    db.transaction(() => {
      if (newPosition > currentPosition) {
        // Moving down: shift columns between current and new position up by 1
        wrapQuery(db.prepare(`
          UPDATE columns SET position = position - 1 
          WHERE boardId = ? AND position > ? AND position <= ?
        `), 'UPDATE').run(boardId, currentPosition, newPosition);
      } else {
        // Moving up: shift columns between new and current position down by 1
        wrapQuery(db.prepare(`
          UPDATE columns SET position = position + 1 
          WHERE boardId = ? AND position >= ? AND position < ?
        `), 'UPDATE').run(boardId, newPosition, currentPosition);
      }

      // Update the moved column to its new position
      wrapQuery(db.prepare('UPDATE columns SET position = ? WHERE id = ?'), 'UPDATE').run(newPosition, columnId);
    })();

    res.json({ message: 'Column reordered successfully' });
  } catch (error) {
    console.error('Error reordering column:', error);
    res.status(500).json({ error: 'Failed to reorder column' });
  }
});

app.post('/api/boards/reorder', (req, res) => {
  const { boardId, newPosition } = req.body;
  try {
    const currentBoard = wrapQuery(db.prepare('SELECT position FROM boards WHERE id = ?'), 'SELECT').get(boardId);
    if (!currentBoard) {
      return res.status(404).json({ error: 'Board not found' });
    }

    // Get all boards ordered by current position
    const allBoards = wrapQuery(db.prepare('SELECT id, position FROM boards ORDER BY position ASC'), 'SELECT').all();

    // Reset all positions to simple integers (0, 1, 2, 3, etc.)
    db.transaction(() => {
      allBoards.forEach((board, index) => {
        wrapQuery(db.prepare('UPDATE boards SET position = ? WHERE id = ?'), 'UPDATE').run(index, board.id);
      });

      // Now get the normalized positions and find the target and dragged boards
      const normalizedBoards = allBoards.map((board, index) => ({ ...board, position: index }));
      const currentIndex = normalizedBoards.findIndex(b => b.id === boardId);
      
      if (currentIndex !== -1 && currentIndex !== newPosition) {
        // Simple swap: just swap the two positions
        const targetBoard = normalizedBoards[newPosition];
        if (targetBoard) {
          wrapQuery(db.prepare('UPDATE boards SET position = ? WHERE id = ?'), 'UPDATE').run(newPosition, boardId);
          wrapQuery(db.prepare('UPDATE boards SET position = ? WHERE id = ?'), 'UPDATE').run(currentIndex, targetBoard.id);
        }
      }
    })();

    res.json({ message: 'Board reordered successfully' });
  } catch (error) {
    console.error('Error reordering board:', error);
    res.status(500).json({ error: 'Failed to reorder board' });
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
    // Update user's avatar_path in database
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
    // Clear avatar_path in database
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
    // Update the member's name in the members table
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
    // Get the file path from the uploads directory
    const filePath = path.join(__dirname, 'attachments', filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Send the file with proper content type
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving attachment:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// ================================
// REFACTORED SERVER WITH ESSENTIAL ENDPOINTS
// This includes the core functionality needed for the Kanban app to work
// Additional admin features can be added incrementally as needed
// ================================
