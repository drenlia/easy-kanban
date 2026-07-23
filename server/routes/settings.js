import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { getStorageUsage, getStorageLimit, formatBytes } from '../utils/storageUtils.js';
import notificationService from '../services/notificationService.js';
import { getTenantId, getRequestDatabase } from '../middleware/tenantRouting.js';
import { settings as settingsQueries, users as userQueries, members as memberQueries } from '../utils/sqlManager/index.js';
import { FE_PUBLIC_DEBUG_FLAG_KEYS } from '../constants/debugSettings.js';
import { AI_PUBLIC_SETTING_KEYS, AI_SECRET_SETTING_KEYS } from '../constants/aiSettings.js';
import { AGENT_MEMBER_ID } from '../constants/agentIdentity.js';
import { clearSqlDebugSettingsCache } from '../utils/sqlDebugSettingsCache.js';
import { serverDebug } from '../utils/serverDebug.js';
import { validateAiConnectivity, listAiModels } from '../utils/aiConnectivity.js';
import { AI_PROVIDER_PRESETS } from '../constants/aiProviders.js';
import { maskApiKey, isMaskedOrEmptyApiKey } from '../utils/maskSecret.js';
import { avatarUpload } from '../config/multer.js';
import path from 'path';
import fs from 'fs';

const router = express.Router();

async function getSettingValue(db, key) {
  const row = await settingsQueries.getSettingByKey(db, key);
  return row?.value ?? '';
}

/**
 * Publish Agent member create/update/delete so clients refresh assignee lists without a page reload.
 */
async function publishAgentMemberVisibility(db, tenantId, { enabled, nameUpdated = false }) {
  try {
    if (enabled) {
      const member = await memberQueries.getMemberById(db, AGENT_MEMBER_ID);
      if (member) {
        await notificationService.publish(
          'member-updated',
          { member, timestamp: new Date().toISOString() },
          tenantId
        );
      }
    } else {
      await notificationService.publish(
        'member-deleted',
        { memberId: AGENT_MEMBER_ID, timestamp: new Date().toISOString() },
        tenantId
      );
    }
  } catch (e) {
    console.error('Failed to publish Agent member visibility update:', e);
  }
}

async function resolveAiCredentials(db, overrides = {}) {
  const provider =
    overrides.provider !== undefined
      ? String(overrides.provider)
      : await getSettingValue(db, 'AI_PROVIDER');
  const baseUrl =
    overrides.baseUrl !== undefined
      ? String(overrides.baseUrl)
      : await getSettingValue(db, 'AI_API_BASE_URL');
  const model =
    overrides.model !== undefined
      ? String(overrides.model)
      : await getSettingValue(db, 'AI_MODEL');
  let apiKey =
    overrides.apiKey !== undefined && String(overrides.apiKey).trim() !== ''
      ? String(overrides.apiKey).trim()
      : '';
  if (!apiKey) {
    apiKey = await getSettingValue(db, 'AI_API_KEY');
  }
  return { provider, baseUrl, apiKey, model };
}

// Public settings endpoint for non-admin users
router.get('/', async (req, res, next) => {
  // Only handle when mounted at /api/settings (not /api/admin/settings)
  if (req.baseUrl === '/api/admin/settings') {
    return next(); // Let admin routes handle it
  }
  
  try {
    const db = getRequestDatabase(req);
    // MIGRATED: Get settings using sqlManager
    const publicKeys = [
      'SITE_NAME',
      'SITE_URL',
      'SITE_LOGO',
      'SITE_LOGO_DARK',
      'HIDE_GITHUB_LINK',
      'HIDE_SITE_LOGO',
      'SITE_OPENS_NEW_TAB',
      'MAIL_ENABLED',
      'GOOGLE_CLIENT_ID',
      'HIGHLIGHT_OVERDUE_TASKS',
      'DEFAULT_FINISHED_COLUMN_NAMES',
      ...FE_PUBLIC_DEBUG_FLAG_KEYS,
      ...AI_PUBLIC_SETTING_KEYS
    ];
    const settings = await settingsQueries.getSettingsByKeys(db, publicKeys);
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });
    // Per-tenant OAuth and site metadata must not be cached by browsers or intermediaries
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json(settingsObj);
  } catch (error) {
    console.error('Get public settings error:', error);
    res.status(500).json({ error: 'Failed to get public settings' });
  }
});

