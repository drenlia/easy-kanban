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
              ...data.column
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
            ...data.column
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
    
    // Skip if this update came from the current user's GanttViewV2 (it handles its own updates via onRefreshData)
    // But allow updates from other users
    if (data.updatedBy === currentUser?.id) {
      return;
    }
    
    // Update boards state for all boards
    setBoards(prevBoards => {
      return prevBoards.map(board => {
        if (board.id === data.boardId) {
          const updatedBoard = { ...board };
          const updatedColumns: Columns = {};
          
          // Rebuild columns object with updated positions, preserving tasks
          data.columns.forEach((col: any) => {
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
        data.columns.forEach((col: any) => {
          updatedColumns[col.id] = {
            ...col,
            tasks: prevColumns[col.id]?.tasks || []
          };
        });
        
        return updatedColumns;
      });
    }
  }, [setBoards, setColumns, selectedBoardRef, currentUser?.id]);

  return {
    handleColumnCreated,
    handleColumnUpdated,
    handleColumnDeleted,
    handleColumnReordered,
  };
};

