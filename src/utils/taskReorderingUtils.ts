/**
 * Utility functions for task reordering within and across columns
 *
 * APPROACH:
 * - MOVE: Frontend reorders to indices [0,1,2,3...], sends ALL positions
 * - COPY: Backend creates with originalPos - 0.5 (above original), frontend renumbers ALL
 * - Drop intent is anchor-relative (before/after/start/end), resolved against the FULL column
 * - Always use clean integer positions for reliability
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

/** Keep filtered board list in lockstep with optimistic reorder (avoids post-drop flash). */
function syncFilteredColumnPositions(
  setFilteredColumns: Dispatch<SetStateAction<Columns>> | undefined,
  columnId: string,
  renumberedTasks: Task[]
) {
  if (!setFilteredColumns) return;
  const positionById = new Map(renumberedTasks.map(t => [t.id, parsePos(t.position)]));
  setFilteredColumns(prev => {
    const col = prev[columnId];
    if (!col) return prev;
    return {
      ...prev,
      [columnId]: {
        ...col,
        tasks: col.tasks
          .filter(t => positionById.has(t.id))
          .map(t => ({ ...t, position: positionById.get(t.id)! }))
          .sort((a, b) => parsePos(a.position) - parsePos(b.position))
      }
    };
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
  const column = columns[columnId];
  if (!column) {
    console.error('❌ [moveTaskToIndex] Column not found:', columnId);
    return;
  }

  // Sort all tasks by position
  const sortedTasks = [...column.tasks].sort((a, b) => parsePos(a.position) - parsePos(b.position));
  
  // Find current index of the task being moved
  const currentIndex = sortedTasks.findIndex(t => t.id === task.id);
  if (currentIndex === -1) {
    console.error('❌ [moveTaskToIndex] Task not found in column');
    return;
  }

  // Create new order: remove task from current position
  const tasksWithoutMoved = sortedTasks.filter(t => t.id !== task.id);
  
  // Clamp target index to valid range
  const clampedIndex = Math.max(0, Math.min(targetIndex, tasksWithoutMoved.length));
  
  // Check if index actually changed (simple comparison)
  if (currentIndex === clampedIndex) {
    return;
  }

  dndLog('🎯 [moveTaskToIndex]', {
    taskId: task.id,
    columnId,
    currentIndex,
    targetIndex,
    clampedIndex
  });

  // Insert task at new position
  const newOrder = [...tasksWithoutMoved];
  newOrder.splice(clampedIndex, 0, task);

  // Renumber all tasks to clean sequential integers [0, 1, 2, 3, ...]
  const renumberedTasks = newOrder.map((t, index) => ({
    ...t,
    position: index
  }));

  // Store previous state for rollback
  const previousColumnState = { ...column, tasks: [...column.tasks] };

  // Set flag to prevent WebSocket from overwriting our update
  // Use a longer timeout since we're sending multiple updates
  window.justUpdatedFromWebSocket = true;
  (window as any).lastOptimisticUpdateTime = Date.now();
  (window as any).reorderingInProgress = true;

  // Optimistic update - INSTANT (columns + filtered, so the board does not flash old order
  // while justUpdatedFromWebSocket delays the filter effect)
  setColumns(prev => ({
    ...prev,
    [columnId]: {
      ...prev[columnId],
      tasks: renumberedTasks
    }
  }));
  syncFilteredColumnPositions(setFilteredColumns, columnId, renumberedTasks);

  // Send ALL task positions to backend
  try {
    const updates = renumberedTasks.map(t => ({
      taskId: t.id,
      position: t.position,
      columnId: columnId
    }));
    
    await batchUpdateTaskPositions(updates);

    // Clear flags after a longer delay to ensure WebSocket doesn't overwrite
    setTimeout(() => {
      window.justUpdatedFromWebSocket = false;
      (window as any).reorderingInProgress = false;
    }, 1000); // Longer timeout for reliability
    
    // Add cooldown
    setDragCooldown(true);
    setTimeout(() => {
      setDragCooldown(false);
    }, DRAG_COOLDOWN_DURATION);
  } catch (error) {
    console.error('❌ [moveTaskToIndex] Failed to update positions:', error);
    // Rollback
    setColumns(prev => ({
      ...prev,
      [columnId]: previousColumnState
    }));
    syncFilteredColumnPositions(setFilteredColumns, columnId, previousColumnState.tasks);
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
  const sourceColumn = columns[sourceColumnId];
  const targetColumn = columns[targetColumnId];
  
  if (!sourceColumn || !targetColumn) {
    console.error('❌ [handleCrossColumnMove] Column not found');
    return;
  }

  dndLog('🎯 [handleCrossColumnMove]', {
    taskId: task.id,
    sourceColumnId,
    targetColumnId,
    targetIndex
  });

  // Store previous state for rollback
  const previousSourceState = { ...sourceColumn, tasks: [...sourceColumn.tasks] };
  const previousTargetState = { ...targetColumn, tasks: [...targetColumn.tasks] };

  // Remove from source and renumber source column
  const sourceTasks = sourceColumn.tasks
    .filter(t => t.id !== task.id)
    .sort((a, b) => parsePos(a.position) - parsePos(b.position))
    .map((t, index) => ({ ...t, position: index }));
  
  // Add to target at specified index and renumber target column
  const targetTasks = [...targetColumn.tasks].sort((a, b) => parsePos(a.position) - parsePos(b.position));
  const clampedIndex = Math.max(0, Math.min(targetIndex, targetTasks.length));
  
  // Insert task at target index with new columnId
  const updatedTask = { ...task, columnId: targetColumnId };
  const newTargetOrder = [...targetTasks];
  newTargetOrder.splice(clampedIndex, 0, updatedTask);
  
  // Renumber target tasks
  const renumberedTargetTasks = newTargetOrder.map((t, index) => ({
    ...t,
    position: index
  }));

  // Set flags
  window.justUpdatedFromWebSocket = true;
  (window as any).lastOptimisticUpdateTime = Date.now();
  (window as any).reorderingInProgress = true;

  // Optimistic update - INSTANT (columns + filtered)
  setColumns(prev => ({
    ...prev,
    [sourceColumnId]: { ...sourceColumn, tasks: sourceTasks },
    [targetColumnId]: { ...targetColumn, tasks: renumberedTargetTasks }
  }));
  if (setFilteredColumns) {
    setFilteredColumns(prev => {
      const next = { ...prev };
      const sourceFiltered = prev[sourceColumnId];
      const targetFiltered = prev[targetColumnId];
      if (sourceFiltered) {
        const sourcePos = new Map(sourceTasks.map(t => [t.id, parsePos(t.position)]));
        next[sourceColumnId] = {
          ...sourceFiltered,
          tasks: sourceFiltered.tasks
            .filter(t => t.id !== task.id && sourcePos.has(t.id))
            .map(t => ({ ...t, position: sourcePos.get(t.id)! }))
            .sort((a, b) => parsePos(a.position) - parsePos(b.position))
        };
      }
      if (targetFiltered) {
        const byId = new Map(targetFiltered.tasks.map(t => [t.id, t]));
        next[targetColumnId] = {
          ...targetFiltered,
          tasks: renumberedTargetTasks
            .filter(t => t.id === task.id || byId.has(t.id))
            .map(t => {
              const existing = byId.get(t.id);
              const base = existing || t;
              return { ...base, ...t, position: parsePos(t.position), columnId: targetColumnId };
            })
            .sort((a, b) => parsePos(a.position) - parsePos(b.position))
        };
      }
      return next;
    });
  }

  // Send ALL updates to backend
  try {
    const updates = [
      ...sourceTasks.map(t => ({
        taskId: t.id,
        position: t.position,
        columnId: sourceColumnId
      })),
      ...renumberedTargetTasks.map(t => ({
        taskId: t.id,
        position: t.position,
        columnId: targetColumnId
      }))
    ];
    
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
    console.error('❌ [handleCrossColumnMove] Failed to move task:', error);
    // Rollback columns; refresh restores filtered state
    setColumns(prev => ({
      ...prev,
      [sourceColumnId]: previousSourceState,
      [targetColumnId]: previousTargetState
    }));
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
  
  setColumns(prev => {
    columnTasks = prev[columnId]?.tasks ? [...prev[columnId].tasks] : null;
    return prev;
  });
  
  if (!columnTasks) {
    console.error('❌ [renumberColumnAfterCopy] Column not found:', columnId);
    return;
  }

  // Sort tasks by current position and renumber to sequential integers
  // Cast: assignment happens inside setColumns updater; TS CFA still sees only null.
  const tasksSnapshot = columnTasks as Task[];
  const sortedTasks = [...tasksSnapshot].sort((a, b) => parsePos(a.position) - parsePos(b.position));
  const renumberedTasks = sortedTasks.map((t, index) => ({
    ...t,
    position: index
  }));

  dndLog('🔄 [renumberColumnAfterCopy] Renumbering', renumberedTasks.length, 'tasks');

  // Update local state with renumbered tasks
  setColumns(prev => ({
    ...prev,
    [columnId]: {
      ...prev[columnId],
      tasks: renumberedTasks
    }
  }));

  // Send all positions to backend
  try {
    const updates = renumberedTasks.map(t => ({
      taskId: t.id,
      position: t.position,
      columnId: columnId
    }));
    
    await batchUpdateTaskPositions(updates);
    dndLog('✅ [renumberColumnAfterCopy] Column renumbered successfully');
  } catch (error) {
    console.error('❌ [renumberColumnAfterCopy] Failed to renumber:', error);
  }
};

/**
 * Calculates the position for inserting a task at a specific visual index.
 */
export const calculatePositionForIndex = (
  tasks: Task[],
  targetIndex: number,
  excludeTaskId?: string
): number => {
  const otherTasks = excludeTaskId 
    ? tasks.filter(t => t.id !== excludeTaskId)
    : tasks;
  
  return Math.max(0, Math.min(targetIndex, otherTasks.length));
};
