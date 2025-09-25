import { useCallback, useRef, useState } from 'react';
import { loadUserPreferencesAsync, saveUserPreferences } from '../utils/userPreferences';
import { getUserSettings } from '../api';

interface ScrollPosition {
  date: string;
  sessionId: string;
}

interface GanttScrollPositions {
  [boardId: string]: ScrollPosition;
}

interface UseGanttScrollPositionProps {
  boardId: string | null;
  currentUser: any;
}

/**
 * Format a date to local date string (YYYY-MM-DD)
 */
const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Get the leftmost visible date directly from the DOM timeline header
 */
export const getLeftmostVisibleDateFromDOM = (scrollContainer: HTMLElement): string | null => {
  try {
    // Strategy 1: Look for data attribute (preferred - most resilient)
    let timelineHeader = scrollContainer.parentElement?.parentElement?.querySelector('[data-gantt-timeline-header="true"]');
    
    if (!timelineHeader) {
      // Strategy 2: Search in the entire document for data attribute
      timelineHeader = document.querySelector('[data-gantt-timeline-header="true"]');
    }
    
    if (!timelineHeader) {
      // Strategy 3: Fallback to CSS class (for backward compatibility)
      timelineHeader = scrollContainer.parentElement?.parentElement?.querySelector('.sticky.top-\\[169px\\]');
    }
    
    if (!timelineHeader) {
      // Strategy 4: Search entire document for CSS class
      timelineHeader = document.querySelector('.sticky.top-\\[169px\\]');
    }
    
    if (!timelineHeader) {
      return null;
    }
    
    
    // Find the day number row using data attribute (preferred) or CSS class (fallback)
    let dayRow = timelineHeader.querySelector('[data-gantt-day-row="true"]');
    if (!dayRow) {
      dayRow = timelineHeader.querySelector('.h-8.grid');
    }
    
    if (!dayRow) {
      return null;
    }
    
    const dayCells = dayRow.querySelectorAll('div');
    if (dayCells.length === 0) {
      return null;
    }
    
    // Find the first visible cell (not scrolled out of view)
    const containerRect = scrollContainer.getBoundingClientRect();
    const scrollLeft = scrollContainer.scrollLeft;
    
    for (let i = 0; i < dayCells.length; i++) {
      const cell = dayCells[i] as HTMLElement;
      const cellRect = cell.getBoundingClientRect();
      
      // Check if this cell is visible (not scrolled out of view)
      if (cellRect.left >= containerRect.left) {
        const dayText = cell.textContent?.trim();
        if (dayText && dayText.match(/^\d+$/)) {
          // This is a day number cell - we need to find the month/year for this specific cell
          // The month/year cells are sparse (only show on 1st and 15th), so we need to find the closest one
          let monthYearRow = timelineHeader.querySelector('[data-gantt-month-row="true"]');
          if (!monthYearRow) {
            monthYearRow = timelineHeader.querySelector('.h-6.grid');
          }
          if (monthYearRow) {
            const monthYearCells = monthYearRow.querySelectorAll('div');
            
            // Find the closest month/year cell to the left of or at this position
            let monthYearText = '';
            let monthYearIndex = -1;
            
            // Look backwards from current position to find the last month/year cell
            for (let j = i; j >= 0; j--) {
              const monthYearCell = monthYearCells[j];
              if (monthYearCell) {
                const text = monthYearCell.textContent?.trim();
                if (text && text.match(/[A-Za-z]+'\d{2}/)) {
                  monthYearText = text;
                  monthYearIndex = j;
                  break;
                }
              }
            }
            
            if (monthYearText) {
              // Parse the month/year and day to create a date
              const match = monthYearText.match(/([A-Za-z]+)'(\d{2})/);
              if (match) {
                const month = match[1];
                const year = '20' + match[2]; // Convert '25' to '2025'
                const day = parseInt(dayText);
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const monthIndex = monthNames.indexOf(month);
                if (monthIndex !== -1) {
                  // Calculate the actual date based on the day number and month/year
                  const date = new Date(parseInt(year), monthIndex, day);
                  // Use local date formatting to match the rest of the system
                  const localYear = date.getFullYear();
                  const localMonth = String(date.getMonth() + 1).padStart(2, '0');
                  const localDay = String(date.getDate()).padStart(2, '0');
                  return `${localYear}-${localMonth}-${localDay}`;
                }
              }
            }
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('🎯 Error getting leftmost visible date from DOM:', error);
    return null;
  }
};

export const useGanttScrollPosition = ({ boardId, currentUser }: UseGanttScrollPositionProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [lastSavedScrollDate, setLastSavedScrollDate] = useState<string | null>(null);
  
  // Track last saved date per board to prevent loops
  const lastSavedScrollDateRef = useRef<{[boardId: string]: string}>({});
  
  // Debounce timer for scroll saves
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * UNIFIED SCROLL POSITION SAVER
   * This is the single, robust function that saves scroll positions
   * Called by all user interactions (scrolling, navigation buttons, etc.)
   */
  const saveCurrentScrollPosition = useCallback((
    scrollContainer: HTMLElement, 
    dateRange: any[], 
    options?: { immediate?: boolean; targetBoardId?: string }
  ) => {
    if (!scrollContainer || !boardId || dateRange.length === 0) {
      return;
    }

    const currentBoardId = options?.targetBoardId || boardId;
    // Get the actual leftmost visible date from the DOM instead of calculating
    const leftmostVisibleDate = getLeftmostVisibleDateFromDOM(scrollContainer);
    
    if (!leftmostVisibleDate) {
      return;
    }
    
    const currentLeftmostDate = leftmostVisibleDate;
    
    if (!currentLeftmostDate) {
      return;
    }

    // Prevent saving the same position repeatedly (loop prevention)
    if (currentLeftmostDate === lastSavedScrollDateRef.current[currentBoardId]) {
      return;
    }

    // Clear existing timeout if not immediate
    if (!options?.immediate && saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    const performSave = async () => {
      if (!currentUser?.id) {
        return;
      }

      try {
        // Load the latest preferences to avoid overwriting other changes
        const latestPreferences = await loadUserPreferencesAsync(currentUser.id);
        const sessionId = Date.now().toString();
        
        const newScrollPositions: GanttScrollPositions = {
          ...latestPreferences.ganttScrollPositions,
          [currentBoardId]: {
            date: currentLeftmostDate,
            sessionId: sessionId
          }
        };
        
        
        await saveUserPreferences({
          ...latestPreferences,
          ganttScrollPositions: newScrollPositions
        }, currentUser.id);
        
        
        // Verify what was actually saved to cookie
        const cookieName = `easy-kanban-user-prefs-${currentUser.id}`;
        const savedCookie = document.cookie.split(';').find(cookie => 
          cookie.trim().startsWith(`${cookieName}=`)
        );
        if (savedCookie) {
          const cookieData = JSON.parse(decodeURIComponent(savedCookie.split('=')[1]));
        }
        
        // Update tracking to prevent loops
        lastSavedScrollDateRef.current[currentBoardId] = currentLeftmostDate;
        setLastSavedScrollDate(currentLeftmostDate);
        
      } catch (error) {
        console.error(`Failed to save scroll position for board ${currentBoardId}:`, error);
      }
    };

    if (options?.immediate) {
      performSave();
    } else {
      // Debounce scroll saves to prevent excessive database calls
      saveTimeoutRef.current = setTimeout(performSave, 300);
    }
  }, [boardId, currentUser]);

  /**
   * Load saved scroll position for a specific board
   */
  const getSavedScrollPosition = useCallback(async (targetBoardId?: string): Promise<string | null> => {
    const currentBoardId = targetBoardId || boardId;
    if (!currentBoardId || !currentUser?.id) {
      return null;
    }

    try {
      setIsLoading(true);
      
      // Bypass cache and load directly from database
      const dbSettings = await getUserSettings();
      const scrollPositions = dbSettings.ganttScrollPositions ? JSON.parse(dbSettings.ganttScrollPositions) : {};
      
      const savedPosition = scrollPositions[currentBoardId];
      if (savedPosition?.date) {
        return savedPosition.date;
      }
      
      return null;
    } catch (error) {
      console.error(`Failed to load scroll position for board ${currentBoardId}:`, error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [boardId, currentUser]);

  /**
   * Calculate the center date for initial board load
   * If we have a saved position, use that; otherwise center on today
   */
  const calculateCenterDate = useCallback((savedPositionDate: string | null): Date => {
    if (savedPositionDate) {
      return new Date(savedPositionDate);
    }
    return new Date(); // Today centered
  }, []);

  /**
   * Generate date range centered around a specific date
   */
  const generateDateRange = useCallback((centerDate: Date, daysBefore: number = 90, daysAfter: number = 90) => {
    const startDate = new Date(centerDate);
    startDate.setDate(startDate.getDate() - daysBefore);
    
    const endDate = new Date(centerDate);
    endDate.setDate(endDate.getDate() + daysAfter);
    
    const range = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
      range.push({
        date: new Date(current),
        isToday: current.toDateString() === new Date().toDateString()
      });
      current.setDate(current.getDate() + 1);
    }
    
    return range;
  }, []);

  /**
   * Calculate scroll position to show a specific date as the leftmost visible cell
   */
  const calculateScrollPosition = useCallback((
    targetDate: Date, 
    dateRange: any[]
  ): number => {
    const targetIndex = dateRange.findIndex(d => 
      formatLocalDate(d.date) === formatLocalDate(targetDate)
    );
    
    if (targetIndex >= 0) {
      // Position the target date as the leftmost visible cell
      return targetIndex * 40; // 40px per column
    }
    
    return 0;
  }, []);

  return {
    isLoading,
    lastSavedScrollDate,
    saveCurrentScrollPosition,
    getSavedScrollPosition,
    calculateCenterDate,
    generateDateRange,
    calculateScrollPosition,
    getLeftmostVisibleDateFromDOM
  };
};