import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverEvent, KeyboardSensor, PointerSensor, useSensor, useSensors, useDroppable, closestCenter } from '@dnd-kit/core';
import { Task, Columns, PriorityOption } from '../types';
import { TaskViewMode, loadUserPreferencesAsync, saveUserPreferences } from '../utils/userPreferences';
import { updateTask, getAllPriorities, createTaskAtTop } from '../api';
import { generateUUID } from '../utils/uuid';
import { TaskHandle } from './gantt/TaskHandle';
import { MoveHandle } from './gantt/MoveHandle';
import { GanttDragItem, DRAG_TYPES } from './gantt/types';
import { usePerformanceMonitor } from '../hooks/usePerformanceMonitor';
import { TaskJumpDropdown } from './gantt/TaskJumpDropdown';

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

const GanttView: React.FC<GanttViewProps> = ({ columns, onSelectTask, taskViewMode = 'expand', onUpdateTask, onTaskDragStart, onTaskDragEnd, boardId, onAddTask, currentUser, members, onRefreshData }) => {
  const [priorities, setPriorities] = useState<PriorityOption[]>([]);
  const [activeDragItem, setActiveDragItem] = useState<GanttDragItem | null>(null);
  const [currentHoverDate, setCurrentHoverDate] = useState<string | null>(null);
  const [taskColumnWidth, setTaskColumnWidth] = useState(320); // Default 320px, will load from preferences
  const [, setIsResizing] = useState(false);
  
  // Task creation drag state
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [taskCreationStart, setTaskCreationStart] = useState<string | null>(null);
  const [taskCreationEnd, setTaskCreationEnd] = useState<string | null>(null);

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
  }, 'ganttTasks calculation', 'computation')(), [columns, measureFunction]);

  // Smart dynamic date loading with continuous timeline
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [dateRange, setDateRange] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewportCenter, setViewportCenter] = useState<Date>(new Date()); // Track center of current view
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  
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

  // Initialize date range based on tasks or default around today
  useEffect(() => {
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
    
    const today = new Date();
    
    // Determine initial center point
    let centerDate = today;
    if (earliestTaskDate && latestTaskDate) {
      // Center between earliest and latest task
      const midTime = (earliestTaskDate as Date).getTime() + ((latestTaskDate as Date).getTime() - (earliestTaskDate as Date).getTime()) / 2;
      centerDate = new Date(midTime);
    }
    
    setViewportCenter(centerDate);
    
    // Initial range: 6 months total (3 months before and after center)
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
    
    const initialRange = generateDateRange(startDate, endDate);
    setDateRange(initialRange);
  }, [ganttTasks, generateDateRange]);

  // Load earlier dates (2 months)
  const loadEarlier = useCallback(() => {
    if (dateRange.length === 0) return;
    
    setIsLoading(true);
    
    const firstDate = dateRange[0].date;
    const newStartDate = new Date(firstDate);
    newStartDate.setMonth(newStartDate.getMonth() - 2);
    newStartDate.setDate(1); // Start of month
    
    const newEndDate = new Date(firstDate);
    newEndDate.setDate(newEndDate.getDate() - 1); // Day before current first date
    
    const newDates = generateDateRange(newStartDate, newEndDate);
    
    // Prepend new dates
    const updatedRange = [...newDates, ...dateRange];
    
    // Memory management: Keep max 12 months (trim from end if needed)
    const maxDays = 365;
    const finalRange = updatedRange.length > maxDays 
      ? updatedRange.slice(0, maxDays) 
      : updatedRange;
    
    setDateRange(finalRange);
    
    // Adjust scroll position to maintain current view
    if (scrollContainerRef.current) {
      const scrollAdjustment = newDates.length * 20; // 20px per column
      scrollContainerRef.current.scrollLeft += scrollAdjustment;
    }
    
    setIsLoading(false);
  }, [dateRange, generateDateRange]);

  // Load later dates (2 months)
  const loadLater = useCallback(() => {
    if (dateRange.length === 0) return;
    
    setIsLoading(true);
    
    const lastDate = dateRange[dateRange.length - 1].date;
    const newStartDate = new Date(lastDate);
    newStartDate.setDate(newStartDate.getDate() + 1); // Day after current last date
    
    const newEndDate = new Date(lastDate);
    newEndDate.setMonth(newEndDate.getMonth() + 2);
    const daysInMonth = new Date(newEndDate.getFullYear(), newEndDate.getMonth() + 1, 0).getDate();
    newEndDate.setDate(daysInMonth); // Last day of month
    
    const newDates = generateDateRange(newStartDate, newEndDate);
    
    // Append new dates
    const updatedRange = [...dateRange, ...newDates];
    
    // Memory management: Keep max 12 months (trim from start if needed)
    const maxDays = 365;
    const finalRange = updatedRange.length > maxDays 
      ? updatedRange.slice(-maxDays) 
      : updatedRange;
    
    // Adjust scroll if we trimmed from start
    if (updatedRange.length > maxDays && scrollContainerRef.current) {
      const trimmed = updatedRange.length - maxDays;
      scrollContainerRef.current.scrollLeft -= trimmed * 20;
    }
    
    setDateRange(finalRange);
    setIsLoading(false);
  }, [dateRange, generateDateRange]);

  // Get all tasks (all tasks always available)
  const getVisibleTasks = useCallback(() => ganttTasks, [ganttTasks]);
  
  // Navigation functions
  const scrollToToday = useCallback(() => {
    if (!scrollContainerRef.current) return;
    
    const todayIndex = dateRange.findIndex(d => d.isToday);
    if (todayIndex >= 0) {
      // Calculate actual column width based on container and grid
      const container = scrollContainerRef.current;
      const timelineContainer = container.querySelector('.gantt-timeline-container');
      if (timelineContainer) {
        const totalWidth = timelineContainer.scrollWidth;
        const columnWidth = totalWidth / dateRange.length;
        const scrollLeft = todayIndex * columnWidth;
        const targetScroll = scrollLeft - (container.clientWidth / 2);
        
        // Smooth scroll to today
        container.scrollTo({
          left: Math.max(0, targetScroll),
          behavior: 'smooth'
        });
      }
    } else {
      // If today is not in range, load it
      const today = new Date();
      setViewportCenter(today);
    }
  }, [dateRange]);
  
  const scrollToTask = useCallback(async (startDate: Date, endDate: Date, position?: string) => {
    if (!scrollContainerRef.current) return;
    
    const startIndex = dateRange.findIndex(d => 
      d.date.toISOString().split('T')[0] === startDate.toISOString().split('T')[0]
    );
    
    if (startIndex >= 0) {
      // Calculate actual column width based on container and grid
      const container = scrollContainerRef.current;
      const timelineContainer = container.querySelector('.gantt-timeline-container');
      if (timelineContainer) {
        const totalWidth = timelineContainer.scrollWidth;
        const columnWidth = totalWidth / dateRange.length;
        const scrollLeft = startIndex * columnWidth;
        const targetScroll = scrollLeft - (container.clientWidth / 3);
        
        // Smooth scroll to task
        container.scrollTo({
          left: Math.max(0, targetScroll),
          behavior: 'smooth'
        });
      }
    } else {
      // If task date is not in range, center viewport on task and reload
      setViewportCenter(new Date(startDate));
    }
  }, [dateRange]);
  
  // Enhanced scroll functions with smooth scrolling and dynamic loading
  const scrollEarlier = useCallback(() => {
    if (!scrollContainerRef.current) return;
    
    const currentScroll = scrollContainerRef.current.scrollLeft;
    const newScroll = Math.max(0, currentScroll - 600); // Scroll left by ~30 days
    
    // If we're scrolling near the beginning, trigger load earlier
    if (newScroll < 400 && dateRange.length > 0) { // Within 20 days of start
      loadEarlier();
    }
    
    // Smooth scroll to new position
    scrollContainerRef.current.scrollTo({
      left: newScroll,
      behavior: 'smooth'
    });
  }, [loadEarlier, dateRange.length]);
  
  const scrollLater = useCallback(() => {
    if (!scrollContainerRef.current) return;
    
    const currentScroll = scrollContainerRef.current.scrollLeft;
    const maxScroll = scrollContainerRef.current.scrollWidth - scrollContainerRef.current.clientWidth;
    const newScroll = Math.min(maxScroll, currentScroll + 600); // Scroll right by ~30 days
    
    // If we're scrolling near the end, trigger load later
    if (newScroll > maxScroll - 400 && dateRange.length > 0) { // Within 20 days of end
      loadLater();
    }
    
    // Smooth scroll to new position
    scrollContainerRef.current.scrollTo({
      left: newScroll,
      behavior: 'smooth'
    });
  }, [loadLater, dateRange.length]);

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


  // Get all tasks (no virtual filtering - all tasks are always visible)
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

  // Helper function to get original task from GanttTask
  const getOriginalTask = (ganttTask: GanttTask): Task | null => {
    return Object.values(columns)
      .flatMap(column => column.tasks)
      .find(t => t.id === ganttTask.id) || null;
  };

  // DnD-Kit handlers
  const handleDragStart = (event: DragStartEvent) => {
    const dragData = event.active.data.current as GanttDragItem;
    setActiveDragItem(dragData);
    setCurrentHoverDate(null);
    console.log('🎯 Drag started:', dragData);
    
    // Call standard drag start handler to set draggedTask state (disables polling)
    if (onTaskDragStart && dragData?.taskId) {
      const draggedTask = ganttTasks.find(t => t.id === dragData.taskId);
      if (draggedTask) {
        // Convert GanttTask to Task format
        const taskForParent = Object.values(columns)
          .flatMap(col => col.tasks)
          .find(t => t.id === draggedTask.id);
        
        if (taskForParent) {
          onTaskDragStart(taskForParent);
          console.log('🛡️ Drag state set - polling disabled');
        }
      }
    }
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
      
      // Still call drag end handler to clear state
      if (onTaskDragEnd) {
        onTaskDragEnd();
        console.log('🔄 Drag state cleared - polling re-enabled');
      }
      
      return;
    }

    const dropData = over.data.current as { date: string; dateIndex: number };
    const targetDate = dropData.date;
    
    console.log('🎯 Drag ended:', { dragItem: activeDragItem, targetDate });

    // Simple approach: Set drag state immediately (disables polling)
    if (onTaskDragStart && activeDragItem?.taskId) {
      const taskForParent = Object.values(columns)
        .flatMap(col => col.tasks)
        .find(t => t.id === activeDragItem.taskId);
      
      if (taskForParent) {
        onTaskDragStart(taskForParent);
        console.log('🛡️ Polling disabled during update');
      }
    }

    try {
      // Find the original task
      const originalTask = Object.values(columns)
        .flatMap(column => column.tasks)
        .find(t => t.id === activeDragItem.taskId);

      if (!originalTask) {
        console.error('❌ Original task not found');
        return;
      }

      // Calculate the updated task
      let updatedTask = { ...originalTask };

      console.log('🔧 Before update:', { 
        dragType: activeDragItem.dragType, 
        targetDate, 
        currentStart: originalTask.startDate, 
        currentDue: originalTask.dueDate 
      });

      if (activeDragItem.dragType === DRAG_TYPES.TASK_START_HANDLE) {
        const currentEndDate = originalTask.dueDate;
        if (currentEndDate && targetDate > currentEndDate) {
          updatedTask.startDate = currentEndDate;
          console.log('📅 Clamping startDate to endDate for 1-day task:', currentEndDate);
        } else {
          updatedTask.startDate = targetDate;
          console.log('📅 Setting startDate to:', targetDate);
        }
      } else if (activeDragItem.dragType === DRAG_TYPES.TASK_END_HANDLE) {
        const currentStartDate = originalTask.startDate;
        if (currentStartDate && targetDate < currentStartDate) {
          updatedTask.dueDate = currentStartDate;
          console.log('📅 Clamping endDate to startDate for 1-day task:', currentStartDate);
        } else {
          updatedTask.dueDate = targetDate;
          console.log('📅 Setting dueDate to:', targetDate);
        }
      } else if (activeDragItem.dragType === DRAG_TYPES.TASK_MOVE_HANDLE) {
        const originalStart = new Date(activeDragItem.originalStartDate);
        const originalEnd = new Date(activeDragItem.originalEndDate);
        const taskDuration = Math.abs(originalEnd.getTime() - originalStart.getTime());
        const newStartDate = new Date(targetDate);
        const newEndDate = new Date(newStartDate.getTime() + taskDuration);
        
        updatedTask.startDate = targetDate;
        updatedTask.dueDate = newEndDate.toISOString().split('T')[0];
      }

      console.log('🔄 Calling handleEditTask with:', updatedTask);

      // Use the exact same function that ListView and TaskCard use
      if (onUpdateTask) {
        await onUpdateTask(updatedTask);
        console.log('✅ Task updated successfully');
      }

    } catch (error) {
      console.error('❌ Failed to update task:', error);
    } finally {
      // Clear drag state (re-enables polling)
      if (onTaskDragEnd) {
        onTaskDragEnd();
        console.log('🔄 Polling re-enabled');
      }
      
      setActiveDragItem(null);
      setCurrentHoverDate(null);
    }
  };

  const handleTaskDrop = (dragData: GanttDragItem, targetDate: string) => {
    // This will be called by DateColumn, but the actual logic is in handleDragEnd
    console.log('📍 Task dropped on date:', { dragData, targetDate });
  };

  // Get default priority name  
  const getDefaultPriorityName = (): string => {
    const defaultPriority = priorities.find(p => !!p.initial);
    return defaultPriority?.priority || 'Medium';
  };

  // Handle task creation with date range support
  const createTaskWithDateRange = async (startDate: string, endDate: string) => {
    // Find the first column (position 0) to add the task to
    const firstColumn = Object.values(columns).find(col => col.position === 0);
    if (!firstColumn) {
      console.error('No first column found for task creation');
      return;
    }

    // If we have advanced task creation capabilities, use them
    if (currentUser && members && boardId) {
      console.log('🆕 Creating advanced task with date range:', startDate, 'to', endDate, 'in column:', firstColumn.title);
      
      // Find current user member
      const currentUserMember = members.find(m => m.user_id === currentUser.id);
      if (!currentUserMember) {
        console.error('Current user not found in members list');
        return;
      }

      // Create task with prefilled date range
      const newTask: Task = {
        id: generateUUID(),
        title: 'New Task',
        description: '',
        memberId: currentUserMember.id,
        startDate: startDate, // Pre-fill with start date
        dueDate: endDate,     // Pre-fill with end date (or same as start for single day)
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
        console.log('✅ Task created successfully:', createdTask);
        
        // Refresh data to get updated state
        if (onRefreshData) {
          await onRefreshData();
        }
        
        // Open the task in detail view for editing
        onSelectTask(createdTask);
        
      } catch (error) {
        console.error('❌ Failed to create task:', error);
      }
    } else if (onAddTask) {
      // Fallback to basic task creation
      console.log('🆕 Creating basic task in column:', firstColumn.title);
      await onAddTask(firstColumn.id);
    }
  };

  // Handle mouse down for task creation (start of potential drag)
  const handleTaskCreationMouseDown = (dateString: string, event: React.MouseEvent) => {
    // Prevent if we're already dragging a task
    if (activeDragItem) return;
    
    event.preventDefault();
    setIsCreatingTask(true);
    setTaskCreationStart(dateString);
    setTaskCreationEnd(dateString); // Start with same date
    console.log('🎯 Started task creation at:', dateString);
  };

  // Handle mouse enter during task creation drag
  const handleTaskCreationMouseEnter = (dateString: string) => {
    if (isCreatingTask && taskCreationStart) {
      setTaskCreationEnd(dateString);
      console.log('🖱️ Task creation drag to:', dateString);
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
      
      console.log('🆕 Creating task from', finalStartDate, 'to', finalEndDate);
      
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
      console.warn('Cannot jump to task without dates:', task);
      return;
    }

    // Use async wrapper to handle the promise
    (async () => {
    try {
      // Scroll horizontally to the task
      await scrollToTask(task.startDate!, task.endDate!);
      
      // Highlight the task for 1 second
      setHighlightedTaskId(task.id);
      setTimeout(() => {
        setHighlightedTaskId(null);
      }, 1000);
      
      // Scroll vertically to task if not visible
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
          }
        }
      }, 100); // Small delay to ensure horizontal scroll completes first
      
      console.log('🎯 Jumped to task:', task.ticket);
    } catch (error) {
      console.error('Failed to jump to task:', error);
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

        const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
        const maxScrollLeft = scrollWidth - clientWidth;
        
        // Check if we're at scroll boundaries
        const isAtLeftBoundary = scrollLeft <= 0 && wheelEvent.deltaX < 0;
        const isAtRightBoundary = scrollLeft >= maxScrollLeft && wheelEvent.deltaX > 0;
        
        // Always prevent browser navigation when scrolling horizontally in Gantt
        if (isAtLeftBoundary || isAtRightBoundary) {
          event.preventDefault();
          event.stopPropagation();
          
          // Trigger content loading for smooth UX
          if (isAtLeftBoundary && wheelEvent.deltaX < -5) {
            loadEarlier();
          } else if (isAtRightBoundary && wheelEvent.deltaX > 5) {
            loadLater();
          }
        }
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
      <div className="gantt-chart-container bg-white rounded-lg border border-gray-200 overflow-visible">
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
          <div className="flex items-center gap-4">
            {/* Task Navigation: < Task > */}
            <div className="flex items-center gap-1">
              {/* Jump to Earliest Task */}
              <button
                onClick={() => {
                  if (ganttTasks.length > 0) {
                    const earliestTask = ganttTasks.reduce((earliest, task) => 
                      (!earliest.startDate || (task.startDate && task.startDate < earliest.startDate)) ? task : earliest
                    );
                    if (earliestTask.startDate) {
                      scrollToTask(earliestTask.startDate, earliestTask.endDate || earliestTask.startDate, 'start-left');
                    }
                  }
                }}
                disabled={ganttTasks.length === 0}
                className="p-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Jump to earliest task"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {/* Task Label */}
              <span className="text-sm text-gray-600 font-medium px-2">Task</span>

              {/* Jump to Latest Task */}
              <button
                onClick={() => {
                  if (ganttTasks.length > 0) {
                    const latestTask = ganttTasks.reduce((latest, task) => 
                      (!latest.endDate || (task.endDate && task.endDate > latest.endDate)) ? task : latest
                    );
                    if (latestTask.endDate) {
                      scrollToTask(latestTask.startDate || latestTask.endDate, latestTask.endDate, 'end-right');
                    }
                  }
                }}
                disabled={ganttTasks.length === 0}
                className="p-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Jump to latest task"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Date Navigation: < Earlier Today Later > */}
            <div className="flex items-center gap-2">
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
            </div>

            {/* Loading Indicator - Fixed position to prevent layout shift */}
            <div className="relative w-20 flex justify-center">
              {isLoading && (
                <div className="absolute flex items-center gap-1 px-2 py-1 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-md whitespace-nowrap">
                  <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  Loading
                </div>
              )}
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
          {/* Task Header - matches Month/Day headers (h-6 + h-8 = 24px + 32px = 56px) */}
          <div className="font-medium text-gray-700 border-b border-gray-200 bg-gray-50 flex items-center justify-between px-3" style={{ height: '56px' }}>
            <span>Task</span>
            {/* Resize handle */}
            <div
              className="w-1 h-6 bg-gray-300 hover:bg-gray-400 cursor-col-resize transition-colors"
              onMouseDown={handleResizeStart}
              title="Drag to resize task column"
            />
          </div>
          
          {/* Task Creation Header Row - matches creation row in timeline */}
          <div className="h-12 bg-blue-50 border-b-4 border-blue-400 flex items-center justify-end px-3">
            <span className="text-sm text-blue-700 font-medium">Add tasks here →</span>
          </div>
          
          {/* Task Info Rows */}
          {visibleTasks && visibleTasks.length > 0 ? visibleTasks.map((task, taskIndex) => (
            <div 
              key={`task-info-${task.id}`}
              data-task-id={task.id}
              className={`p-2 border-b border-gray-100 ${
                taskViewMode === 'compact' ? 'h-12' : 
                taskViewMode === 'shrink' ? 'h-16' : 
                'h-20'
              } ${taskIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}
            >
              <div className="flex items-center">
                <button
                  onClick={() => handleTaskClick(task)}
                  className={`text-left w-full rounded px-1 py-1 transition-all duration-300 ${
                    highlightedTaskId === task.id 
                      ? 'bg-yellow-200 ring-2 ring-yellow-400 ring-inset' 
                      : 'hover:bg-gray-100'
                  }`}
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
          
          <div 
            className="min-w-[800px]" 
            style={{ width: `${Math.max(800, dateRange.length * 40 + 200)}px` }}
          >
            {/* Month/Year Header Row */}
            <div 
              className="grid border-b border-gray-100 bg-gray-50 gantt-timeline-container h-6"
              style={{ 
                gridTemplateColumns: `repeat(${dateRange.length}, 1fr)`,
                minWidth: '800px'
              }}
            >
              {dateRange.map((dateCol, index) => (
                <div
                  key={index}
                  className="text-xs text-center py-1 border-r border-gray-200"
                  style={{ minWidth: '20px' }}
                >
                  {dateCol.date.getDate() === 1 && (
                    <span className="text-gray-600 font-medium">
                      {dateCol.date.toLocaleDateString('en-US', { month: 'short' })}'{dateCol.date.getFullYear().toString().slice(-2)}
                    </span>
                  )}
                </div>
              ))}
            </div>
            
            {/* Day Numbers Row */}
            <div 
              className="grid border-b border-gray-200 bg-gray-50 gantt-timeline-container h-8"
              style={{ 
                gridTemplateColumns: `repeat(${dateRange.length}, 1fr)`,
                minWidth: '800px'
              }}
            >
            {dateRange.map((dateCol, index) => {
              const actualIndex = index;
              
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
                </div>
              );
            })}
            </div>

            {/* Task Creation Row */}
            <div 
              className="grid bg-white transition-colors relative h-12 border-b-4 border-blue-400"
              style={{ 
                gridTemplateColumns: `repeat(${dateRange.length}, 1fr)`,
                minWidth: '800px'
              }}
            >
                {dateRange.map((dateCol, relativeIndex) => {
                const dateIndex = relativeIndex;
                const dateString = dateCol.date.toISOString().split('T')[0];
                
                return (
                  <div
                    key={`create-${dateIndex}`}
                    className={`border-r border-gray-100 hover:bg-blue-50 transition-colors flex items-center justify-center group relative ${
                      isCreatingTask ? 'cursor-crosshair bg-blue-100' : 'cursor-pointer'
                    } ${
                      dateCol.isToday ? 'bg-blue-50' : 
                      dateCol.isWeekend ? 'bg-gray-50' : ''
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
            {visibleTasks && visibleTasks.length > 0 ? visibleTasks.map((task, taskIndex) => {
              const gridPosition = getTaskBarGridPosition(task);
              
              return (
                <div 
                  key={task.id} 
                  data-task-id={task.id}
                  className={`grid border-b border-gray-100 ${taskIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors relative ${
                    taskViewMode === 'compact' ? 'h-12' : 
                    taskViewMode === 'shrink' ? 'h-16' : 
                    'h-20'
                  }`}
                  style={{ gridTemplateColumns: `repeat(${dateRange.length}, 1fr)` }}
                >
                {/* Background Date Columns - droppable areas */}
                {dateRange.map((dateCol, relativeIndex) => {
                  const dateIndex = relativeIndex;
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


                    // Check if this date is in the creation selection (ONLY during active task creation)
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
                        ref={setNodeRef}
                        className={`h-16 border-r border-gray-100 transition-colors ${
                          dateCol.isToday ? 'bg-blue-50' : 
                          dateCol.isWeekend ? 'bg-gray-50' : ''
                        }`}
                        style={{ 
                          gridColumn: relativeIndex + 1, // Relative to visible grid
                          gridRow: 1,
                          minWidth: '20px' 
                        }}
                      >
                        {/* Background cell - no task creation here anymore */}
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
                          ? `${startIndex + 1} / ${startIndex + 2}` // 1-day task: exactly 1 column
                          : `${startIndex + 1} / ${endIndex + 2}`,   // Multi-day task: normal span
                        gridRow: 1,
                        alignSelf: 'center',
                        zIndex: isDragging ? 25 : 10,
                        ...getPriorityColor(task.priority)
                      }}
                      title={`${task.title}\nStart: ${task.startDate?.toLocaleDateString()}\nEnd: ${task.endDate?.toLocaleDateString()}`}
                    >
                        {/* Move handle - positioned with gap */}
                        {(() => {
                          const originalTask = getOriginalTask(task);
                          return originalTask ? (
                        <MoveHandle
                          taskId={task.id}
                              task={originalTask}
                              onTaskMove={(taskId, newStartDate, newEndDate) => {
                                // Convert to the expected format for handleTaskDrop
                                const dragData: GanttDragItem = {
                                  id: `${taskId}-move`,
                                  taskId,
                                  taskTitle: task.title,
                                  originalStartDate: task.startDate?.toISOString().split('T')[0] || '',
                                  originalEndDate: task.endDate?.toISOString().split('T')[0] || '',
                                  dragType: DRAG_TYPES.TASK_MOVE_HANDLE
                                };
                                handleTaskDrop(dragData, newStartDate);
                              }}
                            />
                          ) : null;
                        })()}
                        
                        {/* Conditional handles based on task duration */}
                        {startIndex === endIndex ? (
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
                        {(() => {
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
                className="grid bg-white hover:bg-blue-50 transition-colors relative h-16 border-b-4 border-blue-400"
                style={{ 
                  gridTemplateColumns: `repeat(${dateRange.length}, 1fr)`,
                  minWidth: '800px'
                }}
              >
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
                      className={`relative border-r border-gray-100 h-full transition-colors cursor-pointer ${
                        isInCreationRange 
                          ? 'bg-blue-200 border-blue-300' 
                          : `${dateCol.isToday ? 'bg-blue-50' :
                               dateCol.isWeekend ? 'bg-gray-50' : 'bg-white'
                             } hover:bg-blue-100`
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
                          <div className="text-xs text-blue-700 font-medium bg-white px-1 rounded">
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
  );
};

export default GanttView;
