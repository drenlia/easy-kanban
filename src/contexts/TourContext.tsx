import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import Joyride, { CallBackProps, STATUS } from 'react-joyride';
import { getTourSteps } from '../components/tour/TourSteps';

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
}

export const TourProvider: React.FC<TourProviderProps> = ({ children, currentUser }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const { userSteps, adminSteps } = getTourSteps();

  const startTour = useCallback(() => {
    console.log('TourContext: startTour called, setting isRunning to true');
    setIsHelpModalOpen(false); // Close help modal first
    setIsRunning(true);
    console.log('TourContext: isRunning set to true');
  }, []);

  const stopTour = useCallback(() => {
    console.log('Stopping tour');
    setIsRunning(false);
  }, []);

  const setHelpModalOpen = useCallback((open: boolean) => {
    setIsHelpModalOpen(open);
  }, []);

  // Determine if user is admin
  const isAdmin = currentUser?.roles?.includes('admin') || currentUser?.role === 'admin';
  const steps = isAdmin ? adminSteps : userSteps;

  console.log('TourProvider: isRunning =', isRunning, 'isAdmin =', isAdmin, 'steps =', steps.length);

  const handleJoyrideCallback = useCallback((data: CallBackProps) => {
    console.log('Joyride callback:', data);
    const { status, action, index, type, step } = data;
    
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      stopTour();
    }
  }, [stopTour]);

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
          back: 'Back',
          close: 'Close',
          last: 'Finish Tour',
          next: 'Next',
          skip: 'Skip Tour',
        }}
      />
    </TourContext.Provider>
  );
};
