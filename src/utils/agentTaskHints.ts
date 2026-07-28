/**
 * Lightweight heuristics for agent assign UX (no LLM).
 * Soft warning only — never auto-switch mode.
 */

/** Strip HTML / entities to plain text for emptiness and heuristics. */
export function plainTextFromHtml(html: string | null | undefined): string {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isTaskDescriptionEmpty(
  descriptionHtml: string | null | undefined
): boolean {
  return plainTextFromHtml(descriptionHtml).length === 0;
}

/**
 * True when Code mode was chosen but the task text looks like Q&A / chat,
 * not an implementation request. Conservative: coding keywords suppress the warning.
 */
export function looksLikeNonCodingRequest(
  title: string | null | undefined,
  descriptionHtml: string | null | undefined
): boolean {
  const titleText = plainTextFromHtml(title || '');
  const descText = plainTextFromHtml(descriptionHtml);
  const text = `${titleText} ${descText}`.replace(/\s+/g, ' ').trim();
  if (!text) return false;

  const codingSignals =
    /\b(fix|bug|implement|add|refactor|migrate|endpoint|component|unit test|integration test|pull request|\bpr\b|commit|deploy|typescript|javascript|python|golang|rust|sql|css|dockerfile|npm|yarn|pnpm|docker|k8s|kubernetes|schema|migration|api route|frontend|backend|function|class|module|file path|\.tsx?\b|\.jsx?\b|\.py\b)\b/i;
  if (codingSignals.test(text)) return false;

  const qaLead =
    /^(just\s+)?(say|tell|explain|answer|summarize|what|why|how|who|when|where|can you|could you|please\s+(explain|tell|help|answer)|hello|hi\b|hey\b)\b/i;
  if (qaLead.test(text)) return true;

  const short = text.length < 100;
  if (short && /\?/.test(text)) return true;
  if (short && /\b(hello|hi there|just say)\b/i.test(text)) return true;

  return false;
}
