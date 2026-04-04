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
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
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

export const SimpleDragDropManager: React.FC<SimpleDragDropManagerProps> = React.memo(({
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
  
  // Cache for drag preview to avoid recalculating on every drag over event
  const lastPreviewRef = useRef<{ targetColumnId: string; insertIndex: number; isCrossColumn: boolean } | null>(null);
  const lastOverIdRef = useRef<string | number | null>(null);
  const rafHandleRef = useRef<number | null>(null);
  const lastProcessTimeRef = useRef<number>(0);
  const THROTTLE_MS = 16; // ~60fps max
  
  // Debug: Track drag over call count
  const dragOverCallCountRef = useRef<number>(0);
  const dragOverSkippedCountRef = useRef<number>(0);
  const dragOverProcessedCountRef = useRef<number>(0);

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

  // Safety: Clear dragged column state on mount in case it got stuck
  useEffect(() => {
    onDraggedColumnChange?.(null);
    onDraggedTaskChange?.(null);
  }, []);

  // Configure drag sensors - MUST be at component top level, not in JSX
  // Use distance 0 to activate immediately - this ensures drag works even with re-renders
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 0, // Activate immediately on pointer down
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  
  // Removed console.log to reduce noise

  const handleDragStart = (event: DragStartEvent) => {
    // Reset preview cache on drag start
    lastPreviewRef.current = null;
    lastOverIdRef.current = null;
    
    // Reset counters
    dragOverCallCountRef.current = 0;
    dragOverSkippedCountRef.current = 0;
    dragOverProcessedCountRef.current = 0;
    
    // Block dragging when offline
    if (!isOnline) {
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
    
    dragOverCallCountRef.current++;
    
    // PERFORMANCE: Throttle to max 60fps (16ms between updates)
    const now = performance.now();
    if (now - lastProcessTimeRef.current < THROTTLE_MS) {
      // Skip this update - too soon since last one
      dragOverSkippedCountRef.current++;
      return;
    }
    
    dragOverProcessedCountRef.current++;
    
    // PERFORMANCE: Cancel any pending RAF to avoid queuing multiple updates
    if (rafHandleRef.current !== null) {
      cancelAnimationFrame(rafHandleRef.current);
    }
    
    // PERFORMANCE: Defer expensive operations to next animation frame
    rafHandleRef.current = requestAnimationFrame(() => {
      rafHandleRef.current = null;
      lastProcessTimeRef.current = performance.now();
      
      // FIRST: Check for mouse-based tab area detection (before any other logic)
      const isTaskDrag = active.data?.current?.type === 'task';
      
      if (isTaskDrag) {
        // Pure Y-coordinate based detection using dynamic tab bounds
        const isInTabArea = currentMouseY >= tabAreaBounds.top && currentMouseY <= tabAreaBounds.bottom;
        
        // Set flag to indicate Y-coordinate detection is active
        setUsingYCoordinateDetection(true);
        
        if (isInTabArea && !isHoveringBoardTabDelayed) {
          setIsHoveringBoardTabDelayed(true);
          onBoardTabHover?.(true);
          onDragPreviewChange?.(null);
        } else if (!isInTabArea && isHoveringBoardTabDelayed) {
          setIsHoveringBoardTabDelayed(false);
          onBoardTabHover?.(false);
        }
      } else {
        // Reset flag when not dragging tasks
        setUsingYCoordinateDetection(false);
      }
      
      // If no over target, clear all states
      if (!over) {
        onBoardTabHover?.(false);
        onDragPreviewChange?.(null);
        return;
      }
      
      // Only detect board tab hover if we're actually dragging a task (not a column)
      const activeData = active?.data?.current;
      
      // DEBUG: Only log when we detect board type (should only be tabs)
      if (isTaskDrag && over.data?.current?.type === 'board') {
        // NEVER process collision-based board tab detection - Y-coordinates only
        return;
      }
      
      // Update drag preview for visual feedback (only for task drags)
      // PERFORMANCE: Skip preview calculations for column drags (they don't need preview)
      if (isTaskDrag && over) {
        // PERFORMANCE: Only recalculate if the over target actually changed
        if (lastOverIdRef.current === over.id) {
          // Same target - skip expensive calculations
          return;
        }
        lastOverIdRef.current = over.id;
        
        const overData = over.data?.current;
        const draggedTask = active.data?.current?.task;
        
        if (overData?.type === 'task') {
          // Hovering over another task - insert BEFORE that task
          const targetTask = overData.task;
          if (targetTask) {
            const targetColumn = columns[targetTask.columnId];
            if (targetColumn) {
              // PERFORMANCE: Ultra-fast calculation - count tasks before target position
              // No filtering, no sorting - just count based on position
              const draggedTaskId = draggedTask?.id;
              const targetPosition = targetTask.position || 0;
              const taskCount = targetColumn.tasks.length;
              
              // Simple count - tasks with position < target position (excluding dragged task)
              let insertIndex = 0;
              const startTime = performance.now();
              for (let i = 0; i < taskCount; i++) {
                const t = targetColumn.tasks[i];
                if (t.id === draggedTaskId) continue;
                if ((t.position || 0) < targetPosition) {
                  insertIndex++;
                }
              }
              const calcTime = performance.now() - startTime;
              const isCrossColumn = draggedTask && draggedTask.columnId !== targetTask.columnId;
              
              // Only update if preview actually changed
              const newPreview = {
                targetColumnId: targetTask.columnId,
                insertIndex,
                isCrossColumn
              };
              if (!lastPreviewRef.current || 
                  lastPreviewRef.current.targetColumnId !== newPreview.targetColumnId ||
                  lastPreviewRef.current.insertIndex !== newPreview.insertIndex ||
                  lastPreviewRef.current.isCrossColumn !== newPreview.isCrossColumn) {
                lastPreviewRef.current = newPreview;
                onDragPreviewChange?.(newPreview);
              }
            }
          }
        } else if (overData?.type === 'column-top') {
          // Hovering over column top - insert at position 0
          const isCrossColumn = draggedTask && draggedTask.columnId !== overData.columnId;
          const newPreview = {
            targetColumnId: overData.columnId,
            insertIndex: 0,
            isCrossColumn
          };
          if (!lastPreviewRef.current || 
              lastPreviewRef.current.targetColumnId !== newPreview.targetColumnId ||
              lastPreviewRef.current.insertIndex !== newPreview.insertIndex) {
            lastPreviewRef.current = newPreview;
            onDragPreviewChange?.(newPreview);
          }
        } else if (overData?.type === 'column-bottom' || overData?.type === 'column' || 
                   overData?.type === 'column-middle' || over.id.toString().includes('-middle')) {
          // All column drop zones - insert at end
          const targetColumnId = overData?.columnId || 
                                (over.id.toString().includes('-middle') ? over.id.toString().replace('-middle', '') : over.id as string);
          const targetColumn = columns[targetColumnId];
          const isCrossColumn = draggedTask && draggedTask.columnId !== targetColumnId;
          // PERFORMANCE: Simple count - just use length, subtract 1 if dragged task is in column
          const draggedTaskId = draggedTask?.id;
          const taskCount = targetColumn ? targetColumn.tasks.length : 0;
          let insertIndex = taskCount;
          // Only subtract if dragged task is actually in this column
          if (targetColumn && draggedTaskId) {
            const startTime = performance.now();
            for (let i = 0; i < taskCount; i++) {
              if (targetColumn.tasks[i].id === draggedTaskId) {
                insertIndex--;
                break; // Found it, no need to continue
              }
            }
            const calcTime = performance.now() - startTime;
          }
          
          const newPreview = {
            targetColumnId,
            insertIndex,
            isCrossColumn
          };
          if (!lastPreviewRef.current || 
              lastPreviewRef.current.targetColumnId !== newPreview.targetColumnId ||
              lastPreviewRef.current.insertIndex !== newPreview.insertIndex) {
            lastPreviewRef.current = newPreview;
            onDragPreviewChange?.(newPreview);
          }
        } else {
          if (lastPreviewRef.current !== null) {
            lastPreviewRef.current = null;
            onDragPreviewChange?.(null);
          }
        }
      } else {
        // Column drag or no drag - clear preview
        if (lastPreviewRef.current !== null) {
          lastPreviewRef.current = null;
          onDragPreviewChange?.(null);
        }
      }
    });
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

    console.log('🎯 [handleDragEnd] Called:', {
      activeId: active.id,
      overId: over?.id,
      overDataType: over?.data?.current?.type,
      activeDataType: active.data?.current?.type,
      isOnline
    });

    try {
      if (!over) {
        console.log('⚠️ [handleDragEnd] No over target, returning');
        return;
      }

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
          
          // Helper to parse position as number
          const parsePos = (pos: any): number => typeof pos === 'number' ? pos : parseFloat(pos) || 0;
          
          // **SIMPLIFIED: Calculate target INDEX, not fractional position**
          // After the move, all tasks will be renumbered to clean integers (0, 1, 2, 3...)
          
          // Check if we're dropping on a task - either via overData.type or by checking if over.id is a task ID
          let targetTask: Task | null = null;
          if (overData?.type === 'task' && overData.task) {
            targetTask = overData.task;
            console.log('✅ [handleDragEnd] Found task via overData.type');
          } else if (over.id) {
            // Fallback: over.id might be a task ID when using SortableContext
            // Search all columns to find the task
            for (const column of Object.values(columns)) {
              const foundTask = column.tasks.find(t => t.id === over.id);
              if (foundTask) {
                targetTask = foundTask;
                console.log('✅ [handleDragEnd] Found task via over.id fallback:', over.id);
                break;
              }
            }
          }
          
          if (targetTask) {
            // Dropping on another task - need to determine insert position based on drag direction
            targetColumnId = targetTask.columnId;
            
            // Get all tasks in the column (excluding the dragged task)
            const targetColumn = columns[targetColumnId];
            if (targetColumn) {
              const tasksWithoutDragged = targetColumn.tasks.filter(t => t.id !== task.id);
              const sortedTasks = [...tasksWithoutDragged].sort((a, b) => parsePos(a.position) - parsePos(b.position));
              
              // Find the target task's index in the list without the dragged task
              const targetIndex = sortedTasks.findIndex(t => t.id === targetTask.id);
              
              if (targetIndex < 0) {
                position = 0;
              } else {
                const isSameColumn = targetColumnId === task.columnId;
                
                if (isSameColumn) {
                  // Use sorted list indices so duplicate/stale `position` values still pick the right side (before vs after)
                  const sortedAll = [...targetColumn.tasks].sort(
                    (a, b) => parsePos(a.position) - parsePos(b.position)
                  );
                  const draggedIndexAll = sortedAll.findIndex(t => t.id === task.id);
                  const targetIndexAll = sortedAll.findIndex(t => t.id === targetTask.id);
                  if (draggedIndexAll > targetIndexAll) {
                    position = targetIndex;
                  } else {
                    position = targetIndex + 1;
                  }
                } else {
                  // Cross-column: always insert before target task (at target's current position)
                  position = targetIndex;
                }
              }
              
              console.log('🎯 [Drop on task] Target index:', {
                targetTaskId: targetTask.id,
                targetTaskPos: parsePos(targetTask.position),
                draggedTaskPos: parsePos(task.position),
                targetIndexInList: sortedTasks.findIndex(t => t.id === targetTask.id),
                calculatedPosition: position,
                totalTasks: sortedTasks.length,
                isSameColumn: targetColumnId === task.columnId
              });
            } else {
              position = 0;
            }
          } else if (overData?.type === 'column-top') {
            // Dropping at top of column - index 0
            targetColumnId = overData.columnId;
            position = 0;
          } else if (overData?.type === 'column-bottom') {
            // Dropping at bottom of column - index = number of other tasks
            targetColumnId = overData.columnId;
            const targetColumn = columns[targetColumnId];
            if (targetColumn) {
              const tasksWithoutDragged = targetColumn.tasks.filter(t => t.id !== task.id);
              position = tasksWithoutDragged.length;
            } else {
              position = 0;
            }
          } else if (overData?.type === 'column') {
            // Dropping in column area - append to end (index = count of other tasks)
            targetColumnId = overData.columnId || over.id as string;
            const targetColumn = columns[targetColumnId];
            const tasksWithoutDragged = targetColumn?.tasks.filter(t => t.id !== task.id) || [];
            position = tasksWithoutDragged.length;
          } else if (overData?.type === 'column-middle' || over.id.toString().includes('-middle')) {
            // Handle column-middle drops - insert at end
            targetColumnId = overData?.columnId || over.id.toString().replace('-middle', '');
            const targetColumn = columns[targetColumnId];
            const tasksWithoutDragged = targetColumn?.tasks.filter(t => t.id !== task.id) || [];
            position = tasksWithoutDragged.length;
          } else if (columns[over.id as string]) {
            // Dropping directly on column by ID - append to end
            targetColumnId = over.id as string;
            const targetColumn = columns[targetColumnId];
            const tasksWithoutDragged = targetColumn?.tasks.filter(t => t.id !== task.id) || [];
            position = tasksWithoutDragged.length;
          } else {
            // No valid drop target found - log for debugging
            console.warn('⚠️ [handleDragEnd] No valid drop target found:', {
              overId: over.id,
              overDataType: overData?.type,
              activeTaskId: task.id,
              activeTaskColumnId: task.columnId
            });
            // Don't proceed with move if we can't determine target
            return;
          }
          
          // **ENHANCED VALIDATION: Skip redundant/micro-movements**
          // CRITICAL: Parse sourcePosition as number to avoid string comparison issues
          const sourcePosition = typeof task.position === 'number' ? task.position : parseFloat(task.position) || 0;
          const isSameColumn = targetColumnId === task.columnId;
          const isSamePosition = sourcePosition === position;
          
          // CRITICAL FIX: When dropping on another task, always allow the move to proceed
          // This handles cases where:
          // 1. Tasks are filtered and the visual order differs from the full list order
          // 2. The dragged task is already at the target position but user wants to reorder
          // 3. Edge cases where index calculation needs to be validated by the backend
          if (targetTask) {
            // Always proceed when explicitly dropping on another task
            // The moveTaskToIndex function will handle the actual reordering logic
          } else if (isSameColumn && isSamePosition) {
            // Skip only if same position AND not dropping on a task
            return;
          }
          
          // For same-column moves, ensure there's meaningful position change
          // BUT: Don't skip when dropping on another task (allows reordering)
          if (isSameColumn && Math.abs(sourcePosition - position) < 1 && !targetTask) {
            return;
          }

          // Always log the move attempt for debugging
          console.log('🔄 [handleDragEnd] Attempting move:', {
            taskId: task.id,
            from: `${task.columnId}[${sourcePosition}]`,
            to: `${targetColumnId}[${position}]`,
            isCrossColumn: !isSameColumn,
            targetTask: targetTask?.id || 'none'
          });
          
          await onTaskMove(task.id, targetColumnId, position);
          console.log('✅ [handleDragEnd] Move completed');
          
          // console.log('✅ Move completed successfully');
        }
      } else if (activeData?.type === 'column') {
        // Handle column reordering
        const column = activeData.column as Column;
        
        // Get all columns sorted by position to determine drag direction and edge cases
        const columnArray = Object.values(columns).sort((a, b) => (a.position || 0) - (b.position || 0));
        const sourceIndex = columnArray.findIndex(col => col.id === column.id);
        const sourcePosition = Math.floor(column.position || 0);
        
        // Helper function to calculate target position based on drag direction and edge cases
        const calculateTargetPosition = (targetColumn: Column): number => {
          // CRITICAL: Re-sort columns array to ensure we have the latest positions
          // This is important because the columns prop might be stale after a recent reorder
          const sortedColumns = [...columnArray].sort((a, b) => (a.position || 0) - (b.position || 0));
          const targetPosition = Math.floor(targetColumn.position || 0);
          const sourceIndex = sortedColumns.findIndex(col => col.id === column.id);
          const targetIndex = sortedColumns.findIndex(col => col.id === targetColumn.id);
          
          // Recalculate source position from sorted array to ensure accuracy
          const actualSourcePosition = Math.floor(sortedColumns[sourceIndex]?.position || 0);
          
          // Determine if we're moving left (to lower position) or right (to higher position)
          const movingLeft = actualSourcePosition > targetPosition;
          const movingRight = actualSourcePosition < targetPosition;
          
          // For edge cases: when dropping on first or last column
          const isFirstColumn = targetIndex === 0;
          const isLastColumn = targetIndex === sortedColumns.length - 1;
          
          if (movingLeft && isFirstColumn) {
            // Moving left to first position (position 0): dropped column takes position 0
            // The first column will be shifted to position 1 by the backend
            return 0;
          } else if (movingRight && isLastColumn) {
            // Moving right to last position: dropped column takes the last position
            // The last column will be shifted left by the backend
            return targetPosition;
          } else {
            // Normal case: use target's position
            // The backend will shift columns appropriately
            return targetPosition;
          }
        };
        
        // CRITICAL FIX: Check if over.id directly matches a column ID
        // This handles cases where collision detection returns tasks but we can find the column
        const overId = over?.id as string;
        const isOverColumnId = overId && columns[overId];
        
        // If over.id is a column ID, use it directly
        if (isOverColumnId && overId !== column.id) {
          const targetColumn = columns[overId];
          if (targetColumn) {
            const targetPosition = calculateTargetPosition(targetColumn);
            await onColumnReorder(column.id, targetPosition);
            return;
          }
        }
        
        // Handle column-top drop zone
        if (overData?.type === 'column-top' || (overId && overId.toString().endsWith('-top-drop'))) {
          const targetColumnId = overData?.columnId || overId?.toString().replace('-top-drop', '');
          if (targetColumnId && targetColumnId !== column.id && columns[targetColumnId]) {
            const targetColumn = columns[targetColumnId];
            const targetPosition = calculateTargetPosition(targetColumn);
            await onColumnReorder(column.id, targetPosition);
            return;
          }
        }
        
        // CRITICAL FIX: If we're dragging a column but ended on a task, find the parent column
        // This happens when collision detection fails to filter out tasks, but we can recover
        if (overData?.type === 'task') {
          const taskColumnId = overData.task?.columnId || overData.columnId;
          if (taskColumnId && taskColumnId !== column.id) {
            const targetColumn = columns[taskColumnId];
            if (targetColumn) {
              const targetPosition = calculateTargetPosition(targetColumn);
              await onColumnReorder(column.id, targetPosition);
            }
          }
          return;
        }
        
        // Only process if we dropped on another column (fallback for direct column drops)
        if (overData?.type === 'column' && overData.column?.id !== column.id) {
          // Calculate target position based on drag direction and edge cases
          const targetPosition = calculateTargetPosition(overData.column);
          // console.log('🔄 Column reorder:', column.id, '→ position', targetPosition);
          await onColumnReorder(column.id, targetPosition);
        }
        // Note: column-middle is for tasks only, not columns, so we don't handle it here
      }
    } catch (error) {
      // console.error('❌ Drag operation failed:', error);
    } finally {
      // Always clear drag UI state (preview, dragged task) — including when `over` was null
      // or when the user cancelled; otherwise insertion placeholders stay mounted and shift columns.
      lastPreviewRef.current = null;
      lastOverIdRef.current = null;
      onDraggedTaskChange?.(null);
      onDraggedColumnChange?.(null);
      onBoardTabHover?.(false);
      onDragPreviewChange?.(null);
      setIsHoveringBoardTabDelayed(false);
    }
  };

  const handleDragCancel = () => {
    lastPreviewRef.current = null;
    lastOverIdRef.current = null;
    onDraggedTaskChange?.(null);
    onDraggedColumnChange?.(null);
    onBoardTabHover?.(false);
    onDragPreviewChange?.(null);
    setIsHoveringBoardTabDelayed(false);
  };

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      collisionDetection={customCollisionDetection}
      sensors={sensors}
    >
      {children}
    </DndContext>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Only re-render if meaningful props change (ignore children as it's recreated on every render)
  const shouldSkip = (() => {
    // Compare primitive props
    if (prevProps.currentBoardId !== nextProps.currentBoardId) return false; // Re-render
    if (prevProps.isOnline !== nextProps.isOnline) return false; // Re-render
  
  // Compare columns by reference (they should be stable now)
  if (prevProps.columns !== nextProps.columns) {
    // If reference changed, check if structure actually changed
    const prevKeys = Object.keys(prevProps.columns || {}).sort();
    const nextKeys = Object.keys(nextProps.columns || {}).sort();
    if (prevKeys.length !== nextKeys.length || prevKeys.some((k, i) => k !== nextKeys[i])) {
      return false; // Structure changed - re-render
    }
    // Check task counts per column
    const structureChanged = prevKeys.some(key => {
      const prevCount = prevProps.columns[key]?.tasks?.length || 0;
      const nextCount = nextProps.columns[key]?.tasks?.length || 0;
      return prevCount !== nextCount;
    });
    if (structureChanged) return false; // Re-render
  }
  
  // Compare boards by reference and length
  if (prevProps.boards !== nextProps.boards) {
    if (prevProps.boards.length !== nextProps.boards.length) return false; // Re-render
    // Check if board IDs changed
    const prevBoardIds = prevProps.boards.map(b => b.id).sort();
    const nextBoardIds = nextProps.boards.map(b => b.id).sort();
    if (prevBoardIds.some((id, i) => id !== nextBoardIds[i])) return false; // Re-render
  }
  
  // Compare callbacks by reference (they should be stable with useCallback)
  if (prevProps.onTaskMove !== nextProps.onTaskMove) return false; // Re-render
  if (prevProps.onTaskMoveToDifferentBoard !== nextProps.onTaskMoveToDifferentBoard) return false; // Re-render
  if (prevProps.onColumnReorder !== nextProps.onColumnReorder) return false; // Re-render
  if (prevProps.onDraggedTaskChange !== nextProps.onDraggedTaskChange) return false; // Re-render
  if (prevProps.onDraggedColumnChange !== nextProps.onDraggedColumnChange) return false; // Re-render
  if (prevProps.onBoardTabHover !== nextProps.onBoardTabHover) return false; // Re-render
  if (prevProps.onDragPreviewChange !== nextProps.onDragPreviewChange) return false; // Re-render
  
    // Ignore children prop - it's recreated on every render but doesn't affect our logic
    // Return true to skip re-render
    return true; // Props are equal - skip re-render
  })();
  
  return shouldSkip;
});

// Add displayName for better debugging
SimpleDragDropManager.displayName = 'SimpleDragDropManager';

export default SimpleDragDropManager;
