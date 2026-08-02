/**
 * Shared debounce for post-restore board refreshes.
 * Lifecycle often restores a board then a batch of tasks. An immediate force
 * refresh after board-restored races those task-restored events and can replace
 * local state with an empty/partial snapshot. Each restore-related event bumps
 * this timer so the authoritative getBoards() runs after the burst settles.
 */

type RefreshFn = (options?: { force?: boolean; forBoardId?: string }) => Promise<void> | void;

let timer: ReturnType<typeof setTimeout> | null = null;
let pendingRefresh: RefreshFn | null = null;

const DEFAULT_DELAY_MS = 1500;

export function scheduleSettledBoardRefresh(
  refreshFn: RefreshFn | null | undefined,
  delayMs: number = DEFAULT_DELAY_MS
): void {
  if (!refreshFn) return;
  pendingRefresh = refreshFn;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const fn = pendingRefresh;
    pendingRefresh = null;
    void fn?.({ force: true });
  }, delayMs);
}
