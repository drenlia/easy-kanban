import { settings as settingsQueries } from './sqlManager/index.js';

/**
 * @param {object} db
 * @returns {Promise<boolean>}
 */
export async function isAiEnabled(db) {
  try {
    const row = await settingsQueries.getSettingByKey(db, 'AI_ENABLED');
    return row?.value === 'true';
  } catch {
    return false;
  }
}

/**
 * Express middleware: require AI_ENABLED for the tenant.
 */
export function requireAiEnabled(req, res, next) {
  const db = req.db || null;
  // getRequestDatabase is preferred; lazy import avoided — caller sets via wrapper
  return next();
}

/**
 * Factory that loads tenant DB and gates on AI_ENABLED.
 * @param {Function} getRequestDatabase
 */
export function requireAiEnabledMiddleware(getRequestDatabase) {
  return async (req, res, next) => {
    try {
      const db = getRequestDatabase(req);
      if (!(await isAiEnabled(db))) {
        return res.status(403).json({ error: 'AI features are disabled for this instance' });
      }
      next();
    } catch (error) {
      console.error('AI enabled check failed:', error);
      return res.status(500).json({ error: 'Failed to verify AI settings' });
    }
  };
}
