/** Anthropic-style partial mask for display (not for security of transit — server is source of truth). */
export function maskApiKey(key: string): string {
  const s = String(key || '').trim();
  if (!s) return '';
  if (s.length <= 12) {
    return `${s.slice(0, 4)}...${s.slice(-2)}`;
  }
  const headLen = Math.min(18, Math.max(10, s.length - 8));
  return `${s.slice(0, headLen)}...${s.slice(-4)}`;
}

/** True when the field still holds a display mask / empty rather than a newly pasted secret. */
export function isMaskedApiKeyDisplay(value: string): boolean {
  const v = String(value ?? '').trim();
  if (!v) return true;
  if (v === '***' || v === '••••••••') return true;
  return /\.\.\./.test(v);
}
