import { useEffect, useRef, useState, useCallback } from 'react';

interface UsePollingOptions {
  enabled?: boolean;
  interval?: number; // milliseconds
  onPoll?: () => Promise<void> | void;
  onError?: (error: Error) => void;
}

export function usePolling(options: UsePollingOptions = {}) {
  const { 
    enabled = true, 
    interval = 5000, // 5 seconds default
    onPoll, 
    onError 
  } = options;
  
  const [isPolling, setIsPolling] = useState(false);
  const [lastPollTime, setLastPollTime] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);
  
  // Track user activity for smart polling
  const [userActive, setUserActive] = useState(true);
  const lastActivityRef = useRef(Date.now());
  
  // Track tab visibility
  const [tabVisible, setTabVisible] = useState(!document.hidden);
  
  // Update activity timestamp
  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setUserActive(true);
  }, []);
  
  // Check if user has been inactive
  const checkUserActivity = useCallback(() => {
    const inactiveThreshold = 60000; // 1 minute
    const isActive = Date.now() - lastActivityRef.current < inactiveThreshold;
    setUserActive(isActive);
  }, []);
  
  // Set up activity tracking
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });
    
    // Check activity every 30 seconds
    const activityInterval = setInterval(checkUserActivity, 30000);
    
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity);
      });
      clearInterval(activityInterval);
    };
  }, [updateActivity, checkUserActivity]);
  
  // Track tab visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      setTabVisible(!document.hidden);
      if (!document.hidden) {
        updateActivity(); // User returned to tab
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [updateActivity]);
  
  // Polling function
  const poll = useCallback(async () => {
    if (isPollingRef.current || !onPoll) return;
    
    isPollingRef.current = true;
    setError(null);
    
    try {
      await onPoll();
      setLastPollTime(new Date());
    } catch (err) {
      const error = err as Error;
      console.error('Polling error:', error);
      setError(error.message);
      onError?.(error);
    } finally {
      isPollingRef.current = false;
    }
  }, [onPoll, onError]);
  
  // Calculate smart interval based on user activity and tab visibility
  const getSmartInterval = useCallback(() => {
    if (!tabVisible) return 30000; // 30 seconds when tab not visible
    if (!userActive) return 15000;  // 15 seconds when user inactive
    return interval; // Normal interval when active
  }, [tabVisible, userActive, interval]);
  
  // Main polling effect
  useEffect(() => {
    if (!enabled || !onPoll) {
      setIsPolling(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    
    setIsPolling(true);
    
    // Initial poll
    poll();
    
    // Set up interval with smart timing
    const startInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      
      intervalRef.current = setInterval(() => {
        poll();
        
        // Restart interval with new timing if needed
        const currentInterval = getSmartInterval();
        if (intervalRef.current && currentInterval !== interval) {
          startInterval();
        }
      }, getSmartInterval());
    };
    
    startInterval();
    
    return () => {
      setIsPolling(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, onPoll, poll, getSmartInterval, interval]);
  
  // Manual poll function
  const pollNow = useCallback(() => {
    if (enabled && onPoll) {
      poll();
    }
  }, [enabled, onPoll, poll]);
  
  return {
    isPolling,
    lastPollTime,
    error,
    userActive,
    tabVisible,
    pollNow,
    currentInterval: getSmartInterval()
  };
}
