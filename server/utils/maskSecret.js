/**
 * Mask a secret for admin UI display (Anthropic-style: prefix…suffix).
 * Never send the raw key back to the browser.
 * @param {string} key
 * @returns {string}
 */
export function maskApiKey(key) {
  const s = String(key || '').trim();
  if (!s) return '';
  if (s.length <= 12) {
    return `${s.slice(0, 4)}...${s.slice(-2)}`;
  }
  // Prefer a recognizable prefix (e.g. sk-ant-api03-Xxx) + last 4
  const headLen = Math.min(18, Math.max(10, s.length - 8));
  return `${s.slice(0, headLen)}...${s.slice(-4)}`;
}

/**
 * True when the admin submitted a display mask / empty field rather than a new secret.
 * @param {string} value
 * @param {string} [storedKey]
 */
export function isMaskedOrEmptyApiKey(value, storedKey = '') {
  const v = String(value ?? '').trim();
  if (!v) return true;
  if (v === '***' || v === '••••••••') return true;
  if (/\.\.\./.test(v)) return true;
  if (storedKey && v === maskApiKey(storedKey)) return true;
  return false;
}
