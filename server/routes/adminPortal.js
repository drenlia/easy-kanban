// Admin Portal API Routes
// These endpoints allow external admin portal access using INSTANCE_TOKEN

import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { authenticateAdminPortal, adminPortalRateLimit } from '../middleware/adminAuth.js';
import { initializeDatabase } from '../config/database.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { getNotificationService } from '../services/notificationService.js';

// Initialize database
const db = initializeDatabase();

const router = express.Router();

// Apply rate limiting to all admin portal routes
router.use(adminPortalRateLimit);

// ================================
// INSTANCE INFORMATION
// ================================

// Get instance information
router.get('/info', authenticateAdminPortal, (req, res) => {
  try {
    const instanceInfo = {
      instanceName: process.env.INSTANCE_NAME || 'unknown',
      instanceToken: process.env.INSTANCE_TOKEN ? 'configured' : 'not-configured',
      domain: process.env.SITE_URL || 'not-configured',
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: instanceInfo
    });
  } catch (error) {
    console.error('Error fetching instance info:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch instance information' 
    });
  }
});

// ================================
// SETTINGS MANAGEMENT
// ================================

// Get all settings
router.get('/settings', authenticateAdminPortal, (req, res) => {
  try {
    const settings = wrapQuery(db.prepare('SELECT key, value FROM settings'), 'SELECT').all();
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });
    
    res.json({
      success: true,
      data: settingsObj
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch settings' 
    });
  }
});

// Update a single setting
router.put('/settings/:key', authenticateAdminPortal, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    if (value === undefined || value === null) {
      return res.status(400).json({ 
        success: false,
        error: 'Setting value is required' 
      });
    }
    
    const result = db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at) 
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(key, value);
    
    console.log(`✅ Admin portal updated setting: ${key} = ${value}`);
    
    res.json({
      success: true,
      message: 'Setting updated successfully',
      data: { key, value }
    });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update setting' 
    });
  }
});

// Update multiple settings
router.put('/settings', authenticateAdminPortal, async (req, res) => {
  try {
    const settings = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ 
        success: false,
        error: 'Settings object is required' 
      });
    }
    
    const results = [];
    
    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined && value !== null) {
        db.prepare(`
          INSERT OR REPLACE INTO settings (key, value, updated_at) 
          VALUES (?, ?, CURRENT_TIMESTAMP)
        `).run(key, value);
        
        results.push({ key, value });
        console.log(`✅ Admin portal updated setting: ${key} = ${value}`);
      }
    }
    
    res.json({
      success: true,
      message: `${results.length} settings updated successfully`,
      data: results
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update settings' 
    });
  }
});

// ================================
// USER MANAGEMENT
// ================================

// Get all users
router.get('/users', authenticateAdminPortal, (req, res) => {
  try {
    const users = wrapQuery(db.prepare(`
      SELECT 
        u.id, u.email, u.first_name, u.last_name, u.is_active, u.created_at,
        GROUP_CONCAT(r.name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `), 'SELECT').all();
    
    // Format users data
    const formattedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isActive: Boolean(user.is_active),
      roles: user.roles ? user.roles.split(',') : [],
      createdAt: user.created_at
    }));
    
    res.json({
      success: true,
      data: formattedUsers
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch users' 
    });
  }
});

// Create a new user
router.post('/users', authenticateAdminPortal, async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, sendInvitation = true } = req.body;
    
    // Validate required fields
    if (!email || !password || !firstName || !lastName || !role) {
      return res.status(400).json({ 
        success: false,
        error: 'Email, password, first name, last name, and role are required' 
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid email address format' 
      });
    }
    
    // Check if email already exists
    const existingUser = wrapQuery(db.prepare('SELECT id FROM users WHERE email = ?'), 'SELECT').get(email);
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        error: 'User with this email already exists' 
      });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user
    const userId = crypto.randomUUID();
    wrapQuery(db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, is_active) 
      VALUES (?, ?, ?, ?, ?, ?)
    `), 'INSERT').run(userId, email, passwordHash, firstName, lastName, 1); // Active by default
    
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
    
    console.log(`✅ Admin portal created user: ${email} (${firstName} ${lastName})`);
    
    res.json({
      success: true,
      message: 'User created successfully',
      data: {
        id: userId,
        email,
        firstName,
        lastName,
        role,
        isActive: true
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create user' 
    });
  }
});

// Update user
router.put('/users/:userId', authenticateAdminPortal, async (req, res) => {
  try {
    const { userId } = req.params;
    const { email, firstName, lastName, role, isActive } = req.body;
    
    // Check if user exists
    const user = wrapQuery(db.prepare('SELECT * FROM users WHERE id = ?'), 'SELECT').get(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    // Update user fields
    if (email !== undefined) {
      wrapQuery(db.prepare('UPDATE users SET email = ? WHERE id = ?'), 'UPDATE').run(email, userId);
    }
    if (firstName !== undefined) {
      wrapQuery(db.prepare('UPDATE users SET first_name = ? WHERE id = ?'), 'UPDATE').run(firstName, userId);
    }
    if (lastName !== undefined) {
      wrapQuery(db.prepare('UPDATE users SET last_name = ? WHERE id = ?'), 'UPDATE').run(lastName, userId);
    }
    if (isActive !== undefined) {
      wrapQuery(db.prepare('UPDATE users SET is_active = ? WHERE id = ?'), 'UPDATE').run(isActive ? 1 : 0, userId);
    }
    
    // Update role if provided
    if (role !== undefined) {
      // Remove existing roles
      wrapQuery(db.prepare('DELETE FROM user_roles WHERE user_id = ?'), 'DELETE').run(userId);
      
      // Add new role
      const roleId = wrapQuery(db.prepare('SELECT id FROM roles WHERE name = ?'), 'SELECT').get(role)?.id;
      if (roleId) {
        wrapQuery(db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)'), 'INSERT').run(userId, roleId);
      }
    }
    
    console.log(`✅ Admin portal updated user: ${userId}`);
    
    res.json({
      success: true,
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update user' 
    });
  }
});

// Delete user
router.delete('/users/:userId', authenticateAdminPortal, (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check if user exists
    const user = wrapQuery(db.prepare('SELECT * FROM users WHERE id = ?'), 'SELECT').get(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    // Delete user (cascade will handle related records)
    wrapQuery(db.prepare('DELETE FROM users WHERE id = ?'), 'DELETE').run(userId);
    
    console.log(`✅ Admin portal deleted user: ${userId} (${user.email})`);
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete user' 
    });
  }
});

// ================================
// HEALTH CHECK
// ================================

// Health check endpoint
router.get('/health', authenticateAdminPortal, (req, res) => {
  try {
    // Check database connection
    const dbCheck = wrapQuery(db.prepare('SELECT 1 as test'), 'SELECT').get();
    
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: dbCheck ? 'connected' : 'disconnected',
      instanceToken: 'configured'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
