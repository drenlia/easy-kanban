import React, { useState, useEffect, useCallback } from 'react';
import { TeamMember, Task, Column, Columns, Priority, Board } from './types';
import TeamMembers from './components/TeamMembers';
import KanbanColumn from './components/Column';
import TaskDetails from './components/TaskDetails';
import BoardTabs from './components/BoardTabs';
import HelpModal from './components/HelpModal';
import DebugPanel from './components/DebugPanel';
import ResetCountdown from './components/ResetCountdown';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSpinner from './components/LoadingSpinner';
import { Github, HelpCircle, LogOut, User } from 'lucide-react';
import Login from './components/Login';
import Admin from './components/Admin';
import Profile from './components/Profile';
import * as api from './api';
import { useLoadingState } from './hooks/useLoadingState';
import { TaskSchema, BoardSchema, ColumnSchema } from './validation/schemas';
import { z } from 'zod';
import { generateUUID } from './utils/uuid';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy } from '@dnd-kit/sortable';

interface QueryLog {
  id: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE' | 'ERROR';
  query: string;
  timestamp: string;
  error?: string;
}

const DEFAULT_COLUMNS = [
  { id: 'todo', title: 'To Do' },
  { id: 'progress', title: 'In Progress' },
  { id: 'testing', title: 'Testing' },
  { id: 'completed', title: 'Completed' }
];

