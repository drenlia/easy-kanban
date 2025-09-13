import { useState, useEffect } from 'react';
import { Board, TeamMember, Columns, SiteSettings, PriorityOption } from '../types';
import { POLLING_INTERVAL } from '../constants';
import * as api from '../api';
import { getAllPriorities, getActivityFeed, getSharedFilterViews, SavedFilterView, getBoardTaskRelationships } from '../api';

interface ActivityItem {
  id: number;
  action: string;
  details: string;
  member_name: string;
  role_name: string;
  board_title: string;
  column_title: string;
  taskId: string;
  created_at: string;
}

interface TaskRelationship {
  id: number;
  task_id: string;
  relationship: string;
  to_task_id: string;
  created_at: string;
}

export interface UserStatus {
  isActive: boolean;
  isAdmin: boolean;
  forceLogout: boolean;
}

interface UseDataPollingProps {
  enabled: boolean;
  selectedBoard: string | null;
  currentBoards: Board[];
  currentMembers: TeamMember[];
  currentColumns: Columns;
  currentSiteSettings: SiteSettings;
  currentPriorities: PriorityOption[];
  currentActivities?: ActivityItem[];
  currentSharedFilters?: SavedFilterView[];
  currentRelationships?: TaskRelationship[];
  includeSystem: boolean;
  onBoardsUpdate: (boards: Board[]) => void;
  onMembersUpdate: (members: TeamMember[]) => void;
  onColumnsUpdate: (columns: Columns) => void;
  onSiteSettingsUpdate: (settings: SiteSettings) => void;
  onPrioritiesUpdate: (priorities: PriorityOption[]) => void;
  onActivitiesUpdate?: (activities: ActivityItem[]) => void;
  onSharedFiltersUpdate?: (sharedFilters: SavedFilterView[]) => void;
  onRelationshipsUpdate?: (relationships: TaskRelationship[]) => void;
}

interface UseDataPollingReturn {
  isPolling: boolean;
  lastPollTime: Date | null;
}

export const useDataPolling = ({
  enabled,
  selectedBoard,
  currentBoards,
  currentMembers,
  currentColumns,
  currentSiteSettings,
  currentPriorities,
  currentActivities = [],
  currentSharedFilters = [],
  currentRelationships = [],
  includeSystem,
  onBoardsUpdate,
  onMembersUpdate,
  onColumnsUpdate,
  onSiteSettingsUpdate,
  onPrioritiesUpdate,
  onActivitiesUpdate,
  onSharedFiltersUpdate,
  onRelationshipsUpdate,
}: UseDataPollingProps): UseDataPollingReturn => {
  const [isPolling, setIsPolling] = useState(false);
  const [lastPollTime, setLastPollTime] = useState<Date | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);

    const pollForUpdates = async () => {
      try {
        const [loadedBoards, loadedMembers, loadedSiteSettings, loadedPriorities, loadedActivities, loadedSharedFilters, loadedRelationships] = await Promise.all([
          api.getBoards(),
          api.getMembers(includeSystem), // Use current includeSystem state
          api.getPublicSettings(),
          getAllPriorities(),
          onActivitiesUpdate ? getActivityFeed(20) : Promise.resolve([]),
          onSharedFiltersUpdate ? getSharedFilterViews() : Promise.resolve([]),
          onRelationshipsUpdate && selectedBoard ? getBoardTaskRelationships(selectedBoard) : Promise.resolve([])
        ]);

        // Update boards list if it changed
        const currentBoardsString = JSON.stringify(currentBoards);
        const newBoardsString = JSON.stringify(loadedBoards);

        if (currentBoardsString !== newBoardsString) {
          onBoardsUpdate(loadedBoards);
        }

        // Update members list if it changed
        const currentMembersString = JSON.stringify(currentMembers);
        const newMembersString = JSON.stringify(loadedMembers);

        if (currentMembersString !== newMembersString) {
          onMembersUpdate(loadedMembers);
        }

        // Update site settings if they changed
        const currentSiteSettingsString = JSON.stringify(currentSiteSettings);
        const newSiteSettingsString = JSON.stringify(loadedSiteSettings);

        if (currentSiteSettingsString !== newSiteSettingsString) {
          onSiteSettingsUpdate(loadedSiteSettings);
        }

        // Update priorities if they changed
        const currentPrioritiesString = JSON.stringify(currentPriorities);
        const newPrioritiesString = JSON.stringify(loadedPriorities);

        if (currentPrioritiesString !== newPrioritiesString) {
          onPrioritiesUpdate(loadedPriorities || []);
        }

        // Update activities if they changed
        if (onActivitiesUpdate && loadedActivities) {
          const currentActivitiesString = JSON.stringify(currentActivities);
          const newActivitiesString = JSON.stringify(loadedActivities);

          if (currentActivitiesString !== newActivitiesString) {
            onActivitiesUpdate(loadedActivities);
          }
        }

        // Update shared filters if they changed
        if (onSharedFiltersUpdate && loadedSharedFilters) {
          const currentSharedFiltersString = JSON.stringify(currentSharedFilters);
          const newSharedFiltersString = JSON.stringify(loadedSharedFilters);

          if (currentSharedFiltersString !== newSharedFiltersString) {
            onSharedFiltersUpdate(loadedSharedFilters);
          }
        }

        // Update relationships if they changed
        if (onRelationshipsUpdate && loadedRelationships) {
          const currentRelationshipsString = JSON.stringify(currentRelationships);
          const newRelationshipsString = JSON.stringify(loadedRelationships);

          if (currentRelationshipsString !== newRelationshipsString) {
            onRelationshipsUpdate(loadedRelationships);
          }
        }


        // Update columns for the current board if it changed
        if (selectedBoard) {
          const currentBoard = loadedBoards.find(b => b.id === selectedBoard);
          if (currentBoard) {
            const currentColumnsString = JSON.stringify(currentColumns);
            const newColumnsString = JSON.stringify(currentBoard.columns);

            if (currentColumnsString !== newColumnsString) {
              onColumnsUpdate(currentBoard.columns || {});
            }
          }
        }

        setLastPollTime(new Date());
      } catch (error) {
        // Silent error handling for polling
      }
    };

    // Initial poll
    pollForUpdates();

    // Set up interval
    const interval = setInterval(pollForUpdates, POLLING_INTERVAL);

    return () => {
      clearInterval(interval);
      setIsPolling(false);
    };
  }, [
    enabled,
    selectedBoard,
    currentBoards,
    currentMembers,
    currentColumns,
    currentSiteSettings,
    currentSharedFilters,
    currentRelationships,
    includeSystem,
    onBoardsUpdate,
    onMembersUpdate,
    onColumnsUpdate,
    onSiteSettingsUpdate,
    onSharedFiltersUpdate,
    onRelationshipsUpdate,
  ]);

  return {
    isPolling,
    lastPollTime,
  };
};
