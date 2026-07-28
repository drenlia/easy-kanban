/**
 * Convert Markdown to HTML for agent comments (TipTap comments already store HTML).
 */

import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: true
});

/**
 * @param {string} text
 * @returns {string} HTML
 */
export function markdownToHtml(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  // Already HTML from TipTap / prior conversion
  if (/^<[a-z][\s\S]*>/i.test(raw)) {
    return raw;
  }
  try {
    return marked.parse(raw, { async: false });
  } catch (err) {
    console.warn('markdownToHtml failed, wrapping as pre:', err?.message || err);
    const escaped = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<pre>${escaped}</pre>`;
  }
}
