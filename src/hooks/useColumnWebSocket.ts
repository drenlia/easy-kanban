import { useCallback, RefObject } from 'react';
import { Board, Columns } from '../types';

interface UseColumnWebSocketProps {
  // State setters
  setBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  setColumns: React.Dispatch<React.SetStateAction<Columns>>;
  
  // Refs
  selectedBoardRef: RefObject<string | null>;
  
  // Current user
  currentUser: { id: string } | null | undefined;
}

export const useColumnWebSocket = ({
  setBoards,
  setColumns,
  selectedBoardRef,
  currentUser,
}: UseColumnWebSocketProps) => {
  
  const handleColumnCreated = useCallback((data: any) => {
    if (!data.column || !data.boardId) return;
    
    // Update boards state for all boards
    setBoards(prevBoards => {
      return prevBoards.map(board => {
        if (board.id === data.boardId) {
          const updatedBoard = { ...board };
          const updatedColumns = { ...updatedBoard.columns };
          
          // Add the new column
          updatedColumns[data.column.id] = {
            ...data.column,
            tasks: []
          };
          
          updatedBoard.columns = updatedColumns;
          return updatedBoard;
        }
        return board;
      });
    });
    
    // Only update columns if it's for the currently selected board
    if (data.boardId === selectedBoardRef.current) {
      setColumns(prevColumns => {
        const updatedColumns = { ...prevColumns };
        
        // Add the new column with empty tasks array
        updatedColumns[data.column.id] = {
          ...data.column,
          tasks: []
        };
        
        return updatedColumns;
      });
    }
  }, [setBoards, setColumns, selectedBoardRef]);

  const handleColumnUpdated = useCallback((data: any) => {
    if (!data.column || !data.boardId) return;
    
    // Convert camelCase to snake_case for Column type compatibility
    // Backend sends isFinished/isArchived (camelCase), but Column type expects is_finished/is_archived (snake_case)
    const columnUpdate = {
      ...data.column,
      is_finished: data.column.isFinished !== undefined ? data.column.isFinished : data.column.is_finished,
      is_archived: data.column.isArchived !== undefined ? data.column.isArchived : data.column.is_archived
    };
    // Remove camelCase properties to avoid confusion
    delete columnUpdate.isFinished;
    delete columnUpdate.isArchived;
    
    // Update boards state for all boards
    setBoards(prevBoards => {
      return prevBoards.map(board => {
        if (board.id === data.boardId) {
          const updatedBoard = { ...board };
          const updatedColumns = { ...updatedBoard.columns };
          
          // Update the column while preserving its tasks
          if (updatedColumns[data.column.id]) {
            updatedColumns[data.column.id] = {
              ...updatedColumns[data.column.id],
              ...columnUpdate
            };
          }
          
          updatedBoard.columns = updatedColumns;
          return updatedBoard;
        }
        return board;
      });
    });
    
    // Only update columns if it's for the currently selected board
    if (data.boardId === selectedBoardRef.current) {
      setColumns(prevColumns => {
        const updatedColumns = { ...prevColumns };
        
        // Update the column while preserving its tasks
        if (updatedColumns[data.column.id]) {
          updatedColumns[data.column.id] = {
            ...updatedColumns[data.column.id],
            ...columnUpdate
          };
        }
        
        return updatedColumns;
      });
    }
  }, [setBoards, setColumns, selectedBoardRef]);

  const handleColumnDeleted = useCallback((data: any) => {
    if (!data.columnId || !data.boardId) return;
    
    // Update boards state for all boards
    setBoards(prevBoards => {
      return prevBoards.map(board => {
        if (board.id === data.boardId) {
          const updatedBoard = { ...board };
          const updatedColumns = { ...updatedBoard.columns };
          
          // Remove the deleted column
          delete updatedColumns[data.columnId];
          
          updatedBoard.columns = updatedColumns;
          return updatedBoard;
        }
        return board;
      });
    });
    
    // Only update columns if it's for the currently selected board
    if (data.boardId === selectedBoardRef.current) {
      setColumns(prevColumns => {
        const updatedColumns = { ...prevColumns };
        
        // Remove the deleted column
        delete updatedColumns[data.columnId];
        
        return updatedColumns;
      });
    }
  }, [setBoards, setColumns, selectedBoardRef]);

  const handleColumnReordered = useCallback((data: any) => {
    if (!data.boardId || !data.columns) return;
    
    // CRITICAL: Skip if we just updated from WebSocket to prevent overwriting batch updates
    if (window.justUpdatedFromWebSocket) {
      console.log('⏭️ [Column Reordered] Skipping - WebSocket update in progress');
      return;
    }
    
    // Set flag to prevent refreshBoardData from overwriting this update
    window.justUpdatedFromWebSocket = true;
    
    // Process updates from current user to ensure state sync after column reordering
    // The backend returns updated columns with correct positions, so we should use them
    // This ensures the frontend state matches the backend after reordering operations
    // This is especially important for edge cases where the frontend's optimistic update
    // might not match the backend's actual result (e.g., moving to first/last position)
    
    // Update boards state for all boards
    setBoards(prevBoards => {
      return prevBoards.map(board => {
        if (board.id === data.boardId) {
          const updatedBoard = { ...board };
          const updatedColumns: Columns = {};
          
          // Rebuild columns object with updated positions, preserving tasks
          // CRITICAL: Sort columns by position to ensure correct order
          const sortedColumns = [...data.columns].sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
          sortedColumns.forEach((col: any) => {
            updatedColumns[col.id] = {
              ...col,
              tasks: updatedBoard.columns[col.id]?.tasks || []
            };
          });
          
          updatedBoard.columns = updatedColumns;
          return updatedBoard;
        }
        return board;
      });
    });
    
    // Only update columns if it's for the currently selected board
    if (data.boardId === selectedBoardRef.current) {
      setColumns(prevColumns => {
        const updatedColumns: Columns = {};
        
        // Rebuild columns object with updated positions, preserving tasks
        // CRITICAL: Sort columns by position to ensure correct order
        // Use the positions from the backend to ensure accuracy
        const sortedColumns = [...data.columns].sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
        sortedColumns.forEach((col: any) => {
          updatedColumns[col.id] = {
            ...col,
            tasks: prevColumns[col.id]?.tasks || []
          };
        });
        
        return updatedColumns;
      });
    }
    
    // Clear the flag after a delay to prevent refreshBoardData from overwriting
    // Use a longer timeout since we're not calling refreshBoardData after reorder anymore
    setTimeout(() => {
      window.justUpdatedFromWebSocket = false;
    }, 1000);
  }, [setBoards, setColumns, selectedBoardRef]);

  return {
    handleColumnCreated,
    handleColumnUpdated,
    handleColumnDeleted,
    handleColumnReordered,
  };
};

