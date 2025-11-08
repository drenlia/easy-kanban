import express from 'express';
import os from 'os';
import axios from 'axios';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { getStorageUsage, getStorageLimit, formatBytes } from '../utils/storageUtils.js';
import { getContainerMemoryInfo } from '../utils/containerMemory.js';
import { manualTriggers } from '../jobs/scheduler.js';
import { getTranslator } from '../utils/i18n.js';

const router = express.Router();

// Database migrations status endpoint
router.get('/migrations', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const db = req.app.locals.db;
    const { getMigrationStatus } = require('../migrations/index.js');
    const status = getMigrationStatus(db);
    
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('Error fetching migration status:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch migration status',
      message: error.message 
    });
  }
});

// Admin endpoints for manual job triggers
router.post('/jobs/snapshot', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    console.log('🔧 Admin triggered: Task snapshot creation');
    const result = await manualTriggers.triggerSnapshot(db);
    res.json({
      success: true,
      message: 'Task snapshots created successfully',
      ...result
    });
  } catch (error) {
    console.error('Error triggering snapshot:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create snapshots',
      message: error.message 
    });
  }
});

router.post('/jobs/achievements', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const t = getTranslator(db);
    console.log('🔧 Admin triggered: Achievement check');
    const result = await manualTriggers.triggerAchievementCheck(db);
    res.json({
      success: true,
      message: t('system.achievementCheckCompleted'),
      ...result
    });
  } catch (error) {
    console.error('Error triggering achievement check:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to check achievements',
      message: error.message 
    });
  }
});

router.post('/jobs/cleanup', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const t = getTranslator(db);
    const { retentionDays } = req.body;
    console.log(`🔧 Admin triggered: Snapshot cleanup (${retentionDays || 730} days)`);
    const result = await manualTriggers.triggerCleanup(db, retentionDays);
    res.json({
      success: true,
      message: t('system.cleanupCompletedSuccessfully'),
      ...result
    });
  } catch (error) {
    console.error('Error triggering cleanup:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to cleanup snapshots',
      message: error.message 
    });
  }
});

router.get('/system-info', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const db = req.app.locals.db;
    // Memory usage (container-aware)
    const memoryInfo = getContainerMemoryInfo();
    
    // CPU usage (simplified - just load average)
    const loadAvg = os.loadavg();
    const cpuCores = os.cpus().length;
    const cpuPercent = Math.round((loadAvg[0] / cpuCores) * 100);
    
    // Disk usage (storage info)
    const storageUsage = getStorageUsage(db);
    const storageLimit = getStorageLimit(db);
    const diskPercent = storageLimit > 0 ? Math.round((storageUsage / storageLimit) * 100) : 0;
    
    res.json({
      memory: {
        used: memoryInfo.used,
        total: memoryInfo.total,
        free: memoryInfo.free,
        percent: memoryInfo.percent,
        usedFormatted: formatBytes(memoryInfo.used),
        totalFormatted: formatBytes(memoryInfo.total),
        freeFormatted: formatBytes(memoryInfo.free)
      },
      cpu: {
        percent: cpuPercent,
        loadAverage: loadAvg[0],
        cores: cpuCores
      },
      disk: {
        used: storageUsage,
        total: storageLimit,
        percent: diskPercent,
        usedFormatted: formatBytes(storageUsage),
        totalFormatted: formatBytes(storageLimit)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting system info:', error);
    res.status(500).json({ error: 'Failed to get system information' });
  }
});

// Get instance owner
router.get('/owner', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const db = req.app.locals.db;
    const ownerSetting = wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'),
      'SELECT'
    ).get('OWNER');
    
    res.json({ owner: ownerSetting?.value || null });
  } catch (error) {
    console.error('Error fetching owner:', error);
    res.status(500).json({ error: 'Failed to fetch owner' });
  }
});

// Get admin portal configuration
router.get('/portal-config', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const db = req.app.locals.db;
    const adminPortalUrl = wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'),
      'SELECT'
    ).get('ADMIN_PORTAL_URL');
    
    res.json({ 
      adminPortalUrl: adminPortalUrl?.value || null 
    });
  } catch (error) {
    console.error('Error fetching portal config:', error);
    res.status(500).json({ error: 'Failed to fetch portal configuration' });
  }
});