export default function App() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(() => {
    // Get board from URL hash, but only if it's not a page identifier or admin tab
    const hash = window.location.hash.replace('#', '');
    // Don't treat as board ID if it's a page identifier or admin tab
    const pageIdentifiers = ['kanban', 'admin'];
    const adminTabs = ['users', 'site-settings', 'sso'];
    const isPageOrTab = pageIdentifiers.includes(hash) || adminTabs.includes(hash);
    
    return hash && !isPageOrTab ? hash : null;
  });
  const [columns, setColumns] = useState<Columns>({});
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [draggedColumn, setDraggedColumn] = useState<Column | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [queryLogs, setQueryLogs] = useState<QueryLog[]>([]);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isOAuthProcessing, setIsOAuthProcessing] = useState(false);
  
  // Debug currentUser changes
  useEffect(() => {
    console.log('👤 currentUser changed:', currentUser);
  }, [currentUser]);
  const [currentPage, setCurrentPage] = useState<'kanban' | 'admin'>(() => {
    // Get page from URL hash, fallback to 'kanban'
    const hash = window.location.hash.replace('#', '');
    return ['kanban', 'admin'].includes(hash) ? hash : 'kanban';
  });
  const [siteSettings, setSiteSettings] = useState({ SITE_NAME: 'Easy Kanban', SITE_URL: 'http://localhost:3000' });
  const [hasDefaultAdmin, setHasDefaultAdmin] = useState<boolean | null>(null);
  const [adminRefreshKey, setAdminRefreshKey] = useState(0);
  const [intendedDestination, setIntendedDestination] = useState<string | null>(null);
  const { loading, withLoading } = useLoadingState();

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

  const handleAuthError = () => {
    // Clear all authentication data and reset state
    localStorage.removeItem('authToken');
    setCurrentUser(null);
    setIsAuthenticated(false);
    setCurrentPage('kanban');
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

  // DnD sensors for columns
  const columnSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
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
    if (currentPage === 'kanban' && boards.length > 0 && !selectedBoard) {
      // If no board is selected and we're on kanban page, select the first board
      const firstBoard = boards[0];
      if (firstBoard) {
        setSelectedBoard(firstBoard.id);
        // Update URL to reflect the selected board
        window.location.hash = `#kanban#${firstBoard.id}`;
      }
    }
  }, [currentPage, boards, selectedBoard]);

  // Handle Google OAuth callback with token - MUST run before routing
  useEffect(() => {
    // Check for token in URL hash (for OAuth callback)
    const hash = window.location.hash;
    if (hash.includes('token=')) {
      const tokenMatch = hash.match(/token=([^&]+)/);
      const errorMatch = hash.match(/error=([^&]+)/);
      const newUserMatch = hash.match(/newUser=([^&]+)/);
      
      if (tokenMatch) {
        const token = tokenMatch[1];
        const isNewUser = newUserMatch && newUserMatch[1] === 'true';
        console.log('OAuth token received, processing...', isNewUser ? '(new user)' : '(existing user)');
        
        // Store the token
        localStorage.setItem('authToken', token);
        
        // Clear the URL hash and let the routing logic handle the destination
        // The routing will automatically select the first board if no specific board is specified
        window.location.hash = '#kanban';
        
        // Force authentication check by triggering a state change
        // This ensures the auth effect runs with the new token
        setIsAuthenticated(false);
        
        // Fetch current user data immediately after OAuth
        console.log('🔐 OAuth: Fetching current user data...');
        api.getCurrentUser()
          .then(response => {
            console.log('✅ OAuth: Current user data received:', response.user);
            setCurrentUser(response.user);
            setIsAuthenticated(true);
          })
          .catch(error => {
            console.error('❌ OAuth: Failed to get current user:', error);
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
          const [loadedMembers, loadedBoards] = await Promise.all([
            api.getMembers(),
            api.getBoards()
          ]);
          

          
          setMembers(loadedMembers);
          setBoards(loadedBoards);
          
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
      const boardId = generateUUID();
      const newBoard: Board = {
        id: boardId,
        title: 'New Board',
        columns: {}
      };

      // Create the board first
      const createdBoard = await api.createBoard(newBoard);

      // Create default columns for the new board
      const columnPromises = DEFAULT_COLUMNS.map(async col => {
        const column: Column = {
          id: `${col.id}-${boardId}`,
          title: col.title,
          tasks: [],
          boardId: boardId
        };
        return api.createColumn(column);
      });

      await Promise.all(columnPromises);

      // Refresh board data to get the complete structure
      await refreshBoardData();
      
      // Set the new board as selected
      setSelectedBoard(boardId);
      
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to add board:', error);
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

    const columnTasks = [...(columns[columnId]?.tasks || [])]
      .sort((a, b) => (a.position || 0) - (b.position || 0));

    const newTask: Task = {
      id: generateUUID(),
      title: 'New Task',
      description: 'Task description',
      memberId: selectedMember,
      startDate: new Date().toISOString().split('T')[0],
      effort: 1,
      columnId,
      position: 0,
      priority: 'medium' as Priority,
      requesterId: selectedMember,
      boardId: selectedBoard,
      comments: []
    };

    // Optimistic update
    const updatedTasks = [newTask, ...columnTasks.map((task, index) => ({
      ...task,
      position: (index + 1) * 1000
    }))];
    
    setColumns(prev => ({
      ...prev,
      [columnId]: {
        ...prev[columnId],
        tasks: updatedTasks
      }
    }));

    try {
      await withLoading('tasks', async () => {
        await api.createTask(newTask);
        
        if (columnTasks.length > 0) {
          const updatePromises = columnTasks.map((task, index) => 
            api.updateTask({ ...task, position: (index + 1) * 1000 })
          );
          await Promise.all(updatePromises);
        }
      });
    } catch (error) {
      console.error('Failed to create task:', error);
      // Rollback by refreshing
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
    const newTask: Task = {
      ...task,
      id: generateUUID(),
      title: `${task.title} (Copy)`,
      comments: []
    };

    try {
      const createdTask = await api.createTask(newTask);
      await refreshBoardData(); // Refresh to ensure consistent state
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to copy task:', error);
    }
  };

  const handleTaskDragStart = (task: Task) => {
    setDraggedTask(task);
  };

  const handleTaskDragEnd = () => {
    setDraggedTask(null);
  };

  const handleTaskDragOver = (e: React.DragEvent, columnId: string, index: number) => {
    e.preventDefault();
  };

  const handleTaskDrop = async (columnId: string, index: number) => {
    if (!draggedTask) return;

    const sourceColumnId = draggedTask.columnId;
    const sourceColumn = columns[sourceColumnId];
    const targetColumn = columns[columnId];
    
    if (!sourceColumn || !targetColumn) return;

    // Remove task from source
    const sourceTasks = sourceColumn.tasks.filter(t => t.id !== draggedTask.id);
    
    // Get target tasks
    const targetTasks = sourceColumnId === columnId 
      ? sourceTasks 
      : [...targetColumn.tasks];

    // Create updated task with new position
    const updatedTask = {
      ...draggedTask,
      columnId,
      position: index
    };

    // Insert task at new position
    targetTasks.splice(index, 0, updatedTask);

    // Update positions for all affected tasks
    const updatePositions = (tasks: Task[]): Task[] => {
      return tasks.map((task, idx) => ({
        ...task,
        position: idx * 1000  // Use larger intervals for positions
      }));
    };

    const updatedSourceTasks = updatePositions(sourceTasks);
    const updatedTargetTasks = updatePositions(targetTasks);

    // Update UI first
    setColumns(prev => ({
      ...prev,
      [sourceColumnId]: {
        ...sourceColumn,
        tasks: updatedSourceTasks
      },
      [columnId]: {
        ...targetColumn,
        tasks: updatedTargetTasks
      }
    }));

    // Then update database
    try {
      // First update the moved task
      await api.updateTask(updatedTask);
      
      // Then update all other affected tasks
      const promises = [];
      
      // Update source column tasks if different from target
      if (sourceColumnId !== columnId) {
        promises.push(...updatedSourceTasks.map(task => api.updateTask(task)));
      }
      
      // Update target column tasks
      promises.push(...updatedTargetTasks
        .filter(task => task.id !== updatedTask.id)
        .map(task => api.updateTask(task)));

      await Promise.all(promises);
    } catch (error) {
      console.error('Failed to update task positions:', error);
      await refreshBoardData();
    }

    setDraggedTask(null);
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
      const createdColumn = await api.createColumn(newColumn);
      await refreshBoardData(); // Refresh to ensure consistent state
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to create column:', error);
    }
  };

  const handleColumnDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveColumnId(active.id as string);
    const draggedColumn = Object.values(columns).find(col => col.id === active.id);
    if (draggedColumn) {
      setDraggedColumn(draggedColumn);
    }
  };

  const handleColumnDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    setActiveColumnId(null);
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
  const gridCols = columnCount <= 4 ? 4 : Math.min(6, columnCount);
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${gridCols}, minmax(300px, 1fr))`,
    gap: '1.5rem',
    width: '100%',
    overflowX: 'auto'
  };

  const clearQueryLogs = async () => {
    setQueryLogs([]);
  };

  // Get debug parameter from URL
  const showDebug = new URLSearchParams(window.location.search).get('debug') === 'true';

  // Keyboard shortcut for help (F1)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F1') {
        event.preventDefault();
        setShowHelpModal(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} hasDefaultAdmin={hasDefaultAdmin} />;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {process.env.DEMO_ENABLED === 'true' && <ResetCountdown />}
      <header className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-[1400px] mx-auto px-6 py-2.5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <a href={siteSettings.SITE_URL || '#'} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors">
              {siteSettings.SITE_NAME || 'Easy Kanban'}
            </a>
          </div>
          <div className="flex items-center gap-3">
            {currentUser && (
              <>
                <div className="flex items-center gap-2">
                  {/* User Avatar */}
                  <div className="relative group">
                    <button
                      className="flex items-center gap-2 p-1.5 hover:bg-gray-100 rounded-full transition-colors"
                      onClick={() => setShowProfileModal(true)}
                      title="Profile Settings"
                    >
                      {currentUser?.avatarUrl ? (
                        <img
                          src={currentUser.avatarUrl}
                          alt="Profile"
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div 
                          className="h-8 w-8 rounded-full flex items-center justify-center"
                          style={{ 
                            backgroundColor: members.find(m => m.user_id === currentUser?.id)?.color || '#4ECDC4' 
                          }}
                        >
                          <span className="text-sm font-medium text-white">
                            {currentUser.firstName?.[0]}{currentUser.lastName?.[0]}
                          </span>
                        </div>
                      )}
                    </button>
                    
                    {/* Profile Dropdown */}
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-md shadow-lg z-50 border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                      <div className="py-1">
                        <button
                          onClick={() => setShowProfileModal(true)}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <User size={16} />
                          Profile
                        </button>
                        <button
                          onClick={handleLogout}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <LogOut size={16} />
                          Logout
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Navigation */}
                <div className="flex items-center gap-2 ml-4">
                  {currentUser.roles?.includes('admin') && (
                    <button
                      onClick={() => {
                        setCurrentPage('kanban');
                        // If there was a previously selected board, restore it
                        if (selectedBoard) {
                          window.location.hash = `kanban#${selectedBoard}`;
                        } else {
                          window.location.hash = 'kanban';
                        }
                      }}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        currentPage === 'kanban'
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                    >
                      Kanban
                    </button>
                  )}
                  {currentUser.roles?.includes('admin') && (
                    <button
                      onClick={() => {
                        setCurrentPage('admin');
                        window.location.hash = 'admin';
                      }}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        currentPage === 'admin'
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      Admin
                    </button>
                  )}
                </div>
              </>
            )}
            <button
              onClick={() => setShowHelpModal(true)}
              className="p-1.5 hover:bg-gray-50 rounded-full transition-colors text-gray-500 hover:text-gray-700"
              title="Help (F1)"
            >
              <HelpCircle size={20} />
            </button>
            <a
              href="https://github.com/drenlia/easy-kanban"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <Github size={20} />
            </a>
          </div>
        </div>
      </header>

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
                  <TeamMembers
                    members={members}
                    selectedMember={selectedMember}
                    onSelectMember={setSelectedMember}
                  />

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
                  />

                  {selectedBoard && (
                    <div className="relative">
                      {(loading.tasks || loading.boards || loading.columns) && (
                        <div className="absolute inset-0 bg-white bg-opacity-50 z-10 flex items-center justify-center">
                          <LoadingSpinner size="medium" />
                        </div>
                      )}
                      {/* Column Drag and Drop Context - Admin Only */}
                      {currentUser?.roles?.includes('admin') ? (
                        <DndContext
                          sensors={columnSensors}
                          collisionDetection={closestCenter}
                          onDragStart={handleColumnDragStart}
                          onDragEnd={handleColumnDragEnd}
                        >
                          <SortableContext
                            items={Object.values(columns)
                              .sort((a, b) => (a.position || 0) - (b.position || 0))
                              .map(col => col.id)}
                            strategy={rectSortingStrategy}
                          >
                            <div style={gridStyle}>
                              {Object.values(columns)
                                .sort((a, b) => (a.position || 0) - (b.position || 0))
                                .map(column => (
                                  <KanbanColumn
                                    key={column.id}
                                    column={column}
                                    members={members}
                                    selectedMember={selectedMember}
                                    draggedTask={draggedTask}
                                    draggedColumn={draggedColumn}
                                    onAddTask={handleAddTask}
                                    onRemoveTask={handleRemoveTask}
                                    onEditTask={handleEditTask}
                                    onCopyTask={handleCopyTask}
                                    onEditColumn={handleEditColumn}
                                    onRemoveColumn={handleRemoveColumn}
                                    onAddColumn={handleAddColumn}
                                    onTaskDragStart={handleTaskDragStart}
                                    onTaskDragEnd={handleTaskDragEnd}
                                    onTaskDragOver={handleTaskDragOver}
                                    onTaskDrop={handleTaskDrop}
                                    onSelectTask={setSelectedTask}
                                    isAdmin={true}
                                  />
                                ))}
                            </div>
                          </SortableContext>
                          <DragOverlay>
                            {draggedColumn ? (
                              <div className="bg-gray-50 rounded-lg p-4 flex flex-col min-h-[200px] opacity-50 scale-95 shadow-2xl transform rotate-2">
                                <div className="flex items-center justify-between mb-4">
                                  <div className="text-lg font-semibold text-gray-700">{draggedColumn.title}</div>
                                </div>
                                <div className="flex-1 min-h-[100px] space-y-3">
                                  {draggedColumn.tasks.map(task => (
                                    <div key={task.id} className="bg-white p-3 rounded border">
                                      <div className="text-sm text-gray-600">{task.title}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </DragOverlay>
                        </DndContext>
                      ) : (
                        // Regular user view - no column drag and drop
                        <div style={gridStyle}>
                          {Object.values(columns)
                            .sort((a, b) => (a.position || 0) - (b.position || 0))
                            .map(column => (
                              <KanbanColumn
                                key={column.id}
                                column={column}
                                members={members}
                                selectedMember={selectedMember}
                                draggedTask={draggedTask}
                                draggedColumn={draggedColumn}
                                onAddTask={handleAddTask}
                                onRemoveTask={handleRemoveTask}
                                onEditTask={handleEditTask}
                                onCopyTask={handleCopyTask}
                                onEditColumn={handleEditColumn}
                                onRemoveColumn={handleRemoveColumn}
                                onAddColumn={handleAddColumn}
                                onTaskDragStart={handleTaskDragStart}
                                onTaskDragEnd={handleTaskDragEnd}
                                onTaskDragOver={handleTaskDragOver}
                                onTaskDrop={handleTaskDrop}
                                onSelectTask={setSelectedTask}
                                isAdmin={false}
                              />
                            ))}
                        </div>
                      )}
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
