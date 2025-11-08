import { useCallback, useEffect, useState } from 'react';
import Joyride, { CallBackProps, STATUS } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { getTourSteps } from './TourSteps';

interface TourProviderProps {
  children: React.ReactNode;
  currentUser: any; // CurrentUser type from your app
}

const TourProvider: React.FC<TourProviderProps> = ({ children, currentUser }) => {
  console.log('TourProvider: Component mounting/rendering');
  const { t } = useTranslation('common');
  const [isRunning, setIsRunning] = useState(false);
  const { userSteps, adminSteps } = getTourSteps();

  console.log('TourProvider: isRunning =', isRunning, 'currentUser =', currentUser);

  // Expose startTour function globally for the help modal
  useEffect(() => {
    console.log('TourProvider: Setting up global startTour function');
    (window as any).startTour = () => {
      console.log('Global startTour called');
      setIsRunning(true);
    };
    console.log('TourProvider: Global startTour function set');
  }, []);

  // Determine if user is admin
  const isAdmin = currentUser?.roles?.includes('admin') || currentUser?.role === 'admin';
  const steps = isAdmin ? adminSteps : userSteps;
  
  console.log('TourProvider: isAdmin =', isAdmin, 'steps count =', steps.length);

  useEffect(() => {
    console.log('TourProvider: isRunning changed to', isRunning);
  }, [isRunning]);

  const stopTour = useCallback(() => {
    console.log('Stopping tour');
    setIsRunning(false);
  }, []);

  const handleJoyrideCallback = useCallback((data: CallBackProps) => {
    console.log('Joyride callback:', data);
    const { status } = data;
    
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      stopTour();
    }
  }, [stopTour]);

  console.log('TourProvider: Rendering Joyride with run =', isRunning, 'steps =', steps.length);

  return (
    <>
      {children}
      <Joyride
        steps={steps}
        run={isRunning}
        continuous={true}
        showProgress={true}
        showSkipButton={true}
        callback={handleJoyrideCallback}
        styles={{
          options: {
            primaryColor: '#3b82f6', // Blue-500
            textColor: '#1f2937', // Gray-800
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
        }}
      />
    </>
  );
};

export default TourProvider;
