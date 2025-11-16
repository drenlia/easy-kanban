import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';

interface ReadinessCheckerProps {
  children: React.ReactNode;
}

/**
 * ReadinessChecker component that waits for the backend to be ready
 * before rendering the app. This prevents errors when the app tries to
 * connect to endpoints that aren't ready yet after a refresh/deployment.
 */
export default function ReadinessChecker({ children }: ReadinessCheckerProps) {
  const { t } = useTranslation('common');
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isErrorDismissed, setIsErrorDismissed] = useState(false);
  const [checkCount, setCheckCount] = useState(0);
  const maxChecks = 15; // Maximum 15 checks (30 seconds at 2s intervals)

  useEffect(() => {
    // Check if we're in development mode - skip readiness check
    // In dev mode, vite dev server handles this differently
    if (import.meta.env.DEV) {
      setIsReady(true);
      return;
    }

    // Only run readiness check if a version update was detected and user refreshed
    // Check for flag set before refresh
    const pendingVersionRefresh = sessionStorage.getItem('pendingVersionRefresh');
    if (!pendingVersionRefresh || pendingVersionRefresh !== 'true') {
      // No version update pending, skip readiness check
      setIsReady(true);
      return;
    }

    // Clear the flag immediately so it doesn't run again on subsequent loads
    sessionStorage.removeItem('pendingVersionRefresh');

    let isMounted = true;
    let checkInterval: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const checkReadiness = async () => {
      try {
        // Create abort controller for timeout (more compatible than AbortSignal.timeout)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch('/api/ready', {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          // Short timeout to fail fast
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!isMounted) return;

        if (response.ok) {
          const data = await response.json();
          if (data.status === 'ready') {
            console.log('✅ Server is ready');
            setIsReady(true);
            setError(null);
            if (checkInterval) {
              clearInterval(checkInterval);
            }
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            return;
          }
        }

        // If not ready, increment check count
        setCheckCount(prev => {
          const newCount = prev + 1;
          if (newCount >= maxChecks) {
            // Max checks reached - show error but allow app to continue
            setError(t('readiness.serverTakingLonger'));
            setIsReady(true); // Allow app to continue anyway
            if (checkInterval) {
              clearInterval(checkInterval);
            }
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
          }
          return newCount;
        });
      } catch (err: any) {
        if (!isMounted) return;

        // Network errors are expected during startup
        if (err.name === 'AbortError' || err.name === 'TimeoutError') {
          console.log('⏳ Server not ready yet, waiting...');
        } else {
          console.warn('⚠️ Readiness check error:', err);
        }

        setCheckCount(prev => {
          const newCount = prev + 1;
          // After many failed checks, allow app to continue
          if (newCount >= maxChecks) {
            setError(t('readiness.unableToVerify'));
            setIsReady(true);
            if (checkInterval) {
              clearInterval(checkInterval);
            }
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
          }
          return newCount;
        });
      }
    };

    // Start checking immediately
    checkReadiness();

    // Then check every 2 seconds
    checkInterval = setInterval(checkReadiness, 2000);

    // Timeout after 30 seconds
    timeoutId = setTimeout(() => {
      if (!isMounted) return;
      console.warn('⏱️ Readiness check timeout - allowing app to continue');
      setError(t('readiness.timeout'));
      setIsReady(true);
      if (checkInterval) {
        clearInterval(checkInterval);
      }
    }, 30000); // 30 seconds

    return () => {
      isMounted = false;
      if (checkInterval) {
        clearInterval(checkInterval);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  // In development, skip the readiness check
  if (import.meta.env.DEV || isReady) {
    return (
      <>
        {children}
        {error && !isErrorDismissed && (
          <div className="fixed bottom-4 right-4 bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded shadow-lg z-50 max-w-md dark:bg-yellow-900 dark:border-yellow-700 dark:text-yellow-200">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="font-semibold">{t('readiness.warning')}</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
              <button
                onClick={() => setIsErrorDismissed(true)}
                className="flex-shrink-0 text-yellow-600 hover:text-yellow-800 dark:text-yellow-300 dark:hover:text-yellow-100 transition-colors"
                title={t('readiness.dismiss')}
                aria-label={t('readiness.dismiss')}
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Show loading screen while waiting for readiness
  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 flex items-center justify-center z-50">
      <div className="text-center">
        <LoadingSpinner size="large" />
        <p className="mt-4 text-gray-600 dark:text-gray-400 text-lg">
          {t('readiness.waitingForServer')}
        </p>
        <p className="mt-2 text-gray-500 dark:text-gray-500 text-sm">
          {t('readiness.mayTakeMoment')}
        </p>
        {checkCount > 0 && (
          <p className="mt-2 text-gray-400 dark:text-gray-600 text-xs">
            {t('readiness.checking', { current: checkCount, total: maxChecks })}
          </p>
        )}
      </div>
    </div>
  );
}

