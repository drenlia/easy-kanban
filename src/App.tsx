import React, { useState, useEffect } from 'react';
import { 
  TeamMember, 
  Task, 
  Column, 
  Columns, 
  Priority, 
  Board, 
  PriorityOption, 
  QueryLog, 
  DragPreview, 
  SiteSettings, 
  CurrentUser 
} from './types';
import TeamMembers from './components/TeamMembers';
import Tools from './components/Tools';
import SearchInterface from './components/SearchInterface';
import KanbanColumn from './components/Column';
import TaskCard from './components/TaskCard';
import TaskDetails from './components/TaskDetails';
import BoardTabs from './components/BoardTabs';
import HelpModal from './components/HelpModal';
import DebugPanel from './components/DebugPanel';
import ResetCountdown from './components/ResetCountdown';
import LoadingSpinner from './components/LoadingSpinner';

import Login from './components/Login';
import Admin from './components/Admin';
import Profile from './components/Profile';
import Header from './components/layout/Header';
import * as api from './api';
import { useLoadingState } from './hooks/useLoadingState';
import { useDebug } from './hooks/useDebug';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { generateUUID } from './utils/uuid';
import { loadUserPreferences, updateUserPreference } from './utils/userPreferences';
import { getAllPriorities } from './api';
import { 
  DEFAULT_COLUMNS, 
  DEFAULT_SITE_SETTINGS, 
  POLLING_INTERVAL, 
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
  getFilteredColumns, 
  getFilteredTaskCountForBoard, 
  hasActiveFilters 
} from './utils/taskUtils';
import { customCollisionDetection, calculateGridStyle } from './utils/dragDropUtils';
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy } from '@dnd-kit/sortable';



