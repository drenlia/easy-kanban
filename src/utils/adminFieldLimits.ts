/** Shared Admin numeric limits and clamp helpers (type freely; clamp on blur/save). */

export const ADMIN_NUMERIC_INPUT_CLASS =
  'admin-numeric-input [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

export const ACTIVITY_FEED_WIDTH = { min: 120, max: 400 } as const;
export const ACTIVITY_FEED_HEIGHT = { min: 200, max: 800 } as const;
export const ACTIVITY_FEED_POS_X = { min: 0, max: 120 } as const;
export const ACTIVITY_FEED_POS_Y = { min: 66, max: 800 } as const;

/** Max upload size in MB (stored as bytes in settings). */
export const UPLOAD_MAX_MB = { min: 0, max: 1024 } as const;

export const AI_MAX_CONCURRENT = { min: 1, max: 10 } as const;

/** SMTP port range. */
export const SMTP_PORT = { min: 1, max: 65535 } as const;

/** Lifecycle retention days. */
export const LIFECYCLE_RETENTION_DAYS = { min: 0, max: 3650 } as const;

/** Notification queue retention for sent/failed rows (0 = keep forever). */
export const NOTIFICATION_QUEUE_RETENTION_DAYS = { min: 0, max: 3650 } as const;

/** Gamification action points (create/complete/move/…). */
export const REPORTS_ACTION_POINTS = { min: 0, max: 100 } as const;
/** Effort → points multiplier. */
export const REPORTS_EFFORT_MULTIPLIER = { min: 0, max: 20 } as const;

export const REPORTS_POINTS_LIMITS: Record<string, { min: number; max: number }> = {
  REPORTS_POINTS_TASK_CREATED: REPORTS_ACTION_POINTS,
  REPORTS_POINTS_TASK_COMPLETED: REPORTS_ACTION_POINTS,
  REPORTS_POINTS_TASK_MOVED: REPORTS_ACTION_POINTS,
  REPORTS_POINTS_TASK_UPDATED: REPORTS_ACTION_POINTS,
  REPORTS_POINTS_COMMENT_ADDED: REPORTS_ACTION_POINTS,
  REPORTS_POINTS_WATCHER_ADDED: REPORTS_ACTION_POINTS,
  REPORTS_POINTS_COLLABORATOR_ADDED: REPORTS_ACTION_POINTS,
  REPORTS_POINTS_TAG_ADDED: REPORTS_ACTION_POINTS,
  REPORTS_POINTS_EFFORT_MULTIPLIER: REPORTS_EFFORT_MULTIPLIER,
};

/** Parse integer; return null if empty/invalid (not a finite number). */
export function parseOptionalInt(raw: string): number | null {
  const trimmed = String(raw ?? '').trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

/** Clamp integer into [min, max]. Invalid/empty → fallback. */
export function clampInt(
  raw: string | number | undefined | null,
  min: number,
  max: number,
  fallback: number
): number {
  const n =
    typeof raw === 'number'
      ? raw
      : parseOptionalInt(String(raw ?? ''));
  if (n === null || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function clampIntToString(
  raw: string | number | undefined | null,
  min: number,
  max: number,
  fallback: number
): string {
  return String(clampInt(raw, min, max, fallback));
}

export type ActivityFeedPosition = { x: number; y: number };

/** Read position for display while typing (not clamped). */
export function readActivityFeedPositionRaw(
  raw: string | undefined
): { x: string | number; y: string | number } {
  try {
    const parsed = JSON.parse(raw || '{"x":10,"y":66}');
    return {
      x: parsed?.x === undefined || parsed?.x === null ? 10 : parsed.x,
      y: parsed?.y === undefined || parsed?.y === null ? 66 : parsed.y,
    };
  } catch {
    return { x: 10, y: 66 };
  }
}

export function parseActivityFeedPosition(
  raw: string | undefined
): ActivityFeedPosition {
  const rawPos = readActivityFeedPositionRaw(raw);
  return {
    x: clampInt(rawPos.x, ACTIVITY_FEED_POS_X.min, ACTIVITY_FEED_POS_X.max, 10),
    y: clampInt(rawPos.y, ACTIVITY_FEED_POS_Y.min, ACTIVITY_FEED_POS_Y.max, 66),
  };
}

export function stringifyActivityFeedPosition(pos: ActivityFeedPosition): string {
  return JSON.stringify({
    x: clampInt(pos.x, ACTIVITY_FEED_POS_X.min, ACTIVITY_FEED_POS_X.max, 10),
    y: clampInt(pos.y, ACTIVITY_FEED_POS_Y.min, ACTIVITY_FEED_POS_Y.max, 66),
  });
}

/** Normalize activity-feed defaults in a settings draft before save. */
export function clampActivityFeedInSettings(
  draft: Record<string, string | undefined>
): Record<string, string | undefined> {
  const next = { ...draft };
  if (next.DEFAULT_ACTIVITY_FEED_POSITION !== undefined) {
    next.DEFAULT_ACTIVITY_FEED_POSITION = stringifyActivityFeedPosition(
      parseActivityFeedPosition(next.DEFAULT_ACTIVITY_FEED_POSITION)
    );
  }
  if (next.DEFAULT_ACTIVITY_FEED_WIDTH !== undefined) {
    next.DEFAULT_ACTIVITY_FEED_WIDTH = clampIntToString(
      next.DEFAULT_ACTIVITY_FEED_WIDTH,
      ACTIVITY_FEED_WIDTH.min,
      ACTIVITY_FEED_WIDTH.max,
      160
    );
  }
  if (next.DEFAULT_ACTIVITY_FEED_HEIGHT !== undefined) {
    next.DEFAULT_ACTIVITY_FEED_HEIGHT = clampIntToString(
      next.DEFAULT_ACTIVITY_FEED_HEIGHT,
      ACTIVITY_FEED_HEIGHT.min,
      ACTIVITY_FEED_HEIGHT.max,
      400
    );
  }
  return next;
}

export function clampUploadMaxMb(raw: string | number): number {
  return clampInt(raw, UPLOAD_MAX_MB.min, UPLOAD_MAX_MB.max, 10);
}

export function reportsPointsLimitForKey(key: string): { min: number; max: number } {
  return REPORTS_POINTS_LIMITS[key] || REPORTS_ACTION_POINTS;
}
