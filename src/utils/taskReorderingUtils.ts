/**
 * Utility functions for task reordering within and across columns
 */

import { Task, Columns } from '../types';
import { updateTask } from '../api';
import { arrayMove } from '@dnd-kit/sortable';
import { DRAG_COOLDOWN_DURATION } from '../constants';

/**
 * Handles reordering tasks within the same column
 * @param task - The task being reordered
 * @param columnId - The ID of the column containing the task
 * @param newIndex - The new index position for the task
 * @param columns - Current columns state
 * @param setColumns - Function to update columns state
 * @param setDragCooldown - Function to set drag cooldown flag
 * @param refreshBoardData - Function to refresh board data on error
 */
export const handleSameColumnReorder = async (
  task: Task,
  columnId: string,
  newIndex: number,
  columns: Columns,
  setColumns: React.Dispatch<React.SetStateAction<Columns>>,
  setDragCooldown: (value: boolean) => void,
  refreshBoardData: () => Promise<void>
): Promise<void> => {
  const columnTasks = [...(columns[columnId]?.tasks || [])]
    .sort((a, b) => (a.position || 0) - (b.position || 0));
  
  const currentIndex = columnTasks.findIndex(t => t.id === task.id);

  console.log('🔄 handleSameColumnReorder called:', {
    taskId: task.id,
    taskTitle: task.title,
    taskPosition: task.position,
    columnId,
    newIndex,
    currentIndex,
    columnTasksCount: columnTasks.length,
    columnTasks: columnTasks.map(t => ({ id: t.id, title: t.title, position: t.position }))
  });

  // Check if reorder is actually needed
  // BUT: Allow reordering when dropping on another task (even if same position)
  // This enables proper swapping of tasks at the same position
  if (currentIndex === newIndex) {
      console.log('🔄 No reorder needed - currentIndex === newIndex:', currentIndex);
      return;
  }

  // Optimistic update - reorder in UI immediately
  const oldIndex = currentIndex;
  const reorderedTasks = arrayMove(columnTasks, oldIndex, newIndex);
  
  // Recalculate positions for all tasks in the group
  const tasksWithUpdatedPositions = reorderedTasks.map((t, index) => ({
    ...t,
    position: index
  }));
  
  // Set flag to prevent WebSocket interference
  if (window.setJustUpdatedFromWebSocket) {
    window.setJustUpdatedFromWebSocket(true);
  }
  
  setColumns(prev => ({
    ...prev,
    [columnId]: {
      ...prev[columnId],
      tasks: tasksWithUpdatedPositions
    }
  }));

  // Send all updated tasks with their new positions to backend
  try {
    // Update all tasks with their new positions
    for (const updatedTask of tasksWithUpdatedPositions) {
      await updateTask(updatedTask);
    }
      
    // Add cooldown to prevent polling interference
    setDragCooldown(true);
    setTimeout(() => {
      setDragCooldown(false);
      // Reset WebSocket flag after drag operation completes
      if (window.setJustUpdatedFromWebSocket) {
        window.setJustUpdatedFromWebSocket(false);
      }
      // Note: We don't refresh immediately to preserve the optimistic update
      // The next poll will sync the state if needed
    }, DRAG_COOLDOWN_DURATION);
  } catch (error) {
    // console.error('❌ Failed to reorder tasks:', error);
    await refreshBoardData();
  }
};

/**
 * Handles moving a task from one column to another
 * @param task - The task being moved
 * @param sourceColumnId - The ID of the source column
 * @param targetColumnId - The ID of the target column
 * @param targetIndex - The index position in the target column
 * @param columns - Current columns state
 * @param setColumns - Function to update columns state
 * @param setDragCooldown - Function to set drag cooldown flag
 * @param refreshBoardData - Function to refresh board data on error
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
  
  if (!sourceColumn || !targetColumn) return;

  // Sort target column tasks by position for proper insertion
  const sortedTargetTasks = [...targetColumn.tasks].sort((a, b) => (a.position || 0) - (b.position || 0));
  
  // Remove from source
  const sourceTasks = sourceColumn.tasks.filter(t => t.id !== task.id);
  
  // Insert into target at the specified index position
  const updatedTask = { ...task, columnId: targetColumnId, position: targetIndex };
  sortedTargetTasks.splice(targetIndex, 0, updatedTask);

  // Update positions for both columns - use simple sequential indices
  // First sort the source tasks by their current position, then assign new sequential positions
  const sortedSourceTasks = [...sourceTasks].sort((a, b) => (a.position || 0) - (b.position || 0));
  const updatedSourceTasks = sortedSourceTasks.map((task, idx) => ({
      ...task,
    position: idx
  }));
  
  const updatedTargetTasks = sortedTargetTasks.map((task, idx) => ({
    ...task,
    position: idx
  }));

  // Update UI optimistically
  setColumns(prev => ({
    ...prev,
    [sourceColumnId]: {
      ...sourceColumn,
      tasks: updatedSourceTasks
    },
    [targetColumnId]: {
      ...targetColumn,
      tasks: updatedTargetTasks
    }
  }));

  // Update database - do this sequentially to avoid race conditions
  try {
    // Find the moved task in the final updatedTargetTasks array (with correct position)
    const finalMovedTask = updatedTargetTasks.find(t => t.id === task.id);
    if (!finalMovedTask) {
      throw new Error('Could not find moved task in updated target tasks');
    }
    
    // Step 1: Update the moved task to new column and position
      await updateTask(finalMovedTask);
      
    // Step 2: Update all source column tasks (sequential positions)
    for (const task of updatedSourceTasks) {
      await updateTask(task);
    }
      
    // Step 3: Update all target column tasks (except the moved one)
    for (const task of updatedTargetTasks.filter(t => t.id !== finalMovedTask.id)) {
      await updateTask(task);
    }
      
      
    // Add cooldown to prevent polling interference
    setDragCooldown(true);
    setTimeout(() => {
      setDragCooldown(false);
      // Note: We don't refresh immediately to preserve the optimistic update
      // The next poll will sync the state if needed
    }, DRAG_COOLDOWN_DURATION);
  } catch (error) {
    // console.error('Failed to update cross-column move:', error);
    // On error, we do want to refresh to get the correct state
    await refreshBoardData();
  }
};

