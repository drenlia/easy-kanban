import { useState, useEffect } from 'react';
import { Board, TeamMember, Columns, SiteSettings, PriorityOption } from '../types';
import { POLLING_INTERVAL } from '../constants';
import * as api from '../api';
import { getAllPriorities } from '../api';

interface UseDataPollingProps {
  enabled: boolean;
  selectedBoard: string | null;
  currentBoards: Board[];
  currentMembers: TeamMember[];
  currentColumns: Columns;
  currentSiteSettings: SiteSettings;
  currentPriorities: PriorityOption[];
  onBoardsUpdate: (boards: Board[]) => void;
  onMembersUpdate: (members: TeamMember[]) => void;
  onColumnsUpdate: (columns: Columns) => void;
  onSiteSettingsUpdate: (settings: SiteSettings) => void;
  onPrioritiesUpdate: (priorities: PriorityOption[]) => void;
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
  onBoardsUpdate,
  onMembersUpdate,
  onColumnsUpdate,
  onSiteSettingsUpdate,
  onPrioritiesUpdate,
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
        const [loadedBoards, loadedMembers, loadedSiteSettings, loadedPriorities] = await Promise.all([
          api.getBoards(),
          api.getMembers(),
          api.getPublicSettings(),
          getAllPriorities()
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
    onBoardsUpdate,
    onMembersUpdate,
    onColumnsUpdate,
    onSiteSettingsUpdate,
  ]);

  return {
    isPolling,
    lastPollTime,
  };
};
