import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverEvent, KeyboardSensor, PointerSensor, useSensor, useSensors, useDroppable, closestCenter } from '@dnd-kit/core';
import { Task, Columns, PriorityOption } from '../types';
import { TaskViewMode, loadUserPreferencesAsync, saveUserPreferences } from '../utils/userPreferences';
import { updateTask, getAllPriorities } from '../api';
import { TaskHandle } from './gantt/TaskHandle';
import { MoveHandle } from './gantt/MoveHandle';
import { GanttDragItem, DRAG_TYPES } from './gantt/types';
import { useVirtualViewport } from '../hooks/useVirtualViewport';
import { usePerformanceMonitor } from '../hooks/usePerformanceMonitor';
import { TaskJumpDropdown } from './gantt/TaskJumpDropdown';

interface GanttViewProps {
  columns: Columns;
  onSelectTask: (task: Task) => void;
  taskViewMode?: TaskViewMode;
  onUpdateTask?: (task: Task) => void; // For optimistic updates
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

const GanttView: React.FC<GanttViewProps> = ({ columns, onSelectTask, taskViewMode = 'expand', onUpdateTask }) => {
  const [priorities, setPriorities] = useState<PriorityOption[]>([]);
  const [activeDragItem, setActiveDragItem] = useState<GanttDragItem | null>(null);
  const [currentHoverDate, setCurrentHoverDate] = useState<string | null>(null);
  const [taskColumnWidth, setTaskColumnWidth] = useState(320); // Default 320px, will load from preferences
  const [, setIsResizing] = useState(false);

  // Performance monitoring for the Gantt view
  const { measureFunction, startMeasurement } = usePerformanceMonitor({
    enableConsoleLog: false,
    sampleRate: 0.05 // Sample 5% of operations in production
  });

  // Configure DnD sensors to restrict to horizontal movement
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Require 5px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Custom modifier to restrict to horizontal axis
  const restrictToHorizontalAxis = ({ transform }: { transform: any }) => {
    return {
      ...transform,
      y: 0, // Force Y position to 0, only allow X movement
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
        console.error('Failed to load task column width preference:', error);
        // Keep default value
      }
    };
    loadPreferences();
  }, []);

  // Save task column width to user preferences when it changes (debounced)
  useEffect(() => {
    const savePreference = async () => {
      try {
        const currentPreferences = await loadUserPreferencesAsync();
        await saveUserPreferences({
          ...currentPreferences,
          ganttTaskColumnWidth: taskColumnWidth
        });
        console.log('💾 Saved task column width:', taskColumnWidth);
      } catch (error) {
        console.error('Failed to save task column width preference:', error);
      }
    };
    
    // Debounce the save to avoid excessive API calls during resize
    const timeoutId = setTimeout(() => {
      // Only save if not the initial default value (avoid saving on mount)
      if (taskColumnWidth !== 320) {
        savePreference();
      }
    }, 500); // 500ms debounce
    
    return () => clearTimeout(timeoutId);
  }, [taskColumnWidth]);

  // Fetch priorities on mount
  useEffect(() => {
    const fetchPriorities = async () => {
      try {
        const priorityData = await getAllPriorities();
        setPriorities(priorityData);
      } catch (error) {
        console.error('Failed to fetch priorities:', error);
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

  // Extract and prepare tasks from all columns (needed before useVirtualViewport)
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
        
        
        
        tasks.push({
          id: task.id,
          ticket: task.ticket || 'N/A',
          title: task.title,
          startDate,
          endDate,
          status: column.title,
          priority: task.priority || 'medium',
          columnId: task.columnId,
          columnPosition: column.position || 0 // Add column position for sorting
        });
      });
    });
    
    // Sort by column position (ascending), then by ticket
    return tasks.sort((a, b) => {
      if (a.columnPosition !== b.columnPosition) {
        return a.columnPosition - b.columnPosition; // Sort by column position
      }
      return a.ticket.localeCompare(b.ticket); // Then by ticket
    });
  }, 'ganttTasks calculation', 'computation')(), [columns, measureFunction]);

  // Use virtual viewport for efficient date range management
  const {
    dateRange,
    virtualViewport,
    scrollContainerRef,
    isLoading,
    scrollToToday,
    scrollToTask,
    scrollEarlier,
    scrollLater,
    getVisibleTasks,
  } = useVirtualViewport({
    initialDays: 120,           // 4 months exactly
    bufferDays: 20,             // Smaller buffer for better memory management
    chunkSize: 30,              // Load 1 month at a time
    maxDays: 120,               // Keep maximum 4 months in memory
    daysBeforeToday: 0,         // Will be calculated based on earliest task
    earliestTaskDate: earliestTaskDate,  // Start timeline at earliest task
    allTasks: ganttTasks        // Pass all tasks for positioning
  });

  // Calculate task bar grid position
  const getTaskBarGridPosition = (task: GanttTask) => {
    if (!task.startDate || !task.endDate) return null;
    
    // Find start and end day indices by comparing dates directly
    const taskStartDate = task.startDate;
    const taskEndDate = task.endDate;
    
    // Find the index of the start date in our date range
    let startDayIndex = -1;
    let endDayIndex = -1;
    
    for (let i = 0; i < dateRange.length; i++) {
      const rangeDate = dateRange[i].date;
      
      // Compare dates by their date string (YYYY-MM-DD) to avoid timezone issues
      const rangeDateStr = rangeDate.toISOString().split('T')[0];
      const taskStartStr = taskStartDate.toISOString().split('T')[0];
      const taskEndStr = taskEndDate.toISOString().split('T')[0];
      
      if (startDayIndex === -1 && rangeDateStr === taskStartStr) {
        startDayIndex = i;
      }
      if (rangeDateStr === taskEndStr) {
        endDayIndex = i;
      }
    }
    
    // If dates are outside visible range, calculate approximate position
    if (startDayIndex === -1 || endDayIndex === -1) {
      const firstDate = dateRange[0].date;
      const lastDate = dateRange[dateRange.length - 1].date;
      
      if (taskStartDate < firstDate) startDayIndex = 0;
      else if (taskStartDate > lastDate) return null; // Task starts after visible range
      
      if (taskEndDate > lastDate) endDayIndex = dateRange.length - 1;
      else if (taskEndDate < firstDate) return null; // Task ends before visible range
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
  };

  // Check if a task intersects with the current viewport (optimized with memoization)
  const taskIntersectsViewport = useCallback((task: GanttTask): boolean => {
    if (!task.startDate || !task.endDate) return false;
    
    // Convert task dates to indices in the full date range
    let taskStartIndex = -1;
    let taskEndIndex = -1;
    
    for (let i = 0; i < dateRange.length; i++) {
      const rangeDate = dateRange[i].date;
      const rangeDateStr = rangeDate.toISOString().split('T')[0];
      const taskStartStr = task.startDate.toISOString().split('T')[0];
      const taskEndStr = task.endDate.toISOString().split('T')[0];
      
      if (taskStartIndex === -1 && rangeDateStr === taskStartStr) {
        taskStartIndex = i;
      }
      if (rangeDateStr === taskEndStr) {
        taskEndIndex = i;
      }
    }
    
    // If task dates are not in current date range, don't render
    if (taskStartIndex === -1 && taskEndIndex === -1) return false;
    
    // If task is partially outside the date range, still include it if it intersects
    if (taskStartIndex === -1) taskStartIndex = 0;
    if (taskEndIndex === -1) taskEndIndex = dateRange.length - 1;
    
    // Check if task overlaps with viewport (with some buffer for smooth scrolling)
    const { startIndex, endIndex } = virtualViewport;
    const buffer = 10; // Small buffer for smooth scrolling
    
    // Task intersects if:
    // - Task starts before viewport ends AND task ends after viewport starts
    return (taskStartIndex <= endIndex + buffer && taskEndIndex >= startIndex - buffer);
  }, [virtualViewport, dateRange]);

  // Get tasks visible in current timeline window (pre-positioned by virtual viewport)
  const visibleTasks = useMemo(() => {
    return getVisibleTasks();
  }, [getVisibleTasks]);

  // Get priority color from dynamic priorities
  const getPriorityColor = (priority: string) => {
    const priorityOption = priorities.find(p => p.priority.toLowerCase() === priority.toLowerCase());
    if (priorityOption) {
      // Return both background color and appropriate text color
      return {
        backgroundColor: priorityOption.color,
        color: getContrastColor(priorityOption.color)
      };
    }
    return { backgroundColor: '#007bff', color: '#ffffff' }; // Fallback blue with white text
  };

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

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
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

  // DnD-Kit handlers
  const handleDragStart = (event: DragStartEvent) => {
    const dragData = event.active.data.current as GanttDragItem;
    setActiveDragItem(dragData);
    setCurrentHoverDate(null);
    console.log('🎯 Drag started:', dragData);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (over && activeDragItem) {
      const dropData = over.data.current as { date: string; dateIndex: number };
      setCurrentHoverDate(dropData.date);
      console.log('🖱️ Dragging over date:', dropData.date, 'for task:', activeDragItem.taskId);
    } else {
      console.log('🚫 No over target or activeDragItem:', { over: over?.id, activeDragItem: !!activeDragItem });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { over } = event;
    
    console.log('🎯 Drag ended:', { over: over?.id, activeDragItem });
    
    // Always clear hover state immediately
    setCurrentHoverDate(null);
    
    if (!over || !activeDragItem) {
      console.log('❌ Drag ended without valid drop target or drag item');
      setActiveDragItem(null);
      return;
    }

    const dropData = over.data.current as { date: string; dateIndex: number };
    const targetDate = dropData.date;
    
    console.log('🎯 Drag ended:', { dragItem: activeDragItem, targetDate });

    try {
      // Find the original task
      const originalTask = Object.values(columns)
        .flatMap(column => column.tasks)
        .find(t => t.id === activeDragItem.taskId);

      if (!originalTask) {
        console.error('❌ Original task not found');
        return;
      }

      const updateData: any = { ...originalTask };

      // Update the appropriate date based on what was dragged
      console.log('🔧 Before update:', { 
        dragType: activeDragItem.dragType, 
        targetDate, 
        currentStart: originalTask.startDate, 
        currentDue: originalTask.dueDate 
      });

      if (activeDragItem.dragType === DRAG_TYPES.TASK_START_HANDLE) {
        // Start handle logic - if dragged past end, clamp to end (creates 1-day task)
        const currentEndDate = originalTask.dueDate;
        if (currentEndDate && targetDate > currentEndDate) {
          // User dragged start past end - clamp to end date (1-day task at original end)
          updateData.startDate = currentEndDate;
          console.log('📅 Clamping startDate to endDate for 1-day task:', currentEndDate);
        } else {
          updateData.startDate = targetDate;
          console.log('📅 Setting startDate to:', targetDate, 'keeping dueDate:', originalTask.dueDate);
        }
      } else if (activeDragItem.dragType === DRAG_TYPES.TASK_END_HANDLE) {
        // End handle logic - if dragged before start, clamp to start (creates 1-day task)
        const currentStartDate = originalTask.startDate;
        if (currentStartDate && targetDate < currentStartDate) {
          // User dragged end before start - clamp to start date (1-day task at original start)
          updateData.dueDate = currentStartDate;
          console.log('📅 Clamping endDate to startDate for 1-day task:', currentStartDate);
        } else {
          updateData.dueDate = targetDate;
          console.log('📅 Setting dueDate to:', targetDate, 'keeping startDate:', originalTask.startDate);
        }
      } else if (activeDragItem.dragType === DRAG_TYPES.TASK_MOVE_HANDLE) {
        // Move entire task - calculate duration and shift both dates
        const originalStart = new Date(activeDragItem.originalStartDate);
        const originalEnd = new Date(activeDragItem.originalEndDate);
        const taskDuration = Math.abs(originalEnd.getTime() - originalStart.getTime());
        const newStartDate = new Date(targetDate);
        const newEndDate = new Date(newStartDate.getTime() + taskDuration);
        
        updateData.startDate = targetDate;
        updateData.dueDate = newEndDate.toISOString().split('T')[0];
      }

      console.log('🔄 Updating task with data:', updateData);

      // Optimistic UI update
      if (onUpdateTask) {
        onUpdateTask(updateData);
      }

      // API call
      await updateTask(updateData);
      console.log('✅ Task updated successfully');

    } catch (error) {
      console.error('❌ Failed to update task:', error);
    } finally {
      setActiveDragItem(null);
      setCurrentHoverDate(null);
    }
  };

  const handleTaskDrop = (dragData: GanttDragItem, targetDate: string) => {
    // This will be called by DateColumn, but the actual logic is in handleDragEnd
    console.log('📍 Task dropped on date:', { dragData, targetDate });
  };

  // Handle task jump from dropdown
  const handleJumpToTask = useCallback(async (task: GanttTask) => {
    if (!task.startDate || !task.endDate) {
      console.warn('Cannot jump to task without dates:', task);
      return;
    }

    try {
      // Scroll to the task using the virtual viewport
      await scrollToTask(task.startDate, task.endDate);
      
      // Also highlight the task for a moment
      console.log('🎯 Jumped to task:', task.ticket);
      
      // Optional: trigger task selection if needed
      // onSelectTask(task as Task);
    } catch (error) {
      console.error('Failed to jump to task:', error);
    }
  }, [scrollToTask]);

  // Show loading state while dateRange is initializing
  if (dateRange.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-900">Gantt Chart</h2>
          <p className="text-sm text-gray-600 mt-1">Loading timeline...</p>
        </div>
        <div className="p-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Initializing Gantt view...</p>
        </div>
      </div>
    );
  }

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToHorizontalAxis]}
      onDragStart={handleDragStart} 
      onDragOver={handleDragOver} 
      onDragEnd={handleDragEnd}
    >
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between gap-4">
          {/* Title and Description */}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">Gantt Chart</h2>
            <p className="text-sm text-gray-600 mt-1">
              {dateRange.length > 0 ? (
                `Timeline view from ${formatDate(dateRange[0].date)} to ${formatDate(dateRange[dateRange.length - 1].date)}`
              ) : (
                'Loading timeline...'
              )}
            </p>
          </div>
          
          {/* Navigation Controls */}
          <div className="flex items-center gap-3">
            {/* Navigation Buttons */}
            <div className="flex items-center gap-2">
              {/* Today Button */}
              <button
                onClick={scrollToToday}
                className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                title="Scroll to today"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Today
              </button>

              {/* Earlier Button */}
              <button
                onClick={scrollEarlier}
                className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                title="Scroll to earlier dates"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Earlier
              </button>

              {/* Later Button */}
              <button
                onClick={scrollLater}
                className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                title="Scroll to later dates"
              >
                Later
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* Loading Indicator - Fixed position to prevent layout shift */}
              <div className="relative w-20 flex justify-center">
                {isLoading && (
                  <div className="absolute flex items-center gap-1 px-2 py-1 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-md whitespace-nowrap">
                    <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    Loading
                  </div>
                )}
              </div>
            </div>

            {/* Task Jump Dropdown */}
            {ganttTasks.length > 0 && (
              <div className="flex-shrink-0">
                <TaskJumpDropdown
                  tasks={ganttTasks.filter(task => task.startDate && task.endDate)}
                  onTaskSelect={handleJumpToTask}
                  className="w-56"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Gantt Chart */}
      <div className="relative flex">
        {/* Sticky Task Column */}
        <div 
          className="sticky left-0 z-10 bg-white border-r border-gray-200"
          style={{ width: `${taskColumnWidth}px` }}
        >
          {/* Task Header */}
          <div className="p-3 font-medium text-gray-700 border-b border-gray-200 bg-gray-50 flex items-center justify-between h-12">
            <span>Task</span>
            {/* Resize handle */}
            <div
              className="w-1 h-6 bg-gray-300 hover:bg-gray-400 cursor-col-resize transition-colors"
              onMouseDown={handleResizeStart}
              title="Drag to resize task column"
            />
          </div>
          
          {/* Task Info Rows */}
          {visibleTasks && visibleTasks.length > 0 ? visibleTasks.map((task, taskIndex) => (
            <div 
              key={`task-info-${task.id}`}
              className={`p-2 border-b border-gray-100 ${
                taskViewMode === 'compact' ? 'h-12' : 
                taskViewMode === 'shrink' ? 'h-16' : 
                'h-20'
              } ${taskIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}
            >
              <div className="flex items-center">
                <button
                  onClick={() => handleTaskClick(task)}
                  className="text-left w-full"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-sm font-medium text-gray-900">{task.ticket}</div>
                    {(task.startDate || task.endDate) && (
                      <span className="text-xs text-gray-500">
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
                  {taskViewMode !== 'shrink' && taskViewMode !== 'compact' && (
                    <div className="text-sm text-gray-600 truncate">{task.title}</div>
                  )}
                  {taskViewMode !== 'compact' && (
                    <div className="text-xs text-gray-500 mt-1">
                      📋 {task.status}
                    </div>
                  )}
                </button>
              </div>
            </div>
          )) : (
            <div className="p-4 text-center text-gray-500">
              <div className="mb-2">📅 No tasks yet</div>
              <div className="text-xs">The timeline is ready for your tasks!</div>
            </div>
          )}
        </div>
        
        {/* Scrollable Timeline */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto relative"
        >
          
          <div className="min-w-[800px]">
            {/* Date Header */}
            <div 
              className="grid border-b border-gray-200 bg-gray-50 gantt-timeline-container h-12"
              style={{ gridTemplateColumns: `repeat(${virtualViewport.visibleDates.length}, 1fr)` }}
            >
            {virtualViewport.visibleDates.map((dateCol, index) => {
              const actualIndex = virtualViewport.startIndex + index;
              const prevDateCol = index > 0 ? virtualViewport.visibleDates[index - 1] : null;
              const isFirstOfMonth = !prevDateCol || prevDateCol.date.getMonth() !== dateCol.date.getMonth();
              
              return (
                <div
                  key={actualIndex}
                  className={`p-1 text-xs text-center border-r border-gray-100 ${
                    dateCol.isToday ? 'bg-blue-100 text-blue-800 font-semibold' :
                    dateCol.isWeekend ? 'bg-gray-100 text-gray-600' : 'text-gray-700'
                  }`}
                  style={{ minWidth: '20px' }}
                >
                  <div>{dateCol.date.getDate()}</div>
                  {(actualIndex % 7 === 0 || isFirstOfMonth) && (
                    <div className="text-xs text-gray-500 mt-1">
                      {dateCol.date.toLocaleDateString('en-US', { month: 'short' })}
                      {/* Show year for first month occurrence */}
                      {isFirstOfMonth && (
                        <div className="text-xs text-gray-400">
                          {dateCol.date.getFullYear()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            </div>

            {/* Task Timeline Rows */}
            {visibleTasks && visibleTasks.length > 0 ? visibleTasks.map((task, taskIndex) => {
              const gridPosition = getTaskBarGridPosition(task);
              
              return (
                <div 
                  key={task.id} 
                  className={`grid border-b border-gray-100 ${taskIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors relative ${
                    taskViewMode === 'compact' ? 'h-12' : 
                    taskViewMode === 'shrink' ? 'h-16' : 
                    'h-20'
                  }`}
                  style={{ gridTemplateColumns: `repeat(${virtualViewport.visibleDates.length}, 1fr)` }}
                >
                {/* Background Date Columns - droppable areas */}
                {virtualViewport.visibleDates.map((dateCol, relativeIndex) => {
                  const dateIndex = virtualViewport.startIndex + relativeIndex;
                  const dateString = dateCol.date.toISOString().split('T')[0];
                  const dropId = `date-${dateIndex}`;
                  
                  // Inline droppable component
                  const DroppableDateCell = () => {
                    const { setNodeRef } = useDroppable({
                      id: dropId,
                      data: {
                        date: dateString,
                        dateIndex
                      }
                    });


                    return (
                      <div
                        ref={setNodeRef}
                        className={`h-16 border-r border-gray-100 ${
                          dateCol.isToday ? 'bg-blue-50' : 
                          dateCol.isWeekend ? 'bg-gray-50' : ''
                        }`}
                        style={{ 
                          gridColumn: relativeIndex + 1, // Relative to visible grid
                          gridRow: 1,
                          minWidth: '20px' 
                        }}
                      >
                      </div>
                    );
                  };
                  
                  return <DroppableDateCell key={`bg-${dateIndex}`} />;
                })}
                
                {/* Task Bar - direct grid child for precise alignment */}
                {gridPosition && (() => {
                  // Check if this task is being dragged
                  const isDragging = activeDragItem?.taskId === task.id;
                  let startIndex = gridPosition.startDayIndex;
                  let endIndex = gridPosition.endDayIndex;
                  
                  
                  // Apply real-time visual feedback during drag
                  if (isDragging && currentHoverDate && activeDragItem) {
                    const hoverDateIndex = dateRange.findIndex(d => 
                      d.date.toISOString().split('T')[0] === currentHoverDate
                    );
                    
                    if (hoverDateIndex >= 0) {
                      if (activeDragItem.dragType === DRAG_TYPES.TASK_START_HANDLE) {
                        // Dragging start handle - if past end, clamp to end (1-day at end position)
                        if (hoverDateIndex > endIndex) {
                          startIndex = endIndex; // Clamp to end position
                        } else {
                          startIndex = hoverDateIndex;
                        }
                      } else if (activeDragItem.dragType === DRAG_TYPES.TASK_END_HANDLE) {
                        // Dragging end handle - if before start, clamp to start (1-day at start position)
                        if (hoverDateIndex < startIndex) {
                          endIndex = startIndex; // Clamp to start position
                        } else {
                          endIndex = hoverDateIndex;
                        }
                      } else if (activeDragItem.dragType === DRAG_TYPES.TASK_MOVE_HANDLE) {
                        // Moving entire task - shift both start and end by the same amount
                        const originalStart = gridPosition.startDayIndex;
                        const originalEnd = gridPosition.endDayIndex;
                        const taskDuration = originalEnd - originalStart;
                        startIndex = hoverDateIndex;
                        endIndex = hoverDateIndex + taskDuration;
                      }
                    }
                  }
                  
                  return (
                    <div
                      className={`h-6 rounded ${isDragging ? 'opacity-90 ring-2 ring-blue-400' : 'opacity-80 hover:opacity-100'} transition-all flex items-center group relative`}
                      style={{
                        gridColumn: startIndex === endIndex 
                          ? `${startIndex + 2} / ${startIndex + 3}` // 1-day task: exactly 1 column
                          : `${startIndex + 2} / ${endIndex + 3}`,   // Multi-day task: normal span
                        gridRow: 1,
                        alignSelf: 'center',
                        zIndex: isDragging ? 25 : 10,
                        ...getPriorityColor(task.priority)
                      }}
                      title={`${task.title}\nStart: ${task.startDate?.toLocaleDateString()}\nEnd: ${task.endDate?.toLocaleDateString()}`}
                    >
                        {/* Move handle - positioned with gap */}
                        <MoveHandle
                          taskId={task.id}
                          task={{
                            id: task.id,
                            title: task.title,
                            startDate: task.startDate,
                            endDate: task.endDate
                          } as Task}
                          onTaskMove={handleTaskDrop}
                        />
                        
                        {/* Conditional handles based on task duration */}
                        {startIndex === endIndex ? (
                          /* 1-day task: Only right handle for extending */
                          null // No left handle for 1-day tasks
                        ) : (
                          /* Multi-day task: Left resize handle */
                          <TaskHandle
                            taskId={task.id}
                            task={{
                              id: task.id,
                              title: task.title,
                              startDate: task.startDate,
                              endDate: task.endDate
                            } as Task}
                            handleType="start"
                            onDateChange={handleTaskDrop}
                            taskColor={getPriorityColor(task.priority)}
                          />
                        )}
                        
                        {/* Task content - conditional title display */}
                        {startIndex === endIndex || taskViewMode === 'shrink' || taskViewMode === 'compact' ? (
                          /* 1-day task or compact/shrink mode: No visible title (only tooltip) */
                          <div className="flex-1 min-w-0"></div>
                        ) : (
                          /* Multi-day task in expand mode: Show title */
                          <div 
                            className="text-xs truncate px-2 flex-1"
                            style={{ color: getPriorityColor(task.priority).color }}
                          >
                            {task.title}
                          </div>
                        )}
                        
                        {/* Right resize handle - always present */}
                        <TaskHandle
                          taskId={task.id}
                          task={{
                            id: task.id,
                            title: task.title,
                            startDate: task.startDate,
                            endDate: task.endDate
                          } as Task}
                          handleType="end"
                          onDateChange={handleTaskDrop}
                          taskColor={getPriorityColor(task.priority)}
                        />
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
          }) : (
            <div className="p-8 text-center text-gray-500">
              <div className="text-lg mb-2">No tasks in view</div>
              <div className="text-sm">Scroll to see tasks or adjust the date range.</div>
            </div>
          )}

          {/* Empty state */}
          {(!visibleTasks || visibleTasks.length === 0) && (
            <>
              {/* Empty state with interactive grid for task creation */}
              <div className="text-center text-gray-500 py-4 border-b border-gray-100">
                <div className="text-sm">📅 Timeline ready for new tasks</div>
                <div className="text-xs text-gray-400">Click on any date to create a task</div>
              </div>
              
              {/* Interactive timeline grid for task creation */}
              <div 
                className="grid border-b border-gray-100 bg-white hover:bg-blue-50 transition-colors relative h-16"
                style={{ gridTemplateColumns: `repeat(${virtualViewport.visibleDates.length}, 1fr)` }}
              >
                {/* Background Date Columns - droppable areas for new tasks */}
                {virtualViewport.visibleDates.map((dateCol, relativeIndex) => {
                  const dateIndex = virtualViewport.startIndex + relativeIndex;
                  const dateString = dateCol.date.toISOString().split('T')[0];
                  const dropId = `date-${dateIndex}`;

                  return (
                    <div
                      key={dropId}
                      className={`relative border-r border-gray-100 h-full ${
                        dateCol.isToday ? 'bg-blue-50' :
                        dateCol.isWeekend ? 'bg-gray-50' : 'bg-white'
                      } hover:bg-blue-100 transition-colors cursor-pointer`}
                      style={{ minWidth: '20px' }}
                      title={`Create task on ${dateCol.date.toLocaleDateString()}`}
                    >
                      {/* Future: Add click handler for task creation */}
                    </div>
                  );
                })}
              </div>
            </>
          )}
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
  );
};

export default GanttView;
