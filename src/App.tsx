import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  TeamMember, 
  Task, 
  Column, 
  Columns, 
  Board, 
  PriorityOption, 
  Tag,
  QueryLog, 
  DragPreview 
} from './types';
import DebugPanel from './components/DebugPanel';
import ResetCountdown from './components/ResetCountdown';

import Login from './components/Login';
import Header from './components/layout/Header';
import MainLayout from './components/layout/MainLayout';
import ModalManager from './components/layout/ModalManager';
import MiniTaskIcon from './components/MiniTaskIcon';
import TaskCard from './components/TaskCard';
import Test from './components/Test';
import * as api from './api';
import { useLoadingState } from './hooks/useLoadingState';
import { useDebug } from './hooks/useDebug';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAuth } from './hooks/useAuth';
import { useDataPolling } from './hooks/useDataPolling';
import { generateUUID } from './utils/uuid';
import { loadUserPreferences, updateUserPreference, TaskViewMode, ViewMode } from './utils/userPreferences';
import { getAllPriorities, getAllTags, getTaskWatchers, getTaskCollaborators } from './api';
import { 
  DEFAULT_COLUMNS, 
  DRAG_COOLDOWN_DURATION, 
  TASK_CREATION_PAUSE_DURATION, 
  BOARD_CREATION_PAUSE_DURATION,
  DND_ACTIVATION_DISTANCE 
} from './constants';
import { 
  getInitialSelectedBoard, 
  getInitialPage 
} from './utils/routingUtils';
import { 
  filterTasks,
  getFilteredTaskCountForBoard, 
  hasActiveFilters,
  wouldTaskBeFilteredOut 
} from './utils/taskUtils';
import { moveTaskToBoard } from './api';
import { customCollisionDetection, calculateGridStyle } from './utils/dragDropUtils';
import { KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DndContext, DragOverlay } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';



