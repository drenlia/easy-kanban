import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { getStorageUsage, getStorageLimit, formatBytes } from '../utils/storageUtils.js';
import redisService from '../services/redisService.js';

const router = express.Router();

// Public settings endpoint for non-admin users
router.get('/', (req, res, next) => {
  // Only handle when mounted at /api/settings (not /api/admin/settings)
  if (req.baseUrl === '/api/admin/settings') {
    return next(); // Let admin routes handle it
  }
  
  try {
    const db = req.app.locals.db;
    const settings = db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?, ?, ?)').all('SITE_NAME', 'SITE_URL', 'MAIL_ENABLED', 'GOOGLE_CLIENT_ID', 'HIGHLIGHT_OVERDUE_TASKS', 'DEFAULT_FINISHED_COLUMN_NAMES');
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

// Admin settings endpoints
// Handle GET /api/admin/settings (when mounted at /api/admin/settings)
router.get('/', authenticateToken, requireRole(['admin']), (req, res, next) => {
  // Only handle when mounted at /api/admin/settings
  if (req.baseUrl !== '/api/admin/settings') {
    return next(); // Let other routes handle it
  }
  
  try {
    const db = req.app.locals.db;
    const settings = wrapQuery(db.prepare('SELECT key, value FROM settings'), 'SELECT').all();
    const settingsObj = {};
    
    // Check if email is managed
    const mailManaged = settings.find(s => s.key === 'MAIL_MANAGED')?.value === 'true';
    
    settings.forEach(setting => {
      // Hide sensitive SMTP fields when email is managed
      if (mailManaged && ['SMTP_HOST', 'SMTP_USERNAME', 'SMTP_PASSWORD'].includes(setting.key)) {
        settingsObj[setting.key] = '';
      } else {
        settingsObj[setting.key] = setting.value;
      }
    });
    
    res.json(settingsObj);
  } catch (error) {
    console.error('Error fetching admin settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Handle PUT /api/admin/settings (when mounted at /api/admin/settings)
router.put('/', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  // Only handle when mounted at /api/admin/settings
  if (req.baseUrl !== '/api/admin/settings') {
    return next(); // Let other routes handle it
  }
  try {
    const db = req.app.locals.db;
    const { key, value } = req.body;
    
    if (!key) {
      return res.status(400).json({ error: 'Setting key is required' });
    }
    
    // Convert value to string for SQLite (SQLite only accepts strings, numbers, bigints, buffers, and null)
    // Booleans, undefined, and objects need to be converted
    let safeValue = value;
    if (typeof value === 'boolean') {
      safeValue = String(value); // Convert true/false to "true"/"false"
    } else if (value === undefined) {
      safeValue = '';
    } else if (typeof value === 'object' && value !== null) {
      // This shouldn't happen with proper client code, but handle it gracefully
      safeValue = JSON.stringify(value);
    }
    
    const result = wrapQuery(
      db.prepare(`
        INSERT OR REPLACE INTO settings (key, value, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `),
      'INSERT'
    ).run(key, safeValue);
    
    // If this is a Google OAuth setting, reload the OAuth configuration
    if (key === 'GOOGLE_CLIENT_ID' || key === 'GOOGLE_CLIENT_SECRET' || key === 'GOOGLE_CALLBACK_URL') {
      console.log(`Google OAuth setting updated: ${key} - Hot reloading OAuth config...`);
      // Invalidate OAuth configuration cache
      if (global.oauthConfigCache) {
        global.oauthConfigCache.invalidated = true;
        console.log('✅ OAuth configuration cache invalidated - new settings will be loaded on next OAuth request');
      }
    }
    
    // Publish to Redis for real-time updates
    console.log('📤 Publishing settings-updated to Redis');
    console.log('📤 Broadcasting value:', { key, value });
    await redisService.publish('settings-updated', {
      key: key,
      value: value,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Settings-updated published to Redis');
    
    res.json({ message: 'Setting updated successfully' });
  } catch (error) {
    console.error('❌ Error updating settings:', error);
    console.error('❌ Error details:', { key: req.body.key, value: req.body.value, error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to update setting', details: error.message });
  }
});

// Storage information endpoint
// Handle GET /api/storage/info (when mounted at /api/storage)
router.get('/info', authenticateToken, (req, res, next) => {
  // Only handle when mounted at /api/storage
  if (req.baseUrl !== '/api/storage') {
    return next(); // Let other routes handle it
  }
  try {
    const db = req.app.locals.db;
    const usage = getStorageUsage(db);
    const limit = getStorageLimit(db);
    const remaining = limit - usage;
    const usagePercent = limit > 0 ? Math.round((usage / limit) * 100) : 0;
    
    res.json({
      usage: usage,
      limit: limit,
      remaining: remaining,
      usagePercent: usagePercent,
      usageFormatted: formatBytes(usage),
      limitFormatted: formatBytes(limit),
      remainingFormatted: formatBytes(remaining)
    });
  } catch (error) {
    console.error('Error getting storage info:', error);
    res.status(500).json({ error: 'Failed to get storage information' });
  }
});

export default router;