// Admin settings endpoints
// Handle GET /api/admin/settings (when mounted at /api/admin/settings)
router.get('/', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  // Only handle when mounted at /api/admin/settings
  if (req.baseUrl !== '/api/admin/settings') {
    return next(); // Let other routes handle it
  }
  
  try {
    const db = getRequestDatabase(req);
    // MIGRATED: Get all settings using sqlManager
    const settings = await settingsQueries.getAllSettings(db);
    const settingsObj = {};
    
    // Check if email is managed
    const mailManaged = settings.find(s => s.key === 'MAIL_MANAGED')?.value === 'true';
    
    settings.forEach(setting => {
      // Hide sensitive SMTP fields when email is managed (credentials and server details)
      // But allow SMTP_FROM_EMAIL and SMTP_FROM_NAME to be visible/editable
      if (mailManaged && ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'SMTP_SECURE'].includes(setting.key)) {
        settingsObj[setting.key] = '';
      } else if (AI_SECRET_SETTING_KEYS.includes(setting.key) && setting.value) {
        // Return Anthropic-style partial mask only — never the raw secret
        settingsObj[setting.key] = maskApiKey(setting.value);
        settingsObj[`${setting.key}_SET`] = 'true';
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

/**
 * Validate AI provider reachability (admin).
 * Body may include draft provider / baseUrl / apiKey / model; omitted fields use saved settings.
 */
router.post('/ai/validate', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  if (req.baseUrl !== '/api/admin/settings') {
    return next();
  }
  try {
    const db = getRequestDatabase(req);
    const creds = await resolveAiCredentials(db, {
      provider: req.body?.provider,
      baseUrl: req.body?.baseUrl,
      apiKey: req.body?.apiKey,
      model: req.body?.model
    });
    const result = await validateAiConnectivity(creds);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error, status: result.status });
    }
    return res.json({
      ok: true,
      detail: result.detail,
      provider: result.provider,
      models: result.models || []
    });
  } catch (error) {
    console.error('AI validate error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to validate AI connectivity' });
  }
});

/** Static provider presets for the admin UI (suggested URLs / hints). */
router.get('/ai/providers', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  if (req.baseUrl !== '/api/admin/settings') {
    return next();
  }
  return res.json({
    providers: AI_PROVIDER_PRESETS.map((p) => ({
      id: p.id,
      label: p.label,
      suggestedBaseUrl: p.suggestedBaseUrl,
      apiKeyRequired: p.apiKeyRequired,
      hint: p.hint
    }))
  });
});

/** List models from the configured (or draft) provider. */
router.post('/ai/models', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  if (req.baseUrl !== '/api/admin/settings') {
    return next();
  }
  try {
    const db = getRequestDatabase(req);
    const creds = await resolveAiCredentials(db, {
      provider: req.body?.provider,
      baseUrl: req.body?.baseUrl,
      apiKey: req.body?.apiKey,
      model: req.body?.model
    });
    const result = await listAiModels(creds);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error, status: result.status });
    }
    return res.json({ ok: true, provider: result.provider, models: result.models });
  } catch (error) {
    console.error('AI models list error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to list AI models' });
  }
});

/** Probe the push agent runner (admin). */
router.post('/ai/runner/probe', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  if (req.baseUrl !== '/api/admin/settings') {
    return next();
  }
  try {
    const db = getRequestDatabase(req);
    const { probeRunner } = await import('../services/agentRunnerClient.js');
    const result = await probeRunner(db, {
      runnerUrl: req.body?.runnerUrl,
      runnerToken: req.body?.runnerToken
    });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error('AI runner probe error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to probe agent runner' });
  }
});

