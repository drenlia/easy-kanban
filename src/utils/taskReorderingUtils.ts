/**
 * Utility functions for task reordering within and across columns
 *
 * APPROACH:
 * - MOVE: Frontend reorders to indices [0,1,2,3...], sends ALL positions
 * - COPY: Backend creates with originalPos - 0.5 (above original), frontend renumbers ALL
 * - Drop intent is anchor-relative (before/after/start/end), resolved against the FULL column
 * - Always use clean integer positions for reliability
 * - Optimistic writes always derive from setState `prev` and strip taskId from ALL columns
 *   before inserting into the target (prevents duplicate cards under concurrent moves / WS)
 */

import { Task, Columns } from '../types';
import { batchUpdateTaskPositions } from '../api';
import { DRAG_COOLDOWN_DURATION } from '../constants';
import { dndLog } from './dndDebug';
import type { Dispatch, SetStateAction } from 'react';

// Helper to parse position as number
const parsePos = (pos: any): number => typeof pos === 'number' ? pos : parseFloat(String(pos)) || 0;

/**
 * Drop intent from DnD / UI. Resolved against the full column via resolveDropIndex.
 */
export type TaskDropPlacement =
  | { kind: 'before'; taskId: string }
  | { kind: 'after'; taskId: string }
  | { kind: 'start' }
  | { kind: 'end' };

/**
 * Resolve a drop placement to an insert index in the full column
 * (index into the list with draggedTaskId removed, if present).
 */
export function resolveDropIndex(
  fullTasks: Task[],
  placement: TaskDropPlacement,
  draggedTaskId?: string
): number {
  const sorted = [...fullTasks].sort((a, b) => parsePos(a.position) - parsePos(b.position));
  const originalIndex = draggedTaskId
    ? sorted.findIndex(t => t.id === draggedTaskId)
    : -1;
  const withoutDragged = draggedTaskId
    ? sorted.filter(t => t.id !== draggedTaskId)
    : sorted;

  if (placement.kind === 'start') {
    return 0;
  }
  if (placement.kind === 'end') {
    return withoutDragged.length;
  }

  // Dropping before/after yourself (common when returning to the original slot):
  // the anchor is removed with the dragged task, so findIndex fails and used to
  // fall through to "append at end". Restore the original index instead.
  if (draggedTaskId && placement.taskId === draggedTaskId) {
    return originalIndex >= 0
      ? Math.min(originalIndex, withoutDragged.length)
      : withoutDragged.length;
  }

  const anchorIdx = withoutDragged.findIndex(t => t.id === placement.taskId);
  if (anchorIdx < 0) {
    return withoutDragged.length;
  }
  if (placement.kind === 'before') {
    return anchorIdx;
  }
  // after
  return anchorIdx + 1;
}

/** Renumber tasks in a column to sequential integer positions. */
function renumberTasks(tasks: Task[]): Task[] {
  return [...tasks]
    .sort((a, b) => parsePos(a.position) - parsePos(b.position))
    .map((t, index) => ({ ...t, position: index }));
}

/**
 * Remove a task from every column (invariant: one task id → at most one column).
 * Optionally renumber columns that changed.
 */
export function stripTaskFromAllColumns(
  columns: Columns,
  taskId: string,
  options?: { exceptColumnId?: string; renumber?: boolean }
): Columns {
  const except = options?.exceptColumnId;
  const renumber = options?.renumber !== false;
  let changed = false;
  const next: Columns = { ...columns };

  for (const columnId of Object.keys(next)) {
    if (except && columnId === except) continue;
    const col = next[columnId];
    if (!col?.tasks?.length) continue;
    if (!col.tasks.some((t) => t && t.id === taskId)) continue;
    changed = true;
    const filtered = col.tasks.filter((t) => t && t.id !== taskId);
    next[columnId] = {
      ...col,
      tasks: renumber ? renumberTasks(filtered) : filtered,
    };
  }

  return changed ? next : columns;
}

/**
 * If the same task id appears in multiple columns, keep only one copy:
 * prefer the column matching task.columnId, else the first seen.
 */
