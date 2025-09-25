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
 * Get the leftmost visible date directly from the DOM timeline header
 */
const getLeftmostVisibleDateFromDOM = (scrollContainer: HTMLElement): string | null => {
  try {
    console.log('🎯 Looking for timeline header in DOM...');
    
    // The timeline header is a sibling of the scroll container's parent
    // Scroll container is inside the main content, timeline header is above it
    let timelineHeader = scrollContainer.parentElement?.parentElement?.querySelector('.sticky.top-\\[189px\\]');
    console.log('🎯 Found with .sticky.top-\\[189px\\]:', !!timelineHeader);
    
    if (!timelineHeader) {
      // Try searching in the entire document
      timelineHeader = document.querySelector('.sticky.top-\\[189px\\]');
      console.log('🎯 Found in document with .sticky.top-\\[189px\\]:', !!timelineHeader);
    }
    
    if (!timelineHeader) {
      console.log('🎯 Timeline header not found');
      return null;
    }
    
    console.log('🎯 Timeline header found:', timelineHeader);
    
    // Find the day number row (second row in the timeline header)
    const dayRow = timelineHeader.querySelector('.h-8.grid');
    console.log('🎯 Day row found with .h-8.grid:', !!dayRow);
    
    if (!dayRow) {
      console.log('🎯 Day row not found');
      return null;
    }
    
    const dayCells = dayRow.querySelectorAll('div');
    if (dayCells.length === 0) {
      console.log('🎯 No day cells found');
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
        console.log(`🎯 Cell ${i}: day=${dayText}, left=${cellRect.left}, containerLeft=${containerRect.left}, visible=${cellRect.left >= containerRect.left}`);
        if (dayText && dayText.match(/^\d+$/)) {
          // This is a day number cell - we need to find the month/year for this specific cell
          // The month/year cells are sparse (only show on 1st and 15th), so we need to find the closest one
          const monthYearRow = timelineHeader.querySelector('.h-6.grid');
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
                  console.log(`🎯 Found month/year at index ${j}: ${text}`);
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
                  console.log(`🎯 Created date for cell ${i}: ${date.toISOString().split('T')[0]}`);
                  return date.toISOString().split('T')[0];
                }
              }
            }
          }
        }
      }
    }
    
    console.log('🎯 No visible day cell found');
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
      console.log(`🎯 Could not determine leftmost visible date from DOM`);
      return;
    }
    
    const currentLeftmostDate = leftmostVisibleDate;
    console.log(`🎯 Leftmost visible date from DOM: ${currentLeftmostDate}`);
    
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
        console.log('🎯 Scroll save skipped - user not logged in');
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
        
        console.log(`🎯 About to save scroll position - boardId: ${currentBoardId}, date: ${currentLeftmostDate}, userId: ${currentUser.id}`);
        console.log(`🎯 Scroll positions being saved:`, newScrollPositions);
        
        await saveUserPreferences({
          ...latestPreferences,
          ganttScrollPositions: newScrollPositions
        }, currentUser.id);
        
        console.log(`🎯 saveUserPreferences completed successfully`);
        
        // Verify what was actually saved to cookie
        const cookieName = `easy-kanban-user-prefs-${currentUser.id}`;
        const savedCookie = document.cookie.split(';').find(cookie => 
          cookie.trim().startsWith(`${cookieName}=`)
        );
        if (savedCookie) {
          const cookieData = JSON.parse(decodeURIComponent(savedCookie.split('=')[1]));
          console.log(`🎯 Cookie after save contains:`, cookieData.ganttScrollPositions?.[currentBoardId]);
          console.log(`🎯 Cookie save timestamp: ${new Date().toISOString()}`);
        }
        
        // Update tracking to prevent loops
        lastSavedScrollDateRef.current[currentBoardId] = currentLeftmostDate;
        setLastSavedScrollDate(currentLeftmostDate);
        
        console.log(`🎯 Scroll position saved for board ${currentBoardId}: ${currentLeftmostDate}`);
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
        console.log(`🎯 Loaded saved position for board ${currentBoardId}: ${savedPosition.date}`);
        return savedPosition.date;
      }
      
      console.log(`🎯 No saved position found for board ${currentBoardId}`);
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
      d.date.toISOString().split('T')[0] === targetDate.toISOString().split('T')[0]
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
    calculateScrollPosition
  };
};