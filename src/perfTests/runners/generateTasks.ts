import { createTaskAtTop, deleteTask } from '../../api';
import type { Columns, PriorityOption, Task, TeamMember } from '../../types';
import { generateUUID } from '../../utils/uuid';
import { getDefaultPriorityName } from '../../utils/appHelpers';
import { beginRun, finishRun, recordOp, timeOp, type PerfRunRecord } from '../metrics';
import { isAbortError, memberDisplayName, pickRandom, randomLorem, sleep } from '../lorem';

export interface GenerateTasksOptions {
  boardId: string;
  columns: Columns;
  member: TeamMember;
  count: number;
  defaultPriority: string;
  signal: AbortSignal;
  /** Called after each successful create with the new task id */
  onCreated?: (taskId: string) => void;
}

export async function runGenerateTasks(opts: GenerateTasksOptions): Promise<PerfRunRecord> {
  const columnIds = Object.keys(opts.columns);
  if (columnIds.length === 0) {
    throw new Error('No columns on the current board');
  }

  const displayName = memberDisplayName(opts.member);
  const today = new Date().toISOString().split('T')[0];
  const startedAt = new Date().toISOString();
  beginRun();
  let cancelled = false;

  for (let i = 1; i <= opts.count; i++) {
    if (opts.signal.aborted) {
      cancelled = true;
      break;
    }

    const columnId = pickRandom(columnIds)!;
    const task: Task = {
      id: generateUUID(),
      title: `${displayName} task #${i}`,
      description: randomLorem(15, 90),
      memberId: opts.member.id,
      requesterId: opts.member.id,
      startDate: today,
      dueDate: today,
      effort: randomIntEffort(),
      columnId,
      position: 0,
      priority: opts.defaultPriority,
      boardId: opts.boardId,
      comments: [],
    };

    const { result, sample } = await timeOp(() => createTaskAtTop(task));
    recordOp(sample);
    if (sample.ok && result?.id) {
      opts.onCreated?.(result.id);
    } else if (sample.ok) {
      opts.onCreated?.(task.id);
    }

    try {
      await sleep(0, opts.signal);
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
    scenario: 'generate',
    boardId: opts.boardId,
    params: {
      count: opts.count,
      memberId: opts.member.id,
      memberName: displayName,
    },
    startedAt,
    cancelled,
  });
}

function randomIntEffort(): number {
  return 1 + Math.floor(Math.random() * 5);
}

export function resolveDefaultPriority(availablePriorities: PriorityOption[]): string {
  return getDefaultPriorityName(availablePriorities) || 'medium';
}

/** Title pattern used by generate: "[name] task #N" */
export function isGeneratedTaskTitle(title: string): boolean {
  return /^.+\s+task\s+#\d+$/i.test(title.trim());
}

export interface CleanupOptions {
  boardId: string;
  columns: Columns;
  /** Prefer deleting only these IDs when provided */
  taskIds?: string[];
  signal: AbortSignal;
}

export async function runCleanupGenerated(opts: CleanupOptions): Promise<PerfRunRecord> {
  const startedAt = new Date().toISOString();
  beginRun();
  let cancelled = false;

  let ids: string[];
  if (opts.taskIds && opts.taskIds.length > 0) {
    ids = [...opts.taskIds];
  } else {
    ids = [];
    for (const col of Object.values(opts.columns)) {
      for (const t of col.tasks || []) {
        if (t.boardId && t.boardId !== opts.boardId) continue;
        if (isGeneratedTaskTitle(t.title || '')) {
          ids.push(t.id);
        }
      }
    }
  }

  for (const id of ids) {
    if (opts.signal.aborted) {
      cancelled = true;
      break;
    }
    const { sample } = await timeOp(() => deleteTask(id));
    recordOp(sample);
  }

  if (opts.signal.aborted) cancelled = true;

  return finishRun({
    scenario: 'cleanup',
    boardId: opts.boardId,
    params: { targetCount: ids.length },
    startedAt,
    cancelled,
  });
}
