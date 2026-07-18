/**
 * Debug / verbose logging flags stored in tenant `settings` (string "true" / "false").
 *
 * Naming:
 * - FE_DEBUG_* — Browser console only. Exposed on public GET /api/settings so non-admin clients can gate logs.
 * - SERVER_DEBUG_* — Node.js server logs only. Not included in public /api/settings; admins see them in /api/admin/settings.
 *
 * Keep the FE_* list in sync with `src/constants/clientDebugKeys.ts`.
 */

/** @type {readonly string[]} */
export const FE_PUBLIC_DEBUG_FLAG_KEYS = Object.freeze([
  'FE_DEBUG_AUTH',
  'FE_DEBUG_WEBSOCKET',
  'FE_DEBUG_APP_CORE',
  'FE_DEBUG_TASK_LINKING',
  'FE_DEBUG_REPORTS_UI',
  'FE_DEBUG_FLOWCHART',
  'FE_DEBUG_TASK_CARD',
  'FE_DEBUG_TASK_PAGE',
  'FE_DEBUG_TASK_DETAILS',
  'FE_DEBUG_SETTINGS_CONTEXT',
  'FE_DEBUG_API',
  'FE_DEBUG_DND'
]);

/** Defaults inserted for new DBs (database.js) and migration 12 for existing tenants. @type {readonly [string, string][]} */
export const DEBUG_SETTING_DEFAULTS = Object.freeze([
  ...FE_PUBLIC_DEBUG_FLAG_KEYS.map((k) => /** @type {[string, string]} */ ([k, 'false'])),
  ['SERVER_DEBUG_SETTINGS', 'false'],
  ['SERVER_DEBUG_HTTP', 'false'],
  ['SERVER_DEBUG_SQL', 'false']
]);
