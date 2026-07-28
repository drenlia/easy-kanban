import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import Joyride, { CallBackProps, STATUS } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { getTourSteps } from '../components/tour/TourSteps';
import { parseTaskRoute } from '../utils/routingUtils';
import { useTheme } from './ThemeContext';

interface TourContextType {
  isRunning: boolean;
  startTour: () => void;
  stopTour: () => void;
  isHelpModalOpen: boolean;
  setHelpModalOpen: (open: boolean) => void;
}

const TourContext = createContext<TourContextType | undefined>(undefined);

export const useTour = () => {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
};

interface TourProviderProps {
  children: React.ReactNode;
  currentUser: any;
  onViewModeChange?: (mode: 'kanban' | 'list' | 'gantt') => void;
  onPageChange?: (page: 'kanban' | 'admin' | 'reports') => void;
}

export const TourProvider: React.FC<TourProviderProps> = ({ children, currentUser, onViewModeChange, onPageChange }) => {
  const { t } = useTranslation('common');
  const { theme } = useTheme();
  const [isRunning, setIsRunning] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const { userSteps, adminSteps } = getTourSteps();

  const joyrideStyles = useMemo(() => {
    const isDark = theme === 'dark';
    return {
      options: {
        primaryColor: '#3b82f6',
        textColor: isDark ? '#f3f4f6' : '#1f2937',
        backgroundColor: isDark ? '#1f2937' : '#ffffff',
        overlayColor: isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.4)',
        arrowColor: isDark ? '#1f2937' : '#ffffff',
        zIndex: 10000,
      },
      tooltip: {
        borderRadius: 8,
        fontSize: 14,
        padding: 20,
      },
      tooltipContainer: {
        textAlign: 'left' as const,
      },
      tooltipTitle: {
        fontSize: 16,
        fontWeight: 600,
        marginBottom: 8,
      },
      tooltipContent: {
        padding: 0,
      },
      buttonNext: {
        backgroundColor: '#3b82f6',
        borderRadius: 6,
        color: '#ffffff',
        fontSize: 14,
        fontWeight: 500,
        padding: '8px 16px',
      },
      buttonBack: {
        color: isDark ? '#9ca3af' : '#6b7280',
        fontSize: 14,
        marginRight: 8,
      },
      buttonSkip: {
        color: isDark ? '#9ca3af' : '#6b7280',
        fontSize: 14,
      },
      buttonClose: {
        color: isDark ? '#9ca3af' : '#6b7280',
      },
      beacon: {
        inner: '#3b82f6',
        outer: '#3b82f6',
      },
    };
  }, [theme]);

  // Track previous step index to detect navigation direction
  const previousStepIndexRef = React.useRef<number>(-1);

  // Resume a tour after navigating to Kanban (from TaskPage / Admin / Reports)
  useEffect(() => {
    const startIfPending = () => {
      if (sessionStorage.getItem('pendingTourStart') !== 'true') return;

      const hash = window.location.hash.toLowerCase();
      const taskRoute = parseTaskRoute();
      // Wait until we are actually on the kanban route
      if (taskRoute.isTaskRoute || hash.includes('admin') || hash.includes('reports')) {
        return;
      }

      sessionStorage.removeItem('pendingTourStart');
      previousStepIndexRef.current = -1;
      if (onViewModeChange) {
        onViewModeChange('kanban');
      }
      setTimeout(() => {
        setIsRunning(true);
      }, 350);
    };

    startIfPending();
    window.addEventListener('hashchange', startIfPending);
    // Hash may already be #kanban after a sync navigate; retry shortly after paint
    const retry = window.setTimeout(startIfPending, 150);
    return () => {
      window.removeEventListener('hashchange', startIfPending);
      window.clearTimeout(retry);
    };
  }, [onViewModeChange]);

  const startTour = useCallback(() => {
    setIsHelpModalOpen(false); // Close help modal first
    previousStepIndexRef.current = -1; // Reset step index tracking

    const hash = window.location.hash.toLowerCase();
    const taskRoute = parseTaskRoute();
    const needsKanbanPage =
      taskRoute.isTaskRoute ||
      hash.includes('admin') ||
      hash.includes('reports');

    // Leave Task / Admin / Reports so step 1 targets exist on the Kanban page
    if (needsKanbanPage && onPageChange) {
      sessionStorage.setItem('pendingTourStart', 'true');
      onPageChange('kanban'); // also updates hash (incl. selected board)
      return;
    }

    // Already on Kanban page — still force Kanban view mode before step 1
    if (onViewModeChange) {
      onViewModeChange('kanban');
    }
    setTimeout(() => {
      setIsRunning(true);
    }, 200);
  }, [onViewModeChange, onPageChange]);

  const stopTour = useCallback(() => {
    setIsRunning(false);
  }, []);

  const setHelpModalOpen = useCallback((open: boolean) => {
    setIsHelpModalOpen(open);
  }, []);

  // Determine if user is admin
  const isAdmin = currentUser?.roles?.includes('admin') || currentUser?.role === 'admin';
  const steps = isAdmin ? adminSteps : userSteps;

  const handleJoyrideCallback = useCallback((data: CallBackProps) => {
    const { status, step, index, type, action } = data;
    
    // Determine if we're going forward or backward
    const isGoingForward = index > previousStepIndexRef.current;
    const isGoingBack = index < previousStepIndexRef.current;
    
    // Update previous step index
    previousStepIndexRef.current = index;
    
    // Switch to List view BEFORE reaching export-menu/column-visibility steps
    // Do this in step:before of the current step (help-button, step 14) so view is ready for next step
    if (type === 'step:before' && step && (isGoingForward || action === 'next')) {
      const nextStep = steps[index + 1];
      if (nextStep) {
        const nextStepData = nextStep as any;
        const nextNeedsListView = nextStepData.data?.switchToView === 'list' || 
                                 (nextStep.target === '[data-tour-id="export-menu"]' || nextStep.target === '[data-tour-id="column-visibility"]');
        
        if (nextNeedsListView && onViewModeChange) {
          const currentHash = window.location.hash;
          if (currentHash.includes('admin') && onPageChange) {
            onPageChange('kanban');
            setTimeout(() => {
              if (onViewModeChange) {
                onViewModeChange('list');
              }
            }, 300);
          } else {
            onViewModeChange('list');
          }
        }
      }
    }
    
    // Handle view/page switching based on step data - switch BEFORE showing the step
    // Only switch views/pages when going FORWARD, not when going back
    if (type === 'step:before' && step && (isGoingForward || action === 'next')) {
      const stepData = step as any;
      
      // Note: List view switching is handled above in the first step:before handler
      // This section only handles admin page switching and other view/page switches
      
      // Switch to Admin panel for admin-tab step and all subsequent admin steps
      if (stepData.data?.switchToPage === 'admin' && onPageChange && isAdmin) {
        onPageChange('admin');
      }
      
      // Also check if we're on an admin step by target (for steps after admin-tab)
      if (step.target && typeof step.target === 'string' && step.target.startsWith('[data-tour-id="admin-') && onPageChange && isAdmin) {
        // Check if we're already on admin page, if not, switch
        const currentHash = window.location.hash;
        if (!currentHash.includes('admin')) {
          onPageChange('admin');
        }
        
        // Extract tab name from data-tour-id and switch to that tab
        // Format: [data-tour-id="admin-users"] -> "users"
        // Format: [data-tour-id="admin-site-settings"] -> "site-settings"
        const tabMatch = step.target.match(/admin-([^"]+)/);
        if (tabMatch && tabMatch[1]) {
          const tabName = tabMatch[1];
          const currentHash = window.location.hash;
          const expectedHash = `#admin#${tabName}`;
          
          // Only switch if we're not already on this tab
          if (!currentHash.includes(`#${tabName}`) || currentHash !== expectedHash) {
            // Update URL hash to trigger tab switch in Admin component
            window.location.hash = `admin#${tabName}`;
          }
        }
      }
    }
    
    // Handle errors - if target not found, let react-joyride handle it
    if (type === 'error' && step) {
      // Don't return here - let react-joyride handle it
    }
    
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      stopTour();
      previousStepIndexRef.current = -1; // Reset on tour end
    }
  }, [stopTour, onViewModeChange, onPageChange, isAdmin, steps]);

  return (
    <TourContext.Provider
      value={{
        isRunning,
        startTour,
        stopTour,
        isHelpModalOpen,
        setHelpModalOpen,
      }}
    >
      {children}
      <Joyride
        steps={steps}
        run={isRunning}
        continuous={true}
        showProgress={true}
        showSkipButton={true}
        callback={handleJoyrideCallback}
        scrollToFirstStep={true}
        scrollOffset={150}
        disableOverlayClose={true}
        hideCloseButton={false}
        disableScrolling={false}
        disableScrollParentFix={false}
        disableOverlay={false}
        spotlightClicks={true}
        styles={joyrideStyles}
        locale={{
          back: t('tour.back'),
          close: t('tour.close'),
          last: t('tour.last'),
          next: t('tour.next'),
          skip: t('tour.skip'),
          nextLabelWithProgress: t('tour.nextWithProgress'),
        }}
      />
    </TourContext.Provider>
  );
};
