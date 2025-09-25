import React, { useState, useRef, useCallback, useMemo, useEffect, startTransition } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverEvent, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { Task, Columns } from '../types';
import GanttTaskList from './gantt/GanttTaskList';
import GanttTimeline from './gantt/GanttTimeline';
import { createPortal } from 'react-dom';
import TaskDependencyArrows from './gantt/TaskDependencyArrows';
import { DRAG_TYPES, GanttDragItem, SortableTaskRowItem } from './gantt/types';
import { GanttHeader } from './gantt/GanttHeader';
import { getAllPriorities, addTaskRelationship, removeTaskRelationship, getUserSettings } from '../api';
import websocketClient from '../services/websocketClient';
import { loadUserPreferencesAsync, saveUserPreferences, loadUserPreferences } from '../utils/userPreferences';
import { useGanttScrollPosition } from '../hooks/useGanttScrollPosition';

interface GanttViewV2Props {
  columns: Columns;
  onSelectTask: (task: Task) => void;
  taskViewMode?: 'expand' | 'compact' | 'shrink';
  onUpdateTask?: (task: Task) => void;
  onTaskDragStart?: (task: Task) => void;
  onTaskDragEnd?: () => void;
  onClearDragState?: () => void;
  boardId?: string | null;
  onAddTask?: (columnId: string, startDate?: string, dueDate?: string) => Promise<void>;
  currentUser?: any;
  members?: any[];
  onRefreshData?: () => Promise<void>;
  relationships?: any[];
  onCopyTask?: (task: Task) => Promise<void>;
  onRemoveTask?: (taskId: string, event?: React.MouseEvent) => Promise<void>;
  siteSettings?: { [key: string]: string };
}

