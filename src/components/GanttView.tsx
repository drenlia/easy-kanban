import React, { useMemo, useState, useEffect, useCallback, useRef, startTransition } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverEvent, KeyboardSensor, PointerSensor, useSensor, useSensors, useDroppable, closestCenter, DragOverlay } from '@dnd-kit/core';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Task, Columns, PriorityOption } from '../types';
import { TaskViewMode, loadUserPreferencesAsync, saveUserPreferences } from '../utils/userPreferences';
import { updateTask, getAllPriorities, createTaskAtTop, addTaskRelationship, removeTaskRelationship } from '../api';
import { generateUUID } from '../utils/uuid';
import { TaskHandle } from './gantt/TaskHandle';
import { MoveHandle } from './gantt/MoveHandle';
import { RowHandle } from './gantt/RowHandle';
import { OptimizedTaskBar } from './gantt/OptimizedTaskBar';
import { GanttDragItem, GanttRowDragItem, AnyDragItem, DRAG_TYPES, RowDragData, SortableTaskRowItem } from './gantt/types';
import { usePerformanceMonitor } from '../hooks/usePerformanceMonitor';
import { GanttHeader } from './gantt/GanttHeader';
import { TaskDependencyArrows } from './gantt/TaskDependencyArrows';
import { Copy, Trash2, GripVertical } from 'lucide-react';