export function dedupeTasksInColumns(columns: Columns): Columns {
  const claimed = new Map<string, string>(); // taskId → keeper columnId
  // First pass: prefer placements that match task.columnId
  for (const columnId of Object.keys(columns)) {
    const col = columns[columnId];
    if (!col?.tasks) continue;
    for (const task of col.tasks) {
      if (!task?.id) continue;
      const preferred = task.columnId || (task as any).columnid;
      if (preferred === columnId && !claimed.has(task.id)) {
        claimed.set(task.id, columnId);
      }
    }
  }
  // Second pass: claim remaining first-seen
  for (const columnId of Object.keys(columns)) {
    const col = columns[columnId];
    if (!col?.tasks) continue;
    for (const task of col.tasks) {
      if (!task?.id) continue;
      if (!claimed.has(task.id)) claimed.set(task.id, columnId);
    }
  }

  let changed = false;
  const next: Columns = { ...columns };
  for (const columnId of Object.keys(next)) {
    const col = next[columnId];
    if (!col?.tasks?.length) continue;
    const filtered = col.tasks.filter((t) => t?.id && claimed.get(t.id) === columnId);
    if (filtered.length !== col.tasks.length) {
      changed = true;
      next[columnId] = { ...col, tasks: renumberTasks(filtered) };
    }
  }
  return changed ? next : columns;
}

function findTaskInColumns(columns: Columns, taskId: string): { task: Task; columnId: string } | null {
  for (const columnId of Object.keys(columns)) {
    const col = columns[columnId];
    const task = col?.tasks?.find((t) => t && t.id === taskId);
    if (task) return { task, columnId };
  }
  return null;
}

type CrossMoveResult = {
  next: Columns;
  sourceColumnId: string;
  targetColumnId: string;
  sourceTasks: Task[];
  targetTasks: Task[];
};

/** Pure: apply cross-column move against a columns snapshot. */
export function applyCrossColumnMove(
  prev: Columns,
  taskId: string,
  targetColumnId: string,
  targetIndex: number,
  taskFallback?: Task
): CrossMoveResult | null {
  if (!prev[targetColumnId]) return null;

  const found = findTaskInColumns(prev, taskId);
  const movedTaskBase = found?.task || taskFallback;
  if (!movedTaskBase) return null;

  const sourceColumnId = found?.columnId || movedTaskBase.columnId || '';
  let next = stripTaskFromAllColumns(prev, taskId, { renumber: true });

  const targetCol = next[targetColumnId];
  if (!targetCol) return null;

  const targetSorted = renumberTasks(targetCol.tasks || []);
  const clampedIndex = Math.max(0, Math.min(targetIndex, targetSorted.length));
  const updatedTask: Task = { ...movedTaskBase, columnId: targetColumnId };
  const newTargetOrder = [...targetSorted];
  newTargetOrder.splice(clampedIndex, 0, updatedTask);
  const targetTasks = newTargetOrder.map((t, index) => ({ ...t, position: index, columnId: targetColumnId }));

  next = {
    ...next,
    [targetColumnId]: { ...targetCol, tasks: targetTasks },
  };

  const sourceTasks = (next[sourceColumnId]?.tasks || []) as Task[];

  return {
    next,
    sourceColumnId,
    targetColumnId,
    sourceTasks: sourceColumnId ? sourceTasks : [],
    targetTasks,
  };
}

type SameColumnMoveResult = {
  next: Columns;
  columnId: string;
  renumberedTasks: Task[];
  noop: boolean;
};

/** Pure: apply same-column reorder against a columns snapshot. */
export function applySameColumnMove(
  prev: Columns,
  taskId: string,
  columnId: string,
  targetIndex: number,
  taskFallback?: Task
): SameColumnMoveResult | null {
  if (!prev[columnId]) return null;

  const found = findTaskInColumns(prev, taskId);
  const movedTaskBase = found?.task || taskFallback;
  if (!movedTaskBase) return null;

  // Strip from all columns first (clears duplicates), then insert into columnId
  let next = stripTaskFromAllColumns(prev, taskId, { renumber: true });
  const column = next[columnId];
  if (!column) return null;

  const sortedTasks = renumberTasks(column.tasks || []);
  // After strip, task is absent — currentIndex for "no-op" uses found location before strip
  const priorSorted = renumberTasks(
    (found?.columnId === columnId ? prev[columnId]?.tasks : column.tasks) || []
  );
  const priorIndex = priorSorted.findIndex((t) => t.id === taskId);

  const clampedIndex = Math.max(0, Math.min(targetIndex, sortedTasks.length));
  if (found?.columnId === columnId && priorIndex === clampedIndex) {
    return { next: prev, columnId, renumberedTasks: priorSorted, noop: true };
  }

  const newOrder = [...sortedTasks];
  newOrder.splice(clampedIndex, 0, { ...movedTaskBase, columnId });
  const renumberedTasks = newOrder.map((t, index) => ({ ...t, position: index, columnId }));

  next = {
    ...next,
    [columnId]: { ...column, tasks: renumberedTasks },
  };

  return { next, columnId, renumberedTasks, noop: false };
}

