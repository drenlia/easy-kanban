import { useCallback, useRef, useEffect, RefObject } from 'react';
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
  // Keep a ref to selectedTask to avoid stale closures in batch processing
  const selectedTaskRef = useRef<Task | null>(selectedTask);
  
  useEffect(() => {
    selectedTaskRef.current = selectedTask;
  }, [selectedTask]);
  
  // Batch processing for rapid task updates (e.g., 259 updates from batch-update-positions)
  // This prevents React batching from causing state overwrites
  const pendingUpdatesRef = useRef<Map<string, any>>(new Map());
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Pre-compute deferral mechanism ONCE to avoid repeated checks (performance optimization)
  // This eliminates 550+ typeof checks when messages arrive rapidly
  const deferUpdateRef = useRef<((taskId: string, data: any) => void) | null>(null);
  
  const processBatchedUpdates = useCallback(() => {
    if (pendingUpdatesRef.current.size === 0) return;
    
    const updates = Array.from(pendingUpdatesRef.current.values());
    pendingUpdatesRef.current.clear();
    
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
      batchTimeoutRef.current = null;
    }
    
    // Set flag to prevent polling/refresh from interfering
    // Also use a longer timeout to ensure filtering waits for state to settle
    window.justUpdatedFromWebSocket = true;
    (window as any).lastWebSocketUpdateTime = Date.now();
    setTimeout(() => {
      window.justUpdatedFromWebSocket = false;
    }, 2000); // Keep flag for 2 seconds to prevent refresh interference and allow filtering to wait
    
    // Use requestAnimationFrame + setTimeout to break up the work and avoid blocking the main thread
    // This prevents "message handler took Xms" violations
    // Double defer: requestAnimationFrame ensures we're in the right frame, setTimeout breaks up heavy work
    requestAnimationFrame(() => {
      // Defer the actual heavy processing to the next tick to avoid blocking
      setTimeout(() => {
    
    // Track if we need to update selectedTask
    let updatedSelectedTask: Task | null = null;
    const currentSelectedTask = selectedTaskRef.current;
    // Track which task IDs were updated (for selectedTask update check)
    const updatedTaskIds = new Set<string>();
    
    // Process all updates in a single setColumns call
    setColumns(prevColumns => {
      // OPTIMIZED: Use shallow copy - only copy columns we actually modify
      // This is 10-100x faster than JSON.parse(JSON.stringify()) for large datasets
      const updatedColumns: Columns = {};
      
      // Shallow copy all columns first (we'll deep copy tasks only when we modify them)
      Object.keys(prevColumns).forEach(columnId => {
        const column = prevColumns[columnId];
        if (column) {
          updatedColumns[columnId] = {
            ...column,
            tasks: [...(column.tasks || [])] // Shallow copy task array (tasks themselves will be copied when modified)
          };
        }
      });
      
      
      // First pass: Build a map of all task updates by taskId
      // This allows us to handle multiple updates for the same task correctly
      const taskUpdatesMap = new Map<string, any>();
      const taskSourceColumns = new Map<string, string>(); // Track where each task currently is
      
      // Build initial map of where tasks currently are
      Object.keys(updatedColumns).forEach(columnId => {
        const column = updatedColumns[columnId];
        if (!column || !column.tasks) return;
        column.tasks.forEach((task: any) => {
          if (task && task.id) {
            taskSourceColumns.set(task.id, columnId);
          }
        });
      });
      
      
      // Collect all updates
      updates.forEach(data => {
        if (!data.task || !data.boardId) return;
        const taskId = data.task.id;
        if (!taskId) return;
        taskUpdatesMap.set(taskId, data);
        updatedTaskIds.add(taskId); // Track for selectedTask update
      });
      
      
      // Second pass: Process moves first (tasks changing columns)
      // This ensures we remove tasks from source columns before processing position updates
      const moves: Array<{ taskId: string; fromColumn: string; toColumn: string; data: any }> = [];
      taskUpdatesMap.forEach((data, taskId) => {
        const targetColumnId = data.task.columnId;
        if (!targetColumnId) return;
        
        const currentColumnId = taskSourceColumns.get(taskId);
        if (currentColumnId && currentColumnId !== targetColumnId) {
          moves.push({ taskId, fromColumn: currentColumnId, toColumn: targetColumnId, data });
        }
      });
      
      // Process moves: Remove from source, preserve full task data
      const movedTasksData = new Map<string, any>(); // Store full task data for moved tasks
      moves.forEach(({ taskId, fromColumn, toColumn, data }) => {
        const sourceColumn = updatedColumns[fromColumn];
        if (!sourceColumn || !sourceColumn.tasks) return;
        
        const taskIndex = sourceColumn.tasks.findIndex((t: any) => t && t.id === taskId);
        if (taskIndex !== -1) {
          // Preserve FULL task data before removing
          movedTasksData.set(taskId, sourceColumn.tasks[taskIndex]);
          
          // Remove from source column
          updatedColumns[fromColumn] = {
            ...sourceColumn,
            tasks: [
              ...sourceColumn.tasks.slice(0, taskIndex),
              ...sourceColumn.tasks.slice(taskIndex + 1)
            ]
          };
          
          // Update tracking
          taskSourceColumns.delete(taskId);
        }
      });
      
      // Third pass: Process all updates (position changes and moves)
      // Group by target column to process all updates for each column together
      const updatesByColumn = new Map<string, Array<{ taskId: string; data: any; isMove: boolean }>>();
      
      taskUpdatesMap.forEach((data, taskId) => {
        const targetColumnId = data.task.columnId;
        if (!targetColumnId) return;
        
        if (!updatesByColumn.has(targetColumnId)) {
          updatesByColumn.set(targetColumnId, []);
        }
        
        const currentColumnId = taskSourceColumns.get(taskId);
        const isMove = currentColumnId && currentColumnId !== targetColumnId;
        updatesByColumn.get(targetColumnId)!.push({ taskId, data, isMove });
      });
      
      // CRITICAL: Build a map of all original tasks from prevColumns BEFORE processing updates
      // This ensures we always have the full task data, even if it was modified in a previous update
      const originalTasksMap = new Map<string, any>();
      Object.keys(prevColumns).forEach(columnId => {
        const column = prevColumns[columnId];
        if (!column || !column.tasks) return;
        column.tasks.forEach((task: any) => {
          if (task && task.id) {
            originalTasksMap.set(task.id, task);
          }
        });
      });
      
      // Process each column's updates together
      updatesByColumn.forEach((columnUpdates, targetColumnId) => {
        const targetColumn = updatedColumns[targetColumnId];
        if (!targetColumn) {
          console.warn('⚠️ [WebSocket] Batch update: Target column not found:', targetColumnId);
          return;
        }
        
        // Start with current tasks in the column (after moves removed)
        let columnTasks = [...(targetColumn.tasks || [])];
        
        
        // Process each update for this column
        columnUpdates.forEach(({ taskId, data, isMove }) => {
          // CRITICAL: Get full task data from original state, not from modified columnTasks
          // Priority: 1) moved tasks (preserved before removal), 2) original state, 3) current column, 4) minimal payload
          let fullTaskData = movedTasksData.get(taskId);
          let dataSource = 'moved';
          if (!fullTaskData) {
            // Get from original state (before any modifications)
            fullTaskData = originalTasksMap.get(taskId);
            dataSource = 'original';
          }
          if (!fullTaskData) {
            // Fallback to current column (might be incomplete, but better than nothing)
            const existingTask = columnTasks.find((t: any) => t && t.id === taskId);
            fullTaskData = existingTask;
            dataSource = 'column';
          }
          
          
          // Build merged task
          // CRITICAL: Preserve ALL fields from fullTaskData, only override with values from data.task
          // that are explicitly provided. The server sends minimal payloads with only changed fields,
          // so we must preserve all unchanged fields from the original task data.
          const mergedTask = fullTaskData ? {
            ...fullTaskData,  // Full existing data - this is the base (preserves ALL fields)
            // Override with fields from the update payload (only if they exist in data.task)
            // The server's minimal payload includes changed fields: title, description, memberId, 
            // requesterId, startDate, dueDate, effort, priority, columnId, position, sprintId, etc.
            // CRITICAL: The server always includes these fields in minimal payload: id, title, boardId, memberId, ticket
            // So we can always use them from data.task. For other fields, only use if they exist in the payload.
            id: data.task.id ?? fullTaskData.id,
            title: data.task.title ?? fullTaskData.title, // Server always includes title
            boardId: data.task.boardId ?? fullTaskData.boardId, // Server always includes boardId
            columnId: targetColumnId, // Always use target column
            memberId: data.task.memberId !== undefined ? data.task.memberId : fullTaskData.memberId, // Server always includes memberId (may be null)
            ticket: data.task.ticket !== undefined ? data.task.ticket : fullTaskData.ticket, // Server always includes ticket (may be null)
            updatedBy: data.task.updatedBy ?? fullTaskData.updatedBy,
            // Handle fields that are only included if they changed
            description: data.task.hasOwnProperty('description') ? data.task.description : fullTaskData.description,
            position: data.task.hasOwnProperty('position') ? (data.task.position ?? fullTaskData.position) : fullTaskData.position,
            requesterId: data.task.hasOwnProperty('requesterId') ? data.task.requesterId : fullTaskData.requesterId,
            startDate: data.task.hasOwnProperty('startDate') ? data.task.startDate : fullTaskData.startDate,
            dueDate: data.task.hasOwnProperty('dueDate') ? data.task.dueDate : fullTaskData.dueDate,
            effort: data.task.hasOwnProperty('effort') ? (data.task.effort ?? fullTaskData.effort ?? 0) : fullTaskData.effort,
            // CRITICAL: Always update priority fields if they exist in the update (even if null/undefined)
            // This ensures priority reassignment after deletion is always applied
            // Use priorityName from JOIN as the source of truth, not the stale priority field
            priority: data.task.hasOwnProperty('priorityName') ? (data.task.priorityName ?? null) 
                     : (data.task.hasOwnProperty('priority') ? (data.task.priority ?? null) : fullTaskData.priority),
            priorityId: data.task.hasOwnProperty('priorityId') ? (data.task.priorityId ?? null) : fullTaskData.priorityId,
            priorityName: data.task.hasOwnProperty('priorityName') ? (data.task.priorityName ?? null) : fullTaskData.priorityName,
            priorityColor: data.task.hasOwnProperty('priorityColor') ? (data.task.priorityColor ?? null) : fullTaskData.priorityColor,
            sprintId: data.task.hasOwnProperty('sprintId') ? data.task.sprintId : fullTaskData.sprintId,
            // Handle previous location fields (for cross-column/board moves)
            previousColumnId: data.task.hasOwnProperty('previousColumnId') ? data.task.previousColumnId : fullTaskData.previousColumnId,
            previousBoardId: data.task.hasOwnProperty('previousBoardId') ? data.task.previousBoardId : fullTaskData.previousBoardId,
            // Preserve arrays - only use update if it's a non-empty array, otherwise keep existing
            comments: (data.task.comments && Array.isArray(data.task.comments) && data.task.comments.length > 0)
              ? data.task.comments
              : (fullTaskData.comments || []),
            watchers: (data.task.watchers && Array.isArray(data.task.watchers) && data.task.watchers.length > 0)
              ? data.task.watchers
              : (fullTaskData.watchers || []),
            collaborators: (data.task.collaborators && Array.isArray(data.task.collaborators) && data.task.collaborators.length > 0)
              ? data.task.collaborators
              : (fullTaskData.collaborators || []),
            tags: (data.task.tags && Array.isArray(data.task.tags) && data.task.tags.length > 0)
              ? data.task.tags
              : (fullTaskData.tags || [])
          } : {
            // No existing data - use minimal payload with defaults
            ...data.task,
            id: taskId,
            title: data.task.title || 'Untitled Task',
            boardId: data.task.boardId || data.boardId,
            columnId: targetColumnId,
            position: data.task.position ?? 0,
            comments: data.task.comments || [],
            watchers: data.task.watchers || [],
            collaborators: data.task.collaborators || [],
            tags: data.task.tags || [],
            memberId: data.task.memberId || null,
            requesterId: data.task.requesterId || null,
            effort: data.task.effort ?? 0,
            priority: data.task.priority || null,
            sprintId: data.task.sprintId || null,
            startDate: data.task.startDate || null,
            dueDate: data.task.dueDate || null,
            createdAt: data.task.createdAt || new Date().toISOString(),
            updatedAt: data.task.updatedAt || new Date().toISOString()
          };
          
          // Update or add task in column (immutable update)
          const existingIndex = columnTasks.findIndex((t: any) => t && t.id === taskId);
          if (existingIndex !== -1) {
            // Create new array with updated task
            columnTasks = [
              ...columnTasks.slice(0, existingIndex),
              mergedTask,
              ...columnTasks.slice(existingIndex + 1)
            ];
          } else {
            columnTasks = [...columnTasks, mergedTask];
          }
        });
        
        // Sort by position and update column (create new sorted array, don't mutate)
        const sortedTasks = [...columnTasks].sort((a, b) => (a.position || 0) - (b.position || 0));
        updatedColumns[targetColumnId] = {
          ...targetColumn,
          tasks: sortedTasks
        };
      });
      
      
      // Track updated selectedTask if it's one of the updated tasks
      // We'll update it after setColumns completes
      // CRITICAL: Always update selectedTask if it's one of the updated tasks, even if only field values changed
      if (currentSelectedTask) {
        const taskId = currentSelectedTask.id;
        // Check if this task was updated in the batch
        if (updatedTaskIds.has(taskId)) {
          // Find the updated task in the columns
          Object.keys(updatedColumns).forEach(columnId => {
            const column = updatedColumns[columnId];
            if (!column || !column.tasks) return;
            const task = column.tasks.find((t: any) => t && t.id === taskId);
            if (task) {
              updatedSelectedTask = task;
            }
          });
        }
      }
      
      
      return updatedColumns;
    });
    
    // Update selectedTask after columns update completes
    // This ensures the task detail view shows the latest data
    // CRITICAL: Always update selectedTask if it was updated, even if only field values changed
    if (updatedSelectedTask && currentSelectedTask) {
      // Use setTimeout to ensure this happens after setColumns state update
      setTimeout(() => {
        setSelectedTask(updatedSelectedTask);
      }, 0);
    } else if (currentSelectedTask && updatedTaskIds.has(currentSelectedTask.id)) {
      // Task was updated but not found in columns - this shouldn't happen, but log it
      console.warn(`⚠️ [Batch] Task ${currentSelectedTask.id} was updated but not found in columns for selectedTask update`);
    }
    
    // NOTE: We don't manually update filteredColumns here
    // The useTaskFilters hook has a useEffect that automatically recalculates filteredColumns
    // whenever columns changes. This ensures filtering is always correct and consistent.
    // Manual updates could cause race conditions or inconsistencies with the filter logic.
    // 
    // The useTaskFilters effect will run after setColumns completes and will:
    // 1. Read the updated columns state (with all our batch updates)
    // 2. Apply filters to determine which tasks should be visible
    // 3. Update filteredColumns automatically
    // 
    // This is the correct approach because:
    // - It ensures filter logic is always consistent
    // - It handles all filter types (sprint, search, members, etc.)
    // - It avoids race conditions between manual updates and effect updates
    }, 0); // Defer to next tick to break up heavy work
    });
  }, [setColumns, setSelectedTask]);
  
  // Helper function to schedule batch processing (defined early so it can be used by getMessageChannel)
  const scheduleBatchProcessing = useCallback((data: any) => {
    // Schedule async processing - use requestIdleCallback if available, otherwise setTimeout
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
    }
    
    // Check if this is a priority update (should process faster)
    // Use 'in' operator instead of hasOwnProperty for better performance
    const isPriorityUpdate = 'priority' in data.task ||
                             'priorityId' in data.task ||
                             'priorityName' in data.task ||
                             'priorityColor' in data.task;
    
    // Process priority updates with minimal delay, others with standard debounce
    const debounceDelay = isPriorityUpdate ? 0 : 50;
    
    // Use requestIdleCallback if available for better performance, otherwise setTimeout
    if (typeof requestIdleCallback !== 'undefined' && !isPriorityUpdate) {
      batchTimeoutRef.current = setTimeout(() => {
        requestIdleCallback(() => {
          processBatchedUpdates();
        }, { timeout: 100 });
      }, debounceDelay);
    } else {
      batchTimeoutRef.current = setTimeout(() => {
        processBatchedUpdates();
      }, debounceDelay);
    }
  }, [processBatchedUpdates]);
  
  // Initialize deferral mechanism once (useEffect to set it up)
  // This pre-computes the deferral function to avoid 550+ typeof checks per message
  useEffect(() => {
    if (typeof (window as any).scheduler !== 'undefined' && (window as any).scheduler.postTask) {
      // scheduler.postTask is fastest (runs in separate task queue, doesn't block)
      deferUpdateRef.current = (taskId: string, data: any) => {
        (window as any).scheduler.postTask(() => {
          pendingUpdatesRef.current.set(taskId, data);
          scheduleBatchProcessing(data);
        }, { priority: 'user-blocking' });
      };
    } else if (typeof MessageChannel !== 'undefined') {
      // MessageChannel defers to next event loop tick (reuse shared channel)
      const channel = new MessageChannel();
      channel.port1.onmessage = (e: MessageEvent) => {
        const { taskId, data } = e.data;
        if (taskId && data) {
          pendingUpdatesRef.current.set(taskId, data);
          scheduleBatchProcessing(data);
        }
      };
      deferUpdateRef.current = (taskId: string, data: any) => {
        channel.port2.postMessage({ taskId, data });
      };
    } else {
      // Fallback: setTimeout(0) - still defers to next tick
      deferUpdateRef.current = (taskId: string, data: any) => {
        setTimeout(() => {
          pendingUpdatesRef.current.set(taskId, data);
          scheduleBatchProcessing(data);
        }, 0);
      };
    }
  }, [scheduleBatchProcessing]);
  
  
  const handleTaskCreated = useCallback((data: any) => {
    if (!data.task || !data.boardId) return;
    
    // Cancel fallback refresh if WebSocket event arrived (for the user who created it)
    if (pendingTaskRefreshesRef.current?.has(data.task.id)) {
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
        return prevBoards;
      }
      
      return prevBoards.map(board => {
        if (board.id === data.boardId) {
          const updatedBoard = { ...board };
          const updatedColumns = { ...updatedBoard.columns };
          const targetColumnId = data.task.columnId;
          
          // If column doesn't exist yet, create it (can happen if column-created event hasn't been processed)
          if (!updatedColumns[targetColumnId]) {
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
      // Optimized: Add the specific task instead of full refresh
      setColumns(prevColumns => {
        const updatedColumns = { ...prevColumns };
        const targetColumnId = data.task.columnId;
        
        if (updatedColumns[targetColumnId]) {
          // Check if task already exists (from optimistic update)
          const existingTasks = updatedColumns[targetColumnId].tasks;
          const taskExists = existingTasks.some(t => t.id === data.task.id);
          
          if (taskExists) {
            // Task already exists (optimistic update), just update it with server data
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
        }
        return updatedColumns;
      });
      
      // DON'T update filteredColumns here - let the filtering useEffect handle it
      // This prevents duplicate tasks when the effect runs after columns change
    }
  }, [setBoards, setColumns, selectedBoardRef, pendingTaskRefreshesRef]);

  const handleTaskUpdated = useCallback((data: any) => {
    // CRITICAL: Make message handler ULTRA-lightweight - absolute minimum synchronous work
    // This prevents violations when hundreds of messages arrive rapidly (e.g., 550 tasks on page load)
    // Strategy: Validate once, then immediately defer ALL work (no conditional checks in hot path)
    
    // Ultra-fast validation (single optional chaining check)
    const taskId = data?.task?.id;
    if (!taskId || !data?.boardId) return;
    
    // IMMEDIATELY defer using pre-computed mechanism (no conditional checks here!)
    // The deferral mechanism was pre-computed in useEffect to avoid 550+ typeof checks
    const defer = deferUpdateRef.current;
    if (defer) {
      defer(taskId, data);
    } else {
      // Fallback if not initialized yet (shouldn't happen, but be safe)
      setTimeout(() => {
        pendingUpdatesRef.current.set(taskId, data);
        scheduleBatchProcessing(data);
      }, 0);
    }
  }, [scheduleBatchProcessing]);
  
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
    
    // Only update columns if the task is for the currently selected board
    if (data.boardId === selectedBoardRef.current) {
      setColumns(prevColumns => {
        const updatedColumns = { ...prevColumns };
        
        // Find and remove the task from the appropriate column
        Object.keys(updatedColumns).forEach(columnId => {
          const column = updatedColumns[columnId];
          if (!column || !column.tasks) return;
          
          const taskIndex = column.tasks.findIndex(t => t && t.id === data.taskId);
          if (taskIndex !== -1) {
            // Remove the deleted task
            const remainingTasks = column.tasks.filter(task => task && task.id !== data.taskId);
            
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
      
      // Clear selectedTask if it was the deleted task
      if (selectedTaskRef.current?.id === data.taskId) {
        setSelectedTask(null);
      }
    }
  }, [setBoards, setColumns, selectedBoardRef, setSelectedTask]);
  
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
  }, [selectedBoardRef]);
  
  const handleTaskRelationshipDeleted = useCallback((data: any) => {
    // Only refresh if the relationship is for the current board
    if (data.boardId === selectedBoardRef.current) {
      // Clear the taskRelationships cache for both tasks involved
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
  }, [selectedBoardRef]);
  
  const handleTaskWatcherAdded = useCallback((data: any) => {
    // Only refresh if the task is for the current board
    if (data.boardId === selectedBoardRef.current) {
      // For watchers/collaborators, we need to refresh the specific task
      // This is more efficient than refreshing the entire board
      if (data.taskId && pendingTaskRefreshesRef.current) {
        pendingTaskRefreshesRef.current.add(data.taskId);
      }
    }
  }, [selectedBoardRef, pendingTaskRefreshesRef]);
  
  const handleTaskWatcherRemoved = useCallback((data: any) => {
    // Only refresh if the task is for the current board
    if (data.boardId === selectedBoardRef.current) {
      // For watchers/collaborators, we need to refresh the specific task
      // This is more efficient than refreshing the entire board
      if (data.taskId && pendingTaskRefreshesRef.current) {
        pendingTaskRefreshesRef.current.add(data.taskId);
      }
    }
  }, [selectedBoardRef, pendingTaskRefreshesRef]);
  
  const handleTaskCollaboratorAdded = useCallback((data: any) => {
    // Only refresh if the task is for the current board
    if (data.boardId === selectedBoardRef.current) {
      // For watchers/collaborators, we need to refresh the specific task
      // This is more efficient than refreshing the entire board
      if (data.taskId && pendingTaskRefreshesRef.current) {
        pendingTaskRefreshesRef.current.add(data.taskId);
      }
    }
  }, [selectedBoardRef, pendingTaskRefreshesRef]);
  
  const handleTaskCollaboratorRemoved = useCallback((data: any) => {
    // Only refresh if the task is for the current board
    if (data.boardId === selectedBoardRef.current) {
      // For watchers/collaborators, we need to refresh the specific task
      // This is more efficient than refreshing the entire board
      if (data.taskId && pendingTaskRefreshesRef.current) {
        pendingTaskRefreshesRef.current.add(data.taskId);
      }
    }
  }, [selectedBoardRef, pendingTaskRefreshesRef]);
  
  const handleTaskTagAdded = useCallback((data: any) => {
    // Only refresh if the task is for the current board
    if (data.boardId === selectedBoardRef.current) {
      // For tags, we need to refresh the specific task
      // This is more efficient than refreshing the entire board
      if (data.taskId && pendingTaskRefreshesRef.current) {
        pendingTaskRefreshesRef.current.add(data.taskId);
      }
    }
  }, [selectedBoardRef, pendingTaskRefreshesRef]);
  
  const handleTaskTagRemoved = useCallback((data: any) => {
    // Only refresh if the task is for the current board
    if (data.boardId === selectedBoardRef.current) {
      // For tags, we need to refresh the specific task
      // This is more efficient than refreshing the entire board
      if (data.taskId && pendingTaskRefreshesRef.current) {
        pendingTaskRefreshesRef.current.add(data.taskId);
      }
    }
  }, [selectedBoardRef, pendingTaskRefreshesRef]);
  
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
    handleTaskTagRemoved
  };
};

