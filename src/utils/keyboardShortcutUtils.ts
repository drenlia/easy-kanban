/**
 * Shared helpers for global keyboard shortcuts.
 */

import { isEditableEscapeTarget, hasEscapeConsumingOverlay } from './escapeKeyUtils';

/** True when focus is in a field where character shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (isEditableEscapeTarget(target)) return true;
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest('.ProseMirror, .tiptap, [data-shortcut-ignore]');
}

/**
 * Skip board/chrome shortcuts while typing or when a modal/confirm owns the UI.
 * F1 help is exempt (handled separately).
 */
export function shouldIgnoreBoardShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return true;
  if (isTypingTarget(event.target)) return true;
  if (hasEscapeConsumingOverlay()) return true;
  return false;
}

function isElementOrAncestorHidden(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
    node = node.parentElement;
  }
  return false;
}

/** Focus the header task search input when present and visible. */
export function focusHeaderTaskSearch(): boolean {
  if (typeof document === 'undefined') return false;
  const input = document.querySelector<HTMLInputElement>(
    '[data-tour-id="header-task-search"]'
  );
  if (!input || isElementOrAncestorHidden(input)) return false;
  input.focus();
  input.select();
  return true;
}
