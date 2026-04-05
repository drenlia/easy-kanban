/**
 * Utility functions for task reordering within and across columns
 * 
 * APPROACH:
 * - MOVE: Frontend reorders to indices [0,1,2,3...], sends ALL positions
 * - COPY: Backend creates with +0.5, frontend receives, renumbers ALL, sends to backend
 * - Always use clean integer positions for reliability
 */

import { Task, Columns } from '../types';
import { batchUpdateTaskPositions } from '../api';
import { DRAG_COOLDOWN_DURATION } from '../constants';
import { dndLog } from './dndDebug';

// Helper to parse position as number
const parsePos = (pos: any): number => typeof pos === 'number' ? pos : parseFloat(String(pos)) || 0;

/**
 * Moves a task to a specific index within its column.
 * Renumbers ALL tasks to sequential integers and sends to backend.
 */
export const moveTaskToIndex = async (
  task: Task,
  columnId: string,
  targetIndex: number,
  columns: Columns,
  setColumns: React.Dispatch<React.SetStateAction<Columns>>,
  setDragCooldown: (value: boolean) => void,
  refreshBoardData: () => Promise<void>
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

  // Optimistic update - INSTANT
  setColumns(prev => ({
    ...prev,
    [columnId]: {
      ...prev[columnId],
      tasks: renumberedTasks
    }
  }));

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
  setColumns: React.Dispatch<React.SetStateAction<Columns>>,
  setDragCooldown: (value: boolean) => void,
  refreshBoardData: () => Promise<void>
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

  // Optimistic update - INSTANT
  setColumns(prev => ({
    ...prev,
    [sourceColumnId]: { ...sourceColumn, tasks: sourceTasks },
    [targetColumnId]: { ...targetColumn, tasks: renumberedTargetTasks }
  }));

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
    // Rollback
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
  setColumns: React.Dispatch<React.SetStateAction<Columns>>
): Promise<void> => {
  // Get current state using functional update pattern
  let currentColumn: { tasks: Task[] } | null = null;
  
  setColumns(prev => {
    currentColumn = prev[columnId];
    return prev; // Don't change anything, just read
  });
  
  if (!currentColumn || !currentColumn.tasks) {
    console.error('❌ [renumberColumnAfterCopy] Column not found:', columnId);
    return;
  }

  // Sort tasks by current position and renumber to sequential integers
  const sortedTasks = [...currentColumn.tasks].sort((a, b) => parsePos(a.position) - parsePos(b.position));
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