export default function App() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(getInitialSelectedBoard);
  const [columns, setColumns] = useState<Columns>({});
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [draggedColumn, setDraggedColumn] = useState<Column | null>(null);

  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [queryLogs, setQueryLogs] = useState<QueryLog[]>([]);
  const [dragCooldown, setDragCooldown] = useState(false);
  const [taskCreationPause, setTaskCreationPause] = useState(false);
  const [boardCreationPause, setBoardCreationPause] = useState(false);
  // Load user preferences from cookies
  const [userPrefs] = useState(() => loadUserPreferences());
  const [isTasksShrunk, setIsTasksShrunk] = useState(userPrefs.isTasksShrunk);
  const [isSearchActive, setIsSearchActive] = useState(userPrefs.isSearchActive);
  const [searchFilters, setSearchFilters] = useState(userPrefs.searchFilters);
  const [availablePriorities, setAvailablePriorities] = useState<PriorityOption[]>([]);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  

  const [currentPage, setCurrentPage] = useState<'kanban' | 'admin'>(getInitialPage);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [hasDefaultAdmin, setHasDefaultAdmin] = useState<boolean | null>(null);
  const [adminRefreshKey, setAdminRefreshKey] = useState(0);
  const [intendedDestination, setIntendedDestination] = useState<string | null>(null);
  const { loading, withLoading } = useLoadingState();
  
  // Custom hooks
  const showDebug = useDebug();
  useKeyboardShortcuts(() => setShowHelpModal(true));
  
  // Online users tracking removed (using polling instead of Socket.IO)



  // Simple polling for real-time collaboration
  const [isPolling, setIsPolling] = useState(false);
  const [lastPollTime, setLastPollTime] = useState<Date | null>(null);
  
  // Simple polling effect
  useEffect(() => {
    if (!isAuthenticated || currentPage !== 'kanban' || !selectedBoard) {
      setIsPolling(false);
      return;
    }
    
    // Don't poll during drag operations, cooldown, task creation, or board creation
    if (draggedTask || draggedColumn || dragCooldown || taskCreationPause || boardCreationPause) {
      setIsPolling(false);
      return;
    }
    
    setIsPolling(true);
    
    const pollForUpdates = async () => {
      try {
        const [loadedBoards, loadedMembers] = await Promise.all([
          api.getBoards(),
          api.getMembers()
        ]);
        
        // Update boards list if it changed
        const currentBoardsString = JSON.stringify(boards);
        const newBoardsString = JSON.stringify(loadedBoards);
        
        if (currentBoardsString !== newBoardsString) {
          setBoards(loadedBoards);
        }
        
        // Update members list if it changed
        const currentMembersString = JSON.stringify(members);
        const newMembersString = JSON.stringify(loadedMembers);
        
        if (currentMembersString !== newMembersString) {
          setMembers(loadedMembers);
        }
        
        // Update columns for the current board if it changed
        const currentBoard = loadedBoards.find(b => b.id === selectedBoard);
        if (currentBoard) {
          const currentColumnsString = JSON.stringify(columns);
          const newColumnsString = JSON.stringify(currentBoard.columns);
          
          if (currentColumnsString !== newColumnsString) {
            setColumns(currentBoard.columns || {});
          }
        }
        
        setLastPollTime(new Date());
      } catch (error) {
        // Silent error handling for polling
      }
    };
    
    // Initial poll
    pollForUpdates();
    
    // Set up interval
    const interval = setInterval(pollForUpdates, POLLING_INTERVAL);
    
    return () => {
      clearInterval(interval);
      setIsPolling(false);
    };
  }, [isAuthenticated, currentPage, selectedBoard, draggedTask, draggedColumn, dragCooldown, taskCreationPause, boardCreationPause, boards, columns, members]);

  // Mock socket object for compatibility with existing UI (removed unused variable)

  // Authentication handlers
  const handleLogin = (userData: any, token: string) => {
    localStorage.setItem('authToken', token);
    setCurrentUser(userData);
    setIsAuthenticated(true);
    
    // Redirect to intended destination if available
    if (intendedDestination) {
      window.location.hash = intendedDestination;
      setIntendedDestination(null); // Clear the intended destination
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setCurrentUser(null);
    setIsAuthenticated(false);
    setCurrentPage('kanban'); // Reset to kanban page
    setMembers([]);
    setBoards([]);
    setColumns({});
    setSelectedBoard(null);
    window.location.hash = ''; // Clear URL hash
    setSelectedMember(null);
  };



  const handleProfileUpdated = async () => {
    try {
      // Refresh current user data to get updated avatar
      const response = await api.getCurrentUser();
      setCurrentUser(response.user);
      
      // Also refresh members to get updated display names
      const loadedMembers = await api.getMembers();
      setMembers(loadedMembers);
      
      // If current user is admin, also refresh admin data to show updated display names
      if (response.user.roles?.includes('admin')) {
        // Force a re-render of the admin component by updating a key
        // This will cause the admin component to reload its data
        setAdminRefreshKey(prev => prev + 1);
      }
    } catch (error) {
      console.error('Failed to refresh profile data:', error);
    }
  };

  // Handle board selection with URL hash persistence
  const handleBoardSelection = (boardId: string) => {
    setSelectedBoard(boardId);
    window.location.hash = boardId;
  };

  // Header event handlers
  const handlePageChange = (page: 'kanban' | 'admin') => {
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
    setLastPollTime(new Date());
  };

  // Use the extracted collision detection function
  const collisionDetection = (args: any) => customCollisionDetection(args, draggedColumn, draggedTask, columns);

  // DnD sensors for both columns and tasks - optimized for smooth UX
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: DND_ACTIVATION_DISTANCE,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Check authentication on app load
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      // Verify token and get current user
      api.getCurrentUser()
        .then(response => {
          setCurrentUser(response.user);
          setIsAuthenticated(true);
        })
        .catch(() => {
          // Clear all authentication data on error
          localStorage.removeItem('authToken');
          setIsAuthenticated(false);
          setCurrentUser(null);
          // Reset to kanban page to avoid admin page issues
          setCurrentPage('kanban');
        });
    }
  }, []);

  // Load site settings
  useEffect(() => {
    const loadSiteSettings = async () => {
      try {
        const settings = await api.getPublicSettings();
        setSiteSettings(settings);
      } catch (error) {
        console.error('Failed to load site settings:', error);
      }
    };
    
    loadSiteSettings();
  }, []);

  // Check if default admin account exists
  useEffect(() => {
    const checkDefaultAdmin = async () => {
      try {
        // Check if default admin account exists using dedicated endpoint
        const response = await fetch('/api/auth/check-default-admin');
        
        if (response.ok) {
          const data = await response.json();
          setHasDefaultAdmin(data.exists);
        } else {
          // If we can't check, assume it exists for safety
          setHasDefaultAdmin(true);
        }
      } catch (error) {
        // Network or other errors - assume it exists for safety
        console.warn('Could not check default admin status, assuming exists for safety:', error);
        setHasDefaultAdmin(true);
      }
    };
    
    checkDefaultAdmin();
  }, []);

  // Handle authentication state changes
  useEffect(() => {
    // Only change page if we're definitely not authenticated (not during auth check)
    // Don't change page during the initial auth check when isAuthenticated is false
    if (!isAuthenticated && currentPage === 'admin' && !localStorage.getItem('authToken')) {
      // Store the intended destination before redirecting to login
      const currentHash = window.location.hash;
      if (currentHash) {
        setIntendedDestination(currentHash);
      }
      setCurrentPage('kanban');
    }
  }, [isAuthenticated, currentPage]);

  // Handle URL hash changes with PROPER ROUTING
  useEffect(() => {
    const handleHashChange = () => {
      const fullHash = window.location.hash;
      const hash = fullHash.replace('#', '');
      
      // Store intended destination if user is not authenticated
      if (!isAuthenticated && fullHash && fullHash !== '#login') {
        setIntendedDestination(fullHash);
      }
      
      // Parse the hash to determine routing
      const routeParts = hash.split('#');
      const mainRoute = routeParts[0];
      const subRoute = routeParts[1];
      
      // Handle main page routing
      if (['kanban', 'admin'].includes(mainRoute)) {
        if (mainRoute !== currentPage) {
          setCurrentPage(mainRoute as 'kanban' | 'admin');
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
      if (['kanban', 'admin'].includes(mainRoute)) {
        if (mainRoute !== currentPage) {
          setCurrentPage(mainRoute as 'kanban' | 'admin');
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

  // Handle Google OAuth callback with token - MUST run before routing
  useEffect(() => {
    // Check for token in URL hash (for OAuth callback)
    const hash = window.location.hash;
    if (hash.includes('token=')) {
      const tokenMatch = hash.match(/token=([^&]+)/);
      const errorMatch = hash.match(/error=([^&]+)/);
      
      if (tokenMatch) {
        const token = tokenMatch[1];

        
        // Store the token
        localStorage.setItem('authToken', token);
        
        // Clear the URL hash and let the routing logic handle the destination
        // The routing will automatically select the first board if no specific board is specified
        window.location.hash = '#kanban';
        
        // Force authentication check by triggering a state change
        // This ensures the auth effect runs with the new token
        setIsAuthenticated(false);
        
        // Fetch current user data immediately after OAuth
        api.getCurrentUser()
          .then(response => {
            setCurrentUser(response.user);
            setIsAuthenticated(true);
          })
                  .catch(() => {
          // Fallback: just set authenticated and let the auth effect handle it
          setIsAuthenticated(true);
        });
        
        return; // Exit early to prevent routing conflicts
      } else if (errorMatch) {
        // Handle OAuth errors
        console.error('OAuth error:', errorMatch[1]);
        // Clear the URL hash and redirect to login
        window.location.hash = '#login';
        return; // Exit early to prevent routing conflicts
      }
    }
  }, []);

  // Load initial data
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const loadInitialData = async () => {
      await withLoading('general', async () => {
        try {
                  const [loadedMembers, loadedBoards, loadedPriorities] = await Promise.all([
          api.getMembers(),
          api.getBoards(),
          getAllPriorities()
        ]);
          

          
          setMembers(loadedMembers);
          setBoards(loadedBoards);
          setAvailablePriorities(loadedPriorities || []);
          
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
  }, [isAuthenticated]);

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
    if (members.length > 0 && currentUser && !selectedMember) {
      // Default to current user if they exist in members, otherwise first member
      const currentUserMember = members.find(m => m.user_id === currentUser.id);
      
      if (currentUserMember) {
        setSelectedMember(currentUserMember.id);
      } else {
        setSelectedMember(members[0].id);
      }
    }
  }, [members, currentUser, selectedMember]);

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
      
      const boardId = generateUUID();
      const newBoard: Board = {
        id: boardId,
        title: 'New Board',
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
      console.log('Board reorder:', { boardId, oldIndex, newPosition, boardsLength: boards.length });
      
      if (oldIndex !== -1 && oldIndex !== newPosition) {
        const newBoards = [...boards];
        const [movedBoard] = newBoards.splice(oldIndex, 1);
        newBoards.splice(newPosition, 0, movedBoard);
        
        // Update positions to match new order
        const updatedBoards = newBoards.map((board, index) => ({
          ...board,
          position: index
        }));
        
        console.log('Updated boards order:', updatedBoards.map(b => ({ id: b.id, title: b.title, position: b.position })));
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
    if (!selectedMember || !selectedBoard) return;

    const newTask: Task = {
      id: generateUUID(),
      title: 'New Task',
      description: 'Task description',
      memberId: selectedMember,
      startDate: new Date().toISOString().split('T')[0],
      effort: 1,
      columnId,
      position: 0, // Backend will handle positioning
      priority: 'medium' as Priority,
      requesterId: selectedMember,
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
    
    const newTask: Task = {
      ...task,
      id: generateUUID(),
      title: `${task.title} (Copy)`,
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

  // Unified task drag handler for both vertical and horizontal moves
  const handleUnifiedTaskDragEnd = (event: DragEndEvent) => {
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
          
          // For cross-column moves, calculate the insertion index based on target column's task order
          if (sourceColumnId !== colId) {
            // Get target column tasks sorted by position
            const targetColumnTasks = [...column.tasks].sort((a, b) => (a.position || 0) - (b.position || 0));
            const targetTaskIndex = targetColumnTasks.findIndex(t => t.id === over.id);
            targetIndex = targetTaskIndex; // Insert at the target task's index position
            
                  } else {
            // Same column reordering - use the target task's actual position
            targetIndex = targetTask.position || 0;
            
                  }
        }
      });
    } else if (over.data?.current?.type === 'column') {
      // Dropping on column (add to end)
      targetColumnId = over.data.current.columnId as string;
      const columnTasks = columns[targetColumnId]?.tasks || [];
      targetIndex = columnTasks.length > 0 ? Math.max(...columnTasks.map(t => t.position || 0)) + 1 : 0;
      
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

  const handleRemoveColumn = async (columnId: string) => {
    try {
      await api.deleteColumn(columnId);
      const { [columnId]: removed, ...remainingColumns } = columns;
      setColumns(remainingColumns);
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to delete column:', error);
    }
  };

  const handleAddColumn = async () => {
    if (!selectedBoard) return;

    const columnId = generateUUID();
    const newColumn: Column = {
      id: columnId,
      title: 'New Column',
      tasks: [],
      boardId: selectedBoard
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
      
      console.log(`Column reorder: ${active.id} from ${oldIndex} to ${newIndex}`);
      
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

  const handleToggleTaskShrink = () => {
    const newValue = !isTasksShrunk;
    setIsTasksShrunk(newValue);
    updateUserPreference('isTasksShrunk', newValue);
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



  // Use extracted task filtering utilities
  const filteredColumns = getFilteredColumns(columns, searchFilters, isSearchActive);
  const activeFilters = hasActiveFilters(searchFilters, isSearchActive);
  const getTaskCountForBoard = (board: Board) => getFilteredTaskCountForBoard(board, searchFilters, isSearchActive);



  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} hasDefaultAdmin={hasDefaultAdmin ?? undefined} />;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {process.env.DEMO_ENABLED === 'true' && <ResetCountdown />}
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

      <div className={`flex-1 p-6 ${selectedTask ? 'pr-96' : ''}`}>
        <div className="max-w-[1400px] mx-auto">
          {currentPage === 'admin' ? (
            <Admin 
              key={adminRefreshKey}
              currentUser={currentUser} 
              onUsersChanged={async () => {
                try {
                  const loadedMembers = await api.getMembers();
                  setMembers(loadedMembers);
                } catch (error) {
                  console.error('Failed to refresh members:', error);
                }
              }}
              onSettingsChanged={async () => {
                try {
                  const settings = await api.getSettings();
                  setSiteSettings(settings);
                } catch (error) {
                  console.error('Failed to refresh site settings:', error);
                }
              }}
            />
          ) : (
            <>
              {loading.general ? (
                <LoadingSpinner size="large" className="mt-20" />
              ) : (
                <>
                  {/* Tools and Team Members in a flex container */}
                  <div className="flex gap-4 mb-4">
                    <Tools 
                      isTasksShrunk={isTasksShrunk}
                      onToggleTaskShrink={handleToggleTaskShrink}
                      isSearchActive={isSearchActive}
                      onToggleSearch={handleToggleSearch}
                    />
                    <div className="flex-1">
                  <TeamMembers
                    members={members}
                    selectedMember={selectedMember}
                    onSelectMember={setSelectedMember}
                  />
                    </div>
                  </div>

                  {/* Search Interface */}
                  {isSearchActive && (
                    <SearchInterface
                      filters={searchFilters}
                      members={members}
                      availablePriorities={availablePriorities}
                      onFiltersChange={handleSearchFiltersChange}
                    />
                  )}

                  {/* Board Tabs */}
                  <BoardTabs
                    boards={boards}
                    selectedBoard={selectedBoard}
                    onSelectBoard={handleBoardSelection}
                    onAddBoard={handleAddBoard}
                    onEditBoard={handleEditBoard}
                    onRemoveBoard={handleRemoveBoard}
                    onReorderBoards={handleBoardReorder}
                    isAdmin={currentUser?.roles?.includes('admin')}
                    getFilteredTaskCount={getTaskCountForBoard}
                    hasActiveFilters={activeFilters}
                  />

                  {selectedBoard && (
                    <div className="relative">
                      {(loading.tasks || loading.boards || loading.columns) && (
                        <div className="absolute inset-0 bg-white bg-opacity-50 z-10 flex items-center justify-center">
                          <LoadingSpinner size="medium" />
                        </div>
                      )}
                      {/* Unified Drag and Drop Context */}
                        <DndContext
                        sensors={sensors}
                        collisionDetection={collisionDetection}
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
                        onDragOver={(event) => {
                          const { active, over } = event;
                          
                          if (!over || !draggedTask) return;
                          
                          // Only show preview for task drags
                          const draggedTaskId = active.id as string;
                          
                          // Find source column
                          let sourceColumnId: string | null = null;
                          Object.entries(columns).forEach(([colId, column]) => {
                            if (column.tasks.find(t => t.id === draggedTaskId)) {
                              sourceColumnId = colId;
                            }
                          });
                          
                          if (!sourceColumnId) return;
                          
                          let targetColumnId: string | undefined;
                          let insertIndex: number | undefined;
                          
                          // Determine target column and insertion index
                          if (over.data?.current?.type === 'task') {
                            // Hovering over another task
                            Object.entries(columns).forEach(([colId, column]) => {
                              const targetTask = column.tasks.find(t => t.id === over.id);
                              if (targetTask) {
                                targetColumnId = colId;
                                if (sourceColumnId !== colId) {
                                  // Cross-column: calculate insertion index
                                  const sortedTasks = [...column.tasks].sort((a, b) => (a.position || 0) - (b.position || 0));
                                  const targetTaskIndex = sortedTasks.findIndex(t => t.id === over.id);
                                  
                                  // If it's the last task in the column, offer both "before" and "after" options
                                  // For now, always insert before the target task
                                  insertIndex = targetTaskIndex;
                                  
                                                              }
                              }
                            });
                          } else if (over.data?.current?.type === 'column' || over.data?.current?.type === 'column-bottom') {
                            // Hovering over column area (empty space) or bottom drop zone - drop at end
                            targetColumnId = over.data.current.columnId as string;
                            if (sourceColumnId !== targetColumnId) {
                              const columnTasks = columns[targetColumnId]?.tasks || [];
                              insertIndex = columnTasks.length;
                                                      } else {
                                                      }
                          } else {
                            // Fallback: check if we're over a column by ID or bottom area
                            const overId = over.id as string;
                            let possibleColumnId = overId;
                            
                            // Handle bottom drop zone IDs (e.g., "column-id-bottom")
                            if (overId.endsWith('-bottom')) {
                              possibleColumnId = overId.replace('-bottom', '');
                                                      }
                            
                            if (columns[possibleColumnId] && sourceColumnId !== possibleColumnId) {
                              targetColumnId = possibleColumnId;  // Use the EXTRACTED column ID, not the original
                              const columnTasks = columns[possibleColumnId]?.tasks || [];
                              insertIndex = columnTasks.length;
                                                      } else {
                                                      }
                          }
                          
                          // Update drag preview state for cross-column moves only
                          if (targetColumnId && sourceColumnId !== targetColumnId && insertIndex !== undefined) {
                            setDragPreview({
                              targetColumnId,
                              insertIndex
                            });
                          } else {
                            setDragPreview(null);
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
                      >
                        {/* Admin view with column drag and drop */}
                        {currentUser?.roles?.includes('admin') ? (
                          <SortableContext
                            items={Object.values(columns)
                              .sort((a, b) => (a.position || 0) - (b.position || 0))
                              .map(col => col.id)}
                            strategy={rectSortingStrategy}
                          >
                            <div style={gridStyle}>
                              {Object.values(filteredColumns)
                                .sort((a, b) => (a.position || 0) - (b.position || 0))
                                .map(column => (
                                  <KanbanColumn
                                    key={column.id}
                                    column={column}
                                    members={members}
                                    selectedMember={selectedMember}
                                    draggedTask={draggedTask}
                                    draggedColumn={draggedColumn}
                                    dragPreview={dragPreview}
                                    onAddTask={handleAddTask}
                                    onRemoveTask={handleRemoveTask}
                                    onEditTask={handleEditTask}
                                    onCopyTask={handleCopyTask}
                                    onEditColumn={handleEditColumn}
                                    onRemoveColumn={handleRemoveColumn}
                                    onAddColumn={handleAddColumn}
                                    onTaskDragStart={handleTaskDragStart}
                                    onTaskDragEnd={() => {}}
                                    onTaskDragOver={handleTaskDragOver}
                                    onTaskDrop={handleTaskDrop}
                                    onSelectTask={setSelectedTask}
                                    isAdmin={true}
                                    isTasksShrunk={isTasksShrunk}
                                    availablePriorities={availablePriorities}
                                  />
                                ))}
                            </div>
                          </SortableContext>
                        ) : (
                          /* Regular user view */
                          <>
                        <div style={gridStyle}>
                          {Object.values(filteredColumns)
                            .sort((a, b) => (a.position || 0) - (b.position || 0))
                            .map(column => (
                              <KanbanColumn
                                key={column.id}
                                column={column}
                                members={members}
                                selectedMember={selectedMember}
                                draggedTask={draggedTask}
                                draggedColumn={draggedColumn}
                                dragPreview={dragPreview}
                                onAddTask={handleAddTask}
                                onRemoveTask={handleRemoveTask}
                                onEditTask={handleEditTask}
                                onCopyTask={handleCopyTask}
                                onEditColumn={handleEditColumn}
                                onRemoveColumn={handleRemoveColumn}
                                onAddColumn={handleAddColumn}
                                onTaskDragStart={handleTaskDragStart}
                                    onTaskDragEnd={() => {}}
                                onTaskDragOver={handleTaskDragOver}
                                onTaskDrop={handleTaskDrop}
                                onSelectTask={setSelectedTask}
                                isAdmin={false}
                                isTasksShrunk={isTasksShrunk}
                                availablePriorities={availablePriorities}
                              />
                            ))}
                        </div>
                          </>
                        )}
                        
                        <DragOverlay 
                          dropAnimation={null}
                        >
                          {draggedColumn ? (
                            <div className="bg-gray-50 rounded-lg p-4 flex flex-col min-h-[200px] opacity-90 scale-105 shadow-2xl transform rotate-3 ring-2 ring-blue-400">
                              <div className="flex items-center justify-between mb-4">
                                <div className="text-lg font-semibold text-gray-700">{draggedColumn.title}</div>
                              </div>
                              <div className="flex-1 min-h-[100px] space-y-2">
                                {draggedColumn.tasks.map(task => (
                                  <div key={task.id} className="bg-white p-3 rounded border shadow-sm">
                                    <div className="text-sm text-gray-600">{task.title}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : draggedTask ? (
                            /* Render exact replica of the original TaskCard */
                            <div style={{ transform: 'rotate(3deg) scale(1.05)', opacity: 0.95 }}>
                              <TaskCard
                                task={draggedTask}
                                member={members.find(m => m.id === draggedTask.memberId)!}
                                members={members}
                                onRemove={() => {}}
                                onEdit={() => {}}
                                onCopy={() => {}}
                                onDragStart={() => {}}
                                onDragEnd={() => {}}
                                onSelect={() => {}}
                                isDragDisabled={true}
                                isTasksShrunk={isTasksShrunk}
                                availablePriorities={availablePriorities}
                              />
                            </div>
                          ) : null}
                        </DragOverlay>
                      </DndContext>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {selectedTask && (
        <div className="fixed top-0 right-0 h-full">
          <TaskDetails
            task={selectedTask}
            members={members}
            onClose={() => setSelectedTask(null)}
            onUpdate={handleEditTask}
          />
        </div>
      )}

      {showDebug && (
        <DebugPanel
          logs={queryLogs}
          onClear={clearQueryLogs}
        />
      )}

      <HelpModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
      />

      <Profile 
        isOpen={showProfileModal} 
        onClose={() => setShowProfileModal(false)} 
        currentUser={{
          ...currentUser,
          displayName: members.find(m => m.user_id === currentUser?.id)?.name || `${currentUser?.firstName} ${currentUser?.lastName}`,
          // Ensure authProvider is explicitly set
          authProvider: currentUser?.authProvider || 'local'
        }}
        onProfileUpdated={handleProfileUpdated}
      />
    </div>
  );
}
