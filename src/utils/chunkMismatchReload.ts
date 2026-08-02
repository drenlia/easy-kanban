/**
 * Hard-refresh helper for stale JS shells after a deploy (missing Vite chunks).
 * Caps automatic reloads so a persistent failure cannot loop forever.
 */

const COUNT_KEY = 'chunkMismatchHardRefreshCount';
const MAX_HARD_REFRESHES = 3;

/** Avoid double-counting when App + lazyWithRetry both see the same failure. */
let refreshInFlight = false;

function readCount(): number {
  try {
    const raw = sessionStorage.getItem(COUNT_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeCount(n: number): void {
  try {
    sessionStorage.setItem(COUNT_KEY, String(n));
  } catch {
    /* private mode / quota */
  }
}

/** Reset after a stable session so a later deploy can refresh again. */
export function clearChunkMismatchHardRefreshCount(): void {
  try {
    sessionStorage.removeItem(COUNT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Cache-bust navigate to pick up a new index.html + asset hashes.
 * @returns true if a hard refresh was started; false if the cap was hit.
 */
export function tryHardRefreshForChunkMismatch(reason: string): boolean {
  if (refreshInFlight) {
    return true;
  }

  const count = readCount();
  if (count >= MAX_HARD_REFRESHES) {
    console.error(
      `❌ Chunk load failed after ${MAX_HARD_REFRESHES} hard refreshes — giving up (${reason})`
    );
    return false;
  }

  const next = count + 1;
  writeCount(next);
  refreshInFlight = true;
  console.error(
    `❌ ${reason} — hard refresh ${next}/${MAX_HARD_REFRESHES} to load new bundles…`
  );

  const u = new URL(window.location.href);
  u.searchParams.set('_cb', String(Date.now()));
  window.location.href = u.toString();
  return true;
}

export const CHUNK_MISMATCH_MAX_HARD_REFRESHES = MAX_HARD_REFRESHES;
