import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { TeamMember, Task, Column, Columns, Board, PriorityOption, Tag, QueryLog, DragPreview } from './types';
import { SavedFilterView, getSavedFilterView } from './api';
import DebugPanel from './components/DebugPanel';
import { ThemeProvider } from './contexts/ThemeContext';
import { TourProvider } from './contexts/TourContext';
import Login from './components/Login';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import ResetPasswordSuccess from './components/ResetPasswordSuccess';
import ActivateAccount from './components/ActivateAccount';
import Header from './components/layout/Header';
import MainLayout from './components/layout/MainLayout';
import LoadingSpinner from './components/LoadingSpinner';

import { lazyWithRetry } from './utils/lazyWithRetry';

// Lazy load TaskPage to reduce initial bundle size with retry logic
const TaskPage = lazyWithRetry(() => import('./components/TaskPage'));

// Loading fallback component for lazy-loaded pages
const PageLoader = () => (
  <div className="flex items-center justify-center h-64">
    <LoadingSpinner />
  </div>
);
// Lazy load ModalManager to reduce initial bundle size (only needed when authenticated) with retry logic
const ModalManager = lazyWithRetry(() => import('./components/layout/ModalManager'));
import TaskDeleteConfirmation from './components/TaskDeleteConfirmation';
import ActivityFeed from './components/ActivityFeed';
import TaskLinkingOverlay from './components/TaskLinkingOverlay';
import NetworkStatusIndicator from './components/NetworkStatusIndicator';
import VersionUpdateBanner from './components/VersionUpdateBanner';
import { useTaskDeleteConfirmation } from './hooks/useTaskDeleteConfirmation';
import api, { getMembers, getBoards, deleteTask, updateTask, reorderTasks, reorderColumns, reorderBoards, updateColumn, updateBoard, createTaskAtTop, createTask, createColumn, createBoard, deleteColumn, deleteBoard, getUserSettings, createUser, getUserStatus, getActivityFeed, updateSavedFilterView, getCurrentUser, updateAppUrl } from './api';
import { toast, ToastContainer } from './utils/toast';
import { useLoadingState } from './hooks/useLoadingState';
import { useDebug } from './hooks/useDebug';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAuth } from './hooks/useAuth';
import { useDataPolling, UserStatus } from './hooks/useDataPolling';
import { useActivityFeed } from './hooks/useActivityFeed';
import { useVersionStatus } from './hooks/useVersionStatus';
import { useModalState } from './hooks/useModalState';
import { useTaskLinking } from './hooks/useTaskLinking';
import { useTaskFilters } from './hooks/useTaskFilters';
import { useTaskWebSocket } from './hooks/useTaskWebSocket';
import { useCommentWebSocket } from './hooks/useCommentWebSocket';
import { useColumnWebSocket } from './hooks/useColumnWebSocket';
import { useBoardWebSocket } from './hooks/useBoardWebSocket';
import { useMemberWebSocket } from './hooks/useMemberWebSocket';
import { useSettingsWebSocket } from './hooks/useSettingsWebSocket';
import { useWebSocketConnection } from './hooks/useWebSocketConnection';
import { generateUUID } from './utils/uuid';
import websocketClient from './services/websocketClient';
import { loadUserPreferences, loadUserPreferencesAsync, updateUserPreference, updateActivityFeedPreference, loadAdminDefaults, TaskViewMode, ViewMode, isGloballySavingPreferences, registerSavingStateCallback, UserPreferences } from './utils/userPreferences';
import { versionDetection } from './utils/versionDetection';
import { getAllPriorities, getAllTags, getTags, getPriorities, getSettings, getTaskWatchers, getTaskCollaborators, addTagToTask, removeTagFromTask, getBoardTaskRelationships } from './api';
import { 
  DEFAULT_COLUMNS, 
  DRAG_COOLDOWN_DURATION, 
  TASK_CREATION_PAUSE_DURATION, 
  BOARD_CREATION_PAUSE_DURATION,
  DND_ACTIVATION_DISTANCE 
} from './constants';
import { 
  getInitialSelectedBoard, 
  getInitialPage,
  parseUrlHash,
  parseProjectRoute,
  parseTaskRoute,
  findBoardByProjectId,
  shouldSkipAutoBoardSelection
} from './utils/routingUtils';
import { 
  filterTasks,
  getFilteredTaskCountForBoard, 
  hasActiveFilters,
  wouldTaskBeFilteredOut 
} from './utils/taskUtils';
import { moveTaskToBoard } from './api';
import { customCollisionDetection, calculateGridStyle } from './utils/dragDropUtils';
import { clearCustomCursor } from './utils/cursorUtils';
import { generateUniqueBoardName } from './utils/boardUtils';
import { renumberColumns } from './utils/columnUtils';
import { handleSameColumnReorder, handleCrossColumnMove } from './utils/taskReorderingUtils';
import { handleInviteUser as handleInviteUserUtil } from './utils/userInvitationUtils';
import { KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DndContext, DragOverlay } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { SimpleDragDropManager } from './components/dnd/SimpleDragDropManager';
import SimpleDragOverlay from './components/dnd/SimpleDragOverlay';
import { SYSTEM_MEMBER_ID, WEBSOCKET_THROTTLE_MS } from './constants/appConstants';
import { checkInstanceStatusOnError, getDefaultPriorityName } from './utils/appHelpers';

// Extend Window interface for WebSocket flags
declare global {
  interface Window {
    justUpdatedFromWebSocket?: boolean;
    setJustUpdatedFromWebSocket?: (value: boolean) => void;
  }
}



