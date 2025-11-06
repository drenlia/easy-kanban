import { useCallback } from 'react';
import { TeamMember, SavedFilterView } from '../types';
import { getMembers, getCurrentUser } from '../api';

interface UseMemberWebSocketProps {
  // State setters
  setMembers: React.Dispatch<React.SetStateAction<TeamMember[]>>;
  setCurrentUser: React.Dispatch<React.SetStateAction<any>>;
  
  // Callbacks
  handleMembersUpdate: (newMembers: TeamMember[]) => void;
  handleActivitiesUpdate: (newActivities: any[]) => void;
  handleSharedFilterViewsUpdate: (newFilters: SavedFilterView[]) => void;
  
  // Task filters hook
  taskFilters: {
    includeSystem: boolean;
    setSharedFilterViews: React.Dispatch<React.SetStateAction<SavedFilterView[]>>;
  };
  
  // Current user
  currentUser: { id: string } | null | undefined;
}

export const useMemberWebSocket = ({
  setMembers,
  setCurrentUser,
  handleMembersUpdate,
  handleActivitiesUpdate,
  handleSharedFilterViewsUpdate,
  taskFilters,
  currentUser,
}: UseMemberWebSocketProps) => {
  
  const handleMemberCreated = useCallback((data: any) => {
    // Refresh members list
    handleMembersUpdate([data.member]);
  }, [handleMembersUpdate]);

  const handleMemberUpdated = useCallback(async (data: any) => {
    // Update the specific member in the members list
    if (data.member) {
      setMembers(prevMembers => {
        // Check if member exists in current list
        const memberExists = prevMembers.some(member => member.id === data.member.id);
        
        if (memberExists) {
          // Update existing member
          return prevMembers.map(member => 
            member.id === data.member.id ? { ...member, ...data.member } : member
          );
        } else {
          // Member doesn't exist, add it to the list
          console.log('📨 Adding new member to list:', data.member);
          return [...prevMembers, data.member];
        }
      });
    } else {
      // Fallback: refresh entire members list
      try {
        const loadedMembers = await getMembers(taskFilters.includeSystem);
        setMembers(loadedMembers);
      } catch (error) {
        console.error('Failed to refresh members after update:', error);
      }
    }
  }, [setMembers, taskFilters.includeSystem]);

  const handleMemberDeleted = useCallback(async (data: any) => {
    // Refresh members list from server (don't pass empty array!)
    try {
      const loadedMembers = await getMembers(taskFilters.includeSystem);
      setMembers(loadedMembers);
    } catch (error) {
      console.error('Failed to refresh members after deletion:', error);
    }
  }, [taskFilters.includeSystem, setMembers]);

  const handleUserProfileUpdated = useCallback(async (data: any) => {
    // If this is the current user's profile update, refresh currentUser
    if (data.userId === currentUser?.id) {
      try {
        const response = await getCurrentUser();
        setCurrentUser(response.user);
      } catch (error) {
        console.error('Failed to refresh current user after profile update:', error);
      }
    }
    
    // Refresh members list to update display name and avatar
    try {
      const loadedMembers = await getMembers(taskFilters.includeSystem);
      setMembers(loadedMembers);
    } catch (error) {
      console.error('Failed to refresh members after profile update:', error);
    }
  }, [currentUser?.id, taskFilters.includeSystem, setCurrentUser, setMembers]);

  const handleActivityUpdated = useCallback((data: any) => {
    // Refresh activity feed
    handleActivitiesUpdate(data.activities || []);
  }, [handleActivitiesUpdate]);

  const handleFilterCreated = useCallback((data: any) => {
    // Refresh shared filters list
    if (data.filter && data.filter.shared) {
      handleSharedFilterViewsUpdate([data.filter]);
    }
  }, [handleSharedFilterViewsUpdate]);

  const handleFilterUpdated = useCallback((data: any) => {
    // Handle filter sharing/unsharing
    if (data.filter) {
      if (data.filter.shared) {
        // Filter was shared or updated - add/update it
        handleSharedFilterViewsUpdate([data.filter]);
      } else {
        // Filter was unshared - remove it from the list
        taskFilters.setSharedFilterViews(prev => prev.filter(f => f.id !== data.filter.id));
      }
    }
  }, [handleSharedFilterViewsUpdate, taskFilters.setSharedFilterViews]);

  const handleFilterDeleted = useCallback((data: any) => {
    console.log('📨 Filter deleted via WebSocket:', data);
    // Remove from shared filters list
    if (data.filterId) {
      const filterIdToDelete = parseInt(data.filterId, 10);
      taskFilters.setSharedFilterViews(prev => prev.filter(f => f.id !== filterIdToDelete));
    }
  }, [taskFilters.setSharedFilterViews]);

  return {
    handleMemberCreated,
    handleMemberUpdated,
    handleMemberDeleted,
    handleUserProfileUpdated,
    handleActivityUpdated,
    handleFilterCreated,
    handleFilterUpdated,
    handleFilterDeleted,
  };
};