/** Keep filtered board list in lockstep with optimistic reorder (avoids post-drop flash). */
function syncFilteredAfterCrossMove(
  setFilteredColumns: Dispatch<SetStateAction<Columns>> | undefined,
  taskId: string,
  targetColumnId: string,
  targetIndex: number,
  movedTask: Task
) {
  if (!setFilteredColumns) return;
  setFilteredColumns((prev) => {
    const applied = applyCrossColumnMove(prev, taskId, targetColumnId, targetIndex, movedTask);
    if (!applied) {
      // Still strip duplicates from filtered view
      return stripTaskFromAllColumns(prev, taskId, { exceptColumnId: targetColumnId });
    }
    return applied.next;
  });
}

function syncFilteredAfterSameColumnMove(
  setFilteredColumns: Dispatch<SetStateAction<Columns>> | undefined,
  taskId: string,
  columnId: string,
  targetIndex: number,
  movedTask: Task
) {
  if (!setFilteredColumns) return;
  setFilteredColumns((prev) => {
    const applied = applySameColumnMove(prev, taskId, columnId, targetIndex, movedTask);
    if (!applied || applied.noop) return prev;
    return applied.next;
  });
}

/**
 * Preview insert index among a visible (filtered) task list for the pink line.
 */
export function resolvePreviewInsertIndex(
  visibleTasks: Task[],
  placement: TaskDropPlacement,
  draggedTaskId?: string
): number {
  return resolveDropIndex(visibleTasks, placement, draggedTaskId);
}

/**
 * Moves a task to a specific index within its column.
 * Renumbers ALL tasks to sequential integers and sends to backend.
 */
export const moveTaskToIndex = async (
  task: Task,
  columnId: string,
  targetIndex: number,
  columns: Columns,
  setColumns: Dispatch<SetStateAction<Columns>>,
  setDragCooldown: (value: boolean) => void,
  refreshBoardData: () => Promise<void>,
  setFilteredColumns?: Dispatch<SetStateAction<Columns>>
): Promise<void> => {
  // Pre-check against current snapshot (fast fail); authoritative apply uses prev
  const preview = applySameColumnMove(columns, task.id, columnId, targetIndex, task);
  if (!preview) {
    console.error('❌ [moveTaskToIndex] Column/task not found:', columnId, task.id);
    return;
  }
  if (preview.noop) {
    return;
  }

  dndLog('🎯 [moveTaskToIndex]', {
    taskId: task.id,
    columnId,
    targetIndex,
  });

  let applied: SameColumnMoveResult | null = null;
  const rollbackSnapshot = columns;

  window.justUpdatedFromWebSocket = true;
  (window as any).lastOptimisticUpdateTime = Date.now();
  (window as any).reorderingInProgress = true;

  setColumns((prev) => {
    applied = applySameColumnMove(prev, task.id, columnId, targetIndex, task);
    if (!applied || applied.noop) return prev;
    return applied.next;
  });

  if (!applied || applied.noop) {
    window.justUpdatedFromWebSocket = false;
    (window as any).reorderingInProgress = false;
    return;
  }

  syncFilteredAfterSameColumnMove(setFilteredColumns, task.id, columnId, targetIndex, task);

  try {
    const updates = applied.renumberedTasks.map((t) => ({
      taskId: t.id,
      position: t.position as number,
      columnId,
    }));

    await batchUpdateTaskPositions(updates);

    setTimeout(() => {
      window.justUpdatedFromWebSocket = false;
      (window as any).reorderingInProgress = false;
    }, 1000);

    setDragCooldown(true);
    setTimeout(() => {
      setDragCooldown(false);
    }, DRAG_COOLDOWN_DURATION);
  } catch (error) {
    console.error('❌ [moveTaskToIndex] Failed to update positions:', error);
    setColumns(rollbackSnapshot);
    if (setFilteredColumns) {
      // Let filter effect rebuild from rolled-back columns via refresh
    }
    window.justUpdatedFromWebSocket = false;
    (window as any).reorderingInProgress = false;
    refreshBoardData().catch(() => {});
  }
};