export default function App() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const selectedBoardRef = useRef<string | null>(null); // Initialize as null, will be set after auth
  
  // Debug: Log when selectedBoard changes and update ref
  useEffect(() => {
    selectedBoardRef.current = selectedBoard;
  }, [selectedBoard]);
  const [columns, setColumns] = useState<Columns>({});
  const [systemSettings, setSystemSettings] = useState<{ TASK_DELETE_CONFIRM?: string; SHOW_ACTIVITY_FEED?: string }>({});
  const [kanbanColumnWidth, setKanbanColumnWidth] = useState<number>(300); // Default 300px
  
  // User Status for permission refresh
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const userStatusRef = useRef<UserStatus | null>(null);
  
  // Initialize extracted hooks
  const versionStatus = useVersionStatus();
  const modalState = useModalState();
  const taskLinking = useTaskLinking();
  
  // Activity Feed hook - initialized after currentUser is available (will be done after useAuth)
  
  // Utility function to check instance status on API failures
  // Wrapped to pass setInstanceStatus to the extracted helper function
  const handleInstanceStatusError = async (error: any) => {
    return checkInstanceStatusOnError(error, versionStatus.setInstanceStatus);
  };
  
  // Drag states for BoardTabs integration
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const draggedTaskRef = useRef<Task | null>(null);
  const [draggedColumn, setDraggedColumn] = useState<Column | null>(null);
  const [isHoveringBoardTab, setIsHoveringBoardTab] = useState<boolean>(false);
  const boardTabHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [isTaskMiniMode, setIsTaskMiniMode] = useState(false);
  const dragStartedRef = useRef<boolean>(false);
  
  // Throttle WebSocket updates to prevent performance issues
  const lastWebSocketUpdateRef = useRef<number>(0);
  const dragCooldownTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskDetailsOptions, setTaskDetailsOptions] = useState<{ scrollToComments?: boolean }>({});

  // Helper function to update user preferences with current user ID
  const updateCurrentUserPreference = <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => {
    // Global saving state is now handled automatically in saveUserPreferences
    updateUserPreference(key, value, currentUser?.id || null);
  };

  // Helper function to get initial selected board with user preference fallback
  const getInitialSelectedBoardWithPreferences = (userId: string | null): string | null => {
    // First, check URL hash
    const boardFromUrl = getInitialSelectedBoard();
    if (boardFromUrl) {
      return boardFromUrl;
    }

    // If no URL hash, check user preferences
    const userPrefs = loadUserPreferences(userId);
    return userPrefs.lastSelectedBoard;
  };

  // Enhanced setSelectedTask that also updates user preferences
  const handleSelectTask = useCallback((task: Task | null, options?: { scrollToComments?: boolean }) => {
    setSelectedTask(task);
    updateCurrentUserPreference('selectedTaskId', task?.id || null);
    
    // Store scroll options for TaskDetails
    if (task && options?.scrollToComments) {
      setTaskDetailsOptions({ scrollToComments: true });
    } else {
      setTaskDetailsOptions({});
    }
  }, []);

  // Task deletion handler with confirmation
  const handleTaskDelete = async (taskId: string) => {
    try {
      await deleteTask(taskId);
      
      // Remove task from local state and renumber remaining tasks
      const updatedColumns = { ...columns };
      const tasksToUpdate: Array<{ taskId: string; position: number; columnId: string }> = [];
      
      Object.keys(updatedColumns).forEach(columnId => {
        const column = updatedColumns[columnId];
        if (column) {
          // Remove the deleted task
          const remainingTasks = column.tasks.filter(task => task.id !== taskId);
          
          // Renumber remaining tasks sequentially from 0
          const renumberedTasks = remainingTasks
            .sort((a, b) => (a.position || 0) - (b.position || 0))
            .map((task, index) => {
              // Track tasks that need position updates
              if (task.position !== index) {
                tasksToUpdate.push({
                  taskId: task.id,
                  position: index,
                  columnId: columnId
                });
              }
              return {
                ...task,
                position: index
              };
            });
          
          updatedColumns[columnId] = {
            ...column,
            tasks: renumberedTasks
          };
        }
      });
      setColumns(updatedColumns);
      
      // Also update filteredColumns to maintain consistency
      taskFilters.setFilteredColumns(prevFilteredColumns => {
        const updatedFilteredColumns = { ...prevFilteredColumns };
        Object.keys(updatedFilteredColumns).forEach(columnId => {
          const column = updatedFilteredColumns[columnId];
          if (column) {
            // Remove the deleted task
            const remainingTasks = column.tasks.filter(task => task.id !== taskId);
            
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
      
      // Send position updates to server for tasks that changed positions
      if (tasksToUpdate.length > 0) {
        try {
          await Promise.all(tasksToUpdate.map(({ taskId, position, columnId }) => {
            // Find the complete task data from the updated columns
            const task = updatedColumns[columnId]?.tasks.find(t => t.id === taskId);
            if (task) {
              return updateTask({ ...task, position, columnId });
            }
            return Promise.resolve();
          }));
          // Positions updated successfully
        } catch (error) {
          console.error('❌ Failed to update task positions after deletion:', error);
        }
      }
      
      // Refresh board data to ensure consistent state
      await refreshBoardData();
      await fetchQueryLogs();
    } catch (error) {
      // console.error('Failed to delete task:', error);
      throw error; // Re-throw so the hook can handle the error state
    }
  };

  // This will be defined later after the hooks are initialized
  let handleRemoveTask: (taskId: string, clickEvent?: React.MouseEvent) => Promise<void>;
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
  // Load user preferences from cookies (will be updated when user is authenticated)
  const [userPrefs] = useState(() => loadUserPreferences());
  
  // Filter state will be initialized via useTaskFilters hook after updateCurrentUserPreference is defined
  // const [boardTaskCounts, setBoardTaskCounts] = useState<{[boardId: string]: number}>({});
  const [availablePriorities, setAvailablePriorities] = useState<PriorityOption[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  
  // Column visibility state for each board
  const [boardColumnVisibility, setBoardColumnVisibility] = useState<{[boardId: string]: string[]}>({});

  // Handle column visibility changes
  const handleBoardColumnVisibilityChange = (boardId: string, visibleColumns: string[]) => {
    const newVisibility = {
      ...boardColumnVisibility,
      [boardId]: visibleColumns
    };
    
    setBoardColumnVisibility(newVisibility);
    
    // Save to user settings for persistence across page reloads
    updateUserPreference('boardColumnVisibility' as any, newVisibility);
    
    // Save to current filter view if it exists
    if (taskFilters.currentFilterView) {
      // Update the view in the database
      updateSavedFilterView(taskFilters.currentFilterView.id, {
        filters: {
          ...taskFilters.currentFilterView,
          boardColumnFilter: JSON.stringify(newVisibility)
        }
      }).catch(error => {
        console.error('Failed to save column filter to view:', error);
      });
    }
  };

  // Load column filter from current filter view or user settings
  // Note: This useEffect will be moved after taskFilters hook initialization
  // Modal state extracted to useModalState hook (modalState)
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [currentPage, setCurrentPage] = useState<'kanban' | 'admin' | 'reports' | 'test' | 'forgot-password' | 'reset-password' | 'reset-success' | 'activate-account'>(getInitialPage);

  // Sync local state with global preference saving state
  useEffect(() => {
    const updateSavingState = () => {
      setIsSavingPreferences(isGloballySavingPreferences());
    };
    
    // Initial sync
    updateSavingState();
    
    // Register for updates
    const unregister = registerSavingStateCallback(updateSavingState);
    
    return unregister;
  }, []);
  const [resetToken, setResetToken] = useState<string>('');
  const [activationToken, setActivationToken] = useState<string>('');
  const [activationEmail, setActivationEmail] = useState<string>('');
  const [activationParsed, setActivationParsed] = useState<boolean>(false);
  const [adminRefreshKey, setAdminRefreshKey] = useState(0);
  const [columnWarnings, setColumnWarnings] = useState<{[columnId: string]: string}>({});
  const [showColumnDeleteConfirm, setShowColumnDeleteConfirm] = useState<string | null>(null);
  
  // Task linking state extracted to useTaskLinking hook (taskLinking)
  
  // Debug showColumnDeleteConfirm changes
  useEffect(() => {
    if (showColumnDeleteConfirm) {
      // console.log(`📋 showColumnDeleteConfirm changed to: ${showColumnDeleteConfirm}`);
    } else {
      // console.log(`📋 showColumnDeleteConfirm cleared`);
    }
  }, [showColumnDeleteConfirm]);

  // Sync selectedMembers when members list changes (e.g., user deletion)
  // Note: This useEffect will be moved after taskFilters hook initialization

  // Helper function to get default priority name
  // Get default priority name using extracted helper function
  const getDefaultPriority = (): string => {
    return getDefaultPriorityName(availablePriorities);
  };

  // Authentication hook
  const {
    isAuthenticated,
    authChecked,
    currentUser,
    siteSettings,
    hasDefaultAdmin,
    intendedDestination,
    justRedirected,
    handleLogin,
    handleLogout,
    handleProfileUpdated,
    refreshSiteSettings,
    setSiteSettings,
    setCurrentUser,
  } = useAuth({
    onDataClear: () => {
    setMembers([]);
    setBoards([]);
    setColumns({});
    setSelectedBoard(null);
    // Note: selectedMembers will be cleared via taskFilters hook
    },
    onAdminRefresh: () => {
      setAdminRefreshKey(prev => prev + 1);
    },
    onPageChange: setCurrentPage,
    onMembersRefresh: async () => {
      const loadedMembers = await getMembers(taskFilters.includeSystem);
      setMembers(loadedMembers);
    },
  });
  const { loading, withLoading } = useLoadingState();
  
  // Initialize Task Filters hook (requires columns, members, boards, and updateCurrentUserPreference)
  const taskFilters = useTaskFilters({
    columns,
    members,
    boards,
    updateCurrentUserPreference,
  });
  
  // Initialize Activity Feed hook now that currentUser is available
  const activityFeed = useActivityFeed(currentUser?.id || null);

  // User status update handler with force logout functionality
  const handleUserStatusUpdate = (newUserStatus: UserStatus) => {
    const previousStatus = userStatusRef.current;
    // Reduced logging to avoid performance violations
    if (process.env.NODE_ENV === 'development') {
      // console.log('🔍 [UserStatus] Update handler called');
    }
    
    // Handle force logout scenarios - only for actual deactivation/deletion
    if (newUserStatus.forceLogout) {
      // console.log('🔐 Force logout detected. Logging out...');
      
      // Clear all local storage and session data
      localStorage.clear();
      sessionStorage.clear();
      
      // Force logout
      handleLogout();
      return;
    }
    
    // Handle permission changes (soft updates) - only if we have a previous status to compare
    if (previousStatus !== null && previousStatus.isAdmin !== newUserStatus.isAdmin) {
      const permissionChange = newUserStatus.isAdmin ? 'promoted to admin' : 'demoted to user';
      // console.log(`🔄 User permission changed: ${permissionChange}`);
      // console.log(`🔄 Previous isAdmin: ${previousStatus.isAdmin}, New isAdmin: ${newUserStatus.isAdmin}`);
      // console.log('🔄 Calling handleProfileUpdated to refresh user roles...');
      
      // Refresh the current user data to update roles in the UI
      handleProfileUpdated().then(() => {
        // console.log('✅ User profile refreshed successfully');
      }).catch(error => {
        // console.error('❌ Failed to refresh user profile after permission change:', error);
      });
      
      // Optional: Show a notification about permission change
      // You could add a toast notification here if desired
    } else if (previousStatus === null) {
      // console.log('🔍 [UserStatus] Initial status set, no action needed');
    } else {
      // console.log('🔍 [UserStatus] No permission change detected');
    }
    
    // Update both state and ref - but only update state if values actually changed
    userStatusRef.current = newUserStatus;
    
    // Only trigger state update if the values actually changed to prevent unnecessary re-renders
    if (previousStatus === null || 
        previousStatus.isActive !== newUserStatus.isActive ||
        previousStatus.isAdmin !== newUserStatus.isAdmin ||
        previousStatus.forceLogout !== newUserStatus.forceLogout) {
      setUserStatus(newUserStatus);
    }
  };

  
  // Custom hooks
  const showDebug = useDebug();
  useKeyboardShortcuts(() => modalState.setShowHelpModal(true));
  
  // Initialize task deletion confirmation hook
  const taskDeleteConfirmation = useTaskDeleteConfirmation({
    currentUser,
    systemSettings,
    onDelete: handleTaskDelete
  });

  // Now define the handleRemoveTask function
  handleRemoveTask = async (taskId: string, clickEvent?: React.MouseEvent) => {
    // If the task being deleted is currently open in TaskDetails, close it first
    if (selectedTask && selectedTask.id === taskId) {
      handleSelectTask(null);
    }

    // Find the full task object from the columns
    let taskToDelete: Task | null = null;
    Object.values(columns).forEach(column => {
      const foundTask = column.tasks.find(task => task.id === taskId);
      if (foundTask) {
        taskToDelete = foundTask;
      }
    });

    if (taskToDelete) {
      await taskDeleteConfirmation.deleteTask(taskToDelete, clickEvent);
    } else {
      // If task not found in local state, create minimal object and delete
      await taskDeleteConfirmation.deleteTask({ id: taskId } as Task, clickEvent);
    }
  };
  
  // Close task delete confirmation when clicking outside
  useEffect(() => {
    if (!taskDeleteConfirmation.confirmationTask) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      // Don't close if clicking on the delete confirmation popup or its children
      if (target.closest('.delete-confirmation')) {
        return;
      }
      taskDeleteConfirmation.cancelDelete();
    };

    // Use a small delay to avoid interfering with the initial click
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 10);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [taskDeleteConfirmation.confirmationTask, taskDeleteConfirmation.cancelDelete]);

  // Note: Activity feed settings are now loaded together with other user preferences
  // in the consolidated useEffect below to avoid duplicate API calls

  // Load admin defaults for new user preferences (only for admin users)
  useEffect(() => {
    if (!isAuthenticated || !currentUser?.roles?.includes('admin')) return;
    
    const initializeAdminDefaults = async () => {
      try {
        await loadAdminDefaults();
        // console.log('Admin defaults loaded for admin users');
      } catch (error) {
        // console.warn('Failed to load admin defaults:', error);
      }
    };
    
    initializeAdminDefaults();
  }, [isAuthenticated, currentUser?.roles, userStatus?.isAdmin]); // Run when authentication status, user roles, or admin status change

  // Initialize i18n and change language based on user preferences or browser language
  const { i18n } = useTranslation();
  
  // Helper function to detect browser language
  const detectBrowserLanguage = (): 'en' | 'fr' => {
    const browserLang = navigator.language || (navigator as any).userLanguage || 'en';
    // Check if browser language starts with 'fr' (fr, fr-FR, fr-CA, etc.)
    if (browserLang.toLowerCase().startsWith('fr')) {
      return 'fr';
    }
    return 'en';
  };
  
  // Load auto-refresh setting and sprint selection from user preferences
  useEffect(() => {
    if (currentUser) {
      const restorePreferences = async () => {
        try {
          // Load preferences from database (not just cookies)
          const prefs = await loadUserPreferencesAsync(currentUser.id);
          
          // Language logic:
          // 1. If user has saved preference in DB, use it (it's "set in stone")
          // 2. Otherwise, check localStorage (what they chose on login page or browser default)
          // 3. If no localStorage, detect browser language
          // 4. Save the chosen language to DB as user preference
          let languageToUse: 'en' | 'fr' = prefs.language;
          
          if (!languageToUse) {
            // No saved preference - check localStorage first (user might have toggled on login page)
            const localStorageLang = localStorage.getItem('i18nextLng');
            if (localStorageLang === 'fr' || localStorageLang === 'en') {
              languageToUse = localStorageLang as 'en' | 'fr';
            } else {
              // No localStorage either - detect browser language
              languageToUse = detectBrowserLanguage();
            }
            // Save the chosen language as user preference (makes it "set in stone")
            await updateUserPreference('language', languageToUse, currentUser.id);
          }
          
          // Change i18n language if needed
          if (i18n.language !== languageToUse) {
            await i18n.changeLanguage(languageToUse);
          }
          
          // setIsAutoRefreshEnabled(prefs.appSettings.autoRefreshEnabled ?? true); // Disabled - using real-time updates
          
          // Restore sprint selection and apply date filters
          const savedSprintId = prefs.selectedSprintId;
          
          if (savedSprintId) {
            // Simply restore the sprint selection (no date filter manipulation)
            taskFilters.setSelectedSprintId(savedSprintId);
          } else {
            // No saved sprint, make sure state is cleared
            taskFilters.setSelectedSprintId(null);
          }
        } catch (error) {
          console.error('Failed to restore preferences:', error);
        }
      };
      
      restorePreferences();
    } else {
      // If no user, detect browser language and use it (saved in localStorage by i18next)
      const browserLang = detectBrowserLanguage();
      if (i18n.language !== browserLang) {
        i18n.changeLanguage(browserLang);
      }
    }
  }, [currentUser, i18n]);

  // Auto-refresh toggle handler - DISABLED (using real-time updates)
  // const handleToggleAutoRefresh = useCallback(async () => {
  //   const newValue = !isAutoRefreshEnabled;
  //   setIsAutoRefreshEnabled(newValue);
  //   
  //   // Save to user preferences
  //   if (currentUser) {
  //     try {
  //       await updateUserPreference('appSettings', {
  //         ...loadUserPreferences(currentUser.id).appSettings,
  //         autoRefreshEnabled: newValue
  //       }, currentUser.id);
  //     } catch (error) {
  //       // console.error('Failed to save auto-refresh preference:', error);
  //     }
  //   }
  // }, [isAutoRefreshEnabled, currentUser]);

  // Activity feed handlers extracted to useActivityFeed hook (activityFeed)
  
  const handleRelationshipsUpdate = useCallback((newRelationships: any[]) => {
    // console.log('🔗 [App] handleRelationshipsUpdate called with:', newRelationships.length, 'relationships');
    taskLinking.setBoardRelationships(newRelationships);
    taskLinking.setTaskRelationships({}); // Clear Kanban hover cache to force fresh data
  }, [taskLinking]);

  // Relationships are now loaded in the board selection effect below to avoid duplicate calls

  // Stable callback functions to prevent infinite useEffect loops in useDataPolling
  const handleMembersUpdate = useCallback((newMembers: TeamMember[]) => {
    if (!modalState.isProfileBeingEdited) {
      setMembers(newMembers);
    }
  }, [modalState.isProfileBeingEdited]);

  const handleActivitiesUpdate = useCallback((newActivities: any[]) => {
    activityFeed.setActivities(newActivities);
  }, [activityFeed]);

  const handleSharedFilterViewsUpdate = useCallback((newFilters: SavedFilterView[]) => {
    taskFilters.setSharedFilterViews(prev => {
      // Merge new filters with existing ones, avoiding duplicates
      const existingIds = new Set(prev.map(f => f.id));
      const newFiltersToAdd = newFilters.filter(f => !existingIds.has(f.id));
      return [...prev, ...newFiltersToAdd];
    });
  }, [taskFilters.setSharedFilterViews]);

  // Data polling for backup/fallback only (WebSocket handles real-time updates)
  // Disable polling when help modal is open or auto-refresh is disabled
  // Only poll every 60 seconds as backup when WebSocket might be unavailable
  const shouldPoll = false; // Temporarily disable polling to test WebSocket updates
  
  
  const { isPolling, lastPollTime, updateLastPollTime } = useDataPolling({
    enabled: shouldPoll,
    selectedBoard,
    currentBoards: boards,
    currentMembers: members,
    currentColumns: columns,
    currentSiteSettings: siteSettings,
    currentPriorities: availablePriorities,
    currentActivities: activityFeed.activities,
    currentSharedFilters: taskFilters.sharedFilterViews,
    currentRelationships: taskLinking.boardRelationships,
    includeSystem: taskFilters.includeSystem,
    onBoardsUpdate: setBoards,
    onMembersUpdate: handleMembersUpdate,
    onColumnsUpdate: setColumns,
    onSiteSettingsUpdate: setSiteSettings,
    onPrioritiesUpdate: setAvailablePriorities,
    onActivitiesUpdate: handleActivitiesUpdate,
    onSharedFiltersUpdate: taskFilters.setSharedFilterViews,
    onRelationshipsUpdate: handleRelationshipsUpdate,
  });

  // Separate lightweight polling for user status on all pages
  useEffect(() => {
    if (!isAuthenticated) return;

    let statusInterval: NodeJS.Timeout | null = null;
    let isPolling = false;

    const pollUserStatus = async () => {
      // Skip polling if we're currently saving preferences to avoid conflicts
      if (isSavingPreferences) {
        if (process.env.NODE_ENV === 'development') {
          // console.log('⏸️ [UserStatus] Skipping poll - preferences being saved');
        }
        return;
      }

      // Prevent overlapping polls
      if (isPolling) return;
      isPolling = true;

      try {
        const startTime = performance.now();
        const [newUserStatus] = await Promise.all([
          getUserStatus()
        ]);
        const apiTime = performance.now() - startTime;
        
        // Reduced logging to avoid performance violations
        if (process.env.NODE_ENV === 'development') {
          // console.log(`🔍 [UserStatus] Polled status (API: ${apiTime.toFixed(1)}ms)`);
        }
        
        const updateStartTime = performance.now();
        handleUserStatusUpdate(newUserStatus);
        
        const updateTime = performance.now() - updateStartTime;
        
        if (process.env.NODE_ENV === 'development' && updateTime > 50) {
          // console.log(`⚠️ [UserStatus] Update handler took ${updateTime.toFixed(1)}ms`);
        }
      } catch (error: any) {
        // Handle user account deletion (404 error)
        if (error?.response?.status === 404) {
          console.log('🔐 User account no longer exists - forcing logout');
          
          // Clear all local storage and session data
          localStorage.clear();
          sessionStorage.clear();
          
          // Force logout
          handleLogout();
          return;
        }
        
        // For other errors (network issues, etc.), just log
        // console.error('❌ [UserStatus] Polling failed:', error);
      } finally {
        isPolling = false;
      }
    };

    // Initial check
    pollUserStatus();

    // Poll every 30 seconds for user status updates (reduced frequency to improve performance)
    statusInterval = setInterval(pollUserStatus, 30000);

    return () => {
      if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
      }
    };
  }, [isAuthenticated, isSavingPreferences]);


  // Check instance status on page load
  useEffect(() => {
    const checkInitialInstanceStatus = async () => {
      try {
        const response = await api.get('/auth/instance-status');
        if (!response.data.isActive) {
          versionStatus.setInstanceStatus({
            status: response.data.status,
            message: response.data.message,
            isDismissed: false
          });
        }
      } catch (error) {
        // If we can't check status, assume it's active
        console.warn('Failed to check initial instance status:', error);
      }
    };

    if (isAuthenticated) {
      checkInitialInstanceStatus();
    }
  }, [isAuthenticated]);
  // Track if we've had our first successful connection and if we were offline
  const hasConnectedOnceRef = useRef(false);
  const wasOfflineRef = useRef(false);
  
  // Track network online/offline state
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Store the latest refreshBoardData function in a ref so we always call the current version
  const refreshBoardDataRef = useRef<(() => Promise<void>) | null>(null);
  
  // Track pending task refreshes (to cancel fallback if WebSocket event arrives)
  const pendingTaskRefreshesRef = useRef<Set<string>>(new Set());

  // Initialize WebSocket hooks after all dependencies are available
  const taskWebSocket = useTaskWebSocket({
    setBoards,
    setColumns,
    setSelectedTask,
    selectedBoardRef,
    pendingTaskRefreshesRef,
    refreshBoardDataRef,
    taskFilters: {
      setFilteredColumns: taskFilters.setFilteredColumns,
      viewModeRef: taskFilters.viewModeRef,
      shouldIncludeTaskRef: taskFilters.shouldIncludeTaskRef,
    },
    taskLinking,
    currentUser,
    selectedTask,
  });

  const commentWebSocket = useCommentWebSocket({
    setColumns,
    setSelectedTask,
    selectedBoardRef,
    selectedTask,
  });

  const columnWebSocket = useColumnWebSocket({
    setBoards,
    setColumns,
    selectedBoardRef,
    currentUser,
  });

  const boardWebSocket = useBoardWebSocket({
    setSelectedBoard,
    setColumns,
    setBoards,
    selectedBoardRef,
    refreshBoardDataRef,
  });

  const memberWebSocket = useMemberWebSocket({
    setMembers,
    setCurrentUser,
    handleMembersUpdate,
    handleActivitiesUpdate,
    handleSharedFilterViewsUpdate,
    taskFilters: {
      includeSystem: taskFilters.includeSystem,
      setSharedFilterViews: taskFilters.setSharedFilterViews,
    },
    currentUser,
  });

  const settingsWebSocket = useSettingsWebSocket({
    setAvailableTags,
    setAvailablePriorities,
    setSiteSettings,
    versionStatus,
  });

  const websocketConnection = useWebSocketConnection({
    setIsOnline,
    selectedBoardRef,
    refreshBoardDataRef,
    hasConnectedOnceRef,
    wasOfflineRef,
    activityFeed,
  });
  
  // Memoize WebSocket event handlers to prevent duplicate registrations
  // NOTE: Handlers are now provided by the hooks above

  // ============================================================================
  // WEBSOCKET CONNECTION EFFECT
  // ============================================================================
  // Register all memoized handlers and connect
  
  useEffect(() => {
    if (!isAuthenticated || !localStorage.getItem('authToken')) {
      return;
    }

    // Register handlers BEFORE connecting
    websocketClient.onWebSocketReady(websocketConnection.handleWebSocketReady);
    websocketClient.onConnect(websocketConnection.handleReconnect);
    websocketClient.onDisconnect(websocketConnection.handleDisconnect);

    // Listen to browser online/offline events
    window.addEventListener('online', websocketConnection.handleBrowserOnline);
    window.addEventListener('offline', websocketConnection.handleBrowserOffline);

    // Connect to WebSocket only when we have a valid token
    websocketClient.connect();
    
    // Register all event listeners
    websocketClient.onTaskCreated(taskWebSocket.handleTaskCreated);
    websocketClient.onTaskUpdated(taskWebSocket.handleTaskUpdated);
    websocketClient.onTaskDeleted(taskWebSocket.handleTaskDeleted);
    websocketClient.onTaskRelationshipCreated(taskWebSocket.handleTaskRelationshipCreated);
    websocketClient.onTaskRelationshipDeleted(taskWebSocket.handleTaskRelationshipDeleted);
    websocketClient.onColumnUpdated(columnWebSocket.handleColumnUpdated);
    websocketClient.onColumnDeleted(columnWebSocket.handleColumnDeleted);
    websocketClient.onColumnReordered(columnWebSocket.handleColumnReordered);
    websocketClient.onBoardCreated(boardWebSocket.handleBoardCreated);
    websocketClient.onBoardUpdated(boardWebSocket.handleBoardUpdated);
    websocketClient.onBoardDeleted(boardWebSocket.handleBoardDeleted);
    websocketClient.onBoardReordered(boardWebSocket.handleBoardReordered);
    websocketClient.onColumnCreated(columnWebSocket.handleColumnCreated);
    websocketClient.onTaskWatcherAdded(taskWebSocket.handleTaskWatcherAdded);
    websocketClient.onTaskWatcherRemoved(taskWebSocket.handleTaskWatcherRemoved);
    websocketClient.onTaskCollaboratorAdded(taskWebSocket.handleTaskCollaboratorAdded);
    websocketClient.onTaskCollaboratorRemoved(taskWebSocket.handleTaskCollaboratorRemoved);
    websocketClient.onMemberUpdated(memberWebSocket.handleMemberUpdated);
    websocketClient.onMemberCreated(memberWebSocket.handleMemberCreated);
    websocketClient.onMemberDeleted(memberWebSocket.handleMemberDeleted);
    websocketClient.onUserProfileUpdated(memberWebSocket.handleUserProfileUpdated);
    websocketClient.onActivityUpdated(memberWebSocket.handleActivityUpdated);
    websocketClient.onFilterCreated(memberWebSocket.handleFilterCreated);
    websocketClient.onFilterUpdated(memberWebSocket.handleFilterUpdated);
    websocketClient.onFilterDeleted(memberWebSocket.handleFilterDeleted);
    websocketClient.onTagCreated(settingsWebSocket.handleTagCreated);
    websocketClient.onTagUpdated(settingsWebSocket.handleTagUpdated);
    websocketClient.onTagDeleted(settingsWebSocket.handleTagDeleted);
    websocketClient.onPriorityCreated(settingsWebSocket.handlePriorityCreated);
    websocketClient.onPriorityUpdated(settingsWebSocket.handlePriorityUpdated);
    websocketClient.onPriorityDeleted(settingsWebSocket.handlePriorityDeleted);
    websocketClient.onPriorityReordered(settingsWebSocket.handlePriorityReordered);
    websocketClient.onSettingsUpdated(settingsWebSocket.handleSettingsUpdated);
    websocketClient.onTaskTagAdded(taskWebSocket.handleTaskTagAdded);
    websocketClient.onTaskTagRemoved(taskWebSocket.handleTaskTagRemoved);
    websocketClient.onInstanceStatusUpdated(settingsWebSocket.handleInstanceStatusUpdated);
    websocketClient.onVersionUpdated(settingsWebSocket.handleVersionUpdated);
    websocketClient.onCommentCreated(commentWebSocket.handleCommentCreated);
    websocketClient.onCommentUpdated(commentWebSocket.handleCommentUpdated);
    websocketClient.onCommentDeleted(commentWebSocket.handleCommentDeleted);

    return () => {
      // Clean up event listeners
      websocketClient.offTaskCreated(taskWebSocket.handleTaskCreated);
      websocketClient.offTaskUpdated(taskWebSocket.handleTaskUpdated);
      websocketClient.offTaskDeleted(taskWebSocket.handleTaskDeleted);
      websocketClient.offTaskRelationshipCreated(taskWebSocket.handleTaskRelationshipCreated);
      websocketClient.offTaskRelationshipDeleted(taskWebSocket.handleTaskRelationshipDeleted);
      websocketClient.offColumnUpdated(columnWebSocket.handleColumnUpdated);
      websocketClient.offColumnDeleted(columnWebSocket.handleColumnDeleted);
      websocketClient.offColumnReordered(columnWebSocket.handleColumnReordered);
      websocketClient.offBoardCreated(boardWebSocket.handleBoardCreated);
      websocketClient.offBoardUpdated(boardWebSocket.handleBoardUpdated);
      websocketClient.offBoardDeleted(boardWebSocket.handleBoardDeleted);
      websocketClient.offBoardReordered(boardWebSocket.handleBoardReordered);
      websocketClient.offColumnCreated(columnWebSocket.handleColumnCreated);
      websocketClient.offTaskWatcherAdded(taskWebSocket.handleTaskWatcherAdded);
      websocketClient.offTaskWatcherRemoved(taskWebSocket.handleTaskWatcherRemoved);
      websocketClient.offTaskCollaboratorAdded(taskWebSocket.handleTaskCollaboratorAdded);
      websocketClient.offTaskCollaboratorRemoved(taskWebSocket.handleTaskCollaboratorRemoved);
      websocketClient.offMemberUpdated(memberWebSocket.handleMemberUpdated);
      websocketClient.offMemberCreated(memberWebSocket.handleMemberCreated);
      websocketClient.offMemberDeleted(memberWebSocket.handleMemberDeleted);
      websocketClient.offUserProfileUpdated(memberWebSocket.handleUserProfileUpdated);
      websocketClient.offActivityUpdated(memberWebSocket.handleActivityUpdated);
      websocketClient.offFilterCreated(memberWebSocket.handleFilterCreated);
      websocketClient.offFilterUpdated(memberWebSocket.handleFilterUpdated);
      websocketClient.offFilterDeleted(memberWebSocket.handleFilterDeleted);
      websocketClient.offTagCreated(settingsWebSocket.handleTagCreated);
      websocketClient.offTagUpdated(settingsWebSocket.handleTagUpdated);
      websocketClient.offTagDeleted(settingsWebSocket.handleTagDeleted);
      websocketClient.offPriorityCreated(settingsWebSocket.handlePriorityCreated);
      websocketClient.offPriorityUpdated(settingsWebSocket.handlePriorityUpdated);
      websocketClient.offPriorityDeleted(settingsWebSocket.handlePriorityDeleted);
      websocketClient.offPriorityReordered(settingsWebSocket.handlePriorityReordered);
      websocketClient.offSettingsUpdated(settingsWebSocket.handleSettingsUpdated);
      websocketClient.offTaskTagAdded(taskWebSocket.handleTaskTagAdded);
      websocketClient.offTaskTagRemoved(taskWebSocket.handleTaskTagRemoved);
      websocketClient.offInstanceStatusUpdated(settingsWebSocket.handleInstanceStatusUpdated);
      websocketClient.offVersionUpdated(settingsWebSocket.handleVersionUpdated);
      websocketClient.offCommentCreated(commentWebSocket.handleCommentCreated);
      websocketClient.offCommentUpdated(commentWebSocket.handleCommentUpdated);
      websocketClient.offCommentDeleted(commentWebSocket.handleCommentDeleted);
      websocketClient.offWebSocketReady(websocketConnection.handleWebSocketReady);
      websocketClient.offConnect(websocketConnection.handleReconnect);
      websocketClient.offDisconnect(websocketConnection.handleDisconnect);
      window.removeEventListener('online', websocketConnection.handleBrowserOnline);
      window.removeEventListener('offline', websocketConnection.handleBrowserOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]); // Only depend on isAuthenticated - handlers are memoized with useCallback in hooks

  // Join board when selectedBoard changes
  useEffect(() => {
    if (selectedBoard) {
      websocketClient.joinBoardWhenReady(selectedBoard);
    }
  }, [selectedBoard]);

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

  // ============================================================================
  // WEBSOCKET CONNECTION EFFECT
  // ============================================================================
  // Register all memoized handlers and connect
  
  useEffect(() => {
    if (!isAuthenticated || !localStorage.getItem('authToken')) {
      return;
    }

    // Register handlers BEFORE connecting
    websocketClient.onWebSocketReady(websocketConnection.handleWebSocketReady);
    websocketClient.onConnect(websocketConnection.handleReconnect);
    websocketClient.onDisconnect(websocketConnection.handleDisconnect);

    // Register all WebSocket event handlers
    websocketClient.onTaskCreated(taskWebSocket.handleTaskCreated);
    websocketClient.onTaskUpdated(taskWebSocket.handleTaskUpdated);
    websocketClient.onTaskDeleted(taskWebSocket.handleTaskDeleted);
    websocketClient.onTaskRelationshipCreated(taskWebSocket.handleTaskRelationshipCreated);
    websocketClient.onTaskRelationshipDeleted(taskWebSocket.handleTaskRelationshipDeleted);
    websocketClient.onColumnUpdated(columnWebSocket.handleColumnUpdated);
    websocketClient.onColumnDeleted(columnWebSocket.handleColumnDeleted);
    websocketClient.onColumnReordered(columnWebSocket.handleColumnReordered);
    websocketClient.onBoardCreated(boardWebSocket.handleBoardCreated);
    websocketClient.onBoardUpdated(boardWebSocket.handleBoardUpdated);
    websocketClient.onBoardDeleted(boardWebSocket.handleBoardDeleted);
    websocketClient.onBoardReordered(boardWebSocket.handleBoardReordered);
    websocketClient.onColumnCreated(columnWebSocket.handleColumnCreated);
    websocketClient.onTaskWatcherAdded(taskWebSocket.handleTaskWatcherAdded);
    websocketClient.onTaskWatcherRemoved(taskWebSocket.handleTaskWatcherRemoved);
    websocketClient.onTaskCollaboratorAdded(taskWebSocket.handleTaskCollaboratorAdded);
    websocketClient.onTaskCollaboratorRemoved(taskWebSocket.handleTaskCollaboratorRemoved);
    websocketClient.onMemberUpdated(memberWebSocket.handleMemberUpdated);
    websocketClient.onMemberCreated(memberWebSocket.handleMemberCreated);
    websocketClient.onMemberDeleted(memberWebSocket.handleMemberDeleted);
    websocketClient.onUserProfileUpdated(memberWebSocket.handleUserProfileUpdated);
    websocketClient.onActivityUpdated(memberWebSocket.handleActivityUpdated);
    websocketClient.onFilterCreated(memberWebSocket.handleFilterCreated);
    websocketClient.onFilterUpdated(memberWebSocket.handleFilterUpdated);
    websocketClient.onFilterDeleted(memberWebSocket.handleFilterDeleted);
    websocketClient.onTagCreated(settingsWebSocket.handleTagCreated);
    websocketClient.onTagUpdated(settingsWebSocket.handleTagUpdated);
    websocketClient.onTagDeleted(settingsWebSocket.handleTagDeleted);
    websocketClient.onPriorityCreated(settingsWebSocket.handlePriorityCreated);
    websocketClient.onPriorityUpdated(settingsWebSocket.handlePriorityUpdated);
    websocketClient.onPriorityDeleted(settingsWebSocket.handlePriorityDeleted);
    websocketClient.onPriorityReordered(settingsWebSocket.handlePriorityReordered);
    websocketClient.onSettingsUpdated(settingsWebSocket.handleSettingsUpdated);
    websocketClient.onTaskTagAdded(taskWebSocket.handleTaskTagAdded);
    websocketClient.onTaskTagRemoved(taskWebSocket.handleTaskTagRemoved);
    websocketClient.onInstanceStatusUpdated(settingsWebSocket.handleInstanceStatusUpdated);
    websocketClient.onVersionUpdated(settingsWebSocket.handleVersionUpdated);
    websocketClient.onCommentCreated(commentWebSocket.handleCommentCreated);
    websocketClient.onCommentUpdated(commentWebSocket.handleCommentUpdated);
    websocketClient.onCommentDeleted(commentWebSocket.handleCommentDeleted);

    // Register browser online/offline handlers
    window.addEventListener('online', websocketConnection.handleBrowserOnline);
    window.addEventListener('offline', websocketConnection.handleBrowserOffline);

    // Connect to WebSocket
    websocketClient.connect();

    // Cleanup function
    return () => {
      // Unregister all WebSocket event handlers
      websocketClient.offTaskCreated(taskWebSocket.handleTaskCreated);
      websocketClient.offTaskUpdated(taskWebSocket.handleTaskUpdated);
      websocketClient.offTaskDeleted(taskWebSocket.handleTaskDeleted);
      websocketClient.offTaskRelationshipCreated(taskWebSocket.handleTaskRelationshipCreated);
      websocketClient.offTaskRelationshipDeleted(taskWebSocket.handleTaskRelationshipDeleted);
      websocketClient.offColumnUpdated(columnWebSocket.handleColumnUpdated);
      websocketClient.offColumnDeleted(columnWebSocket.handleColumnDeleted);
      websocketClient.offColumnReordered(columnWebSocket.handleColumnReordered);
      websocketClient.offBoardCreated(boardWebSocket.handleBoardCreated);
      websocketClient.offBoardUpdated(boardWebSocket.handleBoardUpdated);
      websocketClient.offBoardDeleted(boardWebSocket.handleBoardDeleted);
      websocketClient.offBoardReordered(boardWebSocket.handleBoardReordered);
      websocketClient.offColumnCreated(columnWebSocket.handleColumnCreated);
      websocketClient.offTaskWatcherAdded(taskWebSocket.handleTaskWatcherAdded);
      websocketClient.offTaskWatcherRemoved(taskWebSocket.handleTaskWatcherRemoved);
      websocketClient.offTaskCollaboratorAdded(taskWebSocket.handleTaskCollaboratorAdded);
      websocketClient.offTaskCollaboratorRemoved(taskWebSocket.handleTaskCollaboratorRemoved);
      websocketClient.offMemberUpdated(memberWebSocket.handleMemberUpdated);
      websocketClient.offMemberCreated(memberWebSocket.handleMemberCreated);
      websocketClient.offMemberDeleted(memberWebSocket.handleMemberDeleted);
      websocketClient.offUserProfileUpdated(memberWebSocket.handleUserProfileUpdated);
      websocketClient.offActivityUpdated(memberWebSocket.handleActivityUpdated);
      websocketClient.offFilterCreated(memberWebSocket.handleFilterCreated);
      websocketClient.offFilterUpdated(memberWebSocket.handleFilterUpdated);
      websocketClient.offFilterDeleted(memberWebSocket.handleFilterDeleted);
      websocketClient.offTagCreated(settingsWebSocket.handleTagCreated);
      websocketClient.offTagUpdated(settingsWebSocket.handleTagUpdated);
      websocketClient.offTagDeleted(settingsWebSocket.handleTagDeleted);
      websocketClient.offPriorityCreated(settingsWebSocket.handlePriorityCreated);
      websocketClient.offPriorityUpdated(settingsWebSocket.handlePriorityUpdated);
      websocketClient.offPriorityDeleted(settingsWebSocket.handlePriorityDeleted);
      websocketClient.offPriorityReordered(settingsWebSocket.handlePriorityReordered);
      websocketClient.offSettingsUpdated(settingsWebSocket.handleSettingsUpdated);
      websocketClient.offTaskTagAdded(taskWebSocket.handleTaskTagAdded);
      websocketClient.offTaskTagRemoved(taskWebSocket.handleTaskTagRemoved);
      websocketClient.offInstanceStatusUpdated(settingsWebSocket.handleInstanceStatusUpdated);
      websocketClient.offVersionUpdated(settingsWebSocket.handleVersionUpdated);
      websocketClient.offCommentCreated(commentWebSocket.handleCommentCreated);
      websocketClient.offCommentUpdated(commentWebSocket.handleCommentUpdated);
      websocketClient.offCommentDeleted(commentWebSocket.handleCommentDeleted);
      websocketClient.offWebSocketReady(websocketConnection.handleWebSocketReady);
      websocketClient.offConnect(websocketConnection.handleReconnect);
      websocketClient.offDisconnect(websocketConnection.handleDisconnect);
      window.removeEventListener('online', websocketConnection.handleBrowserOnline);
      window.removeEventListener('offline', websocketConnection.handleBrowserOffline);
    };
  }, [
    isAuthenticated,
    // WebSocket hooks (handlers are memoized within hooks)
    taskWebSocket,
    commentWebSocket,
    columnWebSocket,
    boardWebSocket,
    memberWebSocket,
    settingsWebSocket,
    websocketConnection
  ]);

  // Join board when selectedBoard changes
  useEffect(() => {
    if (selectedBoard) {
      websocketClient.joinBoardWhenReady(selectedBoard);
    }
  }, [selectedBoard]);

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

  // Update selectedTask when columns data is refreshed (for auto-refresh comments)
  useEffect(() => {
    if (selectedTask && Object.keys(columns).length > 0) {
      // Find the updated version of the selected task in the refreshed data
      for (const column of Object.values(columns)) {
        const updatedTask = column.tasks.find(task => task.id === selectedTask.id);
        if (updatedTask) {
          // Only update if the task data has actually changed
          if (JSON.stringify(updatedTask) !== JSON.stringify(selectedTask)) {
            setSelectedTask(updatedTask);
          }
          break;
        }
      }
    }
  }, [columns]); // Remove selectedTask from deps to avoid infinite loops

  // Handle board selection with URL hash persistence and user preference saving
  const handleBoardSelection = (boardId: string) => {
    setSelectedBoard(boardId);
    window.location.hash = boardId;
    // Save the selected board to user preferences for future sessions
    updateCurrentUserPreference('lastSelectedBoard', boardId);
  };

  // Clear filteredColumns when board changes to prevent stale data in pills
  useEffect(() => {
    if (selectedBoard) {
      taskFilters.setFilteredColumns({}); // Clear immediately to prevent stale pill counts
    }
  }, [selectedBoard]);

  // Invite user handler
  const handleInviteUser = async (email: string) => {
    return handleInviteUserUtil(email, handleRefreshData);
  };

  // ============================================================================
  // WEBSOCKET CONNECTION EFFECT
  // ============================================================================
  // Register all memoized handlers and connect
  
  useEffect(() => {
    if (!isAuthenticated || !localStorage.getItem('authToken')) {
      return;
    }

    // Register handlers BEFORE connecting
    websocketClient.onWebSocketReady(websocketConnection.handleWebSocketReady);
    websocketClient.onConnect(websocketConnection.handleReconnect);
    websocketClient.onDisconnect(websocketConnection.handleDisconnect);

    // Listen to browser online/offline events
    window.addEventListener('online', websocketConnection.handleBrowserOnline);
    window.addEventListener('offline', websocketConnection.handleBrowserOffline);

    // Connect to WebSocket only when we have a valid token
    websocketClient.connect();
    
    // Register all event listeners
    websocketClient.onTaskCreated(taskWebSocket.handleTaskCreated);
    websocketClient.onTaskUpdated(taskWebSocket.handleTaskUpdated);
    websocketClient.onTaskDeleted(taskWebSocket.handleTaskDeleted);
    websocketClient.onTaskRelationshipCreated(taskWebSocket.handleTaskRelationshipCreated);
    websocketClient.onTaskRelationshipDeleted(taskWebSocket.handleTaskRelationshipDeleted);
    websocketClient.onColumnUpdated(columnWebSocket.handleColumnUpdated);
    websocketClient.onColumnDeleted(columnWebSocket.handleColumnDeleted);
    websocketClient.onColumnReordered(columnWebSocket.handleColumnReordered);
    websocketClient.onBoardCreated(boardWebSocket.handleBoardCreated);
    websocketClient.onBoardUpdated(boardWebSocket.handleBoardUpdated);
    websocketClient.onBoardDeleted(boardWebSocket.handleBoardDeleted);
    websocketClient.onBoardReordered(boardWebSocket.handleBoardReordered);
    websocketClient.onColumnCreated(columnWebSocket.handleColumnCreated);
    websocketClient.onTaskWatcherAdded(taskWebSocket.handleTaskWatcherAdded);
    websocketClient.onTaskWatcherRemoved(taskWebSocket.handleTaskWatcherRemoved);
    websocketClient.onTaskCollaboratorAdded(taskWebSocket.handleTaskCollaboratorAdded);
    websocketClient.onTaskCollaboratorRemoved(taskWebSocket.handleTaskCollaboratorRemoved);
    websocketClient.onMemberUpdated(memberWebSocket.handleMemberUpdated);
    websocketClient.onMemberCreated(memberWebSocket.handleMemberCreated);
    websocketClient.onMemberDeleted(memberWebSocket.handleMemberDeleted);
    websocketClient.onUserProfileUpdated(memberWebSocket.handleUserProfileUpdated);
    websocketClient.onActivityUpdated(memberWebSocket.handleActivityUpdated);
    websocketClient.onFilterCreated(memberWebSocket.handleFilterCreated);
    websocketClient.onFilterUpdated(memberWebSocket.handleFilterUpdated);
    websocketClient.onFilterDeleted(memberWebSocket.handleFilterDeleted);
    websocketClient.onTagCreated(settingsWebSocket.handleTagCreated);
    websocketClient.onTagUpdated(settingsWebSocket.handleTagUpdated);
    websocketClient.onTagDeleted(settingsWebSocket.handleTagDeleted);
    websocketClient.onPriorityCreated(settingsWebSocket.handlePriorityCreated);
    websocketClient.onPriorityUpdated(settingsWebSocket.handlePriorityUpdated);
    websocketClient.onPriorityDeleted(settingsWebSocket.handlePriorityDeleted);
    websocketClient.onPriorityReordered(settingsWebSocket.handlePriorityReordered);
    websocketClient.onSettingsUpdated(settingsWebSocket.handleSettingsUpdated);
    websocketClient.onTaskTagAdded(taskWebSocket.handleTaskTagAdded);
    websocketClient.onTaskTagRemoved(taskWebSocket.handleTaskTagRemoved);
    websocketClient.onInstanceStatusUpdated(settingsWebSocket.handleInstanceStatusUpdated);
    websocketClient.onVersionUpdated(settingsWebSocket.handleVersionUpdated);
    websocketClient.onCommentCreated(commentWebSocket.handleCommentCreated);
    websocketClient.onCommentUpdated(commentWebSocket.handleCommentUpdated);
    websocketClient.onCommentDeleted(commentWebSocket.handleCommentDeleted);

    return () => {
      // Clean up event listeners
      websocketClient.offTaskCreated(taskWebSocket.handleTaskCreated);
      websocketClient.offTaskUpdated(taskWebSocket.handleTaskUpdated);
      websocketClient.offTaskDeleted(taskWebSocket.handleTaskDeleted);
      websocketClient.offTaskRelationshipCreated(taskWebSocket.handleTaskRelationshipCreated);
      websocketClient.offTaskRelationshipDeleted(taskWebSocket.handleTaskRelationshipDeleted);
      websocketClient.offColumnUpdated(columnWebSocket.handleColumnUpdated);
      websocketClient.offColumnDeleted(columnWebSocket.handleColumnDeleted);
      websocketClient.offColumnReordered(columnWebSocket.handleColumnReordered);
      websocketClient.offBoardCreated(boardWebSocket.handleBoardCreated);
      websocketClient.offBoardUpdated(boardWebSocket.handleBoardUpdated);
      websocketClient.offBoardDeleted(boardWebSocket.handleBoardDeleted);
      websocketClient.offBoardReordered(boardWebSocket.handleBoardReordered);
      websocketClient.offColumnCreated(columnWebSocket.handleColumnCreated);
      websocketClient.offTaskWatcherAdded(taskWebSocket.handleTaskWatcherAdded);
      websocketClient.offTaskWatcherRemoved(taskWebSocket.handleTaskWatcherRemoved);
      websocketClient.offTaskCollaboratorAdded(taskWebSocket.handleTaskCollaboratorAdded);
      websocketClient.offTaskCollaboratorRemoved(taskWebSocket.handleTaskCollaboratorRemoved);
      websocketClient.offMemberUpdated(memberWebSocket.handleMemberUpdated);
      websocketClient.offMemberCreated(memberWebSocket.handleMemberCreated);
      websocketClient.offMemberDeleted(memberWebSocket.handleMemberDeleted);
      websocketClient.offUserProfileUpdated(memberWebSocket.handleUserProfileUpdated);
      websocketClient.offActivityUpdated(memberWebSocket.handleActivityUpdated);
      websocketClient.offFilterCreated(memberWebSocket.handleFilterCreated);
      websocketClient.offFilterUpdated(memberWebSocket.handleFilterUpdated);
      websocketClient.offFilterDeleted(memberWebSocket.handleFilterDeleted);
      websocketClient.offTagCreated(settingsWebSocket.handleTagCreated);
      websocketClient.offTagUpdated(settingsWebSocket.handleTagUpdated);
      websocketClient.offTagDeleted(settingsWebSocket.handleTagDeleted);
      websocketClient.offPriorityCreated(settingsWebSocket.handlePriorityCreated);
      websocketClient.offPriorityUpdated(settingsWebSocket.handlePriorityUpdated);
      websocketClient.offPriorityDeleted(settingsWebSocket.handlePriorityDeleted);
      websocketClient.offPriorityReordered(settingsWebSocket.handlePriorityReordered);
      websocketClient.offSettingsUpdated(settingsWebSocket.handleSettingsUpdated);
      websocketClient.offTaskTagAdded(taskWebSocket.handleTaskTagAdded);
      websocketClient.offTaskTagRemoved(taskWebSocket.handleTaskTagRemoved);
      websocketClient.offInstanceStatusUpdated(settingsWebSocket.handleInstanceStatusUpdated);
      websocketClient.offVersionUpdated(settingsWebSocket.handleVersionUpdated);
      websocketClient.offCommentCreated(commentWebSocket.handleCommentCreated);
      websocketClient.offCommentUpdated(commentWebSocket.handleCommentUpdated);
      websocketClient.offCommentDeleted(commentWebSocket.handleCommentDeleted);
      websocketClient.offWebSocketReady(websocketConnection.handleWebSocketReady);
      websocketClient.offConnect(websocketConnection.handleReconnect);
      websocketClient.offDisconnect(websocketConnection.handleDisconnect);
      window.removeEventListener('online', websocketConnection.handleBrowserOnline);
      window.removeEventListener('offline', websocketConnection.handleBrowserOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]); // Only depend on isAuthenticated - handlers are memoized with useCallback in hooks

  // Join board when selectedBoard changes
  useEffect(() => {
    if (selectedBoard) {
      websocketClient.joinBoardWhenReady(selectedBoard);
    }
  }, [selectedBoard]);

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

  // Update selectedTask when columns data is refreshed (for auto-refresh comments)
  useEffect(() => {
    if (selectedTask && Object.keys(columns).length > 0) {
      // Find the updated version of the selected task in the refreshed data
      for (const column of Object.values(columns)) {
        const updatedTask = column.tasks.find(task => task.id === selectedTask.id);
        if (updatedTask) {
          // Only update if the task data has actually changed
          if (JSON.stringify(updatedTask) !== JSON.stringify(selectedTask)) {
            // console.log('🔄 Auto-updating selectedTask with fresh data from polling', {
            //   taskId: updatedTask.id,
            //   commentCount: updatedTask.comments?.length || 0
            // });
            setSelectedTask(updatedTask);
          }
          break;
        }
      }
    }
  }, [columns]); // Remove selectedTask from deps to avoid infinite loops


  // Mock socket object for compatibility with existing UI (removed unused variable)

  // Header event handlers
  const handlePageChange = (page: 'kanban' | 'admin' | 'reports' | 'test') => {
    setCurrentPage(page);
    if (page === 'kanban') {
      // If there was a previously selected board, restore it
      if (selectedBoard) {
        window.location.hash = `kanban#${selectedBoard}`;
      } else {
        window.location.hash = 'kanban';
      }
    } else if (page === 'reports') {
      window.location.hash = 'reports';
    } else if (page === 'admin') {
      window.location.hash = 'admin';
    } else {
      window.location.hash = page;
    }
  };

  const handleRefreshData = async () => {
    await refreshBoardData();
    // updateLastPollTime(); // Removed - no longer using polling system
  };

  // Task linking handlers
  const handleStartLinking = (task: Task, startPosition: {x: number, y: number}) => {
    // console.log('🔗 handleStartLinking called:', {
    //   taskTicket: task.ticket,
    //   taskId: task.id,
    //   startPosition
    // });
    taskLinking.setIsLinkingMode(true);
    taskLinking.setLinkingSourceTask(task);
    taskLinking.setLinkingLine({
      startX: startPosition.x,
      startY: startPosition.y,
      endX: startPosition.x,
      endY: startPosition.y
    });
    // console.log('✅ Linking mode activated');
  };

  const handleUpdateLinkingLine = (endPosition: {x: number, y: number}) => {
    if (taskLinking.linkingLine) {
      taskLinking.setLinkingLine({
        ...taskLinking.linkingLine,
        endX: endPosition.x,
        endY: endPosition.y
      });
    }
  };

  const handleFinishLinking = async (targetTask: Task | null, relationshipType: 'parent' | 'child' | 'related' = 'parent') => {
    // console.log('🔗 handleFinishLinking called:', { 
    //   linkingSourceTask: linkingSourceTask?.ticket, 
    //   targetTask: targetTask?.ticket, 
    //   relationshipType 
    // });
    
    if (taskLinking.linkingSourceTask && targetTask && taskLinking.linkingSourceTask.id !== targetTask.id) {
      try {
        // console.log('🚀 Making API call to create relationship...');
        const token = localStorage.getItem('authToken');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
        
        const response = await fetch(`/api/tasks/${taskLinking.linkingSourceTask.id}/relationships`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            relationship: relationshipType,
            toTaskId: targetTask.id
          })
        });
        
        // console.log('📡 API Response status:', response.status);
        
        if (!response.ok) {
          let errorMessage = 'Failed to create task relationship';
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (parseError) {
            // If JSON parsing fails, try text
            try {
              const errorText = await response.text();
              errorMessage = errorText || errorMessage;
            } catch (textError) {
              // Keep default message
            }
          }
          
          // console.error('❌ API Error response:', {
          //   status: response.status,
          //   statusText: response.statusText,
          //   error: errorMessage
          // });
          throw new Error(errorMessage);
        }
        
        const result = await response.json();
        // console.log('✅ API Success result:', result);
        // console.log(`✅ Created ${relationshipType} relationship: ${linkingSourceTask.ticket} → ${targetTask.ticket}`);
        
        // Set success feedback message
        taskLinking.setLinkingFeedbackMessage(`${taskLinking.linkingSourceTask.ticket} now ${relationshipType} of ${targetTask.ticket}`);
      } catch (error) {
        // console.error('❌ Error creating task relationship:', error);
        // Set specific error feedback message
        const errorMessage = error instanceof Error ? error.message : 'Failed to create task relationship';
        taskLinking.setLinkingFeedbackMessage(errorMessage);
      }
    } else {
      // console.log('⚠️ Relationship creation skipped:', {
      //   hasSource: !!linkingSourceTask,
      //   hasTarget: !!targetTask,
      //   sameTask: linkingSourceTask?.id === targetTask?.id
      // });
      
      // Set cancellation feedback message
      taskLinking.setLinkingFeedbackMessage('Task link cancelled');
    }
    
    // Reset linking state (but keep feedback message visible)
    // console.log('🔄 Resetting linking state...');
    taskLinking.setIsLinkingMode(false);
    taskLinking.setLinkingSourceTask(null);
    taskLinking.setLinkingLine(null);
    
    // Clear feedback message after 3 seconds
    setTimeout(() => {
      taskLinking.setLinkingFeedbackMessage(null);
    }, 3000);
  };

  const handleCancelLinking = () => {
    taskLinking.setIsLinkingMode(false);
    taskLinking.setLinkingSourceTask(null);
    taskLinking.setLinkingLine(null);
    taskLinking.setLinkingFeedbackMessage('Task link cancelled');
    
    // Clear feedback message after 3 seconds
    setTimeout(() => {
      taskLinking.setLinkingFeedbackMessage(null);
    }, 3000);
  };

  // Hover highlighting handlers
  // When user hovers over a link tool button, highlight all related tasks with color-coded borders:
  // - Green: Parent tasks (tasks that this one depends on)
  // - Purple: Child tasks (tasks that depend on this one)  
  // - Yellow: Related tasks (loosely connected tasks)
  const handleLinkToolHover = async (task: Task) => {
    taskLinking.setHoveredLinkTask(task);
    
    // Load relationships for this task if not already loaded
    if (!taskLinking.taskRelationships[task.id]) {
      try {
        const relationships = await api.get(`/tasks/${task.id}/relationships`);
        taskLinking.setTaskRelationships((prev: { [taskId: string]: any[] }) => ({
          ...prev,
          [task.id]: relationships.data || []
        }));
      } catch (error) {
        // console.error('Failed to load task relationships for hover:', error);
      }
    }
  };

  const handleLinkToolHoverEnd = () => {
    taskLinking.setHoveredLinkTask(null);
  };

  // Helper function to check if a task is related to the hovered task
  const getTaskRelationshipType = (taskId: string): 'parent' | 'child' | 'related' | null => {
    if (!taskLinking.hoveredLinkTask || !taskLinking.taskRelationships[taskLinking.hoveredLinkTask.id]) return null;
    
    const relationships = taskLinking.taskRelationships[taskLinking.hoveredLinkTask.id];
    
    // Check if the task is a parent of the hovered task
    const parentRel = relationships.find(rel => 
      rel.relationship === 'child' && 
      taskLinking.hoveredLinkTask && rel.task_id === taskLinking.hoveredLinkTask.id && 
      rel.to_task_id === taskId
    );
    if (parentRel) return 'parent';
    
    // Check if the task is a child of the hovered task
    const childRel = relationships.find(rel => 
      rel.relationship === 'parent' && 
      taskLinking.hoveredLinkTask && rel.task_id === taskLinking.hoveredLinkTask.id && 
      rel.to_task_id === taskId
    );
    if (childRel) return 'child';
    
    // Check if the task has a 'related' relationship
    const relatedRel = relationships.find(rel => 
      rel.relationship === 'related' && 
      taskLinking.hoveredLinkTask &&
      ((rel.task_id === taskLinking.hoveredLinkTask.id && rel.to_task_id === taskId) ||
       (rel.task_id === taskId && rel.to_task_id === taskLinking.hoveredLinkTask.id))
    );
    if (relatedRel) return 'related';
    
    return null;
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

  // CONSOLIDATED: Load all user-specific preferences when authenticated (ONE API CALL)
  useEffect(() => {
    if (isAuthenticated && currentUser?.id) {
      const loadPreferences = async () => {
        // Load from both cookie and database (database takes precedence for stored values)
        // This makes ONE call to getUserSettings() internally and merges with cookies
        const userSpecificPrefs = await loadUserPreferencesAsync(currentUser.id);
        
        // Update all preference-based state with user-specific values
        taskFilters.setSelectedMembers(userSpecificPrefs.selectedMembers);
        taskFilters.setIncludeAssignees(userSpecificPrefs.includeAssignees);
        taskFilters.setIncludeWatchers(userSpecificPrefs.includeWatchers);
        taskFilters.setIncludeCollaborators(userSpecificPrefs.includeCollaborators);
        taskFilters.setIncludeRequesters(userSpecificPrefs.includeRequesters);
        taskFilters.setIncludeSystem(userSpecificPrefs.includeSystem);
        taskFilters.setTaskViewMode(userSpecificPrefs.taskViewMode);
        taskFilters.setViewMode(userSpecificPrefs.viewMode);
        taskFilters.viewModeRef.current = userSpecificPrefs.viewMode;
        taskFilters.setIsSearchActive(userSpecificPrefs.isSearchActive);
        taskFilters.setIsAdvancedSearchExpanded(userSpecificPrefs.isAdvancedSearchExpanded);
        taskFilters.setSearchFilters(userSpecificPrefs.searchFilters);
        taskFilters.setSelectedSprintId(userSpecificPrefs.selectedSprintId); // Load sprint selection from DB
        
        // Activity Feed Settings (from the same getUserSettings call above)
        const defaultFromSystem = systemSettings.SHOW_ACTIVITY_FEED !== 'false';
        activityFeed.setShowActivityFeed(userSpecificPrefs.activityFeed.showActivityFeed !== undefined 
          ? userSpecificPrefs.activityFeed.showActivityFeed 
          : defaultFromSystem);
        activityFeed.setActivityFeedMinimized(userSpecificPrefs.activityFeed.minimized);
        activityFeed.setLastSeenActivityId(userSpecificPrefs.activityFeed.lastSeenActivityId);
        activityFeed.setClearActivityId(userSpecificPrefs.activityFeed.clearActivityId);
        activityFeed.setActivityFeedPosition(userSpecificPrefs.activityFeed.position);
        activityFeed.setActivityFeedDimensions({
          width: userSpecificPrefs.activityFeed.width,
          height: userSpecificPrefs.activityFeed.height
        });
        
        // Load Kanban column width preference
        setKanbanColumnWidth(userSpecificPrefs.kanbanColumnWidth || 300);
        
        // Load saved filter view if one is remembered
        if (userSpecificPrefs.currentFilterViewId) {
          taskFilters.loadSavedFilterView(userSpecificPrefs.currentFilterViewId);
        }
        
        // Set initial selected board with preference fallback - only if not already set
        if (!selectedBoard) {
          const initialBoard = getInitialSelectedBoardWithPreferences(currentUser.id);
          if (initialBoard) {
            setSelectedBoard(initialBoard);
          }
        }
        
        // Update APP_URL if user is the owner (part of initialization process)
        try {
          const ownerCheck = await api.get('/auth/is-owner');
          if (ownerCheck.data.isOwner) {
            console.log('🔄 User is owner, updating APP_URL during initialization...');
            const baseUrl = window.location.origin;
            console.log('🔄 Calling updateAppUrl with:', baseUrl);
            const result = await updateAppUrl(baseUrl);
            console.log('✅ APP_URL updated successfully:', result);
          } else {
            console.log('ℹ️ User is not owner, skipping APP_URL update');
          }
        } catch (error: any) {
          // Don't fail initialization if owner check or APP_URL update fails
          if (error.response?.status === 403 || error.response?.status === 401) {
            console.log('ℹ️ User is not owner or not authorized, skipping APP_URL update');
          } else {
            console.warn('⚠️ Failed to check ownership or update APP_URL during initialization:', error.message);
          }
        }
      };
      
      loadPreferences();
    }
  }, [isAuthenticated, currentUser?.id]); // Only run when auth state or user changes

  // CENTRALIZED ROUTING HANDLER - Single source of truth
  useEffect(() => {
    const handleRouting = () => {
      // Check for task route first (handles /task/#TASK-00001 and /project/#PROJ-00001/#TASK-00001)
      const taskRoute = parseTaskRoute();
      
      if (taskRoute.isTaskRoute && taskRoute.taskId) {
        if (currentPage !== 'task') {
          setCurrentPage('task');
        }
        return;
      }
      
      // Check for project route (handles /project/#PROJ-00001)
      const projectRoute = parseProjectRoute();
      if (projectRoute.isProjectRoute && projectRoute.projectId && boards.length > 0) {
        const board = findBoardByProjectId(boards, projectRoute.projectId);
        if (board) {
          // Redirect to the board using standard routing
          const newHash = `#kanban#${board.id}`;
          if (window.location.hash !== newHash) {
            window.location.hash = newHash;
            return; // Let the hash change trigger the next routing cycle
          }
        } else {
          // Project ID not found - redirect to kanban with error or message
          // console.warn(`Project ${projectRoute.projectId} not found`);
          setCurrentPage('kanban');
          setSelectedBoard(null);
          window.history.replaceState(null, '', '#kanban');
          return;
        }
      }
      
      // Standard hash-based routing
      const route = parseUrlHash(window.location.hash);
      
      // Debug to server console - DISABLED
      // fetch('/api/debug/log', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ 
      //     message: '🔍 Route parsing', 
      //     data: { hash: window.location.hash, route } 
      //   })
      // }).catch(() => {}); // Silent fail
      
      // 1. Handle page routing
      if (route.isPage) {
        if (route.mainRoute !== currentPage) {
          setCurrentPage(route.mainRoute as 'kanban' | 'admin' | 'task' | 'test' | 'forgot-password' | 'reset-password' | 'reset-success' | 'activate-account');
        }
        
        // Handle password reset token
        if (route.mainRoute === 'reset-password') {
          const token = route.queryParams.get('token');
          if (token) {
            setResetToken(token);
          }
        }
        
        // Handle account activation token and email
        if (route.mainRoute === 'activate-account') {
          const token = route.queryParams.get('token');
          const email = route.queryParams.get('email');
          
          // Debug to server console - DISABLED
          // fetch('/api/debug/log', {
          //   method: 'POST',
          //   headers: { 'Content-Type': 'application/json' },
          //   body: JSON.stringify({ 
          //     message: '🔍 Activation route detected', 
          //     data: { token: token ? token.substring(0, 10) + '...' : null, email, queryParams: Object.fromEntries(route.queryParams) } 
          //   })
          // }).catch(() => {});
          
          if (token && email) {
            setActivationToken(token);
            setActivationEmail(email);
            
            // Debug success to server console - DISABLED
            // fetch('/api/debug/log', {
            //   method: 'POST',
            //   headers: { 'Content-Type': 'application/json' },
            //   body: JSON.stringify({ 
            //     message: '✅ Activation token and email set', 
            //     data: { token: token.substring(0, 10) + '...', email } 
            //   })
            // }).catch(() => {});
          } else {
            // Debug failure to server console - DISABLED
            // fetch('/api/debug/log', {
            //   method: 'POST',
            //   headers: { 'Content-Type': 'application/json' },
            //   body: JSON.stringify({ 
            //     message: '❌ Missing activation token or email', 
            //     data: { hasToken: !!token, hasEmail: !!email } 
            //   })
            // }).catch(() => {});
          }
          
          // Mark activation parsing as complete
          setActivationParsed(true);
        }
        
        // Handle kanban board sub-routes
        if (route.mainRoute === 'kanban' && route.subRoute && boards.length > 0) {
          const board = boards.find(b => b.id === route.subRoute);
          setSelectedBoard(board ? board.id : null);
        }
        
      } else if (route.isBoardId && boards.length > 0) {
        // 2. Handle direct board access (legacy format)
        const board = boards.find(b => b.id === route.mainRoute);
        if (board) {
          setCurrentPage('kanban');
          setSelectedBoard(board.id);
        } else {
          // Invalid board ID - redirect to kanban
          setCurrentPage('kanban');
          setSelectedBoard(null);
        }
        
      } else if (route.mainRoute) {
        // 3. Handle unknown routes
        setCurrentPage('kanban');
        setSelectedBoard(null);
      }
    };

    // Handle both hash changes and initial load
    handleRouting();
    window.addEventListener('hashchange', handleRouting);
    return () => window.removeEventListener('hashchange', handleRouting);
  }, [currentPage, boards, isAuthenticated]);

  // AUTO-BOARD-SELECTION LOGIC - Clean and predictable with user preference support
  useEffect(() => {
    // Only auto-select if:
    // 1. We're on kanban page
    // 2. No board is currently selected
    // 3. We have boards available
    // 4. We're not on pages that should skip auto-selection
    // 5. Not during board creation (to avoid race conditions)
    // 6. User is authenticated (so we can access preferences)
    // 7. No intended destination (don't override redirect after login)
    // 8. Not just redirected (prevent overriding intended destination redirect)
    if (
      currentPage === 'kanban' && 
      !selectedBoard && 
      boards.length > 0 && 
      !boardCreationPause &&
      !shouldSkipAutoBoardSelection(currentPage) &&
      isAuthenticated && currentUser?.id &&
      !intendedDestination &&
      !justRedirected
    ) {
      // Try to use the user's last selected board if it exists in current boards
      const userPrefs = loadUserPreferences(currentUser.id);
      const lastBoard = userPrefs.lastSelectedBoard;
      
      let boardToSelect: string | null = null;
      
      if (lastBoard && boards.some(board => board.id === lastBoard)) {
        // User's preferred board exists, use it
        boardToSelect = lastBoard;
      } else {
        // Fall back to first board
        boardToSelect = boards[0]?.id || null;
      }
      
      if (boardToSelect) {
        setSelectedBoard(boardToSelect);
        // CRITICAL FIX: Save to preferences so it's remembered on next refresh
        updateCurrentUserPreference('lastSelectedBoard', boardToSelect);
        // Update URL to reflect the selected board (only if no hash exists)
        if (!window.location.hash || window.location.hash === '#') {
          window.location.hash = `#kanban#${boardToSelect}`;
        }
      }
    }
  }, [currentPage, boards, selectedBoard, boardCreationPause, isAuthenticated, currentUser?.id, intendedDestination, justRedirected]);




  // Load initial data
  useEffect(() => {
    // Only load data if authenticated and user preferences have been loaded (currentUser.id exists)
    if (!isAuthenticated || !currentUser?.id) return;
    
    const loadInitialData = async () => {
      console.log('🔄 Loading initial data...');
      await withLoading('general', async () => {
        try {
          // console.log(`🔄 Loading initial data with includeSystem: ${includeSystem}`);
          const [loadedMembers, loadedBoards, loadedPriorities, loadedTags, settingsResponse, loadedActivities] = await Promise.all([
            getMembers(taskFilters.includeSystem),
          getBoards(),
          getAllPriorities(),
          getAllTags(),
          api.get('/settings'),
          getActivityFeed(20)
        ]);
          

          
          // console.log(`📋 Loaded ${loadedMembers.length} members with includeSystem=${includeSystem}`);
          setMembers(loadedMembers);
          setBoards(loadedBoards);
          setAvailablePriorities(loadedPriorities || []);
          setAvailableTags(loadedTags || []);
          setSystemSettings(settingsResponse.data || {});
          activityFeed.setActivities(loadedActivities || []);
          
          // CRITICAL FIX: If no board is selected yet, immediately select one and load its columns
          // This prevents the blank board race condition on initial load/refresh
          if (loadedBoards.length > 0 && !selectedBoard) {
            // Determine which board to select (same logic as auto-selection effect)
            const cookiePreference = getCookie('lastSelectedBoard');
            const userPreference = currentUser?.user_preferences?.lastSelectedBoard;
            const preferredBoardId = cookiePreference || userPreference;
            
            // Try to find the preferred board, fallback to first board
            const boardToSelect = preferredBoardId 
              ? loadedBoards.find(b => b.id === preferredBoardId) || loadedBoards[0]
              : loadedBoards[0];
            
            if (boardToSelect) {
              console.log(`🎯 [INITIAL LOAD] Auto-selecting board: ${boardToSelect.title} (${boardToSelect.id})`);
              
              // Set board and columns synchronously to prevent blank board
              setSelectedBoard(boardToSelect.id);
              setColumns(boardToSelect.columns || {});
              
              // Save to preferences
              updateCurrentUserPreference('lastSelectedBoard', boardToSelect.id);
              
              // Update URL
              if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#kanban') {
                window.location.hash = `#kanban#${boardToSelect.id}`;
              }
            }
          } else if (selectedBoard && loadedBoards.length > 0) {
            // Board already selected, just update its columns
            const boardToUse = loadedBoards.find(b => b.id === selectedBoard);
            if (boardToUse) {
              setColumns(boardToUse.columns || {});
            }
          }

          // Member selection is now handled by a separate useEffect
        } catch (error) {
          // console.error('Failed to load initial data:', error);
        }
      });
      await fetchQueryLogs();
    };

    loadInitialData();
  }, [isAuthenticated, currentUser?.id]);

  // Reload members only when includeSystem changes (without flashing the entire screen)
  const isInitialSystemMount = useRef(true);
  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id) return;
    
    // Skip on initial mount - members are already loaded by loadInitialData
    if (isInitialSystemMount.current) {
      isInitialSystemMount.current = false;
      return;
    }
    
    const reloadMembers = async () => {
      try {
        const loadedMembers = await getMembers(taskFilters.includeSystem);
        setMembers(loadedMembers);
      } catch (error) {
        console.error('Failed to reload members:', error);
      }
    };
    
    reloadMembers();
  }, [taskFilters.includeSystem, isAuthenticated, currentUser?.id]);

  // Track board switching state to prevent task count flashing
  const [isSwitchingBoard, setIsSwitchingBoard] = useState(false);
  const lastTaskCountsRef = useRef<Record<string, number>>({});

  // Update columns when selected board changes
  // Load board data when selected board changes (essential for board switching)
  useEffect(() => {
    if (selectedBoard) {
      // Set switching state to prevent task count updates during board switch
      setIsSwitchingBoard(true);
      
      // CRITICAL FIX: Check if board data is already loaded in boards array
      const boardInState = boards.find(b => b.id === selectedBoard);
      if (boardInState && boardInState.columns && Object.keys(boardInState.columns).length > 0) {
        // Board data already loaded, set columns immediately to prevent blank screen
        const newColumns = JSON.parse(JSON.stringify(boardInState.columns));
        setColumns(newColumns);
        setIsSwitchingBoard(false);
      } else {
        // Board data not loaded yet, fetch it (refreshBoardData will load relationships)
        refreshBoardData().finally(() => {
          // Clear switching state after data is loaded
          setIsSwitchingBoard(false);
        });
      }
      
      // Load relationships once for the selected board (only if on kanban page)
      if (currentPage === 'kanban') {
        getBoardTaskRelationships(selectedBoard)
          .then(relationships => {
            taskLinking.setBoardRelationships(relationships);
          })
          .catch(error => {
            console.warn('Failed to load relationships:', error);
            taskLinking.setBoardRelationships([]);
          });
      }
    } else {
      // Clear columns when no board is selected
      setColumns({});
      taskLinking.setBoardRelationships([]);
      setIsSwitchingBoard(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBoard, currentPage]); // Depend on currentPage to reload relationships when switching to kanban

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

  const refreshBoardData = useCallback(async () => {
    try {
      const loadedBoards = await getBoards();
      setBoards(loadedBoards);
      
      if (loadedBoards.length > 0) {
        // Check if the selected board still exists
        if (selectedBoard) {
          const board = loadedBoards.find(b => b.id === selectedBoard);
          if (board) {
            // Force a deep clone to ensure React detects the change at all levels
            const newColumns = board.columns ? JSON.parse(JSON.stringify(board.columns)) : {};
            setColumns(newColumns);
            
            // Relationships are loaded by the board selection effect above, no need to load here
          } else {
            // Selected board no longer exists, clear selection
            setSelectedBoard(null);
            setColumns({});
            taskLinking.setBoardRelationships([]);
          }
        }
      }
    } catch (error) {
      console.error('Failed to refresh board data:', error);
    }
  }, [selectedBoard]);

  // Update the ref whenever refreshBoardData changes
  useEffect(() => {
    refreshBoardDataRef.current = refreshBoardData;
  }, [refreshBoardData]);

  // Track when we've just updated from WebSocket to prevent polling from overriding
  const [justUpdatedFromWebSocket, setJustUpdatedFromWebSocket] = useState(false);
  
  // Expose the flag to window for WebSocket handlers
  useEffect(() => {
    window.setJustUpdatedFromWebSocket = setJustUpdatedFromWebSocket;
    window.justUpdatedFromWebSocket = justUpdatedFromWebSocket;
    return () => {
      delete window.setJustUpdatedFromWebSocket;
      delete window.justUpdatedFromWebSocket;
    };
  }, [justUpdatedFromWebSocket]);

  const fetchQueryLogs = async () => {
    // DISABLED: Debug query logs fetching
    // try {
    //   const logs = await getQueryLogs();
    //   setQueryLogs(logs);
    // } catch (error) {
    //   // console.error('Failed to fetch query logs:', error);
    // }
  };



  const handleAddBoard = async () => {
    try {
      // Pause polling to prevent race conditions
      setBoardCreationPause(true);
      
      const boardId = generateUUID();
      const newBoard: Board = {
        id: boardId,
        title: generateUniqueBoardName(boards),
        columns: {}
      };

      // Create the board first
      await createBoard(newBoard);

      // Create default columns for the new board
      const columnPromises = DEFAULT_COLUMNS.map(async (col, index) => {
        const column: Column = {
          id: `${col.id}-${boardId}`,
          title: col.title,
          tasks: [],
          boardId: boardId,
          position: index
        };
        return createColumn(column);
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
      
    } catch (error: any) {
      console.error('Failed to add board:', error);
      setBoardCreationPause(false); // Resume polling even on error
      
      // Check if it's a license limit error
      if (error?.response?.status === 403 && error?.response?.data?.error === 'License limit exceeded') {
        const limitType = error.response.data.limit;
        const details = error.response.data.details;
        
        let title = '';
        let message = '';
        switch (limitType) {
          case 'BOARD_LIMIT':
            title = 'Board Limit Reached';
            message = `You've reached the maximum number of boards. ${details}`;
            break;
          case 'USER_LIMIT':
            title = 'User Limit Reached';
            message = `You've reached the maximum number of users. ${details}`;
            break;
          case 'TASK_LIMIT':
            title = 'Task Limit Reached';
            message = `You've reached the maximum number of tasks for this board. ${details}`;
            break;
          case 'STORAGE_LIMIT':
            title = 'Storage Limit Reached';
            message = `You've reached the maximum storage limit. ${details}`;
            break;
          default:
            title = 'License Limit Exceeded';
            message = details;
        }
        
        toast.error(title, message, 5000);
      } else if (await handleInstanceStatusError(error)) {
        // Instance status error handled by utility function
      }
    }
  };

  const handleEditBoard = async (boardId: string, title: string) => {
    try {
      await updateBoard(boardId, title);
      setBoards(prev => prev.map(b => 
        b.id === boardId ? { ...b, title } : b
      ));
      await fetchQueryLogs();
    } catch (error) {
      // console.error('Failed to update board:', error);
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
      await reorderBoards(boardId, newPosition);
      await fetchQueryLogs();
    } catch (error) {
      // console.error('Failed to reorder boards:', error);
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
      await deleteBoard(boardId);
      const newBoards = boards.filter(b => b.id !== boardId);
      setBoards(newBoards);
      
      if (selectedBoard === boardId) {
        const firstBoard = newBoards[0];
        handleBoardSelection(firstBoard.id);
        setColumns(firstBoard.columns);
      }
      await fetchQueryLogs();
    } catch (error) {
      // console.error('Failed to remove board:', error);
    }
  };

  const handleAddTask = async (columnId: string, startDate?: string, dueDate?: string) => {
    if (!selectedBoard || !currentUser) return;
    
    // Prevent task creation when network is offline
    if (!isOnline) {
      console.warn('⚠️ Task creation blocked - network is offline');
      return;
    }
    
    // Always assign new tasks to the logged-in user, not the filtered selection
    const currentUserMember = members.find(m => m.user_id === currentUser.id);
    if (!currentUserMember) {
      // console.error('Current user not found in members list');
      return;
    }
    
    // Use provided dates or default to today
    const taskStartDate = startDate || new Date().toISOString().split('T')[0];
    const taskDueDate = dueDate || taskStartDate;
    
    const newTask: Task = {
      id: generateUUID(),
      title: 'New Task',
      description: '',
      memberId: currentUserMember.id,
      startDate: taskStartDate,
      dueDate: taskDueDate,
      effort: 1,
      columnId,
      position: 0, // Backend will handle positioning
      priority: getDefaultPriority(), // Use frontend default priority
      requesterId: currentUserMember.id,
      boardId: selectedBoard,
      comments: []
    };

    // OPTIMISTIC UPDATE: Add task to UI immediately for instant feedback
    setColumns(prev => {
      const targetColumn = prev[columnId];
      if (!targetColumn) return prev;
      
      // Insert at top (position 0)
      const updatedTasks = [newTask, ...targetColumn.tasks];
      
      return {
        ...prev,
        [columnId]: {
          ...targetColumn,
          tasks: updatedTasks
        }
      };
    });
    
    // ALSO update boards state for tab counters
    setBoards(prev => {
      return prev.map(board => {
        if (board.id === selectedBoard) {
          const updatedBoard = { ...board };
          const updatedColumns = { ...updatedBoard.columns };
          const targetColumnId = newTask.columnId;
          
          if (updatedColumns[targetColumnId]) {
            // Add new task at front
            const existingTasks = updatedColumns[targetColumnId].tasks || [];
            updatedColumns[targetColumnId] = {
              ...updatedColumns[targetColumnId],
              tasks: [newTask, ...existingTasks]
            };
            
            updatedBoard.columns = updatedColumns;
          }
          
          return updatedBoard;
        }
        return board;
      });
    });

    // PAUSE POLLING to prevent race condition
    setTaskCreationPause(true);

    const createTimestamp = new Date().toISOString();
    console.log(`🆕 [${createTimestamp}] Creating task:`, {
      taskId: newTask.id,
      title: newTask.title,
      columnId: newTask.columnId,
      boardId: newTask.boardId
    });

    try {
      await withLoading('tasks', async () => {
        // Let backend handle positioning and shifting
        await createTaskAtTop(newTask);
        
        // Task already visible via optimistic update - WebSocket will confirm/sync
      });
      
      // ALWAYS schedule a fallback refresh to fetch ticket if WebSocket event doesn't arrive
      // This handles WebSocket reconnection flapping after sleep/wake
      pendingTaskRefreshesRef.current.add(newTask.id);
      
      setTimeout(() => {
        const fallbackTimestamp = new Date().toISOString();
        // Check if WebSocket event already updated the task
        if (pendingTaskRefreshesRef.current.has(newTask.id)) {
          // WebSocket event never arrived, force refresh to get ticket
          console.log(`⏱️ [${fallbackTimestamp}] Fallback triggered - WebSocket event never arrived for task ${newTask.id}`);
          pendingTaskRefreshesRef.current.delete(newTask.id);
          if (refreshBoardDataRef.current) {
            refreshBoardDataRef.current();
          }
        } else {
          console.log(`✅ [${fallbackTimestamp}] Fallback skipped - WebSocket event already handled task ${newTask.id}`);
        }
      }, 1000);
      
      // Check if the new task would be filtered out and show warning
      const wouldBeFilteredBySearch = wouldTaskBeFilteredOut(newTask, taskFilters.searchFilters, taskFilters.isSearchActive);
      const wouldBeFilteredByMembers = (() => {
        // Check if task matches member filtering criteria
        if (!taskFilters.includeAssignees && !taskFilters.includeWatchers && !taskFilters.includeCollaborators && !taskFilters.includeRequesters) {
          return false; // No member filters active
        }
        
        // If no members selected, treat as "all members" (task will be shown)
        const showAllMembers = taskFilters.selectedMembers.length === 0;
        const memberIds = new Set(taskFilters.selectedMembers);
        let hasMatchingMember = false;
        
        if (taskFilters.includeAssignees) {
          if (showAllMembers) {
            // All tasks with assignees are shown
            if (newTask.memberId) hasMatchingMember = true;
          } else {
            // Only tasks assigned to selected members
            if (newTask.memberId && memberIds.has(newTask.memberId)) hasMatchingMember = true;
          }
        }
        
        if (!hasMatchingMember && taskFilters.includeRequesters) {
          if (showAllMembers) {
            // All tasks with requesters are shown
            if (newTask.requesterId) hasMatchingMember = true;
          } else {
            // Only tasks requested by selected members
            if (newTask.requesterId && memberIds.has(newTask.requesterId)) hasMatchingMember = true;
          }
        }
        
        if (!hasMatchingMember && taskFilters.includeWatchers && newTask.watchers && Array.isArray(newTask.watchers)) {
          if (showAllMembers) {
            // All tasks with watchers are shown
            if (newTask.watchers.length > 0) hasMatchingMember = true;
          } else {
            // Only tasks watched by selected members
            if (newTask.watchers.some(w => w && memberIds.has(w.id))) hasMatchingMember = true;
          }
        }
        
        if (!hasMatchingMember && taskFilters.includeCollaborators && newTask.collaborators && Array.isArray(newTask.collaborators)) {
          if (showAllMembers) {
            // All tasks with collaborators are shown
            if (newTask.collaborators.length > 0) hasMatchingMember = true;
          } else {
            // Only tasks with selected members as collaborators
            if (newTask.collaborators.some(c => c && memberIds.has(c.id))) hasMatchingMember = true;
          }
        }
        
        return !hasMatchingMember; // Return true if would be filtered out
      })();
      
      if (wouldBeFilteredBySearch || wouldBeFilteredByMembers) {
        setColumnWarnings(prev => ({
          ...prev,
          [columnId]: 'Task created but hidden by active filters.\n**Tip:** Click "Clear" to see all tasks and disable relevant filters.'
        }));
      }
      
      // Resume polling after delay to ensure server processing is complete
      setTimeout(() => {
        setTaskCreationPause(false);
      }, TASK_CREATION_PAUSE_DURATION);
      
    } catch (error: any) {
      console.error('Failed to create task at top:', error);
      setTaskCreationPause(false);
      
      // Check if it's a license limit error
      if (error?.response?.status === 403 && error?.response?.data?.error === 'License limit exceeded') {
        const limitType = error.response.data.limit;
        const details = error.response.data.details;
        
        let title = '';
        let message = '';
        switch (limitType) {
          case 'BOARD_LIMIT':
            title = 'Board Limit Reached';
            message = `You've reached the maximum number of boards. ${details}`;
            break;
          case 'USER_LIMIT':
            title = 'User Limit Reached';
            message = `You've reached the maximum number of users. ${details}`;
            break;
          case 'TASK_LIMIT':
            title = 'Task Limit Reached';
            message = `You've reached the maximum number of tasks for this board. ${details}`;
            break;
          case 'STORAGE_LIMIT':
            title = 'Storage Limit Reached';
            message = `You've reached the maximum storage limit. ${details}`;
            break;
          default:
            title = 'License Limit Exceeded';
            message = details;
        }
        
        toast.error(title, message, 5000);
      } else if (await handleInstanceStatusError(error)) {
        // Instance status error handled by utility function
      } else {
        await refreshBoardData();
      }
    }
  };

  const handleEditTask = useCallback(async (task: Task) => {
    
    // Optimistic update
    const previousColumns = { ...columns };
    const previousSelectedTask = selectedTask;
    
    // Update UI immediately
    setColumns(prev => {
      // Safety check: ensure the target column exists
      if (!prev[task.columnId]) {
        console.warn('Column not found for task update:', task.columnId, 'Available columns:', Object.keys(prev));
        return prev; // Return unchanged state if column doesn't exist
      }
      
      const updatedColumns = { ...prev };
      const taskId = task.id;
      
      // First, remove the task from all columns (in case it moved)
      Object.keys(updatedColumns).forEach(columnId => {
        const column = updatedColumns[columnId];
        const taskIndex = column.tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
          updatedColumns[columnId] = {
            ...column,
            tasks: [
              ...column.tasks.slice(0, taskIndex),
              ...column.tasks.slice(taskIndex + 1)
            ]
          };
        }
      });
      
      // Then, add the task to its new column
      if (updatedColumns[task.columnId]) {
        updatedColumns[task.columnId] = {
          ...updatedColumns[task.columnId],
          tasks: [...updatedColumns[task.columnId].tasks, task]
        };
      }
      
      return updatedColumns;
    });
    
    // Update selectedTask if this is the selected task
    if (selectedTask && selectedTask.id === task.id) {
      setSelectedTask(task);
    }
    
    try {
      await withLoading('tasks', async () => {
        await updateTask(task);
        await fetchQueryLogs();
      });
    } catch (error: any) {
      console.error('❌ [App] Failed to update task:', error);
      
      // Check if it's an instance unavailable error
      if (await handleInstanceStatusError(error)) {
        return; // Don't rollback if instance is suspended
      }
      
      // Rollback on error
      setColumns(previousColumns);
      if (previousSelectedTask) {
        setSelectedTask(previousSelectedTask);
      }
    }
  }, [withLoading, fetchQueryLogs, columns, selectedTask]);

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
      position: newPosition,
      // If the original task doesn't have a dueDate, set it to startDate
      dueDate: task.dueDate || task.startDate
    };

    // PAUSE POLLING to prevent race condition
    setTaskCreationPause(true);

    try {
      await withLoading('tasks', async () => {
        // Use createTaskAtTop for better positioning
        await createTaskAtTop(newTask);
        
        // Don't refresh - WebSocket will handle the update
      });
      
      // SAFETY FALLBACK: If WebSocket was offline/reconnecting, manually refresh after delay
      if (wasOfflineRef.current) {
        console.log('⚠️ Copying task while WebSocket is reconnecting - will refresh board in 2s to ensure it appears');
        setTimeout(() => {
          if (refreshBoardDataRef.current) {
            console.log('🔄 Safety fallback: Refreshing board after task copy (was offline)');
            refreshBoardDataRef.current();
          }
        }, 2000);
      }
      
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
      
    } catch (error) {
      console.error('Failed to copy task:', error);
      setTaskCreationPause(false);
      
      // Check if it's an instance unavailable error
      if (await handleInstanceStatusError(error)) {
        // Instance status error handled by utility function
      }
    }
  };

  const handleTagAdd = (taskId: string) => async (tagId: string) => {
    try {
      const numericTagId = parseInt(tagId);
      await addTagToTask(taskId, numericTagId);
      // Refresh the task data to show the new tag
      await refreshBoardData();
    } catch (error) {
      // console.error('Failed to add tag to task:', error);
    }
  };

  const handleTagRemove = (taskId: string) => async (tagId: string) => {
    try {
      const numericTagId = parseInt(tagId);
      await removeTagFromTask(taskId, numericTagId);
      // Refresh the task data to remove the tag
      await refreshBoardData();
    } catch (error) {
      // console.error('Failed to remove tag from task:', error);
    }
  };

  const handleTaskDragStart = useCallback((task: Task) => {
    // console.log('🎯 [App] handleTaskDragStart called with task:', task.id);
    setDraggedTask(task);
    // Pause polling during drag to prevent state conflicts
  }, []);

  // Clear drag state (for Gantt drag end)
  const handleTaskDragEnd = useCallback(() => {
    // console.log('🎯 [App] handleTaskDragEnd called - clearing draggedTask');
    setDraggedTask(null);
    setDragCooldown(true);
    setTimeout(() => {
      setDragCooldown(false);
    }, DRAG_COOLDOWN_DURATION);
  }, []);

  // Clear drag state without cooldown (for multi-select exit)
  const handleClearDragState = useCallback(() => {
    // console.log('🎯 [App] handleClearDragState called - clearing draggedTask without cooldown');
    setDraggedTask(null);
    setDragCooldown(false);
  }, []);
  
  // Failsafe: Clear drag state on any click if drag is stuck
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      // Use ref to get current draggedTask value without recreating listener
      if (draggedTaskRef.current) {
        // Check if clicking on a board tab
        const target = e.target as HTMLElement;
        const isTabClick = target.closest('[class*="board-tab"]') || 
                          target.closest('button')?.id?.startsWith('board-');
        
        if (isTabClick) {
          // console.log('🚨 [App] Failsafe: Clearing stuck drag state on tab click');
          setDraggedTask(null);
        }
      }
    };
    
    document.addEventListener('click', handleGlobalClick, true);
    return () => document.removeEventListener('click', handleGlobalClick, true);
  }, []); // Remove draggedTask dependency to prevent listener recreation

  // Set drag cooldown (for Gantt operations)
  const handleSetDragCooldown = (active: boolean, duration?: number) => {
    setDragCooldown(active);
    
    // Clear any existing timeout
    if (dragCooldownTimeoutRef.current) {
      clearTimeout(dragCooldownTimeoutRef.current);
      dragCooldownTimeoutRef.current = null;
    }
    
    if (active) {
      const timeoutDuration = duration || DRAG_COOLDOWN_DURATION;
      dragCooldownTimeoutRef.current = setTimeout(() => {
        setDragCooldown(false);
        dragCooldownTimeoutRef.current = null;
      }, timeoutDuration);
    }
  };

  // Update draggedTaskRef when draggedTask changes
  useEffect(() => {
    draggedTaskRef.current = draggedTask;
  }, [draggedTask]);

  // Cleanup drag cooldown timeout on unmount
  useEffect(() => {
    return () => {
      if (dragCooldownTimeoutRef.current) {
        clearTimeout(dragCooldownTimeoutRef.current);
        dragCooldownTimeoutRef.current = null;
      }
    };
  }, []);

  // Old handleTaskDragEnd removed - replaced with unified version below

  const handleTaskDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Legacy wrapper for old HTML5 drag (still used by some components)
  const handleTaskDrop = async () => {
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
      // console.log('🎯 Board drop detected:', { targetBoardId, selectedBoard, overData: over.data.current });
      if (targetBoardId && targetBoardId !== selectedBoard) {
        // console.log('🚀 Cross-board move initiated:', active.id, '→', targetBoardId);
        handleTaskDropOnBoard(active.id as string, targetBoardId);
        return;
      } else {
        // console.log('❌ Cross-board move blocked:', { targetBoardId, selectedBoard, same: targetBoardId === selectedBoard });
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
              handleSameColumnReorderWrapper(draggedTask, sourceColumnId, newIndex);
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
        handleSameColumnReorderWrapper(draggedTask, sourceColumnId, targetIndex);
    } else {
      // Different column - move
        handleCrossColumnMoveWrapper(draggedTask, sourceColumnId, targetColumnId, targetIndex);
    }
  };

  // Wrapper for handleSameColumnReorder that provides current state
  const handleSameColumnReorderWrapper = async (task: Task, columnId: string, newIndex: number) => {
    return handleSameColumnReorder(
      task,
      columnId,
      newIndex,
      columns,
      setColumns,
      setDragCooldown,
      refreshBoardData
    );
  };

  // Handle moving task to different column via ListView dropdown or drag & drop
  const handleMoveTaskToColumn = async (taskId: string, targetColumnId: string, position?: number) => {
    console.log('🎯 handleMoveTaskToColumn called:', {
      taskId,
      targetColumnId,
      position,
      columnsCount: Object.keys(columns).length
    });

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

    console.log('🎯 Task lookup result:', {
      sourceTask: sourceTask ? { id: sourceTask.id, title: sourceTask.title, position: sourceTask.position } : null,
      sourceColumnId
    });

    if (!sourceTask || !sourceColumnId) {
      console.log('🎯 Task not found, returning early');
      return; // Task not found
    }

    const targetColumn = columns[targetColumnId];
    if (!targetColumn) {
      console.log('🎯 Target column not found:', targetColumnId);
      return;
    }

    // If no position specified, move to end of target column
    const targetIndex = position !== undefined ? position : targetColumn.tasks.length;
    
    console.log('🎯 Move decision:', {
      sourceColumnId,
      targetColumnId,
      targetIndex,
      isSameColumn: sourceColumnId === targetColumnId
    });
    
    // Check if this is a same-column reorder or cross-column move
    if (sourceColumnId === targetColumnId) {
      // Same column - use reorder logic
      console.log('🎯 Calling handleSameColumnReorder');
      await handleSameColumnReorderWrapper(sourceTask, sourceColumnId, targetIndex);
    } else {
      // Different columns - use cross-column move logic
      console.log('🎯 Calling handleCrossColumnMove');
      await handleCrossColumnMoveWrapper(sourceTask, sourceColumnId, targetColumnId, targetIndex);
    }
  };

  // Wrapper for handleCrossColumnMove that provides current state
  const handleCrossColumnMoveWrapper = async (task: Task, sourceColumnId: string, targetColumnId: string, targetIndex: number) => {
    return handleCrossColumnMove(
      task,
      sourceColumnId,
      targetColumnId,
      targetIndex,
      columns,
      setColumns,
      setDragCooldown,
      refreshBoardData
    );
  };


  const handleEditColumn = async (columnId: string, title: string, is_finished?: boolean, is_archived?: boolean) => {
    try {
      await updateColumn(columnId, title, is_finished, is_archived);
      setColumns(prev => ({
        ...prev,
        [columnId]: { ...prev[columnId], title, is_finished, is_archived }
      }));
      
      // If column becomes archived, remove it from visible columns
      if (is_archived && selectedBoard) {
        const currentVisibleColumns = boardColumnVisibility[selectedBoard] || Object.keys(columns);
        const updatedVisibleColumns = currentVisibleColumns.filter(id => id !== columnId);
        handleBoardColumnVisibilityChange(selectedBoard, updatedVisibleColumns);
      }
      
      await fetchQueryLogs();
    } catch (error) {
      // console.error('Failed to update column:', error);
    }
  };

  // Helper function to count tasks in a column
  const getColumnTaskCount = (columnId: string): number => {
    return columns[columnId]?.tasks?.length || 0;
  };

  // Show column delete confirmation (or delete immediately if no tasks)
  const handleRemoveColumn = async (columnId: string) => {
    const taskCount = getColumnTaskCount(columnId);
    // console.log(`🗑️ Delete column ${columnId}, task count: ${taskCount}`);
    
    if (taskCount === 0) {
      // No tasks - delete immediately without confirmation
      // console.log(`🗑️ Deleting empty column immediately`);
      await handleConfirmColumnDelete(columnId);
    } else {
      // Has tasks - show confirmation dialog
      // console.log(`🗑️ Showing confirmation dialog for column with ${taskCount} tasks`);
      // console.log(`🗑️ Setting showColumnDeleteConfirm to: ${columnId}`);
      setShowColumnDeleteConfirm(columnId);
    }
  };

  // Confirm column deletion
  const handleConfirmColumnDelete = async (columnId: string) => {
    // console.log(`✅ Confirming deletion of column ${columnId}`);
    try {
      await deleteColumn(columnId);
      const { [columnId]: removed, ...remainingColumns } = columns;
      setColumns(remainingColumns);
      setShowColumnDeleteConfirm(null);
      await fetchQueryLogs();
    } catch (error) {
      // console.error('Failed to delete column:', error);
    }
  };

  // Cancel column deletion
  const handleCancelColumnDelete = () => {
    // console.log(`❌ Cancelling column deletion`);
    setShowColumnDeleteConfirm(null);
  };

  // Handle cross-board task drop
  const handleTaskDropOnBoard = async (taskId: string, targetBoardId: string) => {
    try {
      // console.log(`🔄 Moving task ${taskId} to board ${targetBoardId}`);
      await moveTaskToBoard(taskId, targetBoardId);
      
      // Refresh both boards to reflect the change
      await refreshBoardData();
      
      // Show success message
      // console.log(`✅ Task moved successfully to ${targetBoardId}`);
      
    } catch (error) {
      // console.error('Failed to move task to board:', error);
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
      clearCustomCursor(dragStartedRef);
    }
  }, [draggedTask]);

  const handleAddColumn = async (afterColumnId: string) => {
    if (!selectedBoard) return;

    // Generate auto-numbered column name
    const baseColumnName = i18n.t('column.newColumn', { ns: 'tasks' });
    const existingColumnTitles = Object.values(columns).map(col => col.title);
    let columnNumber = 1;
    let newTitle = `${baseColumnName} ${columnNumber}`;
    while (existingColumnTitles.includes(newTitle)) {
      columnNumber++;
      newTitle = `${baseColumnName} ${columnNumber}`;
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
      await createColumn(newColumn);
      
      // Add the new column to visible columns (new columns are never archived by default)
      const currentVisibleColumns = boardColumnVisibility[selectedBoard] || Object.keys(columns);
      const updatedVisibleColumns = [...currentVisibleColumns, columnId];
      handleBoardColumnVisibilityChange(selectedBoard, updatedVisibleColumns);
      
      await refreshBoardData(); // Refresh to ensure consistent state
      
      // Renumber all columns to ensure clean integer positions
      await renumberColumns(selectedBoard);
      
      await fetchQueryLogs();
    } catch (error) {
      // console.error('Failed to create column:', error);
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
      
      // Update database - pass the new position from the reordered array
      const movedColumn = updatedColumns.find(col => col.id === active.id);
      if (movedColumn) {
        await reorderColumns(active.id as string, movedColumn.position, selectedBoard);
      }
      await fetchQueryLogs();
    } catch (error) {
      // console.error('Failed to reorder columns:', error);
      // Revert on error
      await refreshBoardData();
    }
  };

  // Calculate grid columns based on number of columns and user's preferred width
  const columnCount = Object.keys(columns).length;
  const gridStyle = calculateGridStyle(columnCount, kanbanColumnWidth);
  
  // Handle column width resize
  const handleColumnWidthResize = (deltaX: number) => {
    const newWidth = Math.max(280, Math.min(600, kanbanColumnWidth + deltaX)); // Min 200px, max 600px
    setKanbanColumnWidth(newWidth);
    updateCurrentUserPreference('kanbanColumnWidth', newWidth);
  };

  const clearQueryLogs = async () => {
    setQueryLogs([]);
  };



  const handleToggleTaskViewMode = () => {
    const modes: TaskViewMode[] = ['compact', 'shrink', 'expand'];
    const currentIndex = modes.indexOf(taskFilters.taskViewMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const newMode = modes[nextIndex];
    
    taskFilters.setTaskViewMode(newMode);
    updateCurrentUserPreference('taskViewMode', newMode);
  };

  const handleViewModeChange = (mode: ViewMode) => {
    taskFilters.setViewMode(mode);
    taskFilters.viewModeRef.current = mode;
    updateCurrentUserPreference('viewMode', mode);
  };

  // Filter handlers are now in useTaskFilters hook (taskFilters.*)

  // Handle selecting all members
  // Handle dismissing column warnings
  const handleDismissColumnWarning = (columnId: string) => {
    setColumnWarnings(prev => {
      const { [columnId]: removed, ...rest } = prev;
      return rest;
    });
  };

  // Filter handlers, shouldIncludeTask, and filtering useEffect are now in useTaskFilters hook (taskFilters.*)

  // Use filtered columns state
  const hasColumnFilters = selectedBoard ? (boardColumnVisibility[selectedBoard] && boardColumnVisibility[selectedBoard].length < Object.keys(columns).length) : false;
  const activeFilters = hasActiveFilters(taskFilters.searchFilters, taskFilters.isSearchActive) || taskFilters.selectedMembers.length > 0 || taskFilters.includeAssignees || taskFilters.includeWatchers || taskFilters.includeCollaborators || taskFilters.includeRequesters || hasColumnFilters;
  const getTaskCountForBoard = (board: Board) => {
    // During board switching, return the last calculated count to prevent flashing
    if (isSwitchingBoard && lastTaskCountsRef.current[board.id] !== undefined) {
      return lastTaskCountsRef.current[board.id];
    }

    let taskCount = 0;

    // For the currently selected board, apply both search filtering AND column visibility filtering
    if (board.id === selectedBoard) {
      // Get visible columns for this board
      const visibleColumnIds = boardColumnVisibility[selectedBoard] || Object.keys(columns);
      
      // Apply column visibility filtering first (excluding archived columns)
      const columnFilteredColumns: Columns = {};
      visibleColumnIds.forEach(columnId => {
        if (columns[columnId] && !columns[columnId].is_archived) {
          columnFilteredColumns[columnId] = columns[columnId];
        }
      });
      
      // Then apply search filtering to the visible columns
      if (taskFilters.filteredColumns && Object.keys(taskFilters.filteredColumns).length > 0) {
        // Additional validation: check if filteredColumns contain columns that belong to this board
        const currentBoardData = boards.find(b => b.id === selectedBoard);
        const currentBoardColumnIds = currentBoardData ? Object.keys(currentBoardData.columns || {}) : [];
        const filteredColumnIds = Object.keys(taskFilters.filteredColumns);
        
        // Only use filteredColumns if they match the current board's column structure
        const isValidForCurrentBoard = currentBoardColumnIds.length > 0 && 
          filteredColumnIds.every(id => currentBoardColumnIds.includes(id)) &&
          currentBoardColumnIds.every(id => filteredColumnIds.includes(id));
        
        if (isValidForCurrentBoard) {
          // Apply search filtering to visible columns only (excluding archived)
          let totalCount = 0;
          Object.values(taskFilters.filteredColumns).forEach(column => {
            if (visibleColumnIds.includes(column.id) && !column.is_archived) {
              totalCount += column.tasks.length;
            }
          });
          taskCount = totalCount;
        }
      }
      
      // If filteredColumns wasn't used (or wasn't valid), apply filters manually
      if (taskCount === 0 || !taskFilters.filteredColumns || Object.keys(taskFilters.filteredColumns).length === 0) {
        let totalCount = 0;
        Object.values(columnFilteredColumns).forEach(column => {
          // Apply sprint filtering if active
          let columnTasks = column.tasks;
          if (taskFilters.selectedSprintId !== null) {
            if (taskFilters.selectedSprintId === 'backlog') {
              columnTasks = columnTasks.filter(task => !task.sprintId);
            } else {
              columnTasks = columnTasks.filter(task => task.sprintId === taskFilters.selectedSprintId);
            }
          }
          totalCount += columnTasks.length;
        });
        taskCount = totalCount;
      }
    }
    
    // For other boards, apply the same filtering logic used in performFiltering
    const isFiltering = taskFilters.isSearchActive || taskFilters.selectedMembers.length > 0 || taskFilters.includeAssignees || taskFilters.includeWatchers || taskFilters.includeCollaborators || taskFilters.includeRequesters || taskFilters.selectedSprintId !== null;
    
    if (!isFiltering) {
      // No filters active - return total count (excluding archived columns)
      let totalCount = 0;
      Object.values(board.columns || {}).forEach(column => {
        // Convert to boolean to handle SQLite integer values (0/1)
        const isArchived = Boolean(column.is_archived);
        if (!isArchived) {
          totalCount += column.tasks?.length || 0;
        }
      });
      taskCount = totalCount;
    }
    
    // Apply search filters using the utility function
    let searchFilteredCount = getFilteredTaskCountForBoard(board, taskFilters.searchFilters, taskFilters.isSearchActive, members, boards);
    
    // If no member filtering is needed (no members selected AND no member-specific checkboxes enabled)
    // OR if we're only doing search filtering (text, dates, tags, project/task identifiers)
    const hasMemberFiltering = taskFilters.selectedMembers.length > 0 || 
      (taskFilters.includeAssignees && taskFilters.selectedMembers.length > 0) || 
      (taskFilters.includeWatchers && taskFilters.selectedMembers.length > 0) || 
      (taskFilters.includeCollaborators && taskFilters.selectedMembers.length > 0) || 
      (taskFilters.includeRequesters && taskFilters.selectedMembers.length > 0);
    
    if (!hasMemberFiltering && taskFilters.selectedSprintId === null) {
      taskCount = searchFilteredCount;
    }
    
    // Apply member filtering and sprint filtering on top of search filtering
    let totalCount = 0;
    Object.values(board.columns || {}).forEach(column => {
      if (!column.tasks || !Array.isArray(column.tasks)) return;
      
      // Skip archived columns
      const isArchived = Boolean(column.is_archived);
      if (isArchived) return;
      
      const filteredTasks = column.tasks.filter(task => {
        if (!task) return false;
        
        // FIRST: Apply sprint filtering (if a sprint is selected)
        if (taskFilters.selectedSprintId !== null) {
          if (taskFilters.selectedSprintId === 'backlog') {
            // Show only tasks NOT assigned to any sprint (backlog)
            if (task.sprintId !== null && task.sprintId !== undefined) {
              return false;
            }
          } else {
            // Show only tasks with matching sprint_id (explicit assignment)
            if (task.sprintId !== taskFilters.selectedSprintId) {
              return false;
            }
          }
        }
        
        // SECOND: Apply search filters using the same logic as performFiltering
        if (taskFilters.isSearchActive) {
          const searchFiltered = filterTasks([task], taskFilters.searchFilters, taskFilters.isSearchActive, members, boards);
          if (searchFiltered.length === 0) return false;
        }
        
        // Then apply member filtering
        if (taskFilters.selectedMembers.length === 0 && !taskFilters.includeAssignees && !taskFilters.includeWatchers && !taskFilters.includeCollaborators && !taskFilters.includeRequesters) {
          return true;
        }
        
        // If no members selected, treat as "all members" (empty array = show all)
        const showAllMembers = taskFilters.selectedMembers.length === 0;
        const memberIds = new Set(taskFilters.selectedMembers);
        let hasMatchingMember = false;
        
        if (taskFilters.includeAssignees) {
          if (showAllMembers) {
            // Show all tasks with assignees (any member)
            if (task.memberId) hasMatchingMember = true;
          } else {
            // Show only tasks assigned to selected members
            if (task.memberId && memberIds.has(task.memberId)) hasMatchingMember = true;
          }
        }
        
        if (!hasMatchingMember && taskFilters.includeRequesters) {
          if (showAllMembers) {
            // Show all tasks with requesters
            if (task.requesterId) hasMatchingMember = true;
          } else {
            // Show only tasks requested by selected members
            if (task.requesterId && memberIds.has(task.requesterId)) hasMatchingMember = true;
          }
        }
        
        if (!hasMatchingMember && taskFilters.includeWatchers && task.watchers && Array.isArray(task.watchers)) {
          if (showAllMembers) {
            // Show all tasks with watchers
            if (task.watchers.length > 0) hasMatchingMember = true;
          } else {
            // Show only tasks watched by selected members
            if (task.watchers.some(w => w && memberIds.has(w.id))) hasMatchingMember = true;
          }
        }
        
        if (!hasMatchingMember && taskFilters.includeCollaborators && task.collaborators && Array.isArray(task.collaborators)) {
          if (showAllMembers) {
            // Show all tasks with collaborators
            if (task.collaborators.length > 0) hasMatchingMember = true;
          } else {
            // Show only tasks with selected members as collaborators
            if (task.collaborators.some(c => c && memberIds.has(c.id))) hasMatchingMember = true;
          }
        }
        
        return hasMatchingMember;
      });
      
      totalCount += filteredTasks.length;
    });
    
    taskCount = totalCount;
    
    // Store the calculated count for potential use during board switching
    lastTaskCountsRef.current[board.id] = taskCount;
    
    return taskCount;
  };


  // Handle password reset pages (accessible without authentication)
  if (currentPage === 'forgot-password') {
    return <ForgotPassword onBackToLogin={() => window.location.hash = '#kanban'} />;
  }
  
  if (currentPage === 'reset-password') {
  return (
      <ResetPassword 
        token={resetToken}
        onBackToLogin={() => window.location.hash = '#kanban'}
        onResetSuccess={() => window.location.hash = '#reset-success'}
        onAutoLogin={async (user, token) => {
          // Automatically log the user in
          await handleLogin(user, token);
          // Small delay to allow auth state to propagate, then navigate
          setTimeout(() => {
            window.location.hash = '#kanban';
          }, 100);
        }}
      />
    );
  }
  
  if (currentPage === 'reset-success') {
    return <ResetPasswordSuccess onBackToLogin={() => window.location.hash = '#kanban'} />;
  }
  
  if (currentPage === 'activate-account') {
    return (
      <ActivateAccount 
        token={activationToken}
        email={activationEmail}
        onBackToLogin={() => window.location.hash = '#kanban'}
        isLoading={!activationParsed}
        onAutoLogin={async (user, token) => {
          // Automatically log the user in
          await handleLogin(user, token);
          // Small delay to allow auth state to propagate, then navigate
          setTimeout(() => {
            window.location.hash = '#kanban';
          }, 100);
        }}
      />
    );
  }

  // Handle task page (requires authentication)
  if (currentPage === 'task') {
    if (!isAuthenticated && authChecked) {
      return (
        <Login
          siteSettings={siteSettings}
          onLogin={handleLogin}
          hasDefaultAdmin={hasDefaultAdmin ?? undefined}
          intendedDestination={intendedDestination}
          onForgotPassword={() => {
            localStorage.removeItem('authToken');
            window.location.hash = '#forgot-password';
          }}
        />
      );
    }
    
    return (
      <ThemeProvider>
        <TourProvider currentUser={currentUser} onViewModeChange={handleViewModeChange} onPageChange={handlePageChange}>
          <Suspense fallback={<PageLoader />}>
            <TaskPage 
              currentUser={currentUser}
              siteSettings={siteSettings}
              members={members}
              isPolling={isPolling}
              lastPollTime={lastPollTime}
              onLogout={handleLogout}
              onPageChange={handlePageChange}
              onRefresh={handleRefreshData}
              onInviteUser={handleInviteUser}
              // isAutoRefreshEnabled={isAutoRefreshEnabled} // Disabled - using real-time updates
              // onToggleAutoRefresh={handleToggleAutoRefresh} // Disabled - using real-time updates
            />
          </Suspense>
        </TourProvider>
      </ThemeProvider>
    );
  }

  // Show loading state while checking authentication
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated (but only after auth check is complete)
  if (!isAuthenticated) {
    return (
      <Login 
        onLogin={handleLogin} 
        siteSettings={siteSettings}
        hasDefaultAdmin={hasDefaultAdmin ?? undefined}
        intendedDestination={intendedDestination}
        onForgotPassword={() => {
          // Clear auth token to prevent conflicts during password reset
          localStorage.removeItem('authToken');
          window.location.hash = '#forgot-password';
          // setCurrentPage will be called by the routing handler
        }}
      />
    );
  }

  return (
    <TourProvider currentUser={currentUser} onViewModeChange={handleViewModeChange} onPageChange={handlePageChange}>
      <ThemeProvider>
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
      {/* Demo Reset Counter is now rendered in Header component */}
      
      {/* New Enhanced Drag & Drop System */}
      <SimpleDragDropManager
        currentBoardId={selectedBoard || ''}
        columns={taskFilters.filteredColumns}
        boards={boards}
        isOnline={isOnline}
        onTaskMove={handleMoveTaskToColumn}
        onTaskMoveToDifferentBoard={handleTaskDropOnBoard}
        onColumnReorder={async (columnId: string, newPosition: number) => {
          try {
            await reorderColumns(columnId, newPosition, selectedBoard || '');
            await renumberColumns(selectedBoard || ''); // Ensure clean positions
            await fetchQueryLogs();
            await refreshBoardData();
          } catch (error) {
            // console.error('Failed to reorder column:', error);
            await refreshBoardData();
          }
        }}
        onDraggedTaskChange={setDraggedTask}
        onDraggedColumnChange={setDraggedColumn}
        onBoardTabHover={setIsHoveringBoardTab}
        onDragPreviewChange={setDragPreview}
      >
      <Header
        currentUser={currentUser}
        siteSettings={siteSettings}
        currentPage={currentPage}
        // isPolling={isPolling} // Removed - using real-time WebSocket updates
        // lastPollTime={lastPollTime} // Removed - using real-time WebSocket updates
        members={members}
        onProfileClick={() => modalState.setShowProfileModal(true)}
        onLogout={handleLogout}
        onPageChange={handlePageChange}
          onRefresh={handleRefreshData}
          // isAutoRefreshEnabled={isAutoRefreshEnabled} // Disabled - using real-time updates
          // onToggleAutoRefresh={handleToggleAutoRefresh} // Disabled - using real-time updates
        onHelpClick={() => modalState.setShowHelpModal(true)}
        onInviteUser={handleInviteUser}
        selectedSprintId={taskFilters.selectedSprintId}
        onSprintChange={taskFilters.handleSprintChange}
        boards={boards}
      />

      {/* Network Status Indicator */}
      <NetworkStatusIndicator isOnline={isOnline} />

      <div className={versionStatus.instanceStatus.status !== 'active' && !versionStatus.instanceStatus.isDismissed ? 'pt-20' : ''}>
        <MainLayout
        currentPage={currentPage}
        currentUser={currentUser} 
        selectedTask={selectedTask}
        adminRefreshKey={adminRefreshKey}
        siteSettings={siteSettings}
        isOnline={isOnline}
        selectedSprintId={taskFilters.selectedSprintId}
              onUsersChanged={async () => {
                try {
                  const loadedMembers = await getMembers(taskFilters.includeSystem);
                  setMembers(loadedMembers);
                } catch (error) {
                  // console.error('❌ Failed to refresh members:', error);
                }
              }}
              onSettingsChanged={refreshSiteSettings}
        loading={loading}
                    members={members}
        boards={boards}
        selectedBoard={selectedBoard}
        columns={columns}
                    selectedMembers={taskFilters.selectedMembers}
        draggedTask={draggedTask}
        draggedColumn={draggedColumn}
        dragPreview={dragPreview}
                      availablePriorities={availablePriorities}
        availableTags={availableTags}
        taskViewMode={taskFilters.taskViewMode}
        isSearchActive={taskFilters.isSearchActive}
        searchFilters={taskFilters.searchFilters}
        filteredColumns={taskFilters.filteredColumns}
        activeFilters={activeFilters}
        gridStyle={gridStyle}
        sensors={sensors}
        collisionDetection={collisionDetection}
        boardColumnVisibility={boardColumnVisibility}
        onBoardColumnVisibilityChange={handleBoardColumnVisibilityChange}
        kanbanColumnWidth={kanbanColumnWidth}
        onColumnWidthResize={handleColumnWidthResize}

        onSelectMember={taskFilters.handleMemberToggle}
        onClearMemberSelections={taskFilters.handleClearMemberSelections}
        onSelectAllMembers={taskFilters.handleSelectAllMembers}
        isAllModeActive={taskFilters.isAllModeActive}
        includeAssignees={taskFilters.includeAssignees}
        includeWatchers={taskFilters.includeWatchers}
        includeCollaborators={taskFilters.includeCollaborators}
        includeRequesters={taskFilters.includeRequesters}
        includeSystem={taskFilters.includeSystem}
        onToggleAssignees={taskFilters.handleToggleAssignees}
        onToggleWatchers={taskFilters.handleToggleWatchers}
        onToggleCollaborators={taskFilters.handleToggleCollaborators}
        onToggleRequesters={taskFilters.handleToggleRequesters}
        onToggleSystem={taskFilters.handleToggleSystem}
        onToggleTaskViewMode={handleToggleTaskViewMode}
        viewMode={taskFilters.viewMode}
        onViewModeChange={handleViewModeChange}
        onToggleSearch={taskFilters.handleToggleSearch}
        onSearchFiltersChange={taskFilters.handleSearchFiltersChange}
        currentFilterView={taskFilters.currentFilterView}
        sharedFilterViews={taskFilters.sharedFilterViews}
        onFilterViewChange={taskFilters.handleFilterViewChange}
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
                                    onEditTask={handleEditTask}
                                    onCopyTask={handleCopyTask}
                                    onRemoveTask={handleRemoveTask}
                                    onTagAdd={handleTagAdd}
                                    onTagRemove={handleTagRemove}
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
                                    onTaskDragEnd={handleTaskDragEnd}
                                    onClearDragState={handleClearDragState}
                                    onTaskDragOver={handleTaskDragOver}
                                    onRefreshBoardData={refreshBoardData}
                                    onSetDragCooldown={handleSetDragCooldown}
                                    onTaskDrop={handleTaskDrop}
                                    onSelectTask={handleSelectTask}
                                    onTaskDropOnBoard={handleTaskDropOnBoard}
                                    isTaskMiniMode={isTaskMiniMode}
                                    onTaskEnterMiniMode={handleTaskEnterMiniMode}
                                    onTaskExitMiniMode={handleTaskExitMiniMode}
                                    
                                    // Task linking props
                                    isLinkingMode={taskLinking.isLinkingMode}
                                    linkingSourceTask={taskLinking.linkingSourceTask}
                                    linkingLine={taskLinking.linkingLine}
                                    onStartLinking={handleStartLinking}
                                    onUpdateLinkingLine={handleUpdateLinkingLine}
                                    onFinishLinking={handleFinishLinking}
                                    onCancelLinking={handleCancelLinking}
                                    
                                    // Hover highlighting props
                                    hoveredLinkTask={taskLinking.hoveredLinkTask}
                                    onLinkToolHover={handleLinkToolHover}
                                    onLinkToolHoverEnd={handleLinkToolHoverEnd}
                                    getTaskRelationshipType={getTaskRelationshipType}
                                    
                                    // Auto-synced relationships
                                    boardRelationships={taskLinking.boardRelationships}
        />
      </div>

      {versionStatus.InstanceStatusBanner()}
      
      {/* Version Update Banner */}
      {versionStatus.showVersionBanner && (
        <VersionUpdateBanner
          currentVersion={versionStatus.versionInfo.currentVersion}
          newVersion={versionStatus.versionInfo.newVersion}
          onRefresh={versionStatus.handleRefreshVersion}
          onDismiss={versionStatus.handleDismissVersionBanner}
        />
      )}

      <Suspense fallback={null}>
        <ModalManager
          selectedTask={selectedTask}
          taskDetailsOptions={taskDetailsOptions}
                                  members={members}
          onTaskClose={() => handleSelectTask(null)}
          onTaskUpdate={handleEditTask}
          showHelpModal={modalState.showHelpModal}
          onHelpClose={() => modalState.setShowHelpModal(false)}
          showProfileModal={modalState.showProfileModal}
          currentUser={currentUser}
          onProfileClose={() => {
            modalState.setShowProfileModal(false);
            modalState.setIsProfileBeingEdited(false); // Reset editing state when modal closes
          }}
          onProfileUpdated={handleProfileUpdated}
          isProfileBeingEdited={modalState.isProfileBeingEdited}
          onProfileEditingChange={modalState.setIsProfileBeingEdited}
          onActivityFeedToggle={activityFeed.handleActivityFeedToggle}
          onAccountDeleted={() => {
            // Account deleted successfully - handle logout and redirect
            handleLogout();
          }}
          siteSettings={siteSettings}
          boards={boards}
        />
      </Suspense>

      {/* Task Delete Confirmation Popup */}
      <TaskDeleteConfirmation
        isOpen={!!taskDeleteConfirmation.confirmationTask}
        task={taskDeleteConfirmation.confirmationTask}
        onConfirm={taskDeleteConfirmation.confirmDelete}
        onCancel={taskDeleteConfirmation.cancelDelete}
        isDeleting={taskDeleteConfirmation.isDeleting}
        position={taskDeleteConfirmation.confirmationPosition}
      />

      {showDebug && (
        <DebugPanel
          logs={queryLogs}
          onClear={clearQueryLogs}
        />
      )}

      {/* Enhanced Drag Overlay */}
      <SimpleDragOverlay 
        draggedTask={draggedTask}
        members={members}
        isHoveringBoardTab={isHoveringBoardTab}
      />
      </SimpleDragDropManager>

      {/* Activity Feed */}
      <ActivityFeed
        isVisible={activityFeed.showActivityFeed}
        onClose={() => activityFeed.setShowActivityFeed(false)}
        isMinimized={activityFeed.activityFeedMinimized}
        onMinimizedChange={activityFeed.handleActivityFeedMinimizedChange}
        activities={activityFeed.activities}
        lastSeenActivityId={activityFeed.lastSeenActivityId}
        clearActivityId={activityFeed.clearActivityId}
        onMarkAsRead={activityFeed.handleActivityFeedMarkAsRead}
        onClearAll={activityFeed.handleActivityFeedClearAll}
        position={activityFeed.activityFeedPosition}
        onPositionChange={activityFeed.setActivityFeedPosition}
        dimensions={activityFeed.activityFeedDimensions}
        onDimensionsChange={activityFeed.setActivityFeedDimensions}
        userId={currentUser?.id || null}
      />

      {/* Task Linking Overlay */}
      <TaskLinkingOverlay
        isLinkingMode={taskLinking.isLinkingMode}
        linkingSourceTask={taskLinking.linkingSourceTask}
        linkingLine={taskLinking.linkingLine}
        feedbackMessage={taskLinking.linkingFeedbackMessage}
        onUpdateLinkingLine={handleUpdateLinkingLine}
        onFinishLinking={handleFinishLinking}
        onCancelLinking={handleCancelLinking}
      />
      </div>
      
      {/* Toast Notifications */}
      <ToastContainer />
      </ThemeProvider>
    </TourProvider>
  );
}
