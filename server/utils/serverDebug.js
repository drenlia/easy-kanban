import { settings as settingsQueries } from '../utils/sqlManager/index.js';

/**
 * Server-side debug flags (Node console). Keys are SERVER_DEBUG_* in settings; not exposed on public /api/settings.
 */
export async function serverDebug(db, key) {
  if (!db || !key) return false;
  try {
    const row = await settingsQueries.getSettingByKey(db, key);
    return row?.value === 'true';
  } catch {
    return false;
  }
}

/**
 * Verbose WebSocket event logging (broadcasts, room joins, etc.).
 * Off in production; connection success logs stay unconditional in websocketService.
 */
export function wsVerboseEnabled() {
  return process.env.NODE_ENV !== 'production';
}

export function wsVerboseLog(...args) {
  if (wsVerboseEnabled()) console.log(...args);
}
