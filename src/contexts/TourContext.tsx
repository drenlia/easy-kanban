import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import Joyride, { CallBackProps, STATUS } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { getTourSteps } from '../components/tour/TourSteps';
import { parseTaskRoute } from '../utils/routingUtils';

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
  const [isRunning, setIsRunning] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const { userSteps, adminSteps } = getTourSteps();

  // Track previous step index to detect navigation direction
  const previousStepIndexRef = React.useRef<number>(-1);

  // Check for pending tour start after navigation (e.g., from TaskPage)
  useEffect(() => {
    const pendingTour = sessionStorage.getItem('pendingTourStart');
    if (pendingTour === 'true') {
      sessionStorage.removeItem('pendingTourStart');
      previousStepIndexRef.current = -1; // Reset step index tracking
      // Switch to Kanban view before starting tour
      if (onViewModeChange) {
        onViewModeChange('kanban');
      }
      // Wait for view to update, then start tour
      setTimeout(() => {
        setIsRunning(true);
      }, 300);
    }
  }, [onViewModeChange]);

  const startTour = useCallback(() => {
    setIsHelpModalOpen(false); // Close help modal first
    previousStepIndexRef.current = -1; // Reset step index tracking
    
    // Check if we're on TaskPage and redirect to Kanban
    const taskRoute = parseTaskRoute();
    if (taskRoute.isTaskRoute && onPageChange) {
      // Store intent to start tour after navigation
      sessionStorage.setItem('pendingTourStart', 'true');
      onPageChange('kanban');
      // Update URL hash to kanban
      window.location.hash = '#kanban';
      // Don't set isRunning here - it will be set after navigation completes
      return;
    }
    
    // Check if we're on Admin page and redirect to Kanban
    const currentHash = window.location.hash;
    if (currentHash.includes('admin') && onPageChange) {
      // Store intent to start tour after navigation
      sessionStorage.setItem('pendingTourStart', 'true');
      onPageChange('kanban');
      // Update URL hash to kanban
      window.location.hash = '#kanban';
      // Don't set isRunning here - it will be set after navigation completes
      return;
    }
    
    // Switch to Kanban view before starting tour (for first step)
    if (onViewModeChange) {
      onViewModeChange('kanban');
    }
    // Small delay to ensure view updates before tour starts
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
        styles={{
          options: {
            primaryColor: '#3b82f6',
            textColor: '#1f2937',
            backgroundColor: '#ffffff',
            overlayColor: 'rgba(0, 0, 0, 0.4)',
            arrowColor: '#ffffff',
            zIndex: 10000,
          },
          tooltip: {
            borderRadius: 8,
            fontSize: 14,
            padding: 20,
          },
          tooltipContainer: {
            textAlign: 'left',
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
            color: '#6b7280',
            fontSize: 14,
            marginRight: 8,
          },
          buttonSkip: {
            color: '#6b7280',
            fontSize: 14,
          },
          beacon: {
            inner: '#3b82f6',
            outer: '#3b82f6',
          },
        }}
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
