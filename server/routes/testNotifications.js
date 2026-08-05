/**
 * Test endpoint for PostgreSQL LISTEN/NOTIFY
 *
 * Disabled in production unless ALLOW_TEST_ENDPOINTS=true.
 * When enabled, requires admin JWT.
 *
 * Usage:
 *   POST /api/test/notifications
 *   Body: { channel: 'test-channel', message: 'Hello from PostgreSQL!' }
 */

import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import notificationService from '../services/notificationService.js';
import postgresNotificationService from '../services/postgresNotificationService.js';
import { getTenantId } from '../middleware/tenantRouting.js';

const router = express.Router();

function allowTestEndpoints(req, res, next) {
  const allowed =
    process.env.NODE_ENV !== 'production' ||
    process.env.ALLOW_TEST_ENDPOINTS === 'true';
  if (!allowed) {
    return res.status(404).json({ error: 'Not Found' });
  }
  return next();
}

router.use(allowTestEndpoints);
router.use(authenticateToken);
router.use(requireRole(['admin']));

// Test notification publish
router.post('/notifications', async (req, res) => {
  try {
    const { channel = 'test-channel', message = 'Test notification' } = req.body;
    const tenantId = getTenantId(req);

    console.log(`🧪 [Test] Publishing notification to channel: ${channel}, tenant: ${tenantId || 'single'}`);

    await notificationService.publish(
      channel,
      {
        message,
        timestamp: new Date().toISOString(),
        test: true
      },
      tenantId
    );

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
router.get('/notifications/status', async (req, res) => {
  try {
    res.json({
      service: 'PostgreSQL LISTEN/NOTIFY',
      connected: Boolean(postgresNotificationService?.isConnected),
      dbType: 'postgresql',
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
