/**
 * Shared parse for retention-day settings.
 * 0 / empty / invalid → keep forever (no automatic purge).
 */
export function parseRetentionDays(value) {
  const n = parseInt(String(value ?? '0'), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
