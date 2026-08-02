import { isMaskedApiKeyDisplay } from './maskSecret';

const SKIP_KEYS = new Set(['WEBSITE_URL', 'APP_URL']);
const SECRET_KEYS = new Set([
  'SMTP_PASSWORD',
  'GOOGLE_CLIENT_SECRET',
  'AI_API_KEY',
  'AI_RUNNER_TOKEN',
]);

/**
 * True when draft admin settings differ from saved values in a way that
 * handleSaveSettings would persist (aligned with Admin.tsx save rules).
 */
export function adminSettingsHaveChanges(
  saved: Record<string, string | undefined>,
  draft: Record<string, string | undefined>
): boolean {
  const keys = new Set([...Object.keys(saved), ...Object.keys(draft)]);

  for (const key of keys) {
    if (SKIP_KEYS.has(key) || key.endsWith('_SET')) continue;

    let draftVal = (draft[key] || '').trim();
    let savedVal = (saved[key] || '').trim();

    if (SECRET_KEYS.has(key) && isMaskedApiKeyDisplay(draftVal)) {
      continue;
    }

    if (key === 'SMTP_SECURE') {
      if (!draftVal) draftVal = 'tls';
      if (!savedVal) savedVal = 'tls';
    }

    if (draftVal !== savedVal) {
      return true;
    }
  }

  return false;
}
