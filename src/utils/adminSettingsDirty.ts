import { isMaskedApiKeyDisplay } from './maskSecret';

const SKIP_KEYS = new Set(['WEBSITE_URL', 'APP_URL']);
const SECRET_KEYS = new Set([
  'SMTP_PASSWORD',
  'GOOGLE_CLIENT_SECRET',
  'AI_API_KEY',
  'AI_RUNNER_TOKEN',
]);

/** Main Admin nav tab ids that can show an unsaved-changes dot. */
export type AdminSettingsTabId =
  | 'site-settings'
  | 'sso'
  | 'mail-server'
  | 'app-settings'
  | 'project-settings';

function isProjectSettingsKey(key: string): boolean {
  return (
    key === 'DEFAULT_PROJ_PREFIX' ||
    key === 'DEFAULT_TASK_PREFIX' ||
    key === 'DEFAULT_FINISHED_COLUMN_NAMES' ||
    key === 'EFFORT_UNIT'
  );
}

function isSiteSettingsKey(key: string): boolean {
  return (
    key.startsWith('SITE_') ||
    key === 'HIDE_SITE_LOGO' ||
    key === 'HIDE_GITHUB_LINK' ||
    key === 'WEBSITE_URL'
  );
}

function isSsoKey(key: string): boolean {
  return key.startsWith('GOOGLE_');
}

function isMailKey(key: string): boolean {
  return key.startsWith('SMTP_') || key.startsWith('MAIL_');
}

function isAppSettingsKey(key: string): boolean {
  if (isProjectSettingsKey(key) || isSiteSettingsKey(key) || isSsoKey(key) || isMailKey(key)) {
    return false;
  }
  return (
    key.startsWith('APP_') ||
    key.startsWith('DEFAULT_') ||
    key.startsWith('UPLOAD_') ||
    key.startsWith('AI_') ||
    key.startsWith('NOTIFICATION_') ||
    key.startsWith('FE_DEBUG_') ||
    key.startsWith('SERVER_DEBUG_') ||
    key === 'FE_PERF_TESTS' ||
    key === 'SHOW_ACTIVITY_FEED' ||
    key === 'NOTIFICATION_DELAY' ||
    key === 'NOTIFICATION_DEFAULTS'
  );
}

/** Map a settings key to its Admin tab (or null if not a draftable settings tab). */
export function adminTabForSettingKey(key: string): AdminSettingsTabId | null {
  if (SKIP_KEYS.has(key) || key.endsWith('_SET')) return null;
  if (isSiteSettingsKey(key)) return 'site-settings';
  if (isSsoKey(key)) return 'sso';
  if (isMailKey(key)) return 'mail-server';
  if (isProjectSettingsKey(key)) return 'project-settings';
  if (isAppSettingsKey(key)) return 'app-settings';
  return null;
}

function valuesDiffer(
  key: string,
  saved: Record<string, string | undefined>,
  draft: Record<string, string | undefined>
): boolean {
  let draftVal = (draft[key] || '').trim();
  let savedVal = (saved[key] || '').trim();

  if (SECRET_KEYS.has(key) && isMaskedApiKeyDisplay(draftVal)) {
    return false;
  }

  if (key === 'SMTP_SECURE') {
    if (!draftVal) draftVal = 'tls';
    if (!savedVal) savedVal = 'tls';
  }

  return draftVal !== savedVal;
}

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
    if (valuesDiffer(key, saved, draft)) return true;
  }

  return false;
}

/** Which main Admin tabs have unsaved shared-settings edits. */
export function getDirtyAdminSettingsTabs(
  saved: Record<string, string | undefined>,
  draft: Record<string, string | undefined>
): Set<AdminSettingsTabId> {
  const dirty = new Set<AdminSettingsTabId>();
  const keys = new Set([...Object.keys(saved), ...Object.keys(draft)]);

  for (const key of keys) {
    if (SKIP_KEYS.has(key) || key.endsWith('_SET')) continue;
    if (!valuesDiffer(key, saved, draft)) continue;
    const tab = adminTabForSettingKey(key);
    if (tab) dirty.add(tab);
  }

  return dirty;
}

/** App Settings sub-tab ids that can show a dirty dot. */
export type AppSettingsSubTabId =
  | 'ui'
  | 'uploads'
  | 'notifications'
  | 'notification-queue'
  | 'ai'
  | 'troubleshooting';

export function appSettingsSubTabForKey(key: string): AppSettingsSubTabId | null {
  if (SKIP_KEYS.has(key) || key.endsWith('_SET')) return null;
  if (!isAppSettingsKey(key)) return null;
  if (key.startsWith('UPLOAD_')) return 'uploads';
  if (key.startsWith('AI_')) return 'ai';
  if (
    key.startsWith('FE_DEBUG_') ||
    key.startsWith('SERVER_DEBUG_') ||
    key === 'FE_PERF_TESTS'
  ) {
    return 'troubleshooting';
  }
  if (
    key.startsWith('NOTIFICATION_') ||
    key === 'NOTIFICATION_DELAY' ||
    key === 'NOTIFICATION_DEFAULTS'
  ) {
    return 'notifications';
  }
  // APP_*, DEFAULT_*, SHOW_ACTIVITY_FEED
  return 'ui';
}

/** Dirty App Settings subtabs from shared editingSettings (+ optional AI local draft). */
export function getDirtyAppSettingsSubTabs(
  saved: Record<string, string | undefined>,
  draft: Record<string, string | undefined>,
  options?: { aiLocalDirty?: boolean }
): Set<AppSettingsSubTabId> {
  const dirty = new Set<AppSettingsSubTabId>();
  const keys = new Set([...Object.keys(saved), ...Object.keys(draft)]);

  for (const key of keys) {
    if (SKIP_KEYS.has(key) || key.endsWith('_SET')) continue;
    if (!valuesDiffer(key, saved, draft)) continue;
    const sub = appSettingsSubTabForKey(key);
    if (sub) dirty.add(sub);
  }

  if (options?.aiLocalDirty) dirty.add('ai');
  return dirty;
}

/** True when a single settings key’s draft differs from saved (for field chrome). */
export function isAdminSettingFieldDirty(
  key: string,
  saved: Record<string, string | undefined>,
  draft: Record<string, string | undefined>
): boolean {
  if (SKIP_KEYS.has(key) || key.endsWith('_SET')) return false;
  return valuesDiffer(key, saved, draft);
}

/** Restore one key in a draft map from saved (manual-field Revert). */
export function revertAdminSettingField(
  key: string,
  saved: Record<string, string | undefined>,
  draft: Record<string, string | undefined>
): Record<string, string | undefined> {
  return {
    ...draft,
    [key]: saved[key] ?? '',
  };
}

/** Short display of the previous saved value for “Was: …”. */
export function formatSavedSettingDisplay(value: string | undefined, maxLen = 48): string {
  const v = (value ?? '').trim();
  if (!v) return '—';
  if (v.length <= maxLen) return v;
  return `${v.slice(0, maxLen - 1)}…`;
}
