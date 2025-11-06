/**
 * Hook for managing activity feed state and handlers
 */

import { useState } from 'react';
import { updateActivityFeedPreference } from '../utils/userPreferences';

export interface UseActivityFeedReturn {
  // State
  showActivityFeed: boolean;
  activityFeedMinimized: boolean;
  activityFeedPosition: { x: number; y: number };
  activityFeedDimensions: { width: number; height: number };
  activities: any[];
  lastSeenActivityId: number;
  clearActivityId: number;
  
  // Setters
  setShowActivityFeed: (enabled: boolean) => void;
  setActivityFeedMinimized: (minimized: boolean) => void;
  setActivityFeedPosition: (position: { x: number; y: number }) => void;
  setActivityFeedDimensions: (dimensions: { width: number; height: number }) => void;
  setActivities: (activities: any[]) => void;
  setLastSeenActivityId: (activityId: number) => void;
  setClearActivityId: (activityId: number) => void;
  
  // Handlers
  handleActivityFeedToggle: (enabled: boolean) => void;
  handleActivityFeedMinimizedChange: (minimized: boolean) => void;
  handleActivityFeedMarkAsRead: (activityId: number) => Promise<void>;
  handleActivityFeedClearAll: (activityId: number) => Promise<void>;
}

export const useActivityFeed = (currentUserId: string | null): UseActivityFeedReturn => {
  const [showActivityFeed, setShowActivityFeed] = useState<boolean>(false);
  const [activityFeedMinimized, setActivityFeedMinimized] = useState<boolean>(false);
  const [activityFeedPosition, setActivityFeedPosition] = useState<{ x: number; y: number }>({ 
    x: 10, // Position on left side with 10px margin (matches userPreferences.ts default)
    y: 66 
  });
  const [activityFeedDimensions, setActivityFeedDimensions] = useState<{ width: number; height: number }>({
    width: 208,
    height: typeof window !== 'undefined' ? window.innerHeight - 200 : 400
  });
  const [activities, setActivities] = useState<any[]>([]);
  const [lastSeenActivityId, setLastSeenActivityId] = useState<number>(0);
  const [clearActivityId, setClearActivityId] = useState<number>(0);

  // Activity feed toggle handler
  const handleActivityFeedToggle = (enabled: boolean) => {
    setShowActivityFeed(enabled);
  };

  // Activity feed minimized state handler
  const handleActivityFeedMinimizedChange = (minimized: boolean) => {
    setActivityFeedMinimized(minimized);
  };

  // Activity feed mark as read handler
  const handleActivityFeedMarkAsRead = async (activityId: number) => {
    try {
      await updateActivityFeedPreference('lastSeenActivityId', activityId, currentUserId);
      setLastSeenActivityId(activityId);
    } catch (error) {
      // console.error('Failed to mark activities as read:', error);
    }
  };

  // Activity feed clear all handler
  const handleActivityFeedClearAll = async (activityId: number) => {
    try {
      // Set both clear point and read point to the same value
      // This ensures new activities after clear will show as unread
      await updateActivityFeedPreference('clearActivityId', activityId, currentUserId);
      await updateActivityFeedPreference('lastSeenActivityId', activityId, currentUserId);
      setClearActivityId(activityId);
      setLastSeenActivityId(activityId);
    } catch (error) {
      // console.error('Failed to clear activities:', error);
    }
  };

  return {
    // State
    showActivityFeed,
    activityFeedMinimized,
    activityFeedPosition,
    activityFeedDimensions,
    activities,
    lastSeenActivityId,
    clearActivityId,
    
    // Setters
    setShowActivityFeed,
    setActivityFeedMinimized,
    setActivityFeedPosition,
    setActivityFeedDimensions,
    setActivities,
    setLastSeenActivityId,
    setClearActivityId,
    
    // Handlers
    handleActivityFeedToggle,
    handleActivityFeedMinimizedChange,
    handleActivityFeedMarkAsRead,
    handleActivityFeedClearAll,
  };
};

