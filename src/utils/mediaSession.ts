/**
 * HttpOnly media cookie for /api/files (I3).
 * Keeps session JWT out of <img> / attachment query strings.
 */

export async function establishMediaSession(): Promise<void> {
  const token = localStorage.getItem('authToken');
  if (!token) return;
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

export async function clearMediaSession(): Promise<void> {
  try {
    await fetch('/api/files/media-session', {
      method: 'DELETE',
      credentials: 'same-origin'
    });
  } catch {
    // best-effort
  }
}
