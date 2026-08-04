import { useEffect } from 'react';

type UseEscapeDismissOptions = {
  /** When false, the listener is not registered. Default true. */
  enabled?: boolean;
  /** When true, Escape is ignored (e.g. while a submit is in flight). */
  disabled?: boolean;
};

/**
 * Dismiss an open dialog/overlay on Escape (same pattern as TaskDeleteConfirmation).
 * Registers a document keydown listener while enabled.
 */
export function useEscapeDismiss(
  onEscape: () => void,
  { enabled = true, disabled = false }: UseEscapeDismissOptions = {}
): void {
  useEffect(() => {
    if (!enabled || disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      onEscape();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, disabled, onEscape]);
}
