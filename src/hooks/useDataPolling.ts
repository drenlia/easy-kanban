import { useState, useEffect, useRef } from 'react';
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

  // Use refs to access current values without causing re-renders
  const currentBoardsRef = useRef(currentBoards);
  const currentMembersRef = useRef(currentMembers);
  const currentColumnsRef = useRef(currentColumns);
  const currentSiteSettingsRef = useRef(currentSiteSettings);
  const currentPrioritiesRef = useRef(currentPriorities);
  const currentActivitiesRef = useRef(currentActivities);
  const currentSharedFiltersRef = useRef(currentSharedFilters);
  const currentRelationshipsRef = useRef(currentRelationships);

  // Update refs when props change
  currentBoardsRef.current = currentBoards;
  currentMembersRef.current = currentMembers;
  currentColumnsRef.current = currentColumns;
  currentSiteSettingsRef.current = currentSiteSettings;
  currentPrioritiesRef.current = currentPriorities;
  currentActivitiesRef.current = currentActivities;
  currentSharedFiltersRef.current = currentSharedFilters;
  currentRelationshipsRef.current = currentRelationships;

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

        // Update boards list if it changed (efficient comparison)
        const boardsChanged = 
          currentBoardsRef.current.length !== loadedBoards.length ||
          !currentBoardsRef.current.every((board, index) => {
            const newBoard = loadedBoards[index];
            return newBoard && 
                   board.id === newBoard.id && 
                   board.title === newBoard.title &&
                   board.position === newBoard.position;
          });

        if (boardsChanged) {
          onBoardsUpdate(loadedBoards);
        }

        // Update members list if it changed (efficient comparison)
        const membersChanged = 
          currentMembersRef.current.length !== loadedMembers.length ||
          !currentMembersRef.current.every((member, index) => {
            const newMember = loadedMembers[index];
            return newMember && 
                   member.id === newMember.id && 
                   member.name === newMember.name &&
                   member.email === newMember.email;
          });

        if (membersChanged) {
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

        // Update activities if they changed (efficient comparison)
        if (onActivitiesUpdate && loadedActivities) {
          const activitiesChanged = 
            currentActivitiesRef.current.length !== loadedActivities.length ||
            !currentActivitiesRef.current.every((activity, index) => {
              const newActivity = loadedActivities[index];
              return newActivity && 
                     activity.id === newActivity.id && 
                     activity.type === newActivity.type &&
                     activity.created_at === newActivity.created_at;
            });

          if (activitiesChanged) {
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

        // Update relationships if they changed (efficient comparison to prevent memory leaks)
        if (onRelationshipsUpdate && loadedRelationships) {
          // Use efficient comparison instead of JSON.stringify to prevent memory leaks
          const relationshipsChanged = 
            currentRelationshipsRef.current.length !== loadedRelationships.length ||
            !currentRelationshipsRef.current.every((rel, index) => {
              const newRel = loadedRelationships[index];
              return newRel && 
                     rel.id === newRel.id && 
                     rel.task_id === newRel.task_id && 
                     rel.to_task_id === newRel.to_task_id &&
                     rel.relationship === newRel.relationship;
            });

          if (relationshipsChanged) {
            onRelationshipsUpdate(loadedRelationships);
          }
        }


        // Update columns for the current board if it changed (efficient comparison)
        if (selectedBoard) {
          const currentBoard = loadedBoards.find(b => b.id === selectedBoard);
          if (currentBoard) {
            // Use efficient comparison instead of JSON.stringify to prevent memory leaks
            const currentColumnIds = Object.keys(currentColumnsRef.current);
            const newColumnIds = Object.keys(currentBoard.columns || {});
            
            const columnsChanged = 
              currentColumnIds.length !== newColumnIds.length ||
              !currentColumnIds.every(id => {
                const currentCol = currentColumnsRef.current[id];
                const newCol = currentBoard.columns?.[id];
                return newCol && 
                       currentCol?.title === newCol.title &&
                       currentCol?.position === newCol.position &&
                       currentCol?.tasks?.length === newCol.tasks?.length;
              });

            if (columnsChanged) {
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
