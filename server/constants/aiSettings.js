/**
 * Tenant AI / Agent settings keys (values are strings in the settings table).
 */
export const AI_SETTING_KEYS = Object.freeze({
  AI_ENABLED: 'AI_ENABLED',
  AI_PROVIDER: 'AI_PROVIDER',
  AI_API_BASE_URL: 'AI_API_BASE_URL',
  AI_API_KEY: 'AI_API_KEY',
  AI_MODEL: 'AI_MODEL',
  AI_AGENT_NAME: 'AI_AGENT_NAME',
  AI_MAX_CONCURRENT: 'AI_MAX_CONCURRENT',
  AI_RUNNER_URL: 'AI_RUNNER_URL',
  AI_RUNNER_TOKEN: 'AI_RUNNER_TOKEN'
});

/** Defaults seeded for new and existing tenants */
export const AI_SETTING_DEFAULTS = Object.freeze([
  ['AI_ENABLED', 'false'],
  ['AI_PROVIDER', 'openai'],
  ['AI_API_BASE_URL', ''],
  ['AI_API_KEY', ''],
  ['AI_MODEL', ''],
  ['AI_AGENT_NAME', 'Agent'],
  ['AI_MAX_CONCURRENT', '1'],
  ['AI_RUNNER_URL', ''],
  ['AI_RUNNER_TOKEN', '']
]);

/** Exposed on public GET /api/settings (no secrets) */
export const AI_PUBLIC_SETTING_KEYS = Object.freeze([
  'AI_ENABLED',
  'AI_AGENT_NAME',
  'AI_PROVIDER',
  'AI_MAX_CONCURRENT'
]);

/** Masked on admin GET like SMTP secrets */
export const AI_SECRET_SETTING_KEYS = Object.freeze([
  'AI_API_KEY',
  'AI_RUNNER_TOKEN'
]);

/** Clamp tenant concurrent agent jobs */
export function clampAiMaxConcurrent(value) {
  const n = parseInt(String(value ?? '1'), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 10) return 10;
  return n;
}
