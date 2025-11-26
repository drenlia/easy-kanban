import React, { useRef, useState, useEffect } from 'react';
import { 
  DndContext, 
  DragEndEvent, 
  DragStartEvent, 
  DragOverEvent, 
  closestCorners,
  pointerWithin,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { Task, Column, Board } from '../../types';
import { resetDndGlobalState } from '../../utils/globalDndState';

interface SimpleDragDropManagerProps {
  children: React.ReactNode;
  currentBoardId: string;
  columns: { [key: string]: Column };
  boards: Board[];
  isOnline?: boolean; // Network status - disable dragging when offline
  onTaskMove: (taskId: string, targetColumnId: string, position: number) => Promise<void>;
  onTaskMoveToDifferentBoard: (taskId: string, targetBoardId: string) => Promise<void>;
  onColumnReorder: (columnId: string, newPosition: number) => Promise<void>;
  // Callbacks to sync with external state
  onDraggedTaskChange?: (task: Task | null) => void;
  onDraggedColumnChange?: (column: Column | null) => void;
  onBoardTabHover?: (isHovering: boolean) => void;
  onDragPreviewChange?: (preview: { targetColumnId: string; insertIndex: number; isCrossColumn?: boolean } | null) => void;
}

// Custom collision detection that prioritizes column areas over board tabs
const customCollisionDetection = (args: any) => {
  // Check if we're dragging a column - if so, ignore task collisions
  const activeData = args.active?.data?.current;
  const isDraggingColumn = activeData?.type === 'column';
  
  // Get column IDs for direct ID matching (not just data.type)
  const columnIds = isDraggingColumn && args.droppableContainers 
    ? args.droppableContainers
        .filter((container: any) => {
          const data = container.data?.current;
          return data?.type === 'column' || container.id && !container.id.toString().includes('-middle') && !container.id.toString().includes('-drop');
        })
        .map((container: any) => container.id)
    : [];
  
  // Get all possible collisions
  const pointerCollisions = pointerWithin(args);
  const cornerCollisions = closestCorners(args);
  
  // CRITICAL FIX: Prioritize pointer collisions over corner collisions
  // This prevents distant empty columns from interfering with intended targets
  const columnCollisions = pointerCollisions.filter((collision: any) => {
    const data = collision.data?.current;
    // Check both data.type AND collision.id against column IDs
    // Note: column-bottom is for tasks only, not columns
    const isColumnType = data?.type === 'column' || 
           data?.type === 'column-top' || 
           data?.type === 'board-area';
    const isColumnId = columnIds.length > 0 && columnIds.includes(collision.id);
    return isColumnType || isColumnId || data?.type === 'task';
  });
  
  // If we have pointer-based column collisions, use only those (most precise)
  if (columnCollisions.length > 0) {
    // CRITICAL FIX: When dragging a column, filter out task collisions
    // Tasks should not interfere with column-to-column drag operations
    if (isDraggingColumn) {
      // Only allow column-type collisions when dragging a column
      // Check both data.type AND collision.id against column IDs
      // Note: column-bottom and column-middle are for tasks only, not columns
      const columnOnlyCollisions = columnCollisions.filter((collision: any) => {
        const data = collision.data?.current;
        const isColumnType = data?.type === 'column' || 
               data?.type === 'column-top' || 
               data?.type === 'board-area';
        const isColumnId = columnIds.length > 0 && columnIds.includes(collision.id);
        // Explicitly exclude 'task', 'column-middle', and 'column-bottom' type collisions
        return isColumnType || isColumnId;
      });
      
      // If we found column collisions, use them
      if (columnOnlyCollisions.length > 0) {
        return columnOnlyCollisions;
      }
      // CRITICAL: If dragging a column and no column collisions found, return empty array
      // This prevents tasks from being detected as drop targets
      return [];
    } else {
      // When dragging a task, prioritize task collisions over empty columns
      const taskCollisions = columnCollisions.filter((collision: any) => {
        return collision.data?.current?.type === 'task';
      });
      
      // If we have task collisions, use only those (most specific)
      if (taskCollisions.length > 0) {
        return taskCollisions;
      }
    }
    
    // Otherwise use all pointer-based collisions (only for task drags)
    return columnCollisions;
  }
  
  // Fallback to corner-based collisions only if no pointer collisions
  // Note: column-bottom is for tasks only, not columns
  const cornerColumnCollisions = cornerCollisions.filter((collision: any) => {
    const data = collision.data?.current;
    return data?.type === 'column' || 
           data?.type === 'column-top' || 
           data?.type === 'board-area' || 
           data?.type === 'task';
  });
  
  if (cornerColumnCollisions.length > 0) {
    // When dragging a column, filter out task collisions from corner collisions too
    if (isDraggingColumn) {
      const cornerColumnOnlyCollisions = cornerColumnCollisions.filter((collision: any) => {
        const data = collision.data?.current;
        // Note: column-bottom and column-middle are for tasks only, not columns
        return data?.type === 'column' || 
               data?.type === 'column-top' || 
               data?.type === 'board-area';
        // Explicitly exclude 'task', 'column-middle', and 'column-bottom' type collisions
      });
      
      if (cornerColumnOnlyCollisions.length > 0) {
        return cornerColumnOnlyCollisions;
      }
      // CRITICAL: If dragging a column and no column collisions found, return empty array
      // This prevents tasks from being detected as drop targets
      return [];
    } else {
      // When dragging a task, prioritize task collisions
      const cornerTaskCollisions = cornerColumnCollisions.filter((collision: any) => {
        return collision.data?.current?.type === 'task';
      });
      
      if (cornerTaskCollisions.length > 0) {
        return cornerTaskCollisions;
      }
    }
    
    return cornerColumnCollisions;
  }
  
  // Only consider board tabs if there are absolutely NO column collisions
  // AND we're clearly over the board tab area (not just near it)
  const strictBoardCollisions = pointerCollisions.filter((collision: any) => {
    const data = collision.data?.current;
    return data?.type === 'board' && data?.boardId; // Board tabs only
  });
  
  // Be EXTREMELY strict about board tab detection
  // Only allow board tabs if:
  // 1. It's the ONLY pointer collision AND
  // 2. There are NO corner collisions with columns/tasks
  const nonBoardCornerCollisions = cornerCollisions.filter((collision: any) => {
    const data = collision.data?.current;
    return data?.type !== 'board';
  });
  
  // Be EXTREMELY restrictive - require exactly ONE board collision
  if (strictBoardCollisions.length === 1 && 
      pointerCollisions.length === 1 &&
      nonBoardCornerCollisions.length === 0) {
    return strictBoardCollisions;
  }
  
  // Always prefer non-board collisions
  if (nonBoardCornerCollisions.length > 0) {
    // If dragging a column, filter out tasks from non-board collisions too
    if (isDraggingColumn) {
      const filteredNonBoard = nonBoardCornerCollisions.filter((collision: any) => {
        const data = collision.data?.current;
        // Note: column-bottom and column-middle are for tasks only, not columns
        return data?.type === 'column' || 
               data?.type === 'column-top' || 
               data?.type === 'board-area';
      });
      if (filteredNonBoard.length > 0) {
        return filteredNonBoard;
      }
      return [];
    }
    return nonBoardCornerCollisions;
  }
  
  // Last resort - return original collisions (but filter tasks if dragging column)
  if (isDraggingColumn) {
    const filteredCorner = cornerCollisions.filter((collision: any) => {
      const data = collision.data?.current;
      // Note: column-bottom and column-middle are for tasks only, not columns
      return data?.type === 'column' || 
             data?.type === 'column-top' || 
             data?.type === 'board-area';
    });
    if (filteredCorner.length > 0) {
      return filteredCorner;
    }
    return [];
  }
  return cornerCollisions;
};

export const SimpleDragDropManager: React.FC<SimpleDragDropManagerProps> = ({
  children,
  currentBoardId,
  columns,
  boards,
  isOnline = true,
  onTaskMove,
  onTaskMoveToDifferentBoard,
  onColumnReorder,
  onDraggedTaskChange,
  onDraggedColumnChange,
  onBoardTabHover,
  onDragPreviewChange
}) => {
  // Y-coordinate based tab area detection
  const [isHoveringBoardTabDelayed, setIsHoveringBoardTabDelayed] = useState(false);
  const [currentMouseY, setCurrentMouseY] = useState(0);
  const [tabAreaBounds, setTabAreaBounds] = useState({ top: 0, bottom: 80 }); // Dynamic tab bounds
  const [usingYCoordinateDetection, setUsingYCoordinateDetection] = useState(false); // Flag to prioritize Y-detection

  // Track mouse Y position for tab area detection
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setCurrentMouseY(e.clientY);
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);


  const handleDragStart = (event: DragStartEvent) => {
    // Block dragging when offline
    if (!isOnline) {
      console.log('🚫 Drag blocked - network offline');
      return;
    }
    
    const activeData = event.active.data?.current;
    
    // Detect tab container bounds dynamically
    const detectTabBounds = () => {
      // Look for board tabs container - try multiple selectors
      const tabSelectors = [
        '[class*="board-tabs"]',
        '[class*="BoardTabs"]', 
        '.flex.items-center.space-x-1.overflow-x-auto',
        'div:has(> button[id^="board-"])',
        // Fallback: find any element containing board tabs
        'button[id^="board-"]'
      ];
      
      let tabContainer = null;
      for (const selector of tabSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          tabContainer = element.tagName === 'BUTTON' ? element.parentElement : element;
          break;
        }
      }
      
      if (tabContainer) {
        const rect = tabContainer.getBoundingClientRect();
        const bounds = { 
          top: rect.top - 30, // Extend 30px above the tabs for more room
          bottom: rect.bottom 
        };
        setTabAreaBounds(bounds);
        return bounds;
      } else {
        // console.warn('⚠️ Could not find tab container, using fallback bounds');
        const fallback = { top: 0, bottom: 80 };
        setTabAreaBounds(fallback);
        return fallback;
      }
    };
    
    // Detect bounds at drag start
    const bounds = detectTabBounds();
    
    // Reset all states at drag start to ensure clean state
    onBoardTabHover?.(false);
    onDragPreviewChange?.(null);
    
    // Reset tab area state
    setIsHoveringBoardTabDelayed(false);
    
    // Safety: Force reset global DND state in case it got stuck
    resetDndGlobalState();
    
    
    if (activeData?.type === 'task') {
      const task = activeData.task as Task;
      const sourceColumn = columns[task.columnId];
      const sourceTaskCount = sourceColumn ? sourceColumn.tasks.length : 0;
      
      //   taskId: task.id,
      //   sourceColumnId: task.columnId,
      //   sourceTaskCount,
      //   isSingleTaskColumn: sourceTaskCount === 1
      // });
      
      onDraggedTaskChange?.(task);
    } else if (activeData?.type === 'column') {
      const column = activeData.column as Column;
      onDraggedColumnChange?.(column);
      // Reduced console noise
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over, active } = event;
    
    // FIRST: Check for mouse-based tab area detection (before any other logic)
    const isTaskDrag = active.data?.current?.type === 'task';
    
    if (isTaskDrag) {
      // Pure Y-coordinate based detection using dynamic tab bounds
      const isInTabArea = currentMouseY >= tabAreaBounds.top && currentMouseY <= tabAreaBounds.bottom;
      
      // Set flag to indicate Y-coordinate detection is active
      setUsingYCoordinateDetection(true);
      
      if (isInTabArea && !isHoveringBoardTabDelayed) {
        // mouseY: currentMouseY, 
        // tabTop: tabAreaBounds.top, 
        // tabBottom: tabAreaBounds.bottom 
        // });
        setIsHoveringBoardTabDelayed(true);
        onBoardTabHover?.(true);
        onDragPreviewChange?.(null);
      } else if (!isInTabArea && isHoveringBoardTabDelayed) {
        // mouseY: currentMouseY, 
        // tabTop: tabAreaBounds.top, 
        // tabBottom: tabAreaBounds.bottom 
        // });
        setIsHoveringBoardTabDelayed(false);
        onBoardTabHover?.(false);
      }
    } else {
      // Reset flag when not dragging tasks
      setUsingYCoordinateDetection(false);
    }
    
    // Debug: Log ALL drag over events to see if they're firing
    // console.log('📍 Drag Over Event:', {
    // hasOver: !!over,
    // overId: over?.id,
    // activeId: active.id
    // });
    
    // If no over target, clear all states
    if (!over) {
      onBoardTabHover?.(false);
      onDragPreviewChange?.(null);
      return;
    }
    
    // Only detect board tab hover if we're actually dragging a task (not a column)
    const activeData = active?.data?.current;
    // isTaskDrag already declared above
    
    // Debug: Always log the activeData to see what's happening
    // Active data debug removed for performance
    
    // Debug collision detection for inconsistent behavior
    if (isTaskDrag) {
      const sourceColumn = columns[activeData?.task?.columnId];
      const sourceTaskCount = sourceColumn ? sourceColumn.tasks.length : 0;
      // console.log('🎯 Drag Over Debug:', {
      // overId: over.id,
      // overType: over.data?.current?.type,
      // activeTaskId: active.id,
      // activeColumnId: activeData?.task?.columnId,
      // targetColumnId: over.data?.current?.columnId || 'unknown',
      // sourceTaskCount: sourceTaskCount,
      // isSingleTaskColumn: sourceTaskCount === 1,
      // draggedTaskId: activeData?.task?.id
      // });
    } else {
      // console.log('❌ NOT a task drag - skipping collision detection');
    }
    
    // DEBUG: Only log when we detect board type (should only be tabs)
    if (isTaskDrag && over.data?.current?.type === 'board') {
      // console.log('🔴 BOARD TYPE DETECTED (COMPLETELY DISABLED - Y-coords only):', {
      // type: over.data.current.type,
      // boardId: over.data.current.boardId,
      // overId: over.id,
      // element: over.id,
      // yCoordPriority: usingYCoordinateDetection
      // });
      // NEVER process collision-based board tab detection - Y-coordinates only
      return;
    }
    

    // Update drag preview for visual feedback (only for task drags)
    if (isTaskDrag && over) {
      const overData = over.data?.current;
      
      // console.log('🔍 Preview Debug - Over Data:', {
      // overId: over.id,
      // overType: overData?.type,
      // hasTask: !!overData?.task,
      // hasColumnId: !!overData?.columnId
      // });
      
      if (overData?.type === 'task') {
        // Hovering over another task - insert BEFORE that task
        const targetTask = overData.task;
        if (targetTask) {
          const targetColumn = columns[targetTask.columnId];
          if (targetColumn) {
            // CRITICAL FIX: Exclude dragged task from preview calculations too
            const draggedTask = active.data?.current?.task;
            const tasksWithoutDragged = targetColumn.tasks.filter(t => t.id !== draggedTask?.id);
            const sortedTasks = tasksWithoutDragged.sort((a, b) => (a.position || 0) - (b.position || 0));
            const taskIndex = sortedTasks.findIndex(t => t.id === targetTask.id);
            
            const isCrossColumn = draggedTask && draggedTask.columnId !== targetTask.columnId;
            
            // console.log('🎯 Task-to-Task Preview:', {
            // targetTaskId: targetTask.id,
            // targetColumnId: targetTask.columnId,
            // totalTasks: targetColumn.tasks.length,
            // tasksExcludingDragged: tasksWithoutDragged.length,
            // insertIndex: taskIndex >= 0 ? taskIndex : 0,
            // isCrossColumn,
            // overId: over.id
            // });
            
            onDragPreviewChange?.({
              targetColumnId: targetTask.columnId,
              insertIndex: taskIndex >= 0 ? taskIndex : 0,
              isCrossColumn
            });
          }
        }
      } else if (overData?.type === 'column-top') {
        // Hovering over column top - insert at position 0
        const draggedTask = active.data?.current?.task;
        const isCrossColumn = draggedTask && draggedTask.columnId !== overData.columnId;
        onDragPreviewChange?.({
          targetColumnId: overData.columnId,
          insertIndex: 0,
          isCrossColumn
        });
      } else if (overData?.type === 'column-bottom') {
        // Hovering over column bottom - insert at end
        const targetColumn = columns[overData.columnId];
        const draggedTask = active.data?.current?.task;
        const isCrossColumn = draggedTask && draggedTask.columnId !== overData.columnId;
        const insertIndex = targetColumn ? 
          targetColumn.tasks.filter(t => t.id !== draggedTask?.id).length : 0;
        
        // console.log('🎯 Column-Bottom Preview (Dedicated Zone):', {
        // targetColumnId: overData.columnId,
        // totalTasks: targetColumn?.tasks.length || 0,
        // insertIndex,
        // isCrossColumn,
        // overId: over.id
        // });
        
        onDragPreviewChange?.({
          targetColumnId: overData.columnId,
          insertIndex,
          isCrossColumn
        });
      } else if (overData?.type === 'column') {
        // Hovering over column area - insert at end
        const targetColumnId = overData.columnId || over.id as string;
        const targetColumn = columns[targetColumnId];
        const draggedTask = active.data?.current?.task;
        const isCrossColumn = draggedTask && draggedTask.columnId !== targetColumnId;
        const insertIndex = targetColumn ? 
          targetColumn.tasks.filter(t => t.id !== draggedTask?.id).length : 0;
        onDragPreviewChange?.({
          targetColumnId,
          insertIndex,
          isCrossColumn
        });
      } else if (overData?.type === 'column-middle' || over.id.toString().includes('-middle')) {
        // Hovering over column middle area - try to be smarter about insertion
        const targetColumnId = overData?.columnId || over.id.toString().replace('-middle', '');
        const targetColumn = columns[targetColumnId];
        const draggedTask = active.data?.current?.task;
        const isCrossColumn = draggedTask && draggedTask.columnId !== targetColumnId;
        
        // For column-middle, insert at end as fallback (excluding dragged task)
        const insertIndex = targetColumn ? 
          targetColumn.tasks.filter(t => t.id !== draggedTask?.id).length : 0;
        
        // console.log('📍 Column-Middle Preview:', {
        // targetColumnId,
        // totalTasks: targetColumn?.tasks.length || 0,
        // tasksExcludingDragged: targetColumn?.tasks.filter(t => t.id !== draggedTask?.id).length || 0,
        // insertIndex,
        // isCrossColumn,
        // overId: over.id
        // });
        
        onDragPreviewChange?.({
          targetColumnId,
          insertIndex,
          isCrossColumn
        });
      } else {
        onDragPreviewChange?.(null);
      }
    } else {
      onDragPreviewChange?.(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    // Block drag completion when offline
    if (!isOnline) {
      console.log('🚫 Drag end blocked - network offline');
      onDraggedTaskChange?.(null);
      onDraggedColumnChange?.(null);
      onBoardTabHover?.(false);
      onDragPreviewChange?.(null);
      return;
    }
    
    const { active, over } = event;

    // console.log('🎯 SimpleDragDropManager handleDragEnd:', {
    //   activeId: active.id,
    //   overId: over?.id,
    //   overData: over?.data?.current,
    //   activeData: active.data?.current
    // });

    if (!over) return;

    // console.log('🎯 Enhanced Drag End:', { 
    // activeId: active.id, 
    // overId: over.id,
    // activeData: active.data?.current,
    // overData: over.data?.current 
    // });
    
    // Debug collision detection
    if (active.data?.current?.type === 'task' && over.data?.current?.type === 'board') {
      // console.log('🎯 Board collision detected:', {
      // taskId: active.id,
      // boardId: over.data.current.boardId,
      // currentBoardId,
      // isDifferentBoard: over.data.current.boardId !== currentBoardId
      // });
    }

    try {
      const activeData = active.data?.current;
      const overData = over.data?.current;
      
      // console.log('🎯 Processing drag end:', {
      //   activeDataType: activeData?.type,
      //   overDataType: overData?.type,
      //   activeTaskId: activeData?.task?.id,
      //   overTaskId: overData?.task?.id
      // });

      if (activeData?.type === 'task') {
        // console.log('🎯 Entering task move logic');
        // Handle task moves
        const task = activeData.task as Task;
        // console.log('🎯 Task data:', { taskId: task.id, taskTitle: task.title, taskColumnId: task.columnId, taskPosition: task.position });
        
        if (overData?.type === 'board' && overData.boardId !== currentBoardId) {
          // Check if Y-coordinate detection should override collision detection
          const isInTabAreaAtDrop = currentMouseY >= tabAreaBounds.top && currentMouseY <= tabAreaBounds.bottom;
          
          if (!isInTabAreaAtDrop) {
            // console.log('🚫 BOARD DROP REJECTED - Y-coordinate outside tab area:', {
            // mouseY: currentMouseY,
            // tabTop: tabAreaBounds.top,
            // tabBottom: tabAreaBounds.bottom,
            // boardId: overData.boardId
            // });
            // Don't execute cross-board move if mouse is outside tab area
            return;
          }
          
          // Cross-board move (only if mouse is actually in tab area)
          // console.log('🔄 Cross-board move (Y-coord approved):', task.id, '→', overData.boardId);
          // console.log('🔄 Cross-board details:', { 
          // taskId: task.id, 
          // targetBoardId: overData.boardId, 
          // currentBoardId,
          // overDataType: overData.type,
          // mouseY: currentMouseY,
          // inTabArea: isInTabAreaAtDrop
          // });
          await onTaskMoveToDifferentBoard(task.id, overData.boardId);
          // console.log('✅ Cross-board move completed');
        } else {
          // console.log('🎯 Same board move - enhanced position calculation');
          // Same board move - enhanced position calculation
          let targetColumnId = task.columnId; // default to same column
          let position = task.position || 0;
          
          // **FIXED position calculation - exclude dragged task from calculations**
          if (overData?.type === 'task') {
            // console.log('🎯 Dropping on another task');
            // Dropping on another task - insert BEFORE that task
            const targetTask = overData.task;
            targetColumnId = targetTask.columnId;
            // console.log('🎯 Target task data:', { targetTaskId: targetTask.id, targetTaskTitle: targetTask.title, targetTaskColumnId: targetTask.columnId, targetTaskPosition: targetTask.position });
            
            // For same-column moves: use target task position directly
            // For cross-column moves: use filtered array index for insertion
            if (targetColumnId === task.columnId) {
              // console.log('🎯 Same column move - inserting BEFORE target task');
              // Same column: insert BEFORE the target task
              // When dropping on another task, use a fractional position to ensure reordering
              // This prevents the "same position" validation from skipping the move
              position = (targetTask.position || 0) + 0.5;
              // console.log('🎯 Calculated position (fractional for reordering):', position);
            } else {
              // Cross column: use insertion index in filtered array
              const targetColumn = columns[targetColumnId];
              if (targetColumn) {
                const tasksWithoutDragged = targetColumn.tasks.filter(t => t.id !== task.id);
                const sortedTasks = tasksWithoutDragged.sort((a, b) => (a.position || 0) - (b.position || 0));
                const taskIndex = sortedTasks.findIndex(t => t.id === targetTask.id);
                position = taskIndex >= 0 ? taskIndex : 0;
              } else {
                position = 0;
              }
            }
          } else if (overData?.type === 'column-top') {
            // Dropping at top of column
            targetColumnId = overData.columnId;
            position = 0;
          } else if (overData?.type === 'column-bottom') {
            // Dropping at bottom of column
            targetColumnId = overData.columnId;
            const targetColumn = columns[targetColumnId];
            if (targetColumn) {
              // CRITICAL FIX: Exclude dragged task when calculating end position
              const tasksWithoutDragged = targetColumn.tasks.filter(t => t.id !== task.id);
              position = tasksWithoutDragged.length;
            } else {
              position = 0;
            }
          } else if (overData?.type === 'column') {
            // Dropping in column area - append to end
            targetColumnId = overData.columnId || over.id as string;
            const targetColumn = columns[targetColumnId];
            if (targetColumn) {
              // CRITICAL FIX: Exclude dragged task when calculating end position
              const tasksWithoutDragged = targetColumn.tasks.filter(t => t.id !== task.id);
              position = tasksWithoutDragged.length;
            } else {
              position = 0;
            }
          } else if (overData?.type === 'column-middle' || over.id.toString().includes('-middle')) {
            // CRITICAL FIX: Handle column-middle drops (missing handler!)
            // This is what happens when dropping at the bottom of multi-task columns
            targetColumnId = overData?.columnId || over.id.toString().replace('-middle', '');
            const targetColumn = columns[targetColumnId];
            if (targetColumn) {
              // Insert at end (excluding dragged task)
              const tasksWithoutDragged = targetColumn.tasks.filter(t => t.id !== task.id);
              position = tasksWithoutDragged.length;
              
              // console.log('📍 Column-Middle Drop:', {
              // targetColumnId,
              // totalTasks: targetColumn.tasks.length,
              // tasksExcludingDragged: tasksWithoutDragged.length,
              // finalPosition: position
              // });
            } else {
              position = 0;
            }
          } else if (columns[over.id as string]) {
            // Dropping directly on column by ID
            targetColumnId = over.id as string;
            const targetColumn = columns[targetColumnId];
            if (targetColumn) {
              // CRITICAL FIX: Exclude dragged task when calculating end position
              const tasksWithoutDragged = targetColumn.tasks.filter(t => t.id !== task.id);
              position = tasksWithoutDragged.length;
            } else {
              position = 0;
            }
          }
          
          // **ENHANCED VALIDATION: Skip redundant/micro-movements**
          const sourcePosition = task.position || 0;
          const isSameColumn = targetColumnId === task.columnId;
          const isSamePosition = sourcePosition === position;
          
          // console.log('🎯 Validation check:', {
          //   sourcePosition,
          //   targetPosition: position,
          //   isSameColumn,
          //   isSamePosition,
          //   willSkip: isSameColumn && isSamePosition
          // });
          
          // console.log('🔢 Position Calculation Debug:', {
          // taskId: task.id,
          // sourceColumnId: task.columnId,
          // targetColumnId,
          // sourcePosition,
          // targetPosition: position,
          // isSameColumn,
          // isSamePosition,
          // willSkip: isSameColumn && isSamePosition
          // });
          
          // FIXED: Don't skip same-position moves when dropping on another task
          // This allows reordering tasks that are at the same position
          if (isSameColumn && isSamePosition && overData?.type !== 'task') {
            console.log('⏭️ Skipping redundant move - same position (not dropping on task)');
            return;
          }
          
          // ADDITIONAL FIX: Don't skip same-position moves when dropping on another task
          // The server-side reordering logic will handle position updates correctly
          if (isSameColumn && isSamePosition && overData?.type === 'task') {
            // console.log('🎯 Same position drop on task - allowing move for reordering');
            // Don't return here - let the move proceed
          }
          
          // For same-column moves, ensure there's meaningful position change
          // BUT: Don't skip when dropping on another task (allows reordering)
          if (isSameColumn && Math.abs(sourcePosition - position) < 1 && overData?.type !== 'task') {
            console.log('⏭️ Skipping micro-movement - position diff too small:', {
              sourcePosition,
              position,
              diff: Math.abs(sourcePosition - position)
            });
            return;
          }

          // Always log the move attempt for debugging
          // console.log('🔄 Attempting move:', {
          // taskId: task.id,
          // from: `${task.columnId}[${sourcePosition}]`,
          // to: `${targetColumnId}[${position}]`,
          // isCrossColumn: !isSameColumn
          // });
          
          await onTaskMove(task.id, targetColumnId, position);
          
          // console.log('✅ Move completed successfully');
        }
      } else if (activeData?.type === 'column') {
        // Handle column reordering
        const column = activeData.column as Column;
        
        // CRITICAL FIX: Check if over.id directly matches a column ID
        // This handles cases where collision detection returns tasks but we can find the column
        const overId = over?.id as string;
        const isOverColumnId = overId && columns[overId];
        
        // If over.id is a column ID, use it directly
        if (isOverColumnId && overId !== column.id) {
          const targetColumn = columns[overId];
          if (targetColumn) {
            const targetPosition = Math.floor(targetColumn.position);
            console.log('🔄 Column reorder via column ID:', column.id, '→ position', targetPosition);
            await onColumnReorder(column.id, targetPosition);
            return;
          }
        }
        
        // Handle column-top drop zone
        if (overData?.type === 'column-top' || (overId && overId.toString().endsWith('-top-drop'))) {
          const targetColumnId = overData?.columnId || overId?.toString().replace('-top-drop', '');
          if (targetColumnId && targetColumnId !== column.id && columns[targetColumnId]) {
            const targetColumn = columns[targetColumnId];
            const targetPosition = Math.floor(targetColumn.position);
            console.log('🔄 Column reorder via top drop zone:', column.id, '→ position', targetPosition);
            await onColumnReorder(column.id, targetPosition);
            return;
          }
        }
        
        // CRITICAL FIX: If we're dragging a column but ended on a task, find the parent column
        // This happens when collision detection fails to filter out tasks, but we can recover
        if (overData?.type === 'task') {
          console.log('⚠️ Column drag ended on task - finding parent column');
          const taskColumnId = overData.task?.columnId || overData.columnId;
          if (taskColumnId && taskColumnId !== column.id) {
            const targetColumn = columns[taskColumnId];
            if (targetColumn) {
              const targetPosition = Math.floor(targetColumn.position);
              console.log('🔄 Column reorder via task parent:', column.id, '→ position', targetPosition);
              await onColumnReorder(column.id, targetPosition);
            }
          }
          return;
        }
        
        // Only process if we dropped on another column (fallback for direct column drops)
        if (overData?.type === 'column' && overData.column?.id !== column.id) {
          // Ensure we use integer positions for reordering
          const targetPosition = Math.floor(overData.column.position);
          // console.log('🔄 Column reorder:', column.id, '→ position', targetPosition);
          await onColumnReorder(column.id, targetPosition);
        }
        // Note: column-middle is for tasks only, not columns, so we don't handle it here
      }
    } catch (error) {
      // console.error('❌ Drag operation failed:', error);
    } finally {
      // Clear drag states when drag ends
      onDraggedTaskChange?.(null);
      onDraggedColumnChange?.(null);
      onBoardTabHover?.(false);
      onDragPreviewChange?.(null);
      
      // Reset tab area state
      setIsHoveringBoardTabDelayed(false);
      
      // console.log('🏁 All states cleared - board tab hover reset to FALSE');
    }
  };

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      collisionDetection={customCollisionDetection}
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
