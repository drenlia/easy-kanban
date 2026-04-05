import { FE_CLIENT_DEBUG_KEYS, type FeClientDebugKey } from '../constants/clientDebugKeys';

const flags = new Map<string, boolean>();

/**
 * Call when settings are loaded/refreshed (e.g. SettingsProvider).
 */
export function syncClientDebugFromSettings(settings: Record<string, string | undefined> | null | undefined): void {
  flags.clear();
  if (!settings) return;
  for (const key of FE_CLIENT_DEBUG_KEYS) {
    flags.set(key, settings[key] === 'true');
  }
}

/** True when this flag is enabled in tenant settings (defaults false until sync). */
export function feDebug(key: FeClientDebugKey): boolean {
  return flags.get(key) === true;
}
