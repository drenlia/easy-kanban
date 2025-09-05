import React from 'react';
import { 
  DndContext, 
  DragEndEvent, 
  DragStartEvent, 
  DragOverEvent, 
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { Task, Column, Board } from '../../types';

interface SimpleDragDropManagerProps {
  children: React.ReactNode;
  currentBoardId: string;
  columns: { [key: string]: Column };
  boards: Board[];
  onTaskMove: (taskId: string, targetColumnId: string, position: number) => Promise<void>;
  onTaskMoveToDifferentBoard: (taskId: string, targetBoardId: string) => Promise<void>;
  onColumnReorder: (columnId: string, newPosition: number) => Promise<void>;
  // Callbacks to sync with external state
  onDraggedTaskChange?: (task: Task | null) => void;
  onDraggedColumnChange?: (column: Column | null) => void;
  onBoardTabHover?: (isHovering: boolean) => void;
  onDragPreviewChange?: (preview: { targetColumnId: string; insertIndex: number } | null) => void;
}

export const SimpleDragDropManager: React.FC<SimpleDragDropManagerProps> = ({
  children,
  currentBoardId,
  columns,
  boards,
  onTaskMove,
  onTaskMoveToDifferentBoard,
  onColumnReorder,
  onDraggedTaskChange,
  onDraggedColumnChange,
  onBoardTabHover,
  onDragPreviewChange
}) => {

  const handleDragStart = (event: DragStartEvent) => {
    const activeData = event.active.data?.current;
    
    // Reset all states at drag start to ensure clean state
    onBoardTabHover?.(false);
    onDragPreviewChange?.(null);
    
    if (activeData?.type === 'task') {
      const task = activeData.task as Task;
      onDraggedTaskChange?.(task);
      // Reduced console noise
    } else if (activeData?.type === 'column') {
      const column = activeData.column as Column;
      onDraggedColumnChange?.(column);
      // Reduced console noise
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over, active } = event;
    
    // If no over target, clear all states
    if (!over) {
      onBoardTabHover?.(false);
      onDragPreviewChange?.(null);
      return;
    }
    
    // Detect if we're hovering over a board tab
    if (over.data?.current?.type === 'board') {
      console.log('🏷️ Board tab hover: TRUE');
      onBoardTabHover?.(true);
      onDragPreviewChange?.(null); // Clear column preview when over board tab
      return;
    } else {
      // Always clear board tab hover when not over a board tab
      console.log('🏷️ Board tab hover: FALSE');
      onBoardTabHover?.(false);
    }

    // Update drag preview for visual feedback (only for task drags)
    const activeData = active?.data?.current;
    if (activeData?.type === 'task' && over) {
      const overData = over.data?.current;
      
      if (overData?.type === 'task') {
        // Hovering over another task - show insertion point
        const targetTask = overData.task;
        onDragPreviewChange?.(targetTask ? {
          targetColumnId: targetTask.columnId,
          insertIndex: targetTask.position || 0
        } : null);
      } else if (overData?.type === 'column-top') {
        // Hovering over column top - insert at position 0
        onDragPreviewChange?.({
          targetColumnId: overData.columnId,
          insertIndex: 0
        });
      } else if (overData?.type === 'column-bottom') {
        // Hovering over column bottom - insert at end
        const targetColumn = columns[overData.columnId];
        onDragPreviewChange?.({
          targetColumnId: overData.columnId,
          insertIndex: targetColumn ? targetColumn.tasks.length : 0
        });
      } else if (overData?.type === 'column') {
        // Hovering over column area - insert at end
        const targetColumnId = overData.columnId || over.id as string;
        const targetColumn = columns[targetColumnId];
        onDragPreviewChange?.({
          targetColumnId,
          insertIndex: targetColumn ? targetColumn.tasks.length : 0
        });
      } else {
        onDragPreviewChange?.(null);
      }
    } else {
      onDragPreviewChange?.(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    console.log('🎯 Enhanced Drag End:', { 
      activeId: active.id, 
      overId: over.id,
      activeData: active.data?.current,
      overData: over.data?.current 
    });

    try {
      const activeData = active.data?.current;
      const overData = over.data?.current;

      if (activeData?.type === 'task') {
        // Handle task moves
        const task = activeData.task as Task;
        
        if (overData?.type === 'board' && overData.boardId !== currentBoardId) {
          // Cross-board move
          console.log('🔄 Cross-board move:', task.id, '→', overData.boardId);
          await onTaskMoveToDifferentBoard(task.id, overData.boardId);
        } else {
          // Same board move - enhanced position calculation
          let targetColumnId = task.columnId; // default to same column
          let position = task.position || 0;
          
          // **SIMPLIFIED and RELIABLE position calculation**
          if (overData?.type === 'task') {
            // Dropping on another task - insert at that task's position
            const targetTask = overData.task;
            targetColumnId = targetTask.columnId;
            position = targetTask.position || 0;
          } else if (overData?.type === 'column-top') {
            // Dropping at top of column
            targetColumnId = overData.columnId;
            position = 0;
          } else if (overData?.type === 'column-bottom') {
            // Dropping at bottom of column
            targetColumnId = overData.columnId;
            const targetColumn = columns[targetColumnId];
            position = targetColumn ? targetColumn.tasks.length : 0;
          } else if (overData?.type === 'column') {
            // Dropping in column area - append to end
            targetColumnId = overData.columnId || over.id as string;
            const targetColumn = columns[targetColumnId];
            position = targetColumn ? targetColumn.tasks.length : 0;
          } else if (columns[over.id as string]) {
            // Dropping directly on column by ID
            targetColumnId = over.id as string;
            const targetColumn = columns[targetColumnId];
            position = targetColumn ? targetColumn.tasks.length : 0;
          }
          
          // **ENHANCED VALIDATION: Skip redundant/micro-movements**
          const sourcePosition = task.position || 0;
          const isSameColumn = targetColumnId === task.columnId;
          const isSamePosition = sourcePosition === position;
          
          if (isSameColumn && isSamePosition) {
            console.log('⏭️ Skipping redundant move - same position');
            return;
          }
          
          // For same-column moves, ensure there's meaningful position change
          if (isSameColumn && Math.abs(sourcePosition - position) < 1) {
            console.log('⏭️ Skipping micro-movement - position diff too small');
            return;
          }

          // Only log meaningful moves to reduce noise
          if (!isSameColumn || Math.abs(sourcePosition - position) > 1) {
            console.log('🔄 Valid move:', {
              taskId: task.id,
              from: `${task.columnId}[${sourcePosition}]`,
              to: `${targetColumnId}[${position}]`
            });
          }
          
          await onTaskMove(task.id, targetColumnId, position);
        }
      } else if (activeData?.type === 'column') {
        // Handle column reordering
        const column = activeData.column as Column;
        if (overData?.type === 'column' && overData.column?.id !== column.id) {
          console.log('🔄 Column reorder:', column.id, '→ position', overData.column.position);
          await onColumnReorder(column.id, overData.column.position);
        }
      }
    } catch (error) {
      console.error('❌ Drag operation failed:', error);
    } finally {
      // Clear drag states when drag ends
      onDraggedTaskChange?.(null);
      onDraggedColumnChange?.(null);
      onBoardTabHover?.(false);
      onDragPreviewChange?.(null);
      console.log('🏁 All states cleared - board tab hover reset to FALSE');
    }
  };

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      collisionDetection={closestCorners}
      // Add movement thresholds to prevent micro-movements
      sensors={[
        useSensor(PointerSensor, {
          activationConstraint: {
            distance: 8, // Require 8px movement before starting drag
          },
        }),
        useSensor(KeyboardSensor),
      ]}
    >
      {children}
    </DndContext>
  );
};

export default SimpleDragDropManager;
