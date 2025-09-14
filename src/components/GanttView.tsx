import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverEvent, KeyboardSensor, PointerSensor, useSensor, useSensors, useDroppable, closestCenter } from '@dnd-kit/core';
import { Task, Columns, PriorityOption } from '../types';
import { TaskViewMode, loadUserPreferencesAsync, saveUserPreferences } from '../utils/userPreferences';
import { updateTask, getAllPriorities, createTaskAtTop, addTaskRelationship, removeTaskRelationship } from '../api';
import { generateUUID } from '../utils/uuid';
import { TaskHandle } from './gantt/TaskHandle';
import { MoveHandle } from './gantt/MoveHandle';
import { GanttDragItem, DRAG_TYPES } from './gantt/types';
import { usePerformanceMonitor } from '../hooks/usePerformanceMonitor';
import { GanttHeader } from './gantt/GanttHeader';
import { TaskDependencyArrows } from './gantt/TaskDependencyArrows';

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

const GanttView: React.FC<GanttViewProps> = ({ columns, onSelectTask, taskViewMode = 'expand', onUpdateTask, onTaskDragStart, onTaskDragEnd, boardId, onAddTask, currentUser, members, onRefreshData, relationships = [] }) => {
  const [priorities, setPriorities] = useState<PriorityOption[]>([]);
  const [activeDragItem, setActiveDragItem] = useState<GanttDragItem | null>(null);
  const [currentHoverDate, setCurrentHoverDate] = useState<string | null>(null);
  const [taskColumnWidth, setTaskColumnWidth] = useState(320); // Default 320px, will load from preferences
  const [, setIsResizing] = useState(false);
  const [isRelationshipMode, setIsRelationshipMode] = useState(false);
  const [selectedParentTask, setSelectedParentTask] = useState<string | null>(null);

  // Handle ESC key to exit relationship mode
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isRelationshipMode) {
        setIsRelationshipMode(false);
        setSelectedParentTask(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isRelationshipMode]);
  
  // Handle relationship creation
  const handleCreateRelationship = async (parentTaskId: string, childTaskId: string) => {
    try {
      
      // Create parent relationship (parent -> child)
      await addTaskRelationship(parentTaskId, 'parent', childTaskId);
      
      
      // Refresh the data to show the new arrow
      if (onRefreshData) {
        onRefreshData();
      }
      
    } catch (error) {
      console.error('❌ Failed to create relationship:', error);
      // TODO: Show user-friendly error message
    }
  };

  // Handle relationship deletion
  const handleDeleteRelationship = async (relationshipId: string, fromTaskId: string) => {
    try {
      
      await removeTaskRelationship(fromTaskId, relationshipId);
      
      
      // Refresh the data to remove the arrow
      if (onRefreshData) {
        onRefreshData();
      }
      
    } catch (error) {
      console.error('❌ Failed to delete relationship:', error);
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
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3, // Reduce from 5px to 3px for faster drag initiation
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
  const [viewportCenter, setViewportCenter] = useState<Date | null>(null); // Track center of current view

  // Consistent column width calculation function
  const getColumnWidth = useCallback(() => {
    if (!scrollContainerRef.current || dateRange.length === 0) {
      return 40; // Default fallback
    }
    
    const timelineContainer = scrollContainerRef.current.querySelector('.gantt-timeline-container');
    if (!timelineContainer) {
      return 40; // Default fallback
    }
    
    const totalWidth = timelineContainer.scrollWidth;
    return totalWidth / dateRange.length;
  }, [dateRange.length]);

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
  const saveScrollPosition = useCallback(async (firstVisibleDate: string, exactScrollLeft?: number) => {
    if (!boardId || !firstVisibleDate || firstVisibleDate === lastSavedScrollDateRef.current) {
      return; // Don't save if no boardId, no date, or same date (avoid loops)
    }

    try {
      console.log(`💾 [GanttScroll] Saving scroll position for board ${boardId}: ${firstVisibleDate}${exactScrollLeft !== undefined ? ` at scroll: ${exactScrollLeft}` : ''}`);
      const currentPreferences = await loadUserPreferencesAsync();
      const sessionId = Date.now().toString(); // Unique session identifier
      
      await saveUserPreferences({
        ...currentPreferences,
        ganttScrollPositions: {
          ...currentPreferences.ganttScrollPositions,
          [boardId]: {
            date: firstVisibleDate,
            scrollLeft: exactScrollLeft,
            sessionId: sessionId
          }
        }
      });
      
      // Update both state and ref to prevent loops
      lastSavedScrollDateRef.current = firstVisibleDate;
      setLastSavedScrollDate(firstVisibleDate);
      console.log(`✅ [GanttScroll] Successfully saved scroll position: ${firstVisibleDate}${exactScrollLeft !== undefined ? ` at scroll: ${exactScrollLeft}` : ''}`);
    } catch (error) {
      console.error('❌ [GanttScroll] Failed to save scroll position:', error);
    }
  }, [boardId]);

  // Unified function to save current scroll position (works for both manual scroll and button clicks)
  const saveCurrentScrollPosition = useCallback(() => {
    console.log(`🔍 [GanttScroll] saveCurrentScrollPosition called - boardId: ${boardId}, dateRange.length: ${dateRange.length}, isProgrammaticScroll: ${isProgrammaticScroll}, isRestoringPosition: ${isRestoringPosition}`);
    
    if (!scrollContainerRef.current || !boardId || dateRange.length === 0 || isProgrammaticScroll || isRestoringPosition) {
      console.log(`🚫 [GanttScroll] saveCurrentScrollPosition blocked - scrollContainerRef: ${!!scrollContainerRef.current}, boardId: ${boardId}, dateRange.length: ${dateRange.length}, isProgrammaticScroll: ${isProgrammaticScroll}, isRestoringPosition: ${isRestoringPosition}`);
      return;
    }

    const scrollLeft = scrollContainerRef.current.scrollLeft;
    
    // Calculate actual column width dynamically (not hard-coded)
    // Look for timeline container in the sticky header, not the main scroll container
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
    
    if (!timelineContainer) {
      console.log(`🚫 [GanttScroll] Timeline container not found in sticky header`);
      return;
    }
    
    const totalWidth = timelineContainer.scrollWidth;
    const columnWidth = totalWidth / dateRange.length;
    const visibleColumnIndex = Math.floor(scrollLeft / columnWidth);
    const currentLeftmostDate = dateRange[Math.max(0, visibleColumnIndex)]?.date.toISOString().split('T')[0];
    
    console.log(`🔍 [GanttScroll] Calculated position - scrollLeft: ${scrollLeft}, columnWidth: ${columnWidth.toFixed(2)}, visibleColumnIndex: ${visibleColumnIndex}, currentLeftmostDate: ${currentLeftmostDate}, lastSaved: ${lastSavedScrollDateRef.current}`);
    
    if (currentLeftmostDate && currentLeftmostDate !== lastSavedScrollDateRef.current) {
      console.log(`💾 [GanttScroll] Triggering saveScrollPosition for: ${currentLeftmostDate} at scroll position: ${scrollLeft}`);
      // Add a small delay to batch rapid scroll position changes
      setTimeout(() => {
        saveScrollPosition(currentLeftmostDate, scrollLeft);
      }, 100);
    } else {
      console.log(`⏭️ [GanttScroll] Skipping save - same date or no date`);
    }
  }, [boardId, dateRange, saveScrollPosition, isProgrammaticScroll, isRestoringPosition]);


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
        
        console.log(`🎯 [Today] Scrolling to today: index=${newTodayIndex}, columnWidth=${columnWidth.toFixed(2)}, scrollLeft=${scrollLeft.toFixed(2)}, targetScroll=${targetScroll.toFixed(2)}`);
        
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

  // Debounced manual scroll handler
  const handleManualScroll = useCallback(() => {
    console.log(`🔄 [GanttScroll] handleManualScroll called - isProgrammaticScroll: ${isProgrammaticScroll}, isRestoringPosition: ${isRestoringPosition}`);
    if (isProgrammaticScroll || isRestoringPosition) {
      console.log(`🚫 [GanttScroll] handleManualScroll blocked - isProgrammaticScroll: ${isProgrammaticScroll}, isRestoringPosition: ${isRestoringPosition}`);
      return; // Skip during button operations or position restoration
    }
    saveCurrentScrollPosition();
  }, [isProgrammaticScroll, isRestoringPosition, saveCurrentScrollPosition]);

  // Debounced version - only save 500ms after scrolling stops
  const debouncedScrollHandler = useMemo(() => {
    let timeoutId: NodeJS.Timeout;
    return () => {
      console.log(`🔄 [GanttScroll] Scroll event detected`);
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        console.log(`⏰ [GanttScroll] Debounced scroll handler triggered`);
        handleManualScroll();
      }, 500);
    };
  }, [handleManualScroll]);

  // Reset initialization flag when board changes
  useEffect(() => {
    setIsBoardTransitioning(true); // Start transition
    setIsInitialRangeSet(false);
    setLastSavedScrollDate(null);
    setIsProgrammaticScroll(false);
    setIsRestoringPosition(false);
    setViewportCenter(null); // Clear viewport center to allow saved position restoration
  }, [boardId]);

  // Add scroll event listener for manual scroll detection
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      debouncedScrollHandler();
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [debouncedScrollHandler]);

  // Initialize date range based on tasks or default around today
  useEffect(() => {
    // Only set initial range once per board to prevent unwanted repositioning after task updates
    if (isInitialRangeSet && dateRange.length > 0) {
      return;
    }
    
    const initializeDateRange = async () => {
      // Check for saved scroll position for this specific board
      let centerDate = new Date(); // Default to today
      let savedPositionDate = null;
      let savedScrollLeft: number | undefined = undefined;
      
      // Use viewportCenter if available (e.g., from Today button or Jump to task)
      if (viewportCenter) {
        centerDate = new Date(viewportCenter);
      } else if (boardId) {
        try {
          console.log(`🔄 [GanttScroll] Loading saved scroll position for board ${boardId}...`);
          const preferences = await loadUserPreferencesAsync();
          const savedPosition = preferences.ganttScrollPositions?.[boardId];
          
          if (savedPosition?.date) {
            // Use saved position as center date for this board
            centerDate = parseLocalDate(savedPosition.date);
            savedPositionDate = savedPosition.date;
            savedScrollLeft = savedPosition.scrollLeft;
            console.log(`✅ [GanttScroll] Restored scroll position: ${savedPosition.date}${savedPosition.scrollLeft !== undefined ? ` at scroll: ${savedPosition.scrollLeft}` : ''}`);
          } else {
            console.log(`ℹ️ [GanttScroll] No saved scroll position found for board ${boardId}, using today`);
          }
        } catch (error) {
          console.error('❌ [GanttScroll] Failed to load saved scroll position:', error);
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
      }
      
      // Only set viewportCenter if we don't have a saved position (to avoid interfering with restoration)
      if (!savedPositionDate) {
        console.log(`🎯 [GanttScroll] No saved position, setting viewportCenter to: ${centerDate.toISOString().split('T')[0]}`);
        setViewportCenter(centerDate);
        
        // Clear viewportCenter after using it to avoid interfering with future board loads
        if (viewportCenter) {
          setTimeout(() => setViewportCenter(null), 100); // Clear after range is set
        }
      } else {
        console.log(`🎯 [GanttScroll] Saved position found, skipping viewportCenter to avoid interference`);
      }
      
      // Initial range: 2 months total (1 month before and after center) - PERFORMANCE FIX
      const initialMonths = 1;
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
      setIsInitialRangeSet(true); // Mark initial range as set
      setIsBoardTransitioning(false); // End transition
      
      // If we restored a saved position, scroll to the saved date regardless of range size
      if (savedPositionDate) {
        setTimeout(() => {
          if (scrollContainerRef.current && initialRange.length > 0) {
            // Set restoration flag to prevent scroll events from interfering
            setIsRestoringPosition(true);
            
            // Always find the saved date in the current range and scroll to it
            const restoredDate = savedPositionDate;
            const targetIndex = initialRange.findIndex(d => d.date.toISOString().split('T')[0] === restoredDate);
            
            if (targetIndex >= 0) {
              // Look for timeline container in sticky header
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
                const columnWidth = totalWidth / initialRange.length;
                const targetScrollLeft = targetIndex * columnWidth;
                
                console.log(`🎯 [GanttScroll] Restoring to saved date ${restoredDate} at index ${targetIndex}, scroll: ${targetScrollLeft.toFixed(2)}`);
                scrollContainerRef.current.scrollLeft = targetScrollLeft;
              } else {
                console.warn(`🎯 [GanttScroll] Timeline container not found, using fallback scroll position`);
                // Fallback to saved scroll position if available
                if (savedScrollLeft !== undefined) {
                  scrollContainerRef.current.scrollLeft = savedScrollLeft;
                }
              }
            } else {
              console.log(`🎯 [GanttScroll] Saved date ${restoredDate} not found in current range, using saved scroll position`);
              // Fallback to saved scroll position if date not found
              if (savedScrollLeft !== undefined) {
                scrollContainerRef.current.scrollLeft = savedScrollLeft;
              }
            }
            
            // Clear restoration flag after a delay to allow position to stabilize
            setTimeout(() => {
              console.log(`✅ [GanttScroll] Position restoration complete, clearing restoration flag`);
              setIsRestoringPosition(false);
            }, 200);
          }
        }, 100); // Small delay to ensure DOM is updated
      }
      
    };
    
    // Call the async initialization function
    initializeDateRange();
  }, [ganttTasks, generateDateRange, isInitialRangeSet, boardId, saveCurrentScrollPosition]);

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
              console.error('❌ [Today] Timeline container not found after 10 retries');
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
        console.error(`❌ [Today] Target date ${targetDateStr} not found in dateRange`);
        setViewportCenter(null); // Clear if not found
      }
    }
  }, [dateRange, viewportCenter, saveCurrentScrollPosition]);

  // Load earlier dates (2 months)
  const loadEarlier = useCallback(async () => {
    if (dateRange.length === 0) return;
    
    setIsLoading(true);
    
    try {
      const firstDate = dateRange[0].date;
      const newStartDate = new Date(firstDate);
      newStartDate.setMonth(newStartDate.getMonth() - 2);
      newStartDate.setDate(1); // Start of month
      
      const newEndDate = new Date(firstDate);
      newEndDate.setDate(newEndDate.getDate() - 1); // Day before current first date
      
      const newDates = generateDateRange(newStartDate, newEndDate);
      
      // Prepend new dates
      const updatedRange = [...newDates, ...dateRange];
      
      // Memory management: Keep max 4 months (trim from end if needed) - PERFORMANCE FIX
      const maxDays = 120;
      const finalRange = updatedRange.length > maxDays 
        ? updatedRange.slice(0, maxDays) 
        : updatedRange;
      
      setDateRange(finalRange);
      
      // Wait for DOM update before adjusting scroll position
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Adjust scroll position to maintain current view using consistent column width
      if (scrollContainerRef.current) {
        const columnWidth = getColumnWidth();
        const scrollAdjustment = newDates.length * columnWidth;
        scrollContainerRef.current.scrollLeft += scrollAdjustment;
      }
      
      // Save new scroll position after loading earlier dates
      setTimeout(() => {
        if (finalRange.length > 0) {
          // Use the unified save function instead of direct saveScrollPosition call
          saveCurrentScrollPosition();
        }
      }, 100);
      
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, generateDateRange, saveCurrentScrollPosition, getColumnWidth]);

  // Load later dates (2 months)
  const loadLater = useCallback(async () => {
    if (dateRange.length === 0) return;
    
    setIsLoading(true);
    
    try {
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
      
      // Memory management: Keep max 4 months (trim from start if needed) - PERFORMANCE FIX
      const maxDays = 120;
      const finalRange = updatedRange.length > maxDays 
        ? updatedRange.slice(-maxDays) 
        : updatedRange;
      
      setDateRange(finalRange);
      
      // Wait for DOM update before adjusting scroll position
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Adjust scroll if we trimmed from start using consistent column width
      if (updatedRange.length > maxDays && scrollContainerRef.current) {
        const columnWidth = getColumnWidth();
        const trimmed = updatedRange.length - maxDays;
        scrollContainerRef.current.scrollLeft -= trimmed * columnWidth;
      }
      
      // Save new scroll position after loading later dates
      setTimeout(() => {
        if (finalRange.length > 0) {
          // Use the unified save function instead of direct saveScrollPosition call
          saveCurrentScrollPosition();
        }
      }, 100);
      
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, generateDateRange, saveCurrentScrollPosition, getColumnWidth]);

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
      const columnWidth = getColumnWidth();
      const scrollLeft = todayIndex * columnWidth;
      const targetScroll = scrollLeft - (container.clientWidth / 2); // Center it
      
      console.log(`🎯 [Today] Scrolling to today: index=${todayIndex}, columnWidth=${columnWidth.toFixed(2)}, scrollLeft=${scrollLeft.toFixed(2)}, targetScroll=${targetScroll.toFixed(2)}`);
      
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
      // Today not in range - create a new focused range around today and scroll directly
      console.log(`🎯 [Today] Today not in range, creating new range around today`);
      
      // Create a new 4-month range centered on today
      const newStart = new Date(today);
      const newEnd = new Date(today);
      newStart.setMonth(newStart.getMonth() - 2);
      newEnd.setMonth(newEnd.getMonth() + 2);
      
      const focusedRange = generateDateRange(newStart, newEnd);
      setDateRange(focusedRange);
      
      // Wait for the new range to be set, then scroll directly to today
      setTimeout(() => {
        if (scrollContainerRef.current) {
          const newTodayIndex = focusedRange.findIndex(d => d.isToday);
          if (newTodayIndex >= 0) {
            const container = scrollContainerRef.current;
            const columnWidth = getColumnWidth();
            const scrollLeft = newTodayIndex * columnWidth;
            const targetScroll = scrollLeft - (container.clientWidth / 2);
            
            console.log(`🎯 [Today] Scrolling to today in new range: index=${newTodayIndex}, targetScroll=${targetScroll.toFixed(2)}`);
            
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
    console.log(`🎯 [TaskJump] Scrolling to task: ${targetDateStr}, position: ${position || 'default'}`);
    
    // Check if target date is already in current range
    const targetIndex = dateRange.findIndex(d => 
      d.date.toISOString().split('T')[0] === targetDateStr
    );
    
    if (targetIndex >= 0) {
      // Target is already visible - scroll directly to it
      console.log(`🎯 [TaskJump] Task already in range at index: ${targetIndex}`);
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
          targetScroll = scrollLeft - (container.clientWidth * 2 / 3); // Position at right side (2/3 from left)
        } else {
          targetScroll = scrollLeft - (container.clientWidth / 3); // Default: 1/3 from left
        }
        
        console.log(`🎯 [TaskJump] Scrolling to position: scrollLeft=${scrollLeft.toFixed(2)}, targetScroll=${targetScroll.toFixed(2)}`);
        
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
        console.error(`❌ [TaskJump] Timeline container not found in sticky header`);
      }
    } else {
      // Target not in range - expand range to include it
      console.log(`🎯 [TaskJump] Task not in range, expanding range to include: ${targetDateStr}`);
      const currentStart = dateRange[0]?.date;
      const currentEnd = dateRange[dateRange.length - 1]?.date;
      
      if (currentStart && currentEnd) {
        // Determine how to expand the range
        let newStart = new Date(Math.min(currentStart.getTime(), startDate.getTime()));
        let newEnd = new Date(Math.max(currentEnd.getTime(), startDate.getTime()));
        
        // Add some buffer around the target
        newStart.setMonth(newStart.getMonth() - 1);
        newEnd.setMonth(newEnd.getMonth() + 1);
        
        console.log(`🎯 [TaskJump] Expanding range from ${newStart.toISOString().split('T')[0]} to ${newEnd.toISOString().split('T')[0]}`);
        
        // Generate expanded range
        const expandedRange = generateDateRange(newStart, newEnd);
        setDateRange(expandedRange);
        
        // After range updates, scroll to the target
        setTimeout(() => {
          const newTargetIndex = expandedRange.findIndex(d => 
            d.date.toISOString().split('T')[0] === targetDateStr
          );
          
          if (newTargetIndex >= 0 && scrollContainerRef.current) {
            console.log(`🎯 [TaskJump] Found task in expanded range at index: ${newTargetIndex}`);
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
                targetScroll = scrollLeft - (container.clientWidth * 2 / 3); // Position at right side (2/3 from left)
              } else {
                targetScroll = scrollLeft - (container.clientWidth / 3); // Default: 1/3 from left
              }
              
              console.log(`🎯 [TaskJump] Scrolling to expanded position: scrollLeft=${scrollLeft.toFixed(2)}, targetScroll=${targetScroll.toFixed(2)}`);
              
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
                  console.log(`🎯 [TaskJump] Saving position after task jump`);
                  saveCurrentScrollPosition();
                }, 200);
              }, 500);
            } else {
              console.error(`❌ [TaskJump] Timeline container not found in sticky header after expansion`);
            }
          } else {
            console.error(`❌ [TaskJump] Task not found in expanded range: ${targetDateStr}`);
          }
        }, 200); // Increased delay for DOM update
      }
    }
  }, [dateRange, generateDateRange, saveCurrentScrollPosition]);
  
  // Enhanced scroll functions with smooth scrolling and dynamic loading
  const scrollEarlier = useCallback(() => {
    if (!scrollContainerRef.current) return;
    
    // Set flag FIRST to prevent any manual scroll handler interference
    setIsProgrammaticScroll(true);
    
    const currentScroll = scrollContainerRef.current.scrollLeft;
    const columnWidth = getColumnWidth();
    const scrollAmount = columnWidth * 15; // Scroll by ~15 days worth
    const newScroll = Math.max(0, currentScroll - scrollAmount);
    
    // If we're scrolling near the beginning, trigger load earlier
    const threshold = columnWidth * 10; // Within 10 days of start
    if (newScroll < threshold && dateRange.length > 0) {
      loadEarlier();
    }
    
    // Smooth scroll to new position
    scrollContainerRef.current.scrollTo({
      left: newScroll,
      behavior: 'smooth'
    });
    
    // Save position after navigation using unified function
    setTimeout(() => {
      saveCurrentScrollPosition();
      setIsProgrammaticScroll(false); // Reset flag after scroll completes
    }, 300); // Wait for smooth scroll to complete
  }, [loadEarlier, dateRange.length, saveCurrentScrollPosition, getColumnWidth]);
  
  const scrollLater = useCallback(() => {
    if (!scrollContainerRef.current) return;
    
    // Set flag FIRST to prevent any manual scroll handler interference
    setIsProgrammaticScroll(true);
    
    const currentScroll = scrollContainerRef.current.scrollLeft;
    const maxScroll = scrollContainerRef.current.scrollWidth - scrollContainerRef.current.clientWidth;
    const columnWidth = getColumnWidth();
    const scrollAmount = columnWidth * 15; // Scroll by ~15 days worth
    const newScroll = Math.min(maxScroll, currentScroll + scrollAmount);
    
    // If we're scrolling near the end, trigger load later
    const threshold = columnWidth * 10; // Within 10 days of end
    if (newScroll > maxScroll - threshold && dateRange.length > 0) {
      loadLater();
    }
    
    // Smooth scroll to new position
    scrollContainerRef.current.scrollTo({
      left: newScroll,
      behavior: 'smooth'
    });
    
    // Save position after navigation using unified function
    setTimeout(() => {
      saveCurrentScrollPosition();
      setIsProgrammaticScroll(false); // Reset flag after scroll completes
    }, 300); // Wait for smooth scroll to complete
  }, [loadLater, dateRange.length, saveCurrentScrollPosition, getColumnWidth]);


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

  // Limit visible tasks during drag operations to prevent DOM thrashing
  const visibleTasks = useMemo(() => {
    // During drag operations, limit to max 20 tasks to prevent performance issues
    if (activeDragItem && ganttTasks.length > 20) {
      // Find the dragged task and show a window around it
      const draggedTaskIndex = ganttTasks.findIndex(t => t.id === activeDragItem.taskId);
      if (draggedTaskIndex >= 0) {
        const start = Math.max(0, draggedTaskIndex - 10);
        const end = Math.min(ganttTasks.length, draggedTaskIndex + 10);
        return ganttTasks.slice(start, end);
      }
      return ganttTasks.slice(0, 20);
    }
    return ganttTasks;
  }, [ganttTasks, activeDragItem]);

  // Get actual DOM positions of task bars for dependency arrows
  const calculateTaskPositions = useCallback(() => {
    const positions = new Map<string, {x: number, y: number, width: number, height: number}>();
    
    if (!visibleTasks || visibleTasks.length === 0) {
      return positions;
    }
    
    // Get the timeline container for coordinate reference
    const timelineContainer = scrollContainerRef.current;
    if (!timelineContainer) return positions;
    
    const containerRect = timelineContainer.getBoundingClientRect();
    
    visibleTasks.forEach((task) => {
      // Find the actual task bar element
      const taskRowElement = timelineContainer.querySelector(`[data-task-id="${task.id}"]`);
      if (!taskRowElement) return;
      
      // Find the colored task bar within the row
      const taskBarElement = taskRowElement.querySelector('.h-6.rounded');
      if (!taskBarElement) return;
      
      const taskBarRect = taskBarElement.getBoundingClientRect();
      
      // Calculate position relative to the timeline container
      const x = taskBarRect.left - containerRect.left + timelineContainer.scrollLeft;
      const y = taskBarRect.top - containerRect.top;
      const width = taskBarRect.width;
      const height = taskBarRect.height;
      
      positions.set(task.id, { x, y, width, height });
    });
    
    return positions;
  }, [visibleTasks, scrollContainerRef]);

  // Mathematical collision detection for precise drop positioning
  const calculatePreciseDropPosition = useCallback((event: DragEndEvent | DragOverEvent) => {
    if (!event.over?.data?.current?.isDensityCell) return null;
    
    // Only apply to task movement/creation, NOT to handle resizing
    const dragType = event.active.data.current?.dragType;
    if (dragType === DRAG_TYPES.TASK_START_HANDLE || dragType === DRAG_TYPES.TASK_END_HANDLE) {
      return null; // Let handle logic handle precise positioning
    }
    
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
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const dragData = event.active.data.current as GanttDragItem;
    setActiveDragItem(dragData);
    setCurrentHoverDate(null);
    
    // Immediately disable polling for smooth drag experience (like Kanban view)
    if (onTaskDragStart && dragData?.taskId) {
      // Fast lookup for the original task to disable polling immediately
        const taskForParent = Object.values(columns)
          .flatMap(col => col.tasks)
        .find(t => t.id === dragData.taskId);
        
        if (taskForParent) {
          onTaskDragStart(taskForParent);
      }
    }
  }, [onTaskDragStart, columns]);

  // Throttle drag over updates for better performance
  const throttledSetHoverDate = useCallback((date: string) => {
    requestAnimationFrame(() => {
      setCurrentHoverDate(date);
    });
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (over && activeDragItem) {
      const dropData = over.data.current as { date: string; dateIndex: number; isDensityCell?: boolean };
      
      // For visual feedback during drag, prioritize direct dropData for responsiveness
      let targetDate = dropData.date;
      
      // Only use precise calculation for final positioning (not for visual feedback)
      // This ensures smooth cursor following during drag
      const dragType = activeDragItem.dragType;
      if (dragType === DRAG_TYPES.TASK_MOVE_HANDLE) {
        // For task movement, use dropData.date directly for better visual feedback
        targetDate = dropData.date;
      }
      
      // Only update if the date has actually changed to avoid unnecessary re-renders
      if (currentHoverDate !== targetDate) {
        // Use requestAnimationFrame for smoother updates
        requestAnimationFrame(() => {
          throttledSetHoverDate(targetDate);
        });
      }
    }
  }, [activeDragItem, currentHoverDate, throttledSetHoverDate]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { over } = event;
    
    // Don't clear hover state immediately - keep visual feedback until update completes
    // setCurrentHoverDate(null); // Moved to after update
    
    if (!over || !activeDragItem) {
      setActiveDragItem(null);
      setCurrentHoverDate(null); // Clear hover state when no valid drag
      
      // Still call drag end handler to clear state
      if (onTaskDragEnd) {
        onTaskDragEnd();
      }
      
      return;
    }

    // Use mathematical collision detection for density cells, otherwise use direct drop data
    const precisePosition = calculatePreciseDropPosition(event);
    const dropData = over.data.current as { date: string; dateIndex: number; isDensityCell?: boolean };
    const targetDate = precisePosition?.date || dropData.date;
    
    // Note: onTaskDragStart already called in handleDragStart, no need to call again here

    try {
      // Find the original task
      const originalTask = Object.values(columns)
        .flatMap(column => column.tasks)
        .find(t => t.id === activeDragItem.taskId);

      if (!originalTask) {
        return;
      }

      // Calculate the updated task efficiently
      const updatedTask = { ...originalTask };

      if (activeDragItem.dragType === DRAG_TYPES.TASK_START_HANDLE) {
        const currentEndDate = originalTask.dueDate;
        updatedTask.startDate = (currentEndDate && targetDate > currentEndDate) ? currentEndDate : targetDate;
      } else if (activeDragItem.dragType === DRAG_TYPES.TASK_END_HANDLE) {
        const currentStartDate = originalTask.startDate;
        updatedTask.dueDate = (currentStartDate && targetDate < currentStartDate) ? currentStartDate : targetDate;
      } else if (activeDragItem.dragType === DRAG_TYPES.TASK_MOVE_HANDLE) {
        const originalStart = new Date(activeDragItem.originalStartDate);
        const originalEnd = new Date(activeDragItem.originalEndDate);
        const taskDuration = originalEnd.getTime() - originalStart.getTime();
        const newStartDate = new Date(targetDate);
        const newEndDate = new Date(newStartDate.getTime() + taskDuration);
        
        updatedTask.startDate = targetDate;
        updatedTask.dueDate = newEndDate.toISOString().split('T')[0];
      }

      // Use optimistic update (non-blocking) to prevent message handler violations
      if (onUpdateTask) {
        // Schedule the update for the next tick to avoid blocking the drag completion
        setTimeout(() => {
          try {
            onUpdateTask(updatedTask);
            
            // Clear drag state AFTER the update to prevent flash of original content
            setTimeout(() => {
              if (onTaskDragEnd) {
                onTaskDragEnd();
              }
              setActiveDragItem(null);
              setCurrentHoverDate(null);
            }, 16); // One frame delay to ensure update is processed

    } catch (error) {
            console.error('Failed to update task:', error);
            // Clear drag state even if update fails
      if (onTaskDragEnd) {
        onTaskDragEnd();
            }
            setActiveDragItem(null);
            setCurrentHoverDate(null);
          }
        }, 0);
      } else {
        // No update function, clear drag state immediately
        if (onTaskDragEnd) {
          onTaskDragEnd();
        }
        setActiveDragItem(null);
        setCurrentHoverDate(null);
      }

    } catch (error) {
      console.error('Failed to update task:', error);
      // Clear drag state on error
      if (onTaskDragEnd) {
        onTaskDragEnd();
      }
      setActiveDragItem(null);
      setCurrentHoverDate(null);
    }
  }, [activeDragItem, columns, onTaskDragStart, onTaskDragEnd, onUpdateTask]);

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
        
        // Refresh data to get updated state
        if (onRefreshData) {
          await onRefreshData();
        }
        
        // Open the task in detail view for editing
        onSelectTask(createdTask);
        
      } catch (error) {
        console.error('Failed to create task:', error);
      }
    } else if (onAddTask) {
      // Fallback to basic task creation
      await onAddTask(firstColumn.id);
    }
  }, [columns, currentUser, members, boardId, onRefreshData, onSelectTask, onAddTask]);

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

    console.log(`🎯 [TaskJump] Starting jump to task: ${task.ticket} (${task.title})`);

    // Use async wrapper to handle the promise
    (async () => {
    try {
      // First, scroll horizontally to the task
      console.log(`🎯 [TaskJump] Step 1: Scrolling horizontally to task date`);
      await scrollToTask(task.startDate!, task.endDate!);
      
      // Wait for horizontal scroll to complete before highlighting
      setTimeout(() => {
        console.log(`🎯 [TaskJump] Step 2: Highlighting task`);
        // Highlight the task for 1 second
        setHighlightedTaskId(task.id);
        setTimeout(() => {
          setHighlightedTaskId(null);
          console.log(`🎯 [TaskJump] Step 3: Task highlight completed`);
        }, 1000);
      }, 400); // Wait for horizontal scroll to complete
      
      // Scroll vertically to task if not visible (after horizontal scroll completes)
      setTimeout(() => {
        console.log(`🎯 [TaskJump] Step 4: Checking vertical scroll needs`);
        const taskElement = document.querySelector(`[data-task-id="${task.id}"]`);
        
        if (taskElement) {
          const taskRect = taskElement.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          
          // Check if task is outside the visible viewport (with buffer)
          const buffer = 100;
          const isAboveViewport = taskRect.top < buffer;
          const isBelowViewport = taskRect.bottom > viewportHeight - buffer;
          
          console.log(`🎯 [TaskJump] Task position: top=${taskRect.top.toFixed(2)}, bottom=${taskRect.bottom.toFixed(2)}, viewportHeight=${viewportHeight}, isAbove=${isAboveViewport}, isBelow=${isBelowViewport}`);
          
          if (isAboveViewport || isBelowViewport) {
            console.log(`🎯 [TaskJump] Step 5: Scrolling vertically to task`);
            
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
              console.log(`🎯 [TaskJump] Scrolling window to Y: ${targetY.toFixed(2)}`);
              window.scrollTo({
                top: Math.max(0, targetY),
                behavior: 'smooth'
              });
            } else {
              // Scroll within the parent container
              const containerRect = scrollableParent.getBoundingClientRect();
              const relativeTop = taskRect.top - containerRect.top;
              const targetScrollTop = scrollableParent.scrollTop + relativeTop - (containerRect.height / 2) + (taskRect.height / 2);
              
              console.log(`🎯 [TaskJump] Scrolling container to Y: ${targetScrollTop.toFixed(2)}`);
              scrollableParent.scrollTo({
                top: Math.max(0, targetScrollTop),
                behavior: 'smooth'
              });
            }
          } else {
            console.log(`🎯 [TaskJump] Task is already visible vertically, no vertical scroll needed`);
          }
        } else {
          console.warn(`🎯 [TaskJump] Task element not found: [data-task-id="${task.id}"]`);
        }
      }, 600); // Wait longer for horizontal scroll to complete
      
      console.log(`🎯 [TaskJump] Jump to task completed: ${task.ticket}`);
    } catch (error) {
      console.error('❌ [TaskJump] Failed to jump to task:', error);
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

  // Show loading state while dateRange is initializing or during board transitions
  if (dateRange.length === 0 || isBoardTransitioning) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-900">Gantt Chart</h2>
          <p className="text-sm text-gray-600 mt-1">
            {isBoardTransitioning ? 'Switching board...' : 'Loading timeline...'}
          </p>
        </div>
        <div className="p-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">
            {isBoardTransitioning ? 'Loading board data...' : 'Initializing Gantt view...'}
          </p>
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
        {/* Sticky Header - Sticks under page header when scrolling */}
        <div className="sticky top-16 z-50 bg-white">
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
            isLoading={isLoading}
            onJumpToTask={handleJumpToTask}
          />
        </div>

        {/* Second Sticky Layer - Task Column Header + Timeline Headers */}
        <div className="sticky top-[148px] z-40 bg-white border-b border-gray-200 flex">
          {/* Task Column Header */}
          <div
            className="bg-gray-50 border-r border-gray-200 flex items-center justify-between px-3 font-medium text-gray-700"
            style={{ width: `${taskColumnWidth}px`, height: '56px' }}
          >
            <span>Task</span>
            <div
              className="w-1 h-6 bg-gray-300 hover:bg-gray-400 cursor-col-resize transition-colors"
              onMouseDown={handleResizeStart}
              title="Drag to resize task column"
            />
          </div>
          
          {/* Scrollable Date Headers */}
          <div className="flex-1 overflow-x-auto" data-sticky-header="true">
            <div
              className="min-w-[800px]"
              style={{ width: `${Math.max(800, dateRange.length * 40 + 200)}px` }}
            >
              {/* Month/Year Row */}
              <div 
                className="grid border-b border-gray-100 bg-gray-50 gantt-timeline-container h-6"
                style={{ 
                  gridTemplateColumns: `repeat(${dateRange.length}, 1fr)`,
                  minWidth: '800px'
                }}
              >
                {dateRange.map((dateCol, index) => (
                  <div
                    key={`sticky-month-${index}`}
                    className="text-xs font-medium text-gray-600 flex items-center justify-center border-r border-gray-100"
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
                className="grid border-b border-gray-200 bg-gray-50 gantt-timeline-container h-8"
                style={{ 
                  gridTemplateColumns: `repeat(${dateRange.length}, 1fr)`,
                  minWidth: '800px'
                }}
              >
                {dateRange.map((dateCol, index) => (
                  <div
                    key={`sticky-day-${index}`}
                    className={`text-xs text-center border-r border-gray-100 flex items-center justify-center ${
                      dateCol.isToday ? 'bg-blue-100 text-blue-800 font-semibold' :
                      dateCol.isWeekend ? 'bg-gray-100 text-gray-600' : 'text-gray-700'
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
          className="sticky left-0 z-10 bg-white border-r border-gray-200"
          style={{ width: `${taskColumnWidth}px` }}
        >
          
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
          style={{
            willChange: activeDragItem ? 'scroll-position' : 'auto',
            contain: 'layout style' // Performance optimization for contained rendering
          }}
          onScroll={(e) => {
            const scrollLeft = e.currentTarget.scrollLeft;
            // Sync the sticky header timeline
            const stickyHeader = document.querySelector('[data-sticky-header="true"]') as HTMLElement;
            if (stickyHeader) {
              stickyHeader.scrollLeft = scrollLeft;
            }
            // Also sync any other timeline containers
            const timelineContainers = document.querySelectorAll('.gantt-timeline-container');
            timelineContainers.forEach(container => {
              if (container instanceof HTMLElement) {
                container.scrollLeft = scrollLeft;
              }
            });
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
                  style={{ 
                    gridTemplateColumns: `repeat(${dateRange.length}, 1fr)`,
                    minWidth: '800px', // Match header minWidth to ensure column alignment
                    willChange: activeDragItem ? 'transform' : 'auto' // Performance hint during drag
                  }}
                >
                {/* Background Date Columns - optimized droppable density */}
                {dateRange.map((dateCol, relativeIndex) => {
                  const dateIndex = relativeIndex;
                  const dateString = dateCol.date.toISOString().split('T')[0];
                  const dropId = `date-${dateIndex}`;
                  
                  // Smart density: every 3rd date for large ranges, every date for small ranges
                  // BUT: always full precision for handle dragging AND task movement (for smooth visual feedback)
                  const useDensity = dateRange.length > 90;
                  const isHandleDrag = activeDragItem?.dragType === DRAG_TYPES.TASK_START_HANDLE || 
                                     activeDragItem?.dragType === DRAG_TYPES.TASK_END_HANDLE;
                  const isTaskMovement = activeDragItem?.dragType === DRAG_TYPES.TASK_MOVE_HANDLE;
                  const isDensityDate = !useDensity || isHandleDrag || isTaskMovement || relativeIndex % 3 === 0;
                  
                  // Inline droppable component (only for density dates)
                  const DroppableDateCell = () => {
                    const { setNodeRef } = useDroppable({
                      id: dropId,
                      data: {
                        date: dateString,
                        dateIndex,
                        isDensityCell: isDensityDate && !isHandleDrag && !isTaskMovement
                      },
                      disabled: !activeDragItem || !isDensityDate // Enhanced performance control
                    });

                    return (
                      <div
                        ref={setNodeRef}
                        className={`h-16 border-r border-gray-100 transition-colors ${
                          dateCol.isToday ? 'bg-blue-50' : 
                          dateCol.isWeekend ? 'bg-gray-50' : ''
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
                        willChange: isDragging ? 'opacity, transform' : 'auto', // Performance hint for drag operations
                        alignSelf: 'center',
                        zIndex: isDragging ? 25 : 10,
                        ...getPriorityColor(task.priority)
                      }}
                      title={`${task.title}\nStart: ${task.startDate?.toLocaleDateString()}\nEnd: ${task.endDate?.toLocaleDateString()}`}
                    >
                        {/* Move handle - positioned with gap (disabled in relationship mode) */}
                        {!isRelationshipMode && (() => {
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
                          /* 1-day task: Minimal layout - only relationship button if needed */
                          <div className="flex-1 min-w-0 flex items-center justify-center">
                            {/* Link icon for relationship mode - positioned on left */}
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
                            {/* 1-day tasks: No title - too small to read anyway */}
                          </div>
                        ) : (
                          /* Multi-day task (2+ days): Always show title regardless of view mode */
                          <div className="flex items-center flex-1 min-w-0">
                            {/* Link icon for relationship mode - positioned on left */}
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
                          <div 
                            className="text-xs truncate px-2 flex-1"
                            style={{ color: getPriorityColor(task.priority).color }}
                          >
                            {task.title}
                            </div>
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
          
          {/* Task Dependency Arrows Overlay - Inside scroll container */}
          <TaskDependencyArrows
            key={`arrows-${Object.keys(columns).join('-')}-${ganttTasks.length}`}
            ganttTasks={ganttTasks}
            taskPositions={calculateTaskPositions()}
            isRelationshipMode={isRelationshipMode}
            relationships={relationships}
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
  );
};

export default GanttView;
