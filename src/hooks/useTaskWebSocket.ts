import { useCallback, RefObject } from 'react';
import { Board, Columns, Task, TeamMember } from '../types';
import { getBoardTaskRelationships } from '../api';

interface UseTaskWebSocketProps {
  // State setters
  setBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  setColumns: React.Dispatch<React.SetStateAction<Columns>>;
  setSelectedTask: React.Dispatch<React.SetStateAction<Task | null>>;
  
  // Refs
  selectedBoardRef: RefObject<string | null>;
  pendingTaskRefreshesRef: RefObject<Set<string>>;
  refreshBoardDataRef: RefObject<(() => Promise<void>) | null>;
  
  // Task filters hook
  taskFilters: {
    setFilteredColumns: React.Dispatch<React.SetStateAction<Columns>>;
    viewModeRef: RefObject<'kanban' | 'list' | 'gantt'>;
    shouldIncludeTaskRef: RefObject<(task: Task) => boolean>;
  };
  
  // Task linking hook
  taskLinking: {
    setBoardRelationships: (relationships: any[]) => void;
  };
  
  // Current user
  currentUser: { id: string } | null | undefined;
  
  // Selected task (for comment handlers)
  selectedTask: Task | null;
}

export const useTaskWebSocket = ({
  setBoards,
  setColumns,
  setSelectedTask,
  selectedBoardRef,
  pendingTaskRefreshesRef,
  refreshBoardDataRef,
  taskFilters,
  taskLinking,
  currentUser,
  selectedTask,
}: UseTaskWebSocketProps) => {
  
  const handleTaskCreated = useCallback((data: any) => {
    if (!data.task || !data.boardId) return;
    
    const timestamp = new Date().toISOString();
    console.log(`📨 [${timestamp}] [WebSocket] Task created event received:`, {
      taskId: data.task.id,
      ticket: data.task.ticket,
      title: data.task.title,
      columnId: data.task.columnId,
      boardId: data.boardId,
      currentBoard: selectedBoardRef.current
    });
    
    // Cancel fallback refresh if WebSocket event arrived (for the user who created it)
    if (pendingTaskRefreshesRef.current?.has(data.task.id)) {
      console.log(`📨 [${timestamp}] [WebSocket] Cancelling fallback for task creator`);
      pendingTaskRefreshesRef.current.delete(data.task.id);
    }
    
    // Always update boards state for task count updates (for all boards)
    setBoards(prevBoards => {
      // Check if board exists in state
      const boardExists = prevBoards.some(b => b.id === data.boardId);
      
      if (!boardExists) {
        // Board doesn't exist yet - this can happen if board-created event hasn't been processed yet
        // In this case, we'll let the board-created handler add it, and this task will be added later
        // via refreshBoardData or when the board is added
        console.log(`⚠️ [WebSocket] Task created for board ${data.boardId} that doesn't exist in state yet - will be added when board is created`);
        return prevBoards;
      }
      
      return prevBoards.map(board => {
        if (board.id === data.boardId) {
          const updatedBoard = { ...board };
          const updatedColumns = { ...updatedBoard.columns };
          const targetColumnId = data.task.columnId;
          
          // If column doesn't exist yet, create it (can happen if column-created event hasn't been processed)
          if (!updatedColumns[targetColumnId]) {
            console.log(`⚠️ [WebSocket] Task created for column ${targetColumnId} that doesn't exist in state yet - creating column`);
            updatedColumns[targetColumnId] = {
              id: targetColumnId,
              boardId: data.boardId,
              title: 'Unknown Column', // Will be updated when column-created event arrives
              tasks: [],
              position: 0,
              is_finished: false,
              is_archived: false
            };
          }
          
          // Check if task already exists (from optimistic update)
          const existingTasks = updatedColumns[targetColumnId].tasks;
          const taskExists = existingTasks.some(t => t.id === data.task.id);
          
          if (taskExists) {
            // Task already exists, update it with server data (includes ticket number)
            const updatedTasks = existingTasks.map(t => 
              t.id === data.task.id ? data.task : t
            );
            updatedColumns[targetColumnId] = {
              ...updatedColumns[targetColumnId],
              tasks: updatedTasks
            };
          } else {
            // Task doesn't exist yet, add it at front and renumber
            const allTasks = [data.task, ...existingTasks];
            const updatedTasks = allTasks.map((task, index) => ({
              ...task,
              position: index
            }));
            
            updatedColumns[targetColumnId] = {
              ...updatedColumns[targetColumnId],
              tasks: updatedTasks
            };
          }
          
          updatedBoard.columns = updatedColumns;
          
          return updatedBoard;
        }
        return board;
      });
    });
    
    // Only update columns/filteredColumns if the task is for the currently selected board
    if (data.boardId === selectedBoardRef.current) {
      console.log(`📨 [${timestamp}] [WebSocket] Task is for current board, updating columns`);
      // Optimized: Add the specific task instead of full refresh
      setColumns(prevColumns => {
        const updatedColumns = { ...prevColumns };
        const targetColumnId = data.task.columnId;
        console.log(`📨 [${timestamp}] [WebSocket] Target column:`, targetColumnId, 'exists:', !!updatedColumns[targetColumnId]);
        
        if (updatedColumns[targetColumnId]) {
          // Check if task already exists (from optimistic update)
          const existingTasks = updatedColumns[targetColumnId].tasks;
          const taskExists = existingTasks.some(t => t.id === data.task.id);
          console.log(`📨 [${timestamp}] [WebSocket] Task exists:`, taskExists, 'existing count:', existingTasks.length);
          
          if (taskExists) {
            // Task already exists (optimistic update), just update it with server data
            console.log(`📨 [${timestamp}] [WebSocket] Updating existing task with server data`);
            const updatedTasks = existingTasks.map(t => {
              if (t.id === data.task.id) {
                // Preserve existing task data (comments, watchers, etc.) when updating
                const mergedTask = {
                  ...t,          // Preserve existing data (comments, watchers, collaborators, etc.)
                  ...data.task,  // Override with server data (position, columnId, etc.)
                  // Explicitly preserve nested arrays that might not be in data.task
                  // Use server data if it exists and is valid, otherwise preserve existing
                  comments: (data.task.comments && Array.isArray(data.task.comments) && data.task.comments.length > 0) 
                    ? data.task.comments 
                    : (t.comments || []),
                  watchers: (data.task.watchers && Array.isArray(data.task.watchers) && data.task.watchers.length > 0)
                    ? data.task.watchers
                    : (t.watchers || []),
                  collaborators: (data.task.collaborators && Array.isArray(data.task.collaborators) && data.task.collaborators.length > 0)
                    ? data.task.collaborators
                    : (t.collaborators || []),
                  tags: (data.task.tags && Array.isArray(data.task.tags) && data.task.tags.length > 0)
                    ? data.task.tags
                    : (t.tags || [])
                };
                return mergedTask;
              }
              return t;
            });
            updatedColumns[targetColumnId] = {
              ...updatedColumns[targetColumnId],
              tasks: updatedTasks
            };
          } else {
            // Task doesn't exist yet, add it at front and renumber
            console.log(`📨 [${timestamp}] [WebSocket] Adding new task to column`);
            const allTasks = [data.task, ...existingTasks];
            const updatedTasks = allTasks.map((task, index) => ({
              ...task,
              position: index
            }));
            
            updatedColumns[targetColumnId] = {
              ...updatedColumns[targetColumnId],
              tasks: updatedTasks
            };
          }
        } else {
          console.log(`📨 [${timestamp}] [WebSocket] ⚠️ Target column not found in columns state!`);
        }
        return updatedColumns;
      });
      
      // DON'T update filteredColumns here - let the filtering useEffect handle it
      // This prevents duplicate tasks when the effect runs after columns change
    } else {
      console.log(`📨 [${timestamp}] [WebSocket] Task is for different board, skipping columns update`);
    }
  }, [setBoards, setColumns, selectedBoardRef, pendingTaskRefreshesRef]);

  const handleTaskUpdated = useCallback((data: any) => {
    // Get current selectedBoard value from ref to avoid stale closure
    const currentSelectedBoard = selectedBoardRef.current;
    // Check if we should process this update
    const shouldProcess = currentSelectedBoard && data.boardId === currentSelectedBoard && data.task;
    
    // ALWAYS update boards state for system task counter (even if not currently selected board)
    if (data.task && data.boardId) {
      setBoards(prevBoards => {
        const taskId = data.task.id;
        const taskBoardId = data.task.boardId; // The board the task is now in
        const eventBoardId = data.boardId; // The board this event is for
        
        // Check if this is a cross-board move (task is in a different board than the event board)
        const isCrossBoardMove = taskBoardId && taskBoardId !== eventBoardId;
        
        return prevBoards.map(board => {
          // Handle source board (where task was removed from) - for cross-board moves
          if (isCrossBoardMove && board.id === eventBoardId && board.id !== taskBoardId && board.columns) {
            // Remove the task from all columns in the source board
            const updatedColumns = { ...board.columns };
            let taskRemoved = false;
            
            Object.keys(updatedColumns).forEach(columnId => {
              const column = updatedColumns[columnId];
              const taskIndex = column.tasks?.findIndex((t: any) => t.id === taskId) ?? -1;
              
              if (taskIndex !== -1) {
                taskRemoved = true;
                updatedColumns[columnId] = {
                  ...column,
                  tasks: [
                    ...column.tasks.slice(0, taskIndex),
                    ...column.tasks.slice(taskIndex + 1)
                  ]
                };
              }
            });
            
            if (taskRemoved) {
              return { ...board, columns: updatedColumns };
            }
          }
          
          // Handle target board (where task is now) - for both same-board and cross-board moves
          if (board.id === taskBoardId && board.columns) {
            // Update the task in the appropriate column
            const updatedColumns = { ...board.columns };
            const newColumnId = data.task.columnId;
            
            // Find and update the task
            let found = false;
            Object.keys(updatedColumns).forEach(columnId => {
              const column = updatedColumns[columnId];
              const taskIndex = column.tasks?.findIndex((t: any) => t.id === taskId) ?? -1;
              
              if (taskIndex !== -1) {
                found = true;
                if (columnId === newColumnId) {
                  // Same column - update in place
                  // Preserve existing task data (comments, watchers, etc.) when updating
                  const existingTask = column.tasks[taskIndex];
                  const mergedTask = {
                    ...existingTask,  // Preserve existing data (comments, watchers, collaborators, etc.)
                    ...data.task,     // Override with server data (position, columnId, etc.)
                    // Explicitly preserve nested arrays that might not be in data.task
                    // Use server data if it exists and is valid, otherwise preserve existing
                    comments: (data.task.comments && Array.isArray(data.task.comments) && data.task.comments.length > 0) 
                      ? data.task.comments 
                      : (existingTask.comments || []),
                    watchers: (data.task.watchers && Array.isArray(data.task.watchers) && data.task.watchers.length > 0)
                      ? data.task.watchers
                      : (existingTask.watchers || []),
                    collaborators: (data.task.collaborators && Array.isArray(data.task.collaborators) && data.task.collaborators.length > 0)
                      ? data.task.collaborators
                      : (existingTask.collaborators || []),
                    tags: (data.task.tags && Array.isArray(data.task.tags) && data.task.tags.length > 0)
                      ? data.task.tags
                      : (existingTask.tags || [])
                  };
                  
                  updatedColumns[columnId] = {
                    ...column,
                    tasks: [
                      ...column.tasks.slice(0, taskIndex),
                      mergedTask,
                      ...column.tasks.slice(taskIndex + 1)
                    ]
                  };
                } else {
                  // Different column - remove from old
                  updatedColumns[columnId] = {
                    ...column,
                    tasks: [
                      ...column.tasks.slice(0, taskIndex),
                      ...column.tasks.slice(taskIndex + 1)
                    ]
                  };
                }
              }
            });
            
            // Add to new column if it was moved, at the correct position
            if (updatedColumns[newColumnId] && !updatedColumns[newColumnId].tasks?.some((t: any) => t.id === taskId)) {
              const targetColumn = updatedColumns[newColumnId];
              const targetPosition = data.task.position ?? (targetColumn.tasks?.length || 0);
              const newTasks = [...(targetColumn.tasks || [])];
              
              // Find existing task data if it exists in the target column (shouldn't happen, but be safe)
              const existingTaskInTarget = targetColumn.tasks?.find((t: any) => t.id === taskId);
              
              // Preserve existing task data (comments, watchers, etc.) when updating
              const mergedTask = existingTaskInTarget ? {
                ...existingTaskInTarget,  // Preserve existing data (comments, watchers, collaborators, etc.)
                ...data.task,             // Override with server data (position, columnId, etc.)
                // Explicitly preserve nested arrays that might not be in data.task
                // Use server data if it exists and is valid, otherwise preserve existing
                comments: (data.task.comments && Array.isArray(data.task.comments) && data.task.comments.length > 0) 
                  ? data.task.comments 
                  : (existingTaskInTarget.comments || []),
                watchers: (data.task.watchers && Array.isArray(data.task.watchers) && data.task.watchers.length > 0)
                  ? data.task.watchers
                  : (existingTaskInTarget.watchers || []),
                collaborators: (data.task.collaborators && Array.isArray(data.task.collaborators) && data.task.collaborators.length > 0)
                  ? data.task.collaborators
                  : (existingTaskInTarget.collaborators || []),
                tags: (data.task.tags && Array.isArray(data.task.tags) && data.task.tags.length > 0)
                  ? data.task.tags
                  : (existingTaskInTarget.tags || [])
              } : data.task;
              
              // Insert at the specified position
              newTasks.splice(targetPosition, 0, mergedTask);
              
              updatedColumns[newColumnId] = {
                ...targetColumn,
                tasks: newTasks
              };
            }
            
            return { ...board, columns: updatedColumns };
          }
          
          return board;
        });
      });
    }
    
    if (currentSelectedBoard && data.boardId === currentSelectedBoard && data.task) {
      // Skip entirely if we're in Gantt view - GanttViewV2 handles its own WebSocket events
      if (taskFilters.viewModeRef.current === 'gantt') {
        return;
      }
      
      // Skip if this update came from the current user's GanttViewV2 (it handles its own updates via onRefreshData)
      // This prevents duplicate processing when both App.tsx and GanttViewV2 process the same WebSocket event
      if (window.justUpdatedFromWebSocket && data.task.updatedBy === currentUser?.id) {
        return;
      }
      
      // Also skip if this is a Gantt view update (indicated by the justUpdatedFromWebSocket flag)
      // This prevents the infinite loop where both handlers process the same event
      if (window.justUpdatedFromWebSocket) {
        return;
      }
      
      // Handle task updates including cross-column moves and same-column reordering
      setColumns(prevColumns => {
        const updatedColumns = { ...prevColumns };
        const taskId = data.task.id;
        const newColumnId = data.task.columnId;
        
        
        // Find which column currently contains this task
        let currentColumnId = null;
        Object.keys(updatedColumns).forEach(columnId => {
          const column = updatedColumns[columnId];
          const taskIndex = column.tasks.findIndex(t => t.id === taskId);
          if (taskIndex !== -1) {
            currentColumnId = columnId;
          }
        });
        
        if (currentColumnId === newColumnId) {
          // Same column - update task in place (for reordering)
          const column = updatedColumns[currentColumnId];
          const taskIndex = column.tasks.findIndex(t => t.id === taskId);
          
          if (taskIndex !== -1) {
            // Preserve existing task data (comments, watchers, etc.) when updating
            const existingTask = column.tasks[taskIndex];
            const mergedTask = {
              ...existingTask,  // Preserve existing data (comments, watchers, collaborators, etc.)
              ...data.task,     // Override with server data (position, columnId, etc.)
              // Explicitly preserve nested arrays that might not be in data.task
              // Use server data if it exists and is valid, otherwise preserve existing
              comments: (data.task.comments && Array.isArray(data.task.comments) && data.task.comments.length > 0) 
                ? data.task.comments 
                : (existingTask.comments || []),
              watchers: (data.task.watchers && Array.isArray(data.task.watchers) && data.task.watchers.length > 0)
                ? data.task.watchers
                : (existingTask.watchers || []),
              collaborators: (data.task.collaborators && Array.isArray(data.task.collaborators) && data.task.collaborators.length > 0)
                ? data.task.collaborators
                : (existingTask.collaborators || []),
              tags: (data.task.tags && Array.isArray(data.task.tags) && data.task.tags.length > 0)
                ? data.task.tags
                : (existingTask.tags || [])
            };
            
            updatedColumns[currentColumnId] = {
              ...column,
              tasks: [
                ...column.tasks.slice(0, taskIndex),
                mergedTask,
                ...column.tasks.slice(taskIndex + 1)
              ]
            };
          }
        } else {
          // Different column - move task
          // Remove from old column
          if (currentColumnId) {
            const oldColumn = updatedColumns[currentColumnId];
            const taskIndex = oldColumn.tasks.findIndex(t => t.id === taskId);
            if (taskIndex !== -1) {
              updatedColumns[currentColumnId] = {
                ...oldColumn,
                tasks: [
                  ...oldColumn.tasks.slice(0, taskIndex),
                  ...oldColumn.tasks.slice(taskIndex + 1)
                ]
              };
            }
          }
          
          // Add to new column at the correct position
          if (updatedColumns[newColumnId]) {
            const targetColumn = updatedColumns[newColumnId];
            const targetPosition = data.task.position ?? (targetColumn.tasks.length || 0);
            const newTasks = [...targetColumn.tasks];
            
            // Preserve existing task data if it exists
            const existingTaskInTarget = targetColumn.tasks.find((t: any) => t.id === taskId);
            const mergedTask = existingTaskInTarget ? {
              ...existingTaskInTarget,
              ...data.task,
              comments: (data.task.comments && Array.isArray(data.task.comments) && data.task.comments.length > 0) 
                ? data.task.comments 
                : (existingTaskInTarget.comments || []),
              watchers: (data.task.watchers && Array.isArray(data.task.watchers) && data.task.watchers.length > 0)
                ? data.task.watchers
                : (existingTaskInTarget.watchers || []),
              collaborators: (data.task.collaborators && Array.isArray(data.task.collaborators) && data.task.collaborators.length > 0)
                ? data.task.collaborators
                : (existingTaskInTarget.collaborators || []),
              tags: (data.task.tags && Array.isArray(data.task.tags) && data.task.tags.length > 0)
                ? data.task.tags
                : (existingTaskInTarget.tags || [])
            } : data.task;
            
            newTasks.splice(targetPosition, 0, mergedTask);
            
            updatedColumns[newColumnId] = {
              ...targetColumn,
              tasks: newTasks
            };
          }
        }
        
        return updatedColumns;
      });
      
      // Also update filteredColumns to maintain consistency, but respect filters
      taskFilters.setFilteredColumns(prevFilteredColumns => {
        const updatedFilteredColumns = { ...prevFilteredColumns };
        const taskId = data.task.id;
        const newColumnId = data.task.columnId;
        
        // Check if updated task should be visible based on filters (use ref to avoid stale closure)
        const taskShouldBeVisible = taskFilters.shouldIncludeTaskRef.current?.(data.task) ?? true;
        
        // Find which column currently contains this task in filteredColumns
        let currentColumnId = null;
        Object.keys(updatedFilteredColumns).forEach(columnId => {
          const column = updatedFilteredColumns[columnId];
          const taskIndex = column.tasks.findIndex(t => t.id === taskId);
          if (taskIndex !== -1) {
            currentColumnId = columnId;
          }
        });
        
        if (currentColumnId === newColumnId) {
          // Same column - update or remove based on filter
          const column = updatedFilteredColumns[currentColumnId];
          const taskIndex = column.tasks.findIndex(t => t.id === taskId);
          
          if (taskIndex !== -1) {
            if (taskShouldBeVisible) {
              // Update task in place
              const existingTask = column.tasks[taskIndex];
              const mergedTask = {
                ...existingTask,
                ...data.task,
                comments: (data.task.comments && Array.isArray(data.task.comments) && data.task.comments.length > 0) 
                  ? data.task.comments 
                  : (existingTask.comments || []),
                watchers: (data.task.watchers && Array.isArray(data.task.watchers) && data.task.watchers.length > 0)
                  ? data.task.watchers
                  : (existingTask.watchers || []),
                collaborators: (data.task.collaborators && Array.isArray(data.task.collaborators) && data.task.collaborators.length > 0)
                  ? data.task.collaborators
                  : (existingTask.collaborators || []),
                tags: (data.task.tags && Array.isArray(data.task.tags) && data.task.tags.length > 0)
                  ? data.task.tags
                  : (existingTask.tags || [])
              };
              
              updatedFilteredColumns[currentColumnId] = {
                ...column,
                tasks: [
                  ...column.tasks.slice(0, taskIndex),
                  mergedTask,
                  ...column.tasks.slice(taskIndex + 1)
                ]
              };
            } else {
              // Task no longer matches filters - remove it
              updatedFilteredColumns[currentColumnId] = {
                ...column,
                tasks: [
                  ...column.tasks.slice(0, taskIndex),
                  ...column.tasks.slice(taskIndex + 1)
                ]
              };
            }
          }
        } else {
          // Different column - move task
          // Remove from old column
          if (currentColumnId) {
            const oldColumn = updatedFilteredColumns[currentColumnId];
            const taskIndex = oldColumn.tasks.findIndex(t => t.id === taskId);
            if (taskIndex !== -1) {
              updatedFilteredColumns[currentColumnId] = {
                ...oldColumn,
                tasks: [
                  ...oldColumn.tasks.slice(0, taskIndex),
                  ...oldColumn.tasks.slice(taskIndex + 1)
                ]
              };
            }
          }
          
          // Add to new column if it should be visible
          if (taskShouldBeVisible && updatedFilteredColumns[newColumnId]) {
            const targetColumn = updatedFilteredColumns[newColumnId];
            const targetPosition = data.task.position ?? (targetColumn.tasks.length || 0);
            const newTasks = [...targetColumn.tasks];
            
            const existingTaskInTarget = targetColumn.tasks.find((t: any) => t.id === taskId);
            const mergedTask = existingTaskInTarget ? {
              ...existingTaskInTarget,
              ...data.task,
              comments: (data.task.comments && Array.isArray(data.task.comments) && data.task.comments.length > 0) 
                ? data.task.comments 
                : (existingTaskInTarget.comments || []),
              watchers: (data.task.watchers && Array.isArray(data.task.watchers) && data.task.watchers.length > 0)
                ? data.task.watchers
                : (existingTaskInTarget.watchers || []),
              collaborators: (data.task.collaborators && Array.isArray(data.task.collaborators) && data.task.collaborators.length > 0)
                ? data.task.collaborators
                : (existingTaskInTarget.collaborators || []),
              tags: (data.task.tags && Array.isArray(data.task.tags) && data.task.tags.length > 0)
                ? data.task.tags
                : (existingTaskInTarget.tags || [])
            } : data.task;
            
            newTasks.splice(targetPosition, 0, mergedTask);
            
            updatedFilteredColumns[newColumnId] = {
              ...targetColumn,
              tasks: newTasks
            };
          }
        }
        
        return updatedFilteredColumns;
      });
    }
  }, [setBoards, setColumns, taskFilters.setFilteredColumns, taskFilters.viewModeRef, taskFilters.shouldIncludeTaskRef, currentUser?.id, selectedBoardRef]);

  const handleTaskDeleted = useCallback((data: any) => {
    if (!data.taskId || !data.boardId) return;
    
    // Always update boards state for task count updates (for all boards)
    setBoards(prevBoards => {
      return prevBoards.map(board => {
        if (board.id === data.boardId) {
          const updatedBoard = { ...board };
          const updatedColumns = { ...updatedBoard.columns };
          
          // Find and remove the task from the appropriate column
          Object.keys(updatedColumns).forEach(columnId => {
            const column = updatedColumns[columnId];
            const taskIndex = column.tasks.findIndex(t => t.id === data.taskId);
            if (taskIndex !== -1) {
              // Remove the deleted task
              const remainingTasks = column.tasks.filter(task => task.id !== data.taskId);
              
              // Renumber remaining tasks sequentially from 0
              const renumberedTasks = remainingTasks
                .sort((a, b) => (a.position || 0) - (b.position || 0))
                .map((task, index) => ({
                  ...task,
                  position: index
                }));
              
              updatedColumns[columnId] = {
                ...column,
                tasks: renumberedTasks
              };
            }
          });
          
          updatedBoard.columns = updatedColumns;
          return updatedBoard;
        }
        return board;
      });
    });
    
    // Only update columns/filteredColumns if the task is for the currently selected board
    if (data.boardId === selectedBoardRef.current) {
      // Optimized: Remove the specific task and renumber remaining tasks
      setColumns(prevColumns => {
        const updatedColumns = { ...prevColumns };
        Object.keys(updatedColumns).forEach(columnId => {
          const column = updatedColumns[columnId];
          const taskIndex = column.tasks.findIndex(t => t.id === data.taskId);
          if (taskIndex !== -1) {
            // Remove the deleted task
            const remainingTasks = column.tasks.filter(task => task.id !== data.taskId);
            
            // Renumber remaining tasks sequentially from 0
            const renumberedTasks = remainingTasks
              .sort((a, b) => (a.position || 0) - (b.position || 0))
              .map((task, index) => ({
                ...task,
                position: index
              }));
            
            updatedColumns[columnId] = {
              ...column,
              tasks: renumberedTasks
            };
          }
        });
        return updatedColumns;
      });
      
      // Also update filteredColumns to maintain consistency
      taskFilters.setFilteredColumns(prevFilteredColumns => {
        const updatedFilteredColumns = { ...prevFilteredColumns };
        Object.keys(updatedFilteredColumns).forEach(columnId => {
          const column = updatedFilteredColumns[columnId];
          const taskIndex = column.tasks.findIndex(t => t.id === data.taskId);
          if (taskIndex !== -1) {
            // Remove the deleted task
            const remainingTasks = column.tasks.filter(task => task.id !== data.taskId);
            
            // Renumber remaining tasks sequentially from 0
            const renumberedTasks = remainingTasks
              .sort((a, b) => (a.position || 0) - (b.position || 0))
              .map((task, index) => ({
                ...task,
                position: index
              }));
            
            updatedFilteredColumns[columnId] = {
              ...column,
              tasks: renumberedTasks
            };
          }
        });
        return updatedFilteredColumns;
      });
    }
  }, [setBoards, setColumns, taskFilters.setFilteredColumns, selectedBoardRef]);

  const handleTaskRelationshipCreated = useCallback((data: any) => {
    // Only refresh if the relationship is for the current board
    if (data.boardId === selectedBoardRef.current) {
      // Clear the taskRelationships cache for both tasks involved
      // This ensures hover highlighting will reload fresh data
      if (data.taskId && data.toTaskId) {
        taskLinking.setTaskRelationships((prev: { [taskId: string]: any[] }) => {
          const updated = { ...prev };
          delete updated[data.taskId];
          delete updated[data.toTaskId];
          return updated;
        });
      }
      
      // Load just the relationships instead of full refresh
      getBoardTaskRelationships(selectedBoardRef.current!)
        .then(relationships => {
          taskLinking.setBoardRelationships(relationships);
        })
        .catch(error => {
          console.warn('Failed to load relationships:', error);
          // Fallback to full refresh on error
          if (refreshBoardDataRef.current) {
            refreshBoardDataRef.current();
          }
        });
    }
  }, [taskLinking.setBoardRelationships, taskLinking.setTaskRelationships, selectedBoardRef, refreshBoardDataRef]);

  const handleTaskRelationshipDeleted = useCallback((data: any) => {
    // Only refresh if the relationship is for the current board
    if (data.boardId === selectedBoardRef.current) {
      // Clear the taskRelationships cache for both tasks involved
      // This ensures hover highlighting will reload fresh data
      if (data.taskId && data.toTaskId) {
        taskLinking.setTaskRelationships((prev: { [taskId: string]: any[] }) => {
          const updated = { ...prev };
          delete updated[data.taskId];
          delete updated[data.toTaskId];
          return updated;
        });
      }
      
      // Load just the relationships instead of full refresh
      getBoardTaskRelationships(selectedBoardRef.current!)
        .then(relationships => {
          taskLinking.setBoardRelationships(relationships);
        })
        .catch(error => {
          console.warn('Failed to load relationships:', error);
          // Fallback to full refresh on error
          if (refreshBoardDataRef.current) {
            refreshBoardDataRef.current();
          }
        });
    }
  }, [taskLinking.setBoardRelationships, taskLinking.setTaskRelationships, selectedBoardRef, refreshBoardDataRef]);

  const handleTaskWatcherAdded = useCallback((data: any) => {
    // Only refresh if the task is for the current board
    if (data.boardId === selectedBoardRef.current) {
      // For watchers/collaborators, we need to refresh the specific task
      // This is more efficient than refreshing the entire board
      if (refreshBoardDataRef.current) {
        refreshBoardDataRef.current();
      }
    }
  }, [selectedBoardRef, refreshBoardDataRef]);

  const handleTaskWatcherRemoved = useCallback((data: any) => {
    // Only refresh if the task is for the current board
    if (data.boardId === selectedBoardRef.current) {
      // For watchers/collaborators, we need to refresh the specific task
      // This is more efficient than refreshing the entire board
      if (refreshBoardDataRef.current) {
        refreshBoardDataRef.current();
      }
    }
  }, [selectedBoardRef, refreshBoardDataRef]);

  const handleTaskCollaboratorAdded = useCallback((data: any) => {
    // Only refresh if the task is for the current board
    if (data.boardId === selectedBoardRef.current) {
      // For watchers/collaborators, we need to refresh the specific task
      // This is more efficient than refreshing the entire board
      if (refreshBoardDataRef.current) {
        refreshBoardDataRef.current();
      }
    }
  }, [selectedBoardRef, refreshBoardDataRef]);

  const handleTaskCollaboratorRemoved = useCallback((data: any) => {
    // Only refresh if the task is for the current board
    if (data.boardId === selectedBoardRef.current) {
      // For watchers/collaborators, we need to refresh the specific task
      // This is more efficient than refreshing the entire board
      if (refreshBoardDataRef.current) {
        refreshBoardDataRef.current();
      }
    }
  }, [selectedBoardRef, refreshBoardDataRef]);

  const handleTaskTagAdded = useCallback((data: any) => {
    console.log('📨 Task tag added via WebSocket:', data);
    // Only refresh if the task is for the current board
    if (data.boardId === selectedBoardRef.current) {
      if (refreshBoardDataRef.current) {
        refreshBoardDataRef.current();
      }
    }
  }, [selectedBoardRef, refreshBoardDataRef]);

  const handleTaskTagRemoved = useCallback((data: any) => {
    console.log('📨 Task tag removed via WebSocket:', data);
    // Only refresh if the task is for the current board
    if (data.boardId === selectedBoardRef.current) {
      if (refreshBoardDataRef.current) {
        refreshBoardDataRef.current();
      }
    }
  }, [selectedBoardRef, refreshBoardDataRef]);

  return {
    handleTaskCreated,
    handleTaskUpdated,
    handleTaskDeleted,
    handleTaskRelationshipCreated,
    handleTaskRelationshipDeleted,
    handleTaskWatcherAdded,
    handleTaskWatcherRemoved,
    handleTaskCollaboratorAdded,
    handleTaskCollaboratorRemoved,
    handleTaskTagAdded,
    handleTaskTagRemoved,
  };
};

