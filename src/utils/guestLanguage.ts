/**
 * UI / correspondence language helpers.
 *
 * Guest UI:     explicit toggle → browser → APP_LANGUAGE → en
 * Logged-in UI: user pref → APP_LANGUAGE → browser → en
 * Emails:       user pref → APP_LANGUAGE → en  (server: resolveCorrespondenceLanguage)
 *
 * Login ↔ app sync:
 * - Toggling language on login stores an explicit guest choice (`ekLanguageExplicit`).
 * - On login, that explicit choice is written to the user language pref.
 * - Toggling language while signed in also updates the guest explicit key so logout
 *   keeps the same UI language on the login screen.
 */

export const GUEST_LANGUAGE_EXPLICIT_KEY = 'ekLanguageExplicit';

export type AppUiLanguage = 'en' | 'fr';

export function normalizeAppLanguage(value: unknown): AppUiLanguage | null {
  if (value == null) return null;
  const v = String(value).trim().toLowerCase();
  if (v === 'fr' || v.startsWith('fr')) return 'fr';
  if (v === 'en' || v.startsWith('en')) return 'en';
  return null;
}

export function getExplicitGuestLanguage(): AppUiLanguage | null {
  try {
    return normalizeAppLanguage(localStorage.getItem(GUEST_LANGUAGE_EXPLICIT_KEY));
  } catch {
    return null;
  }
}

export function setExplicitGuestLanguage(lang: AppUiLanguage): void {
  try {
    localStorage.setItem(GUEST_LANGUAGE_EXPLICIT_KEY, lang);
    localStorage.setItem('i18nextLng', lang);
  } catch {
    /* ignore */
  }
}

/**
 * Resolve language for unauthenticated screens.
 * 1) Explicit guest toggle  2) browser  3) APP_LANGUAGE (site default)  4) en
 */
export function resolveGuestLanguage(opts: {
  appLanguage?: string | null;
  browserLanguage?: string | null;
}): AppUiLanguage {
  const explicit = getExplicitGuestLanguage();
  if (explicit) return explicit;

  const fromBrowser = normalizeAppLanguage(opts.browserLanguage);
  if (fromBrowser) return fromBrowser;

  const fromApp = normalizeAppLanguage(opts.appLanguage);
  if (fromApp) return fromApp;

  return 'en';
}

/**
 * Resolve language for authenticated UI.
 * 1) User preferred language  2) APP_LANGUAGE  3) browser  4) en
 */
export function resolveLoggedInUiLanguage(opts: {
  userLanguage?: string | null;
  appLanguage?: string | null;
  browserLanguage?: string | null;
}): AppUiLanguage {
  const fromUser = normalizeAppLanguage(opts.userLanguage);
  if (fromUser) return fromUser;

  const fromApp = normalizeAppLanguage(opts.appLanguage);
  if (fromApp) return fromApp;

  const fromBrowser = normalizeAppLanguage(opts.browserLanguage);
  if (fromBrowser) return fromBrowser;

  return 'en';
}
