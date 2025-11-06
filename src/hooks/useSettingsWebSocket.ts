import { useCallback } from 'react';
import { getAllTags, getAllPriorities, getSettings } from '../api';
import { versionDetection } from '../utils/versionDetection';

interface UseSettingsWebSocketProps {
  // State setters
  setAvailableTags: React.Dispatch<React.SetStateAction<any[]>>;
  setAvailablePriorities: React.Dispatch<React.SetStateAction<any[]>>;
  setSiteSettings: React.Dispatch<React.SetStateAction<any>>;
  
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
  setSiteSettings,
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
    try {
      const priorities = await getAllPriorities();
      setAvailablePriorities(priorities);
      console.log('📨 Priorities refreshed after deletion');
    } catch (error) {
      console.error('Failed to refresh priorities after deletion:', error);
    }
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

  const handleSettingsUpdated = useCallback(async (data: any) => {
    try {
      // Update the specific setting directly from WebSocket data instead of fetching all settings
      if (data.key && data.value !== undefined) {
        setSiteSettings(prev => ({
          ...prev,
          [data.key]: data.value
        }));
      } else {
        // Fallback to fetching all settings if WebSocket data is incomplete
        const settings = await getSettings();
        setSiteSettings(settings);
        console.log('📨 Settings refreshed after update');
      }
    } catch (error) {
      console.error('Failed to refresh settings after update:', error);
    }
  }, [setSiteSettings]);

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
      versionDetection.checkVersion(data.version);
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
    handleSettingsUpdated,
    handleInstanceStatusUpdated,
    handleVersionUpdated,
  };
};

