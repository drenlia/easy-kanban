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
    
    console.log('[Frontend] handleBoardCreated received:', {
      boardId: data.boardId,
      board: data.board,
      position: data.board?.position,
      positionType: typeof data.board?.position
    });
    
    // Add the new board to the boards state immediately
    // This ensures the board appears in real-time, even before columns are created
    setBoards(prevBoards => {
      // Check if board already exists (avoid duplicates)
      const boardExists = prevBoards.some(b => b.id === data.boardId);
      if (boardExists) {
        console.log('[Frontend] Board already exists, skipping');
        return prevBoards;
      }
      
      // Insert the new board at the correct position based on its position value
      // This ensures it appears in the right place in the tabs, not just at the end
      const newBoard = {
        ...data.board,
        columns: {}
      };
      
      const newBoardPosition = typeof newBoard.position === 'number' 
        ? newBoard.position 
        : (newBoard.position != null ? parseInt(String(newBoard.position)) : null);
      
      console.log('[Frontend] New board position:', newBoardPosition, 'type:', typeof newBoardPosition);
      console.log('[Frontend] Previous boards positions:', prevBoards.map(b => ({ id: b.id, position: b.position, positionType: typeof b.position })));
      
      // If position is null/undefined, append to end
      if (newBoardPosition == null || isNaN(newBoardPosition)) {
        console.log('[Frontend] Position is null/undefined/NaN, appending to end');
        return [...prevBoards, newBoard];
      }
      
      // Find the correct insertion index based on position
      let insertIndex = prevBoards.length;
      for (let i = 0; i < prevBoards.length; i++) {
        const boardPosition = typeof prevBoards[i].position === 'number'
          ? prevBoards[i].position
          : (prevBoards[i].position != null ? parseInt(String(prevBoards[i].position)) : null);
        
        if (boardPosition != null && !isNaN(boardPosition) && newBoardPosition < boardPosition) {
          insertIndex = i;
          break;
        }
      }
      
      console.log('[Frontend] Inserting board at index:', insertIndex, 'out of', prevBoards.length, 'boards');
      
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