// Handle PUT /api/admin/settings (when mounted at /api/admin/settings)
router.put('/', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  // Only handle when mounted at /api/admin/settings
  if (req.baseUrl !== '/api/admin/settings') {
    return next(); // Let other routes handle it
  }
  try {
    const db = getRequestDatabase(req);
    const { key, value } = req.body;
    
    if (!key) {
      return res.status(400).json({ error: 'Setting key is required' });
    }
    
    // Prevent updates to WEBSITE_URL - it's read-only and set during instance purchase
    if (key === 'WEBSITE_URL') {
      return res.status(403).json({ error: 'WEBSITE_URL is read-only and cannot be updated' });
    }
    
    // Prevent updates to APP_URL through general settings endpoint - it's owner-only
    // Use the dedicated /api/settings/app-url endpoint which enforces owner check
    if (key === 'APP_URL') {
      return res.status(403).json({ error: 'APP_URL can only be updated by the owner using the dedicated endpoint' });
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
    
    // Do not clear / overwrite masked AI secrets when admin leaves the display value
    if (AI_SECRET_SETTING_KEYS.includes(key)) {
      const existing = await getSettingValue(db, key);
      if (isMaskedOrEmptyApiKey(safeValue, existing)) {
        return res.json({
          message: 'Setting unchanged',
          key,
          value: existing ? maskApiKey(existing) : '',
          [`${key}_SET`]: Boolean(existing)
        });
      }
    }

    if (key === 'AI_MAX_CONCURRENT') {
      const { clampAiMaxConcurrent } = await import('../constants/aiSettings.js');
      safeValue = String(clampAiMaxConcurrent(safeValue));
    }

    // Enabling AI requires a reachable configured provider (+ runner when configured)
    if (key === 'AI_ENABLED' && String(safeValue) === 'true') {
      const creds = await resolveAiCredentials(db, {});
      const probe = await validateAiConnectivity(creds);
      if (!probe.ok) {
        return res.status(400).json({
          error: probe.error || 'AI provider is not reachable',
          code: 'AI_CONNECTIVITY_FAILED'
        });
      }
      try {
        const { probeRunner } = await import('../services/agentRunnerClient.js');
        const runnerProbe = await probeRunner(db);
        if (!runnerProbe.ok) {
          return res.status(400).json({
            error: runnerProbe.error || 'Agent runner is not reachable',
            code: 'AI_RUNNER_UNREACHABLE'
          });
        }
      } catch (e) {
        return res.status(400).json({
          error: e?.message || 'Agent runner is not reachable',
          code: 'AI_RUNNER_UNREACHABLE'
        });
      }
    }

    // MIGRATED: Upsert setting using sqlManager
    const result = await settingsQueries.upsertSetting(db, key, safeValue);
    if (key === 'SERVER_DEBUG_SQL') {
      clearSqlDebugSettingsCache();
    }

    // Keep Agent member display name in sync with AI_AGENT_NAME
    if (key === 'AI_AGENT_NAME' && safeValue) {
      try {
        await wrapQuery(
          db.prepare('UPDATE members SET name = $1 WHERE id = $2'),
          'UPDATE'
        ).run(String(safeValue).slice(0, 100), AGENT_MEMBER_ID);
      } catch (e) {
        console.error('Failed to sync Agent member name:', e);
      }
    }

    const dbgSettings = await serverDebug(db, 'SERVER_DEBUG_SETTINGS');

    // If this is a Google OAuth setting, reload the OAuth configuration
    if (key === 'GOOGLE_CLIENT_ID' || key === 'GOOGLE_CLIENT_SECRET' || key === 'GOOGLE_CALLBACK_URL') {
      if (dbgSettings) console.log(`Google OAuth setting updated: ${key} - Hot reloading OAuth config...`);
      // Invalidate OAuth configuration cache
      if (global.oauthConfigCache) {
        global.oauthConfigCache.invalidated = true;
        if (dbgSettings) console.log('✅ OAuth configuration cache invalidated - new settings will be loaded on next OAuth request');
      }
    }

    // Publish to Redis for real-time updates
    const tenantId = getTenantId(req);
    if (dbgSettings) {
      console.log('📤 Publishing settings-updated to Redis');
      console.log('📤 Broadcasting value:', { key, value });
    }
    await notificationService.publish('settings-updated', {
      key: key,
      value: AI_SECRET_SETTING_KEYS.includes(key) ? maskApiKey(String(safeValue)) : value,
      timestamp: new Date().toISOString()
    }, tenantId);
    if (dbgSettings) console.log('✅ Settings-updated published to Redis');

    // Agent assignee visibility follows AI_ENABLED; name follows AI_AGENT_NAME
    if (key === 'AI_ENABLED') {
      await publishAgentMemberVisibility(db, tenantId, {
        enabled: String(safeValue) === 'true'
      });
    } else if (key === 'AI_AGENT_NAME' && safeValue) {
      const aiOn = (await getSettingValue(db, 'AI_ENABLED')) === 'true';
      if (aiOn) {
        await publishAgentMemberVisibility(db, tenantId, {
          enabled: true,
          nameUpdated: true
        });
      }
    }
    
    res.json({
      message: 'Setting updated successfully',
      key,
      value: AI_SECRET_SETTING_KEYS.includes(key) ? maskApiKey(String(safeValue)) : safeValue,
      ...(AI_SECRET_SETTING_KEYS.includes(key) ? { [`${key}_SET`]: true } : {})
    });
  } catch (error) {
    console.error('❌ Error updating settings:', error);
    console.error('❌ Error details:', { key: req.body.key, value: req.body.value, error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to update setting', details: error.message });
  }
});

// Upload site logo (light or dark). Stores under avatars/ and upserts SITE_LOGO or SITE_LOGO_DARK.
router.post('/logo', authenticateToken, requireRole(['admin']), (req, res, next) => {
  if (req.baseUrl !== '/api/admin/settings') {
    return res.status(404).json({ error: 'Not Found' });
  }
  avatarUpload.single('logo')(req, res, async (err) => {
    if (err) {
      console.error('Site logo upload error:', err);
      return res.status(400).json({ error: err.message || 'Failed to upload logo' });
    }
    try {
      const db = getRequestDatabase(req);
      if (!req.file) {
        return res.status(400).json({ error: 'No logo file uploaded' });
      }

      const variant = (req.query.variant === 'dark' || req.body?.variant === 'dark') ? 'dark' : 'light';
      const settingKey = variant === 'dark' ? 'SITE_LOGO_DARK' : 'SITE_LOGO';
      const logoPath = `/avatars/${req.file.filename}`;

      // Best-effort: remove previous uploaded logo file if it was a local /avatars/ path
      try {
        const previous = await settingsQueries.getSettingByKey(db, settingKey);
        const prevValue = previous?.value || '';
        if (prevValue.startsWith('/avatars/') && prevValue !== logoPath) {
          const storagePaths = req.locals?.tenantStoragePaths
            || req.app.locals?.tenantStoragePaths
            || null;
          if (storagePaths?.avatars) {
            const prevFile = path.join(storagePaths.avatars, path.basename(prevValue));
            if (fs.existsSync(prevFile)) {
              fs.unlinkSync(prevFile);
            }
          }
        }
      } catch (cleanupErr) {
        console.warn('Could not remove previous site logo file:', cleanupErr.message);
      }

      await settingsQueries.upsertSetting(db, settingKey, logoPath);

      const tenantId = getTenantId(req);
      await notificationService.publish('settings-updated', {
        key: settingKey,
        value: logoPath,
        timestamp: new Date().toISOString()
      }, tenantId);

      res.json({
        message: 'Logo uploaded successfully',
        key: settingKey,
        value: logoPath
      });
    } catch (error) {
      console.error('Error saving site logo:', error);
      res.status(500).json({ error: 'Failed to save logo' });
    }
  });
});

// Update APP_URL endpoint (owner only)
router.put('/app-url', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const dbgHttp = await serverDebug(db, 'SERVER_DEBUG_HTTP');
    if (dbgHttp) console.log('📞 APP_URL update endpoint called');
    const { appUrl } = req.body;
    const userId = req.user.id;

    if (dbgHttp) console.log('📞 Request data:', { userId, appUrl });
    
    // MIGRATED: Get user email using sqlManager
    const user = await userQueries.getUserByIdForAdmin(db, userId);
    
    if (!user) {
      if (dbgHttp) console.log('❌ User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    if (dbgHttp) console.log('📞 User email:', user.email);
    
    // MIGRATED: Check if user is the owner using sqlManager
    const ownerSetting = await settingsQueries.getSettingByKey(db, 'OWNER');
    
    const isOwner = ownerSetting && ownerSetting.value === user.email;
    const isDefaultAdmin = user.email === 'admin@kanban.local';
    
    if (dbgHttp) {
      console.log('📞 Owner setting:', ownerSetting?.value);
      console.log('📞 User email:', user.email);
      console.log('📞 Is owner:', isOwner, 'Is default admin:', isDefaultAdmin);
    }

    if (!isOwner && !isDefaultAdmin) {
      if (dbgHttp) console.log('❌ User is not owner or default admin. Owner:', ownerSetting?.value, 'User:', user.email);
      return res.status(403).json({ error: 'Only the owner or default admin can update APP_URL' });
    }
    
    // Validate appUrl
    if (!appUrl || typeof appUrl !== 'string') {
      if (dbgHttp) console.log('❌ Invalid appUrl:', appUrl);
      return res.status(400).json({ error: 'appUrl is required and must be a string' });
    }
    
    // Validate URL format
    const trimmedUrl = appUrl.trim();
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      if (dbgHttp) console.log('❌ Invalid URL format:', trimmedUrl);
      return res.status(400).json({ error: 'appUrl must be a valid URL starting with http:// or https://' });
    }
    
    // Remove trailing slash if present
    const normalizedUrl = trimmedUrl.replace(/\/$/, '');
    
    // MIGRATED: Get current APP_URL using sqlManager
    const currentAppUrl = await settingsQueries.getSettingByKey(db, 'APP_URL');
    
    if (dbgHttp) {
      console.log('📞 Current APP_URL:', currentAppUrl?.value);
      console.log('📞 New APP_URL:', normalizedUrl);
      console.log('📞 Are they different?', !currentAppUrl || currentAppUrl.value !== normalizedUrl);
    }

    // MIGRATED: Update APP_URL only if it's different using sqlManager
    if (!currentAppUrl || currentAppUrl.value !== normalizedUrl) {
      await settingsQueries.upsertSettingWithTimestamp(db, 'APP_URL', normalizedUrl, new Date().toISOString());
      if (dbgHttp) console.log(`✅ APP_URL updated from "${currentAppUrl?.value || 'null'}" to "${normalizedUrl}"`);
      
      res.json({ 
        message: 'APP_URL updated successfully',
        appUrl: normalizedUrl
      });
    } else {
      if (dbgHttp) console.log('ℹ️ APP_URL unchanged, already set to:', normalizedUrl);
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
    const db = getRequestDatabase(req);
    
    // Define all mail-related settings to clear (empty strings)
    const mailSettingsToClear = [
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USERNAME',
      'SMTP_PASSWORD',
      'SMTP_FROM_EMAIL',
      'SMTP_FROM_NAME',
      'SMTP_SECURE' // Clear SMTP_SECURE so admin can set their own preference
    ];
    
    // MIGRATED: Clear all mail-related settings using sqlManager
    
    // Collect queries and send as a batched transaction
    const batchQueries = [];
    
    // Clear SMTP fields (set to empty strings)
    for (const key of mailSettingsToClear) {
      batchQueries.push({
        query: `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        params: [key, '']
      });
    }
    
    // Set MAIL_MANAGED to false and MAIL_ENABLED to false
    batchQueries.push({
      query: `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
      params: ['MAIL_MANAGED', 'false']
    });
    batchQueries.push({
      query: `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
      params: ['MAIL_ENABLED', 'false']
    });
    
    // Execute all inserts in a single batched transaction
    await db.executeBatchTransaction(batchQueries);

    
    // Publish to Redis for real-time updates (single message for all changes)
    const tenantId = getTenantId(req);
    if (await serverDebug(db, 'SERVER_DEBUG_SETTINGS')) {
      console.log('📤 Publishing mail-settings-cleared to Redis');
    }
    await notificationService.publish('settings-updated', {
      key: 'MAIL_SETTINGS_CLEARED',
      value: 'all',
      timestamp: new Date().toISOString(),
      clearedSettings: [...mailSettingsToClear, 'MAIL_MANAGED', 'MAIL_ENABLED']
    }, tenantId);
    if (await serverDebug(db, 'SERVER_DEBUG_SETTINGS')) {
      console.log('✅ Mail settings cleared and published to Redis');
    }

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
router.get('/info', authenticateToken, async (req, res, next) => {
  // Only handle when mounted at /api/storage
  if (req.baseUrl !== '/api/storage') {
    return next(); // Let other routes handle it
  }
  try {
    const db = getRequestDatabase(req);
    const usage = await getStorageUsage(db);
    const limit = await getStorageLimit(db);
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

