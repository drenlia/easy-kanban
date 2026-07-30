import { clearAllUserPreferenceCookies } from './userPreferences';

/** localStorage key mirroring server settings.DEMO_RESET_AT (demo builds only). */
export const DEMO_RESET_AT_STORAGE_KEY = 'easyKanbanDemoResetAt';

/** sessionStorage flag so Login can explain why the user was signed out. */
export const DEMO_RESET_REDIRECT_KEY = 'demoResetRedirect';

export function isDemoModeClient(): boolean {
  try {
    const meta = (import.meta as { env?: { DEMO_ENABLED?: string } })?.env?.DEMO_ENABLED;
    if (meta === 'true') return true;
  } catch {
    /* ignore */
  }
  try {
    // Vite also rewrites process.env.DEMO_ENABLED at build/dev time
    return (process as unknown as { env?: { DEMO_ENABLED?: string } })?.env?.DEMO_ENABLED === 'true';
  } catch {
    return false;
  }
}

function rememberStamp(serverStamp: string): void {
  try {
    localStorage.setItem(DEMO_RESET_AT_STORAGE_KEY, serverStamp);
  } catch {
    /* ignore */
  }
}

async function currentSessionStillValid(): Promise<boolean> {
  let token: string | null = null;
  try {
    token = localStorage.getItem('authToken');
  } catch {
    return false;
  }
  if (!token) return false;

  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Compare public/admin settings DEMO_RESET_AT to the last value this browser saw.
 *
 * - Always drops preference cookies when the stamp changes (stale board IDs, etc.).
 * - If the current JWT still maps to a user in this DB (e.g. already re-logged-in
 *   after reset), keep the session — only update the stamp.
 * - If the JWT is for a wiped user, clear storage and reload to the login page.
 *
 * Returns true if a reload was triggered.
 */
export async function syncDemoResetFromSettings(
  settings: Record<string, string | undefined> | null | undefined
): Promise<boolean> {
  if (!isDemoModeClient()) return false;

  const serverStamp = settings?.DEMO_RESET_AT;
  if (!serverStamp || typeof serverStamp !== 'string') return false;

  let stored: string | null = null;
  try {
    stored = localStorage.getItem(DEMO_RESET_AT_STORAGE_KEY);
  } catch {
    return false;
  }

  if (stored === serverStamp) return false;

  // Stamp changed (or first sighting). Prefs cookies are cheap to drop.
  try {
    clearAllUserPreferenceCookies();
  } catch {
    /* ignore */
  }

  const sessionOk = await currentSessionStillValid();
  if (sessionOk) {
    // Already authenticated against the new DB — keep token, adopt stamp.
    rememberStamp(serverStamp);
    try {
      localStorage.removeItem('reportFilters');
    } catch {
      /* ignore */
    }
    return false;
  }

  // No valid session for this DB — wipe client state and send to login.
  try {
    const keepLang = localStorage.getItem('i18nextLng');
    localStorage.clear();
    sessionStorage.clear();
    if (keepLang) localStorage.setItem('i18nextLng', keepLang);
    localStorage.setItem(DEMO_RESET_AT_STORAGE_KEY, serverStamp);
    sessionStorage.setItem(DEMO_RESET_REDIRECT_KEY, 'true');
  } catch {
    /* ignore */
  }
  window.location.reload();
  return true;
}
