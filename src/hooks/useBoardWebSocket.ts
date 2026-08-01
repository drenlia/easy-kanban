import { useCallback, RefObject } from 'react';
import { Columns, Board } from '../types';

interface UseBoardWebSocketProps {
  // State setters
  setSelectedBoard: React.Dispatch<React.SetStateAction<string | null>>;
  setColumns: React.Dispatch<React.SetStateAction<Columns>>;
  setBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  
  // Refs
  selectedBoardRef: RefObject<string | null>;
  refreshBoardDataRef: RefObject<
    ((options?: { force?: boolean; forBoardId?: string }) => Promise<void>) | null
  >;
}

export const useBoardWebSocket = ({
  setSelectedBoard,
  setColumns,
  setBoards,
  selectedBoardRef,
  refreshBoardDataRef,
}: UseBoardWebSocketProps) => {
  
  const handleBoardCreated = useCallback((data: any) => {
    if (!data.board || !data.boardId) return;

    // Add the new board to the boards state immediately
    // This ensures the board appears in real-time, even before columns are created
    setBoards(prevBoards => {
      // Check if board already exists (avoid duplicates)
      const boardExists = prevBoards.some(b => b.id === data.boardId);
      if (boardExists) {
        return prevBoards;
      }

      // Insert the new board at the correct position based on its position value
      // This ensures it appears in the right place in the tabs, not just at the end
      const newBoard = {
        ...data.board,
        columns: {}
      };

      // Positions are NUMERIC server-side and may arrive as fractional strings
      const toPosition = (value: unknown): number | null => {
        if (value == null) return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const newBoardPosition = toPosition(newBoard.position);
      if (newBoardPosition == null) {
        return [...prevBoards, newBoard];
      }

      // Find the correct insertion index based on position
      let insertIndex = prevBoards.length;
      for (let i = 0; i < prevBoards.length; i++) {
        const boardPosition = toPosition(prevBoards[i].position);

        if (boardPosition != null && newBoardPosition < boardPosition) {
          insertIndex = i;
          break;
        }
      }

      // Insert at the correct position
      const newBoards = [...prevBoards];
      newBoards.splice(insertIndex, 0, newBoard);
      return newBoards;
    });
    
    // Also refresh board data to ensure we have the complete structure
    // This will fetch columns if they exist, but won't block if they don't exist yet
    if (refreshBoardDataRef.current) {
      // Use a small delay to allow columns to be created first
      setTimeout(() => {
        if (refreshBoardDataRef.current) {
          refreshBoardDataRef.current({ force: true });
        }
      }, 500);
    }
  }, [setBoards, refreshBoardDataRef]);

  const handleBoardUpdated = useCallback((data: any) => {
    console.log('🔄 Refreshing board data due to board update...');
    // Refresh boards list
    if (refreshBoardDataRef.current) {
      refreshBoardDataRef.current();
    }
  }, [refreshBoardDataRef]);

  const handleBoardDeleted = useCallback((data: any) => {
    // If the deleted board was selected, clear selection
    if (data.boardId === selectedBoardRef.current) {
      setSelectedBoard(null);
      setColumns({});
    }
    // Refresh boards list
    if (refreshBoardDataRef.current) {
      refreshBoardDataRef.current();
    }
  }, [setSelectedBoard, setColumns, selectedBoardRef, refreshBoardDataRef]);

  const handleBoardRestored = useCallback((data: any) => {
    if (refreshBoardDataRef.current) {
      refreshBoardDataRef.current({ force: true });
    }
  }, [refreshBoardDataRef]);

  const handleBoardReordered = useCallback((data: any) => {
    // Refresh boards list to show new order
    if (refreshBoardDataRef.current) {
      refreshBoardDataRef.current();
    }
  }, [refreshBoardDataRef]);

  return {
    handleBoardCreated,
    handleBoardUpdated,
    handleBoardDeleted,
    handleBoardRestored,
    handleBoardReordered,
  };
};

