/**
 * Activity feed position storage uses signed X as an edge inset:
 * - x >= 0 → pixels from the left edge
 * - x < 0  → pixels from the right edge (left = viewportWidth - width - abs(x))
 * Y is always from the top (below the header).
 */

export type ActivityFeedPosition = { x: number; y: number };

export const ACTIVITY_FEED_INSET = { min: 0, max: 120 } as const;
export const ACTIVITY_FEED_POS_Y = { min: 66, max: 800 } as const;

/** Default: 10px from the left, under the header (avoids TaskDetails on the right). */
export const DEFAULT_ACTIVITY_FEED_STORED_POSITION: ActivityFeedPosition = {
  x: 10,
  y: 66,
};

/** One-time client layout migration (cookies / prior right-edge default). */
export const ACTIVITY_FEED_LAYOUT_VERSION = 3;
export const activityFeedLayoutVersionKey = (userId: string | null) =>
  `ek-activity-feed-layout-v-${userId || 'anonymous'}`;

const EDGE_MARGIN = 10;

function viewportWidthFallback(viewportWidth?: number): number {
  if (typeof viewportWidth === 'number' && Number.isFinite(viewportWidth)) {
    return viewportWidth;
  }
  if (typeof window !== 'undefined') {
    return window.innerWidth;
  }
  return 1200;
}

/** Convert stored signed position → absolute viewport `left`/`top`. */
export function resolveActivityFeedPosition(
  stored: ActivityFeedPosition,
  width: number,
  viewportWidth?: number
): ActivityFeedPosition {
  const vw = viewportWidthFallback(viewportWidth);
  const w = Math.max(1, width);
  const rawLeft =
    stored.x < 0 ? vw - w - Math.abs(stored.x) : stored.x;
  const x = Math.max(EDGE_MARGIN, Math.min(vw - w - EDGE_MARGIN, rawLeft));
  const y = Math.max(
    ACTIVITY_FEED_POS_Y.min,
    Math.min(ACTIVITY_FEED_POS_Y.max, stored.y)
  );
  return { x, y };
}

/**
 * Convert absolute viewport coords → signed storage.
 * Prefers the nearer edge (right wins ties) so right-docked panels stay right-relative on resize.
 */
export function toStoredActivityFeedPosition(
  absolute: ActivityFeedPosition,
  width: number,
  viewportWidth?: number
): ActivityFeedPosition {
  const vw = viewportWidthFallback(viewportWidth);
  const w = Math.max(1, width);
  const leftInset = absolute.x;
  const rightInset = vw - w - absolute.x;
  const y = Math.round(absolute.y);
  if (rightInset <= leftInset) {
    return { x: -Math.round(Math.max(0, rightInset)), y };
  }
  return { x: Math.round(Math.max(0, leftInset)), y };
}

export function activityFeedEdgeFromStored(
  stored: ActivityFeedPosition
): 'left' | 'right' {
  return stored.x < 0 ? 'right' : 'left';
}

export function activityFeedInsetFromStored(stored: ActivityFeedPosition): number {
  return Math.abs(stored.x);
}

export function storedActivityFeedPositionFromEdge(
  edge: 'left' | 'right',
  inset: number,
  y: number
): ActivityFeedPosition {
  const clampedInset = Math.min(
    ACTIVITY_FEED_INSET.max,
    Math.max(ACTIVITY_FEED_INSET.min, Math.trunc(inset))
  );
  const clampedY = Math.min(
    ACTIVITY_FEED_POS_Y.max,
    Math.max(ACTIVITY_FEED_POS_Y.min, Math.trunc(y))
  );
  return {
    x: edge === 'right' ? -clampedInset : clampedInset,
    y: clampedY,
  };
}

export function normalizeStoredActivityFeedPosition(
  raw: unknown,
  fallback: ActivityFeedPosition = DEFAULT_ACTIVITY_FEED_STORED_POSITION
): ActivityFeedPosition {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const obj = raw as { x?: unknown; y?: unknown };
  const xNum = typeof obj.x === 'number' ? obj.x : Number(obj.x);
  const yNum = typeof obj.y === 'number' ? obj.y : Number(obj.y);
  if (!Number.isFinite(xNum) || !Number.isFinite(yNum)) return { ...fallback };
  return { x: Math.trunc(xNum), y: Math.trunc(yNum) };
}
