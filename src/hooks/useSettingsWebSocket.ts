import { useCallback } from 'react';
import { getAllTags, getAllPriorities, getAllSprints, getSettings } from '../api';
import { versionDetection } from '../utils/versionDetection';

interface UseSettingsWebSocketProps {
  // State setters
  setAvailableTags: React.Dispatch<React.SetStateAction<any[]>>;
  setAvailablePriorities: React.Dispatch<React.SetStateAction<any[]>>;
  setAvailableSprints?: React.Dispatch<React.SetStateAction<any[]>>; // Optional: sprints state setter
  setSiteSettings?: React.Dispatch<React.SetStateAction<any>>; // Optional: SettingsContext now handles settings updates
  
  // Version status hook
  versionStatus: {
    setInstanceStatus: (status: { status: string; message: string; isDismissed: boolean }) => void;
  };
}

const getStatusMessage = (status: string) => {
  switch (status) {
    case 'active':
      return 'This instance is running normally.';
    case 'suspended':
      return 'This instance has been temporarily suspended. Please contact support for assistance.';
    case 'terminated':
      return 'This instance has been terminated. Please contact support for assistance.';
    case 'failed':
      return 'This instance has failed. Please contact support for assistance.';
    case 'deploying':
      return 'This instance is currently being deployed. Please try again in a few minutes.';
    default:
      return 'This instance is currently unavailable. Please contact support.';
  }
};

export const useSettingsWebSocket = ({
  setAvailableTags,
  setAvailablePriorities,
  setAvailableSprints,
  setSiteSettings, // Optional - SettingsContext handles settings updates
  versionStatus,
}: UseSettingsWebSocketProps) => {
  
  const handleTagCreated = useCallback(async (data: any) => {
    console.log('📨 Tag created via WebSocket:', data);
    try {
      const tags = await getAllTags();
      setAvailableTags(tags);
      console.log('📨 Tags refreshed after creation');
    } catch (error) {
      console.error('Failed to refresh tags after creation:', error);
    }
  }, [setAvailableTags]);

  const handleTagUpdated = useCallback(async (data: any) => {
    console.log('📨 Tag updated via WebSocket:', data);
    try {
      const tags = await getAllTags();
      setAvailableTags(tags);
      console.log('📨 Tags refreshed after update');
    } catch (error) {
      console.error('Failed to refresh tags after update:', error);
    }
  }, [setAvailableTags]);

  const handleTagDeleted = useCallback(async (data: any) => {
    console.log('📨 Tag deleted via WebSocket:', data);
    try {
      const tags = await getAllTags();
      setAvailableTags(tags);
      console.log('📨 Tags refreshed after deletion');
    } catch (error) {
      console.error('Failed to refresh tags after deletion:', error);
    }
  }, [setAvailableTags]);

  const handlePriorityCreated = useCallback(async (data: any) => {
    console.log('📨 Priority created via WebSocket:', data);
    try {
      const priorities = await getAllPriorities();
      setAvailablePriorities(priorities);
      console.log('📨 Priorities refreshed after creation');
    } catch (error) {
      console.error('Failed to refresh priorities after creation:', error);
    }
  }, [setAvailablePriorities]);

  const handlePriorityUpdated = useCallback(async (data: any) => {
    console.log('📨 Priority updated via WebSocket:', data);
    try {
      const priorities = await getAllPriorities();
      setAvailablePriorities(priorities);
      console.log('📨 Priorities refreshed after update');
    } catch (error) {
      console.error('Failed to refresh priorities after update:', error);
    }
  }, [setAvailablePriorities]);

  const handlePriorityDeleted = useCallback(async (data: any) => {
    console.log('📨 Priority deleted via WebSocket:', data);
    // Remove the deleted priority from availablePriorities list
    // This ensures TaskCard won't find the deleted priority when looking up by priorityId
    // The task-updated events (published separately) will update all affected tasks with the new priority
    setAvailablePriorities(prevPriorities => 
      prevPriorities.filter(p => p.id !== data.priorityId && p.id !== Number(data.priorityId))
    );
    console.log('📨 Priority removed from availablePriorities (affected tasks will be updated via task-updated events)');
  }, [setAvailablePriorities]);

  const handlePriorityReordered = useCallback(async (data: any) => {
    console.log('📨 Priority reordered via WebSocket:', data);
    try {
      const priorities = await getAllPriorities();
      setAvailablePriorities(priorities);
      console.log('📨 Priorities refreshed after reorder');
    } catch (error) {
      console.error('Failed to refresh priorities after reorder:', error);
    }
  }, [setAvailablePriorities]);

  const handleSprintCreated = useCallback(async (data: any) => {
    console.log('📨 Sprint created via WebSocket:', data);
    if (setAvailableSprints) {
      try {
        const sprints = await getAllSprints();
        setAvailableSprints(sprints);
        console.log('📨 Sprints refreshed after creation');
      } catch (error) {
        console.error('Failed to refresh sprints after creation:', error);
      }
    }
  }, [setAvailableSprints]);

  const handleSprintUpdated = useCallback(async (data: any) => {
    console.log('📨 Sprint updated via WebSocket:', data);
    if (setAvailableSprints) {
      try {
        const sprints = await getAllSprints();
        setAvailableSprints(sprints);
        console.log('📨 Sprints refreshed after update');
      } catch (error) {
        console.error('Failed to refresh sprints after update:', error);
      }
    }
  }, [setAvailableSprints]);

  const handleSprintDeleted = useCallback(async (data: any) => {
    console.log('📨 Sprint deleted via WebSocket:', data);
    if (setAvailableSprints) {
      try {
        const sprints = await getAllSprints();
        setAvailableSprints(sprints);
        console.log('📨 Sprints refreshed after deletion');
      } catch (error) {
        console.error('Failed to refresh sprints after deletion:', error);
      }
    }
  }, [setAvailableSprints]);

  const handleSettingsUpdated = useCallback(async (data: any) => {
    // Settings are now updated via SettingsContext which listens to WebSocket events
    // This handler is kept for backwards compatibility but SettingsContext handles the actual updates
    console.log('📨 [useSettingsWebSocket] Settings update received (handled by SettingsContext):', data);
  }, []);

  const handleInstanceStatusUpdated = useCallback((data: any) => {
    console.log('📨 Instance status updated via WebSocket:', data);
    versionStatus.setInstanceStatus({
      status: data.status,
      message: getStatusMessage(data.status),
      isDismissed: false
    });
  }, [versionStatus.setInstanceStatus]);

  const handleVersionUpdated = useCallback((data: any) => {
    console.log('📦 Version updated via WebSocket:', data);
    if (data.version) {
      // Pass isFromWebSocket=true so new sessions can detect new versions
      versionDetection.checkVersion(data.version, true);
    }
  }, []);

  return {
    handleTagCreated,
    handleTagUpdated,
    handleTagDeleted,
    handlePriorityCreated,
    handlePriorityUpdated,
    handlePriorityDeleted,
    handlePriorityReordered,
    handleSprintCreated,
    handleSprintUpdated,
    handleSprintDeleted,
    handleSettingsUpdated,
    handleInstanceStatusUpdated,
    handleVersionUpdated,
  };
};

