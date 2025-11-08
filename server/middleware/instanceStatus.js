import { wrapQuery } from '../utils/queryLogger.js';
import { getTranslator } from '../utils/i18n.js';

/**
 * Middleware to check instance status before processing requests
 * Blocks access if instance status is not 'active'
 * Valid statuses: 'deploying', 'active', 'suspended', 'terminated', 'failed'
 */
export const checkInstanceStatus = (db) => {
  return (req, res, next) => {
    try {
      // Skip status check for essential endpoints that need to work even when suspended
      const skipPaths = [
        '/health',
        '/api/health',
        '/api/auth/instance-status',  // Allow status checking
        '/api/user/status',           // Allow user status checking
        '/api/settings',              // Allow loading site settings
        '/api/auth/check-default-admin', // Allow admin check
        '/api/auth/check-demo-user',     // Allow demo user check
        '/api/auth/login',               // Allow login attempts
        '/api/auth/google/url',          // Allow OAuth
        '/api/auth/google/callback',     // Allow OAuth callback
      ];
      
      const shouldSkip = skipPaths.some(path => 
        req.path === path || req.path.startsWith('/api/admin-portal/')
      );
      
      if (shouldSkip) {
        return next();
      }

      // Get instance status from settings
      const statusSetting = wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('INSTANCE_STATUS');
      const status = statusSetting ? statusSetting.value : 'active';

      // Allow access only if status is active
      if (status !== 'active') {
        const t = getTranslator(db);
        const statusMessage = getStatusMessage(status, t);
        
        // Return JSON error for API requests
        if (req.path.startsWith('/api/')) {
          return res.status(503).json({
            error: 'Instance unavailable',
            status: status,
            message: statusMessage,
            code: 'INSTANCE_SUSPENDED'
          });
        }
        
        // Return HTML page for web requests
        return res.status(503).render('maintenance', {
          status: status,
          message: statusMessage,
          title: 'Instance Unavailable'
        });
      }

      next();
    } catch (error) {
      console.error('Error checking instance status:', error);
      // Fail open - allow access if status check fails
      next();
    }
  };
};

/**
 * Get user-friendly message for instance status
 * @param {string} status - Instance status
 * @param {Function} t - Translation function (optional, defaults to English)
 */
const getStatusMessage = (status, t = (key) => key) => {
  switch (status) {
    case 'suspended':
      return t('instanceStatus.suspended');
    case 'terminated':
      return t('instanceStatus.terminated');
    case 'failed':
      return t('instanceStatus.failed');
    case 'deploying':
      return t('instanceStatus.deploying');
    default:
      return t('instanceStatus.unavailable');
  }
};

/**
 * Initialize instance status setting if it doesn't exist
 * Only sets to 'active' if the setting doesn't exist at all
 * Preserves existing status values (suspended/inactive) on restart
 */
export const initializeInstanceStatus = (db) => {
  try {
    const existingSetting = wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('INSTANCE_STATUS');
    
    if (!existingSetting) {
      wrapQuery(db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)'), 'INSERT')
        .run('INSTANCE_STATUS', 'active');
      console.log('✅ Initialized INSTANCE_STATUS setting to active');
    } else {
      console.log(`ℹ️ Instance status preserved: ${existingSetting.value}`);
    }
  } catch (error) {
    console.error('Error initializing instance status:', error);
  }
};
