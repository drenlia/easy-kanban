/**
 * Tenant AI / Agent settings keys (values are strings in the settings table).
 */
export const AI_SETTING_KEYS = Object.freeze({
  AI_ENABLED: 'AI_ENABLED',
  AI_API_BASE_URL: 'AI_API_BASE_URL',
  AI_API_KEY: 'AI_API_KEY',
  AI_MODEL: 'AI_MODEL',
  AI_AGENT_NAME: 'AI_AGENT_NAME'
});

/** Defaults seeded for new and existing tenants */
export const AI_SETTING_DEFAULTS = Object.freeze([
  ['AI_ENABLED', 'false'],
  ['AI_API_BASE_URL', ''],
  ['AI_API_KEY', ''],
  ['AI_MODEL', ''],
  ['AI_AGENT_NAME', 'Agent']
]);

/** Exposed on public GET /api/settings (no secrets) */
export const AI_PUBLIC_SETTING_KEYS = Object.freeze(['AI_ENABLED', 'AI_AGENT_NAME']);

/** Masked on admin GET like SMTP secrets */
export const AI_SECRET_SETTING_KEYS = Object.freeze(['AI_API_KEY']);
