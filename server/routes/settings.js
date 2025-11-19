import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { getStorageUsage, getStorageLimit, formatBytes } from '../utils/storageUtils.js';
import redisService from '../services/redisService.js';
import { getTenantId } from '../middleware/tenantRouting.js';

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
    
    // Prevent updates to WEBSITE_URL - it's read-only and set during instance purchase
    if (key === 'WEBSITE_URL') {
      return res.status(403).json({ error: 'WEBSITE_URL is read-only and cannot be updated' });
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
    const tenantId = getTenantId(req);
    console.log('📤 Publishing settings-updated to Redis');
    console.log('📤 Broadcasting value:', { key, value });
    await redisService.publish('settings-updated', {
      key: key,
      value: value,
      timestamp: new Date().toISOString()
    }, tenantId);
    console.log('✅ Settings-updated published to Redis');
    
    res.json({ message: 'Setting updated successfully' });
  } catch (error) {
    console.error('❌ Error updating settings:', error);
    console.error('❌ Error details:', { key: req.body.key, value: req.body.value, error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to update setting', details: error.message });
  }
});

// Update APP_URL endpoint (owner only)
router.put('/app-url', authenticateToken, async (req, res) => {
  try {
    console.log('📞 APP_URL update endpoint called');
    const db = req.app.locals.db;
    const { appUrl } = req.body;
    const userId = req.user.id;
    
    console.log('📞 Request data:', { userId, appUrl });
    
    // Get user email
    const user = wrapQuery(
      db.prepare('SELECT email FROM users WHERE id = ?'),
      'SELECT'
    ).get(userId);
    
    if (!user) {
      console.log('❌ User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log('📞 User email:', user.email);
    
    // Check if user is the owner OR the default admin user (admin@kanban.local)
    // This allows the first user to set APP_URL even if OWNER hasn't been set yet
    const ownerSetting = wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'),
      'SELECT'
    ).get('OWNER');
    
    const isOwner = ownerSetting && ownerSetting.value === user.email;
    const isDefaultAdmin = user.email === 'admin@kanban.local';
    
    console.log('📞 Owner setting:', ownerSetting?.value);
    console.log('📞 User email:', user.email);
    console.log('📞 Is owner:', isOwner, 'Is default admin:', isDefaultAdmin);
    
    if (!isOwner && !isDefaultAdmin) {
      console.log('❌ User is not owner or default admin. Owner:', ownerSetting?.value, 'User:', user.email);
      return res.status(403).json({ error: 'Only the owner or default admin can update APP_URL' });
    }
    
    // Validate appUrl
    if (!appUrl || typeof appUrl !== 'string') {
      console.log('❌ Invalid appUrl:', appUrl);
      return res.status(400).json({ error: 'appUrl is required and must be a string' });
    }
    
    // Validate URL format
    const trimmedUrl = appUrl.trim();
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      console.log('❌ Invalid URL format:', trimmedUrl);
      return res.status(400).json({ error: 'appUrl must be a valid URL starting with http:// or https://' });
    }
    
    // Remove trailing slash if present
    const normalizedUrl = trimmedUrl.replace(/\/$/, '');
    
    // Get current APP_URL
    const currentAppUrl = wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'),
      'SELECT'
    ).get('APP_URL');
    
    console.log('📞 Current APP_URL:', currentAppUrl?.value);
    console.log('📞 New APP_URL:', normalizedUrl);
    console.log('📞 Are they different?', !currentAppUrl || currentAppUrl.value !== normalizedUrl);
    
    // Update APP_URL only if it's different
    if (!currentAppUrl || currentAppUrl.value !== normalizedUrl) {
      wrapQuery(
        db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'),
        'INSERT'
      ).run('APP_URL', normalizedUrl, new Date().toISOString());
      console.log(`✅ APP_URL updated from "${currentAppUrl?.value || 'null'}" to "${normalizedUrl}"`);
      
      res.json({ 
        message: 'APP_URL updated successfully',
        appUrl: normalizedUrl
      });
    } else {
      console.log('ℹ️ APP_URL unchanged, already set to:', normalizedUrl);
      res.json({ 
        message: 'APP_URL unchanged',
        appUrl: normalizedUrl
      });
    }
  } catch (error) {
    console.error('❌ Error updating APP_URL:', error);
    res.status(500).json({ error: 'Failed to update APP_URL' });
  }
});

// Clear all mail-related settings (for switching from managed to custom SMTP)
// Handle POST /api/admin/settings/clear-mail (when mounted at /api/admin/settings)
router.post('/clear-mail', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  // Only handle when mounted at /api/admin/settings
  if (req.baseUrl !== '/api/admin/settings') {
    return next(); // Let other routes handle it
  }
  
  try {
    const db = req.app.locals.db;
    
    // Define all mail-related settings to clear (empty strings)
    const mailSettingsToClear = [
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USERNAME',
      'SMTP_PASSWORD',
      'SMTP_FROM_EMAIL',
      'SMTP_FROM_NAME'
    ];
    
    // Clear all mail-related settings in a single transaction
    const clearSettings = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO settings (key, value, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `);
      
      // Clear SMTP fields (set to empty strings)
      mailSettingsToClear.forEach(key => {
        wrapQuery(stmt, 'INSERT').run(key, '');
      });
      
      // Set MAIL_MANAGED to false and MAIL_ENABLED to false
      wrapQuery(stmt, 'INSERT').run('MAIL_MANAGED', 'false');
      wrapQuery(stmt, 'INSERT').run('MAIL_ENABLED', 'false');
    });
    
    clearSettings();
    
    // Publish to Redis for real-time updates (single message for all changes)
    const tenantId = getTenantId(req);
    console.log('📤 Publishing mail-settings-cleared to Redis');
    await redisService.publish('settings-updated', {
      key: 'MAIL_SETTINGS_CLEARED',
      value: 'all',
      timestamp: new Date().toISOString(),
      clearedSettings: [...mailSettingsToClear, 'MAIL_MANAGED', 'MAIL_ENABLED']
    }, tenantId);
    console.log('✅ Mail settings cleared and published to Redis');
    
    res.json({ 
      message: 'Mail settings cleared successfully',
      clearedSettings: [...mailSettingsToClear, 'MAIL_MANAGED', 'MAIL_ENABLED']
    });
  } catch (error) {
    console.error('❌ Error clearing mail settings:', error);
    res.status(500).json({ error: 'Failed to clear mail settings', details: error.message });
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

