import { useCallback, RefObject } from 'react';
import { Columns } from '../types';

interface UseBoardWebSocketProps {
  // State setters
  setSelectedBoard: React.Dispatch<React.SetStateAction<string | null>>;
  setColumns: React.Dispatch<React.SetStateAction<Columns>>;
  
  // Refs
  selectedBoardRef: RefObject<string | null>;
  refreshBoardDataRef: RefObject<(() => Promise<void>) | null>;
}

export const useBoardWebSocket = ({
  setSelectedBoard,
  setColumns,
  selectedBoardRef,
  refreshBoardDataRef,
}: UseBoardWebSocketProps) => {
  
  const handleBoardCreated = useCallback((data: any) => {
    // Refresh boards list to show new board
    if (refreshBoardDataRef.current) {
      refreshBoardDataRef.current();
    }
  }, [refreshBoardDataRef]);

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

