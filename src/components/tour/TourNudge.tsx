import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useTour } from '../../contexts/TourContext';
import { useOwnerSetupOptional } from '../../contexts/OwnerSetupContext';

const TOUR_NUDGE_DISMISSED_KEY = 'tourNudgeDismissed';

/**
 * One-time dismissible banner inviting new users to take the product tour.
 * Dismissal is persisted in localStorage so it does not reappear.
 * Hidden while the owner Configuration guide is open so the two do not compete.
 */
const TourNudge: React.FC = () => {
  const { t } = useTranslation('common');
  const { startTour, isRunning } = useTour();
  const ownerSetup = useOwnerSetupOptional();
  const [visible, setVisible] = useState(false);

  const ownerGuideBlocking =
    Boolean(ownerSetup?.isOwner) &&
    Boolean(ownerSetup?.progress.visible) &&
    !ownerSetup?.coreComplete;

  useEffect(() => {
    try {
      if (localStorage.getItem(TOUR_NUDGE_DISMISSED_KEY) === 'true') {
        return;
      }
    } catch {
      return;
    }
    // Brief delay so the board can settle after login
    const timer = window.setTimeout(() => setVisible(true), 800);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isRunning) {
      setVisible(false);
    }
  }, [isRunning]);

  const dismiss = () => {
    try {
      localStorage.setItem(TOUR_NUDGE_DISMISSED_KEY, 'true');
    } catch {
      // ignore quota / private mode
    }
    setVisible(false);
  };

  const handleTakeTour = () => {
    dismiss();
    startTour();
  };

  if (!visible || isRunning || ownerGuideBlocking) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-[9000] max-w-sm w-[calc(100%-2rem)] rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 shadow-lg p-4"
      role="dialog"
      aria-labelledby="tour-nudge-title"
      aria-describedby="tour-nudge-desc"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3
            id="tour-nudge-title"
            className="text-sm font-semibold text-gray-900 dark:text-gray-100"
          >
            {t('tour.nudgeTitle')}
          </h3>
          <p
            id="tour-nudge-desc"
            className="mt-1 text-sm text-gray-600 dark:text-gray-300"
          >
            {t('tour.nudgeDescription')}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTakeTour}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              {t('tour.nudgeTakeTour')}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="px-3 py-1.5 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {t('tour.nudgeNotNow')}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          aria-label={t('tour.nudgeDismiss')}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default TourNudge;
