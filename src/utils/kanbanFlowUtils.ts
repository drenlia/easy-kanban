/**
 * Days since the task entered its current column (local calendar days).
 * Returns 0 for missing/invalid timestamps.
 */
export function getColumnAgeDays(columnEnteredAt?: string | null): number {
  if (!columnEnteredAt) return 0;
  const entered = new Date(columnEnteredAt);
  if (Number.isNaN(entered.getTime())) return 0;
  const ms = Date.now() - entered.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/** True when column has a positive WIP limit. */
export function hasWipLimit(wipLimit?: number | null): boolean {
  return wipLimit != null && Number(wipLimit) > 0;
}

/**
 * Soft WIP status for a column using unfiltered task count.
 * - under: below limit
 * - at: exactly at limit
 * - over: above limit
 * - none: no limit configured
 */
export function getWipStatus(
  taskCount: number,
  wipLimit?: number | null
): 'none' | 'under' | 'at' | 'over' {
  if (!hasWipLimit(wipLimit)) return 'none';
  const limit = Number(wipLimit);
  if (taskCount > limit) return 'over';
  if (taskCount === limit) return 'at';
  return 'under';
}
