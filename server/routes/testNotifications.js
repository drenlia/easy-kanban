/**
 * Test endpoint for PostgreSQL LISTEN/NOTIFY
 * 
 * This endpoint allows testing the notification service without affecting real data.
 * Usage:
 *   POST /api/test/notifications
 *   Body: { channel: 'test-channel', message: 'Hello from PostgreSQL!' }
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import postgresNotificationService from '../services/postgresNotificationService.js';
import { getTenantId } from '../middleware/tenantRouting.js';

const router = express.Router();

// Test notification publish
router.post('/notifications', authenticateToken, async (req, res) => {
  try {
    const { channel = 'test-channel', message = 'Test notification' } = req.body;
    const tenantId = getTenantId(req);

    console.log(`🧪 [Test] Publishing notification to channel: ${channel}, tenant: ${tenantId || 'single'}`);

    await postgresNotificationService.publish(channel, {
      message,
      timestamp: new Date().toISOString(),
      test: true
    }, tenantId);

    res.json({
      success: true,
      message: `Notification published to channel: ${channel}`,
      channel,
      tenantId: tenantId || 'single'
    });
  } catch (error) {
    console.error('❌ [Test] Failed to publish notification:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Check notification service status
router.get('/notifications/status', authenticateToken, async (req, res) => {
  try {
    const isConnected = postgresNotificationService.isServiceConnected();
    const usePostgres = process.env.DB_TYPE === 'postgresql';

    res.json({
      service: usePostgres ? 'PostgreSQL LISTEN/NOTIFY' : 'Redis pub/sub',
      connected: isConnected,
      dbType: process.env.DB_TYPE || 'sqlite',
      postgresHost: process.env.POSTGRES_HOST || 'not set',
      postgresPort: process.env.POSTGRES_PORT || 'not set',
      postgresDb: process.env.POSTGRES_DB || 'not set'
    });
  } catch (error) {
    console.error('❌ [Test] Failed to get notification status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;

