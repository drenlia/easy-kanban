/**
 * Remove model chain-of-thought / thinking blocks before storing agent comments.
 * Keep in sync with runner/src/stripReasoning.js
 */

const THINK_BLOCK_RE =
  /<\s*(?:think|thinking|reasoning|redacted_reasoning)\b[^>]*>[\s\S]*?<\s*\/\s*(?:think|thinking|reasoning|redacted_reasoning)\s*>/gi;

const LEADING_REASONING_RE =
  /^(?:thinking|reasoning|chain[- ]?of[- ]?thought|internal monologue)\s*:[\s\S]*?(?=\n\s*\n|\n#{1,3}\s|\n(?:answer|final answer|response)\s*:|$)/i;

export function stripModelReasoning(text) {
  let out = String(text || '');
  if (!out.trim()) return '';

  out = out.replace(THINK_BLOCK_RE, '');
  out = out.replace(LEADING_REASONING_RE, '');
  out = out.replace(
    /<\/?\s*(?:think|thinking|reasoning|redacted_reasoning)\b[^>]*>/gi,
    ''
  );

  return out.replace(/^\s+|\s+$/g, '').replace(/\n{3,}/g, '\n\n');
}