// Parse date helper
const parseLocalDate = (dateInput: string | Date): Date => {
  if (!dateInput) return new Date();
  
  // If it's already a Date object, return it
  if (dateInput instanceof Date) {
    return dateInput;
  }
  
  // If it's a string, parse it
  if (typeof dateInput === 'string') {
    const dateOnly = dateInput.split('T')[0];
    const [year, month, day] = dateOnly.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  
  // Fallback
  return new Date();
};

// Format date helper for local dates
const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const GanttViewV2 = ({
  columns,
  onSelectTask,
  taskViewMode = 'expand',
  onUpdateTask,
  onTaskDragStart,
  onTaskDragEnd,
  onClearDragState,
  boardId,
  onAddTask,
  currentUser,
  members,
  onRefreshData,
  relationships = [],
  onCopyTask,
  onRemoveTask,
  siteSettings
}: GanttViewV2Props) => {
  // State
  const [priorities, setPriorities] = useState<any[]>([]);
  const [activeDragItem, setActiveDragItem] = useState<any>(null);
  const activeDragItemRef = useRef<any>(null);
  const [currentHoverDate, setCurrentHoverDate] = useState<string | null>(null);
  const [taskColumnWidth, setTaskColumnWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [isMultiSelectMode, setIsMultiSelectModeState] = useState(false);
  
  // Custom setter that also updates the immediate ref
  const setIsMultiSelectMode = useCallback((value: boolean) => {
    setIsMultiSelectModeState(value);
    isMultiSelectModeImmediateRef.current = value;
  }, []);
  
  const [isRelationshipMode, setIsRelationshipMode] = useState(false);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [selectedParentTask, setSelectedParentTask] = useState<string | null>(null);
  
  // Local relationships state for optimistic updates
  const [localRelationships, setLocalRelationships] = useState<any[]>([]);
  const lastRelationshipClickRef = useRef<number>(0);
  
  // Sync relationships from props, but preserve optimistic updates
  useEffect(() => {
    if (relationships) {
      // If we have relationships from props and no local relationships yet, use them
      if (localRelationships.length === 0) {
        setLocalRelationships(relationships);
      } else {
        // Merge: keep optimistic updates (temp IDs) and add new server relationships
        const tempRelationships = localRelationships.filter(rel => 
          typeof rel.id === 'string' && rel.id.startsWith('temp-')
        );
        const mergedRelationships = [...relationships, ...tempRelationships];
        setLocalRelationships(mergedRelationships);
      }
    }
  }, [relationships]);
  
  // Ref to store current columns for keyboard navigation
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  
  // Refs to store current state for keyboard navigation
  const isMultiSelectModeRef = useRef(isMultiSelectMode);
  isMultiSelectModeRef.current = isMultiSelectMode;
  
  const selectedTasksRef = useRef(selectedTasks);
  selectedTasksRef.current = selectedTasks;
  
  // Debouncing for arrow key navigation
  const arrowKeyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isArrowKeyPressedRef = useRef(false);
  
  // Flag to prevent task selection immediately after exiting multi-select mode
  const isExitingMultiSelectRef = useRef(false);
  
  // Flag to track if we're in multi-select mode (immediate, not dependent on state)
  const isMultiSelectModeImmediateRef = useRef(false);
  const [localDragState, setLocalDragState] = useState<any>({
    isDragging: false,
    draggedTaskId: null,
    localTaskData: {},
    originalTaskData: {}
  });
  const localDragStateRef = useRef(localDragState);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [taskCreationStart, setTaskCreationStart] = useState<any>(null);
  
  // Task jump dropdown state
  const [showTaskJumpDropdown, setShowTaskJumpDropdown] = useState(false);
  const taskJumpRef = useRef<HTMLDivElement>(null);
  
  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const dropdown = document.querySelector('.task-jump-dropdown');
      if (taskJumpRef.current && !taskJumpRef.current.contains(target) && 
          dropdown && !dropdown.contains(target)) {
        setShowTaskJumpDropdown(false);
      }
    };
    
    if (showTaskJumpDropdown) {
      // Use setTimeout to avoid closing immediately on the same click that opened it
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showTaskJumpDropdown]);
  const [taskCreationEnd, setTaskCreationEnd] = useState<any>(null);
  const [taskPositions, setTaskPositions] = useState<Map<string, {x: number, y: number, width: number, height: number}>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);

  // Date range (simplified for now)
  const [dateRange, setDateRange] = useState<any[]>([]);
  
  // Board loading state for scroll position restoration
  const [isBoardLoading, setIsBoardLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isSwitchingBoards, setIsSwitchingBoards] = useState(false);
  
  
  // Scroll position persistence hook
  const {
    isLoading: isScrollLoading,
    saveCurrentScrollPosition,
    getSavedScrollPosition,
    calculateCenterDate,
    calculateScrollPosition
  } = useGanttScrollPosition({ boardId: boardId || null, currentUser });
  
  // Constants for date range management
  const MAX_DAYS_IN_VIEW = 365; // Maximum days to keep in memory
  const BUFFER_DAYS = 60; // Days to add when extending
  const VIEWPORT_DAYS = 180; // Days to show around target when jumping
  
  // Helper function to generate date range
  const generateDateRange = useCallback((startDate: Date, endDate: Date) => {
    const range = [];
    const current = new Date(startDate);
    const today = new Date();
    
    while (current <= endDate) {
      range.push({
        date: new Date(current),
        isToday: current.toDateString() === today.toDateString(),
        isWeekend: current.getDay() === 0 || current.getDay() === 6
      });
      current.setDate(current.getDate() + 1);
    }
    
    return range;
  }, []);
  
  // Navigate to a specific date with sliding window
  const navigateToDate = useCallback((targetDate: Date, position: 'start' | 'center' | 'end' = 'center') => {
    if (!scrollContainerRef.current) {
      return;
    }
    
    // Calculate new date range centered around target
    const newStart = new Date(targetDate);
    const newEnd = new Date(targetDate);
    
    if (position === 'start') {
      newStart.setDate(newStart.getDate() - 30);
      newEnd.setDate(newEnd.getDate() + VIEWPORT_DAYS - 30);
    } else if (position === 'end') {
      newStart.setDate(newStart.getDate() - VIEWPORT_DAYS + 30);
      newEnd.setDate(newEnd.getDate() + 30);
    } else {
      // Center
      newStart.setDate(newStart.getDate() - VIEWPORT_DAYS / 2);
      newEnd.setDate(newEnd.getDate() + VIEWPORT_DAYS / 2);
    }
    
    // Generate new range
    const newRange = generateDateRange(newStart, newEnd);
    setDateRange(newRange);
    
    // Calculate scroll position after state update
    setTimeout(() => {
      const targetIndex = newRange.findIndex(d => 
        d.date.toISOString().split('T')[0] === targetDate.toISOString().split('T')[0]
      );
      
      if (targetIndex >= 0 && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        let scrollPosition;
        
        if (position === 'start') {
          scrollPosition = targetIndex * 40;
        } else if (position === 'end') {
          scrollPosition = (targetIndex * 40) - container.clientWidth + 40;
        } else {
          scrollPosition = (targetIndex * 40) - (container.clientWidth / 2) + 20;
        }
        
        container.scrollLeft = Math.max(0, scrollPosition);
        
        // Save scroll position after navigation
        saveCurrentScrollPosition(container, newRange, { immediate: true });
      }
    }, 50);
  }, [generateDateRange, saveCurrentScrollPosition]);
  
  // Handle task jump from dropdown with highlighting and scrolling
  const handleJumpToTask = useCallback((task: any) => {
    if (!task.startDate || !task.endDate) {
      return;
    }

    // Use async wrapper to handle the promise
    (async () => {
      try {
        // First, scroll horizontally to the task
        navigateToDate(task.startDate, 'center');
        
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
            }
          }
        }, 500); // Wait a bit longer for horizontal scroll to complete
      } catch (error) {
        console.error('Error jumping to task:', error);
      }
    })();
  }, [navigateToDate]);
  
  // Combined keyboard handler for ESC/Enter and arrow key navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Handle ESC key to exit relationship mode and multi-select mode
      if (event.key === 'Escape') {
        event.preventDefault();
        if (isRelationshipMode) {
          setIsRelationshipMode(false);
          setSelectedParentTask(null);
        }
        if (isMultiSelectMode) {
          // Immediately set flags to prevent task selection
          isExitingMultiSelectRef.current = true;
          isMultiSelectModeImmediateRef.current = false; // Immediately disable multi-select mode
          
          // Reset all states (custom setter will update immediate ref)
          setIsMultiSelectMode(false);
          setSelectedTasks([]);
          setHighlightedTaskId(null); // Clear any highlighted tasks
          // Clear any active drag state to prevent frozen tasks
          setActiveDragItem(null);
          activeDragItemRef.current = null;
          // Clear local drag state to prevent stale data from arrow key movement
          setLocalDragState({
            isDragging: false,
            draggedTaskId: null,
            localTaskData: {},
            originalTaskData: {}
          });
          // Reset arrow key state to prevent frozen tasks
          isArrowKeyPressedRef.current = false;
          if (arrowKeyTimeoutRef.current) {
            clearTimeout(arrowKeyTimeoutRef.current);
            arrowKeyTimeoutRef.current = null;
          }
          
          // Clear any stuck drag state without triggering cooldown
          if (onClearDragState) {
            onClearDragState();
          }
          
          // Clear the exit flag after a short delay
          setTimeout(() => {
            isExitingMultiSelectRef.current = false;
          }, 100);
        }
        return;
      }
      
      // Handle Enter key to exit relationship mode and multi-select mode
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation(); // Prevent other Enter key handlers from firing
        
        // Use a single state update to ensure all changes happen atomically
        if (isRelationshipMode || isMultiSelectMode) {
          
          // Immediately set flags to prevent task selection
          isExitingMultiSelectRef.current = true;
          isMultiSelectModeImmediateRef.current = false; // Immediately disable multi-select mode
          
          // Reset all states in one go (custom setter will update immediate ref)
          setIsRelationshipMode(false);
          setSelectedParentTask(null);
          setIsMultiSelectMode(false);
          setSelectedTasks([]);
          setHighlightedTaskId(null);
          
          // Clear any active drag state
          setActiveDragItem(null);
          activeDragItemRef.current = null;
          
          // Clear local drag state
          setLocalDragState({
            isDragging: false,
            draggedTaskId: null,
            localTaskData: {},
            originalTaskData: {}
          });
          
          // Reset arrow key state
          isArrowKeyPressedRef.current = false;
          if (arrowKeyTimeoutRef.current) {
            clearTimeout(arrowKeyTimeoutRef.current);
            arrowKeyTimeoutRef.current = null;
          }
          
          // Clear any stuck drag state without triggering cooldown
          if (onClearDragState) {
            onClearDragState();
          }
          
          // Clear the exit flag after a short delay to allow state updates to complete
          setTimeout(() => {
            isExitingMultiSelectRef.current = false;
          }, 100);
        }
        return;
      }
      
      // Handle arrow key navigation for selected tasks (only in multi-select mode)
      if (isMultiSelectModeRef.current && selectedTasksRef.current.length > 0) {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          
          // If arrow key is already being processed, ignore this event
          if (isArrowKeyPressedRef.current) {
            return;
          }
          
          // Set flag to prevent multiple rapid calls
          isArrowKeyPressedRef.current = true;
          
          const moveAmount = event.key === 'ArrowLeft' ? -1 : 1; // Move left or right by 1 day
          
          // Clear any existing timeout
          if (arrowKeyTimeoutRef.current) {
            clearTimeout(arrowKeyTimeoutRef.current);
          }
          
          // Move all selected tasks
          selectedTasksRef.current.forEach(async (taskId) => {
            // Find the original task from columns to get the full task data
            const originalTask = Object.values(columnsRef.current)
              .flatMap(col => col.tasks || [])
              .find(t => t.id === taskId);
              
            if (originalTask && originalTask.startDate && originalTask.dueDate && onUpdateTask) {
              const isOneDayTask = originalTask.startDate === originalTask.dueDate;
              
              const newStartDate = new Date(originalTask.startDate);
              const newDueDate = new Date(originalTask.dueDate);
              
              newStartDate.setDate(newStartDate.getDate() + moveAmount);
              newDueDate.setDate(newDueDate.getDate() + moveAmount);
              
              // Create updated task object with proper date format
              const updatedTask = {
                ...originalTask,
                startDate: formatLocalDate(newStartDate), // Format as YYYY-MM-DD
                dueDate: formatLocalDate(newDueDate) // Format as YYYY-MM-DD
              };
              
              
              // Update the task
              await onUpdateTask(updatedTask);
            } else {
            }
          });
          
          // Reset flag after a short delay to allow for single key presses
          arrowKeyTimeoutRef.current = setTimeout(() => {
            isArrowKeyPressedRef.current = false;
          }, 100); // 100ms debounce
        }
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
  }, [isRelationshipMode, isMultiSelectMode, selectedParentTask, selectedTasks, onUpdateTask]);
  
  // Initialize date range with a reasonable default (only if no boardId)
  useEffect(() => {
    if (boardId) {
      // Board initialization will handle date range setup
      return;
    }
    
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 60); // 60 days in past
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 120); // 120 days in future
    
    setDateRange(generateDateRange(startDate, endDate));
  }, [generateDateRange, boardId]);
  
  // Extend date range when scrolling near edges with sliding window
  useEffect(() => {
    const timeline = scrollContainerRef.current;
    if (!timeline) return;
    
    let isExtending = false;
    let scrollTimeout: NodeJS.Timeout;
    
    const handleScroll = () => {
      // Clear previous timeout
      clearTimeout(scrollTimeout);
      
      // Throttle the actual logic
      scrollTimeout = setTimeout(() => {
        if (isExtending || dateRange.length === 0) return;
        
        const scrollLeft = timeline.scrollLeft;
        const scrollWidth = timeline.scrollWidth;
        const clientWidth = timeline.clientWidth;
        
        // Check if near the end (within 500px)
        if (scrollLeft + clientWidth > scrollWidth - 500) {
          isExtending = true;
          
          requestAnimationFrame(() => {
            setDateRange(prev => {
              const lastDate = new Date(prev[prev.length - 1].date);
              const today = new Date();
              const newDates = [];
              
              // Add new dates
              for (let i = 1; i <= BUFFER_DAYS; i++) {
                const newDate = new Date(lastDate);
                newDate.setDate(newDate.getDate() + i);
                newDates.push({
                  date: newDate,
                  isToday: newDate.toDateString() === today.toDateString(),
                  isWeekend: newDate.getDay() === 0 || newDate.getDay() === 6
                });
              }
              
              // Apply sliding window - remove old dates if exceeding max
              let updatedRange = [...prev, ...newDates];
              if (updatedRange.length > MAX_DAYS_IN_VIEW) {
                const toRemove = updatedRange.length - MAX_DAYS_IN_VIEW;
                updatedRange = updatedRange.slice(toRemove);
                
                // Adjust scroll position
                requestAnimationFrame(() => {
                  if (timeline) {
                    timeline.scrollLeft = Math.max(0, scrollLeft - (toRemove * 40));
                  }
                });
              }
              
              isExtending = false;
              return updatedRange;
            });
          });
        }
        
        // Check if near the start (within 500px)
        if (scrollLeft < 500) {
          isExtending = true;
          const currentScrollLeft = scrollLeft;
          
          requestAnimationFrame(() => {
            setDateRange(prev => {
              const firstDate = new Date(prev[0].date);
              const today = new Date();
              const newDates = [];
              
              // Add new dates
              for (let i = BUFFER_DAYS; i >= 1; i--) {
                const newDate = new Date(firstDate);
                newDate.setDate(newDate.getDate() - i);
                newDates.push({
                  date: newDate,
                  isToday: newDate.toDateString() === today.toDateString(),
                  isWeekend: newDate.getDay() === 0 || newDate.getDay() === 6
                });
              }
              
              // Apply sliding window - remove old dates if exceeding max
              let updatedRange = [...newDates, ...prev];
              let removedFromEnd = 0;
              if (updatedRange.length > MAX_DAYS_IN_VIEW) {
                removedFromEnd = updatedRange.length - MAX_DAYS_IN_VIEW;
                updatedRange = updatedRange.slice(0, MAX_DAYS_IN_VIEW);
              }
              
              // Adjust scroll position to maintain view
              requestAnimationFrame(() => {
                if (timeline) {
                  timeline.scrollLeft = currentScrollLeft + (BUFFER_DAYS * 40);
                }
              });
              
              isExtending = false;
              return updatedRange;
            });
          });
        }
        
        // Save scroll position after any scroll event (debounced)
        if (!isBoardLoading && !isInitializing && !isSwitchingBoards) {
          saveCurrentScrollPosition(timeline, dateRange);
          // Update debug overlay after saving with a longer delay to ensure cookie is written
        } else {
        }
      }, 100); // 100ms throttle
    };
    
    timeline.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      timeline.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [dateRange.length, isBoardLoading, isInitializing, isSwitchingBoards, saveCurrentScrollPosition]);


  // Load priorities
  useEffect(() => {
    getAllPriorities()
      .then(priorities => {
        setPriorities(priorities);
      })
      .catch(error => {
        console.error('❌ Failed to load priorities:', error);
      });
  }, []);

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

  // Handle task column resizing
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
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
  }, [taskColumnWidth]);

  // WebSocket listeners for priority updates
  useEffect(() => {
    const handlePriorityUpdated = async (data: any) => {
      try {
        const priorities = await getAllPriorities();
        setPriorities(priorities);
      } catch (error) {
        console.error('Failed to refresh priorities after update:', error);
      }
    };

    const handlePriorityCreated = async (data: any) => {
      try {
        const priorities = await getAllPriorities();
        setPriorities(priorities);
      } catch (error) {
        console.error('Failed to refresh priorities after creation:', error);
      }
    };

    const handlePriorityDeleted = async (data: any) => {
      try {
        const priorities = await getAllPriorities();
        setPriorities(priorities);
      } catch (error) {
        console.error('Failed to refresh priorities after deletion:', error);
      }
    };

    const handlePriorityReordered = async (data: any) => {
      try {
        const priorities = await getAllPriorities();
        setPriorities(priorities);
      } catch (error) {
        console.error('Failed to refresh priorities after reorder:', error);
      }
    };

    // Register WebSocket event listeners
    websocketClient.onPriorityCreated(handlePriorityCreated);
    websocketClient.onPriorityUpdated(handlePriorityUpdated);
    websocketClient.onPriorityDeleted(handlePriorityDeleted);
    websocketClient.onPriorityReordered(handlePriorityReordered);

    // Cleanup function
    return () => {
      websocketClient.offPriorityCreated(handlePriorityCreated);
      websocketClient.offPriorityUpdated(handlePriorityUpdated);
      websocketClient.offPriorityDeleted(handlePriorityDeleted);
      websocketClient.offPriorityReordered(handlePriorityReordered);
    };
  }, []);

  // WebSocket listeners for task updates (to refresh task data when priorities change)
  useEffect(() => {
    const handleTaskUpdated = async (data: any) => {
      // Only debug for specific task
      if (data.task && data.task.id === '2b7f85ad-4a12-4c60-9664-6e8a2c0a8234') {
      }
      // Only refresh if the task is for the current board
      if (data.boardId === boardId && onRefreshData) {
        try {
          // Set flag to prevent polling from overriding this update
          if (window.setJustUpdatedFromWebSocket) {
            window.setJustUpdatedFromWebSocket(true);
            // Reset the flag after a short delay
            setTimeout(() => {
              if (window.setJustUpdatedFromWebSocket) {
                window.setJustUpdatedFromWebSocket(false);
              }
            }, 2000);
          }
          await onRefreshData();
        } catch (error) {
          console.error('Failed to refresh board data after task update:', error);
        }
      }
    };

    const handleTaskCreated = async (data: any) => {
      // Only refresh if the task is for the current board
      if (data.boardId === boardId && onRefreshData) {
        try {
          await onRefreshData();
        } catch (error) {
          console.error('Failed to refresh board data after task creation:', error);
        }
      }
    };

    const handleTaskDeleted = async (data: any) => {
      // Only refresh if the task is for the current board
      if (data.boardId === boardId && onRefreshData) {
        try {
          await onRefreshData();
          console.log('📨 GanttViewV2: Board data refreshed after task deletion');
        } catch (error) {
          console.error('Failed to refresh board data after task deletion:', error);
        }
      }
    };

    // Register WebSocket event listeners
    websocketClient.onTaskUpdated(handleTaskUpdated);
    websocketClient.onTaskCreated(handleTaskCreated);
    websocketClient.onTaskDeleted(handleTaskDeleted);

    // Cleanup function
    return () => {
      websocketClient.offTaskUpdated(handleTaskUpdated);
      websocketClient.offTaskCreated(handleTaskCreated);
      websocketClient.offTaskDeleted(handleTaskDeleted);
    };
  }, [boardId, onRefreshData]);

  // Update local drag state ref
  useEffect(() => {
    localDragStateRef.current = localDragState;
  }, [localDragState]);

  // Sync scroll between header and timeline
  useEffect(() => {
    const timeline = scrollContainerRef.current;
    const header = headerScrollRef.current;
    
    if (!timeline || !header) return;
    
    let rafId: number;
    const syncHeaderScroll = () => {
      // Cancel any pending animation frame
      if (rafId) cancelAnimationFrame(rafId);
      
      rafId = requestAnimationFrame(() => {
        const scrollLeft = timeline.scrollLeft;
        const headerContent = header.querySelector('.absolute') as HTMLElement;
        if (headerContent) {
          headerContent.style.transform = `translate3d(-${scrollLeft}px, 0, 0)`;
        }
      });
    };
    
    timeline.addEventListener('scroll', syncHeaderScroll, { passive: true });
    
    return () => {
      timeline.removeEventListener('scroll', syncHeaderScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // Set flags immediately when boardId changes
  useEffect(() => {
    if (boardId) {
      console.log(`🎯 BoardId changed to ${boardId}, setting flags to prevent scroll saves`);
      setIsSwitchingBoards(true);
      setIsInitializing(true);
    }
  }, [boardId]);

  // Board initialization with scroll position restoration
  useEffect(() => {
    const initializeBoard = async () => {
      console.log(`🎯 Board initialization effect triggered - boardId: ${boardId}`);
      
      if (!boardId) {
        console.log(`🎯 No boardId, setting loading to false`);
        setIsBoardLoading(false);
        return;
      }

      console.log(`🎯 Initializing board: ${boardId}`);
      setIsBoardLoading(true);
      setIsInitializing(true);
      console.log(`🎯 Set isInitializing to true for board: ${boardId}`);

      // Add a delay to ensure previous board's scroll position is saved
      await new Promise(resolve => setTimeout(resolve, 200));

      try {
        // Get saved scroll position for this board
        const savedPositionDate = await getSavedScrollPosition();
        
        // Calculate center date (saved position or today)
        const centerDate = calculateCenterDate(savedPositionDate);
        
        // Generate date range around center date
        const startDate = new Date(centerDate);
        startDate.setDate(startDate.getDate() - 90);
        
        const endDate = new Date(centerDate);
        endDate.setDate(endDate.getDate() + 90);
        
        const initialRange = generateDateRange(startDate, endDate);
        console.log(`🎯 Generated date range: ${initialRange.length} days from ${formatLocalDate(startDate)} to ${formatLocalDate(endDate)}`);
        setDateRange(initialRange);
        
        // If we have a saved position, position the viewport
        if (savedPositionDate) {
          const targetDate = new Date(savedPositionDate);
          
          // Wait for DOM to be ready, then set scroll position
          setTimeout(() => {
            if (scrollContainerRef.current) {
              const scrollPosition = calculateScrollPosition(
                targetDate, 
                initialRange
              );
              
              console.log(`🎯 Positioning board at saved date: ${savedPositionDate}, scroll: ${scrollPosition}`);
              scrollContainerRef.current.scrollLeft = scrollPosition;
              
              // Wait longer before allowing scroll saves to ensure positioning is complete
              setTimeout(() => {
                setIsInitializing(false);
                setIsSwitchingBoards(false);
                console.log(`🎯 Set flags to false for board: ${boardId} (after positioning)`);
              }, 500);
            }
          }, 100);
        } else {
          // No saved position, allow scroll saves immediately
          setIsInitializing(false);
          setIsSwitchingBoards(false);
          console.log(`🎯 Set flags to false for board: ${boardId} (no saved position)`);
        }
        
        console.log(`🎯 Board initialized: ${boardId}`);
      } catch (error) {
        console.error(`Failed to initialize board ${boardId}:`, error);
        setIsInitializing(false);
        setIsSwitchingBoards(false);
      } finally {
        console.log(`🎯 Setting isBoardLoading to false for board: ${boardId}`);
        setIsBoardLoading(false);
        // Don't reset isInitializing here - let the positioning logic handle it
      }
    };

    initializeBoard();
  }, [boardId, getSavedScrollPosition, calculateCenterDate, generateDateRange, calculateScrollPosition]);
  

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Get priority color
  const getPriorityColor = useCallback((priority: string) => {
    if (!priorities || priorities.length === 0) {
      console.log('🎨 No priorities available, using default color');
      return '#808080';
    }
    const priorityOption = priorities.find(p => p.priority === priority);
    const color = priorityOption?.color || '#808080';
    
    return color;
  }, [priorities]);

  // Process tasks
  const ganttTasks = useMemo(() => {
    const tasks: any[] = [];
    
    Object.values(columns).forEach(column => {
      column.tasks.forEach(task => {
        // Skip tasks without valid IDs
        if (!task || !task.id) {
          return;
        }
        
        let startDate = null;
        let endDate = null;
        
        // Get effective task data (with local drag state)
        const effectiveTask = localDragState.isDragging && localDragState.draggedTaskId === task.id
          ? { ...task, ...localDragState.localTaskData[task.id] }
          : task;
        
        if (effectiveTask.startDate) {
          startDate = parseLocalDate(effectiveTask.startDate);
          endDate = effectiveTask.dueDate ? parseLocalDate(effectiveTask.dueDate) : startDate;
        } else if (effectiveTask.dueDate) {
          endDate = parseLocalDate(effectiveTask.dueDate);
          startDate = endDate;
        }
        
        
        const ganttTask = {
          ...task,
          id: task.id,
          title: task.title,
          ticket: task.ticket || '',
          startDate,
          endDate,
          dueDate: effectiveTask.dueDate || effectiveTask.startDate || '', // Keep original string format
          status: column.title,
          priority: task.priority || 'medium',
          columnId: task.columnId,
          columnPosition: column.position || 0,
          taskPosition: task.position || 0
        };
        
        
        tasks.push(ganttTask);
      });
    });
    
    return tasks.sort((a, b) => {
      if (a.columnPosition !== b.columnPosition) {
        return a.columnPosition - b.columnPosition;
      }
      if (a.taskPosition !== b.taskPosition) {
        return a.taskPosition - b.taskPosition;
      }
      return 0;
    });
  }, [columns, localDragState]);

  // Group tasks by column
  const groupedTasks = useMemo(() => {
    const groups: { [columnId: string]: any[] } = {};
    
    Object.values(columns)
      .sort((a, b) => a.position - b.position)
      .forEach(column => {
        groups[column.id] = [];
      });
    
    ganttTasks.forEach(task => {
      if (groups[task.columnId]) {
        groups[task.columnId].push(task);
      }
    });
    
    
    Object.keys(groups).forEach(columnId => {
      groups[columnId].sort((a, b) => a.taskPosition - b.taskPosition);
    });
    
    return groups;
  }, [ganttTasks, columns]);

  // Visible tasks for list
  const visibleTasks = ganttTasks;


  // Calculate task positions for dependency arrows
  const calculateTaskPositions = useCallback(() => {
    const positions = new Map<string, {x: number, y: number, width: number, height: number}>();
    
    ganttTasks.forEach(task => {
      // Find the task element in the DOM
      const taskElement = document.querySelector(`[data-task-id="${task.id}"]`);
      if (taskElement && task.startDate && task.endDate) {
        const rect = taskElement.getBoundingClientRect();
        const container = scrollContainerRef.current;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          
          // Calculate position based on date indices
          const startIndex = dateRange.findIndex(d => 
            d.date.toDateString() === task.startDate.toDateString()
          );
          const endIndex = dateRange.findIndex(d => 
            d.date.toDateString() === task.endDate.toDateString()
          );
          
          if (startIndex >= 0 && endIndex >= 0) {
            positions.set(task.id, {
              x: startIndex * 40,
              y: rect.top - containerRect.top + container.scrollTop,
              width: (endIndex - startIndex + 1) * 40,
              height: rect.height
            });
          }
        }
      }
    });
    
    setTaskPositions(positions);
  }, [ganttTasks, dateRange]);

  // Calculate task positions when tasks change or view mode changes
  useEffect(() => {
    // Wait for DOM to update
    const timer = setTimeout(() => {
      calculateTaskPositions();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [ganttTasks, calculateTaskPositions, taskViewMode]);

  // Create a memoized date-to-index map for O(1) lookups
  const dateToIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    dateRange.forEach((dateObj, index) => {
      // Use local date format instead of UTC to avoid timezone issues
      const year = dateObj.date.getFullYear();
      const month = String(dateObj.date.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.date.getDate()).padStart(2, '0');
      const localDateStr = `${year}-${month}-${day}`;
      map.set(localDateStr, index);
    });
    return map;
  }, [dateRange]);

  // Get task bar grid position - optimized with O(1) lookup
  const getTaskBarGridPosition = useCallback((task: any) => {
    if (!task.startDate || !task.endDate) return null;
    
    // Convert task dates to local date format for comparison (avoid timezone issues)
    const formatLocalDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const taskStartStr = formatLocalDate(task.startDate);
    const taskEndStr = formatLocalDate(task.endDate);
    
    // Use O(1) lookup instead of O(n) findIndex
    const startIndex = dateToIndexMap.get(taskStartStr) ?? -1;
    const endIndex = dateToIndexMap.get(taskEndStr) ?? -1;
    
    if (startIndex === -1 || endIndex === -1) {
      // Task is outside current date range
      return null;
    }
    
    const result = {
      startDayIndex: startIndex,
      endDayIndex: endIndex
    };
    
    // CRITICAL FIX: For 1-day tasks (startDate === endDate), ensure they span exactly 1 column
    // This prevents the task bar from having zero width, which makes it unclickable
    if (startIndex === endIndex) {
      // For 1-day tasks, we need to ensure the task bar has a visible width
      // The TaskBar component will handle the visual width, but we need valid indices
      result.endDayIndex = startIndex; // Keep them the same, but ensure they're valid
    }
    
    return result;
  }, [dateToIndexMap]);

  // Task selection
  const handleTaskSelect = useCallback((taskId: string) => {
    // Prevent task selection if we're in the process of exiting multi-select mode
    if (isExitingMultiSelectRef.current) {
      console.log('🎯 handleTaskSelect blocked - exiting multi-select mode');
      return;
    }
    
    // Only allow task selection if we're actually in multi-select mode
    if (!isMultiSelectModeImmediateRef.current) {
      console.log('🎯 handleTaskSelect blocked - not in multi-select mode');
      return;
    }
    
    console.log('🎯 handleTaskSelect called:', { 
      taskId, 
      isMultiSelectMode: isMultiSelectModeRef.current, 
      selectedTasks: selectedTasksRef.current.length,
      currentSelected: selectedTasksRef.current
    });
    setSelectedTasks(prev => {
      const newTasks = prev.includes(taskId) 
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId];
      console.log('🎯 handleTaskSelect result:', { 
        taskId, 
        prev: prev.length, 
        newTasks: newTasks.length,
        newSelected: newTasks
      });
      return newTasks;
    });
  }, []); // No dependencies needed since we use refs

  // Reset arrow key state to prevent frozen tasks
  const resetArrowKeyState = useCallback(() => {
    isArrowKeyPressedRef.current = false;
    if (arrowKeyTimeoutRef.current) {
      clearTimeout(arrowKeyTimeoutRef.current);
      arrowKeyTimeoutRef.current = null;
    }
    // Also clear any active drag state
    setActiveDragItem(null);
    activeDragItemRef.current = null;
    // Clear local drag state to prevent stale data
    setLocalDragState({
      isDragging: false,
      draggedTaskId: null,
      localTaskData: {},
      originalTaskData: {}
    });
  }, []);

  // Handle relationship creation with optimistic updates
  const handleCreateRelationship = useCallback(async (parentTaskId: string, childTaskId: string) => {
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
      console.error('Failed to create relationship:', error);
      
      // Always revert optimistic update on error
      setLocalRelationships(prev => 
        prev.filter(rel => rel.id !== optimisticRelationship.id)
      );
      
      // Handle specific error cases with user-friendly messages
      const status = error?.response?.status;
      const errorMessage = error?.response?.data?.message || error?.message || 'Unknown error';
      
      if (status === 409) {
        // Duplicate relationship or circular dependency
        alert(`Cannot create relationship: ${errorMessage}`);
      } else if (status === 400) {
        // Invalid relationship type or self-relationship
        alert(`Invalid relationship: ${errorMessage}`);
      } else if (status === 404) {
        // Task not found
        alert(`Task not found: ${errorMessage}`);
      } else {
        // Other errors
        alert(`Failed to create relationship: ${errorMessage}`);
      }
    }
  }, [localRelationships, onRefreshData]);

  // Handle relationship deletion with optimistic updates
  const handleDeleteRelationship = useCallback(async (relationshipId: string, fromTaskId: string) => {
    // Store the relationship to restore if deletion fails
    const relationshipToDelete = localRelationships.find(rel => rel.id === relationshipId);
    
    // Immediately remove from local state for instant UI update
    setLocalRelationships(prev => prev.filter(rel => rel.id !== relationshipId));
    
    try {
      // Delete relationship in background
      await removeTaskRelationship(fromTaskId, relationshipId);
      
      // Note: No need to refresh data since arrow already removed from optimistic update
      
    } catch (error) {
      console.error('Failed to delete relationship:', error);
      
      // Revert optimistic update on error
      if (relationshipToDelete) {
        setLocalRelationships(prev => [...prev, relationshipToDelete]);
      }
      
      // Show user-friendly error message
      alert(`Failed to delete relationship: ${(error as any)?.response?.data?.message || (error as any)?.message || 'Unknown error'}`);
    }
  }, [localRelationships]);

  // Relationship click
  const handleRelationshipClick = useCallback((taskId: string) => {
    if (!selectedParentTask) {
      setSelectedParentTask(taskId);
    } else if (selectedParentTask === taskId) {
      setSelectedParentTask(null);
    } else {
      // Create relationship
      handleCreateRelationship(selectedParentTask, taskId);
      setSelectedParentTask(null);
      // Don't exit relationship mode - allow continuous creation
    }
  }, [selectedParentTask, handleCreateRelationship]);

  // Task creation handlers
  const handleTaskCreationMouseDown = useCallback((e: React.MouseEvent, dateString: string) => {
    e.preventDefault();
    setIsCreatingTask(true);
    setTaskCreationStart({ date: dateString });
    setTaskCreationEnd({ date: dateString });
  }, []);

  const handleTaskCreationMouseEnter = useCallback((e: React.MouseEvent, dateString: string) => {
    if (isCreatingTask && taskCreationStart) {
      setTaskCreationEnd({ date: dateString });
    }
  }, [isCreatingTask, taskCreationStart]);

  const handleTaskCreationMouseUp = useCallback(async (e: React.MouseEvent) => {
    if (!isCreatingTask || !taskCreationStart || !taskCreationEnd) return;
    
    e.preventDefault();
    
    // Calculate dates using parseLocalDate to avoid timezone issues
    const startDate = parseLocalDate(taskCreationStart.date);
    const endDate = parseLocalDate(taskCreationEnd.date);
    const finalStartDate = startDate <= endDate ? startDate : endDate;
    const finalEndDate = startDate <= endDate ? endDate : startDate;
    
    // Find the default column (first one)
    const firstColumn = Object.values(columns).sort((a, b) => a.position - b.position)[0];
    if (!firstColumn || !onAddTask) return;
    
    // Create task with the selected date range
    try {
      // finalStartDate and finalEndDate are already Date objects, convert to yyyy-MM-dd format
      const year1 = finalStartDate.getFullYear();
      const month1 = String(finalStartDate.getMonth() + 1).padStart(2, '0');
      const day1 = String(finalStartDate.getDate()).padStart(2, '0');
      const startDateStr = `${year1}-${month1}-${day1}`;
      
      const year2 = finalEndDate.getFullYear();
      const month2 = String(finalEndDate.getMonth() + 1).padStart(2, '0');
      const day2 = String(finalEndDate.getDate()).padStart(2, '0');
      const dueDateStr = `${year2}-${month2}-${day2}`;
      
      await onAddTask(firstColumn.id, startDateStr, dueDateStr);
      // Don't refresh - let WebSocket handle the update to avoid duplicates
    } catch (error) {
      console.error('Failed to create task:', error);
    }
    
    // Reset state
    setIsCreatingTask(false);
    setTaskCreationStart(null);
    setTaskCreationEnd(null);
  }, [isCreatingTask, taskCreationStart, taskCreationEnd, columns, onAddTask]);

  // Drag handlers for task list
  const handleTaskListDragStart = useCallback((event: DragStartEvent) => {
    const dragData = event.active.data.current;
    setActiveDragItem(dragData);
    activeDragItemRef.current = dragData;
  }, []);

  const handleTaskListDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    console.log('🎯 Task list drag end:', {
      activeId: active.id,
      overId: over?.id,
      activeData: active.data.current,
      overData: over?.data.current
    });
    
    if (over) {
      const activeData = active.data.current as SortableTaskRowItem;
      const overData = over.data.current;
      
      // Handle dropping on column drop zone (cross-column move) - check by ID first
      if (activeData.type === 'task-row-reorder' && over.id && over.id.startsWith('drop-zone-')) {
        const targetColumnId = over.id.replace('drop-zone-', '');
        const activeTask = activeData.task;
        
        console.log('🔄 Cross-column drop detected (by ID):', {
          activeTaskId: activeTask.id,
          activeTaskColumnId: activeTask.columnId,
          targetColumnId,
          isDifferentColumn: activeTask.columnId !== targetColumnId
        });
        
        if (activeTask.columnId !== targetColumnId && onUpdateTask) {
          // Move task to different column
          const sourceColumn = columns[activeTask.columnId];
          const targetColumn = columns[targetColumnId];
          
          if (sourceColumn && targetColumn) {
            // Get source tasks sorted by position - filter out invalid tasks
            const sourceTasks = [...sourceColumn.tasks]
              .filter(task => task && task.id && typeof task.position === 'number')
              .sort((a, b) => (a.position || 0) - (b.position || 0));
            const targetTasks = [...targetColumn.tasks]
              .filter(task => task && task.id && typeof task.position === 'number')
              .sort((a, b) => (a.position || 0) - (b.position || 0));
            
            // Remove task from source column
            const filteredSourceTasks = sourceTasks.filter(t => t.id !== activeTask.id);
            
            // Add task to target column at position 0
            const newTargetTasks = [activeTask, ...targetTasks];
            
            // Update positions for source column tasks (0 to n-1)
            filteredSourceTasks.forEach((task, index) => {
              if (task.position !== index) {
                // Find the original task data from the source column
                const originalTask = sourceColumn.tasks.find(t => t.id === task.id);
                if (originalTask && originalTask.id) {
                  onUpdateTask({
                    ...originalTask,
                    position: index
                  });
                }
              }
            });
            
            // Update positions for target column tasks (including moved task)
            newTargetTasks.forEach((task, index) => {
              // Find the original task data from the appropriate column
              const originalTask = task.id === activeTask.id 
                ? sourceColumn.tasks.find(t => t.id === task.id)
                : targetColumn.tasks.find(t => t.id === task.id);
              
              if (originalTask && originalTask.id) {
                onUpdateTask({
                  ...originalTask,
                  columnId: targetColumnId,
                  position: index
                });
              }
            });
          }
        }
        
        // Clear drag state immediately for cross-column drops to prevent snap-back
        setActiveDragItem(null);
        activeDragItemRef.current = null;
        
        // Refresh data to show the updated UI immediately
        if (onRefreshData) {
          console.log('🔄 Refreshing data after cross-column move');
          // Add a small delay to ensure backend updates are processed
          setTimeout(() => {
            onRefreshData();
          }, 100);
        }
        return;
      }
      
      // Handle task reordering within the same column
      if (active.id !== over.id && activeData.type === 'task-row-reorder' && overData?.type === 'task-row-reorder') {
        const activeTask = activeData.task;
        const overTask = overData.task;
        
        if (activeTask.columnId === overTask.columnId) {
          // Same column reordering - use exact logic from original GanttView
          const column = columns[activeTask.columnId];
          if (column && onUpdateTask) {
            // Get all tasks in the same column, sorted by current order
            // Filter out tasks with invalid IDs or positions first
            const columnTasks = [...column.tasks]
              .filter(task => task && task.id && typeof task.position === 'number')
              .sort((a, b) => (a.position || 0) - (b.position || 0));
            
            // Find indices within the column only
            const draggedIndex = columnTasks.findIndex(t => t.id === activeTask.id);
            const targetIndex = columnTasks.findIndex(t => t.id === overTask.id);
            
            console.log('🔄 Reordering debug:', {
              activeTaskId: activeTask.id,
              overTaskId: overTask.id,
              draggedIndex,
              targetIndex,
              columnTasks: columnTasks.map(t => ({ id: t.id, title: t.title, position: t.position })),
              originalColumnTasks: column.tasks.map(t => ({ id: t.id, title: t.title, position: t.position }))
            });
            
            if (draggedIndex !== -1 && targetIndex !== -1) {
              // Create new array with reordered tasks
              const newTasks = [...columnTasks];
              const [draggedTaskData] = newTasks.splice(draggedIndex, 1);
              newTasks.splice(targetIndex, 0, draggedTaskData);
              
              // Update positions for all affected tasks (0 to n-1)
              // Use the original task data from columnTasks, not the drag data
              newTasks.forEach((task, index) => {
                if (task.position !== index) {
                  // Find the original task data from the column to ensure we have complete data
                  const originalTask = column.tasks.find(t => t.id === task.id);
                  if (originalTask && originalTask.id) {
                    console.log('📝 Updating task position:', {
                      taskId: originalTask.id,
                      taskTitle: originalTask.title,
                      oldPosition: originalTask.position,
                      newPosition: index
                    });
                    onUpdateTask({
                      ...originalTask,
                      position: index
                    });
                  } else {
                    console.error('❌ Could not find original task or task has no ID:', {
                      taskId: task.id,
                      taskTitle: task.title,
                      originalTask: !!originalTask,
                      originalTaskId: originalTask?.id
                    });
                  }
                }
              });
            }
          }
        } else {
          // Cross-column move - not implemented yet
        }
      }
    }
    
    setActiveDragItem(null);
    activeDragItemRef.current = null;
  }, [columns, onUpdateTask]);

  const handleTaskListDragOver = useCallback((event: DragOverEvent) => {
    // Handle drag over for visual feedback
    const { active, over } = event;
    
    if (over) {
      const overData = over.data.current;
      if (overData?.type === 'column-drop') {
        // Visual feedback for column drop zones
        console.log('Dragging over column:', overData.columnId);
      }
    }
  }, []);

  // Drag handlers for timeline (task bars)
  const handleTimelineDragStart = useCallback((event: DragStartEvent) => {
    const dragData = event.active.data.current as any;
    
    if (dragData?.dragType) {
      setActiveDragItem(dragData);
      activeDragItemRef.current = dragData;
      
      // Initialize local drag state
      const taskId = dragData.taskId;
      const task = ganttTasks.find(t => t.id === taskId);
      
      if (task) {
        
        const dragState = {
          isDragging: true,
          draggedTaskId: taskId,
          localTaskData: {
            [taskId]: {
              startDate: task.startDate ? formatLocalDate(task.startDate) : '',
              dueDate: task.endDate ? formatLocalDate(task.endDate) : ''
            }
          },
          originalTaskData: {
            [taskId]: {
              startDate: task.startDate ? formatLocalDate(task.startDate) : '',
              dueDate: task.endDate ? formatLocalDate(task.endDate) : ''
            }
          }
        };
        
        setLocalDragState(dragState);
        localDragStateRef.current = dragState;
        
        if (onTaskDragStart) {
          const originalTask = Object.values(columns)
            .flatMap(col => col.tasks)
            .find(t => t.id === taskId);
          if (originalTask) {
            onTaskDragStart(originalTask);
          }
        }
      }
    }
  }, [ganttTasks, columns, onTaskDragStart]);

  const handleTimelineDragOver = useCallback((event: DragOverEvent) => {
    const { over, activatorEvent } = event;
    const currentActiveDragItem = activeDragItemRef.current;
    
    if (over && currentActiveDragItem) {
      const overData = over.data.current as any;
      
      if (overData?.date) {
        setCurrentHoverDate(overData.date);
        
        // Update local drag state
        if (localDragState.isDragging && localDragState.draggedTaskId) {
          const taskId = localDragState.draggedTaskId;
          const dragType = (currentActiveDragItem as GanttDragItem).dragType;
          
          let newStartDate = localDragState.originalTaskData[taskId].startDate;
          let newDueDate = localDragState.originalTaskData[taskId].dueDate;
          
          if (dragType === DRAG_TYPES.TASK_MOVE_HANDLE) {
            const originalStart = new Date(localDragState.originalTaskData[taskId].startDate);
            const originalEnd = new Date(localDragState.originalTaskData[taskId].dueDate);
            // Add 1 day to duration since both start and end dates are inclusive
            const duration = originalEnd.getTime() - originalStart.getTime() + (24 * 60 * 60 * 1000);
            
            newStartDate = overData.date;
            const newStart = new Date(overData.date);
            const newEnd = new Date(newStart.getTime() + duration);
            newDueDate = formatLocalDate(newEnd);
            
          } else if (dragType === DRAG_TYPES.TASK_START_HANDLE) {
            newStartDate = overData.date;
            // Ensure we don't go past the end date
            if (new Date(newStartDate) > new Date(newDueDate)) {
              newStartDate = newDueDate;
            }
          } else if (dragType === DRAG_TYPES.TASK_END_HANDLE) {
            newDueDate = overData.date;
            // Ensure we don't go before the start date
            if (new Date(newDueDate) < new Date(newStartDate)) {
              newDueDate = newStartDate;
            }
          }
          
          // Update ref immediately for calculations
          localDragStateRef.current = {
            ...localDragStateRef.current,
            localTaskData: {
              ...localDragStateRef.current.localTaskData,
              [taskId]: {
                startDate: newStartDate,
                dueDate: newDueDate
              }
            }
          };
          
          // Batch the state update to avoid blocking
          startTransition(() => {
            setLocalDragState(localDragStateRef.current);
          });
        }
      }
    }
  }, [localDragState]);

  const handleTimelineDragEnd = useCallback(async (event: DragEndEvent) => {
    const { over } = event;
    const currentActiveDragItem = activeDragItemRef.current;
    
    if (currentActiveDragItem && localDragState.isDragging && over) {
      const taskId = localDragState.draggedTaskId;
      const overData = over.data.current as any;
      
      if (overData?.date && onUpdateTask) {
        const originalTask = Object.values(columns)
          .flatMap(col => col.tasks)
          .find(t => t.id === taskId);
          
        if (originalTask) {
          const dragType = (currentActiveDragItem as GanttDragItem).dragType;
          const task = ganttTasks.find(t => t.id === taskId);
          
          if (task) {
            let newStartDate = task.startDate ? formatLocalDate(task.startDate) : '';
            let newDueDate = task.endDate ? formatLocalDate(task.endDate) : '';
            
            if (dragType === DRAG_TYPES.TASK_MOVE_HANDLE) {
              // Use the final dates from local state which were updated during drag over
              const finalLocalDates = localDragStateRef.current.localTaskData[taskId];
              if (finalLocalDates) {
                newStartDate = finalLocalDates.startDate;
                newDueDate = finalLocalDates.dueDate;
              }
            } else if (dragType === DRAG_TYPES.TASK_START_HANDLE) {
              newStartDate = overData.date;
              // Ensure we don't go past the end date
              if (new Date(newStartDate) > new Date(newDueDate)) {
                newStartDate = newDueDate;
              }
            } else if (dragType === DRAG_TYPES.TASK_END_HANDLE) {
              newDueDate = overData.date;
              // Ensure we don't go before the start date
              if (new Date(newDueDate) < new Date(newStartDate)) {
                newDueDate = newStartDate;
              }
            }
            
            
            const updatedTask = {
              ...originalTask,
              startDate: newStartDate,
              dueDate: newDueDate
            };
            
            await onUpdateTask(updatedTask);
          }
        }
      }
    }
    
    // Clear state
    setActiveDragItem(null);
    activeDragItemRef.current = null;
    setCurrentHoverDate(null);
    setLocalDragState({
      isDragging: false,
      draggedTaskId: null,
      localTaskData: {},
      originalTaskData: {}
    });
    
    // Only call onTaskDragEnd if there was actually a drag operation
    if (onTaskDragEnd && localDragState.isDragging) {
      onTaskDragEnd();
    }
  }, [localDragState, columns, onUpdateTask, onTaskDragEnd, ganttTasks]);

  return (
    <>

    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-visible relative">

      {/* Board Loading Overlay */}
      {isBoardLoading && (
        <div className="absolute inset-0 bg-white dark:bg-gray-800 bg-opacity-90 dark:bg-opacity-90 z-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Loading Board...</div>
          </div>
        </div>
      )}

      {/* Gantt Header - sticky under page header */}
      <div className="sticky top-16 z-50 bg-white dark:bg-gray-800">
        <GanttHeader
          dateRange={dateRange}
          formatDate={(date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          ganttTasks={ganttTasks}
          scrollToToday={() => navigateToDate(new Date(), 'center')}
          scrollEarlier={() => navigateToDate(new Date(dateRange[0].date.getTime() - 30 * 24 * 60 * 60 * 1000), 'end')}
          scrollLater={() => navigateToDate(new Date(dateRange[dateRange.length - 1].date.getTime() + 30 * 24 * 60 * 60 * 1000), 'start')}
          scrollToTask={(startDate: Date, endDate: Date, position?: string) => {
            const pos = position === 'start-left' ? 'start' : position === 'end-right' ? 'end' : 'center';
            navigateToDate(startDate, pos);
          }}
          isRelationshipMode={isRelationshipMode}
          setIsRelationshipMode={setIsRelationshipMode}
          isMultiSelectMode={isMultiSelectMode}
          setIsMultiSelectMode={setIsMultiSelectMode}
          selectedTasks={selectedTasks}
          setSelectedTasks={setSelectedTasks}
          setHighlightedTaskId={setHighlightedTaskId}
          resetArrowKeyState={resetArrowKeyState}
          isLoading={false}
          onJumpToTask={handleJumpToTask}
          selectedParentTask={selectedParentTask}
          setSelectedParentTask={setSelectedParentTask}
        />
      </div>
      
      {/* Timeline header - sticky under Gantt header */}
      <div className="sticky top-[189px] z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex">
          <div 
            className="sticky left-0 z-30 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700"
            style={{ width: `${taskColumnWidth}px` }}
          >
            <div className="h-14 flex flex-col">
              <div className="h-6 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600"></div>
              <div className="h-8 flex items-center justify-between px-4 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <span className="font-semibold text-sm">Tasks</span>
                {/* Navigation controls */}
                <div className="flex items-center gap-1">
                  {/* Jump to earliest task */}
                  <button
                    onClick={() => {
                      console.log('Jump to earliest clicked, tasks:', ganttTasks.length);
                      if (ganttTasks.length > 0) {
                        const earliestTask = ganttTasks.reduce((earliest, task) => 
                          (!earliest.startDate || (task.startDate && task.startDate < earliest.startDate)) ? task : earliest
                        );
                        console.log('Earliest task:', earliestTask.title, earliestTask.startDate);
                        if (earliestTask.startDate) {
                          navigateToDate(earliestTask.startDate, 'start');
                        }
                      }
                    }}
                    disabled={ganttTasks.length === 0}
                    className="p-1 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Jump to earliest task"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                  </button>
                  
                  {/* Earlier button */}
                  <button
                    onClick={() => {
                      if (scrollContainerRef.current) {
                        const container = scrollContainerRef.current;
                        const currentScroll = container.scrollLeft;
                        const viewportWidth = container.clientWidth;
                        
                        // If we're near the start, extend the date range
                        if (currentScroll < 500) {
                          // Trigger the lazy loading
                          container.scrollLeft = 100;
                          setTimeout(() => {
                            container.scrollLeft = currentScroll + (60 * 40); // Adjust for new dates
                          }, 100);
                        } else {
                          // Normal scroll
                          container.scrollLeft = Math.max(0, currentScroll - viewportWidth * 0.8);
                        }
                      }
                    }}
                    className="p-1 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                    title="Scroll to earlier dates"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  
                  {/* Today button */}
                  <button
                    onClick={() => {
                      navigateToDate(new Date(), 'center');
                    }}
                    className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Today
                  </button>
                  
                  {/* Later button */}
                  <button
                    onClick={() => {
                      if (scrollContainerRef.current) {
                        const container = scrollContainerRef.current;
                        const currentScroll = container.scrollLeft;
                        const viewportWidth = container.clientWidth;
                        const maxScroll = container.scrollWidth - viewportWidth;
                        
                        // If we're near the end, let the lazy loading handle it
                        if (currentScroll > maxScroll - 500) {
                          container.scrollLeft = maxScroll - 100;
                        } else {
                          // Normal scroll
                          container.scrollLeft = Math.min(maxScroll, currentScroll + viewportWidth * 0.8);
                        }
                      }
                    }}
                    className="p-1 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                    title="Scroll to later dates"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  
                  {/* Jump to latest task */}
                  <button
                    onClick={() => {
                      if (ganttTasks.length > 0) {
                        const latestTask = ganttTasks.reduce((latest, task) => 
                          (!latest.endDate || (task.endDate && task.endDate > latest.endDate)) ? task : latest
                        );
                        if (latestTask.endDate) {
                          navigateToDate(latestTask.endDate, 'end');
                        }
                      }
                    }}
                    disabled={ganttTasks.length === 0}
                    className="p-1 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Jump to latest task"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                  </button>
                  
                  {/* Resize handle */}
                  <div
                    className={`w-1 h-6 transition-colors cursor-col-resize ${
                      isResizing 
                        ? 'bg-blue-500' 
                        : 'bg-gray-300 dark:bg-gray-500 hover:bg-gray-400 dark:hover:bg-gray-400'
                    }`}
                    onMouseDown={handleResizeStart}
                    title="Drag to resize task column"
                  />
                  
                </div>
              </div>
            </div>
          </div>
          <div 
            ref={headerScrollRef}
            className="flex-1 overflow-hidden relative"
          >
            <div 
              className="absolute"
              style={{ 
                width: `${dateRange.length * 40}px`,
                transform: `translateX(0px)`,
                willChange: 'transform'
              }}>
              {/* Month/Year Row */}
              <div 
                className="h-6 grid border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700"
                style={{ gridTemplateColumns: `repeat(${dateRange.length}, 40px)` }}
              >
                {dateRange.map((dateCol, index) => (
                  <div
                    key={`month-${index}`}
                    className="text-xs font-medium text-gray-600 dark:text-gray-300 flex items-center justify-center"
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
                className="h-8 grid border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700"
                style={{ gridTemplateColumns: `repeat(${dateRange.length}, 40px)` }}
              >
                {dateRange.map((dateCol, index) => (
                  <div
                    key={`day-${index}`}
                    className={`text-xs text-center border-r border-gray-300 dark:border-gray-600 flex items-center justify-center ${
                      dateCol.isToday ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 font-semibold' :
                      dateCol.isWeekend ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400' : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {dateCol.date.getDate()}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div ref={mainContentRef} className="relative flex">
        {/* Task list with DnD */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleTaskListDragStart}
          onDragEnd={handleTaskListDragEnd}
          onDragOver={handleTaskListDragOver}
        >
          <GanttTaskList
            columns={columns}
            groupedTasks={groupedTasks}
            visibleTasks={visibleTasks}
            selectedTasks={selectedTasks}
            isMultiSelectMode={isMultiSelectMode}
            isRelationshipMode={isRelationshipMode}
            selectedParentTask={selectedParentTask}
            activeDragItem={activeDragItem}
            priorities={priorities}
            taskColumnWidth={taskColumnWidth}
            taskViewMode={taskViewMode}
            onSelectTask={onSelectTask}
            onTaskSelect={handleTaskSelect}
            onRelationshipClick={handleRelationshipClick}
            onCopyTask={onCopyTask}
            onRemoveTask={onRemoveTask}
            highlightedTaskId={highlightedTaskId}
          />
          
          {/* Task drag preview */}
          <DragOverlay dropAnimation={null}>
            {activeDragItem && (activeDragItem as SortableTaskRowItem).type === 'task-row-reorder' ? (
              <div className="bg-white dark:bg-gray-800 border-2 border-blue-500 rounded-lg shadow-2xl p-4 flex items-center gap-3 opacity-95 transform rotate-1 relative min-w-[200px]">
                <div className="flex items-center justify-center w-6 h-6 text-blue-500">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 6h2v2H8V6zm6 0h2v2h-2V6zM8 10h2v2H8v-2zm6 0h2v2h-2v-2zM8 14h2v2H8v-2zm6 0h2v2h-2v-2z"/>
                  </svg>
                </div>
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

        {/* Timeline */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragStart={handleTimelineDragStart}
          onDragOver={handleTimelineDragOver}
          onDragEnd={handleTimelineDragEnd}
        >
          <GanttTimeline
            groupedTasks={groupedTasks}
            dateRange={dateRange}
            activeDragItem={activeDragItem}
            currentHoverDate={currentHoverDate}
            selectedTasks={selectedTasks}
            isMultiSelectMode={isMultiSelectMode}
            isRelationshipMode={isRelationshipMode}
            taskViewMode={taskViewMode}
            isCreatingTask={isCreatingTask}
            taskCreationStart={taskCreationStart}
            taskCreationEnd={taskCreationEnd}
            getPriorityColor={getPriorityColor}
            getTaskBarGridPosition={getTaskBarGridPosition}
            onSelectTask={onSelectTask}
            onTaskSelect={handleTaskSelect}
            onRelationshipClick={handleRelationshipClick}
            onTaskCreationMouseDown={handleTaskCreationMouseDown}
            onTaskCreationMouseEnter={handleTaskCreationMouseEnter}
            onTaskCreationMouseUp={handleTaskCreationMouseUp}
            scrollContainerRef={scrollContainerRef}
            localDragState={localDragState}
            ganttTasks={ganttTasks}
            taskPositions={taskPositions}
            relationships={[...relationships, ...localRelationships]}
            highlightedTaskId={highlightedTaskId}
            selectedParentTask={selectedParentTask}
            onDeleteRelationship={handleDeleteRelationship}
          />
          <DragOverlay dropAnimation={null} />
        </DndContext>
      </div>

    </div>
    
    {/* Jump to task dropdown */}
    {showTaskJumpDropdown && taskJumpRef.current && createPortal(
      <div 
        className="task-jump-dropdown fixed z-50 mt-1 w-64 max-h-96 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg"
        style={{
          top: taskJumpRef.current.getBoundingClientRect().bottom,
          left: taskJumpRef.current.getBoundingClientRect().left
        }}
      >
        <div className="p-2">
          <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-2">Select a task to jump to:</div>
          {ganttTasks.length === 0 ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 py-2">No tasks available</div>
          ) : (
            ganttTasks
              .filter(task => task.startDate)
              .sort((a, b) => (a.startDate?.getTime() || 0) - (b.startDate?.getTime() || 0))
              .map(task => (
                <button
                  key={task.id}
                  onClick={() => {
                    console.log('Jump to task clicked:', task.title, task.startDate);
                    if (task.startDate) {
                      navigateToDate(task.startDate, 'center');
                      
                      // Also scroll to task vertically
                      setTimeout(() => {
                        const taskElement = document.querySelector(`[data-task-id="${task.id}"]`);
                        if (taskElement && mainContentRef.current) {
                          const containerRect = mainContentRef.current.getBoundingClientRect();
                          const taskRect = taskElement.getBoundingClientRect();
                          const relativeTop = taskRect.top - containerRect.top + mainContentRef.current.scrollTop;
                          
                          // Scroll to center the task vertically
                          mainContentRef.current.scrollTop = relativeTop - (containerRect.height / 2) + (taskRect.height / 2);
                        }
                      }, 100);
                    }
                    setShowTaskJumpDropdown(false);
                  }}
                className="w-full text-left px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center justify-between"
              >
                <span className="truncate">{task.title}</span>
                <span className="text-gray-500 dark:text-gray-400 ml-2 flex-shrink-0">
                  {task.startDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </button>
              ))
          )}
        </div>
      </div>,
      document.body
    )}
    
    {/* Legend */}
    <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800">
      <div className="flex items-center gap-6 text-xs text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <span className="text-blue-600 dark:text-blue-400 font-semibold">Today</span>
          <div className="w-4 h-3 bg-blue-100 dark:bg-blue-900 border border-blue-200 dark:border-blue-700"></div>
        </div>
        <div className="flex items-center gap-2">
          <span>Weekends</span>
          <div className="w-4 h-3 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600"></div>
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
    </>
  );
};

GanttViewV2.displayName = 'GanttViewV2';

export default GanttViewV2;
