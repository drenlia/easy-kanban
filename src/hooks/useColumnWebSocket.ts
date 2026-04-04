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
  /** Full board column list from server (create+renumber or reorder); preserves tasks from prior state. */
  const applyServerColumnsLayout = useCallback(
    (boardId: string, columnsList: any[]) => {
      if (!boardId || !columnsList?.length) return;

      window.justUpdatedFromWebSocket = true;

      setBoards(prevBoards =>
        prevBoards.map(board => {
          if (board.id !== boardId) return board;
          const sortedColumns = [...columnsList].sort(
            (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)
          );
          const updatedColumns: Columns = {};
          sortedColumns.forEach((col: any) => {
            updatedColumns[col.id] = {
              ...col,
              tasks: board.columns[col.id]?.tasks || [],
            };
          });
          return { ...board, columns: updatedColumns };
        })
      );

      if (boardId === selectedBoardRef.current) {
        setColumns(prevColumns => {
          const sortedColumns = [...columnsList].sort(
            (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)
          );
          const updatedColumns: Columns = {};
          sortedColumns.forEach((col: any) => {
            updatedColumns[col.id] = {
              ...col,
              tasks: prevColumns[col.id]?.tasks || [],
            };
          });
          return updatedColumns;
        });
      }

      setTimeout(() => {
        window.justUpdatedFromWebSocket = false;
      }, 1000);
    },
    [setBoards, setColumns, selectedBoardRef]
  );

  const handleColumnCreated = useCallback(
    (data: any) => {
      if (!data.column || !data.boardId) return;

      if (data.columns && Array.isArray(data.columns) && data.columns.length > 0) {
        applyServerColumnsLayout(data.boardId, data.columns);
        return;
      }

      setBoards(prevBoards => {
        return prevBoards.map(board => {
          if (board.id === data.boardId) {
            const updatedBoard = { ...board };
            const updatedColumns = { ...updatedBoard.columns };

            updatedColumns[data.column.id] = {
              ...data.column,
              tasks: [],
            };

            updatedBoard.columns = updatedColumns;
            return updatedBoard;
          }
          return board;
        });
      });

      if (data.boardId === selectedBoardRef.current) {
        setColumns(prevColumns => {
          const updatedColumns = { ...prevColumns };

          updatedColumns[data.column.id] = {
            ...data.column,
            tasks: [],
          };

          return updatedColumns;
        });
      }
    },
    [applyServerColumnsLayout, setBoards, setColumns, selectedBoardRef]
  );

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

  const handleColumnReordered = useCallback(
    (data: any) => {
      if (!data.boardId || !data.columns) return;

      if (window.justUpdatedFromWebSocket) {
        console.log('⏭️ [Column Reordered] Skipping - WebSocket update in progress');
        return;
      }

      applyServerColumnsLayout(data.boardId, data.columns);
    },
    [applyServerColumnsLayout]
  );

  return {
    handleColumnCreated,
    handleColumnUpdated,
    handleColumnDeleted,
    handleColumnReordered,
  };
};

