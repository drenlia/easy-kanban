import type { Columns } from '../../types';
import type { TaskDropPlacement } from '../../utils/taskReorderingUtils';
import { beginRun, finishRun, recordOp, timeOp, type PerfRunRecord } from '../metrics';
import { isAbortError, pickRandom, randomInt, sleep } from '../lorem';

export interface MoveTasksOptions {
  boardId: string;
  /** Live board columns (read on each iteration via getter so WS updates apply) */
  getColumns: () => Columns;
  /**
   * Only move among these column IDs (currently visible on the board).
   * Prevents parking tasks in hidden Archive / filtered-out columns.
   */
  getVisibleColumnIds: () => string[];
  /** Same path as DnD */
  moveTask: (
    taskId: string,
    targetColumnId: string,
    placement: TaskDropPlacement
  ) => Promise<void>;
  signal: AbortSignal;
  minIntervalMs?: number;
  maxIntervalMs?: number;
}

function placementForIndex(
  tasks: { id: string }[],
  targetIndex: number,
  movingTaskId: string
): TaskDropPlacement {
  const others = tasks.filter((t) => t.id !== movingTaskId);
  if (others.length === 0 || targetIndex <= 0) return { kind: 'start' };
  if (targetIndex >= others.length) return { kind: 'end' };
  return { kind: 'before', taskId: others[targetIndex].id };
}

/** Wait until DnD reorder flags clear so the next move sees settled React state. */
async function waitForMoveSettled(signal: AbortSignal, timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  while (!signal.aborted) {
    const busy =
      (window as any).reorderingInProgress === true ||
      window.justUpdatedFromWebSocket === true;
    if (!busy) {
      // One frame for React to commit column state from the last setState
      await sleep(32, signal);
      return;
    }
    if (Date.now() - started > timeoutMs) return;
    await sleep(40, signal);
  }
}

export async function runMoveTasks(opts: MoveTasksOptions): Promise<PerfRunRecord> {
  const minMs = opts.minIntervalMs ?? 500;
  const maxMs = opts.maxIntervalMs ?? 2000;
  const startedAt = new Date().toISOString();
  beginRun();
  let cancelled = false;

  while (!opts.signal.aborted) {
    // Never start a move while a previous reorder is still settling
    try {
      await waitForMoveSettled(opts.signal);
    } catch (err) {
      if (isAbortError(err)) {
        cancelled = true;
        break;
      }
      throw err;
    }
    if (opts.signal.aborted) {
      cancelled = true;
      break;
    }

    const columns = opts.getColumns();
    const visibleIds = opts.getVisibleColumnIds().filter((id) => columns[id]);
    const columnIds = visibleIds.length > 0 ? visibleIds : Object.keys(columns);
    if (columnIds.length === 0) break;

    const visibleSet = new Set(columnIds);
    const allTasks: { id: string; columnId: string }[] = [];
    for (const colId of columnIds) {
      for (const t of columns[colId]?.tasks || []) {
        // Only pick tasks currently sitting in a visible column
        if (visibleSet.has(t.columnId || colId)) {
          allTasks.push({ id: t.id, columnId: colId });
        }
      }
    }

    if (allTasks.length === 0) {
      try {
        await sleep(randomInt(minMs, maxMs), opts.signal);
      } catch (err) {
        if (isAbortError(err)) {
          cancelled = true;
          break;
        }
        throw err;
      }
      continue;
    }

    const picked = pickRandom(allTasks)!;
    const targetColumnId = pickRandom(columnIds)!;
    const targetTasks = columns[targetColumnId]?.tasks || [];
    const targetIndex = randomInt(0, targetTasks.length);
    const placement = placementForIndex(targetTasks, targetIndex, picked.id);

    const { sample } = await timeOp(() =>
      opts.moveTask(picked.id, targetColumnId, placement)
    );
    recordOp(sample);

    // Wait for API + optimistic/WS settle before the next move (avoids stale column snapshots)
    try {
      await waitForMoveSettled(opts.signal);
      await sleep(randomInt(minMs, maxMs), opts.signal);
    } catch (err) {
      if (isAbortError(err)) {
        cancelled = true;
        break;
      }
      throw err;
    }
  }

  if (opts.signal.aborted) cancelled = true;

  return finishRun({
    scenario: 'move',
    boardId: opts.boardId,
    params: { minIntervalMs: minMs, maxIntervalMs: maxMs, serialized: true },
    startedAt,
    cancelled,
  });
}