// DropZone component for cross-column dragging
const DropZone = ({ columnId, columnName, isVisible }: { 
  columnId: string; 
  columnName: string; 
  isVisible: boolean; 
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-zone-${columnId}`,
    data: {
      type: 'column-drop-zone',
      columnId: columnId
    }
  });
  
  if (!isVisible) return null;
  
  return (
    <div 
      ref={setNodeRef}
      className={`h-8 border-2 border-dashed rounded flex items-center justify-center mb-1 transition-colors ${
        isOver 
          ? 'bg-green-50 dark:bg-green-900 border-green-400 dark:border-green-500' 
          : 'bg-blue-50 dark:bg-blue-900 border-blue-400 dark:border-blue-500'
      }`}
    >
      <div className="text-blue-600 dark:text-blue-200 text-xs font-medium">
        📋 Drop here to move to {columnName}
      </div>
    </div>
  );
};

interface GanttViewProps {
  columns: Columns;
  onSelectTask: (task: Task) => void;
  taskViewMode?: TaskViewMode;
  onUpdateTask?: (task: Task) => void; // For optimistic updates
  onTaskDragStart?: (task: Task) => void; // Standard drag start handler
  onTaskDragEnd?: () => void; // Standard drag end handler
  boardId?: string | null; // Board identifier for viewport initialization
  onAddTask?: (columnId: string) => Promise<void>; // For creating new tasks (fallback)
  currentUser?: any; // Current user for task creation
  members?: any[]; // Team members for task creation
  onRefreshData?: () => Promise<void>; // Refresh data after task creation
  relationships?: any[]; // Add relationships prop for auto-sync
  onCopyTask?: (task: Task) => Promise<void>; // Copy task handler
  onRemoveTask?: (taskId: string, clickEvent?: React.MouseEvent) => Promise<void>; // Remove task handler
  siteSettings?: { [key: string]: string }; // Site settings for badge system
}

interface GanttTask {
  id: string;
  ticket: string;
  title: string;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  priority: string;
  columnId: string;
  columnPosition: number;
  taskPosition: number;
}


// Helper function to parse date string as local date (avoiding timezone issues)
const parseLocalDate = (dateString: string): Date => {
  if (!dateString) return new Date();
  
  // Handle both YYYY-MM-DD and full datetime strings
  const dateOnly = dateString.split('T')[0]; // Get just the date part
  const [year, month, day] = dateOnly.split('-').map(Number);
  
  // Create date in local timezone
  return new Date(year, month - 1, day); // month is 0-indexed
};

// Helper function to check if a task is overdue
const isTaskOverdue = (task: GanttTask) => {
  if (!task.endDate) return false;
  const today = new Date();
  const dueDate = new Date(task.endDate);
  // Set time to beginning of day for fair comparison
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  return dueDate < today;
};

// Helper function to check if a column is finished
const isColumnFinished = (columnId: string, columns: Columns) => {
  const column = columns[columnId];
  return column?.is_finished || false;
};

// Helper function to check if a column is archived
const isColumnArchived = (columnId: string, columns: Columns) => {
  const column = columns[columnId];
  return column?.is_archived || false;
};

const GanttView: React.FC<GanttViewProps> = ({ columns, onSelectTask, taskViewMode = 'expand', onUpdateTask, onTaskDragStart, onTaskDragEnd, boardId, onAddTask, currentUser, members, onRefreshData, relationships = [], onCopyTask, onRemoveTask, siteSettings }) => {
  const [priorities, setPriorities] = useState<PriorityOption[]>([]);
  const [activeDragItem, setActiveDragItem] = useState<AnyDragItem | null>(null);
  const activeDragItemRef = useRef<AnyDragItem | null>(null);
  const [currentHoverDate, setCurrentHoverDate] = useState<string | null>(null);
  
  // Track if we're currently dragging a task bar (for droppable cell creation)
  const isTaskBarDraggingRef = useRef<boolean>(false);
  const [taskColumnWidth, setTaskColumnWidth] = useState(320); // Default 320px, will load from preferences
  const [, setIsResizing] = useState(false);
  const [isRelationshipMode, setIsRelationshipMode] = useState(false);
  const [selectedParentTask, setSelectedParentTask] = useState<string | null>(null);
  
  // Multi-select state
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  
  // Ref to store current columns for keyboard navigation
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  
  // Use columns directly - React.memo will handle the optimization
  
  // Debouncing for arrow key navigation
  const arrowKeyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isArrowKeyPressedRef = useRef(false);
  
  // Local relationships state for optimistic updates
  const [localRelationships, setLocalRelationships] = useState<any[]>([]);
  const lastRelationshipClickRef = useRef<number>(0);
  
  // Local task order state for reordering
  const [localTaskOrder, setLocalTaskOrder] = useState<string[]>([]);
  
  // Local task date overrides for immediate visual feedback during drag
  // DISABLED: Testing if this is causing issues with single-day tasks
  // const [localTaskDates, setLocalTaskDates] = useState<{[taskId: string]: {startDate: string; dueDate: string}}>({});
  
  
  // Sync relationships from props, but preserve optimistic updates
  useEffect(() => {
    if (relationships && relationships.length > 0) {
      // If we have relationships from props and no local relationships yet, use them
      if (localRelationships.length === 0) {
        // console.log('📊 [GanttView] Initial sync of relationships:', relationships.length);
        setLocalRelationships(relationships);
      } else {
        // Merge: keep optimistic updates (temp IDs) and add new server relationships
        const tempRelationships = localRelationships.filter(rel => 
          typeof rel.id === 'string' && rel.id.startsWith('temp-')
        );
        const mergedRelationships = [...relationships, ...tempRelationships];
        // console.log('📊 [GanttView] Merging relationships:', {
        //   fromProps: relationships.length,
        //   temp: tempRelationships.length,
        //   total: mergedRelationships.length
        // });
        setLocalRelationships(mergedRelationships);
      }
    }
  }, [relationships]);


  // Handle ESC key to exit relationship mode and multi-select mode
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isRelationshipMode) {
          setIsRelationshipMode(false);
          setSelectedParentTask(null);
        }
        if (isMultiSelectMode) {
          setIsMultiSelectMode(false);
          setSelectedTasks([]);
        }
      } else if (event.key === 'Enter') {
        if (isMultiSelectMode) {
          setIsMultiSelectMode(false);
          setSelectedTasks([]);
        } else if (isRelationshipMode) {
          setIsRelationshipMode(false);
          setSelectedParentTask(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isRelationshipMode, isMultiSelectMode]);


  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (taskPositionsTimeoutRef.current) {
        clearTimeout(taskPositionsTimeoutRef.current);
      }
      if (columnWidthTimeoutRef.current) {
        clearTimeout(columnWidthTimeoutRef.current);
      }
    };
  }, []);
  
  // Handle task selection for multi-select mode
  const handleTaskSelect = (taskId: string) => {
    if (!isMultiSelectMode) return;
    
    setSelectedTasks(prev => {
      if (prev.includes(taskId)) {
        // Remove from selection
        return prev.filter(id => id !== taskId);
      } else {
        // Add to selection
        return [...prev, taskId];
      }
    });
  };

  // Handle select all tasks
  const handleSelectAll = () => {
    if (!isMultiSelectMode) return;
    
    const allTaskIds = reorderedGanttTasks.map(task => task.id);
    setSelectedTasks(allTaskIds);
  };

  // Handle deselect all tasks
  const handleDeselectAll = () => {
    setSelectedTasks([]);
  };

  // Handle relationship creation with optimistic updates
  const handleCreateRelationship = async (parentTaskId: string, childTaskId: string) => {
    // Debounce rapid clicks (prevent multiple clicks within 500ms)
    const now = Date.now();
    if (now - lastRelationshipClickRef.current < 500) {
      return;
    }
    lastRelationshipClickRef.current = now;
    
    // Check if relationship already exists to prevent duplicates
    const existingRelationship = localRelationships.find(rel => 
      rel.task_id === parentTaskId && rel.to_task_id === childTaskId
    );
    
    if (existingRelationship) {
      return;
    }
    
    // Create optimistic relationship object (matching TaskDependencyArrows interface)
    const optimisticRelationship = {
      id: `temp-${Date.now()}`, // Temporary ID for optimistic update
      task_id: parentTaskId,
      to_task_id: childTaskId,
      relationship: 'parent' as const,
      task_ticket: '', // Will be filled by the component
      related_task_ticket: '', // Will be filled by the component
      createdAt: new Date().toISOString()
    };
    
    // Immediately add to local state for instant UI update
    setLocalRelationships(prev => [...prev, optimisticRelationship]);
    
    try {
      // Create parent relationship (parent -> child) in background
      const createdRelationship = await addTaskRelationship(parentTaskId, 'parent', childTaskId);
      
      // Mark optimistic relationship as confirmed (keep it, just change the ID)
      setLocalRelationships(prev => 
        prev.map(rel => 
          rel.id === optimisticRelationship.id 
            ? { ...rel, id: `confirmed-${Date.now()}` }
            : rel
        )
      );
      
      // Note: No need to refresh data since arrows already show from optimistic update
      
    } catch (error: any) {
      
      // Handle specific error cases
      if (error?.response?.status === 409) {
        // Don't revert the optimistic update - keep the arrow visible
        // But trigger a refresh to get the real relationship data from server
        if (onRefreshData) {
          if (process.env.NODE_ENV === 'development') {
            console.log('🔄 [GanttView] Calling onRefreshData (task creation)');
          }
          onRefreshData();
        }
      } else {
        // Revert optimistic update on other errors
        setLocalRelationships(prev => 
          prev.filter(rel => rel.id !== optimisticRelationship.id)
        );
        
        // Show user-friendly error message
        alert(`Failed to create relationship: ${error?.response?.data?.message || error.message || 'Unknown error'}`);
      }
    }
  };

  // Handle relationship deletion with optimistic updates
  const handleDeleteRelationship = async (relationshipId: string, fromTaskId: string) => {
    // Store the relationship to restore if deletion fails
    const relationshipToDelete = localRelationships.find(rel => rel.id === relationshipId);
    
    // Immediately remove from local state for instant UI update
    setLocalRelationships(prev => prev.filter(rel => rel.id !== relationshipId));
    
    try {
      // Delete relationship in background
      await removeTaskRelationship(fromTaskId, relationshipId);
      
      // Note: No need to refresh data since arrow already removed from optimistic update
      
    } catch (error) {
      
      // Revert optimistic update on error
      if (relationshipToDelete) {
        setLocalRelationships(prev => [...prev, relationshipToDelete]);
      }
    }
  };
  
  // Task creation drag state
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [taskCreationStart, setTaskCreationStart] = useState<string | null>(null);
  const [taskCreationEnd, setTaskCreationEnd] = useState<string | null>(null);

  // Performance monitoring for the Gantt view
  const { measureFunction, startMeasurement } = usePerformanceMonitor({
    enableConsoleLog: false,
    sampleRate: 0.05 // Sample 5% of operations in production
  });

  // Configure DnD sensors for immediate response (like Kanban view)
  const sensorInitTime = performance.now();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3, // Reduce from 5px to 3px for faster drag initiation
      },
    }),
    useSensor(KeyboardSensor)
  );
  
  const sensorCompleteTime = performance.now();
  // Sensors initialized

  // console.log('🎮 [GanttView] Sensors initialized:', {
  //   sensorsCount: sensors.length,
  //   hasPointerSensor: sensors.some(s => s.sensor.name === 'PointerSensor'),
  //   hasKeyboardSensor: sensors.some(s => s.sensor.name === 'KeyboardSensor')
  // });

  // Custom modifier to restrict to horizontal axis (except for row reordering)
  const restrictToHorizontalAxis = ({ transform, active }: { transform: any; active: any }) => {
    // Allow vertical movement for sortable task rows
    if (active?.data?.current?.type === 'task-row') {
      return transform; // Allow full movement for row reordering
    }
    
    // Allow vertical movement for row handles (legacy support)
    if (active?.data?.current?.dragType === DRAG_TYPES.TASK_ROW_HANDLE) {
      return transform; // Allow full movement for row reordering
    }
    
    return {
      ...transform,
      y: 0, // Force Y position to 0, only allow X movement for other drag types
    };
  };




  // Handle task column resizing
  const handleResizeStart = (e: React.MouseEvent) => {
    setIsResizing(true);
    // Store the initial mouse position and current width
    const initialX = e.clientX;
    const initialWidth = taskColumnWidth;
    
    const handleMove = (moveE: MouseEvent) => {
      const deltaX = moveE.clientX - initialX;
      const newWidth = Math.max(200, Math.min(600, initialWidth + deltaX));
      setTaskColumnWidth(newWidth);
    };
    
    const handleEnd = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
    };
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
  };


  // Load task column width from user preferences
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const preferences = await loadUserPreferencesAsync();
        setTaskColumnWidth(preferences.ganttTaskColumnWidth);
      } catch (error) {
        // Keep default value
      }
    };
    loadPreferences();
  }, []);

  // Save task column width to user preferences when it changes (heavily debounced for performance)
  useEffect(() => {
    const savePreference = () => {
      // Use requestIdleCallback for non-blocking operation
      if ('requestIdleCallback' in window) {
        requestIdleCallback(async () => {
      try {
        const currentPreferences = await loadUserPreferencesAsync();
        await saveUserPreferences({
          ...currentPreferences,
          ganttTaskColumnWidth: taskColumnWidth
        });
      } catch (error) {
            // Silent fail to avoid blocking
          }
        });
      } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(async () => {
          try {
            const currentPreferences = await loadUserPreferencesAsync();
            await saveUserPreferences({
              ...currentPreferences,
              ganttTaskColumnWidth: taskColumnWidth
            });
          } catch (error) {
            // Silent fail to avoid blocking
          }
        }, 100);
      }
    };
    
    // Heavily debounce the save to avoid blocking during resize (2 seconds)
    const timeoutId = setTimeout(() => {
      // Only save if not the initial default value (avoid saving on mount)
      if (taskColumnWidth !== 320) {
        savePreference();
      }
    }, 2000); // 2000ms debounce for performance
    
    return () => clearTimeout(timeoutId);
  }, [taskColumnWidth]);

  // Fetch priorities on mount
  useEffect(() => {
    const fetchPriorities = async () => {
      try {
        const priorityData = await getAllPriorities();
        setPriorities(priorityData);
      } catch (error) {
        // Fallback to default priorities
        setPriorities([
          { id: 1, priority: 'high', color: '#FF3B30', position: 4 } as PriorityOption,
          { id: 2, priority: 'medium', color: '#FF9500', position: 3 } as PriorityOption,
          { id: 3, priority: 'low', color: '#4CD964', position: 1 } as PriorityOption
        ]);
      }
    };
    fetchPriorities();
  }, []);
  // Find the earliest task start date to position the timeline
  const earliestTaskDate = useMemo(() => {
    let earliest: Date | null = null;
    
    Object.values(columns).forEach(column => {
      column.tasks.forEach(task => {
        if (task.startDate) {
          const taskStartDate = parseLocalDate(task.startDate);
          if (!earliest || taskStartDate < earliest) {
            earliest = taskStartDate;
          }
        }
      });
    });
    
    return earliest;
  }, [columns]);

  // Extract and prepare tasks from all columns (memoized for performance)
  const ganttTasks = useMemo(() => measureFunction(() => {
    const tasks: GanttTask[] = [];
    
    // Create column position map for sorting
    const columnPositions = new Map<string, number>();
    Object.values(columns).forEach(column => {
      columnPositions.set(column.id, column.position || 0);
    });
    
    Object.values(columns).forEach(column => {
      column.tasks.forEach(task => {
        // Parse dates and handle start-date-only tasks
        let startDate: Date | null = null;
        let endDate: Date | null = null;
        
        // Check for local date overrides first (for immediate visual feedback)
        // DISABLED: Testing if this is causing issues
        // const localOverride = localTaskDates[task.id];
        // if (localOverride) {
        //   startDate = parseLocalDate(localOverride.startDate);
        //   endDate = parseLocalDate(localOverride.dueDate);
        // } else if (task.startDate) {
        if (task.startDate) {
          // Parse as local date to avoid timezone conversion issues
          startDate = parseLocalDate(task.startDate);
          // If only start date is provided, use it as end date too (1-day task)
          endDate = task.dueDate ? parseLocalDate(task.dueDate) : parseLocalDate(task.startDate); // Fix: use parseLocalDate consistently
        } else if (task.dueDate) {
          // If only due date is provided, use it as start date too
          endDate = parseLocalDate(task.dueDate);
          startDate = parseLocalDate(task.dueDate); // Fix: use parseLocalDate consistently
        }
        
        
        
        // Protection for null dates - log when this happens
        if (startDate && !endDate) {
          console.log('⚠️ [GanttView] Task with null dueDate, using startDate:', {
            taskId: task.id,
            title: task.title,
            startDate: task.startDate,
            dueDate: task.dueDate
          });
        }
        
        
        
        tasks.push({
          id: task.id,
          ticket: task.ticket || 'N/A',
          title: task.title,
          startDate,
          endDate,
          status: column.title,
          priority: task.priority || 'medium',
          columnId: task.columnId,
          columnPosition: column.position || 0, // Add column position for sorting
          taskPosition: task.position || 0 // Add task position for within-column sorting
        });
      });
    });
    
    // Sort by column position (ascending), then by task position within column, then by ticket
    return tasks.sort((a, b) => {
      if (a.columnPosition !== b.columnPosition) {
        return a.columnPosition - b.columnPosition; // Sort by column position
      }
      if (a.taskPosition !== b.taskPosition) {
        return a.taskPosition - b.taskPosition; // Then by task position within column
      }
      return a.ticket.localeCompare(b.ticket); // Finally by ticket as fallback
    });
  }, 'ganttTasks calculation', 'computation')(), [columns]); // Removed measureFunction to prevent infinite re-renders

  // Apply local task reordering
  const reorderedGanttTasks = useMemo(() => {
    if (localTaskOrder.length === 0) {
      return ganttTasks;
    }
    
    // Create a map for quick lookup
    const taskMap = new Map(ganttTasks.map(task => [task.id, task]));
    
    // Reorder tasks based on localTaskOrder
    const reordered = localTaskOrder
      .map(taskId => taskMap.get(taskId))
      .filter(Boolean) as GanttTask[];
    
    // Add any new tasks that aren't in the local order
    const existingIds = new Set(localTaskOrder);
    const newTasks = ganttTasks.filter(task => !existingIds.has(task.id));
    
    return [...reordered, ...newTasks];
  }, [ganttTasks, localTaskOrder]);

  // Handle keyboard navigation for selected tasks with debouncing
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isMultiSelectMode || selectedTasks.length === 0) return;
      
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        
        // If arrow key is already being processed, ignore this event
        if (isArrowKeyPressedRef.current) return;
        
        // Set flag to prevent multiple rapid calls
        isArrowKeyPressedRef.current = true;
        
        const moveAmount = event.key === 'ArrowLeft' ? -1 : 1; // Move left or right by 1 day
        
        // Clear any existing timeout
        if (arrowKeyTimeoutRef.current) {
          clearTimeout(arrowKeyTimeoutRef.current);
        }
        
        // Move all selected tasks
        selectedTasks.forEach(async (taskId) => {
          // Find the original task from columns to get the full task data
          const originalTask = Object.values(columnsRef.current)
            .flatMap(col => col.tasks || [])
            .find(t => t.id === taskId);
            
          if (originalTask && originalTask.startDate && originalTask.dueDate && onUpdateTask) {
            const newStartDate = new Date(originalTask.startDate);
            const newDueDate = new Date(originalTask.dueDate);
            
            newStartDate.setDate(newStartDate.getDate() + moveAmount);
            newDueDate.setDate(newDueDate.getDate() + moveAmount);
            
            // Create updated task object with proper date format
            const updatedTask = {
              ...originalTask,
              startDate: newStartDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
              dueDate: newDueDate.toISOString().split('T')[0] // Format as YYYY-MM-DD
            };
            
            // Update the task
            await onUpdateTask(updatedTask);
          }
        });
        
        // Reset flag after a short delay to allow for single key presses
        arrowKeyTimeoutRef.current = setTimeout(() => {
          isArrowKeyPressedRef.current = false;
        }, 100); // 100ms debounce
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        // Reset flag immediately on key release
        isArrowKeyPressedRef.current = false;
        if (arrowKeyTimeoutRef.current) {
          clearTimeout(arrowKeyTimeoutRef.current);
          arrowKeyTimeoutRef.current = null;
        }
      }
    };

    if (isMultiSelectMode) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('keyup', handleKeyUp);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        // Cleanup timeout on unmount
        if (arrowKeyTimeoutRef.current) {
          clearTimeout(arrowKeyTimeoutRef.current);
        }
      };
    }
  }, [isMultiSelectMode, selectedTasks, onUpdateTask]); // Removed columns dependency, using ref instead

  // Group tasks by columnId for separators (sorted by columns.position, then tasks.position)
  const groupedTasks = useMemo(() => {
    // First, sort columns by position
    const sortedColumns = Object.values(columns).sort((a, b) => a.position - b.position);
    
    // Group tasks by columnId, maintaining the column order
    const groups: { [columnId: string]: GanttTask[] } = {};
    
    sortedColumns.forEach(column => {
      groups[column.id] = [];
    });
    
    // Add tasks to their respective column groups, sorted by task position
    reorderedGanttTasks.forEach(task => {
      if (groups[task.columnId]) {
        groups[task.columnId].push(task);
      }
    });
    
    // Sort tasks within each group by their position
    Object.keys(groups).forEach(columnId => {
      groups[columnId].sort((a, b) => a.taskPosition - b.taskPosition);
    });
    
    return groups;
  }, [reorderedGanttTasks, columns]);

  // Initialize local task order only when board changes or on mount
  const previousBoardIdRef = useRef<string | null>(null);
  useEffect(() => {
    // Only reset local order if we're on a different board or first load
    if (boardId !== previousBoardIdRef.current) {
      previousBoardIdRef.current = boardId;
      if (ganttTasks.length > 0) {
        const taskIds = ganttTasks.map(task => task.id);
        setLocalTaskOrder(taskIds);
      }
      // Clear local date overrides on board change
      // DISABLED: Testing
      // setLocalTaskDates({});
    }
  }, [boardId, ganttTasks]);
  
  // Track if we have an active drag to ensure proper cleanup
  const activeDragRef = useRef(false);
  
  // Update ref when drag state changes
  useEffect(() => {
    activeDragRef.current = !!activeDragItem;
  }, [activeDragItem]);
  
  // Ensure drag state is cleared when component unmounts or board changes
  useEffect(() => {
    return () => {
      // If we still have an active drag when unmounting, clean it up
      if (activeDragRef.current && onTaskDragEnd) {
        // console.log('🧹 [GanttView] Component unmounting with active drag - calling onTaskDragEnd');
        onTaskDragEnd();
      }
    };
  }, [boardId]); // Re-run when board changes
  
  // CRITICAL: Clear parent drag state immediately when columns change during an active drag
  // This handles the case where filtering is applied/removed while dragging
  const previousColumnsRef = useRef(columns);
  // TEMPORARILY DISABLED - This effect is clearing the ref prematurely
  // useEffect(() => {
  //   // Check if columns actually changed (not just a re-render)
  //   const columnsChanged = previousColumnsRef.current !== columns;
  //   if (columnsChanged && activeDragItemRef.current && onTaskDragEnd) {
  //     console.log('🚨 [GanttView] CRITICAL: Columns changed while dragging - immediately clearing parent drag state');
  //     // Clear parent state immediately, don't wait for timeout
  //     onTaskDragEnd();
  //     // Also clear local state
  //     setActiveDragItem(null);
  //     console.log('🧹 Clearing ref in useEffect - columns changed');
  //     activeDragItemRef.current = null;
  //     setCurrentHoverDate(null);
  //   }
  //   previousColumnsRef.current = columns;
  // }, [columns, onTaskDragEnd]);
  
  // Clear drag state when columns change significantly (e.g., when filters are removed)
  useEffect(() => {
    // If we have an active drag but columns have changed significantly,
    // it might mean filters were applied/removed
    if (activeDragItem) {
      // Small delay to ensure the drag operation has completed
      const timeoutId = setTimeout(() => {
        if (activeDragItem) {
          // Get the task ID based on the drag item type
          let taskId: string | null = null;
          if ('taskId' in activeDragItem) {
            // GanttDragItem has taskId
            taskId = (activeDragItem as GanttDragItem).taskId;
          } else if ('task' in activeDragItem && activeDragItem.task) {
            // SortableTaskRowItem has task object
            taskId = activeDragItem.task.id;
          }
          
          if (taskId) {
            // Check if the dragged task still exists in the new columns
            const draggedTaskStillExists = Object.values(columns).some(col => 
              col.tasks.some(task => task.id === taskId)
            );
            
            if (!draggedTaskStillExists) {
              // console.log('🧹 [GanttView] Task no longer in filtered view - forcing drag cleanup');
              setActiveDragItem(null);
        activeDragItemRef.current = null;
              setCurrentHoverDate(null);
              // CRITICAL: Always call onTaskDragEnd to clear draggedTask in parent
              if (onTaskDragEnd) {
                // console.log('🧹 [GanttView] Calling onTaskDragEnd to clear parent state');
                onTaskDragEnd();
              }
            }
          }
        }
      }, 500); // Give drag operation time to complete normally
      
      return () => clearTimeout(timeoutId);
    }
    
    // Also clear relationship mode if the selected parent task is no longer visible
    if (isRelationshipMode && selectedParentTask) {
      const parentTaskStillExists = Object.values(columns).some(col => 
        col.tasks.some(task => task.id === selectedParentTask)
      );
      
      if (!parentTaskStillExists) {
        // console.log('🧹 [GanttView] Clearing relationship mode - parent task no longer in filtered view');
        setIsRelationshipMode(false);
        setSelectedParentTask(null);
      }
    }
  }, [columns]); // Only depend on columns to avoid circular dependencies
  
  // Clear local date overrides when the actual task data updates
  // DISABLED: Testing
  // useEffect(() => {
  //   // Check if any local dates match the actual task dates (meaning the update went through)
  //   const updatedTaskIds: string[] = [];
  //   Object.entries(localTaskDates).forEach(([taskId, localDates]) => {
  //     const task = ganttTasks.find(t => t.id === taskId);
  //     if (task && task.startDate && task.endDate) {
  //       const taskStartStr = task.startDate.toISOString().split('T')[0];
  //       const taskEndStr = task.endDate.toISOString().split('T')[0];
  //       if (taskStartStr === localDates.startDate && taskEndStr === localDates.dueDate) {
  //         // The update has been applied to the actual data
  //         updatedTaskIds.push(taskId);
  //       }
  //     }
  //   });
    
  //   // Remove the local overrides that have been applied
  //   if (updatedTaskIds.length > 0) {
  //     setLocalTaskDates(prev => {
  //       const newDates = { ...prev };
  //       updatedTaskIds.forEach(id => delete newDates[id]);
  //       return newDates;
  //     });
  //   }
  // }, [ganttTasks, localTaskDates]);

  // Smart dynamic date loading with continuous timeline
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [dateRange, setDateRange] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewportCenter, setViewportCenter] = useState<Date | null>(null); // Track center of current view
  
  // Loading protection - prevent aggressive loading
  const [earlierLoadCount, setEarlierLoadCount] = useState(0);
  const [laterLoadCount, setLaterLoadCount] = useState(0);
  const [lastLoadTime, setLastLoadTime] = useState(0);
  const [isButtonNavigation, setIsButtonNavigation] = useState(false);
  const [hoveredSeparator, setHoveredSeparator] = useState<string | null>(null);
  
  // State for pending scroll restoration
  const [pendingScrollRestore, setPendingScrollRestore] = useState<{date: string, scrollLeft: number} | null>(null);
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [isDraggingOverGroup, setIsDraggingOverGroup] = useState<string | null>(null);
  const [isHoveringDropZone, setIsHoveringDropZone] = useState<boolean>(false);
  const [isCrossColumnDrop, setIsCrossColumnDrop] = useState<boolean>(false);


  // Droppable group component for vertical drag and drop
  const DroppableGroup = ({ columnId, children }: { columnId: string; children: React.ReactNode }) => {
    const { setNodeRef, isOver } = useDroppable({
      id: `group-${columnId}`,
      data: {
        type: 'group-drop',
        columnId: columnId
      },
      disabled: true // Disable this droppable to prevent conflicts with DropZone
    });

    // Clear all hover states when dragging stops completely
    React.useEffect(() => {
      if (!activeDragItem) {
        setHoveredGroup(null);
        setIsDraggingOverGroup(null);
      }
    }, [activeDragItem]);

    return (
      <div 
        ref={setNodeRef}
        className={`relative ${
          isOver ? 'bg-blue-50' : ''
        }`}
      >
        {children}
      </div>
    );
  };

  // Memoized column width calculation to prevent repeated DOM measurements
  const [columnWidth, setColumnWidth] = useState(40);
  const columnWidthTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fixed column width to ensure timeline and grid synchronization
  const getColumnWidth = useCallback(() => {
    return 40; // Fixed 40px column width for perfect alignment
  }, []);

  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [isInitialRangeSet, setIsInitialRangeSet] = useState(false);
  const [lastSavedScrollDate, setLastSavedScrollDate] = useState<string | null>(null);
  const lastSavedScrollDateRef = useRef<string | null>(null);
  const [isProgrammaticScroll, setIsProgrammaticScroll] = useState(false);
  const [isBoardTransitioning, setIsBoardTransitioning] = useState(false);
  const [isRestoringPosition, setIsRestoringPosition] = useState(false);

  // Sync ref with state to prevent circular dependencies
  useEffect(() => {
    lastSavedScrollDateRef.current = lastSavedScrollDate;
  }, [lastSavedScrollDate]);
  
  // Generate date range function
  const generateDateRange = useCallback((startDate: Date, endDate: Date) => {
    const dates = [];
    const currentDate = new Date(startDate);
    const today = new Date();
    
    while (currentDate <= endDate) {
      const isToday = currentDate.toDateString() === today.toDateString();
      const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
      
      dates.push({
        date: new Date(currentDate),
        isToday,
        isWeekend
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dates;
  }, []);

  // Debounced function to save scroll position to user preferences (avoid loops)
  const saveScrollPosition = useCallback(async (firstVisibleDate: string, exactScrollLeft?: number, targetBoardId?: string) => {
    const currentBoardId = targetBoardId || boardId;
    
    if (!currentBoardId || !firstVisibleDate || firstVisibleDate === lastSavedScrollDateRef.current) {
      return; // Don't save if no boardId, no date, or same date (avoid loops)
    }

    try {
      const currentPreferences = await loadUserPreferencesAsync();
      const sessionId = Date.now().toString(); // Unique session identifier
      
      await saveUserPreferences({
        ...currentPreferences,
        ganttScrollPositions: {
          ...currentPreferences.ganttScrollPositions,
          [currentBoardId]: {
            date: firstVisibleDate,
            sessionId: sessionId
          }
        }
      });
      
      // Update both state and ref to prevent loops
      lastSavedScrollDateRef.current = firstVisibleDate;
      setLastSavedScrollDate(firstVisibleDate);
    } catch (error) {
    }
  }, [boardId]);

  // Immediate scroll position saving with smart deduplication
  const saveQueueRef = useRef<{boardId: string, date: string, scrollLeft: number} | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const [isSavingScrollPosition, setIsSavingScrollPosition] = useState<boolean>(false);
  const [isGridReady, setIsGridReady] = useState<boolean>(false);
  const [isDateRangeStable, setIsDateRangeStable] = useState<boolean>(true);
  const lastRestorationTimeRef = useRef<number>(0);
  const lastSavedPositionRef = useRef<{boardId: string, date: string, scrollLeft: number} | null>(null);
  const restorationAttemptedRef = useRef<boolean>(false);
  const loadEarlierRef = useRef<(() => Promise<void>) | null>(null);
  const loadLaterRef = useRef<(() => Promise<void>) | null>(null);
  const stickyHeaderRef = useRef<HTMLElement | null>(null);
  const timelineContainersRef = useRef<HTMLElement[]>([]);
  
  // Unified scroll position save function
  const saveCurrentScrollPosition = useCallback((options?: { immediate?: boolean }) => {
    if (!scrollContainerRef.current || !boardId || dateRange.length === 0) {
      return;
    }
    
    // Always capture current values to prevent stale closures
    const currentBoardId = boardId;
    const scrollLeft = scrollContainerRef.current.scrollLeft;
    const columnWidth = 40;
    const visibleColumnIndex = Math.floor(scrollLeft / columnWidth);
    const safeIndex = Math.max(0, Math.min(visibleColumnIndex, dateRange.length - 1));
    const currentLeftmostDate = dateRange[safeIndex]?.date.toISOString().split('T')[0];
    
    if (!currentLeftmostDate) return;
    
    // For immediate saves (from buttons), bypass all checks
    if (options?.immediate) {
      // console.log(`💾 [GanttView] Immediate save for board ${currentBoardId}: {leftmostDate: '${currentLeftmostDate}', scrollLeft: ${scrollLeft}}`);
      saveScrollPosition(currentLeftmostDate, scrollLeft, currentBoardId);
      lastSavedPositionRef.current = {
        boardId: currentBoardId,
        date: currentLeftmostDate,
        scrollLeft: scrollLeft
      };
      return;
    }
    
    // For manual scrolling, apply checks
    if (isBoardTransitioning || isRestoringPosition || isLoading || 
        isButtonNavigation || isProgrammaticScroll || !isDateRangeStable) {
      return;
    }
    
    // Check for duplicate saves
    const lastSaved = lastSavedPositionRef.current;
    if (lastSaved && 
        lastSaved.boardId === currentBoardId && 
        lastSaved.date === currentLeftmostDate && 
        Math.abs(lastSaved.scrollLeft - scrollLeft) < 5) {
      return;
    }
    
    // console.log(`💾 [GanttView] Debounced save for board ${currentBoardId}: {leftmostDate: '${currentLeftmostDate}', scrollLeft: ${scrollLeft}}`);
    
    // Update last saved position
    lastSavedPositionRef.current = {
      boardId: currentBoardId,
      date: currentLeftmostDate,
      scrollLeft: scrollLeft
    };
    
    // Save the position
    saveScrollPosition(currentLeftmostDate, scrollLeft, currentBoardId);
  }, [boardId, dateRange, isBoardTransitioning, isRestoringPosition, 
      isLoading, isButtonNavigation, isProgrammaticScroll, isDateRangeStable, saveScrollPosition]);


  // Helper function to wait for DOM updates and calculate accurate scroll position
  const waitForDOMAndScrollToToday = useCallback(async (targetRange: any[], delay: number = 200) => {
    // Wait for DOM to be fully updated
    await new Promise(resolve => setTimeout(resolve, delay));
    
    const newTodayIndex = targetRange.findIndex(d => d.isToday);
    
    if (newTodayIndex >= 0 && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const timelineContainer = container.querySelector('.gantt-timeline-container');
      if (timelineContainer) {
        // Force a reflow to ensure the DOM is fully updated
        timelineContainer.offsetHeight;
        
        const totalWidth = timelineContainer.scrollWidth;
        const columnWidth = totalWidth / targetRange.length;
        const scrollLeft = newTodayIndex * columnWidth;
        const targetScroll = scrollLeft - (container.clientWidth / 2);
        
        
        setIsProgrammaticScroll(true);
        container.scrollTo({
          left: Math.max(0, targetScroll),
          behavior: 'smooth'
        });
        
        setTimeout(() => {
          saveCurrentScrollPosition();
          setIsProgrammaticScroll(false);
        }, 300);
      }
    }
  }, [saveCurrentScrollPosition]);

  // Simple debounced scroll handler - only saves after user stops scrolling
  const handleManualScroll = useCallback(() => {
    if (isProgrammaticScroll || isRestoringPosition || isLoading || isButtonNavigation) {
      return; // Skip during programmatic operations, restoration, loading, or button navigation
    }
    
    // Only save via debounced handler, not immediately
    // This prevents saving unstable positions during active scrolling
    // saveCurrentScrollPosition();
  }, [isProgrammaticScroll, isRestoringPosition, isLoading, isButtonNavigation]);


  // Ref to store the debounce timeout so we can cancel it
  const debouncedTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced version - DISABLED for manual scrolling to prevent unstable saves
  const debouncedScrollHandler = useMemo(() => {
    return () => {
      // Cancel any pending save
      if (debouncedTimeoutRef.current) {
        clearTimeout(debouncedTimeoutRef.current);
      }
      
      // Re-enable saving for manual scrolling after a long delay
      debouncedTimeoutRef.current = setTimeout(() => {
        // Double-check we're still on the same board
        if (!isLoading && !isButtonNavigation && !isProgrammaticScroll && 
            !isRestoringPosition && !isBoardTransitioning && boardId) {
          saveCurrentScrollPosition();
        }
      }, 3000);
    };
  }, [boardId]); // Simplified dependencies to prevent infinite re-renders

  // Reset initialization flag when board changes
  useEffect(() => {
    // console.log(`🔄 [GanttView] Board changed to: ${boardId}`);
    
    // CRITICAL: Cancel any pending scroll save from the previous board
    if (debouncedTimeoutRef.current) {
      // console.log(`🚫 [GanttView] Canceling pending scroll save from previous board`);
      clearTimeout(debouncedTimeoutRef.current);
      debouncedTimeoutRef.current = null;
    }
    
    setIsBoardTransitioning(true); // Start transition
    setIsInitialRangeSet(false);
    setLastSavedScrollDate(null);
    setIsProgrammaticScroll(false);
    setIsRestoringPosition(false);
    setViewportCenter(null); // Clear viewport center to allow saved position restoration
    setIsGridReady(false); // Hide grid until ready
    setPendingScrollRestore(null); // Clear any pending restoration
    
    // Reset scroll position to prevent interference
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = 0;
    }
    
    // Reset loading protection counters
    setEarlierLoadCount(0);
    setLaterLoadCount(0);
    setLastLoadTime(0);
    
    // Clear any pending scroll position saves to prevent cross-contamination
    lastSavedScrollDateRef.current = null;
    restorationAttemptedRef.current = false;
    
    // Reset all saving-related state to prevent cross-contamination
    saveQueueRef.current = null;
    isSavingRef.current = false;
    setIsSavingScrollPosition(false);
    lastRestorationTimeRef.current = 0;
    lastSavedPositionRef.current = null;
  }, [boardId]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel any pending save when component unmounts
      if (debouncedTimeoutRef.current) {
        clearTimeout(debouncedTimeoutRef.current);
      }
    };
  }, []);

  // Add scroll event listener for manual scroll detection
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      // SIMPLIFIED: Only handle debounced scroll saving, no loading during manual scroll
      // This prevents any jumping or performance issues during scrolling
      debouncedScrollHandler();
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [debouncedScrollHandler]); // Simplified dependencies to prevent infinite re-renders

  // Initialize date range based on tasks or default around today
  useEffect(() => {
    // Only run on initial load of a board - never re-run after that
    if (isInitialRangeSet && dateRange.length > 0) {
      return;
    }
    
    // console.log(`🔄 [GanttView] Initializing date range for board: ${boardId}`);
    
    const initializeDateRange = async () => {
      // Double-check we haven't already initialized for this board
      if (isInitialRangeSet && dateRange.length > 0) {
        // console.log(`⚠️ [GanttView] Date range already initialized, skipping`);
        return;
      }
      
      // Check for saved scroll position for this specific board FIRST
      let centerDate = new Date(); // Default to today
      let savedPositionDate = null;
      
      // Use viewportCenter if available (e.g., from Today button or Jump to task)
      if (viewportCenter) {
        centerDate = new Date(viewportCenter);
      } else if (boardId) {
        try {
          const preferences = await loadUserPreferencesAsync();
          const savedPosition = preferences.ganttScrollPositions?.[boardId];
          
          // console.log(`🔍 [GanttView] Checking saved position for board ${boardId}:`, { savedPosition, preferences });
          
          if (savedPosition?.date) {
            // Use saved position as center date for this board to avoid flash
            centerDate = parseLocalDate(savedPosition.date);
            savedPositionDate = savedPosition.date;
            // console.log(`📍 [GanttView] Using saved position as center date: ${savedPosition.date}`);
          } else {
            // console.log(`📍 [GanttView] No saved position, using today as center: ${centerDate.toISOString().split('T')[0]}`);
          }
        } catch (error) {
          // console.log(`📍 [GanttView] Error loading preferences, using today as center: ${centerDate.toISOString().split('T')[0]}`);
        }
      }
      
      // Find task date bounds
      let earliestTaskDate: Date | null = null;
      let latestTaskDate: Date | null = null;
      
      ganttTasks.forEach(task => {
        if (task.startDate) {
          if (!earliestTaskDate || task.startDate < earliestTaskDate) {
            earliestTaskDate = task.startDate;
          }
        }
        if (task.endDate) {
          if (!latestTaskDate || task.endDate > latestTaskDate) {
            latestTaskDate = task.endDate;
          }
        }
      });
      
      // If no saved position, determine center point from tasks or default to today
      if (!boardId) {
        if (earliestTaskDate && latestTaskDate) {
          // Center between earliest and latest task
          const midTime = (earliestTaskDate as Date).getTime() + ((latestTaskDate as Date).getTime() - (earliestTaskDate as Date).getTime()) / 2;
          centerDate = new Date(midTime);
        }
        // If no tasks, centerDate remains as today (default)
      }
      
      // Only set viewportCenter if we don't have a saved position (to avoid interfering with restoration)
      if (!savedPositionDate) {
        setViewportCenter(centerDate);
        
        // Clear viewportCenter after using it to avoid interfering with future board loads
        if (viewportCenter) {
          setTimeout(() => setViewportCenter(null), 100); // Clear after range is set
        }
      } else {
      }
      
      // Initial range: 6 months total (3 months before and after center) for larger buffer
      const initialMonths = 3;
      const startDate = new Date(centerDate);
      startDate.setMonth(startDate.getMonth() - initialMonths);
      startDate.setDate(1); // Start of month
      
      const endDate = new Date(centerDate);
      endDate.setMonth(endDate.getMonth() + initialMonths);
      endDate.setDate(0); // End of previous month (last day)
      endDate.setDate(endDate.getDate() + 1); // Move to first day of next month
      const daysInMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate();
      endDate.setDate(daysInMonth); // Last day of month
      
      // console.log(`📅 [GanttView] Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
      
      const initialRange = generateDateRange(startDate, endDate);
      startTransition(() => {
        setDateRange(initialRange);
      });
      setIsInitialRangeSet(true); // Mark initial range as set
      setIsBoardTransitioning(false); // End transition
      
      // console.log(`📅 [GanttView] Generated ${initialRange.length} dates, first: ${initialRange[0]?.date.toISOString().split('T')[0]}, last: ${initialRange[initialRange.length-1]?.date.toISOString().split('T')[0]}`);
      
      // Set pending scroll restoration if we have a saved position
      if (savedPositionDate && !restorationAttemptedRef.current) {
        // console.log(`🔄 [GanttView] Setting pending restoration - savedDate: ${savedPositionDate}`);
        restorationAttemptedRef.current = true; // Prevent duplicate restorations
        lastRestorationTimeRef.current = Date.now(); // Track restoration time
        
        // Set restoration flag immediately to prevent any saves during restoration
        setIsRestoringPosition(true);
        
        // Calculate scroll position from the saved date
        const savedDateIndex = initialRange.findIndex(d => d.date.toISOString().split('T')[0] === savedPositionDate);
        if (savedDateIndex >= 0) {
          const calculatedScrollLeft = savedDateIndex * 40; // 40px per column
          
          // Store the pending restoration
          setPendingScrollRestore({
            date: savedPositionDate,
            scrollLeft: calculatedScrollLeft
          });
          
          // console.log(`📍 [GanttView] Will restore to date ${savedPositionDate} at scroll position ${calculatedScrollLeft}`);
        }
        
        // Show grid but keep restoration flag on
        setIsGridReady(true);
      } else {
        // No saved position, show grid immediately
        // console.log(`✅ [GanttView] No saved position, showing grid immediately`);
        setIsGridReady(true);
        setIsBoardTransitioning(false);
      }
      
    };
    
    // Call the async initialization function
    initializeDateRange();
    
    // Fallback timeout to ensure grid shows even if something goes wrong
    const fallbackTimeout = setTimeout(() => {
      if (!isGridReady) {
        // console.log(`⚠️ [GanttView] Fallback timeout - forcing grid to show`);
        setIsGridReady(true);
        setIsBoardTransitioning(false);
      }
    }, 5000); // 5 second fallback
    
    return () => clearTimeout(fallbackTimeout);
  }, [generateDateRange, isInitialRangeSet, boardId, isGridReady]);

  // Effect to handle pending scroll restoration when DOM is ready
  useEffect(() => {
    if (pendingScrollRestore && scrollContainerRef.current && dateRange.length > 0 && isGridReady) {
      // console.log(`🎯 [GanttView] Executing pending scroll restoration`, {
      //   pendingDate: pendingScrollRestore.date,
      //   pendingScrollLeft: pendingScrollRestore.scrollLeft,
      //   hasScrollContainer: !!scrollContainerRef.current
      // });
      
      // Restore the scroll position
      scrollContainerRef.current.scrollLeft = pendingScrollRestore.scrollLeft;
      
      // console.log(`✅ [GanttView] Restored scroll position for board ${boardId}`);
      
      // Clear the pending restoration
      setPendingScrollRestore(null);
      
      // Clear restoration flags after a delay
      setTimeout(() => {
        setIsRestoringPosition(false);
        setIsBoardTransitioning(false);
        // Clear restoration attempt flag after a longer delay to prevent immediate saves
        setTimeout(() => {
          restorationAttemptedRef.current = false;
        }, 3000);
      }, 500);
    }
  }, [pendingScrollRestore, dateRange.length, isGridReady, boardId]);

  // Separate effect to handle viewportCenter scrolling after dateRange is updated
  useEffect(() => {
    if (viewportCenter && dateRange.length > 0 && scrollContainerRef.current) {
      const targetDateStr = viewportCenter.toISOString().split('T')[0];
      const targetIndex = dateRange.findIndex(d => d.date.toISOString().split('T')[0] === targetDateStr);
      
      if (targetIndex >= 0) {
        // Wait for DOM to be fully updated with retry mechanism
        const waitForTimelineContainer = (retries = 0) => {
          const container = scrollContainerRef.current;
          if (!container) return;
          
          // Force a reflow to ensure DOM is fully updated
          container.offsetHeight;
          
          // Look for the timeline container in the sticky header (not in the main scroll container)
          const stickyHeader = document.querySelector('[data-sticky-header="true"]');
          let timelineContainer = null;
          
          if (stickyHeader) {
            const timelineContainers = stickyHeader.querySelectorAll('.gantt-timeline-container');
            
            // Find the container with actual scroll width (the day numbers row)
            for (const container of timelineContainers) {
              if (container.scrollWidth > 0) {
                timelineContainer = container;
                break;
              }
            }
          }
          
          if (!timelineContainer) {
            if (retries < 10) {
              setTimeout(() => waitForTimelineContainer(retries + 1), 100);
              return;
            } else {
              setViewportCenter(null);
              return;
            }
          }
          
          // Get the actual rendered width of the timeline
          const totalWidth = timelineContainer.scrollWidth;
          const columnWidth = totalWidth / dateRange.length;
          
          // Calculate the exact position of today's column
          const todayColumnLeft = targetIndex * columnWidth;
          const todayColumnCenter = todayColumnLeft + (columnWidth / 2);
          const containerCenter = container.clientWidth / 2;
          const targetScroll = todayColumnCenter - containerCenter;
          
          setIsProgrammaticScroll(true);
          container.scrollTo({
            left: Math.max(0, targetScroll),
            behavior: 'smooth'
          });
          
          // Verify the scroll position after animation and make corrections if needed
          setTimeout(() => {
            const actualScroll = container.scrollLeft;
            const actualTodayPosition = actualScroll + containerCenter;
            const expectedTodayPosition = todayColumnCenter;
            const offset = Math.abs(actualTodayPosition - expectedTodayPosition);
            
            if (offset > 20) {
              // Make a correction scroll to get exactly centered
              const correctionScroll = targetScroll;
              container.scrollTo({
                left: Math.max(0, correctionScroll),
                behavior: 'smooth'
              });
              
              // Final verification after correction
              setTimeout(() => {
                setIsProgrammaticScroll(false);
                // Save position after programmatic scroll flag is cleared
                setTimeout(() => {
                  saveCurrentScrollPosition();
                }, 50);
                setViewportCenter(null);
              }, 200);
            } else {
              setIsProgrammaticScroll(false);
              // Save position after programmatic scroll flag is cleared
              setTimeout(() => {
                saveCurrentScrollPosition();
              }, 50);
              setViewportCenter(null);
            }
          }, 600); // Increased delay to ensure smooth scroll completes
        };
        
        // Start the retry mechanism
        setTimeout(() => waitForTimelineContainer(), 100);
      } else {
        setViewportCenter(null); // Clear if not found
      }
    }
  }, [dateRange, viewportCenter, saveCurrentScrollPosition]);

  // Load earlier dates (6 months for much larger buffer)
  const loadEarlier = useCallback(async () => {
    if (dateRange.length === 0) return;
    
    // Store current scroll position BEFORE loading
    const currentScrollLeft = scrollContainerRef.current?.scrollLeft || 0;
    
    setIsLoading(true);
    setIsDateRangeStable(false); // Mark as unstable during loading
    
    try {
      const firstDate = dateRange[0].date;
      const newStartDate = new Date(firstDate);
      newStartDate.setMonth(newStartDate.getMonth() - 2); // Load only 2 months at a time
      newStartDate.setDate(1); // Start of month
      
      const newEndDate = new Date(firstDate);
      newEndDate.setDate(newEndDate.getDate() - 1); // Day before current first date
      
      const newDates = generateDateRange(newStartDate, newEndDate);
      
      // Prepend new dates
      const updatedRange = [...newDates, ...dateRange];
      
      // Memory management: Keep max 6 months (180 days) to reduce memory usage
      const maxDays = 180;
      const finalRange = updatedRange.length > maxDays 
        ? updatedRange.slice(0, maxDays) 
        : updatedRange;
      
      // Use startTransition to make this update non-blocking
      startTransition(() => {
        setDateRange(finalRange);
      });
      
      // Wait for DOM update before adjusting scroll position
      await new Promise(resolve => setTimeout(resolve, 25));
      
      // Adjust scroll position to account for new dates prepended
      if (scrollContainerRef.current) {
        const scrollAdjustment = newDates.length * 40; // 40px per column
        scrollContainerRef.current.scrollLeft = currentScrollLeft + scrollAdjustment;
      }
      
      // DISABLED: Don't save scroll position after loading earlier dates during manual scrolling
      // This prevents saving unstable positions when dateRange is changing
      // setTimeout(() => {
      //   if (finalRange.length > 0) {
      //     saveCurrentScrollPosition();
      //   }
      // }, 100);
      
    } finally {
      setIsLoading(false);
      // Mark as stable after a delay to ensure everything is settled
      setTimeout(() => setIsDateRangeStable(true), 500);
    }
  }, [dateRange, generateDateRange, saveCurrentScrollPosition]);

  // Load later dates (6 months for much larger buffer)
  const loadLater = useCallback(async () => {
    if (dateRange.length === 0) return;
    
    // Store current scroll position BEFORE loading
    const currentScrollLeft = scrollContainerRef.current?.scrollLeft || 0;
    
    setIsLoading(true);
    setIsDateRangeStable(false); // Mark as unstable during loading
    
    try {
      const lastDate = dateRange[dateRange.length - 1].date;
      const newStartDate = new Date(lastDate);
      newStartDate.setDate(newStartDate.getDate() + 1); // Day after current last date
      
      const newEndDate = new Date(lastDate);
      newEndDate.setMonth(newEndDate.getMonth() + 2); // Load only 2 months at a time
      const daysInMonth = new Date(newEndDate.getFullYear(), newEndDate.getMonth() + 1, 0).getDate();
      newEndDate.setDate(daysInMonth); // Last day of month
      
      const newDates = generateDateRange(newStartDate, newEndDate);
      
      // Append new dates
      const updatedRange = [...dateRange, ...newDates];
      
      // Memory management: Keep max 6 months (180 days) to reduce memory usage
      const maxDays = 180;
      let finalRange = updatedRange;
      let scrollAdjustment = 0;
      
      if (updatedRange.length > maxDays) {
        // Calculate how many days we're trimming from the start
        const trimCount = updatedRange.length - maxDays;
        finalRange = updatedRange.slice(trimCount);
        // We need to adjust scroll position by the trimmed amount
        scrollAdjustment = trimCount * 40; // 40px per column
      }
      
      // Use startTransition to make this update non-blocking
      startTransition(() => {
        setDateRange(finalRange);
      });
      
      // Wait for DOM update before adjusting scroll position
      await new Promise(resolve => setTimeout(resolve, 25));
      
      // Adjust scroll position to account for trimmed dates
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = currentScrollLeft - scrollAdjustment;
      }
      
      // DISABLED: Don't save scroll position after loading later dates during manual scrolling
      // This prevents saving unstable positions when dateRange is changing
      // setTimeout(() => {
      //   if (finalRange.length > 0) {
      //     saveCurrentScrollPosition();
      //   }
      // }, 100);
      
    } finally {
      setIsLoading(false);
      // Mark as stable after a delay to ensure everything is settled
      setTimeout(() => setIsDateRangeStable(true), 500);
    }
  }, [dateRange, generateDateRange, saveCurrentScrollPosition]);

  // Update refs for scroll handler access
  loadEarlierRef.current = loadEarlier;
  loadLaterRef.current = loadLater;
  
  // Cache DOM elements for performance optimization
  useEffect(() => {
    const stickyHeader = document.querySelector('[data-sticky-header="true"]') as HTMLElement;
    const timelineContainers = document.querySelectorAll('.gantt-timeline-container');
    
    stickyHeaderRef.current = stickyHeader;
    timelineContainersRef.current = Array.from(timelineContainers) as HTMLElement[];
  }, [dateRange.length]); // Re-cache when date range changes

  // Proactive timeline management - check if we need more dates before scrolling
  const checkAndLoadDates = useCallback(async () => {
    if (!scrollContainerRef.current || dateRange.length === 0) return false;
    
    const currentScroll = scrollContainerRef.current.scrollLeft;
    const viewportWidth = scrollContainerRef.current.clientWidth;
    const totalWidth = scrollContainerRef.current.scrollWidth;
    const columnWidth = 40;
    
    // Buffer zone: load more dates when we're within 2 viewport widths of the edge
    const bufferZone = viewportWidth * 2;
    
    // Check if we need earlier dates
    if (currentScroll < bufferZone) {
      // console.log(`🔄 [GanttView] Near beginning, loading earlier dates...`);
      await loadEarlier();
      return true;
    }
    
    // Check if we need later dates
    if (currentScroll > totalWidth - viewportWidth - bufferZone) {
      // console.log(`🔄 [GanttView] Near end, loading later dates...`);
      await loadLater();
      return true;
    }
    
    return false;
  }, [dateRange.length, loadEarlier, loadLater]);

  // Enhanced scroll handler with seamless date loading for manual scrolling
  const handleManualScrollEnhanced = useCallback(() => {
    if (isProgrammaticScroll || isRestoringPosition || isLoading || isButtonNavigation) {
      return; // Skip during programmatic operations, restoration, loading, or button navigation
    }
    
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || dateRange.length === 0) return;
    
    const currentScroll = scrollContainer.scrollLeft;
    const viewportWidth = scrollContainer.clientWidth;
    const totalWidth = scrollContainer.scrollWidth;
    const columnWidth = 40; // Fixed 40px column width
    
    // Much larger threshold for seamless preloading (30 columns = 1200px)
    // This ensures dates are loaded well before user reaches the edge
    const threshold = columnWidth * 30;
    
    // OPTIMIZED: Load dates during manual scrolling with performance optimizations
    // This enables seamless infinite scrolling while preventing performance issues
    
    // Check if we need to load earlier dates (with more aggressive cooldown)
    if (currentScroll < threshold) {
      const now = Date.now();
      if (now - lastLoadTime > 500) { // Much longer cooldown for smoother scrolling
        setLastLoadTime(now);
        // Use setTimeout for less aggressive loading
        setTimeout(() => {
          loadEarlier().catch(() => {});
        }, 50);
      }
    }
    
    // Check if we need to load later dates (with more aggressive cooldown)
    if (currentScroll > totalWidth - viewportWidth - threshold) {
      const now = Date.now();
      if (now - lastLoadTime > 500) { // Much longer cooldown for smoother scrolling
        setLastLoadTime(now);
        // Use setTimeout for less aggressive loading
        setTimeout(() => {
          loadLater().catch(() => {});
        }, 50);
      }
    }
    
    // DISABLED: Don't save scroll position during manual wheel scrolling
    // This prevents saving unstable positions when dateRange is changing
    // saveCurrentScrollPosition();
  }, [isProgrammaticScroll, isRestoringPosition, isLoading, isButtonNavigation, saveCurrentScrollPosition, loadEarlier, loadLater]);

  // Create a memoized date-to-index map for O(1) lookups instead of O(n) linear search
  const dateToIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    dateRange.forEach((dateCol, index) => {
      const dateStr = dateCol.date.toISOString().split('T')[0];
      map.set(dateStr, index);
    });
    return map;
  }, [dateRange]);


  // Navigation functions
  const scrollToToday = useCallback(async () => {
    const today = new Date();
    
    // Check if today is already in current range
    const todayIndex = dateRange.findIndex(d => d.isToday);
    
    if (todayIndex >= 0 && scrollContainerRef.current) {
      // Today is already visible - scroll directly to center it
      const container = scrollContainerRef.current;
      
      // Use consistent column width calculation
      const columnWidth = 40; // Fixed 40px column width
      const scrollLeft = todayIndex * columnWidth;
      const targetScroll = scrollLeft - (container.clientWidth / 2); // Center it
      
      
      setIsProgrammaticScroll(true);
      container.scrollTo({
        left: Math.max(0, targetScroll),
        behavior: 'smooth'
      });
      
      setTimeout(() => {
        setIsProgrammaticScroll(false);
        setTimeout(() => {
          saveCurrentScrollPosition({ immediate: true });
        }, 50);
      }, 300);
    } else {
      // Today not in range - create a new focused range around today and scroll directly
      
      // Create a new 4-month range centered on today
      const newStart = new Date(today);
      const newEnd = new Date(today);
      newStart.setMonth(newStart.getMonth() - 2);
      newEnd.setMonth(newEnd.getMonth() + 2);
      
      const focusedRange = generateDateRange(newStart, newEnd);
      startTransition(() => {
        setDateRange(focusedRange);
      });
      
      // Wait for the new range to be set, then scroll directly to today
      setTimeout(() => {
        if (scrollContainerRef.current) {
          const newTodayIndex = focusedRange.findIndex(d => d.isToday);
          if (newTodayIndex >= 0) {
            const container = scrollContainerRef.current;
            const columnWidth = 40; // Fixed 40px column width
            const scrollLeft = newTodayIndex * columnWidth;
            const targetScroll = scrollLeft - (container.clientWidth / 2);
            
            
            setIsProgrammaticScroll(true);
            container.scrollTo({
              left: Math.max(0, targetScroll),
              behavior: 'smooth'
            });
            
            setTimeout(() => {
              setIsProgrammaticScroll(false);
              setTimeout(() => {
                saveCurrentScrollPosition();
              }, 50);
            }, 300);
          }
        }
      }, 100);
    }
  }, [dateRange, generateDateRange, saveCurrentScrollPosition, getColumnWidth]);
  
  const scrollToTask = useCallback(async (startDate: Date, endDate: Date, position?: string) => {
    if (!scrollContainerRef.current) return;
    
    const targetDateStr = startDate.toISOString().split('T')[0];
    
    // Check if target date is already in current range
    const targetIndex = dateRange.findIndex(d => 
      d.date.toISOString().split('T')[0] === targetDateStr
    );
    
    if (targetIndex >= 0) {
      // Target is already visible - scroll directly to it
      const container = scrollContainerRef.current;
      
      // Use consistent column width calculation (look in sticky header)
      const stickyHeader = document.querySelector('[data-sticky-header="true"]') as HTMLElement;
      let timelineContainer = null;
      if (stickyHeader) {
        const timelineContainers = stickyHeader.querySelectorAll('.gantt-timeline-container');
        for (const container of timelineContainers) {
          if (container.scrollWidth > 0) {
            timelineContainer = container;
            break;
          }
        }
      }
      
      if (timelineContainer) {
        const totalWidth = timelineContainer.scrollWidth;
        const columnWidth = totalWidth / dateRange.length;
        const scrollLeft = targetIndex * columnWidth;
        
        // Calculate target scroll position based on position parameter
        let targetScroll;
        if (position === 'start-left') {
          targetScroll = scrollLeft; // Position at left edge
        } else if (position === 'center') {
          targetScroll = scrollLeft - (container.clientWidth / 2); // Center it
        } else if (position === 'end-right') {
          // For latest task, we need to use the end date
          const endDateStr = endDate.toISOString().split('T')[0];
          const endIndex = dateRange.findIndex(d => 
            d.date.toISOString().split('T')[0] === endDateStr
          );
          if (endIndex >= 0) {
            const endScrollLeft = endIndex * columnWidth;
            // Position so the end date is at the right edge of the viewport
            targetScroll = endScrollLeft - container.clientWidth + columnWidth;
          } else {
            targetScroll = scrollLeft - (container.clientWidth * 2 / 3); // Fallback
          }
        } else {
          targetScroll = scrollLeft - (container.clientWidth / 3); // Default: 1/3 from left
        }
        
        
        setIsProgrammaticScroll(true);
        container.scrollTo({
          left: Math.max(0, targetScroll),
          behavior: 'smooth'
        });
        
        setTimeout(() => {
          setIsProgrammaticScroll(false);
          setTimeout(() => {
            saveCurrentScrollPosition();
          }, 50);
        }, 300);
      } else {
      }
    } else {
      // Target not in range - expand range to include it
      const currentStart = dateRange[0]?.date;
      const currentEnd = dateRange[dateRange.length - 1]?.date;
      
      if (currentStart && currentEnd) {
        // Determine how to expand the range
        let newStart = new Date(Math.min(currentStart.getTime(), startDate.getTime()));
        let newEnd = new Date(Math.max(currentEnd.getTime(), startDate.getTime()));
        
        // Add some buffer around the target
        newStart.setMonth(newStart.getMonth() - 1);
        newEnd.setMonth(newEnd.getMonth() + 1);
        
        
        // Generate expanded range
        const expandedRange = generateDateRange(newStart, newEnd);
        startTransition(() => {
          setDateRange(expandedRange);
        });
        
        // After range updates, scroll to the target
        setTimeout(() => {
          const newTargetIndex = expandedRange.findIndex(d => 
            d.date.toISOString().split('T')[0] === targetDateStr
          );
          
          if (newTargetIndex >= 0 && scrollContainerRef.current) {
            const container = scrollContainerRef.current;
            
            // Use consistent column width calculation (look in sticky header)
            const stickyHeader = document.querySelector('[data-sticky-header="true"]') as HTMLElement;
            let timelineContainer = null;
            if (stickyHeader) {
              const timelineContainers = stickyHeader.querySelectorAll('.gantt-timeline-container');
              for (const container of timelineContainers) {
                if (container.scrollWidth > 0) {
                  timelineContainer = container;
                  break;
                }
              }
            }
            
            if (timelineContainer) {
              const totalWidth = timelineContainer.scrollWidth;
              const columnWidth = totalWidth / expandedRange.length;
              const scrollLeft = newTargetIndex * columnWidth;
              
              // Calculate target scroll position based on position parameter
              let targetScroll;
              if (position === 'start-left') {
                targetScroll = scrollLeft; // Position at left edge
              } else if (position === 'center') {
                targetScroll = scrollLeft - (container.clientWidth / 2); // Center it
              } else if (position === 'end-right') {
                // For latest task, we need to use the end date
                const endDateStr = endDate.toISOString().split('T')[0];
                const endIndex = expandedRange.findIndex(d => 
                  d.date.toISOString().split('T')[0] === endDateStr
                );
                if (endIndex >= 0) {
                  const endScrollLeft = endIndex * columnWidth;
                  // Position so the end date is at the right edge of the viewport
                  targetScroll = endScrollLeft - container.clientWidth + columnWidth;
                } else {
                  targetScroll = scrollLeft - (container.clientWidth * 2 / 3); // Fallback
                }
              } else {
                targetScroll = scrollLeft - (container.clientWidth / 3); // Default: 1/3 from left
              }
              
              
              setIsProgrammaticScroll(true);
              container.scrollTo({
                left: Math.max(0, targetScroll),
                behavior: 'smooth'
              });
              
              // Wait for scroll to complete, then save position normally
              setTimeout(() => {
                setIsProgrammaticScroll(false);
                // Save the current position (the expanded range will be saved, but restoration will find the date)
                setTimeout(() => {
                  saveCurrentScrollPosition();
                }, 200);
              }, 500);
            } else {
            }
          } else {
          }
        }, 200); // Increased delay for DOM update
      }
    }
  }, [dateRange, generateDateRange, saveCurrentScrollPosition]);

  // Unified navigation function that handles both scrolling and date loading
  const navigateToPast = useCallback(async () => {
    if (!scrollContainerRef.current || dateRange.length === 0) return;
    
    setIsProgrammaticScroll(true);
    setIsButtonNavigation(true);
    setIsLoading(true);
    
    // Failsafe timeout to ensure loading state is cleared
    const failsafeTimeout = setTimeout(() => {
      // console.log('⚠️ [GanttView] Failsafe: clearing loading state');
      setIsLoading(false);
      setIsButtonNavigation(false);
      setIsProgrammaticScroll(false);
    }, 5000);
    
    try {
      const container = scrollContainerRef.current;
      const viewportWidth = container.clientWidth;
      const columnWidth = 40; // Fixed column width
      
      // Calculate how many columns fit in the viewport
      const columnsPerPage = Math.floor(viewportWidth / columnWidth);
      const pageWidth = columnsPerPage * columnWidth;
      
      // Get current scroll before any operations
      let currentScroll = container.scrollLeft;
      const currentColumnIndex = Math.floor(currentScroll / columnWidth);
      
      // Check if we're near the beginning and need to load more dates
      if (currentColumnIndex < columnsPerPage * 2) { // Reduced buffer since we load less data
        await loadEarlier();
        // Wait for DOM update and scroll adjustment
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Re-read scroll position after new dates are prepended
        currentScroll = container.scrollLeft;
      }
      
      // Calculate target scroll position (one page back)
      const targetScroll = Math.max(0, currentScroll - pageWidth);
      
      // Only scroll if we can actually move backward
      if (targetScroll < currentScroll) {
        container.scrollTo({
          left: targetScroll,
          behavior: 'smooth'
        });
      }
      
      // Save position after navigation
      setTimeout(() => {
        clearTimeout(failsafeTimeout);
        saveCurrentScrollPosition({ immediate: true });
        setIsProgrammaticScroll(false);
        setIsButtonNavigation(false);
        setIsLoading(false);
      }, 600);
      
    } catch (error) {
      // console.error('Error navigating to past:', error);
      clearTimeout(failsafeTimeout);
      setIsProgrammaticScroll(false);
      setIsButtonNavigation(false);
      setIsLoading(false);
    }
  }, [loadEarlier, saveCurrentScrollPosition]);

  // Add navigation in progress ref to prevent rapid clicks
  const navigationInProgressRef = useRef(false);

  // Enhanced scroll functions with smooth scrolling and dynamic loading
  const scrollEarlier = useCallback(() => {
    // Prevent multiple simultaneous navigation calls
    if (isLoading || isButtonNavigation || navigationInProgressRef.current) return;
    
    navigationInProgressRef.current = true;
    navigateToPast();
    
    // Reset after a delay to prevent rapid clicks
    setTimeout(() => {
      navigationInProgressRef.current = false;
    }, 1000);
  }, [navigateToPast, isLoading, isButtonNavigation]);
  
  // Unified navigation function that handles both scrolling and date loading
  const navigateToFuture = useCallback(async () => {
    if (!scrollContainerRef.current || dateRange.length === 0) return;
    
    setIsProgrammaticScroll(true);
    setIsButtonNavigation(true);
    setIsLoading(true);
    
    // Failsafe timeout to ensure loading state is cleared
    const failsafeTimeout = setTimeout(() => {
      // console.log('⚠️ [GanttView] Failsafe: clearing loading state');
      setIsLoading(false);
      setIsButtonNavigation(false);
      setIsProgrammaticScroll(false);
    }, 5000);
    
    try {
      const container = scrollContainerRef.current;
      const viewportWidth = container.clientWidth;
      const columnWidth = 40; // Fixed column width
      
      // Calculate how many columns fit in the viewport
      const columnsPerPage = Math.floor(viewportWidth / columnWidth);
      const pageWidth = columnsPerPage * columnWidth;
      
      // Get current scroll before any operations
      let currentScroll = container.scrollLeft;
      const currentColumnIndex = Math.floor(currentScroll / columnWidth);
      
      // Check if we need to load more dates BEFORE trying to scroll
      const remainingColumns = dateRange.length - currentColumnIndex;
      if (remainingColumns < columnsPerPage * 2) { // Reduced buffer since we load less data
        await loadLater();
        // Wait for DOM update and any trimming to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Re-read scroll position after potential trimming
        currentScroll = container.scrollLeft;
      }
      
      // Now calculate the target scroll position
      const totalWidth = container.scrollWidth;
      const maxScroll = totalWidth - viewportWidth;
      const targetScroll = Math.min(maxScroll, currentScroll + pageWidth);
      
      // Only scroll if we can actually move forward
      if (targetScroll > currentScroll) {
        container.scrollTo({
          left: targetScroll,
          behavior: 'smooth'
        });
      }
      
      // Save position after navigation
      setTimeout(() => {
        clearTimeout(failsafeTimeout);
        saveCurrentScrollPosition({ immediate: true });
        setIsProgrammaticScroll(false);
        setIsButtonNavigation(false);
        setIsLoading(false);
      }, 600);
      
    } catch (error) {
      // console.error('Error navigating to future:', error);
      clearTimeout(failsafeTimeout);
      setIsProgrammaticScroll(false);
      setIsButtonNavigation(false);
      setIsLoading(false);
    }
  }, [loadLater, saveCurrentScrollPosition, dateRange]);

  const scrollLater = useCallback(() => {
    // Prevent multiple simultaneous navigation calls
    if (isLoading || isButtonNavigation || navigationInProgressRef.current) return;
    
    navigationInProgressRef.current = true;
    navigateToFuture();
    
    // Reset after a delay to prevent rapid clicks
    setTimeout(() => {
      navigationInProgressRef.current = false;
    }, 1000);
  }, [navigateToFuture, isLoading, isButtonNavigation]);


  // Simple viewport (all dates always visible)
  const virtualViewport = useMemo(() => ({
    startIndex: 0,
    endIndex: dateRange.length - 1,
    totalRange: dateRange.length,
    visibleDates: dateRange,
    canLoadEarlier: true,
    canLoadLater: true
  }), [dateRange]);


  // Calculate task bar grid position
  // Optimized task bar grid position calculation using fast O(1) lookups
  const getTaskBarGridPosition = useCallback((task: GanttTask) => {
    if (!task.startDate || !task.endDate) return null;
    
    const taskStartStr = task.startDate.toISOString().split('T')[0];
    const taskEndStr = task.endDate.toISOString().split('T')[0];
    
    // Fast O(1) lookup instead of O(n) linear search - MAJOR PERFORMANCE IMPROVEMENT
    let startDayIndex = dateToIndexMap.get(taskStartStr) ?? -1;
    let endDayIndex = dateToIndexMap.get(taskEndStr) ?? -1;
    
    // Handle dates outside visible range
    if (startDayIndex === -1 || endDayIndex === -1) {
      if (dateRange.length === 0) return null;
      
      const firstDate = dateRange[0].date;
      const lastDate = dateRange[dateRange.length - 1].date;
      
      // Task starts before visible range
      if (task.startDate < firstDate) {
        startDayIndex = 0;
      } else if (task.startDate > lastDate) {
        return null; // Task starts after visible range
      }
      
      // Task ends after visible range
      if (task.endDate > lastDate) {
        endDayIndex = dateRange.length - 1;
      } else if (task.endDate < firstDate) {
        return null; // Task ends before visible range
      }
    }
    
    // Ensure we have valid indices
    if (startDayIndex === -1 || endDayIndex === -1) return null;
    
    // Return grid column positions (1-indexed, no task info column in timeline)
    const result = {
      gridColumnStart: startDayIndex + 1, // +1 because grid is 1-indexed  
      gridColumnEnd: endDayIndex + 2,     // +2 because: 1-indexed + span end
      startDayIndex,
      endDayIndex
    };
    
    // Fix for 1-day tasks: ensure they span exactly 1 column
    if (startDayIndex === endDayIndex) {
      result.gridColumnEnd = result.gridColumnStart + 1; // 1-day task spans exactly 1 column
    }
    
    return result;
  }, [dateToIndexMap, dateRange]);


  // Helper function to determine text color based on background
  const getContrastColor = (hexColor: string): string => {
    // Remove # if present
    const color = hexColor.replace('#', '');
    
    // Convert to RGB
    const r = parseInt(color.substr(0, 2), 16);
    const g = parseInt(color.substr(2, 2), 16);
    const b = parseInt(color.substr(4, 2), 16);
    
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Return black for light backgrounds, white for dark backgrounds
    return luminance > 0.5 ? '#000000' : '#ffffff';
  };

  // Limit visible tasks during drag operations to prevent DOM thrashing (optimized)
  const visibleTasks = useMemo(() => {
    // During drag operations, limit to max 20 tasks to prevent performance issues
    if (activeDragItem && reorderedGanttTasks.length > 20) {
      // Find the dragged task and show a window around it
      const draggedTaskIndex = reorderedGanttTasks.findIndex(t => t.id === (activeDragItem as GanttDragItem).taskId);
      if (draggedTaskIndex >= 0) {
        const start = Math.max(0, draggedTaskIndex - 10);
        const end = Math.min(reorderedGanttTasks.length, draggedTaskIndex + 10);
        return reorderedGanttTasks.slice(start, end);
      }
      return reorderedGanttTasks.slice(0, 20);
    }
    return reorderedGanttTasks;
  }, [reorderedGanttTasks, (activeDragItem as GanttDragItem)?.taskId]); // Only depend on taskId, not entire activeDragItem

  // Debounced task position calculation to prevent forced reflows
  const [taskPositionsCache, setTaskPositionsCache] = useState<Map<string, {x: number, y: number, width: number, height: number}>>(new Map());
  const taskPositionsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get actual DOM positions of task bars for dependency arrows (debounced)
  const calculateTaskPositions = useCallback(() => {
    const positions = new Map<string, {x: number, y: number, width: number, height: number}>();
    
    if (!visibleTasks || visibleTasks.length === 0) {
      return positions;
    }
    
    // Get the timeline container for coordinate reference
    const timelineContainer = scrollContainerRef.current;
    if (!timelineContainer) return positions;
    
    // Use requestAnimationFrame to batch DOM measurements
    if (taskPositionsTimeoutRef.current) {
      clearTimeout(taskPositionsTimeoutRef.current);
    }
    
    // For initial load, use immediate calculation to ensure arrows appear
    const isInitialLoad = taskPositionsCache.size === 0;
    const delay = isInitialLoad ? 0 : 16; // No delay for initial load, 16ms for subsequent updates
    
    taskPositionsTimeoutRef.current = setTimeout(() => {
      const containerRect = timelineContainer.getBoundingClientRect();
      
      visibleTasks.forEach((task, taskIndex) => {
        // Find the actual task row element
        const taskRowElement = timelineContainer.querySelector(`[data-task-id="${task.id}"]`);
        if (!taskRowElement) return;
        
        // Find the colored task bar within the row - try multiple selectors
        let taskBarElement = taskRowElement.querySelector('.h-6.rounded') || 
                            taskRowElement.querySelector('[style*="background"]') ||
                            taskRowElement.querySelector('.absolute');
        
        if (!taskBarElement) {
          // Fallback: calculate position based on task data
          const taskStartDate = task.startDate ? new Date(task.startDate) : null;
          const taskEndDate = task.endDate ? new Date(task.endDate) : null;
          
          if (!taskStartDate || !taskEndDate) return;
          
          const startDateIndex = dateRange.findIndex(d => 
            d.date.toDateString() === taskStartDate.toDateString()
          );
          const endDateIndex = dateRange.findIndex(d => 
            d.date.toDateString() === taskEndDate.toDateString()
          );
          
          if (startDateIndex === -1 || endDateIndex === -1) return;
          
          const columnWidth = 40; // Fixed 40px column width
          const taskHeight = taskViewMode === 'compact' ? 48 : 
                            taskViewMode === 'shrink' ? 80 : 80;
          
          const x = startDateIndex * columnWidth;
          const y = taskIndex * taskHeight;
          const width = Math.max(1, (endDateIndex - startDateIndex + 1) * columnWidth);
          const height = taskHeight;
          
          positions.set(task.id, { x, y, width, height });
          return;
        }
        
        const taskBarRect = taskBarElement.getBoundingClientRect();
        
        // Use DOM positions for accurate visual alignment
        if (taskBarRect.width > 0 && taskBarRect.height > 0) {
          // Calculate position relative to the timeline container
          const x = taskBarRect.left - containerRect.left + timelineContainer.scrollLeft;
          const y = taskBarRect.top - containerRect.top;
          const width = taskBarRect.width;
          const height = taskBarRect.height;
          
          positions.set(task.id, { x, y, width, height });
        } else {
          // Fallback to calculated position
          const taskStartDate = task.startDate ? new Date(task.startDate) : null;
          const taskEndDate = task.endDate ? new Date(task.endDate) : null;
          
          if (!taskStartDate || !taskEndDate) return;
          
          const startDateIndex = dateRange.findIndex(d => 
            d.date.toDateString() === taskStartDate.toDateString()
          );
          const endDateIndex = dateRange.findIndex(d => 
            d.date.toDateString() === taskEndDate.toDateString()
          );
          
          if (startDateIndex === -1 || endDateIndex === -1) return;
          
          const columnWidth = 40; // Fixed 40px column width
          const taskHeight = taskViewMode === 'compact' ? 48 : 
                            taskViewMode === 'shrink' ? 80 : 80;
          
          const x = startDateIndex * columnWidth;
          const y = taskIndex * taskHeight;
          const width = Math.max(1, (endDateIndex - startDateIndex + 1) * columnWidth);
          const height = taskHeight;
          
          positions.set(task.id, { x, y, width, height });
        }
      });
      
      // Update cache and trigger re-render
      setTaskPositionsCache(positions);
    }, delay); // Dynamic delay: immediate for initial load, 16ms for updates
    
    return taskPositionsCache;
  }, [dateRange, taskViewMode]); // Removed visibleTasks and scrollContainerRef to prevent infinite re-renders

  // State to force task positions recalculation after DOM updates
  const [forceTaskPositionsRecalculation, setForceTaskPositionsRecalculation] = useState(0);

  // Force task positions recalculation when view mode changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setForceTaskPositionsRecalculation(prev => prev + 1);
    }, 300); // Delay to allow CSS changes to take effect
    
    return () => clearTimeout(timer);
  }, [taskViewMode]);

  // Memoized task positions for arrows
  const taskPositions = useMemo(() => {
    // Use cached positions to avoid forced reflows
    return taskPositionsCache;
  }, [taskPositionsCache, forceTaskPositionsRecalculation]);

  // Force arrow recalculation when task positions become available
  // Removed - arrows now handle their own smart updates

  // Arrow position updates now handled by TaskDependencyArrows component internally

  // Force initial arrow calculation when component mounts and tasks are available
  useEffect(() => {
    if (reorderedGanttTasks.length > 0) {
      // Small delay to ensure DOM is rendered
      const timer = setTimeout(() => {
        // Trigger task position calculation
        calculateTaskPositions();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [reorderedGanttTasks.length]); // Removed calculateTaskPositions to prevent infinite re-renders
  
  // Also recalculate positions when relationships are loaded AND grid is ready
  useEffect(() => {
    if (localRelationships.length > 0 && reorderedGanttTasks.length > 0 && isGridReady) {
      // console.log('📊 [GanttView] Relationships loaded and grid ready, scheduling task position calculation');
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        // Additional small delay to ensure task bars are rendered
        setTimeout(() => {
          // console.log('📊 [GanttView] Calculating task positions for arrows');
          calculateTaskPositions(0); // 0 delay for immediate calculation
        }, 150); // Increased delay to ensure DOM is fully ready
      });
    }
  }, [localRelationships.length, reorderedGanttTasks.length, isGridReady]); // Removed calculateTaskPositions to prevent infinite re-renders

  // Mathematical collision detection for precise drop positioning
  const calculatePreciseDropPosition = useCallback((event: DragEndEvent | DragOverEvent) => {
    // Only work for task movement/resizing, not row reordering
    const activeDragItem = event.active.data.current as AnyDragItem;
    
    if (!activeDragItem || 
        ((activeDragItem as SortableTaskRowItem).type === 'task-row-reorder' || 
         ((activeDragItem as GanttDragItem).dragType !== DRAG_TYPES.TASK_START_HANDLE && 
          (activeDragItem as GanttDragItem).dragType !== DRAG_TYPES.TASK_END_HANDLE && 
          (activeDragItem as GanttDragItem).dragType !== DRAG_TYPES.TASK_MOVE_HANDLE && 
          (activeDragItem as GanttDragItem).dragType !== DRAG_TYPES.TASK_BODY))) {
      return null;
    }
    
    // Work for any date cell, not just density cells
    if (!event.over?.data?.current?.date) return null;
    
    // For handle drags, we still need to calculate the precise position
    // This is important for accurate date calculation
    
    // Get the exact mouse position - try both current and translated rects
    const draggedElement = event.active.rect.current.translated || event.active.rect.current.initial;
    if (!draggedElement) return null;
    
    // For task movement, use the main timeline container (not task-specific container)
    const timelineContainer = scrollContainerRef.current?.querySelector('.gantt-timeline-container');
    if (!timelineContainer) return null;
    
    // Calculate exact column based on mouse position relative to timeline
    const rect = timelineContainer.getBoundingClientRect();
    const relativeX = draggedElement.left - rect.left;
    const columnWidth = rect.width / dateRange.length;
    const exactColumn = Math.floor(relativeX / columnWidth);
    
    // Clamp to valid range
    const clampedColumn = Math.max(0, Math.min(exactColumn, dateRange.length - 1));
    
    return {
      dateIndex: clampedColumn,
      date: dateRange[clampedColumn]?.date.toISOString().split('T')[0]
    };
  }, [dateRange]);

  // Memoized priority color lookup for performance
  const priorityColorMap = useMemo(() => {
    const map = new Map<string, any>();
    priorities.forEach(p => {
      map.set(p.priority.toLowerCase(), {
        backgroundColor: p.color,
        color: getContrastColor(p.color)
      });
    });
    // Add fallback
    map.set('__fallback__', { backgroundColor: '#007bff', color: '#ffffff' });
    return map;
  }, [priorities]);

  const getPriorityColor = useCallback((priority: string) => {
    return priorityColorMap.get(priority?.toLowerCase()) || priorityColorMap.get('__fallback__');
  }, [priorityColorMap]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleTaskClick = (task: GanttTask) => {
    // Don't open task if we're in drag mode
    if (activeDragItem) return;
    
    // Find the original task object to pass to onSelectTask
    const originalTask = Object.values(columns)
      .flatMap(column => column.tasks)
      .find(t => t.id === task.id);
    
    if (originalTask) {
      onSelectTask(originalTask);
    }
  };

  // Helper function to get original task from GanttTask
  const getOriginalTask = (ganttTask: GanttTask): Task | null => {
    return Object.values(columns)
      .flatMap(column => column.tasks)
      .find(t => t.id === ganttTask.id) || null;
  };

  // DnD-Kit handlers for task bar dragging (outer context)
  const handleTaskBarDragStart = useCallback((event: DragStartEvent) => {
    const dragStartTime = performance.now();
    const dragData = event.active.data.current as any;
    
    // Task bar drag start initiated
    
    // Only handle task bar drags, not row reordering
    if (dragData?.dragType && dragData.dragType !== 'task-row-reorder') {
      const refSetTime = performance.now();
      // Setting refs
      
      // Set ref immediately for synchronous access
      activeDragItemRef.current = dragData;
      isTaskBarDraggingRef.current = true;
      
      // Batch state updates to prevent conflicts
      const stateUpdateTime = performance.now();
      // Scheduling state updates
      
      requestAnimationFrame(() => {
        const stateUpdateExecTime = performance.now();
        // Executing state updates
        
        setActiveDragItem(dragData);
        setCurrentHoverDate(null);
      });
      
      // Only call onTaskDragStart for task bar drags
      if (onTaskDragStart && (dragData as GanttDragItem).taskId) {
        const taskLookupTime = performance.now();
        // Looking up task for parent
        
        const taskForParent = Object.values(columns)
          .flatMap(col => col.tasks)
          .find(t => t.id === (dragData as GanttDragItem).taskId);
        
        if (taskForParent) {
          const parentCallTime = performance.now();
          // Calling onTaskDragStart
          
          onTaskDragStart(taskForParent);
          
          const parentCallCompleteTime = performance.now();
          // onTaskDragStart completed
        }
      }
      
      const endTime = performance.now();
      // Task bar drag start completed
    }
  }, [onTaskDragStart]); // Removed columns dependency to prevent re-renders

  // DnD-Kit handlers for task list reordering (inner context)
  const handleTaskListDragStart = useCallback((event: DragStartEvent) => {
    const dragData = event.active.data.current as any;
    
    // Only handle task row reordering
    if ((dragData as SortableTaskRowItem).type === 'task-row-reorder') {
      // Debug logging removed to prevent console spam
      
      // Batch state updates to prevent conflicts
      requestAnimationFrame(() => {
        setActiveDragItem(dragData);
        activeDragItemRef.current = dragData;
        setCurrentHoverDate(null);
      });
    }
  }, []);

  const handleTaskListDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    const currentActiveDragItem = activeDragItemRef.current;
    
    // Only handle task row reordering
    if ((currentActiveDragItem as SortableTaskRowItem)?.type === 'task-row-reorder') {
      const isDropZone = over?.id?.toString().startsWith('drop-zone-');
      
      console.log('🔍 [GanttView] Task list drag over:', {
        activeId: active.id,
        overId: over?.id,
        overData: over?.data?.current,
        isDropZone
      });
      
      // Track if we're hovering over a drop zone
      setIsHoveringDropZone(isDropZone);
      
      // If hovering over a drop zone, prevent the sortable from trying to reorder
      if (isDropZone) {
        // Set cross-column drop state to prevent snap-back
        setIsCrossColumnDrop(true);
        // Don't let the sortable handle this - we want smooth dragging
        return;
      } else {
        // Reset cross-column drop state when not hovering over drop zone
        setIsCrossColumnDrop(false);
      }
    }
  }, [setIsHoveringDropZone, setIsCrossColumnDrop]); // Added state setters to dependencies

  const handleTaskListDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    const currentActiveDragItem = activeDragItemRef.current;
    
    console.log('🔍 [GanttView] Task list drag end:', {
      activeId: active.id,
      overId: over?.id,
      currentActiveDragItem,
      isTaskRowReorder: (currentActiveDragItem as SortableTaskRowItem)?.type === 'task-row-reorder'
    });
    
    // Only handle task row reordering
    if ((currentActiveDragItem as SortableTaskRowItem).type === 'task-row-reorder') {
      
      if (over && active.id !== over.id) {
        const activeTaskId = active.id as string;
        const overId = over.id as string;
        
        // Find the active task
        const activeTask = Object.values(columns)
          .flatMap(col => col.tasks)
          .find(t => t.id === activeTaskId);
        
        if (!activeTask) return;
        
        // Check if dropping on a column drop zone (cross-column move)
        if (overId && overId.startsWith('drop-zone-')) {
          const targetColumnId = overId.replace('drop-zone-', '');
          
          console.log('🔍 [GanttView] Cross-column drop detected:', {
            activeTaskId,
            targetColumnId,
            activeTaskColumnId: activeTask.columnId,
            isDifferentColumn: activeTask.columnId !== targetColumnId
          });
        
          // Set cross-column drop state to prevent snap-back
          setIsCrossColumnDrop(true);
        
          if (activeTask.columnId !== targetColumnId) {
            // Move task to different column
            const sourceColumn = columns[activeTask.columnId];
            const targetColumn = columns[targetColumnId];
            
            if (sourceColumn && targetColumn) {
              // Remove task from source column
              const sourceTasks = sourceColumn.tasks.filter(t => t.id !== activeTaskId);
              
              // Add task to target column at position 0
              const targetTasks = [activeTask, ...targetColumn.tasks];
              
              // Update positions for source column tasks
              sourceTasks.forEach((task, index) => {
                if (task.position !== index) {
                  onUpdateTask({
                    ...task,
                    position: index
                  });
                }
              });
              
              // Update positions for target column tasks (including moved task)
              targetTasks.forEach((task, index) => {
                onUpdateTask({
                  ...task,
                  columnId: targetColumnId,
                  position: index
                });
              });
            }
          }
          
          // Clear drag state immediately for cross-column drops to prevent snap-back
          setActiveDragItem(null);
          activeDragItemRef.current = null;
          isTaskBarDraggingRef.current = false;
          setIsHoveringDropZone(false);
          
          // Reset cross-column drop state after a short delay to allow the move to complete
          setTimeout(() => {
            setIsCrossColumnDrop(false);
          }, 100);
          
          return;
        } else {
          // Handle task reordering within the same column
          const overTask = Object.values(columns)
            .flatMap(col => col.tasks)
            .find(t => t.id === overId);
          
          if (overTask && activeTask.columnId === overTask.columnId) {
            const column = columns[activeTask.columnId];
            if (column) {
              const taskIndex = column.tasks.findIndex(t => t.id === activeTaskId);
              const overIndex = column.tasks.findIndex(t => t.id === overId);
              
              if (taskIndex !== -1 && overIndex !== -1) {
                // Create new tasks array with updated positions
                const newTasks = [...column.tasks];
                const [movedTask] = newTasks.splice(taskIndex, 1);
                newTasks.splice(overIndex, 0, movedTask);
                
                // Update positions for all affected tasks
                newTasks.forEach((task, index) => {
                  if (task.position !== index) {
                    onUpdateTask({
                      ...task,
                      position: index
                    });
                  }
                });
              }
            }
          }
        }
      }
      
      // Clear drag state for all other cases
      setActiveDragItem(null);
      activeDragItemRef.current = null;
      isTaskBarDraggingRef.current = false;
      setIsHoveringDropZone(false);
    }
  }, [onUpdateTask, setIsCrossColumnDrop, setIsHoveringDropZone]); // Removed columns dependency, added state setters

  // Legacy handler for backward compatibility
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const legacyDragStartTime = performance.now();
    const dragData = event.active.data.current as any;
    
    console.log(`🔄 [GanttView] Legacy drag start initiated [${legacyDragStartTime.toFixed(2)}ms]:`, {
      id: event.active.id,
      dragType: dragData?.dragType,
      taskId: dragData?.taskId,
      taskTitle: dragData?.taskTitle
    });
    
    // Only log task bar drags, not row reordering
    if (dragData?.dragType && dragData.dragType !== 'task-row-reorder') {
      const legacyLogTime = performance.now();
      console.log(`📝 [GanttView] Legacy task bar drag logged [${(legacyLogTime - legacyDragStartTime).toFixed(2)}ms]`);
    }
    
    // Batch state updates to prevent conflicts
    const legacyStateUpdateTime = performance.now();
    console.log(`⚡ [GanttView] Legacy scheduling state updates [${(legacyStateUpdateTime - legacyDragStartTime).toFixed(2)}ms]`);
    
    requestAnimationFrame(() => {
      const legacyStateExecTime = performance.now();
      console.log(`🔄 [GanttView] Legacy executing state updates [${(legacyStateExecTime - legacyDragStartTime).toFixed(2)}ms]`);
      
    setActiveDragItem(dragData);
      activeDragItemRef.current = dragData;
    setCurrentHoverDate(null);
    });
    
    // Only call onTaskDragStart for non-sortable items to prevent conflicts
    if (onTaskDragStart && (dragData as GanttDragItem).taskId) {
      const legacyTaskLookupTime = performance.now();
      console.log(`🔍 [GanttView] Legacy looking up task for parent [${(legacyTaskLookupTime - legacyDragStartTime).toFixed(2)}ms]`);
      
      // For other drag types, use taskId
        const taskForParent = Object.values(columns)
          .flatMap(col => col.tasks)
        .find(t => t.id === (dragData as GanttDragItem).taskId);
        
        if (taskForParent) {
          onTaskDragStart(taskForParent);
      }
    }
    // Note: For sortable task rows, we don't call onTaskDragStart to prevent conflicts
  }, [onTaskDragStart]); // Removed columns dependency to prevent re-renders

  // Throttle drag over updates for better performance
  const throttledSetHoverDate = useCallback((date: string) => {
    requestAnimationFrame(() => {
      setCurrentHoverDate(date);
    });
  }, [setCurrentHoverDate]); // Added state setter to dependencies

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    const currentActiveDragItem = activeDragItemRef.current;
    
    // Debug logging removed for clean console
    
    if (over && currentActiveDragItem) {
      // Ignore row reordering - let sortable handle it
      if ((currentActiveDragItem as SortableTaskRowItem).type === 'task-row-reorder') {
        return;
      }
      
      console.log('🔄 Drag over:', over.id);
      
      const dropData = over.data.current as { date: string; dateIndex: number; isDensityCell?: boolean };
      
      // For visual feedback during drag, prioritize direct dropData for responsiveness
      let targetDate = dropData.date;
      
      // Only use precise calculation for final positioning (not for visual feedback)
      // This ensures smooth cursor following during drag
      const dragType = (currentActiveDragItem as GanttDragItem).dragType;
      if (dragType === DRAG_TYPES.TASK_MOVE_HANDLE) {
        // For task movement, use dropData.date directly for better visual feedback
        targetDate = dropData.date;
      }
      
      // Only update if the date has actually changed to avoid unnecessary re-renders
      if (currentHoverDate !== targetDate) {
        // console.log('🔄 [GanttView] Updating hover date:', {
        //   from: currentHoverDate,
        //   to: targetDate,
        //   dragType: (currentActiveDragItem as GanttDragItem).dragType
        // });
        // Use requestAnimationFrame for smoother updates
        requestAnimationFrame(() => {
          throttledSetHoverDate(targetDate);
        });
      }
    }
  }, [throttledSetHoverDate]); // Removed activeDragItem and currentHoverDate to prevent re-renders

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const currentActiveDragItem = activeDragItemRef.current;
    const { over } = event;
    
    // Debug logging removed for clean console
    
    // CRITICAL: Always clear parent drag state immediately when drag ends
    // This ensures board tabs return to normal even if drag processing fails
    if (onTaskDragEnd) {
      // console.log('🏁 [GanttView] Immediately clearing parent drag state');
      onTaskDragEnd();
    }
    
    if (!over || !currentActiveDragItem) {
      // console.log('🏁 [GanttView] No valid drop target or activeDragItem:', {
      //   hasOver: !!over,
      //   hasActiveDragItem: !!currentActiveDragItem,
      //   overId: over?.id,
      //   overData: over?.data?.current
      // });
      setActiveDragItem(null);
      activeDragItemRef.current = null;
      isTaskBarDraggingRef.current = false;
      setCurrentHoverDate(null); // Clear hover state when no valid drag
      
      return;
    }

    // Handle task row reordering (vertical drag)
    if ((currentActiveDragItem as SortableTaskRowItem).type === 'task-row-reorder') {
      const draggedTask = (currentActiveDragItem as SortableTaskRowItem).task;
      const targetTask = over.data.current?.task;
      
      // Only proceed if both tasks are in the same column
      if (targetTask && draggedTask.columnId !== targetTask.columnId) {
        setActiveDragItem(null);
        activeDragItemRef.current = null;
        setCurrentHoverDate(null);
        return;
      }
      
      if (targetTask && draggedTask.id !== targetTask.id) {
        // Find the column for the dragged task
        const taskColumn = Object.values(columns).find(col => 
          col.tasks.some(t => t.id === draggedTask.id)
        );
        
        if (taskColumn && onUpdateTask) {
          // Get all tasks in the same column, sorted by current order
          const columnTasks = [...taskColumn.tasks].sort((a, b) => (a.position || 0) - (b.position || 0));
          
          // Find indices within the column only
          const draggedIndex = columnTasks.findIndex(t => t.id === draggedTask.id);
          const targetIndex = columnTasks.findIndex(t => t.id === targetTask.id);
          
          if (draggedIndex !== -1 && targetIndex !== -1) {
            // Create new array with reordered tasks
            const newTasks = [...columnTasks];
            const [draggedTaskData] = newTasks.splice(draggedIndex, 1);
            newTasks.splice(targetIndex, 0, draggedTaskData);
            
            // Update positions for all affected tasks
            newTasks.forEach((task, index) => {
              if (task.position !== index) {
                onUpdateTask({
                  ...task,
                  position: index
                });
              }
            });
          }
        }
      }
      
      // Clear drag state
      setActiveDragItem(null);
      activeDragItemRef.current = null;
      isTaskBarDraggingRef.current = false;
      setCurrentHoverDate(null);
      return;
    }

    // Handle cross-column drop on separator
    if (((currentActiveDragItem as GanttDragItem)?.dragType === DRAG_TYPES.TASK_BODY || (currentActiveDragItem as GanttDragItem)?.dragType === DRAG_TYPES.TASK_MOVE_HANDLE) && over.data.current?.type === 'separator-drop') {
      // Find the dragged task from the columns
      const draggedTask = Object.values(columns)
        .flatMap(column => column.tasks)
        .find(t => t.id === (currentActiveDragItem as GanttDragItem).taskId);
      
      if (!draggedTask) {
        setActiveDragItem(null);
        activeDragItemRef.current = null;
        activeDragItemRef.current = null;
        setCurrentHoverDate(null);
        return;
      }
      
      const targetColumnId = over.data.current.columnId;
      
      if (draggedTask.columnId !== targetColumnId) {
        // Find the target column
        const targetColumn = columns[targetColumnId];
        if (targetColumn && onUpdateTask) {
          // Move task to target column at the end
          const targetPosition = targetColumn.tasks.length;
          
          // Update the dragged task
          onUpdateTask({
            ...draggedTask,
            columnId: targetColumnId,
            position: targetPosition
          });
          
          // Recalculate positions for source column
          const sourceColumn = columns[draggedTask.columnId];
          if (sourceColumn) {
            const sourceTasks = sourceColumn.tasks
              .filter(t => t.id !== draggedTask.id)
              .sort((a, b) => (a.position || 0) - (b.position || 0));
            
            sourceTasks.forEach((task, index) => {
              if (task.position !== index) {
                onUpdateTask({
                  ...task,
                  position: index
                });
              }
            });
          }
          
          // Recalculate positions for target column
          const targetTasks = [...targetColumn.tasks, { ...draggedTask, columnId: targetColumnId, position: targetPosition }]
            .sort((a, b) => (a.position || 0) - (b.position || 0));
          
          targetTasks.forEach((task, index) => {
            if (task.position !== index) {
              onUpdateTask({
                ...task,
                position: index
              });
            }
          });
        }
      }
      
      // Clear drag state
      setActiveDragItem(null);
        activeDragItemRef.current = null;
      setCurrentHoverDate(null);
      setHoveredSeparator(null);
      if (onTaskDragEnd) {
        onTaskDragEnd();
      }
      return;
    }

    // Handle cross-group drop (move task to different column)
    // Check if we're dragging from a different group, even if the drop is on a task row
    const isCrossGroupDrag = (activeDragItem as SortableTaskRowItem)?.type === 'task-row-reorder' && 
      (activeDragItem as SortableTaskRowItem).task.columnId !== over.data.current?.columnId;
    
    if ((activeDragItem as SortableTaskRowItem)?.type === 'task-row-reorder' && 
        (over.data.current?.type === 'group-drop' || isCrossGroupDrag)) {
      const draggedTask = (activeDragItem as SortableTaskRowItem).task;
      const targetColumnId = over.data.current?.type === 'group-drop' 
        ? over.data.current.columnId 
        : (over.data.current as any)?.columnId; // Get columnId from task row data
      
      // Only proceed if moving to a different column
      if (draggedTask.columnId === targetColumnId) {
        setActiveDragItem(null);
        activeDragItemRef.current = null;
        setCurrentHoverDate(null);
        if (onTaskDragEnd) {
          onTaskDragEnd();
        }
        return;
      }
      
      if (onUpdateTask) {
        // Find the target column
        const targetColumn = columns[targetColumnId];
        
        if (targetColumn) {
          // Get all tasks in target column, sorted by position
          const targetTasks = [...targetColumn.tasks].sort((a, b) => (a.position || 0) - (b.position || 0));
          
          // Create new task order: dragged task at position 0, then all existing tasks
          const newTargetTasks = [draggedTask, ...targetTasks];
          
          // Collect all tasks that need to be updated
          const tasksToUpdate = [];
          
          // Add target column tasks
          newTargetTasks.forEach((task, index) => {
            const fullTask = Object.values(columns)
        .flatMap(col => col.tasks)
              .find(t => t.id === task.id);
            
            if (fullTask) {
              tasksToUpdate.push({
                ...fullTask,
                columnId: targetColumnId,
                position: index
              });
            }
          });
          
          // Add source column tasks
          const sourceColumn = columns[draggedTask.columnId];
          if (sourceColumn) {
            const sourceTasks = sourceColumn.tasks
              .filter(t => t.id !== draggedTask.id)
              .sort((a, b) => (a.position || 0) - (b.position || 0));
            
            sourceTasks.forEach((task, index) => {
              const fullTask = Object.values(columns)
                .flatMap(col => col.tasks)
                .find(t => t.id === task.id);
              
              if (fullTask) {
                tasksToUpdate.push({
                  ...fullTask,
                  position: index
                });
              }
            });
          }
          
          // Update all tasks in sequence
          for (const task of tasksToUpdate) {
            await onUpdateTask(task);
          }
          
          // Refresh data to ensure UI is in sync with backend
          if (onRefreshData) {
            if (process.env.NODE_ENV === 'development') {
              console.log('🔄 [GanttView] Calling onRefreshData (task update)');
            }
            await onRefreshData();
          }
        }
      }
      
      // Clear drag state
      setActiveDragItem(null);
        activeDragItemRef.current = null;
      setCurrentHoverDate(null);
      setHoveredGroup(null);
      setIsDraggingOverGroup(null);
      if (onTaskDragEnd) {
        onTaskDragEnd();
      }
      return;
    }

    // Handle within-group row reordering (same column only)
    if (activeDragItem && (activeDragItem as SortableTaskRowItem).type === 'task-row-reorder' && over.data.current?.type === 'task-row-reorder') {
      const draggedTask = (activeDragItem as SortableTaskRowItem).task;
      const targetTask = over.data.current.task;
      
      // Only proceed if both tasks are in the same column
      if (draggedTask.columnId !== targetTask.columnId) {
        return;
      }
      
      if (draggedTask.id !== targetTask.id) {
        // Find the column for the dragged task
        const taskColumn = Object.values(columns).find(col => 
          col.tasks.some(t => t.id === draggedTask.id)
        );
        
        if (taskColumn) {
          // Get all tasks in the same column, sorted by current order
          const columnTasks = [...taskColumn.tasks].sort((a, b) => (a.position || 0) - (b.position || 0));
          
          // Find indices within the column only
          const draggedIndex = columnTasks.findIndex(t => t.id === draggedTask.id);
          const targetIndex = columnTasks.findIndex(t => t.id === targetTask.id);
          
          if (draggedIndex !== -1 && targetIndex !== -1) {
            // Create new order with updated positions within the column
            const newOrder = [...columnTasks];
            const [movedTask] = newOrder.splice(draggedIndex, 1);
            newOrder.splice(targetIndex, 0, movedTask);
            
            // Update positions for all tasks in the column
            newOrder.forEach((task, index) => {
              if (task.position !== index) {
                // Find the full task object from the original columns
                const fullTask = Object.values(columns)
                  .flatMap(col => col.tasks)
                  .find(t => t.id === task.id);
                
                if (fullTask) {
                  onUpdateTask({
                    ...fullTask,
                    position: index
                  });
                }
              }
            });
          }
        }
      }
      
      // Clear drag state
      setActiveDragItem(null);
        activeDragItemRef.current = null;
      setCurrentHoverDate(null);
      setHoveredGroup(null);
      setIsDraggingOverGroup(null);
      if (onTaskDragEnd) {
        onTaskDragEnd();
      }
      return;
    }

    // Only handle task drag operations (not row reordering)
    const dragType = (currentActiveDragItem as GanttDragItem).dragType;
    const startTime = performance.now();
    // Checking drag type
    
    if (dragType === DRAG_TYPES.TASK_START_HANDLE || 
        dragType === DRAG_TYPES.TASK_END_HANDLE || 
        dragType === DRAG_TYPES.TASK_MOVE_HANDLE || 
        dragType === DRAG_TYPES.TASK_BODY) {
      
      // Check if dropping on a sortable row (for reordering) - ignore for task movement
      if (over.data.current?.type === 'task-row-reorder') {
        return;
      }
      
      // Use mathematical collision detection for density cells, otherwise use direct drop data
      const precisePosition = calculatePreciseDropPosition(event);
      const dropData = over.data.current as { date: string; dateIndex: number; isDensityCell?: boolean };
      const targetDate = precisePosition?.date || dropData.date;
      
      // Drop data analysis
      
      if ((currentActiveDragItem as GanttDragItem).dragType === DRAG_TYPES.TASK_START_HANDLE || (currentActiveDragItem as GanttDragItem).dragType === DRAG_TYPES.TASK_END_HANDLE || (currentActiveDragItem as GanttDragItem).dragType === DRAG_TYPES.TASK_MOVE_HANDLE) {
      }
      
      // Check if targetDate is valid before proceeding
      if (!targetDate) {
        // No valid target date, aborting drag end
        return;
      }
      
      
      const proceedingTime = performance.now();
      // Proceeding with task update
      
      // Note: onTaskDragStart already called in handleDragStart, no need to call again here

    try {
      // Find the original task
      const originalTask = Object.values(columns)
        .flatMap(column => column.tasks)
        .find(t => t.id === (currentActiveDragItem as GanttDragItem).taskId);

      if (!originalTask) {
        return;
      }

        // Calculate the updated task efficiently
        const updatedTask = { ...originalTask };
        
        // Protection for tasks with null dueDate
        if (!originalTask.dueDate && originalTask.startDate) {
          // Set dueDate to startDate for null dueDate tasks
          updatedTask.dueDate = originalTask.startDate;
        }

        // Cast to GanttDragItem for task operations
        const taskDragItem = currentActiveDragItem as GanttDragItem;

      if ((currentActiveDragItem as GanttDragItem).dragType === DRAG_TYPES.TASK_START_HANDLE) {
        const currentEndDate = originalTask.dueDate;
        const newStartDate = (currentEndDate && targetDate > currentEndDate) ? currentEndDate : targetDate;
        // Convert to string format if it's a Date object
        updatedTask.startDate = newStartDate instanceof Date ? newStartDate.toISOString().split('T')[0] : newStartDate;
        
        // DISABLED: Testing if this is causing issues
        // setLocalTaskDates(prev => ({
        //   ...prev,
        //   [updatedTask.id]: {
        //     startDate: updatedTask.startDate,
        //     dueDate: updatedTask.dueDate || (originalTask.dueDate ? originalTask.dueDate.toISOString().split('T')[0] : updatedTask.startDate)
        //   }
        // }));
      } else if ((currentActiveDragItem as GanttDragItem).dragType === DRAG_TYPES.TASK_END_HANDLE) {
        const currentStartDate = originalTask.startDate;
        const newDueDate = (currentStartDate && targetDate < currentStartDate) ? currentStartDate : targetDate;
        // Convert to string format if it's a Date object
        updatedTask.dueDate = newDueDate instanceof Date ? newDueDate.toISOString().split('T')[0] : newDueDate;
        
        // DISABLED: Testing if this is causing issues
        // setLocalTaskDates(prev => ({
        //   ...prev,
        //   [updatedTask.id]: {
        //     startDate: updatedTask.startDate || (originalTask.startDate ? originalTask.startDate.toISOString().split('T')[0] : ''),
        //     dueDate: updatedTask.dueDate
        //   }
        // }));
      } else if ((currentActiveDragItem as GanttDragItem).dragType === DRAG_TYPES.TASK_MOVE_HANDLE) {
          const originalStart = new Date(taskDragItem.originalStartDate);
          const originalEnd = new Date(taskDragItem.originalEndDate);
          
          // Validate dates
          if (isNaN(originalStart.getTime()) || isNaN(originalEnd.getTime())) {
            return;
          }
          
          const taskDuration = originalEnd.getTime() - originalStart.getTime();
          const newStartDate = new Date(targetDate);
          
          // Validate target date
          if (isNaN(newStartDate.getTime())) {
            return;
          }
          
          const newEndDate = new Date(newStartDate.getTime() + taskDuration);
          
          // Validate calculated end date
          if (isNaN(newEndDate.getTime())) {
            return;
          }
        
        // Convert to string format for server
        updatedTask.startDate = targetDate instanceof Date ? targetDate.toISOString().split('T')[0] : targetDate;
        updatedTask.dueDate = newEndDate.toISOString().split('T')[0];
        
        // For single-day tasks, ensure both dates are exactly the same
        if (taskDuration === 0) {
          updatedTask.dueDate = updatedTask.startDate;
        }
        
        // DISABLED: Testing if this is causing issues
        // setLocalTaskDates(prev => ({
        //   ...prev,
        //   [updatedTask.id]: {
        //     startDate: updatedTask.startDate,
        //     dueDate: updatedTask.dueDate
        //   }
        // }));
      }

      // Use optimistic update (non-blocking) to prevent message handler violations
      if (onUpdateTask) {
        
        // Update task immediately - no delays
        try {
          const taskToUpdate = {
            ...originalTask,
            ...updatedTask,
            startDate: updatedTask.startDate,
            dueDate: updatedTask.dueDate || updatedTask.startDate
          };
          
          onUpdateTask(taskToUpdate);
          
          // Clear drag state immediately after update
          if (onTaskDragEnd) {
            onTaskDragEnd();
          }
          setActiveDragItem(null);
          activeDragItemRef.current = null;
          setCurrentHoverDate(null);
          
        } catch (error) {
          console.error('❌ [GanttView] Error updating task:', error);
          // Clear drag state even if update fails
          if (onTaskDragEnd) {
            onTaskDragEnd();
          }
          setActiveDragItem(null);
          activeDragItemRef.current = null;
          setCurrentHoverDate(null);
        }
      } else {
        // No update function, clear drag state immediately
        if (onTaskDragEnd) {
          onTaskDragEnd();
        }
        setActiveDragItem(null);
        activeDragItemRef.current = null;
        setCurrentHoverDate(null);
      }

      const endTime = performance.now();
      console.log(`✅ [GanttView] Drag operation completed [${(endTime - startTime).toFixed(2)}ms total]`);

      } catch (error) {
        // Clear drag state on error
        if (onTaskDragEnd) {
          onTaskDragEnd();
        }
      setActiveDragItem(null);
        activeDragItemRef.current = null;
      setCurrentHoverDate(null);
    }
    }
  }, [onTaskDragStart, onTaskDragEnd, onUpdateTask]); // Removed activeDragItem and columns to prevent re-renders

  // Handle row reordering
  const handleRowReorder = useCallback((dragData: RowDragData, targetIndex: number) => {
    const { taskId } = dragData;
    
    // Find the current index of the dragged task in the reordered array
    const currentIndex = reorderedGanttTasks.findIndex(task => task.id === taskId);
    
    // Don't reorder if dropping on the same position
    if (currentIndex === targetIndex) {
      return;
    }


    // Update the local task order
    setLocalTaskOrder(prevOrder => {
      const newOrder = [...prevOrder];
      const [movedTaskId] = newOrder.splice(currentIndex, 1);
      newOrder.splice(targetIndex, 0, movedTaskId);
      
      return newOrder;
    });

    // Force position recalculation after a short delay to ensure DOM is updated
    setTimeout(() => {
      // Trigger task position recalculation
      calculateTaskPositions(0);
    }, 100);
    
    // Find the task being moved for logging
    const taskToMove = reorderedGanttTasks.find(task => task.id === taskId);
    const targetTask = reorderedGanttTasks[targetIndex];
    
    if (taskToMove && targetTask) {
    } else {
    }
  }, [reorderedGanttTasks]);

  const handleTaskDrop = useCallback((dragData: GanttDragItem, targetDate: string) => {
    // This will be called by DateColumn, but the actual logic is in handleDragEnd
    // Keeping this minimal for performance
  }, []);

  // Get default priority name  
  const getDefaultPriorityName = (): string => {
    const defaultPriority = priorities.find(p => !!p.initial);
    return defaultPriority?.priority || 'Medium';
  };

  // Handle task creation with date range support
  const createTaskWithDateRange = useCallback(async (startDate: string, endDate: string) => {
    // Find the first column (position 0) to add the task to
    const firstColumn = Object.values(columns).find(col => col.position === 0);
    if (!firstColumn) {
      return;
    }

    // If we have advanced task creation capabilities, use them
    if (currentUser && members && boardId) {
      
      // Find current user member
      const currentUserMember = members.find(m => m.user_id === currentUser.id);
      if (!currentUserMember) {
        return;
      }

      // Create task with prefilled date range
      const newTask: Task = {
        id: generateUUID(),
        title: 'New Task',
        description: '',
        memberId: currentUserMember.id,
        startDate: startDate, // Pre-fill with start date
        dueDate: endDate || startDate, // Pre-fill with end date, fallback to start date
        effort: 1,
        columnId: firstColumn.id,
        position: 0,
        priority: getDefaultPriorityName(),
        requesterId: currentUserMember.id,
        boardId: boardId,
        comments: []
      };

      try {
        // Use createTaskAtTop for better positioning
        const createdTask = await createTaskAtTop(newTask);
        
        // Refresh data to get updated state
        if (onRefreshData) {
          if (process.env.NODE_ENV === 'development') {
            console.log('🔄 [GanttView] Calling onRefreshData');
          }
          await onRefreshData();
        }
        
        // Open the task in detail view for editing
        onSelectTask(createdTask);
        
      } catch (error) {
      }
    } else if (onAddTask) {
      // Fallback to basic task creation
      await onAddTask(firstColumn.id);
    }
  }, [columns, currentUser, members, boardId, onSelectTask, onAddTask]);

  // Handle mouse down for task creation (start of potential drag)
  const handleTaskCreationMouseDown = (dateString: string, event: React.MouseEvent) => {
    // Prevent if we're already dragging a task
    if (activeDragItem) return;
    
    event.preventDefault();
    setIsCreatingTask(true);
    setTaskCreationStart(dateString);
    setTaskCreationEnd(dateString); // Start with same date
  };

  // Handle mouse enter during task creation drag
  const handleTaskCreationMouseEnter = (dateString: string) => {
    if (isCreatingTask && taskCreationStart) {
      setTaskCreationEnd(dateString);
    }
  };

  // Handle mouse up to complete task creation
  const handleTaskCreationMouseUp = async (event: React.MouseEvent) => {
    if (isCreatingTask && taskCreationStart && taskCreationEnd) {
      event.preventDefault();
      
      // Determine start and end dates (handle drag in either direction)
      const startDateObj = parseLocalDate(taskCreationStart);
      const endDateObj = parseLocalDate(taskCreationEnd);
      
      const finalStartDate = startDateObj <= endDateObj ? taskCreationStart : taskCreationEnd;
      const finalEndDate = startDateObj <= endDateObj ? taskCreationEnd : taskCreationStart;
      
      
      // Clear creation state
      setIsCreatingTask(false);
      setTaskCreationStart(null);
      setTaskCreationEnd(null);
      
      // Create the task
      await createTaskWithDateRange(finalStartDate, finalEndDate);
    } else {
      // Clear state if something went wrong
      setIsCreatingTask(false);
      setTaskCreationStart(null);
      setTaskCreationEnd(null);
    }
  };

  // Handle creating a new task when clicking on empty grid space (backward compatibility)
  const handleCreateTaskOnDate = async (dateString: string) => {
    // For single click, create task with same start and due date
    await createTaskWithDateRange(dateString, dateString);
  };

  // Handle task jump from dropdown
  const handleJumpToTask = useCallback((task: GanttTask) => {
    if (!task.startDate || !task.endDate) {
      return;
    }


    // Use async wrapper to handle the promise
    (async () => {
    try {
      // First, scroll horizontally to the task
      await scrollToTask(task.startDate!, task.endDate!);
      
      // Wait for horizontal scroll to complete before highlighting
      setTimeout(() => {
        // Highlight the task for 1 second
        setHighlightedTaskId(task.id);
        setTimeout(() => {
          setHighlightedTaskId(null);
        }, 1000);
      }, 400); // Wait for horizontal scroll to complete
      
      // Scroll vertically to task if not visible (after horizontal scroll completes)
      setTimeout(() => {
        const taskElement = document.querySelector(`[data-task-id="${task.id}"]`);
        
        if (taskElement) {
          const taskRect = taskElement.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          
          // Check if task is outside the visible viewport (with buffer)
          const buffer = 100;
          const isAboveViewport = taskRect.top < buffer;
          const isBelowViewport = taskRect.bottom > viewportHeight - buffer;
          
          
          if (isAboveViewport || isBelowViewport) {
            
            // Find the scrollable parent (could be document or a parent container)
            let scrollableParent = taskElement.parentElement;
            while (scrollableParent && scrollableParent !== document.body) {
              const style = window.getComputedStyle(scrollableParent);
              if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflow === 'auto' || style.overflow === 'scroll') {
                break;
              }
              scrollableParent = scrollableParent.parentElement;
            }
            
            // If no scrollable parent found, use window scrolling
            if (!scrollableParent || scrollableParent === document.body) {
              // Scroll the page to bring task into view
              const targetY = window.pageYOffset + taskRect.top - (viewportHeight / 2) + (taskRect.height / 2);
              window.scrollTo({
                top: Math.max(0, targetY),
                behavior: 'smooth'
              });
            } else {
              // Scroll within the parent container
              const containerRect = scrollableParent.getBoundingClientRect();
              const relativeTop = taskRect.top - containerRect.top;
              const targetScrollTop = scrollableParent.scrollTop + relativeTop - (containerRect.height / 2) + (taskRect.height / 2);
              
              scrollableParent.scrollTo({
                top: Math.max(0, targetScrollTop),
                behavior: 'smooth'
              });
            }
          } else {
          }
        } else {
        }
      }, 600); // Wait longer for horizontal scroll to complete
      
    } catch (error) {
    }
    })();
  }, [scrollToTask]);

  // Add global mouse up listener for task creation
  useEffect(() => {
    const handleGlobalMouseUp = (event: MouseEvent) => {
      if (isCreatingTask) {
        // Convert to React event for compatibility
        const reactEvent = {
          preventDefault: () => event.preventDefault(),
          stopPropagation: () => event.stopPropagation()
        } as React.MouseEvent;
        handleTaskCreationMouseUp(reactEvent);
      }
    };

    if (isCreatingTask) {
      document.addEventListener('mouseup', handleGlobalMouseUp);
      return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [isCreatingTask, taskCreationStart, taskCreationEnd]);

  // Prevent browser back/forward navigation on macOS swipe - attach to entire Gantt component
  useEffect(() => {
    const ganttComponent = document.querySelector('.gantt-chart-container');
    if (!ganttComponent) return;

    const handleWheel = (event: Event) => {
      const wheelEvent = event as WheelEvent;
      // Only handle horizontal scrolling/swiping
      if (Math.abs(wheelEvent.deltaX) > Math.abs(wheelEvent.deltaY)) {
        const scrollContainer = scrollContainerRef.current;
        if (!scrollContainer) return;

        event.preventDefault();
        event.stopPropagation();
        
        // Simple smooth scrolling without momentum for more control
        const sensitivity = 0.3; // Balanced sensitivity
        const delta = wheelEvent.deltaX * sensitivity;
        
        // Apply smooth scrolling
        scrollContainer.scrollLeft += delta;
      }
    };

    const handleTouchStart = (event: Event) => {
      const touchEvent = event as TouchEvent;
      // Disable default swipe-to-navigate behavior on iOS/macOS
      if (touchEvent.touches.length === 2) {
        event.preventDefault();
      }
    };

    const handleTouchMove = (event: Event) => {
      const touchEvent = event as TouchEvent;
      // Prevent overscroll bounce and swipe navigation
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;
      
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
      const maxScrollLeft = scrollWidth - clientWidth;
      
      if (touchEvent.touches.length === 2) {
        // Two-finger gesture - check boundaries
        if (scrollLeft <= 0 || scrollLeft >= maxScrollLeft) {
          event.preventDefault();
        }
      }
    };

    // Add event listeners directly (no RAF wrapper for better performance)
    ganttComponent.addEventListener('wheel', handleWheel, { passive: false });
    ganttComponent.addEventListener('touchstart', handleTouchStart, { passive: false });
    ganttComponent.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      ganttComponent.removeEventListener('wheel', handleWheel);
      ganttComponent.removeEventListener('touchstart', handleTouchStart);
      ganttComponent.removeEventListener('touchmove', handleTouchMove);
    };
  }, [loadEarlier, loadLater]);

  // Show loading state while dateRange is initializing or during board transitions
  if (dateRange.length === 0 || isBoardTransitioning || !isGridReady) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Gantt Chart</h2>
          <p className="text-sm text-gray-600 mt-1">
            {isBoardTransitioning ? 'Switching board...' : !isGridReady ? 'Positioning grid...' : 'Loading timeline...'}
          </p>
        </div>
        <div className="p-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">
            {isBoardTransitioning ? 'Loading board data...' : !isGridReady ? 'Positioning grid...' : 'Initializing Gantt view...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
    {(() => {
      const dndContextTime = performance.now();
      // DndContext rendering
      return null;
    })()}
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToHorizontalAxis]}
      onDragStart={handleTaskBarDragStart} 
      onDragOver={handleDragOver} 
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        console.log('❌ [GanttView] Drag cancelled!', {
          activeDragItem,
          isSingleDay: (activeDragItem as GanttDragItem)?.originalStartDate === (activeDragItem as GanttDragItem)?.originalEndDate,
          timestamp: new Date().toISOString()
        });
        setActiveDragItem(null);
        activeDragItemRef.current = null;
        setCurrentHoverDate(null);
        // CRITICAL: Always clear parent state on cancel
        if (onTaskDragEnd) {
          // console.log('❌ [GanttView] Clearing parent drag state on cancel');
          onTaskDragEnd();
        }
      }}
    >
      <div className="gantt-chart-container bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-visible relative">
        {/* Saving Overlay - Blocks user interaction while saving scroll position */}
        {isSavingScrollPosition && (
          <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <div className="text-gray-700 font-medium">
                Saving scroll position...
              </div>
            </div>
          </div>
        )}
        
        {/* Sticky Header - Sticks under page header when scrolling */}
        <div className="sticky top-16 z-50 bg-white dark:bg-gray-800">
          <GanttHeader
            dateRange={dateRange}
            formatDate={formatDate}
            ganttTasks={ganttTasks}
            scrollToToday={scrollToToday}
            scrollEarlier={scrollEarlier}
            scrollLater={scrollLater}
            scrollToTask={scrollToTask}
            isRelationshipMode={isRelationshipMode}
            setIsRelationshipMode={setIsRelationshipMode}
            isMultiSelectMode={isMultiSelectMode}
            setIsMultiSelectMode={setIsMultiSelectMode}
            selectedTasks={selectedTasks}
            setSelectedTasks={setSelectedTasks}
            isLoading={isLoading}
            onJumpToTask={handleJumpToTask}
          />
          </div>
          
        {/* Second Sticky Layer - Task Column Header + Timeline Headers */}
        <div className="sticky top-[168px] z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex">
          {/* Task Column Header */}
          <div
            className="sticky left-0 z-50 bg-gray-50 dark:bg-gray-700 border-r border-gray-200 dark:border-gray-600 flex items-center justify-between px-3 font-medium text-gray-700 dark:text-gray-200"
            style={{ width: `${taskColumnWidth}px`, height: '56px' }}
          >
            <span>Task</span>
            <div
              className="w-1 h-6 bg-gray-300 dark:bg-gray-500 hover:bg-gray-400 dark:hover:bg-gray-400 cursor-col-resize transition-colors"
              onMouseDown={handleResizeStart}
              title="Drag to resize task column"
            />
            </div>

          {/* Scrollable Date Headers */}
          <div className="flex-1 overflow-hidden" data-sticky-header="true">
            <div
              className="min-w-[800px]"
              style={{ width: `${Math.max(800, dateRange.length * 40 + 200)}px` }}
            >
              {/* Month/Year Row - Sticky */}
              <div 
                className="sticky top-0 z-30 grid border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 gantt-timeline-container h-6"
                style={{ 
                  gridTemplateColumns: `repeat(${dateRange.length}, 40px)`,
                  minWidth: '800px'
                }}
              >
                {dateRange.map((dateCol, index) => (
                  <div
                    key={`sticky-month-${index}`}
                    className="text-xs font-medium text-gray-600 dark:text-gray-300 flex items-center justify-center relative"
                    style={{ minWidth: '20px' }}
                  >
                    {(index === 0 || dateCol.date.getDate() === 1 || dateCol.date.getDate() === 15) && (
                      <span>
                        {dateCol.date.toLocaleDateString('en-US', { month: 'short' })}'{dateCol.date.getFullYear().toString().slice(-2)}
                      </span>
              )}
            </div>
                ))}
            </div>

              {/* Day Numbers Row */}
              <div 
                className="grid border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 gantt-timeline-container h-8"
                style={{ 
                  gridTemplateColumns: `repeat(${dateRange.length}, 40px)`,
                  minWidth: '800px'
                }}
              >
                {dateRange.map((dateCol, index) => (
                  <div
                    key={`sticky-day-${index}`}
                    className={`text-xs text-center border-r border-gray-300 dark:border-gray-600 flex items-center justify-center relative ${
                      dateCol.isToday ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 font-semibold' :
                      dateCol.isWeekend ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400' : 'text-gray-700 dark:text-gray-300'
                    }`}
                    style={{ minWidth: '20px' }}
                  >
                    <div>{dateCol.date.getDate()}</div>
              </div>
                ))}
              </div>
          </div>
        </div>
      </div>

      {/* Gantt Chart */}
      <div className="relative flex">
        {/* Sticky Task Column */}
        <div 
          className="sticky left-0 z-10 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700"
          style={{ width: `${taskColumnWidth}px` }}
        >
          
          {/* Task Creation Header Row - matches creation row in timeline */}
          <div className="h-12 bg-blue-50 dark:bg-blue-900 border-b-4 border-blue-400 dark:border-blue-500 flex items-center justify-end px-3">
            <span className="text-sm text-blue-700 dark:text-blue-200 font-medium">Add tasks here →</span>
          </div>
          
          {/* Task Info Rows */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleTaskListDragStart}
            onDragEnd={handleTaskListDragEnd}
            onDragOver={handleTaskListDragOver}
          >
            
            <SortableContext 
              items={visibleTasks.map(task => task.id)} 
              strategy={verticalListSortingStrategy}
            >
            {Object.entries(groupedTasks).map(([columnId, tasks], groupIndex) => {
              if (tasks.length === 0) return null;
              
              const column = columns[columnId];
              const columnName = column ? (column as any).name : `Column ${columnId}`;
              
              return (
                <DroppableGroup key={columnId} columnId={columnId}>
                  {/* Column Group Separator - only show if not the first group */}
                  {groupIndex > 0 && (
                    <div className="bg-pink-300 dark:bg-pink-600 h-0.5 w-full flex-shrink-0"></div>
                  )}
                  
                  {/* Drop Zone - show in all groups when dragging (except source group) */}
                  <DropZone 
                    columnId={columnId}
                    columnName={columns[columnId]?.name || 'this group'}
                    isVisible={((activeDragItem as SortableTaskRowItem)?.type === 'task-row-reorder') && 
                   activeDragItem && 
                               (activeDragItem as SortableTaskRowItem).task.columnId !== columnId}
                  />
                  
                  {/* Tasks in this group */}
                  {tasks.map((task, taskIndex) => {
              // Create sortable task row component
              const SortableTaskRow = () => {
                // Check if this task is being dragged using activeDragItem
                const isThisTaskDragging = activeDragItem && 
                  (activeDragItem as SortableTaskRowItem).type === 'task-row-reorder' && 
                  (activeDragItem as SortableTaskRowItem).task.id === task.id;

                const {
                  attributes,
                  listeners,
                  setNodeRef,
                  transform,
                  transition,
                  isDragging,
                } = useSortable({
                  id: task.id,
                  data: {
                    type: 'task-row-reorder',
                    task: task,
                    taskIndex: taskIndex,
                    columnId: columnId, // Add columnId to task data for cross-group detection
                  },
                  disabled: false // Keep sortable enabled for smooth dragging
                });
                
                // Prevent re-rendering during drag for smoother experience
                const shouldRender = !isThisTaskDragging || !isDragging;

                // Check if this specific task is being dragged over (drop target)
                // We need to check if the drag is currently over this specific task
                const isBeingDraggedOver = false; // We'll implement proper drop target detection later

                const style = {
                  transform: isThisTaskDragging ? 'none' : (transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined),
                  transition: isDragging ? 'none' : (isCrossColumnDrop ? 'none !important' : (transition || 'transform 200ms ease')), // Disable transition during cross-column drops
                  zIndex: (isDragging || isThisTaskDragging) ? 1000 : 'auto',
                  opacity: isThisTaskDragging ? 0 : (isDragging ? 0.3 : 1), // Completely hide the dragged task, show others semi-transparent
                };

                return (
                  <div 
                    ref={setNodeRef}
              key={`task-info-${task.id}`}
                    data-task-id={task.id}
                    style={style}
                    className={`relative p-2 border-b border-gray-100 ${
                taskViewMode === 'compact' ? 'h-12' : 
                taskViewMode === 'shrink' ? 'h-20' : 
                'h-20'
                    } ${taskIndex % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'} hover:bg-blue-50 dark:hover:bg-blue-900 transition-all duration-200 ease-out ${
                      (isDragging || isThisTaskDragging) ? '!border-2 !border-blue-500 !shadow-lg !rounded-lg bg-blue-50 dark:bg-blue-900' : ''
                    } ${
                      isBeingDraggedOver ? 'bg-blue-100 dark:bg-blue-800 border-blue-300 dark:border-blue-500' : ''
                    }`}
            >
              {/* Drag handle in upper left */}
              <div
                {...attributes}
                {...listeners}
                className={`absolute top-2 left-2 flex items-center justify-center w-6 h-6 cursor-grab active:cursor-grabbing transition-colors z-10 ${
                  isDragging 
                    ? 'text-blue-500 dark:text-blue-300 bg-blue-50 dark:bg-blue-900 rounded' 
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded'
                }`}
                title={`Drag to reorder ${task.title}`}
              >
                <GripVertical size={16} />
              </div>

              <div className="flex items-center justify-between pl-8">
                {/* ROW REORDERING ZONE - Only for vertical dragging */}
                <button
                  onClick={() => handleTaskClick(task)}
                  className={`text-left flex-1 min-w-0 rounded px-1 py-1 transition-all duration-300 ${
                    highlightedTaskId === task.id 
                      ? 'bg-yellow-200 dark:bg-yellow-800 ring-2 ring-yellow-400 dark:ring-yellow-600 ring-inset' 
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{task.ticket}</div>
                    {(task.startDate || task.endDate) && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {task.startDate && task.endDate && task.startDate.getTime() === task.endDate.getTime() 
                          ? `📅 ${task.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                          : task.startDate && task.endDate
                          ? `📅 ${task.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${task.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                          : task.endDate
                            ? `📅 ${task.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                            : task.startDate
                            ? `📅 ${task.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                            : ''
                          }
                      </span>
                    )}
                  </div>
                  {/* Compact: Only TASK-XXXXX with dates */}
                  {taskViewMode === 'compact' ? null : (
                    <>
                      {/* Shrink: TASK-XXXXX with dates + Title truncated + Status */}
                      {taskViewMode === 'shrink' && (
                        <>
                          <div className="text-sm text-gray-600 dark:text-gray-300 overflow-hidden whitespace-nowrap text-ellipsis w-full min-w-0">{task.title}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">📋 {task.status}</div>
                        </>
                      )}
                      {/* Expand/Normal: Full info as currently displayed */}
                      {taskViewMode === 'expand' && (
                        <>
                          <div className="text-sm text-gray-600 dark:text-gray-300 break-words">{task.title}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">📋 {task.status}</div>
                        </>
                      )}
                    </>
                  )}
                </button>
                
                {/* Action buttons - Buffer zone to separate row reordering from task movement */}
                <div 
                  className="flex items-center gap-1 ml-2 relative z-50"
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {onCopyTask && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Find the original task data from columns to get proper priority object
                        const originalTask = Object.values(columns)
                          .flatMap(col => col.tasks || [])
                          .find(t => t.id === task.id);
                        
                        if (originalTask) {
                          // Use the original task data with proper priority object
                          onCopyTask(originalTask);
                        } else {
                        }
                      }}
                      className="p-1 hover:bg-gray-200 rounded transition-colors"
                      title="Copy Task"
                    >
                      <Copy size={14} className="text-gray-500 hover:text-gray-700" />
                    </button>
                  )}
                  {onRemoveTask && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveTask(task.id, e);
                      }}
                      className="p-1 hover:bg-red-100 rounded transition-colors"
                      title="Delete Task"
                    >
                      <Trash2 size={14} className="text-gray-500 hover:text-red-600" />
                    </button>
                  )}
              </div>
            </div>
                  </div>
                );
              };

                    return <SortableTaskRow key={`task-info-${task.id}`} />;
                  })}
                </DroppableGroup>
              );
            })}
            {reorderedGanttTasks.length === 0 && (
            <div className="p-4 text-center text-gray-500">
              <div className="mb-2">📅 No tasks yet</div>
              <div className="text-xs">The timeline is ready for your tasks!</div>
            </div>
          )}
          </SortableContext>
          
          <DragOverlay dropAnimation={null}>
            {activeDragItem && (activeDragItem as SortableTaskRowItem).type === 'task-row-reorder' ? (
              <div className="bg-white dark:bg-gray-800 border-2 border-blue-500 rounded-lg shadow-2xl p-4 flex items-center gap-3 opacity-95 transform rotate-1 relative min-w-[200px]">
                <GripVertical size={18} className="text-blue-500" />
                <div className="flex flex-col">
                  <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                    {(activeDragItem as SortableTaskRowItem).task.title}
                  </span>
                  <span className="text-xs text-gray-500">
                    {(activeDragItem as SortableTaskRowItem).task.ticket || `TASK-${(activeDragItem as SortableTaskRowItem).task.id.slice(-8)}`}
                  </span>
                </div>
              </div>
            ) : null}
          </DragOverlay>
          </DndContext>
        </div>
        
        {/* Scrollable Timeline */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto relative"
          style={{
            willChange: activeDragItem ? 'scroll-position' : 'auto',
            contain: 'layout style' // Performance optimization for contained rendering
          }}
          onScroll={(e) => {
            // SIMPLIFIED: Only sync timeline headers, no loading during manual scroll
            const scrollLeft = e.currentTarget.scrollLeft;
            
            // Sync timeline headers for consistent scrolling
            // The sticky header is overflow-hidden, so we need to sync its inner containers
            const stickyHeader = document.querySelector('[data-sticky-header="true"]');
            if (stickyHeader) {
              // Find all timeline containers within the sticky header
              const timelineContainers = stickyHeader.querySelectorAll('.gantt-timeline-container');
              timelineContainers.forEach(container => {
                if (container instanceof HTMLElement) {
                  // Use transform to move the timeline instead of scrollLeft
                  container.style.transform = `translateX(-${scrollLeft}px)`;
                }
              });
            }
          }}
        >
          <div 
            className="min-w-[800px]" 
            style={{ width: `${Math.max(800, dateRange.length * 40 + 200)}px` }}
          >

            {/* Task Creation Row */}
            <div 
              className="grid bg-white transition-colors relative h-12 border-b-4 border-blue-400"
              style={{ 
                gridTemplateColumns: `repeat(${dateRange.length}, 40px)`,
                minWidth: '800px'
              }}
            >
                {dateRange.map((dateCol, relativeIndex) => {
                const dateIndex = relativeIndex;
                const dateString = dateCol.date.toISOString().split('T')[0];
                
                return (
                  <div
                    key={`create-${dateIndex}`}
                    className={`border-r border-gray-300 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900 transition-colors flex items-center justify-center group relative ${
                      isCreatingTask ? 'cursor-crosshair bg-blue-100 dark:bg-blue-800' : 'cursor-pointer'
                    } ${
                      dateCol.isToday ? 'bg-blue-50 dark:bg-blue-900' : 
                      dateCol.isWeekend ? 'bg-gray-50 dark:bg-gray-700' : 'bg-white dark:bg-gray-800'
                    }`}
                    style={{ minWidth: '20px' }}
                    onMouseDown={(e) => handleTaskCreationMouseDown(dateString, e)}
                    onMouseEnter={() => handleTaskCreationMouseEnter(dateString)}
                    onClick={() => !isCreatingTask && handleCreateTaskOnDate(dateString)}
                    title={isCreatingTask ? "Drag to set date range" : `Create task on ${dateCol.date.toLocaleDateString()}`}
                  >
                    {/* Plus icon - visible on hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    
                    {/* Date range feedback during drag */}
                    {(() => {
                      if (!isCreatingTask || !taskCreationStart || !taskCreationEnd) return null;
                      
                      const startDate = new Date(taskCreationStart);
                      const endDate = new Date(taskCreationEnd);
                      const currentDate = new Date(dateString);
                      const isInRange = currentDate >= startDate && currentDate <= endDate;
                      
                      if (isInRange) {
                        const daysDiff = Math.abs(Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))) + 1;
                        const isStart = currentDate.getTime() === startDate.getTime();
                        const isEnd = currentDate.getTime() === endDate.getTime();
                        
                        return (
                          <div className={`absolute inset-0 flex items-center justify-center ${
                            isStart || isEnd ? 'bg-blue-400 opacity-80' : 'bg-blue-300 opacity-70'
                          }`}>
                            {(isStart || (daysDiff === 1)) && (
                              <span className="text-xs font-bold text-white">
                                {daysDiff} day{daysDiff !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                );
              })}
            </div>

          {/* Timeline Content Area */}
          <div className="min-w-[800px]">
            {/* Task Timeline Rows */}
            {Object.entries(groupedTasks).map(([columnId, tasks], groupIndex) => {
              if (tasks.length === 0) return null;
              
              const column = columns[columnId];
              const columnName = column ? (column as any).name : `Column ${columnId}`;
              
              return (
                <React.Fragment key={`timeline-${columnId}`}>
                  {/* Column Group Separator for Timeline - only show if not the first group */}
                  {groupIndex > 0 && (
                    <div className="bg-pink-300 dark:bg-pink-600 h-0.5 w-full"></div>
                  )}
                  
                  {/* Tasks in this group */}
                  {tasks.map((task, taskIndex) => {
              const gridPosition = getTaskBarGridPosition(task);
              
              
              return (
                <div 
                  key={task.id} 
                  data-task-id={task.id}
                  className={`grid border-b border-gray-200 dark:border-gray-600 ${taskIndex % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'} hover:bg-blue-50 dark:hover:bg-blue-900 transition-colors relative ${
                    taskViewMode === 'compact' ? 'h-12' : 
                    taskViewMode === 'shrink' ? 'h-20' : 
                    'h-20'
                  }`}
                  style={{ 
                    gridTemplateColumns: `repeat(${dateRange.length}, 40px)`,
                    minWidth: '800px', // Match header minWidth to ensure column alignment
                    willChange: activeDragItem ? 'transform' : 'auto' // Performance hint during drag
                  }}
                >
                {/* Horizontal lines between date columns */}
                {dateRange.map((_, index) => (
                  index > 0 && (
                    <div 
                      key={`task-boundary-${task.id}-${index}`}
                      className="absolute top-0 left-0 right-0 h-0.5 bg-blue-300 z-10"
                      style={{ 
                        left: `${(index / dateRange.length) * 100}%`,
                        right: `${((dateRange.length - index) / dateRange.length) * 100}%`
                      }}
                    ></div>
                  )
                ))}
                
                {/* Background Date Columns - optimized droppable density */}
                {dateRange.map((dateCol, relativeIndex) => {
                  const dateIndex = relativeIndex;
                  const dateString = dateCol.date.toISOString().split('T')[0];
                  const dropId = `date-${dateIndex}`;
                  
                  // Smart density: every 3rd date for large ranges, every date for small ranges
                  // BUT: always full precision for handle dragging AND task movement (for smooth visual feedback)
                  const useDensity = dateRange.length > 90;
                  const currentDragItem = activeDragItemRef.current as GanttDragItem;
                  const isHandleDrag = currentDragItem?.dragType === DRAG_TYPES.TASK_START_HANDLE || 
                                     currentDragItem?.dragType === DRAG_TYPES.TASK_END_HANDLE;
                  const isTaskMovement = currentDragItem?.dragType === DRAG_TYPES.TASK_MOVE_HANDLE;
                  const isTaskBarDrag = isHandleDrag || isTaskMovement || isTaskBarDraggingRef.current;
                  const isDensityDate = !useDensity || isTaskBarDrag || relativeIndex % 3 === 0;
                  
                  // Debug logging removed to prevent infinite re-renders
                  
                  // Inline droppable component (only for density dates)
                  const DroppableDateCell = () => {
                    const { setNodeRef, isOver } = useDroppable({
                      id: dropId,
                      data: {
                        date: dateString,
                        dateIndex,
                        isDensityCell: isDensityDate && !isHandleDrag && !isTaskMovement
                      },
                      disabled: !isDensityDate // Only disable based on density, not activeDragItem
                    });

                    // Debug logging removed to prevent infinite re-renders

                    // Debug: Check droppable cell state (disabled to prevent infinite loop)
                    // if (activeDragItem?.dragType && dropId === 'date-0') {
                    //   console.log('📍 [GanttView] Droppable cell state:', {
                    //     dropId,
                    //     isDensityDate,
                    //     isTaskBarDrag,
                    //     disabled: !isDensityDate,
                    //     isOver
                    //   });
                    // }

                    // Debug: Log when droppable cells are created (disabled to prevent infinite loop)
                    // if (isDensityDate && activeDragItem?.dragType) {
                    //   console.log('📍 [GanttView] Droppable cell created:', {
                    //     dropId,
                    //     dateString,
                    //     isDensityDate,
                    //     isTaskBarDrag,
                    //     activeDragType: activeDragItem.dragType
                    //   });
                    // }

                    return (
                      <div
                        ref={setNodeRef}
                        className={`h-16 border-r border-gray-300 dark:border-gray-600 transition-colors ${
                          dateCol.isToday ? 'bg-blue-50 dark:bg-blue-900' : 
                          dateCol.isWeekend ? 'bg-gray-50 dark:bg-gray-700' : 'bg-white dark:bg-gray-800'
                        }`}
                        style={{ 
                          gridColumn: relativeIndex + 1,
                          gridRow: 1,
                          minWidth: '20px' 
                        }}
                      >
                        {/* Background cell - daily precision */}
                      </div>
                    );
                  };
                  
                  // Only render droppable cells for density dates
                  if (isDensityDate) {
                  return <DroppableDateCell key={`bg-${dateIndex}`} />;
                  } else {
                    // Render non-droppable cell
                    return (
                      <div
                        key={`bg-${dateIndex}`}
                        className={`h-16 border-r border-gray-300 dark:border-gray-600 transition-colors ${
                          dateCol.isToday ? 'bg-blue-50 dark:bg-blue-900' : 
                          dateCol.isWeekend ? 'bg-gray-50 dark:bg-gray-700' : 'bg-white dark:bg-gray-800'
                        }`}
                        style={{ 
                          gridColumn: relativeIndex + 1,
                          gridRow: 1,
                          minWidth: '20px' 
                        }}
                      />
                    );
                  }
                })}
                
                {/* Task Bar - direct grid child for precise alignment */}
                {gridPosition && (() => {
                  // Check if this task is being dragged
                  const isDragging = (activeDragItem as GanttDragItem)?.taskId === task.id;
                  let startIndex = gridPosition.startDayIndex;
                  let endIndex = gridPosition.endDayIndex;
                  
                  
                  // Apply real-time visual feedback during drag
                  if (isDragging && currentHoverDate && activeDragItem) {
                    const hoverDateIndex = dateRange.findIndex(d => 
                      d.date.toISOString().split('T')[0] === currentHoverDate
                    );
                    
                    if (hoverDateIndex >= 0) {
                      if ((activeDragItem as GanttDragItem).dragType === DRAG_TYPES.TASK_START_HANDLE) {
                        // Dragging start handle - if past end, clamp to end (1-day at end position)
                        if (hoverDateIndex > endIndex) {
                          startIndex = endIndex; // Clamp to end position
                        } else {
                          startIndex = hoverDateIndex;
                        }
                      } else if ((activeDragItem as GanttDragItem).dragType === DRAG_TYPES.TASK_END_HANDLE) {
                        // Dragging end handle - if before start, clamp to start (1-day at start position)
                        if (hoverDateIndex < startIndex) {
                          endIndex = startIndex; // Clamp to start position
                        } else {
                          endIndex = hoverDateIndex;
                        }
                      } else if ((activeDragItem as GanttDragItem).dragType === DRAG_TYPES.TASK_MOVE_HANDLE) {
                        // Moving entire task - shift both start and end by the same amount
                        const originalStart = gridPosition.startDayIndex;
                        const originalEnd = gridPosition.endDayIndex;
                        const taskDuration = originalEnd - originalStart;
                        startIndex = hoverDateIndex;
                        endIndex = hoverDateIndex + taskDuration;
                      }
                    }
                  }
                  
                  const isSelected = selectedTasks.includes(task.id);
                  
                  return (
                    <div
                      className={`h-6 rounded ${
                        isDragging ? 'opacity-90 ring-2 ring-blue-400' : 
                        isSelected ? 'opacity-100 ring-2 ring-green-400 shadow-lg' :
                        'opacity-80 hover:opacity-100'
                      } transition-all flex items-center group relative`}
                      style={{
                        gridColumn: startIndex === endIndex 
                          ? `${startIndex + 1} / ${startIndex + 2}` // 1-day task: exactly 1 column
                          : `${startIndex + 1} / ${endIndex + 2}`,   // Multi-day task: normal span
                        gridRow: 1,
                        willChange: isDragging ? 'opacity, transform' : 'auto', // Performance hint for drag operations
                        alignSelf: 'center',
                        zIndex: isDragging ? 25 : isSelected ? 15 : 10,
                        ...getPriorityColor(task.priority)
                      }}
                      title={`${task.title}\nStart: ${task.startDate?.toLocaleDateString()}\nEnd: ${task.endDate?.toLocaleDateString()}${isSelected ? '\n✓ Selected' : ''}`}
                      onClick={() => {
                        if (isMultiSelectMode) {
                          handleTaskSelect(task.id);
                        } else {
                          // Find the original task and call onSelectTask
                          const originalTask = Object.values(columns)
                            .flatMap(col => col.tasks || [])
                            .find(t => t.id === task.id);
                          if (originalTask) {
                            onSelectTask(originalTask);
                          }
                        }
                      }}
                    >
                      {/* Task Bar Badge System */}
                      {/* DONE Badge - for completed tasks */}
                      {isColumnFinished(task.columnId, columns) && !isColumnArchived(task.columnId, columns) && (
                        <div className="absolute top-0 right-0 pointer-events-none z-30">
                          <div className="bg-green-500 text-white text-xs font-bold px-1 py-0.5 rounded-full shadow-lg opacity-95 transform -rotate-12 -translate-y-1 translate-x-1">
                            DONE
                          </div>
                        </div>
                      )}
                      
                      {/* LATE Badge - for overdue tasks */}
                      {!isColumnFinished(task.columnId, columns) && !isColumnArchived(task.columnId, columns) && isTaskOverdue(task) && siteSettings?.HIGHLIGHT_OVERDUE_TASKS === 'true' && (
                        <div className="absolute top-0 right-0 pointer-events-none z-30">
                          <div className="bg-red-500 text-white text-xs font-bold px-1 py-0.5 rounded-full shadow-lg opacity-95 transform -rotate-12 -translate-y-1 translate-x-1">
                            LATE
                          </div>
                        </div>
                      )}
                      
                      {/* Move handle - positioned with gap (disabled in relationship mode) */}
                        {!isRelationshipMode && (() => {
                          const originalTask = getOriginalTask(task);
                        if (!originalTask) return null;
                        
                        // Only show MoveHandle for multi-day tasks
                        const dateToString = (date: string | Date | undefined | null): string => {
                          if (!date) return '';
                          if (typeof date === 'string') return date.split('T')[0]; // Already a string, just get date part
                          if (date instanceof Date) return date.toISOString().split('T')[0]; // Convert Date to string
                          return '';
                        };
                        
                        const startDateStr = dateToString(originalTask.startDate);
                        const dueDateStr = dateToString(originalTask.dueDate);
                        const isMultiDay = startDateStr && dueDateStr && startDateStr !== dueDateStr;
                        
                        
                        if (!isMultiDay) return null;
                        
                        return (
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              width: '20px', // Only cover the start date cell
                              height: '100%',
                              zIndex: 5, // Lower than TaskHandles (z-20)
                              // backgroundColor: 'rgba(0, 255, 0, 0.2)' // Debug: green tint to see the area
                            }}
                          >
                        <MoveHandle
                          taskId={task.id}
                              task={originalTask}
                              onTaskMove={() => {}} // Will be handled by drag end
                              className="w-full h-full"
                            />
                          </div>
                        );
                      })()}
                      
                      {/* Move handle for single-day tasks */}
                      {!isRelationshipMode && (() => {
                        const originalTask = getOriginalTask(task);
                        if (!originalTask) return null;
                        
                        // Only show MoveHandle for single-day tasks
                        const dateToString = (date: string | Date | undefined | null): string => {
                          if (!date) return '';
                          if (typeof date === 'string') return date.split('T')[0]; // Already a string, just get date part
                          if (date instanceof Date) return date.toISOString().split('T')[0]; // Convert Date to string
                          return '';
                        };
                        
                        const startDateStr = dateToString(originalTask.startDate);
                        const dueDateStr = dateToString(originalTask.dueDate);
                        const isSingleDay = !startDateStr || !dueDateStr || startDateStr === dueDateStr;
                        
                        if (!isSingleDay) return null;
                        
                        return (
                          <MoveHandle
                            taskId={task.id}
                            task={originalTask}
                            onTaskMove={() => {}} // Will be handled by drag end
                            className="absolute inset-0 w-full h-full"
                          />
                        );
                      })()}
                      
                      {/* Non-draggable overlay for the rest of multi-day task bars */}
                      {!isRelationshipMode && (() => {
                        const originalTask = getOriginalTask(task);
                        if (!originalTask) return null;
                        
                        // Only show overlay for multi-day tasks
                        const dateToString = (date: string | Date | undefined | null): string => {
                          if (!date) return '';
                          if (typeof date === 'string') return date.split('T')[0]; // Already a string, just get date part
                          if (date instanceof Date) return date.toISOString().split('T')[0]; // Convert Date to string
                          return '';
                        };
                        
                        const startDateStr = dateToString(originalTask.startDate);
                        const dueDateStr = dateToString(originalTask.dueDate);
                        const isMultiDay = startDateStr && dueDateStr && startDateStr !== dueDateStr;
                        
                        if (!isMultiDay) return null;
                        
                        return (
                          <div
                            style={{
                              position: 'absolute',
                              left: '20px',
                              top: 0,
                              right: 0,
                              height: '100%',
                              zIndex: 5, // Same as MoveHandle
                              pointerEvents: 'none', // Prevent any interaction
                              // backgroundColor: 'rgba(255, 0, 0, 0.1)' // Debug: red tint to see the non-draggable area
                            }}
                          />
                        );
                        })()}
                        
                        {/* Conditional handles based on task duration (disabled in relationship mode) */}
                        {!isRelationshipMode && (startIndex === endIndex ? (
                          /* 1-day task: Only right handle for extending */
                          null // No left handle for 1-day tasks
                        ) : (
                          /* Multi-day task: Left resize handle */
                          (() => {
                            const originalTask = getOriginalTask(task);
                            return originalTask ? (
                          <TaskHandle
                            taskId={task.id}
                                task={originalTask}
                            handleType="start"
                                onDateChange={(taskId, handleType, newDate) => {
                                  // Convert to the expected format for handleTaskDrop
                                  const dragData: GanttDragItem = {
                                    id: `${taskId}-${handleType}`,
                                    taskId,
                                    taskTitle: task.title,
                                    originalStartDate: task.startDate?.toISOString().split('T')[0] || '',
                                    originalEndDate: task.endDate?.toISOString().split('T')[0] || '',
                                    dragType: handleType === 'start' ? DRAG_TYPES.TASK_START_HANDLE : DRAG_TYPES.TASK_END_HANDLE
                                  };
                                  handleTaskDrop(dragData, newDate);
                                }}
                            taskColor={getPriorityColor(task.priority)}
                          />
                            ) : null;
                          })()
                        ))}
                        
                        {/* Task content - conditional title display */}
                        {gridPosition.startDayIndex === gridPosition.endDayIndex ? (
                          /* 1-day task: Link icons at both ends */
                          <div className="flex-1 min-w-0 flex items-center justify-between">
                            {/* Multi-select checkbox for 1-day tasks */}
                            {isMultiSelectMode && (
                              <div className="flex items-center mr-1">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleTaskSelect(task.id)}
                                  className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            )}
                            
                            {/* Start link icon for relationship mode - positioned on left */}
                            {isRelationshipMode && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  
                                  if (!selectedParentTask) {
                                    // First click - select as parent
                                    setSelectedParentTask(task.id);
                                  } else if (selectedParentTask === task.id) {
                                    // Clicking same task - deselect
                                    setSelectedParentTask(null);
                                  } else {
                                    // Second click - create relationship
                                    handleCreateRelationship(selectedParentTask, task.id);
                                    setSelectedParentTask(null);
                                  }
                                }}
                                className={`p-1 ml-1 rounded transition-colors ${
                                  selectedParentTask === task.id 
                                    ? 'bg-yellow-400 bg-opacity-80 text-gray-900' 
                                    : 'hover:bg-white hover:bg-opacity-20'
                                }`}
                                title={selectedParentTask === task.id ? 'Selected as parent - click another task to link' : 'Click to select as parent task'}
                              >
                                <svg className={`w-3 h-3 ${selectedParentTask === task.id ? 'text-gray-900' : 'text-white'}`} fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                            
                            {/* Center space - no title for 1-day tasks as they're too small */}
                            <div className="flex-1"></div>
                            
                            {/* End link icon for relationship mode - positioned on right */}
                            {isRelationshipMode && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  
                                  if (!selectedParentTask) {
                                    // First click - select as parent
                                    setSelectedParentTask(task.id);
                                  } else if (selectedParentTask === task.id) {
                                    // Clicking same task - deselect
                                    setSelectedParentTask(null);
                                  } else {
                                    // Second click - create relationship
                                    handleCreateRelationship(selectedParentTask, task.id);
                                    setSelectedParentTask(null);
                                  }
                                }}
                                className={`p-1 mr-1 rounded transition-colors ${
                                  selectedParentTask === task.id 
                                    ? 'bg-yellow-400 bg-opacity-80 text-gray-900' 
                                    : 'hover:bg-white hover:bg-opacity-20'
                                }`}
                                title={selectedParentTask === task.id ? 'Selected as parent - click another task to link' : 'Click to select as parent task'}
                              >
                                <svg className={`w-3 h-3 ${selectedParentTask === task.id ? 'text-gray-900' : 'text-white'}`} fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                          </div>
                        ) : (
                          /* Multi-day task (2+ days): Link icons at both ends with title in center */
                          <div className="flex items-center flex-1 min-w-0">
                            {/* Start link icon for relationship mode - positioned on left */}
                            {isRelationshipMode && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  
                                  if (!selectedParentTask) {
                                    // First click - select as parent
                                    setSelectedParentTask(task.id);
                                  } else if (selectedParentTask === task.id) {
                                    // Clicking same task - deselect
                                    setSelectedParentTask(null);
                                  } else {
                                    // Second click - create relationship
                                    handleCreateRelationship(selectedParentTask, task.id);
                                    setSelectedParentTask(null);
                                  }
                                }}
                                className={`p-1 ml-1 mr-2 rounded transition-colors ${
                                  selectedParentTask === task.id 
                                    ? 'bg-yellow-400 bg-opacity-80 text-gray-900' 
                                    : 'hover:bg-white hover:bg-opacity-20'
                                }`}
                                title={selectedParentTask === task.id ? 'Selected as parent - click another task to link' : 'Click to select as parent task'}
                              >
                                <svg className={`w-3 h-3 ${selectedParentTask === task.id ? 'text-gray-900' : 'text-white'}`} fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                            
                            {/* Multi-select checkbox */}
                            {isMultiSelectMode && (
                              <div className="flex items-center mr-1">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleTaskSelect(task.id)}
                                  className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            )}
                            
                            {/* Task title in center */}
                          <div 
                            className="text-xs truncate px-2 flex-1 flex items-center gap-1"
                            style={{ color: getPriorityColor(task.priority).color }}
                          >
                            {isSelected && !isMultiSelectMode && (
                              <span className="text-green-600 font-bold">✓</span>
                            )}
                            {task.title}
                            </div>
                            
                            {/* End link icon for relationship mode - positioned on right */}
                            {isRelationshipMode && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  
                                  if (!selectedParentTask) {
                                    // First click - select as parent
                                    setSelectedParentTask(task.id);
                                  } else if (selectedParentTask === task.id) {
                                    // Clicking same task - deselect
                                    setSelectedParentTask(null);
                                  } else {
                                    // Second click - create relationship
                                    handleCreateRelationship(selectedParentTask, task.id);
                                    setSelectedParentTask(null);
                                  }
                                }}
                                className={`p-1 ml-2 mr-1 rounded transition-colors ${
                                  selectedParentTask === task.id 
                                    ? 'bg-yellow-400 bg-opacity-80 text-gray-900' 
                                    : 'hover:bg-white hover:bg-opacity-20'
                                }`}
                                title={selectedParentTask === task.id ? 'Selected as parent - click another task to link' : 'Click to select as parent task'}
                              >
                                <svg className={`w-3 h-3 ${selectedParentTask === task.id ? 'text-gray-900' : 'text-white'}`} fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )}
                        
                        {/* Right resize handle - always present (disabled in relationship mode) */}
                        {!isRelationshipMode && (() => {
                          const originalTask = getOriginalTask(task);
                          return originalTask ? (
                        <TaskHandle
                          taskId={task.id}
                              task={originalTask}
                          handleType="end"
                              onDateChange={(taskId, handleType, newDate) => {
                                // Convert to the expected format for handleTaskDrop
                                const dragData: GanttDragItem = {
                                  id: `${taskId}-${handleType}`,
                                  taskId,
                                  taskTitle: task.title,
                                  originalStartDate: task.startDate?.toISOString().split('T')[0] || '',
                                  originalEndDate: task.endDate?.toISOString().split('T')[0] || '',
                                  dragType: handleType === 'start' ? DRAG_TYPES.TASK_START_HANDLE : DRAG_TYPES.TASK_END_HANDLE
                                };
                                handleTaskDrop(dragData, newDate);
                              }}
                          taskColor={getPriorityColor(task.priority)}
                        />
                          ) : null;
                        })()}
                      </div>
                    );
                  })()}
                
                {/* No dates indicator */}
                {(!task.startDate || !task.endDate) && (
                  <div className="col-start-2 h-16 flex items-center">
                    <div className="text-xs text-gray-400 italic ml-2">
                      No dates set
                    </div>
                  </div>
                )}
              </div>
            );
                    })}
                  </React.Fragment>
                );
              })}
            {reorderedGanttTasks.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <div className="text-lg mb-2">No tasks in view</div>
              <div className="text-sm">Scroll to see tasks or adjust the date range.</div>
            </div>
          )}

          {/* Empty state */}
          {(!visibleTasks || visibleTasks.length === 0) && (
            <>
              {/* Empty state with interactive grid for task creation */}
              <div className="text-center text-gray-500 dark:text-gray-400 py-4 border-b border-gray-200 dark:border-gray-600">
                <div className="text-sm">📅 Timeline ready for new tasks</div>
                <div className="text-xs text-gray-400 dark:text-gray-500">Click on any date to create a task</div>
              </div>
              
              {/* Interactive timeline grid for task creation */}
              <div 
                className="grid bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900 transition-colors relative h-16 border-b-4 border-blue-400"
                style={{ 
                  gridTemplateColumns: `repeat(${dateRange.length}, 40px)`,
                  minWidth: '800px'
                }}
              >
                {/* Horizontal lines between date columns */}
                {dateRange.map((_, index) => (
                  index > 0 && (
                    <div 
                      key={`empty-boundary-${index}`}
                      className="absolute top-0 left-0 right-0 h-0.5 bg-blue-300 z-10"
                      style={{ 
                        left: `${(index / dateRange.length) * 100}%`,
                        right: `${((dateRange.length - index) / dateRange.length) * 100}%`
                      }}
                    ></div>
                  )
                ))}
                
                {/* Background Date Columns - droppable areas for new tasks */}
                {dateRange.map((dateCol, relativeIndex) => {
                  const dateIndex = relativeIndex;
                  const dateString = dateCol.date.toISOString().split('T')[0];
                  const dropId = `date-${dateIndex}`;

                  // Check if this date is in the creation selection (ONLY in empty state)
                  const isInCreationRange = !!(isCreatingTask && taskCreationStart && taskCreationEnd && (() => {
                    const startDateObj = parseLocalDate(taskCreationStart);
                    const endDateObj = parseLocalDate(taskCreationEnd);
                    const currentDateObj = parseLocalDate(dateString);
                    
                    const rangeStart = startDateObj <= endDateObj ? startDateObj : endDateObj;
                    const rangeEnd = startDateObj <= endDateObj ? endDateObj : startDateObj;
                    
                    return currentDateObj >= rangeStart && currentDateObj <= rangeEnd;
                  })());

                  return (
                    <div
                      key={dropId}
                      className={`relative border-r border-gray-300 dark:border-gray-600 h-full transition-colors cursor-pointer ${
                        isInCreationRange 
                          ? 'bg-blue-200 dark:bg-blue-800 border-blue-300 dark:border-blue-500' 
                          : `${dateCol.isToday ? 'bg-blue-50 dark:bg-blue-900' :
                               dateCol.isWeekend ? 'bg-gray-50 dark:bg-gray-700' : 'bg-white dark:bg-gray-800'
                             } hover:bg-blue-100 dark:hover:bg-blue-800`
                      }`}
                      style={{ minWidth: '20px' }}
                      onMouseDown={(e) => handleTaskCreationMouseDown(dateString, e)}
                      onMouseEnter={() => handleTaskCreationMouseEnter(dateString)}
                      onClick={() => !isCreatingTask && handleCreateTaskOnDate(dateString)}
                      title={isCreatingTask ? "Drag to set date range" : `Create task on ${dateCol.date.toLocaleDateString()}`}
                    >
                      {/* Show creation feedback only during active drag */}
                      {isInCreationRange && (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-xs text-blue-700 dark:text-blue-300 font-medium bg-white dark:bg-gray-800 px-1 rounded">
                            {taskCreationStart === taskCreationEnd ? '1 day' : 
                             Math.abs(parseLocalDate(taskCreationEnd).getTime() - parseLocalDate(taskCreationStart).getTime()) / (1000 * 60 * 60 * 24) + 1 + ' days'}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          
          {/* Task Dependency Arrows Overlay - Inside scroll container */}
          <TaskDependencyArrows
            key={`arrows-${Object.keys(columns).join('-')}`}
            ganttTasks={reorderedGanttTasks}
            taskPositions={taskPositions}
            isRelationshipMode={isRelationshipMode}
            relationships={localRelationships}
            dateRange={dateRange}
            taskViewMode={taskViewMode}
            onCreateRelationship={(fromTaskId, toTaskId) => {
              handleCreateRelationship(fromTaskId, toTaskId);
            }}
            onDeleteRelationship={handleDeleteRelationship}
          />
          </div>
        </div>
        
      </div>
      </div>

      {/* Legend */}
      <div className="border-t border-gray-200 p-4 bg-gray-50">
        <div className="flex items-center gap-6 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <span className="text-blue-600 font-semibold">Today</span>
            <div className="w-4 h-3 bg-blue-100 border border-blue-200"></div>
          </div>
          <div className="flex items-center gap-2">
            <span>Weekends</span>
            <div className="w-4 h-3 bg-gray-100 border border-gray-200"></div>
          </div>
          <div className="flex items-center gap-4">
            <span>Priority:</span>
            {priorities.map((priority) => (
              <div key={priority.id} className="flex items-center gap-1">
                <div 
                  className="w-3 h-3 rounded" 
                  style={{ backgroundColor: priority.color }}
                ></div>
                <span className="capitalize">{priority.priority}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </DndContext>
    </>
  );
};

export default React.memo(GanttView, (prevProps, nextProps) => {
  // Only re-render if key props actually changed
  const columnsChanged = prevProps.columns !== nextProps.columns;
  const taskViewModeChanged = prevProps.taskViewMode !== nextProps.taskViewMode;
  const boardIdChanged = prevProps.boardId !== nextProps.boardId;
  
  // Return true if props are the same (prevent re-render), false if they changed
  return !columnsChanged && !taskViewModeChanged && !boardIdChanged;
});