export default function App() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(getInitialSelectedBoard);
  const [columns, setColumns] = useState<Columns>({});
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [draggedColumn, setDraggedColumn] = useState<Column | null>(null);
  const [isHoveringBoardTab, setIsHoveringBoardTab] = useState<boolean>(false);
  const boardTabHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [isTaskMiniMode, setIsTaskMiniMode] = useState(false);
  const dragStartedRef = useRef<boolean>(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Enhanced setSelectedTask that also updates user preferences
  const handleSelectTask = (task: Task | null) => {
    setSelectedTask(task);
    updateUserPreference('selectedTaskId', task?.id || null);
  };
  const [queryLogs, setQueryLogs] = useState<QueryLog[]>([]);
  const [dragCooldown, setDragCooldown] = useState(false);
  const [taskCreationPause, setTaskCreationPause] = useState(false);
  const [boardCreationPause, setBoardCreationPause] = useState(false);
  const [animateCopiedTaskId, setAnimateCopiedTaskId] = useState<string | null>(null);
  const [pendingCopyAnimation, setPendingCopyAnimation] = useState<{
    title: string;
    columnId: string;
    originalPosition: number;
    originalTaskId: string;
  } | null>(null);
  // Load user preferences from cookies
  const [userPrefs] = useState(() => loadUserPreferences());
  const [selectedMembers, setSelectedMembers] = useState<string[]>(userPrefs.selectedMembers);
  const [includeAssignees, setIncludeAssignees] = useState(userPrefs.includeAssignees);
  const [includeWatchers, setIncludeWatchers] = useState(userPrefs.includeWatchers);
  const [includeCollaborators, setIncludeCollaborators] = useState(userPrefs.includeCollaborators);
  const [includeRequesters, setIncludeRequesters] = useState(userPrefs.includeRequesters);
  const [includeSystem, setIncludeSystem] = useState(userPrefs.includeSystem || false);
  const [taskViewMode, setTaskViewMode] = useState<TaskViewMode>(userPrefs.taskViewMode);
  const [viewMode, setViewMode] = useState<ViewMode>(userPrefs.viewMode);
  const [isSearchActive, setIsSearchActive] = useState(userPrefs.isSearchActive);
  const [searchFilters, setSearchFilters] = useState(userPrefs.searchFilters);
  const [filteredColumns, setFilteredColumns] = useState<Columns>({});
  // const [boardTaskCounts, setBoardTaskCounts] = useState<{[boardId: string]: number}>({});
  const [availablePriorities, setAvailablePriorities] = useState<PriorityOption[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isProfileBeingEdited, setIsProfileBeingEdited] = useState(false);
  const [currentPage, setCurrentPage] = useState<'kanban' | 'admin' | 'test'>(getInitialPage);
  const [adminRefreshKey, setAdminRefreshKey] = useState(0);
  const [columnWarnings, setColumnWarnings] = useState<{[columnId: string]: string}>({});
  const [showColumnDeleteConfirm, setShowColumnDeleteConfirm] = useState<string | null>(null);
  
  // Debug showColumnDeleteConfirm changes
  useEffect(() => {
    if (showColumnDeleteConfirm) {
      console.log(`📋 showColumnDeleteConfirm changed to: ${showColumnDeleteConfirm}`);
    } else {
      console.log(`📋 showColumnDeleteConfirm cleared`);
    }
  }, [showColumnDeleteConfirm]);

  // Sync selectedMembers when members list changes (e.g., user deletion)
  useEffect(() => {
    if (members.length > 0) {
      const currentMemberIds = new Set(members.map(m => m.id));
      const validSelectedMembers = selectedMembers.filter(id => currentMemberIds.has(id));
      
      // Only sync if there's a difference (remove deleted members)
      if (validSelectedMembers.length !== selectedMembers.length) {
        console.log(`🔄 Syncing selected members: ${selectedMembers.length} → ${validSelectedMembers.length}`);
        setSelectedMembers(validSelectedMembers);
        updateUserPreference('selectedMembers', validSelectedMembers);
      }
    }
  }, [members]); // Only depend on members, not selectedMembers to avoid loops

  // Helper function to get default priority name
  const getDefaultPriorityName = (): string => {
    // Find priority with initial = true (or 1 from SQLite)
    const defaultPriority = availablePriorities.find(p => !!p.initial);
    if (defaultPriority) {
      return defaultPriority.priority;
    }
    
    // Fallback to lowest ID (first priority created) if no default set
    const lowestId = availablePriorities.sort((a, b) => a.id - b.id)[0];
    if (lowestId) {
      return lowestId.priority;
    }
    
    // Ultimate fallback
    return 'medium';
  };

  // Authentication hook
  const {
    isAuthenticated,
    currentUser,
    siteSettings,
    hasDefaultAdmin,
    handleLogin,
    handleLogout,
    handleProfileUpdated,
    refreshSiteSettings,
    setSiteSettings,
  } = useAuth({
    onDataClear: () => {
    setMembers([]);
    setBoards([]);
    setColumns({});
    setSelectedBoard(null);
    setSelectedMembers([]);
    },
    onAdminRefresh: () => {
      setAdminRefreshKey(prev => prev + 1);
    },
    onPageChange: setCurrentPage,
    onMembersRefresh: async () => {
      const loadedMembers = await api.getMembers(includeSystem);
      setMembers(loadedMembers);
    },
  });
  const { loading, withLoading } = useLoadingState();
  
  // Custom hooks
  const showDebug = useDebug();
  useKeyboardShortcuts(() => setShowHelpModal(true));
  
  // Data polling for real-time collaboration
  const { isPolling, lastPollTime } = useDataPolling({
    enabled: isAuthenticated && currentPage === 'kanban' && !!selectedBoard && !draggedTask && !draggedColumn && !dragCooldown && !taskCreationPause && !boardCreationPause,
    selectedBoard,
    currentBoards: boards,
    currentMembers: members,
    currentColumns: columns,
    currentSiteSettings: siteSettings,
    currentPriorities: availablePriorities,
    includeSystem,
    onBoardsUpdate: setBoards,
    onMembersUpdate: isProfileBeingEdited ? () => {} : setMembers, // Skip member updates when profile is being edited
    onColumnsUpdate: setColumns,
    onSiteSettingsUpdate: setSiteSettings,
    onPrioritiesUpdate: setAvailablePriorities,
  });

  // Restore selected task from preferences when tasks are loaded
  useEffect(() => {
    // Load fresh preferences to get the most up-to-date selectedTaskId
    const freshPrefs = loadUserPreferences();
    const savedTaskId = freshPrefs.selectedTaskId;
    
    if (savedTaskId && !selectedTask && Object.keys(columns).length > 0) {
      // Find the task in all columns
      for (const column of Object.values(columns)) {
        const foundTask = column.tasks.find(task => task.id === savedTaskId);
        if (foundTask) {
          setSelectedTask(foundTask);
          break;
        }
      }
    }
  }, [columns, selectedTask]);


  // Mock socket object for compatibility with existing UI (removed unused variable)



  // Handle board selection with URL hash persistence
  const handleBoardSelection = (boardId: string) => {
    setSelectedBoard(boardId);
    window.location.hash = boardId;
  };

  // Header event handlers
  const handlePageChange = (page: 'kanban' | 'admin' | 'test') => {
    setCurrentPage(page);
    if (page === 'kanban') {
      // If there was a previously selected board, restore it
      if (selectedBoard) {
        window.location.hash = `kanban#${selectedBoard}`;
      } else {
        window.location.hash = 'kanban';
      }
    } else {
      window.location.hash = 'admin';
    }
  };

  const handleRefreshData = async () => {
    await refreshBoardData();
  };

  // Use the extracted collision detection function
  const collisionDetection = (args: any) => customCollisionDetection(args, draggedColumn, draggedTask, columns);

  // DnD sensors for both columns and tasks - optimized for smooth UX
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Make drag activation very permissive for better UX
      activationConstraint: {
        distance: 1, // Very low threshold
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );



  // Handle authentication state changes
  useEffect(() => {
    // Only change page if we're definitely not authenticated (not during auth check)
    // Don't change page during the initial auth check when isAuthenticated is false
    if (!isAuthenticated && (currentPage === 'admin' || currentPage === 'test') && !localStorage.getItem('authToken')) {
      setCurrentPage('kanban');
    }
  }, [isAuthenticated, currentPage]);

  // Handle URL hash changes with PROPER ROUTING
  useEffect(() => {
    const handleHashChange = () => {
      const fullHash = window.location.hash;
      const hash = fullHash.replace('#', '');
      
      // Parse the hash to determine routing
      const routeParts = hash.split('#');
      const mainRoute = routeParts[0];
      const subRoute = routeParts[1];
      
      // Handle main page routing
      if (['kanban', 'admin', 'test'].includes(mainRoute)) {
        if (mainRoute !== currentPage) {
          setCurrentPage(mainRoute as 'kanban' | 'admin' | 'test');
        }
        
        // Handle admin sub-routes
        if (mainRoute === 'admin' && subRoute) {
          const validAdminTabs = ['users', 'site-settings', 'sso'];
          if (validAdminTabs.includes(subRoute)) {
            // The Admin component will handle this via its own hash handling
          }
        }
        
        // Handle kanban board sub-routes
        if (mainRoute === 'kanban' && subRoute) {
          // Check if this is a valid board ID
          if (boards.length > 0) {
            const board = boards.find(b => b.id === subRoute);
            if (board) {
              setSelectedBoard(board.id);
            } else {
              setSelectedBoard(null);
            }
          }
        }
      } else if (mainRoute && boards.length > 0) {
        // Check if this is a valid board ID
        const board = boards.find(b => b.id === mainRoute);
        if (board) {
          setSelectedBoard(board.id);
        } else {
          setCurrentPage('kanban');
          setSelectedBoard(null);
        }
      } else if (mainRoute) {
        // Unknown route, redirect to kanban page
        setCurrentPage('kanban');
        setSelectedBoard(null);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentPage, boards, isAuthenticated]);

  // Handle initial routing when app loads
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    
    if (hash) {
      // Parse the initial hash to determine routing
      const routeParts = hash.split('#');
      const mainRoute = routeParts[0];
      const subRoute = routeParts[1];
      
      // Handle main page routing
      if (['kanban', 'admin', 'test'].includes(mainRoute)) {
        if (mainRoute !== currentPage) {
          setCurrentPage(mainRoute as 'kanban' | 'admin' | 'test');
        }
        
        // Handle admin sub-routes
        if (mainRoute === 'admin' && subRoute) {
          const validAdminTabs = ['users', 'site-settings', 'sso'];
          if (validAdminTabs.includes(subRoute)) {
            // The Admin component will handle this via its own hash handling
          }
        }
        
        // Handle kanban board sub-routes
        if (mainRoute === 'kanban' && subRoute) {
          // Check if this is a valid board ID
          if (boards.length > 0) {
            const board = boards.find(b => b.id === subRoute);
            if (board) {
              setSelectedBoard(board.id);
            } else {
              setSelectedBoard(null);
            }
          }
        }
      } else if (mainRoute && boards.length > 0) {
        // Check if this is a valid board ID
        const board = boards.find(b => b.id === mainRoute);
        if (board) {
          setSelectedBoard(board.id);
        } else {
          setCurrentPage('kanban');
          setSelectedBoard(null);
        }
      } else if (mainRoute) {
        // Unknown route, redirect to kanban page
        setCurrentPage('kanban');
        setSelectedBoard(null);
      }
    } else {
      // No hash - apply the simple rule: select default board if on kanban page
      if (currentPage === 'kanban' && !selectedBoard && boards.length > 0) {
        handleBoardSelection(boards[0].id);
      }
    }
  }, [boards, currentPage, selectedBoard]);

  // Ensure default board is selected when on kanban page with no specific board
  useEffect(() => {
    // Don't auto-select during board creation to avoid race conditions
    if (boardCreationPause) return;
    
    if (currentPage === 'kanban' && boards.length > 0 && !selectedBoard) {
      // If no board is selected and we're on kanban page, select the first board
      const firstBoard = boards[0];
      if (firstBoard) {
        setSelectedBoard(firstBoard.id);
        // Update URL to reflect the selected board
        window.location.hash = `#kanban#${firstBoard.id}`;
      }
    }
  }, [currentPage, boards, selectedBoard, boardCreationPause]);



  // Load initial data
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const loadInitialData = async () => {
      await withLoading('general', async () => {
        try {
                  const [loadedMembers, loadedBoards, loadedPriorities, loadedTags] = await Promise.all([
          api.getMembers(includeSystem),
          api.getBoards(),
          getAllPriorities(),
          getAllTags()
        ]);
          

          
          setMembers(loadedMembers);
          setBoards(loadedBoards);
          setAvailablePriorities(loadedPriorities || []);
          setAvailableTags(loadedTags || []);
          
          if (loadedBoards.length > 0) {
            // Set columns for the selected board (board selection is handled by separate effect)
            const boardToUse = selectedBoard ? loadedBoards.find(b => b.id === selectedBoard) : null;
            if (boardToUse) {
              setColumns(boardToUse.columns || {});
            }
          }

          // Member selection is now handled by a separate useEffect
        } catch (error) {
          console.error('Failed to load initial data:', error);
        }
      });
      await fetchQueryLogs();
    };

    loadInitialData();
  }, [isAuthenticated, includeSystem]);

  // Update columns when selected board changes
  useEffect(() => {
    if (selectedBoard) {
      // Find the selected board in the current boards array
      const board = boards.find(b => b.id === selectedBoard);
      if (board) {
        // Update columns immediately from the boards array
        setColumns(board.columns || {});
      } else {
        // If board not found in current array, refresh from server
        refreshBoardData();
      }
    }
  }, [selectedBoard, boards]);

  // Set default member selection when both members and currentUser are available
  useEffect(() => {
    if (members.length > 0 && currentUser && selectedMembers.length === 0) {
      // Default to ALL members for better first-time experience
      const allMemberIds = members.map(m => m.id);
      console.log(`🎉 First-time user: Auto-selecting all ${allMemberIds.length} members`);
      setSelectedMembers(allMemberIds);
      updateUserPreference('selectedMembers', allMemberIds);
    }
  }, [members, currentUser, selectedMembers]);

  // Watch for copied task to trigger animation
  useEffect(() => {
    if (pendingCopyAnimation && columns[pendingCopyAnimation.columnId]) {
      const columnTasks = columns[pendingCopyAnimation.columnId]?.tasks || [];
      const copiedTask = columnTasks.find(t => 
        t.title === pendingCopyAnimation.title && 
        t.id !== pendingCopyAnimation.originalTaskId && // Not the original task
        Math.abs((t.position || 0) - pendingCopyAnimation.originalPosition) <= 1 // Within 1 position of original
      );
      
      if (copiedTask) {
        setAnimateCopiedTaskId(copiedTask.id);
        setPendingCopyAnimation(null); // Clear pending animation
        // Clear the animation trigger after a brief delay
        setTimeout(() => setAnimateCopiedTaskId(null), 100);
      }
    }
  }, [columns, pendingCopyAnimation]);

  // Real-time events - DISABLED (Socket.IO removed)
  // TODO: Implement simpler real-time solution (polling or SSE)

  const refreshBoardData = async () => {
    try {
      const loadedBoards = await api.getBoards();
      setBoards(loadedBoards);
      
      if (loadedBoards.length > 0) {
        // Check if the selected board still exists
        if (selectedBoard) {
          const board = loadedBoards.find(b => b.id === selectedBoard);
          if (board) {
            setColumns(board.columns || {});
          } else {
            // Selected board no longer exists, clear selection
            setSelectedBoard(null);
            setColumns({});
          }
        }
      }
    } catch (error) {
      console.error('Failed to refresh board data:', error);
    }
  };

  const fetchQueryLogs = async () => {
    try {
      const logs = await api.getQueryLogs();
      setQueryLogs(logs);
    } catch (error) {
      console.error('Failed to fetch query logs:', error);
    }
  };



  const handleAddBoard = async () => {
    try {
      // Pause polling to prevent race conditions
      setBoardCreationPause(true);
      
      // Generate a unique numbered board name
      const generateUniqueBoardName = (): string => {
        let counter = 1;
        let proposedName = `New Board ${counter}`;
        
        while (boards.some(board => board.title.toLowerCase() === proposedName.toLowerCase())) {
          counter++;
          proposedName = `New Board ${counter}`;
        }
        
        return proposedName;
      };
      
      const boardId = generateUUID();
      const newBoard: Board = {
        id: boardId,
        title: generateUniqueBoardName(),
        columns: {}
      };

      // Create the board first
      await api.createBoard(newBoard);

      // Create default columns for the new board
      const columnPromises = DEFAULT_COLUMNS.map(async (col, index) => {
        const column: Column = {
          id: `${col.id}-${boardId}`,
          title: col.title,
          tasks: [],
          boardId: boardId,
          position: index
        };
        return api.createColumn(column);
      });

      await Promise.all(columnPromises);

      // Refresh board data to get the complete structure
      await refreshBoardData();
      

      
      // Set the new board as selected and update URL
      setSelectedBoard(boardId);
      window.location.hash = boardId;
      
      await fetchQueryLogs();
      
      // Resume polling after brief delay
      setTimeout(() => {
        setBoardCreationPause(false);
      }, BOARD_CREATION_PAUSE_DURATION);
      
    } catch (error) {
      console.error('Failed to add board:', error);
      setBoardCreationPause(false); // Resume polling even on error
    }
  };

  const handleEditBoard = async (boardId: string, title: string) => {
    try {
      await api.updateBoard(boardId, title);
      setBoards(prev => prev.map(b => 
        b.id === boardId ? { ...b, title } : b
      ));
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to update board:', error);
    }
  };

  const handleBoardReorder = async (boardId: string, newPosition: number) => {
    try {
      // Optimistic update - reorder boards immediately in frontend
      const oldIndex = boards.findIndex(board => board.id === boardId);

      
      if (oldIndex !== -1 && oldIndex !== newPosition) {
        const newBoards = [...boards];
        const [movedBoard] = newBoards.splice(oldIndex, 1);
        newBoards.splice(newPosition, 0, movedBoard);
        
        // Update positions to match new order
        const updatedBoards = newBoards.map((board, index) => ({
          ...board,
          position: index
        }));
        

        setBoards(updatedBoards);
      }
      
      // Update backend
      await api.reorderBoards(boardId, newPosition);
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to reorder boards:', error);
      // Rollback by refreshing on error
      await refreshBoardData();
    }
  };

  const handleRemoveBoard = async (boardId: string) => {
    if (boards.length <= 1) {
      alert('Cannot delete the last board');
      return;
    }

    try {
      await api.deleteBoard(boardId);
      const newBoards = boards.filter(b => b.id !== boardId);
      setBoards(newBoards);
      
      if (selectedBoard === boardId) {
        const firstBoard = newBoards[0];
        handleBoardSelection(firstBoard.id);
        setColumns(firstBoard.columns);
      }
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to remove board:', error);
    }
  };

  const handleAddTask = async (columnId: string) => {
    if (!selectedBoard || !currentUser) return;
    
    // Always assign new tasks to the logged-in user, not the filtered selection
    const currentUserMember = members.find(m => m.user_id === currentUser.id);
    if (!currentUserMember) {
      console.error('Current user not found in members list');
      return;
    }
    
    const newTask: Task = {
      id: generateUUID(),
      title: 'New Task',
      description: '',
      memberId: currentUserMember.id,
      startDate: new Date().toISOString().split('T')[0],
      effort: 1,
      columnId,
      position: 0, // Backend will handle positioning
      priority: getDefaultPriorityName(), // Use frontend default priority
      requesterId: currentUserMember.id,
      boardId: selectedBoard,
      comments: []
    };

    // Optimistic update - add to top immediately
    setColumns(prev => ({
      ...prev,
      [columnId]: {
        ...prev[columnId],
        tasks: [newTask, ...(prev[columnId]?.tasks || [])]
      }
    }));

    // PAUSE POLLING to prevent race condition
    setTaskCreationPause(true);


    try {
      await withLoading('tasks', async () => {
        // Let backend handle positioning and shifting
        await api.createTaskAtTop(newTask);
        
        // Refresh to get clean state from backend
        await refreshBoardData();
      });
      
      // Check if the new task would be filtered out and show warning
      const wouldBeFilteredBySearch = wouldTaskBeFilteredOut(newTask, searchFilters, isSearchActive);
      const wouldBeFilteredByMembers = (selectedMembers.length > 0 || includeAssignees || includeWatchers || includeCollaborators || includeRequesters) && (() => {
        // Check if task matches member filtering criteria
        if (selectedMembers.length === 0 && !includeAssignees && !includeWatchers && !includeCollaborators && !includeRequesters) {
          return false; // No member filters active
        }
        
        const memberIds = new Set(selectedMembers);
        let hasMatchingMember = false;
        
        if (includeAssignees && newTask.memberId && memberIds.has(newTask.memberId)) hasMatchingMember = true;
        if (includeRequesters && newTask.requesterId && memberIds.has(newTask.requesterId)) hasMatchingMember = true;
        if (includeWatchers && newTask.watchers && Array.isArray(newTask.watchers) && newTask.watchers.some(w => w && memberIds.has(w.id))) hasMatchingMember = true;
        if (includeCollaborators && newTask.collaborators && Array.isArray(newTask.collaborators) && newTask.collaborators.some(c => c && memberIds.has(c.id))) hasMatchingMember = true;
        
        return !hasMatchingMember; // Return true if would be filtered out
      })();
      
      if (wouldBeFilteredBySearch || wouldBeFilteredByMembers) {
        setColumnWarnings(prev => ({
          ...prev,
          [columnId]: 'Task created but hidden by active filters.\n**Tip:** Click "All" to see all tasks and disable relevant filters.'
        }));
      }
      
      // Resume polling after brief delay
      setTimeout(() => {
        setTaskCreationPause(false);

      }, TASK_CREATION_PAUSE_DURATION);
      
    } catch (error) {
      console.error('Failed to create task at top:', error);
      setTaskCreationPause(false);
      await refreshBoardData();
    }
  };

  const handleEditTask = async (task: Task) => {
    // Optimistic update
    const previousColumns = { ...columns };
    
    // Update UI immediately
    setColumns(prev => ({
      ...prev,
      [task.columnId]: {
        ...prev[task.columnId],
        tasks: prev[task.columnId].tasks.map(t => 
          t.id === task.id ? task : t
        )
      }
    }));
    
    try {
      await withLoading('tasks', async () => {
        await api.updateTask(task);
        await fetchQueryLogs();
      });
    } catch (error) {
      // Rollback on error
      setColumns(previousColumns);
      console.error('Failed to update task:', error);
    }
  };

  const handleRemoveTask = async (taskId: string) => {
    try {
      // If the task being deleted is currently open in TaskDetails, close it first
      if (selectedTask && selectedTask.id === taskId) {
        handleSelectTask(null);
      }
      
      await api.deleteTask(taskId);
      await refreshBoardData(); // Refresh to ensure consistent state
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to remove task:', error);
    }
  };

  const handleCopyTask = async (task: Task) => {
    // Find the original task's position in the sorted list
    const columnTasks = [...(columns[task.columnId]?.tasks || [])]
      .sort((a, b) => (a.position || 0) - (b.position || 0));
    
    const originalTaskIndex = columnTasks.findIndex(t => t.id === task.id);
    const originalPosition = task.position || 0;
    
    // New task will be inserted right after the original (position + 0.5 as intermediate)
    const newPosition = originalPosition + 0.5;
    
    // Generate unique title for tracking
    const copyTitle = `${task.title} (Copy)`;
    const tempId = generateUUID();
    
    const newTask: Task = {
      ...task,
      id: tempId,
      title: copyTitle,
      comments: [],
      position: newPosition
    };


    // Optimistic update - insert copy right after original
    setColumns(prev => {
      const columnTasksCopy = [...(prev[task.columnId]?.tasks || [])];
      const insertIndex = originalTaskIndex + 1;
      columnTasksCopy.splice(insertIndex, 0, newTask);
      
      return {
        ...prev,
        [task.columnId]: {
          ...prev[task.columnId],
          tasks: columnTasksCopy
        }
      };
    });

    // PAUSE POLLING to prevent race condition
    setTaskCreationPause(true);

    try {
      await withLoading('tasks', async () => {
        // Create task with specific position
        await api.createTask(newTask);
            
        // Now fix all positions to be sequential
        const allColumnTasks = [...columnTasks, newTask]
          .sort((a, b) => (a.position || 0) - (b.position || 0));
        
        // Update all positions to be sequential: 0, 1, 2, 3...
        const updatePromises = allColumnTasks.map((t, index) => {
          if (t.position !== index) {
            return api.updateTask({ ...t, position: index });
          }
          return Promise.resolve();
        }).filter(p => p);
        
        await Promise.all(updatePromises);
            
        // Refresh to get clean state from backend
        await refreshBoardData();

      });
      
      // Set up pending animation - useEffect will trigger when columns update
      setPendingCopyAnimation({
        title: copyTitle,
        columnId: task.columnId,
        originalPosition,
        originalTaskId: task.id
      });
      
      // Resume polling after brief delay
      setTimeout(() => {
        setTaskCreationPause(false);

      }, TASK_CREATION_PAUSE_DURATION);
      
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to copy task:', error);
      setTaskCreationPause(false);
      await refreshBoardData();
    }
  };

  const handleTaskDragStart = (task: Task) => {
    setDraggedTask(task);
    // Pause polling during drag to prevent state conflicts
  };

  // Old handleTaskDragEnd removed - replaced with unified version below

  const handleTaskDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Legacy wrapper for old HTML5 drag (still used by some components)
  const handleTaskDrop = async () => {
  };

  // Show both mouse pointer and square icon with mouse precisely centered
  const setCustomTaskCursor = (task: Task, members: TeamMember[]) => {
    // Create a 32x32 SVG with a blue square and a white arrow pointer in the center
    const svg = `
      <svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
        <!-- Blue square background -->
        <rect width="24" height="24" x="4" y="4" fill="#3B82F6" stroke="#FFFFFF" stroke-width="2" rx="3"/>
        <!-- White mouse pointer arrow in the exact center -->
        <path d="M 16 12 L 16 20 L 18 18 L 20 20 L 22 18 L 18 16 L 20 16 Z" fill="#FFFFFF" stroke="#000000" stroke-width="0.5"/>
      </svg>
    `;
    
    // Convert SVG to data URL
    const dataURL = `data:image/svg+xml;base64,${btoa(svg)}`;
    
    // Set cursor with hotspot at exact center (16,16) where the arrow tip is
    document.body.style.setProperty('cursor', `url("${dataURL}") 16 16, grab`, 'important');
    document.documentElement.style.setProperty('cursor', `url("${dataURL}") 16 16, grab`, 'important');
    
    dragStartedRef.current = true;
    console.log('🎯 Mouse + square cursor set for task:', task.title);
  };
  
  // Clear custom cursor
  const clearCustomCursor = () => {
    if (dragStartedRef.current) {
      // Remove direct styles
      document.body.style.removeProperty('cursor');
      document.documentElement.style.removeProperty('cursor');
      
      dragStartedRef.current = false;
      console.log('🎯 Custom cursor cleared');
    }
  };

  // Unified task drag handler for both vertical and horizontal moves
  const handleUnifiedTaskDragEnd = (event: DragEndEvent) => {
    // Clean up hover timeout and reset state
    if (boardTabHoverTimeoutRef.current) {
      clearTimeout(boardTabHoverTimeoutRef.current);
      boardTabHoverTimeoutRef.current = null;
    }
    setIsHoveringBoardTab(false);
    
    // Clear drag preview
    setDragPreview(null);
    
    // Set cooldown and clear dragged task state
    setDraggedTask(null);
    setDragCooldown(true);
    
    setTimeout(() => {
      setDragCooldown(false);
        }, DRAG_COOLDOWN_DURATION);
    const { active, over } = event;
    
    
    if (!over) {
        return;
    }

    // Check if dropping on a board tab for cross-board move
    if (over.data?.current?.type === 'board') {
      const targetBoardId = over.data.current.boardId;
      console.log('🎯 Board drop detected:', { targetBoardId, selectedBoard, overData: over.data.current });
      if (targetBoardId && targetBoardId !== selectedBoard) {
        console.log('🚀 Cross-board move initiated:', active.id, '→', targetBoardId);
        handleTaskDropOnBoard(active.id as string, targetBoardId);
        return;
      } else {
        console.log('❌ Cross-board move blocked:', { targetBoardId, selectedBoard, same: targetBoardId === selectedBoard });
      }
    }

    // Find the dragged task
    const draggedTaskId = active.id as string;
    let draggedTask: Task | null = null;
    let sourceColumnId: string | null = null;
    
    // Find the task in all columns
    Object.entries(columns).forEach(([colId, column]) => {
      const task = column.tasks.find(t => t.id === draggedTaskId);
      if (task) {
        draggedTask = task;
        sourceColumnId = colId;
      }
    });

    if (!draggedTask || !sourceColumnId) {
        return;
    }

    // Determine target column and position
    let targetColumnId: string | undefined;
    let targetIndex: number | undefined;

    // Check if dropping on another task (reordering within column or moving to specific position)
    if (over.data?.current?.type === 'task') {
      // Find which column the target task is in
      Object.entries(columns).forEach(([colId, column]) => {
        const targetTask = column.tasks.find(t => t.id === over.id);
        if (targetTask) {
          targetColumnId = colId;
          
          if (sourceColumnId !== colId) {
            // Cross-column move: insert at target task position
            const targetColumnTasks = [...column.tasks].sort((a, b) => (a.position || 0) - (b.position || 0));
            const targetTaskIndex = targetColumnTasks.findIndex(t => t.id === over.id);
            targetIndex = targetTaskIndex;
          } else {
            // Same column: use array-based reordering like Test page
            const sourceTasks = [...column.tasks].sort((a, b) => (a.position || 0) - (b.position || 0));
            const oldIndex = sourceTasks.findIndex(t => t.id === draggedTaskId);
            const newIndex = sourceTasks.findIndex(t => t.id === over.id);
            
            if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
              // Use simple array move logic for same-column reordering
              handleSameColumnReorder(draggedTask, sourceColumnId, newIndex);
            }
            return; // Exit early for same-column moves
          }
        }
      });
    } else if (over.data?.current?.type === 'column' || over.data?.current?.type === 'column-top' || over.data?.current?.type === 'column-bottom') {
      // Dropping on column area
      targetColumnId = over.data.current.columnId as string;
      const columnTasks = columns[targetColumnId]?.tasks || [];
      
      if (over.data?.current?.type === 'column-top') {
        // Drop at position 0 (very top)
        targetIndex = 0;
      } else {
        // Drop at end for regular column or column-bottom
        targetIndex = columnTasks.length > 0 ? Math.max(...columnTasks.map(t => t.position || 0)) + 1 : 0;
      }
      
      } else {
      // Fallback: try using over.id as column ID
      targetColumnId = over.id as string;
      const columnTasks = columns[targetColumnId]?.tasks || [];
      targetIndex = columnTasks.length > 0 ? Math.max(...columnTasks.map(t => t.position || 0)) + 1 : 0;
      
      }

    // Validate we found valid targets
    if (!targetColumnId || targetIndex === undefined) {
        return;
    }

    // For cross-column moves, use the drag preview position if available
    if (sourceColumnId !== targetColumnId && dragPreview?.targetColumnId) {
      // Extract the real column ID from both dragPreview and targetColumnId for comparison
      let previewColumnId = dragPreview.targetColumnId;
      let currentTargetId = targetColumnId;
      
      // Remove -bottom suffix from both if present
      if (previewColumnId.endsWith('-bottom')) {
        previewColumnId = previewColumnId.replace('-bottom', '');
      }
      if (currentTargetId.endsWith('-bottom')) {
        currentTargetId = currentTargetId.replace('-bottom', '');
      }
      
      if (previewColumnId === currentTargetId) {
        targetColumnId = previewColumnId;  // Use the clean column ID
        targetIndex = dragPreview.insertIndex;
          }
    }




    // Handle the move
    if (sourceColumnId === targetColumnId) {
      // Same column - reorder
        handleSameColumnReorder(draggedTask, sourceColumnId, targetIndex);
    } else {
      // Different column - move
        handleCrossColumnMove(draggedTask, sourceColumnId, targetColumnId, targetIndex);
    }
  };

    // Handle reordering within the same column - let backend handle positions
  const handleSameColumnReorder = async (task: Task, columnId: string, newIndex: number) => {
    const columnTasks = [...(columns[columnId]?.tasks || [])]
      .sort((a, b) => (a.position || 0) - (b.position || 0));
    
    const currentIndex = columnTasks.findIndex(t => t.id === task.id);
    


    // Check if reorder is actually needed
    if (currentIndex === newIndex) {
        return;
    }

    // Optimistic update - reorder in UI immediately
    const oldIndex = currentIndex;

    const reorderedTasks = arrayMove(columnTasks, oldIndex, newIndex);
    
    setColumns(prev => ({
      ...prev,
      [columnId]: {
        ...prev[columnId],
        tasks: reorderedTasks
      }
    }));

    // Let backend handle all position calculations
    try {
      // Send the target position (not array index) to backend
      await api.reorderTasks(task.id, newIndex, columnId);
        
      // Add cooldown to prevent polling interference
      setDragCooldown(true);
      setTimeout(() => {
        setDragCooldown(false);
          }, DRAG_COOLDOWN_DURATION);
      
      // Refresh to get clean state from backend
      await refreshBoardData();
    } catch (error) {
      console.error('❌ Failed to reorder tasks:', error);
      await refreshBoardData();
    }
  };

  // Handle moving task to different column via ListView dropdown
  const handleMoveTaskToColumn = async (taskId: string, targetColumnId: string) => {
    // Find the task and its current column
    let sourceTask: Task | null = null;
    let sourceColumnId: string | null = null;
    
    Object.entries(columns).forEach(([colId, column]) => {
      const task = column.tasks.find(t => t.id === taskId);
      if (task) {
        sourceTask = task;
        sourceColumnId = colId;
      }
    });

    if (!sourceTask || !sourceColumnId || sourceColumnId === targetColumnId) {
      return; // Task not found or already in target column
    }

    const targetColumn = columns[targetColumnId];
    if (!targetColumn) {
      console.error('Target column not found:', targetColumnId);
      return;
    }

    // Move to end of target column
    const targetIndex = targetColumn.tasks.length;
    
    // Use the existing cross-column move logic
    await handleCrossColumnMove(sourceTask, sourceColumnId, targetColumnId, targetIndex);
  };

  // Handle moving task to different column
  const handleCrossColumnMove = async (task: Task, sourceColumnId: string, targetColumnId: string, targetIndex: number) => {
    const sourceColumn = columns[sourceColumnId];
    const targetColumn = columns[targetColumnId];
    
    if (!sourceColumn || !targetColumn) return;

    // Sort target column tasks by position for proper insertion
    const sortedTargetTasks = [...targetColumn.tasks].sort((a, b) => (a.position || 0) - (b.position || 0));
    

    


    // Remove from source
    const sourceTasks = sourceColumn.tasks.filter(t => t.id !== task.id);
    

    
    // Insert into target at the specified index position
    const updatedTask = { ...task, columnId: targetColumnId, position: targetIndex };
    sortedTargetTasks.splice(targetIndex, 0, updatedTask);



    // Update positions for both columns - use simple sequential indices
    // First sort the source tasks by their current position, then assign new sequential positions
    const sortedSourceTasks = [...sourceTasks].sort((a, b) => (a.position || 0) - (b.position || 0));
    const updatedSourceTasks = sortedSourceTasks.map((task, idx) => ({
        ...task,
      position: idx
    }));
    
    const updatedTargetTasks = sortedTargetTasks.map((task, idx) => ({
      ...task,
      position: idx
    }));


    


    // Update UI optimistically
    setColumns(prev => ({
      ...prev,
      [sourceColumnId]: {
        ...sourceColumn,
        tasks: updatedSourceTasks
      },
      [targetColumnId]: {
        ...targetColumn,
        tasks: updatedTargetTasks
      }
    }));

    // Update database - do this sequentially to avoid race conditions
    try {
      // Find the moved task in the final updatedTargetTasks array (with correct position)
      const finalMovedTask = updatedTargetTasks.find(t => t.id === task.id);
      if (!finalMovedTask) {
        throw new Error('Could not find moved task in updated target tasks');
      }
      
      // Step 1: Update the moved task to new column and position
        await api.updateTask(finalMovedTask);
        
      // Step 2: Update all source column tasks (sequential positions)
      for (const task of updatedSourceTasks) {
        await api.updateTask(task);
      }
        
      // Step 3: Update all target column tasks (except the moved one)
      for (const task of updatedTargetTasks.filter(t => t.id !== updatedTask.id)) {
        await api.updateTask(task);
      }
        
        
      // Refresh to ensure consistency
      await refreshBoardData();
    } catch (error) {
      console.error('Failed to update cross-column move:', error);
      await refreshBoardData();
    }
  };

  const handleEditColumn = async (columnId: string, title: string) => {
    try {
      await api.updateColumn(columnId, title);
      setColumns(prev => ({
        ...prev,
        [columnId]: { ...prev[columnId], title }
      }));
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to update column:', error);
    }
  };

  // Helper function to count tasks in a column
  const getColumnTaskCount = (columnId: string): number => {
    return columns[columnId]?.tasks?.length || 0;
  };

  // Show column delete confirmation (or delete immediately if no tasks)
  const handleRemoveColumn = async (columnId: string) => {
    const taskCount = getColumnTaskCount(columnId);
    console.log(`🗑️ Delete column ${columnId}, task count: ${taskCount}`);
    
    if (taskCount === 0) {
      // No tasks - delete immediately without confirmation
      console.log(`🗑️ Deleting empty column immediately`);
      await handleConfirmColumnDelete(columnId);
    } else {
      // Has tasks - show confirmation dialog
      console.log(`🗑️ Showing confirmation dialog for column with ${taskCount} tasks`);
      console.log(`🗑️ Setting showColumnDeleteConfirm to: ${columnId}`);
      setShowColumnDeleteConfirm(columnId);
    }
  };

  // Confirm column deletion
  const handleConfirmColumnDelete = async (columnId: string) => {
    console.log(`✅ Confirming deletion of column ${columnId}`);
    try {
      await api.deleteColumn(columnId);
      const { [columnId]: removed, ...remainingColumns } = columns;
      setColumns(remainingColumns);
      setShowColumnDeleteConfirm(null);
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to delete column:', error);
    }
  };

  // Cancel column deletion
  const handleCancelColumnDelete = () => {
    console.log(`❌ Cancelling column deletion`);
    setShowColumnDeleteConfirm(null);
  };

  // Handle cross-board task drop
  const handleTaskDropOnBoard = async (taskId: string, targetBoardId: string) => {
    try {
      console.log(`🔄 Moving task ${taskId} to board ${targetBoardId}`);
      await moveTaskToBoard(taskId, targetBoardId);
      
      // Refresh both boards to reflect the change
      await refreshBoardData();
      
      // Show success message
      console.log(`✅ Task moved successfully to ${targetBoardId}`);
      
    } catch (error) {
      console.error('Failed to move task to board:', error);
      // You could add a toast notification here
    }
  };

  // Mini mode handlers (now unused - keeping for compatibility)
  const handleTaskEnterMiniMode = () => {
    // No-op - mini mode is now automatic
  };

  const handleTaskExitMiniMode = () => {
    // No-op - mini mode is now automatic
  };

  // Always use mini mode when dragging tasks for simplicity
  useEffect(() => {
    // Set mini mode whenever we have a dragged task
    setIsTaskMiniMode(!!draggedTask);
    
    // Only clear cursor if drag ends (draggedTask becomes null)
    if (!draggedTask && dragStartedRef.current) {
      clearCustomCursor();
    }
  }, [draggedTask]);

  const handleAddColumn = async (afterColumnId: string) => {
    if (!selectedBoard) return;

    // Generate auto-numbered column name
    const existingColumnTitles = Object.values(columns).map(col => col.title);
    let columnNumber = 1;
    let newTitle = `New Column ${columnNumber}`;
    while (existingColumnTitles.includes(newTitle)) {
      columnNumber++;
      newTitle = `New Column ${columnNumber}`;
    }

    // Get the position of the column we want to insert after
    const afterColumn = columns[afterColumnId];
    const afterPosition = afterColumn?.position || 0;

    const columnId = generateUUID();
    const newColumn: Column = {
      id: columnId,
      title: newTitle,
      tasks: [],
      boardId: selectedBoard,
      position: afterPosition + 0.5 // Insert between current and next column
    };

    try {
      await api.createColumn(newColumn);
      await refreshBoardData(); // Refresh to ensure consistent state
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to create column:', error);
    }
  };

  const handleColumnDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const draggedColumn = Object.values(columns).find(col => col.id === active.id);
    if (draggedColumn) {
      setDraggedColumn(draggedColumn);
    }
  };

  const handleColumnDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    setDraggedColumn(null);
    
    if (!over || active.id === over.id || !selectedBoard) return;
    
    try {
      const columnArray = Object.values(columns).sort((a, b) => (a.position || 0) - (b.position || 0));
      const oldIndex = columnArray.findIndex(col => col.id === active.id);
      const newIndex = columnArray.findIndex(col => col.id === over.id);
      
      if (oldIndex === -1 || newIndex === -1) return;
      

      
      // Reorder columns using arrayMove
      const reorderedColumns = arrayMove(columnArray, oldIndex, newIndex);
      
      // Update positions
      const updatedColumns = reorderedColumns.map((column, index) => ({
        ...column,
        position: index
      }));
      
      // Optimistically update UI
      const newColumnsObj: Columns = {};
      updatedColumns.forEach(col => {
        newColumnsObj[col.id] = col;
      });
      setColumns(newColumnsObj);
      
      // Update database
      await api.reorderColumns(active.id as string, newIndex, selectedBoard);
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to reorder columns:', error);
      // Revert on error
      await refreshBoardData();
    }
  };

  // Calculate grid columns based on number of columns
  const columnCount = Object.keys(columns).length;
  const gridStyle = calculateGridStyle(columnCount);

  const clearQueryLogs = async () => {
    setQueryLogs([]);
  };



  const handleToggleTaskViewMode = () => {
    const modes: TaskViewMode[] = ['compact', 'shrink', 'expand'];
    const currentIndex = modes.indexOf(taskViewMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const newMode = modes[nextIndex];
    
    setTaskViewMode(newMode);
    updateUserPreference('taskViewMode', newMode);
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    updateUserPreference('viewMode', mode);
  };

  const handleToggleSearch = () => {
    const newValue = !isSearchActive;
    setIsSearchActive(newValue);
    updateUserPreference('isSearchActive', newValue);
  };

  const handleSearchFiltersChange = (newFilters: typeof searchFilters) => {
    setSearchFilters(newFilters);
    updateUserPreference('searchFilters', newFilters);
  };

  // Handle member toggle selection
  const handleMemberToggle = (memberId: string) => {
    const newSelectedMembers = selectedMembers.includes(memberId) 
      ? selectedMembers.filter(id => id !== memberId)
      : [...selectedMembers, memberId];
    
    setSelectedMembers(newSelectedMembers);
    updateUserPreference('selectedMembers', newSelectedMembers);
  };

  // Handle clearing all member selections and reverting to current user
  const handleClearMemberSelections = () => {
    if (currentUser) {
      // Find current user's member record
      const currentUserMember = members.find(m => m.user_id === currentUser.id);
      if (currentUserMember) {
        // Set selections to just the current user
        setSelectedMembers([currentUserMember.id]);
        updateUserPreference('selectedMembers', [currentUserMember.id]);
      } else {
        // Fallback: clear all selections
        setSelectedMembers([]);
        updateUserPreference('selectedMembers', []);
      }
    } else {
      // No current user, just clear all
      setSelectedMembers([]);
      updateUserPreference('selectedMembers', []);
    }
  };

  // Handle selecting all members
  // Handle dismissing column warnings
  const handleDismissColumnWarning = (columnId: string) => {
    setColumnWarnings(prev => {
      const { [columnId]: removed, ...rest } = prev;
      return rest;
    });
  };

  const handleSelectAllMembers = () => {
    const allMemberIds = members.map(m => m.id);
    setSelectedMembers(allMemberIds);
    updateUserPreference('selectedMembers', allMemberIds);
    
    // Also select all checkboxes
    setIncludeAssignees(true);
    setIncludeWatchers(true);
    setIncludeCollaborators(true);
    setIncludeRequesters(true);
    updateUserPreference('includeAssignees', true);
    updateUserPreference('includeWatchers', true);
    updateUserPreference('includeCollaborators', true);
    updateUserPreference('includeRequesters', true);
  };

  // Handle toggling filter options
  const handleToggleAssignees = (include: boolean) => {
    setIncludeAssignees(include);
    updateUserPreference('includeAssignees', include);
  };

  const handleToggleWatchers = (include: boolean) => {
    setIncludeWatchers(include);
    updateUserPreference('includeWatchers', include);
  };

  const handleToggleCollaborators = (include: boolean) => {
    setIncludeCollaborators(include);
    updateUserPreference('includeCollaborators', include);
  };

  const handleToggleRequesters = (include: boolean) => {
    setIncludeRequesters(include);
    updateUserPreference('includeRequesters', include);
  };

  const handleToggleSystem = async (include: boolean) => {
    console.log(`🔄 Toggling system user: ${include}`);
    setIncludeSystem(include);
    updateUserPreference('includeSystem', include);
    
    // Refresh members to include/exclude system user
    try {
      const loadedMembers = await api.getMembers(include);
      console.log(`📋 Loaded ${loadedMembers.length} members (includeSystem=${include}):`, loadedMembers.map(m => `${m.name} (${m.id})`));
      setMembers(loadedMembers);
    } catch (error) {
      console.error('Failed to refresh members:', error);
    }
  };

  // Enhanced async filtering effect with watchers/collaborators/requesters support
  useEffect(() => {
    const performFiltering = async () => {
      // Always filter by selectedMembers if any are selected, or if any checkboxes are checked
      const isFiltering = isSearchActive || selectedMembers.length > 0 || includeAssignees || includeWatchers || includeCollaborators || includeRequesters;
      

      
      if (!isFiltering) {

        setFilteredColumns(columns);
        return;
      }

      // Create custom filtering function that includes watchers/collaborators/requesters
      const customFilterTasks = async (tasks: any[]) => {

        
        // If no members selected and no checkboxes enabled, return all tasks
        if (selectedMembers.length === 0 && !includeAssignees && !includeWatchers && !includeCollaborators && !includeRequesters) {

          return tasks;
        }
        
        const filteredTasks = [];
        
        for (const task of tasks) {
          let includeTask = false;
          // const taskMemberName = members.find(m => m.id === task.memberId)?.name || 'Unknown';
          // const taskRequesterName = members.find(m => m.id === task.requesterId)?.name || 'Unknown';
          

          
          // Check if task is assigned to selected members (only if assignees checkbox is enabled)
          if (selectedMembers.length > 0 && includeAssignees) {
            const isAssigned = selectedMembers.includes(task.memberId);
            if (isAssigned) {
              includeTask = true;

            }
          }
          
          // Check watchers if checkbox is enabled
          if (!includeTask && includeWatchers && selectedMembers.length > 0) {
            try {
              const watchers = await getTaskWatchers(task.id);
              if (watchers && watchers.some((watcher: any) => selectedMembers.includes(watcher.id))) {
                includeTask = true;
              }
        } catch (error) {
              console.error('Error checking task watchers:', error);
            }
          }
          
          // Check collaborators if checkbox is enabled
          if (!includeTask && includeCollaborators && selectedMembers.length > 0) {
            try {
              const collaborators = await getTaskCollaborators(task.id);
              if (collaborators && collaborators.some((collaborator: any) => selectedMembers.includes(collaborator.id))) {
                includeTask = true;
              }
            } catch (error) {
              console.error('Error checking task collaborators:', error);
            }
          }
          
          // Check requesters if checkbox is enabled
          if (!includeTask && includeRequesters && selectedMembers.length > 0 && task.requesterId && selectedMembers.includes(task.requesterId)) {
            includeTask = true;

          }
          
          
          if (includeTask) {
            filteredTasks.push(task);
          }
        }
        

        return filteredTasks;
      };

      // Create effective filters with member filtering 
      const effectiveFilters = {
        ...searchFilters,
        selectedMembers: selectedMembers.length > 0 ? selectedMembers : searchFilters.selectedMembers
      };



      const filteredColumns: any = {};
      
      for (const [columnId, column] of Object.entries(columns)) {
        let columnTasks = column.tasks;

        
        // Apply search filters first, but skip member filtering if we have checkboxes enabled
        if (isSearchActive) {
          // Create filters without member filtering if we have checkboxes enabled
          const searchOnlyFilters = (includeAssignees || includeWatchers || includeCollaborators || includeRequesters) ? {
            ...effectiveFilters,
            selectedMembers: [] // Skip member filtering in search, we'll handle it in custom filter
          } : effectiveFilters;
          
          columnTasks = filterTasks(columnTasks, searchOnlyFilters, isSearchActive, members);
        }
        
        // Then apply our custom member filtering with assignees/watchers/collaborators/requesters
        if (selectedMembers.length > 0 || includeAssignees || includeWatchers || includeCollaborators || includeRequesters) {
          columnTasks = await customFilterTasks(columnTasks);
        }
        
        filteredColumns[columnId] = {
          ...column,
          tasks: columnTasks
        };
      }
      
      setFilteredColumns(filteredColumns);
    };

    performFiltering();
  }, [columns, searchFilters, isSearchActive, selectedMembers, includeAssignees, includeWatchers, includeCollaborators, includeRequesters, members, boards]);

  // Use filtered columns state
  const activeFilters = hasActiveFilters(searchFilters, isSearchActive) || selectedMembers.length > 0 || includeAssignees || includeWatchers || includeCollaborators || includeRequesters;
  const getTaskCountForBoard = (board: Board) => {
    // For the currently selected board, use the actual filtered columns data
    // This ensures the count matches exactly what's displayed in ListView/Kanban
    if (board.id === selectedBoard && filteredColumns) {
      let totalCount = 0;
      Object.values(filteredColumns).forEach(column => {
        totalCount += column.tasks.length;
      });
      return totalCount;
    }
    
    // For other boards, apply the same filtering logic used in performFiltering
    const isFiltering = isSearchActive || selectedMembers.length > 0 || includeAssignees || includeWatchers || includeCollaborators || includeRequesters;
    
    if (!isFiltering) {
      // No filters active - return total count
      let totalCount = 0;
      Object.values(board.columns || {}).forEach(column => {
        totalCount += column.tasks?.length || 0;
      });
      return totalCount;
    }
    
    // Apply search filters using the utility function
    let searchFilteredCount = getFilteredTaskCountForBoard(board, searchFilters, isSearchActive);
    
    // If no member filtering is needed, return the search-filtered count
    if (selectedMembers.length === 0 && !includeAssignees && !includeWatchers && !includeCollaborators && !includeRequesters) {
      return searchFilteredCount;
    }
    
    // Apply member filtering on top of search filtering
    let totalCount = 0;
    Object.values(board.columns || {}).forEach(column => {
      if (!column.tasks || !Array.isArray(column.tasks)) return;
      
      const filteredTasks = column.tasks.filter(task => {
        if (!task) return false;
        
        // First apply search filters using the same logic as performFiltering
        if (isSearchActive) {
          const searchFiltered = filterTasks([task], searchFilters, isSearchActive);
          if (searchFiltered.length === 0) return false;
        }
        
        // Then apply member filtering
        if (selectedMembers.length === 0 && !includeAssignees && !includeWatchers && !includeCollaborators && !includeRequesters) {
          return true;
        }
        
        const memberIds = new Set(selectedMembers);
        let hasMatchingMember = false;
        
        if (includeAssignees && task.memberId && memberIds.has(task.memberId)) hasMatchingMember = true;
        if (includeRequesters && task.requesterId && memberIds.has(task.requesterId)) hasMatchingMember = true;
        if (includeWatchers && task.watchers && Array.isArray(task.watchers) && task.watchers.some(w => w && memberIds.has(w.id))) hasMatchingMember = true;
        if (includeCollaborators && task.collaborators && Array.isArray(task.collaborators) && task.collaborators.some(c => c && memberIds.has(c.id))) hasMatchingMember = true;
        
        return hasMatchingMember;
      });
      
      totalCount += filteredTasks.length;
    });
    
    return totalCount;
  };



  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} hasDefaultAdmin={hasDefaultAdmin ?? undefined} />;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {process.env.DEMO_ENABLED === 'true' && <ResetCountdown />}
      
      {/* Global DndContext for cross-board functionality */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={(event) => {
          console.log('🎯 DragStart - item:', event.active.id);
          
          // Clear any previous drag preview
          setDragPreview(null);
          
          // Determine if dragging a column or task
          const draggedItem = Object.values(columns).find(col => col.id === event.active.id);
          if (draggedItem) {
            // Column drag
            console.log('🏛️ Starting column drag:', draggedItem.title);
            handleColumnDragStart(event);
          } else {
            // Task drag - find the task
            const taskId = event.active.id as string;
            Object.values(columns).forEach(column => {
              const task = column.tasks.find(t => t.id === taskId);
              if (task) {
                console.log('📋 Starting task drag:', task.title);
                handleTaskDragStart(task);
              }
            });
          }
        }}
        onDragOver={(event) => {
          const { active, over } = event;
          
          // Detect hovering over board tabs with debouncing to prevent flashing
          if (draggedTask && over) {
            const isOverBoardTab = over.data?.current?.type === 'board';
            
            // Clear any existing timeout
            if (boardTabHoverTimeoutRef.current) {
              clearTimeout(boardTabHoverTimeoutRef.current);
              boardTabHoverTimeoutRef.current = null;
            }
            
            if (isOverBoardTab && !isHoveringBoardTab) {
              // Immediately switch to square mode when entering board tab area
              setIsHoveringBoardTab(true);
              console.log('🎯 Board tab hover (square mode): true');
            } else if (!isOverBoardTab && isHoveringBoardTab) {
              // Delay switching back to full task mode to prevent flashing
              boardTabHoverTimeoutRef.current = setTimeout(() => {
                setIsHoveringBoardTab(false);
                console.log('🎯 Board tab hover (square mode): false');
                boardTabHoverTimeoutRef.current = null;
              }, 100); // 100ms delay
            }
          } else if (draggedTask && !over) {
            // Not hovering over anything droppable - clear any timeout and switch to full task
            if (boardTabHoverTimeoutRef.current) {
              clearTimeout(boardTabHoverTimeoutRef.current);
              boardTabHoverTimeoutRef.current = null;
            }
            if (isHoveringBoardTab) {
              setIsHoveringBoardTab(false);
              console.log('🎯 No hover (full task mode)');
            }
          }
          
          // Debug what we're hovering over
          if (draggedTask) {
            console.log('🎯 DragOver:', {
              over: over?.id,
              overType: over?.data?.current?.type,
              overData: over?.data?.current,
              hasOver: !!over
            });
          }
          
          // Handle ALL task drag over (same-column and cross-column)
          if (draggedTask && over) {
            let targetColumnId: string | undefined;
            let insertIndex: number | undefined;
            
            // Only update if we're over a valid drop target
            if (over.data?.current?.type === 'task') {
              // Hovering over another task
              Object.entries(columns).forEach(([colId, column]) => {
                const targetTask = column.tasks.find(t => t.id === over.id);
                if (targetTask) {
                  targetColumnId = colId;
                                      // Handle both same-column and cross-column moves with top position support
                    const sortedTasks = [...column.tasks].sort((a, b) => (a.position || 0) - (b.position || 0));
                    const targetTaskIndex = sortedTasks.findIndex(t => t.id === over.id);
                    
                    // Simple logic: hover over a task = insert after that task
                    // For position 0 drops, use the column-top drop zone
                    insertIndex = targetTaskIndex + 1;
                }
              });
            } else if (over.data?.current?.type === 'column' || over.data?.current?.type === 'column-bottom' || over.data?.current?.type === 'column-top') {
              // Hovering over column area (empty space), bottom drop zone, or top area
              targetColumnId = over.data.current.columnId as string;
              if (targetColumnId && columns[targetColumnId]) {
                if (over.data?.current?.type === 'column-top') {
                  // Drop at the very top of the column
                  insertIndex = 0;
                } else {
                  // Drop at the end of the column
                  insertIndex = columns[targetColumnId].tasks.length;
                }
              }
            } else {
              // Fallback: check if we're over a column by ID
              const overId = over.id as string;
              let possibleColumnId = overId;
              
              // Handle bottom drop zone IDs (e.g., "column-id-bottom")
              if (overId.endsWith('-bottom')) {
                possibleColumnId = overId.replace('-bottom', '');
              }
              
              if (columns[possibleColumnId]) {
                targetColumnId = possibleColumnId;
                const columnTasks = columns[possibleColumnId]?.tasks || [];
                insertIndex = columnTasks.length;
              }
            }
            
            // Set drag preview for ALL moves (same-column and cross-column)
            if (targetColumnId && insertIndex !== undefined) {
              setDragPreview({
                targetColumnId,
                insertIndex
              });
            } else {
              setDragPreview(null);
            }
          }
        }}
        onDragEnd={handleUnifiedTaskDragEnd}
      >
      <Header
        currentUser={currentUser}
        siteSettings={siteSettings}
        currentPage={currentPage}
        isPolling={isPolling}
        lastPollTime={lastPollTime}
        members={members}
        onProfileClick={() => setShowProfileModal(true)}
        onLogout={handleLogout}
        onPageChange={handlePageChange}
        onRefresh={handleRefreshData}
        onHelpClick={() => setShowHelpModal(true)}
      />

      <MainLayout
        currentPage={currentPage}
              currentUser={currentUser} 
        selectedTask={selectedTask}
        adminRefreshKey={adminRefreshKey}
              onUsersChanged={async () => {
                try {
                  const loadedMembers = await api.getMembers(includeSystem);
                  setMembers(loadedMembers);
                } catch (error) {
                  console.error('❌ Failed to refresh members:', error);
                }
              }}
              onSettingsChanged={refreshSiteSettings}
        loading={loading}
                    members={members}
        boards={boards}
        selectedBoard={selectedBoard}
        columns={columns}
                    selectedMembers={selectedMembers}
        draggedTask={draggedTask}
        draggedColumn={draggedColumn}
        dragPreview={dragPreview}
                      availablePriorities={availablePriorities}
        availableTags={availableTags}
        taskViewMode={taskViewMode}
        isSearchActive={isSearchActive}
        searchFilters={searchFilters}
        filteredColumns={filteredColumns}
        activeFilters={activeFilters}
        gridStyle={gridStyle}
        sensors={sensors}
        collisionDetection={collisionDetection}

        onSelectMember={handleMemberToggle}
        onClearMemberSelections={handleClearMemberSelections}
        onSelectAllMembers={handleSelectAllMembers}
        includeAssignees={includeAssignees}
        includeWatchers={includeWatchers}
        includeCollaborators={includeCollaborators}
        includeRequesters={includeRequesters}
        includeSystem={includeSystem}
        onToggleAssignees={handleToggleAssignees}
        onToggleWatchers={handleToggleWatchers}
        onToggleCollaborators={handleToggleCollaborators}
        onToggleRequesters={handleToggleRequesters}
        onToggleSystem={handleToggleSystem}
        onToggleTaskViewMode={handleToggleTaskViewMode}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onToggleSearch={handleToggleSearch}
        onSearchFiltersChange={handleSearchFiltersChange}
                    onSelectBoard={handleBoardSelection}
                    onAddBoard={handleAddBoard}
                    onEditBoard={handleEditBoard}
                    onRemoveBoard={handleRemoveBoard}
                    onReorderBoards={handleBoardReorder}
        getTaskCountForBoard={getTaskCountForBoard}
                        onDragStart={(event) => {
                          // Clear any previous drag preview
                          setDragPreview(null);
                          
                          // Determine if dragging a column or task
                          const draggedItem = Object.values(columns).find(col => col.id === event.active.id);
                          if (draggedItem) {
                            // Column drag
                            handleColumnDragStart(event);
                          } else {
                            // Task drag - find the task
                            Object.values(columns).forEach(column => {
                              const task = column.tasks.find(t => t.id === event.active.id);
                              if (task) {
                                handleTaskDragStart(task);
                              }
                            });
                          }
                        }}
                        onDragEnd={(event) => {
                          // Clear drag preview
                          setDragPreview(null);
                          
                          // Determine if it was a column or task drag
                          const draggedColumn = Object.values(columns).find(col => col.id === event.active.id);
                          if (draggedColumn && currentUser?.roles?.includes('admin')) {
                            // Column drag (admin only)
                            handleColumnDragEnd(event);
                          } else {
                            // Task drag
                            handleUnifiedTaskDragEnd(event);
                          }
                        }}
                                    onAddTask={handleAddTask}
                                    columnWarnings={columnWarnings}
                                    onDismissColumnWarning={handleDismissColumnWarning}
                                    onRemoveTask={handleRemoveTask}
                                    onEditTask={handleEditTask}
                                    onCopyTask={handleCopyTask}
                                    onMoveTaskToColumn={handleMoveTaskToColumn}
                                    animateCopiedTaskId={animateCopiedTaskId}
                                    onEditColumn={handleEditColumn}
                                    onRemoveColumn={handleRemoveColumn}
                                    onAddColumn={handleAddColumn}
                                    showColumnDeleteConfirm={showColumnDeleteConfirm}
                                    onConfirmColumnDelete={handleConfirmColumnDelete}
                                    onCancelColumnDelete={handleCancelColumnDelete}
                                    getColumnTaskCount={getColumnTaskCount}
                                    onTaskDragStart={handleTaskDragStart}
                                    onTaskDragOver={handleTaskDragOver}
                                    onTaskDrop={handleTaskDrop}
                                    onSelectTask={handleSelectTask}
                                    onTaskDropOnBoard={handleTaskDropOnBoard}
                                    isTaskMiniMode={isTaskMiniMode}
                                    onTaskEnterMiniMode={handleTaskEnterMiniMode}
                                    onTaskExitMiniMode={handleTaskExitMiniMode}
      />

      <ModalManager
        selectedTask={selectedTask}
                                members={members}
        onTaskClose={() => handleSelectTask(null)}
        onTaskUpdate={handleEditTask}
        showHelpModal={showHelpModal}
        onHelpClose={() => setShowHelpModal(false)}
        showProfileModal={showProfileModal}
        currentUser={currentUser}
        onProfileClose={() => {
          setShowProfileModal(false);
          setIsProfileBeingEdited(false); // Reset editing state when modal closes
        }}
        onProfileUpdated={handleProfileUpdated}
        isProfileBeingEdited={isProfileBeingEdited}
        onProfileEditingChange={setIsProfileBeingEdited}
        onAccountDeleted={() => {
          // Account deleted successfully - handle logout and redirect
          handleLogout();
        }}
      />

      {showDebug && (
        <DebugPanel
          logs={queryLogs}
          onClear={clearQueryLogs}
        />
      )}

      {/* Global DragOverlay for tasks and columns */}
      <DragOverlay 
        dropAnimation={null}
        style={{ 
          cursor: 'none'
        }}
      >
        {draggedTask ? (
          isHoveringBoardTab ? (
            // Mini task icon when hovering over board tabs
            <div className="relative">
              {(() => {
                const taskMember = members.find(m => m.id === draggedTask.assignedTo);
                return (
                  <div className="w-8 h-8 rounded-lg bg-white shadow-lg border-2 border-blue-500 flex items-center justify-center relative">
                    {/* Task background with assignee color */}
                    <div 
                      className="absolute inset-0 rounded-lg opacity-20"
                      style={{ backgroundColor: taskMember?.color || '#3B82F6' }}
                    ></div>
                    
                    {/* Assignee avatar or initial */}
                    <div className="relative z-10">
                      {taskMember?.avatarUrl || taskMember?.googleAvatarUrl ? (
                        <img
                          src={taskMember.avatarUrl || taskMember.googleAvatarUrl}
                          alt={taskMember.name}
                          className="w-5 h-5 rounded-full object-cover border border-white"
                        />
                      ) : (
                        <div 
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white border border-white"
                          style={{ backgroundColor: taskMember?.color || '#3B82F6' }}
                        >
                          {taskMember?.name?.charAt(0)?.toUpperCase() || draggedTask.title.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    
                    {/* Subtle task indicator */}
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border border-white text-[8px] text-white flex items-center justify-center font-bold">
                      T
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            // Full task preview when not over board tabs
            <div className="bg-white p-4 rounded-lg shadow-lg border-l-4 border-blue-500 opacity-90 scale-105 transform rotate-2 ring-2 ring-blue-400 max-w-xs">
              <div className="font-medium text-gray-800 text-sm mb-2">{draggedTask.title}</div>
              <div className="text-xs text-gray-500">
                {draggedTask.description && draggedTask.description.length > 50 
                  ? draggedTask.description.substring(0, 50) + '...' 
                  : draggedTask.description}
              </div>
            </div>
          )
        ) : draggedColumn ? (
          <div className="bg-gray-50 rounded-lg p-4 flex flex-col min-h-[200px] opacity-90 scale-105 shadow-2xl transform rotate-3 ring-2 ring-blue-400">
            <div className="flex items-center justify-between mb-4">
              <div className="text-lg font-semibold text-gray-700">{draggedColumn.title}</div>
            </div>
            <div className="flex-1 min-h-[100px] space-y-2">
              {draggedColumn.tasks.map((task: Task) => (
                <div key={task.id} className="bg-white p-3 rounded border shadow-sm">
                  <div className="text-sm text-gray-600">{task.title}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </DragOverlay>
      </DndContext>
    </div>
  );
}
