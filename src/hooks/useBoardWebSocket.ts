import { useCallback, RefObject } from 'react';
import { Columns, Board } from '../types';

interface UseBoardWebSocketProps {
  // State setters
  setSelectedBoard: React.Dispatch<React.SetStateAction<string | null>>;
  setColumns: React.Dispatch<React.SetStateAction<Columns>>;
  setBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  
  // Refs
  selectedBoardRef: RefObject<string | null>;
  refreshBoardDataRef: RefObject<(() => Promise<void>) | null>;
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
      
      // Add new board with empty columns (columns will be added via column-created events)
      return [
        ...prevBoards,
        {
          ...data.board,
          columns: {}
        }
      ];
    });
    
    // Also refresh board data to ensure we have the complete structure
    // This will fetch columns if they exist, but won't block if they don't exist yet
    if (refreshBoardDataRef.current) {
      // Use a small delay to allow columns to be created first
      setTimeout(() => {
        if (refreshBoardDataRef.current) {
          refreshBoardDataRef.current();
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
    handleBoardReordered,
  };
};

