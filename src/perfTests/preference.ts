/**
 * Per-admin Performance Test Overlay preference (user_settings, not tenant settings).
 * Survives reload / cleared localStorage; other admins are unaffected.
 */

export const PERF_TESTS_USER_SETTING_KEY = 'FE_PERF_TESTS';

export function isPerfTestsUserSettingEnabled(
  value: unknown
): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

type Listener = (enabled: boolean) => void;

const listeners = new Set<Listener>();

/** Notify App (and any other subscribers) after the Troubleshooting toggle saves. */
export function notifyPerfTestsPreference(enabled: boolean): void {
  listeners.forEach((listener) => {
    try {
      listener(enabled);
    } catch (err) {
      console.error('perfTests preference listener failed:', err);
    }
  });
}

export function subscribePerfTestsPreference(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