// Proxy billing history request to admin portal
router.get('/instance-portal/billing-history', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    // Check if user is the owner
    const ownerSetting = wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'),
      'SELECT'
    ).get('OWNER');
    
    if (!ownerSetting || ownerSetting.value !== req.user.email) {
      return res.status(403).json({ error: 'Only the instance owner can access billing history' });
    }
    
    // Get admin portal URL
    const adminPortalUrl = wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'),
      'SELECT'
    ).get('ADMIN_PORTAL_URL');
    
    if (!adminPortalUrl || !adminPortalUrl.value) {
      return res.status(404).json({ error: 'Admin portal URL not configured' });
    }
    
    // Get instance ID
    const instanceId = wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'),
      'SELECT'
    ).get('INSTANCE_ID');
    
    // Make request to admin portal
    const response = await axios.get(
      `${adminPortalUrl.value}/api/instance-portal/billing-history`,
      {
        params: { instanceId: instanceId?.value },
        headers: {
          'Authorization': `Bearer ${req.header('Authorization')?.replace('Bearer ', '')}`
        },
        timeout: 10000
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching billing history:', error);
    
    if (error.response) {
      return res.status(error.response.status).json({ 
        error: error.response.data?.error || 'Failed to fetch billing history from admin portal' 
      });
    }
    
    res.status(500).json({ error: 'Failed to fetch billing history' });
  }
});

// Proxy change plan request to admin portal
router.post('/instance-portal/change-plan', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    // Check if user is the owner
    const ownerSetting = wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'),
      'SELECT'
    ).get('OWNER');
    
    if (!ownerSetting || ownerSetting.value !== req.user.email) {
      return res.status(403).json({ error: 'Only the instance owner can change the subscription plan' });
    }
    
    // Get admin portal URL
    const adminPortalUrl = wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'),
      'SELECT'
    ).get('ADMIN_PORTAL_URL');
    
    if (!adminPortalUrl || !adminPortalUrl.value) {
      return res.status(404).json({ error: 'Admin portal URL not configured' });
    }
    
    // Get instance ID
    const instanceId = wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'),
      'SELECT'
    ).get('INSTANCE_ID');
    
    // Make request to admin portal
    const response = await axios.post(
      `${adminPortalUrl.value}/api/instance-portal/subscription/change-plan`,
      {
        instanceId: instanceId?.value,
        ...req.body
      },
      {
        headers: {
          'Authorization': `Bearer ${req.header('Authorization')?.replace('Bearer ', '')}`
        },
        timeout: 10000
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Error changing plan:', error);
    
    if (error.response) {
      return res.status(error.response.status).json({ 
        error: error.response.data?.error || 'Failed to change plan' 
      });
    }
    
    res.status(500).json({ error: 'Failed to change plan' });
  }
});

// Proxy cancel subscription request to admin portal
router.post('/instance-portal/cancel-subscription', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    // Check if user is the owner
    const ownerSetting = wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'),
      'SELECT'
    ).get('OWNER');
    
    if (!ownerSetting || ownerSetting.value !== req.user.email) {
      return res.status(403).json({ error: 'Only the instance owner can cancel the subscription' });
    }
    
    // Get admin portal URL
    const adminPortalUrl = wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'),
      'SELECT'
    ).get('ADMIN_PORTAL_URL');
    
    if (!adminPortalUrl || !adminPortalUrl.value) {
      return res.status(404).json({ error: 'Admin portal URL not configured' });
    }
    
    // Get instance ID
    const instanceId = wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'),
      'SELECT'
    ).get('INSTANCE_ID');
    
    // Make request to admin portal
    const response = await axios.post(
      `${adminPortalUrl.value}/api/instance-portal/subscription/cancel`,
      {
        instanceId: instanceId?.value,
        ...req.body
      },
      {
        headers: {
          'Authorization': `Bearer ${req.header('Authorization')?.replace('Bearer ', '')}`
        },
        timeout: 10000
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    
    if (error.response) {
      return res.status(error.response.status).json({ 
        error: error.response.data?.error || 'Failed to cancel subscription' 
      });
    }
    
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// Test email configuration endpoint
router.post('/test-email', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    console.log('🧪 Test email endpoint called');
    
    // Check if demo mode is enabled
    if (process.env.DEMO_ENABLED === 'true') {
      const t = getTranslator(db);
      return res.status(400).json({ 
        error: t('system.emailTestingDisabledDemoMode'),
        details: 'Email functionality is disabled in demo environments to prevent sending emails',
        demoMode: true
      });
    }
    
    // Use EmailService for clean, reusable email functionality
    const EmailService = await import('../services/emailService.js');
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

export default router;

