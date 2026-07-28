import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: true,
});

/** TipTap / stored HTML comments usually start with a tag. */
export function looksLikeHtml(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  return /^<[a-z][\s\S]*>/i.test(t);
}

/**
 * Normalize comment body for display: HTML as-is, Markdown → HTML.
 * Existing TipTap comments stay unchanged; agent Markdown becomes readable HTML.
 */
export function commentTextToHtml(text: string): string {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (looksLikeHtml(raw)) return raw;
  try {
    return marked.parse(raw, { async: false }) as string;
  } catch {
    return raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');
  }
}
