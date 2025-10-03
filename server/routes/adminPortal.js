// Admin Portal API Routes
// These endpoints allow external admin portal access using INSTANCE_TOKEN

import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { authenticateAdminPortal, adminPortalRateLimit } from '../middleware/adminAuth.js';
import { initializeDatabase } from '../config/database.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { getNotificationService } from '../services/notificationService.js';
import redisService from '../services/redisService.js';
import { getLicenseManager } from '../config/license.js';

// Initialize database
const db = initializeDatabase();

const router = express.Router();

// Apply rate limiting to all admin portal routes
router.use(adminPortalRateLimit);

// OPTIONS requests are now handled by nginx - disable Express OPTIONS handler to avoid duplicate headers
// router.options('*', (req, res) => {
//   console.log('🔍 OPTIONS request received for:', req.path);
//   console.log('🔍 Origin:', req.headers.origin);
//   res.header('Access-Control-Allow-Origin', req.headers.origin);
//   res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
//   res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
//   res.header('Access-Control-Allow-Credentials', 'true');
//   res.status(200).end();
// });

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
// INSTANCE OWNER MANAGEMENT
// ================================

// Get instance owner information
router.get('/owner-info', authenticateAdminPortal, (req, res) => {
  try {
    const ownerSetting = wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('OWNER');
    const ownerEmail = ownerSetting ? ownerSetting.value : null;
    
    res.json({
      success: true,
      data: {
        owner: ownerEmail,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching owner info:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch owner information' 
    });
  }
});

// Set instance owner (admin portal only)
router.put('/owner', authenticateAdminPortal, (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false,
        error: 'Owner email is required' 
      });
    }
    
    // Validate that the user exists
    const user = wrapQuery(db.prepare('SELECT id, email FROM users WHERE email = ?'), 'SELECT').get(email);
    if (!user) {
      return res.status(400).json({ 
        success: false,
        error: 'User with this email does not exist' 
      });
    }
    
    // Set owner in settings
    wrapQuery(db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'), 'INSERT')
      .run('OWNER', email, new Date().toISOString());
    
    console.log(`✅ Admin portal set instance owner to: ${email}`);
    
    res.json({
      success: true,
      data: {
        owner: email,
        message: 'Instance owner set successfully',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error setting instance owner:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to set instance owner' 
    });
  }
});

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
    const { email, password, firstName, lastName, role, sendInvitation = true, isActive = false } = req.body;
    
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
    `), 'INSERT').run(userId, email, passwordHash, firstName, lastName, isActive ? 1 : 0);
    
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
        isActive: !!isActive
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

// ================================
// PLAN MANAGEMENT
// ================================

// Get plan information and limits
router.get('/plan', authenticateAdminPortal, async (req, res) => {
  try {
    // Get LicenseManager instance
    const licenseManager = getLicenseManager(db);
    
    console.log('🔍 LicenseManager created, checking license info...');
    
    // Get actual license information with current usage
    const licenseInfo = await licenseManager.getLicenseInfo();
    console.log('🔍 License info:', JSON.stringify(licenseInfo, null, 2));
    
    if (!licenseInfo.enabled) {
      return res.json({
        success: true,
        data: {
          plan: 'unlimited',
          message: 'Licensing disabled (self-hosted mode)',
          features: []
        }
      });
    }

    if (!licenseInfo.limits) {
      return res.json({
        success: true,
        data: {
          plan: 'unlimited',
          message: 'No limits configured',
          features: []
        }
      });
    }

    // Get database values from license_settings table for comparison
    const dbSettings = {};
    try {
      const licenseSettings = wrapQuery(db.prepare('SELECT setting_key, setting_value FROM license_settings'), 'SELECT').all();
      licenseSettings.forEach(setting => {
        if (['USER_LIMIT', 'TASK_LIMIT', 'BOARD_LIMIT', 'STORAGE_LIMIT', 'SUPPORT_TYPE'].includes(setting.setting_key)) {
          dbSettings[setting.setting_key] = setting.setting_value;
        }
      });
    } catch (error) {
      console.warn('License settings table not found or accessible:', error.message);
    }

    // Format storage size for display
    const formatBytes = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    // Combine actual in-memory values with database overrides
    const planInfo = {
      plan: licenseInfo.limits.SUPPORT_TYPE || 'basic',
      usage: licenseInfo.usage,
      limitsReached: licenseInfo.limitsReached,
      features: [
        {
          key: 'USER_LIMIT',
          inMemory: licenseInfo.limits.USER_LIMIT,
          database: dbSettings.USER_LIMIT || null,
          currentUsage: licenseInfo.usage.users,
          limitReached: licenseInfo.limitsReached.users
        },
        {
          key: 'TASK_LIMIT',
          inMemory: licenseInfo.limits.TASK_LIMIT,
          database: dbSettings.TASK_LIMIT || null,
          currentUsage: licenseInfo.usage.totalTasks,
          limitReached: false // Task limit is per board, not global
        },
        {
          key: 'BOARD_LIMIT',
          inMemory: licenseInfo.limits.BOARD_LIMIT,
          database: dbSettings.BOARD_LIMIT || null,
          currentUsage: licenseInfo.usage.boards,
          limitReached: licenseInfo.limitsReached.boards
        },
        {
          key: 'STORAGE_LIMIT',
          inMemory: licenseInfo.limits.STORAGE_LIMIT,
          database: dbSettings.STORAGE_LIMIT || null,
          currentUsage: licenseInfo.usage.storage,
          currentUsageFormatted: formatBytes(licenseInfo.usage.storage),
          limitReached: licenseInfo.limitsReached.storage
        },
        {
          key: 'SUPPORT_TYPE',
          inMemory: licenseInfo.limits.SUPPORT_TYPE,
          database: dbSettings.SUPPORT_TYPE || null
        }
      ],
      boardTaskCounts: licenseInfo.boardTaskCounts
    };

    res.json({
      success: true,
      data: planInfo
    });
  } catch (error) {
    console.error('Error fetching plan info:', error);
    
    // Fallback to environment variables if LicenseManager fails
    console.log('🔄 Falling back to environment variables...');
    const fallbackLimits = {
      USER_LIMIT: parseInt(process.env.USER_LIMIT) || 5,
      TASK_LIMIT: parseInt(process.env.TASK_LIMIT) || 100,
      BOARD_LIMIT: parseInt(process.env.BOARD_LIMIT) || 10,
      STORAGE_LIMIT: parseInt(process.env.STORAGE_LIMIT) || 1073741824,
      SUPPORT_TYPE: process.env.SUPPORT_TYPE || 'basic'
    };

    const fallbackInfo = {
      plan: fallbackLimits.SUPPORT_TYPE,
      features: [
        {
          key: 'USER_LIMIT',
          inMemory: fallbackLimits.USER_LIMIT,
          database: null,
          currentUsage: 'N/A',
          limitReached: false
        },
        {
          key: 'TASK_LIMIT',
          inMemory: fallbackLimits.TASK_LIMIT,
          database: null,
          currentUsage: 'N/A',
          limitReached: false
        },
        {
          key: 'BOARD_LIMIT',
          inMemory: fallbackLimits.BOARD_LIMIT,
          database: null,
          currentUsage: 'N/A',
          limitReached: false
        },
        {
          key: 'STORAGE_LIMIT',
          inMemory: fallbackLimits.STORAGE_LIMIT,
          database: null,
          currentUsage: 'N/A',
          currentUsageFormatted: 'N/A',
          limitReached: false
        },
        {
          key: 'SUPPORT_TYPE',
          inMemory: fallbackLimits.SUPPORT_TYPE,
          database: null
        }
      ]
    };

    res.json({
      success: true,
      data: fallbackInfo,
      warning: 'Using fallback data - LicenseManager failed'
    });
  }
});

// Update plan setting
router.put('/plan/:key', authenticateAdminPortal, (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    // Validate key
    const allowedKeys = ['USER_LIMIT', 'TASK_LIMIT', 'BOARD_LIMIT', 'STORAGE_LIMIT', 'SUPPORT_TYPE'];
    if (!allowedKeys.includes(key)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid plan setting key' 
      });
    }

    // Validate value based on key type
    if (key !== 'SUPPORT_TYPE' && value !== null) {
      const numValue = parseInt(value);
      if (isNaN(numValue) || numValue < 0) {
        return res.status(400).json({ 
          success: false,
          error: 'Value must be a positive number or null' 
        });
      }
    }

    // Update or insert license setting
    const existingSetting = wrapQuery(db.prepare('SELECT id FROM license_settings WHERE setting_key = ?'), 'SELECT').get(key);
    
    if (existingSetting) {
      wrapQuery(db.prepare('UPDATE license_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?'), 'UPDATE')
        .run(value, key);
    } else {
      wrapQuery(db.prepare('INSERT INTO license_settings (setting_key, setting_value) VALUES (?, ?)'), 'INSERT')
        .run(key, value);
    }

    console.log(`✅ Admin portal updated plan setting: ${key} = ${value}`);

    res.json({
      success: true,
      message: 'Plan setting updated successfully',
      data: { key, value }
    });
  } catch (error) {
    console.error('Error updating plan setting:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update plan setting' 
    });
  }
});

// Delete plan setting (remove database override)
router.delete('/plan/:key', authenticateAdminPortal, (req, res) => {
  try {
    const { key } = req.params;

    // Validate key
    const allowedKeys = ['USER_LIMIT', 'TASK_LIMIT', 'BOARD_LIMIT', 'STORAGE_LIMIT', 'SUPPORT_TYPE'];
    if (!allowedKeys.includes(key)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid plan setting key' 
      });
    }

    // Delete the license setting (this removes the database override)
    const result = wrapQuery(db.prepare('DELETE FROM license_settings WHERE setting_key = ?'), 'DELETE')
      .run(key);

    if (result.changes === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Plan setting not found' 
      });
    }

    console.log(`✅ Admin portal deleted plan setting override: ${key}`);

    res.json({
      success: true,
      message: 'Plan setting override deleted successfully',
      data: { key }
    });
  } catch (error) {
    console.error('Error deleting plan setting:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete plan setting' 
    });
  }
});

// ================================
// ENHANCED SETTINGS MANAGEMENT
// ================================

// Delete a setting
router.delete('/settings/:key', authenticateAdminPortal, (req, res) => {
  try {
    const { key } = req.params;

    const result = wrapQuery(db.prepare('DELETE FROM settings WHERE key = ?'), 'DELETE').run(key);
    
    if (result.changes === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Setting not found' 
      });
    }

    console.log(`✅ Admin portal deleted setting: ${key}`);

    res.json({
      success: true,
      message: 'Setting deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting setting:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete setting' 
    });
  }
});

// Add a new setting
router.post('/settings', authenticateAdminPortal, (req, res) => {
  try {
    const { key, value } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({ 
        success: false,
        error: 'Key and value are required' 
      });
    }

    // Check if setting already exists
    const existingSetting = wrapQuery(db.prepare('SELECT key FROM settings WHERE key = ?'), 'SELECT').get(key);
    if (existingSetting) {
      return res.status(400).json({ 
        success: false,
        error: 'Setting with this key already exists' 
      });
    }

    // Insert new setting
    wrapQuery(db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)'), 'INSERT')
      .run(key, value);

    console.log(`✅ Admin portal created setting: ${key} = ${value}`);

    res.json({
      success: true,
      message: 'Setting created successfully',
      data: { key, value }
    });
  } catch (error) {
    console.error('Error creating setting:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create setting' 
    });
  }
});

// ================================
// INSTANCE STATUS MANAGEMENT
// ================================

// Update instance status in settings
router.put('/instance-status', authenticateAdminPortal, (req, res) => {
  try {
    const { status } = req.body;

    // Validate status
    const validStatuses = ['deploying', 'active', 'suspended', 'terminated', 'failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid status. Must be deploying, active, suspended, terminated, or failed' 
      });
    }

    // Update or insert INSTANCE_STATUS setting
    const existingSetting = wrapQuery(db.prepare('SELECT key FROM settings WHERE key = ?'), 'SELECT').get('INSTANCE_STATUS');
    
    if (existingSetting) {
      wrapQuery(db.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?'), 'UPDATE')
        .run(status, 'INSTANCE_STATUS');
    } else {
      wrapQuery(db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)'), 'INSERT')
        .run('INSTANCE_STATUS', status);
    }

    console.log(`✅ Admin portal updated instance status to: ${status}`);

    // Publish instance status update to Redis for real-time updates
    redisService.publish('instance-status-updated', {
      status,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Instance status updated successfully',
      data: { status }
    });
  } catch (error) {
    console.error('Error updating instance status:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update instance status' 
    });
  }
});

// Get current instance status
router.get('/instance-status', authenticateAdminPortal, (req, res) => {
  try {
    const statusSetting = wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('INSTANCE_STATUS');
    const status = statusSetting ? statusSetting.value : 'active';

    res.json({
      success: true,
      data: { status }
    });
  } catch (error) {
    console.error('Error fetching instance status:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch instance status' 
    });
  }
});

// ================================
// USER MANAGEMENT ENHANCEMENTS
// ================================

// Update user
router.put('/users/:userId', authenticateAdminPortal, (req, res) => {
  try {
    const { userId } = req.params;
    const { email, firstName, lastName, role, isActive } = req.body;
    
    // Validate required fields
    if (!email || !firstName || !lastName || !role) {
      return res.status(400).json({ 
        success: false,
        error: 'Email, first name, last name, and role are required' 
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
    
    // Check if user exists
    const existingUser = wrapQuery(db.prepare('SELECT id FROM users WHERE id = ?'), 'SELECT').get(userId);
    if (!existingUser) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    // Check if email is already taken by another user
    const emailTaken = wrapQuery(db.prepare('SELECT id FROM users WHERE email = ? AND id != ?'), 'SELECT').get(email, userId);
    if (emailTaken) {
      return res.status(400).json({ 
        success: false,
        error: 'Email is already taken by another user' 
      });
    }
    
    // Update user
    wrapQuery(db.prepare(`
      UPDATE users 
      SET email = ?, first_name = ?, last_name = ?, is_active = ?
      WHERE id = ?
    `), 'UPDATE').run(email, firstName, lastName, isActive ? 1 : 0, userId);
    
    // Update role
    const roleId = wrapQuery(db.prepare('SELECT id FROM roles WHERE name = ?'), 'SELECT').get(role)?.id;
    if (roleId) {
      // Remove existing roles
      wrapQuery(db.prepare('DELETE FROM user_roles WHERE user_id = ?'), 'DELETE').run(userId);
      // Add new role
      wrapQuery(db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)'), 'INSERT').run(userId, roleId);
    }
    
    // Update member name
    wrapQuery(db.prepare('UPDATE members SET name = ? WHERE user_id = ?'), 'UPDATE')
      .run(`${firstName} ${lastName}`, userId);
    
    console.log(`✅ Admin portal updated user: ${email} (${firstName} ${lastName})`);
    
    res.json({
      success: true,
      message: 'User updated successfully',
      data: {
        id: userId,
        email,
        firstName,
        lastName,
        role,
        isActive: !!isActive
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update user' 
    });
  }
});

// Send invitation email to user
router.post('/send-invitation', authenticateAdminPortal, async (req, res) => {
  try {
    const { email, adminName } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false,
        error: 'Email is required' 
      });
    }
    
    // Find user by email
    const user = wrapQuery(db.prepare('SELECT * FROM users WHERE email = ?'), 'SELECT').get(email);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    // Check if user is already active
    if (user.is_active) {
      return res.status(400).json({ 
        success: false,
        error: 'User is already active' 
      });
    }
    
    // Generate invitation token
    const inviteToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    
    // Store invitation token
    wrapQuery(db.prepare(`
      INSERT OR REPLACE INTO user_invitations (user_id, token, expires_at, created_at) 
      VALUES (?, ?, ?, ?)
    `), 'INSERT').run(user.id, inviteToken, expiresAt.toISOString(), new Date().toISOString());
    
    // Get site name from settings
    const siteNameSetting = wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('SITE_NAME');
    const siteName = siteNameSetting?.value || 'Easy Kanban';
    
    // Generate invitation URL
    const baseUrl = process.env.BASE_URL || `https://${process.env.DEFAULT_DOMAIN_SUFFIX || 'ezkan.cloud'}`;
    const inviteUrl = `${baseUrl}/invite/${inviteToken}`;
    
    // Send invitation email using the existing notification service
    const notificationService = (await import('../services/notificationService.js')).default;
    await notificationService.sendUserInvitation(user.id, inviteToken, adminName || 'Admin', baseUrl);
    
    console.log(`✅ Invitation sent to user: ${email}`);
    
    res.json({
      success: true,
      message: 'Invitation sent successfully',
      data: {
        email: user.email,
        inviteUrl: inviteUrl,
        expiresAt: expiresAt.toISOString()
      }
    });
  } catch (error) {
    console.error('Error sending invitation:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to send invitation' 
    });
  }
});

export default router;
