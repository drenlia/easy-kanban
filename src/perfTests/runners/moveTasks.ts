import type { Columns } from '../../types';
import type { TaskDropPlacement } from '../../utils/taskReorderingUtils';
import { beginRun, finishRun, recordOp, timeOp, type PerfRunRecord } from '../metrics';
import { isAbortError, pickRandom, randomInt, sleep } from '../lorem';

export interface MoveTasksOptions {
  boardId: string;
  /** Live board columns (read on each iteration via getter so WS updates apply) */
  getColumns: () => Columns;
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

export async function runMoveTasks(opts: MoveTasksOptions): Promise<PerfRunRecord> {
  const minMs = opts.minIntervalMs ?? 500;
  const maxMs = opts.maxIntervalMs ?? 2000;
  const startedAt = new Date().toISOString();
  beginRun();
  let cancelled = false;

  while (!opts.signal.aborted) {
    const columns = opts.getColumns();
    const columnIds = Object.keys(columns);
    if (columnIds.length === 0) break;

    const allTasks: { id: string; columnId: string }[] = [];
    for (const colId of columnIds) {
      for (const t of columns[colId]?.tasks || []) {
        allTasks.push({ id: t.id, columnId: colId });
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

    try {
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
    params: { minIntervalMs: minMs, maxIntervalMs: maxMs },
    startedAt,
    cancelled,
  });
}