// Aliases for backward compatibility
export const moveTaskToPosition = moveTaskToIndex;
export const handleSameColumnReorder = moveTaskToIndex;

/**
 * Handles moving a task from one column to another.
 * Renumbers both source and target columns.
 */
export const handleCrossColumnMove = async (
  task: Task,
  sourceColumnId: string,
  targetColumnId: string,
  targetIndex: number,
  columns: Columns,
  setColumns: Dispatch<SetStateAction<Columns>>,
  setDragCooldown: (value: boolean) => void,
  refreshBoardData: () => Promise<void>,
  setFilteredColumns?: Dispatch<SetStateAction<Columns>>
): Promise<void> => {
  const preview = applyCrossColumnMove(columns, task.id, targetColumnId, targetIndex, task);
  if (!preview) {
    console.error('❌ [handleCrossColumnMove] Column/task not found');
    return;
  }

  dndLog('🎯 [handleCrossColumnMove]', {
    taskId: task.id,
    sourceColumnId,
    targetColumnId,
    targetIndex,
  });

  let applied: CrossMoveResult | null = null;
  const rollbackSnapshot = columns;

  window.justUpdatedFromWebSocket = true;
  (window as any).lastOptimisticUpdateTime = Date.now();
  (window as any).reorderingInProgress = true;

  setColumns((prev) => {
    applied = applyCrossColumnMove(prev, task.id, targetColumnId, targetIndex, task);
    return applied ? applied.next : prev;
  });

  if (!applied) {
    window.justUpdatedFromWebSocket = false;
    (window as any).reorderingInProgress = false;
    return;
  }

  syncFilteredAfterCrossMove(setFilteredColumns, task.id, targetColumnId, targetIndex, task);

  try {
    const updates = [
      ...applied.sourceTasks.map((t) => ({
        taskId: t.id,
        position: t.position as number,
        columnId: applied!.sourceColumnId || sourceColumnId,
      })),
      ...applied.targetTasks.map((t) => ({
        taskId: t.id,
        position: t.position as number,
        columnId: targetColumnId,
      })),
    ];

    // If source was unknown (task only in fallback), still send target renumbers
    const dedupedUpdates = updates.filter((u) => u.columnId);

    await batchUpdateTaskPositions(dedupedUpdates);

    setTimeout(() => {
      window.justUpdatedFromWebSocket = false;
      (window as any).reorderingInProgress = false;
    }, 1000);

    setDragCooldown(true);
    setTimeout(() => {
      setDragCooldown(false);
    }, DRAG_COOLDOWN_DURATION);
  } catch (error) {
    console.error('❌ [handleCrossColumnMove] Failed to move task:', error);
    setColumns(rollbackSnapshot);
    window.justUpdatedFromWebSocket = false;
    (window as any).reorderingInProgress = false;
    refreshBoardData().catch(() => {});
  }
};

/**
 * Renumbers all tasks in a column after a copy operation.
 * Gets CURRENT state to avoid stale closure issues.
 */
export const renumberColumnAfterCopy = async (
  columnId: string,
  setColumns: Dispatch<SetStateAction<Columns>>
): Promise<void> => {
  let columnTasks: Task[] | null = null;

  setColumns((prev) => {
    columnTasks = prev[columnId]?.tasks ? [...prev[columnId].tasks] : null;
    return prev;
  });

  if (!columnTasks) {
    console.error('❌ [renumberColumnAfterCopy] Column not found:', columnId);
    return;
  }

  const tasksSnapshot = columnTasks as Task[];
  const sortedTasks = [...tasksSnapshot].sort((a, b) => parsePos(a.position) - parsePos(b.position));
  const renumberedTasks = sortedTasks.map((t, index) => ({
    ...t,
    position: index,
  }));

  dndLog('🔄 [renumberColumnAfterCopy] Renumbering', renumberedTasks.length, 'tasks');

  setColumns((prev) => ({
    ...prev,
    [columnId]: {
      ...prev[columnId],
      tasks: renumberedTasks,
    },
  }));

  try {
    const updates = renumberedTasks.map((t) => ({
      taskId: t.id,
      position: t.position as number,
      columnId,
    }));
    await batchUpdateTaskPositions(updates);
  } catch (error) {
    console.error('❌ [renumberColumnAfterCopy] Failed:', error);
  }
};
