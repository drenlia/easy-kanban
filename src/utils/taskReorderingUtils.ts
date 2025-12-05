/**
 * Utility functions for task reordering within and across columns
 */

import { Task, Columns } from '../types';
import { updateTask, batchUpdateTaskPositions } from '../api';
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

  // console.log('🔄 handleSameColumnReorder called:', {
  //   taskId: task.id,
  //   taskTitle: task.title,
  //   taskPosition: task.position,
  //   columnId,
  //   newIndex,
  //   currentIndex,
  //   columnTasksCount: columnTasks.length,
  //   columnTasks: columnTasks.map(t => ({ id: t.id, title: t.title, position: t.position }))
  // });

  // Check if reorder is actually needed
  // BUT: Allow reordering when dropping on another task (even if same position)
  // This enables proper swapping of tasks at the same position
  if (currentIndex === newIndex) {
      console.log('🔄 No reorder needed - currentIndex === newIndex:', currentIndex);
      return;
  }

  // Store previous state for rollback on error
  const previousColumnState = {
    ...columns[columnId],
    tasks: [...columnTasks]
  };

  // Optimistic update - reorder in UI immediately
  const oldIndex = currentIndex;
  const reorderedTasks = arrayMove(columnTasks, oldIndex, newIndex);
  
  // Recalculate positions for all tasks in the group
  const tasksWithUpdatedPositions = reorderedTasks.map((t, index) => ({
    ...t,
    position: index
  }));
  
  // NOTE: We don't set the flag here anymore
  // The WebSocket handler will set it when the first update arrives
  // This ensures WebSocket updates are processed correctly
  
  setColumns(prev => ({
    ...prev,
    [columnId]: {
      ...prev[columnId],
      tasks: tasksWithUpdatedPositions
    }
  }));

  // Send all updated tasks with their new positions to backend (batch update)
  try {
    // Use batch update endpoint for better performance
    const updates = tasksWithUpdatedPositions.map(task => ({
      taskId: task.id,
      position: task.position,
      columnId: task.columnId
    }));
    
    await batchUpdateTaskPositions(updates);
      
    // Add cooldown to prevent polling interference
    setDragCooldown(true);
    setTimeout(() => {
      setDragCooldown(false);
      // Note: We don't refresh immediately to preserve the optimistic update
      // The WebSocket updates will sync the state correctly
    }, DRAG_COOLDOWN_DURATION);
  } catch (error) {
    // Rollback optimistic update on error
    console.error('❌ Failed to reorder tasks, rolling back:', error);
    setColumns(prev => ({
      ...prev,
      [columnId]: previousColumnState
    }));
    
    // Try to refresh from server, but don't wait for it (it might also fail)
    refreshBoardData().catch(() => {
      // Server refresh also failed, but we've already rolled back the UI
    });
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

  // Store previous state for rollback on error
  const previousSourceColumnState = {
    ...sourceColumn,
    tasks: [...sourceColumn.tasks]
  };
  const previousTargetColumnState = {
    ...targetColumn,
    tasks: [...targetColumn.tasks]
  };

  // Update UI optimistically
  // NOTE: We don't set the WebSocket flag here - let the WebSocket handler set it
  // This ensures WebSocket updates are processed correctly and can fix any issues with the optimistic update
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

  // Update database using batch endpoint for better performance
  try {
    // Collect all position updates (moved task + source column tasks + target column tasks)
    const updates = [
      // The moved task
      {
        taskId: task.id,
        position: updatedTargetTasks.find(t => t.id === task.id)?.position || targetIndex,
        columnId: targetColumnId
      },
      // All source column tasks
      ...updatedSourceTasks.map(t => ({
        taskId: t.id,
        position: t.position,
        columnId: sourceColumnId
      })),
      // All target column tasks (except the moved one, already included above)
      ...updatedTargetTasks
        .filter(t => t.id !== task.id)
        .map(t => ({
          taskId: t.id,
          position: t.position,
          columnId: targetColumnId
        }))
    ];
    
    // Single batch update instead of multiple individual updates
    await batchUpdateTaskPositions(updates);
      
    // Add cooldown to prevent polling interference
    setDragCooldown(true);
    setTimeout(() => {
      setDragCooldown(false);
      // Note: We don't refresh immediately to preserve the optimistic update
      // The WebSocket updates will sync the state correctly
    }, DRAG_COOLDOWN_DURATION);
  } catch (error) {
    // Rollback optimistic update on error
    console.error('❌ Failed to update cross-column move, rolling back:', error);
    setColumns(prev => ({
      ...prev,
      [sourceColumnId]: previousSourceColumnState,
      [targetColumnId]: previousTargetColumnState
    }));
    
    // Try to refresh from server, but don't wait for it (it might also fail)
    refreshBoardData().catch(() => {
      // Server refresh also failed, but we've already rolled back the UI
    });
  }
};

