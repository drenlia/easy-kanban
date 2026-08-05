/**
 * HttpOnly media cookie for /api/files (I3).
 * Keeps session JWT out of <img> / attachment query strings.
 */

/** Refresh ahead of default 8h media token expiry (override via MEDIA_TOKEN_EXPIRES_IN). */
const MEDIA_SESSION_REFRESH_MS = 60 * 60 * 1000; // 1 hour

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let onVisibleHandler: (() => void) | null = null;

export async function establishMediaSession(): Promise<void> {
  let token = localStorage.getItem('authToken');
  if (!token) return;
  token = token.trim();
  if (/^bearer\s+/i.test(token)) token = token.replace(/^bearer\s+/i, '').trim();
  if (!token || token === 'undefined' || token === 'null') return;
  try {
    const res = await fetch('/api/files/media-session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'same-origin'
    });
    if (!res.ok && res.status !== 401) {
      console.warn('Failed to establish media session:', res.status);
    }
  } catch (err) {
    console.warn('Failed to establish media session:', err);
  }
}

/** Keep media cookie fresh for long-lived sessions (shorter than JWT by default). */
export function startMediaSessionRefresh(): void {
  stopMediaSessionRefresh();
  if (typeof window === 'undefined') return;

  refreshTimer = setInterval(() => {
    if (!localStorage.getItem('authToken')) {
      stopMediaSessionRefresh();
      return;
    }
    void establishMediaSession();
  }, MEDIA_SESSION_REFRESH_MS);

  onVisibleHandler = () => {
    if (document.visibilityState === 'visible' && localStorage.getItem('authToken')) {
      void establishMediaSession();
    }
  };
  document.addEventListener('visibilitychange', onVisibleHandler);
}

export function stopMediaSessionRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (onVisibleHandler) {
    document.removeEventListener('visibilitychange', onVisibleHandler);
    onVisibleHandler = null;
  }
}

export async function clearMediaSession(): Promise<void> {
  stopMediaSessionRefresh();
  try {
    await fetch('/api/files/media-session', {
      method: 'DELETE',
      credentials: 'same-origin'
    });
  } catch {
    // best-effort
  }
}
