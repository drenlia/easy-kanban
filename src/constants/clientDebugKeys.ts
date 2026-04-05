/**
 * Frontend debug flags (browser console). Values come from settings (string "true" / "false").
 * Sync with server/constants/debugSettings.js → FE_PUBLIC_DEBUG_FLAG_KEYS.
 */
export const FE_CLIENT_DEBUG_KEYS = [
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
] as const;

export type FeClientDebugKey = (typeof FE_CLIENT_DEBUG_KEYS)[number];
