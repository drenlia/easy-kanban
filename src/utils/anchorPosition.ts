/** Viewport-clamped position for a floating panel near an anchor (e.g. task card). */

export type RectLike = Pick<DOMRect, 'top' | 'left' | 'bottom' | 'right' | 'width' | 'height'>;

export function snapshotRect(el: Element | null | undefined): DOMRect | null {
  if (!el) return null;
  return el.getBoundingClientRect();
}

/**
 * Place a panel near `anchor`, preferring below then above; horizontally centered on the anchor.
 */
export function computeAnchoredPosition(
  anchor: RectLike,
  panel: { width: number; height: number },
  opts?: { gap?: number; padding?: number }
): { top: number; left: number } {
  const gap = opts?.gap ?? 8;
  const padding = opts?.padding ?? 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(panel.width, vw - padding * 2);
  const height = Math.min(panel.height, vh - padding * 2);

  let top = anchor.bottom + gap;
  if (top + height > vh - padding) {
    top = anchor.top - gap - height;
  }
  if (top < padding) {
    top = padding;
  }
  if (top + height > vh - padding) {
    top = Math.max(padding, vh - padding - height);
  }

  let left = anchor.left + anchor.width / 2 - width / 2;
  left = Math.min(Math.max(left, padding), vw - padding - width);

  return { top, left };
}
