import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import { SavedFilterView, getSavedFilterView } from './api';
import DebugPanel from './components/DebugPanel';
import ResetCountdown from './components/ResetCountdown';
import { ThemeProvider } from './contexts/ThemeContext';
import { TourProvider } from './contexts/TourContext';

import Login from './components/Login';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import ResetPasswordSuccess from './components/ResetPasswordSuccess';
import ActivateAccount from './components/ActivateAccount';
import Header from './components/layout/Header';
import MainLayout from './components/layout/MainLayout';
import TaskPage from './components/TaskPage';
import ModalManager from './components/layout/ModalManager';
import MiniTaskIcon from './components/MiniTaskIcon';
import TaskCard from './components/TaskCard';
import TaskDeleteConfirmation from './components/TaskDeleteConfirmation';
import ActivityFeed from './components/ActivityFeed';
import TaskLinkingOverlay from './components/TaskLinkingOverlay';
import NetworkStatusIndicator from './components/NetworkStatusIndicator';
import VersionUpdateBanner from './components/VersionUpdateBanner';
import Test from './components/Test';
import { useTaskDeleteConfirmation } from './hooks/useTaskDeleteConfirmation';
import api, { getMembers, getBoards, deleteTask, updateTask, reorderTasks, reorderColumns, reorderBoards, updateColumn, updateBoard, createTaskAtTop, createTask, createColumn, createBoard, deleteColumn, deleteBoard, getUserSettings, createUser, getUserStatus, getActivityFeed, updateSavedFilterView, getCurrentUser } from './api';
import { toast, ToastContainer } from './utils/toast';
import { useLoadingState } from './hooks/useLoadingState';
import { useDebug } from './hooks/useDebug';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAuth } from './hooks/useAuth';
import { useDataPolling, UserStatus } from './hooks/useDataPolling';
import { generateUUID } from './utils/uuid';
import websocketClient from './services/websocketClient';
import { loadUserPreferences, loadUserPreferencesAsync, updateUserPreference, updateActivityFeedPreference, loadAdminDefaults, TaskViewMode, ViewMode, isGloballySavingPreferences, registerSavingStateCallback } from './utils/userPreferences';
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
import { KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DndContext, DragOverlay } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { SimpleDragDropManager } from './components/dnd/SimpleDragDropManager';
import SimpleDragOverlay from './components/dnd/SimpleDragOverlay';

// System user member ID constant
const SYSTEM_MEMBER_ID = '00000000-0000-0000-0000-000000000001';

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
  
  // Activity Feed state
  const [showActivityFeed, setShowActivityFeed] = useState<boolean>(false);
  const [activityFeedMinimized, setActivityFeedMinimized] = useState<boolean>(false);
  
  // Auto-refresh toggle state (loaded from user preferences)
  // const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState<boolean>(true); // Disabled - using real-time updates
  const [activityFeedPosition, setActivityFeedPosition] = useState<{ x: number; y: number }>({ 
    x: typeof window !== 'undefined' ? window.innerWidth - 220 : 0, 
    y: 66 
  });
  const [activityFeedDimensions, setActivityFeedDimensions] = useState<{ width: number; height: number }>({
    width: 208,
    height: typeof window !== 'undefined' ? window.innerHeight - 200 : 400
  });
  const [activities, setActivities] = useState<any[]>([]);
  const [lastSeenActivityId, setLastSeenActivityId] = useState<number>(0);
  const [clearActivityId, setClearActivityId] = useState<number>(0);
  
  // Utility function to check instance status on API failures
  const checkInstanceStatusOnError = async (error: any) => {
    if (error?.response?.status === 503 && error?.response?.data?.code === 'INSTANCE_SUSPENDED') {
      // Update instance status state
      setInstanceStatus({
        status: error.response.data.status,
        message: error.response.data.message,
        isDismissed: false
      });
      return true; // Indicates this was an instance status error
    }
    
    // For any other API error, check if instance is still active
    if (error?.response?.status >= 500) {
      try {
        const response = await api.get('/auth/instance-status');
        if (!response.data.isActive) {
          setInstanceStatus({
            status: response.data.status,
            message: response.data.message,
            isDismissed: false
          });
        }
      } catch (statusError) {
        // If we can't check status, assume it's suspended
        setInstanceStatus({
          status: 'suspended',
          message: 'Unable to determine instance status',
          isDismissed: false
        });
      }
    }
    
    return false; // Not an instance status error
  };

  // User Status for permission refresh
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const userStatusRef = useRef<UserStatus | null>(null);
  
  // Instance Status Banner State
  const [instanceStatus, setInstanceStatus] = useState<{
    status: string;
    message: string;
    isDismissed: boolean;
  }>({
    status: 'active',
    message: '',
    isDismissed: false
  });

  // Version Update Banner State
  const [showVersionBanner, setShowVersionBanner] = useState<boolean>(false);
  const [versionInfo, setVersionInfo] = useState<{
    currentVersion: string;
    newVersion: string;
  }>({
    currentVersion: '',
    newVersion: ''
  });

  // Version detection setup
  useEffect(() => {
    const handleVersionChange = (oldVersion: string, newVersion: string) => {
      console.log(`🔔 Version change detected: ${oldVersion} → ${newVersion}`);
      setVersionInfo({ currentVersion: oldVersion, newVersion });
      setShowVersionBanner(true);
    };

    // Register version change listener
    versionDetection.onVersionChange(handleVersionChange);

    // Clean up listener on unmount
    return () => {
      versionDetection.offVersionChange(handleVersionChange);
    };
  }, []);

  // Handlers for version banner
  const handleRefreshVersion = () => {
    window.location.reload();
  };

  const handleDismissVersionBanner = () => {
    setShowVersionBanner(false);
  };
  
  // Instance Status Banner Component
  const InstanceStatusBanner = () => {
    if (instanceStatus.status === 'active' || instanceStatus.isDismissed) {
      return null;
    }

    const getStatusColor = (status: string) => {
      switch (status) {
        case 'suspended':
          return 'bg-yellow-100 border-yellow-500 text-yellow-700';
        case 'terminated':
          return 'bg-red-100 border-red-500 text-red-700';
        case 'failed':
          return 'bg-red-100 border-red-500 text-red-700';
        case 'deploying':
          return 'bg-blue-100 border-blue-500 text-blue-700';
        default:
          return 'bg-gray-100 border-gray-500 text-gray-700';
      }
    };

    const getStatusIcon = (status: string) => {
      switch (status) {
        case 'suspended':
          return (
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          );
        case 'terminated':
        case 'failed':
          return (
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          );
        case 'deploying':
          return (
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
          );
        default:
          return (
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          );
      }
    };

    return (
      <div className={`fixed top-0 left-0 right-0 z-50 border-l-4 p-4 ${getStatusColor(instanceStatus.status)}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="flex-shrink-0 mr-3">
              {getStatusIcon(instanceStatus.status)}
            </div>
            <div>
              <p className="text-sm font-medium">
                <strong>Instance Unavailable</strong>
              </p>
              <p className="text-sm mt-1">
                {instanceStatus.message}
              </p>
            </div>
          </div>
          <button
            onClick={() => setInstanceStatus(prev => ({ ...prev, isDismissed: true }))}
            className="flex-shrink-0 ml-4 text-gray-400 hover:text-gray-600"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    );
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
  const WEBSOCKET_THROTTLE_MS = 50; // Throttle to max 20 updates per second for better performance
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
      setFilteredColumns(prevFilteredColumns => {
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
  const [selectedMembers, setSelectedMembers] = useState<string[]>(userPrefs.selectedMembers);
  const [includeAssignees, setIncludeAssignees] = useState(userPrefs.includeAssignees);
  const [includeWatchers, setIncludeWatchers] = useState(userPrefs.includeWatchers);
  const [includeCollaborators, setIncludeCollaborators] = useState(userPrefs.includeCollaborators);
  const [includeRequesters, setIncludeRequesters] = useState(userPrefs.includeRequesters);
  const [includeSystem, setIncludeSystem] = useState(userPrefs.includeSystem || false);
  
  // Computed: Check if we're in "All Roles" mode (all main role checkboxes checked)
  // This is independent of member selection - works anytime
  const isAllModeActive = useMemo(() => {
    const allMainCheckboxesChecked = includeAssignees && includeWatchers && 
      includeCollaborators && includeRequesters;
    
    return allMainCheckboxesChecked;
  }, [includeAssignees, includeWatchers, includeCollaborators, includeRequesters]);
  const [taskViewMode, setTaskViewMode] = useState<TaskViewMode>(userPrefs.taskViewMode);
  const [viewMode, setViewMode] = useState<ViewMode>(userPrefs.viewMode);
  const viewModeRef = useRef<ViewMode>(userPrefs.viewMode);
  const [isSearchActive, setIsSearchActive] = useState(userPrefs.isSearchActive);
  const [isAdvancedSearchExpanded, setIsAdvancedSearchExpanded] = useState(userPrefs.isAdvancedSearchExpanded);
  const [searchFilters, setSearchFilters] = useState(userPrefs.searchFilters);
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(userPrefs.selectedSprintId);
  const [currentFilterView, setCurrentFilterView] = useState<SavedFilterView | null>(null);
  const [sharedFilterViews, setSharedFilterViews] = useState<SavedFilterView[]>([]);
  const [filteredColumns, setFilteredColumns] = useState<Columns>({});
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
    updateUserPreference('boardColumnVisibility', newVisibility);
    
    // Save to current filter view if it exists
    if (currentFilterView) {
      // Update the view in the database
      updateSavedFilterView(currentFilterView.id, {
        filters: {
          ...currentFilterView,
          boardColumnFilter: JSON.stringify(newVisibility)
        }
      }).catch(error => {
        console.error('Failed to save column filter to view:', error);
      });
    }
  };

  // Load column filter from current filter view or user settings
  useEffect(() => {
    if (currentFilterView?.boardColumnFilter) {
      try {
        const columnFilter = JSON.parse(currentFilterView.boardColumnFilter);
        setBoardColumnVisibility(columnFilter);
      } catch (error) {
        console.error('Failed to parse boardColumnFilter:', error);
        // Fall back to user settings if parsing fails
        const savedVisibility = userPrefs?.boardColumnVisibility || {};
        setBoardColumnVisibility(savedVisibility);
      }
    } else {
      // Fall back to user settings when no filter view is active
      const savedVisibility = userPrefs?.boardColumnVisibility || {};
      setBoardColumnVisibility(savedVisibility);
    }
  }, [currentFilterView, userPrefs]);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isProfileBeingEdited, setIsProfileBeingEdited] = useState(false);
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
  
  // Task linking state
  const [isLinkingMode, setIsLinkingMode] = useState(false);
  const [linkingSourceTask, setLinkingSourceTask] = useState<Task | null>(null);
  const [linkingLine, setLinkingLine] = useState<{startX: number, startY: number, endX: number, endY: number} | null>(null);
  const [linkingFeedbackMessage, setLinkingFeedbackMessage] = useState<string | null>(null);
  
  // Hover highlighting for relationships
  const [hoveredLinkTask, setHoveredLinkTask] = useState<Task | null>(null);
  const [taskRelationships, setTaskRelationships] = useState<{[taskId: string]: any[]}>({});
  const [boardRelationships, setBoardRelationships] = useState<any[]>([]);
  
  // Debug showColumnDeleteConfirm changes
  useEffect(() => {
    if (showColumnDeleteConfirm) {
      // console.log(`📋 showColumnDeleteConfirm changed to: ${showColumnDeleteConfirm}`);
    } else {
      // console.log(`📋 showColumnDeleteConfirm cleared`);
    }
  }, [showColumnDeleteConfirm]);

  // Sync selectedMembers when members list changes (e.g., user deletion)
  useEffect(() => {
    if (members.length > 0) {
      const currentMemberIds = new Set(members.map(m => m.id));
      const validSelectedMembers = selectedMembers.filter(id => currentMemberIds.has(id));
      
      // Only sync if there's a difference (remove deleted members)
      if (validSelectedMembers.length !== selectedMembers.length) {
        // console.log(`🔄 Syncing selected members: ${selectedMembers.length} → ${validSelectedMembers.length}`);
        setSelectedMembers(validSelectedMembers);
        updateCurrentUserPreference('selectedMembers', validSelectedMembers);
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
    authChecked,
    currentUser,
    siteSettings,
    hasDefaultAdmin,
    hasDemoUser,
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
    setSelectedMembers([]);
    },
    onAdminRefresh: () => {
      setAdminRefreshKey(prev => prev + 1);
    },
    onPageChange: setCurrentPage,
    onMembersRefresh: async () => {
      const loadedMembers = await getMembers(includeSystem);
      setMembers(loadedMembers);
    },
  });
  const { loading, withLoading } = useLoadingState();

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
  useKeyboardShortcuts(() => setShowHelpModal(true));
  
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

  // Load user settings for activity feed
  useEffect(() => {
    const loadUserSettings = async () => {
      if (isAuthenticated && currentUser?.id) {
        try {
          const settings = await getUserSettings();
          // Use system default if user hasn't set a preference
          const defaultFromSystem = systemSettings.SHOW_ACTIVITY_FEED !== 'false'; // Default to true unless system says false
          setShowActivityFeed(settings.showActivityFeed !== undefined ? settings.showActivityFeed : defaultFromSystem);
          setActivityFeedMinimized(settings.activityFeedMinimized || false); // Default to expanded
          setLastSeenActivityId(settings.lastSeenActivityId || 0); // Default to 0 (show all as unread)
          setClearActivityId(settings.clearActivityId || 0); // Default to 0 (show all)
          
          // Load saved position or use default
          if (settings.activityFeedPosition) {
            try {
              // console.log('Loading saved activity feed position:', settings.activityFeedPosition);
              const savedPosition = JSON.parse(settings.activityFeedPosition);
              // console.log('Parsed position:', savedPosition);
              setActivityFeedPosition(savedPosition);
            } catch (error) {
              // console.warn('Failed to parse saved activity feed position:', error);
            }
          } else {
            // console.log('No saved activity feed position found, using default');
          }

          // Load saved dimensions or use default
          if (settings.activityFeedWidth || settings.activityFeedHeight) {
            const savedDimensions = {
              width: settings.activityFeedWidth || 208,
              height: settings.activityFeedHeight || (typeof window !== 'undefined' ? window.innerHeight - 200 : 400)
            };
            // console.log('Loading saved activity feed dimensions:', savedDimensions);
            setActivityFeedDimensions(savedDimensions);
          } else {
            // console.log('No saved activity feed dimensions found, using default');
          }
        } catch (error) {
          // console.error('Failed to load user settings:', error);
        }
      }
    };
    
    loadUserSettings();
  }, [isAuthenticated, currentUser?.id, systemSettings]);

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

  // Load auto-refresh setting and sprint selection from user preferences
  useEffect(() => {
    if (currentUser) {
      const restorePreferences = async () => {
        try {
          // Load preferences from database (not just cookies)
          const prefs = await loadUserPreferencesAsync(currentUser.id);
          
          // setIsAutoRefreshEnabled(prefs.appSettings.autoRefreshEnabled ?? true); // Disabled - using real-time updates
          
          // Restore sprint selection and apply date filters
          const savedSprintId = prefs.selectedSprintId;
          
          if (savedSprintId) {
            // Fetch sprint details to get date ranges
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/admin/sprints', {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const sprints = data.sprints || data || [];
              const selectedSprint = sprints.find((s: any) => s.id === savedSprintId);
              
              if (selectedSprint) {
                // Update sprint ID
                setSelectedSprintId(savedSprintId);
                
                // Reapply the date filters for this sprint
                setSearchFilters(prev => ({
                  ...prev,
                  dateFrom: selectedSprint.start_date,
                  dateTo: selectedSprint.end_date
                }));
                
                // Ensure search is active
                if (!prefs.isSearchActive) {
                  setIsSearchActive(true);
                }
              } else {
                // Sprint no longer exists, clear the selection
                setSelectedSprintId(null);
                updateCurrentUserPreference('selectedSprintId', null);
              }
            }
          } else {
            // No saved sprint, make sure state is cleared
            setSelectedSprintId(null);
          }
        } catch (error) {
          console.error('Failed to restore sprint selection:', error);
        }
      };
      
      restorePreferences();
    }
  }, [currentUser]);

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

  // Activity feed toggle handler
  const handleActivityFeedToggle = (enabled: boolean) => {
    setShowActivityFeed(enabled);
  };

  // Activity feed minimized state handler
  const handleActivityFeedMinimizedChange = (minimized: boolean) => {
    setActivityFeedMinimized(minimized);
  };


  // Activity feed mark as read handler
  const handleActivityFeedMarkAsRead = async (activityId: number) => {
    try {
      await updateActivityFeedPreference('lastSeenActivityId', activityId, currentUser?.id || null);
      setLastSeenActivityId(activityId);
    } catch (error) {
      // console.error('Failed to mark activities as read:', error);
    }
  };

  // Activity feed clear all handler
  const handleActivityFeedClearAll = async (activityId: number) => {
    try {
      // Set both clear point and read point to the same value
      // This ensures new activities after clear will show as unread
      await updateActivityFeedPreference('clearActivityId', activityId, currentUser?.id || null);
      await updateActivityFeedPreference('lastSeenActivityId', activityId, currentUser?.id || null);
      setClearActivityId(activityId);
      setLastSeenActivityId(activityId);
    } catch (error) {
      // console.error('Failed to clear activities:', error);
    }
  };
  
  // Stable callback functions to prevent infinite useEffect loops in useDataPolling
  const handleMembersUpdate = useCallback((newMembers: TeamMember[]) => {
    if (!isProfileBeingEdited) {
      setMembers(newMembers);
    }
  }, [isProfileBeingEdited]);

  const handleActivitiesUpdate = useCallback((newActivities: any[]) => {
    setActivities(newActivities);
  }, []);

  const handleSharedFilterViewsUpdate = useCallback((newFilters: SavedFilterView[]) => {
    setSharedFilterViews(prev => {
      // Merge new filters with existing ones, avoiding duplicates
      const existingIds = new Set(prev.map(f => f.id));
      const newFiltersToAdd = newFilters.filter(f => !existingIds.has(f.id));
      return [...prev, ...newFiltersToAdd];
    });
  }, []);

  const handleRelationshipsUpdate = useCallback((newRelationships: any[]) => {
    // console.log('🔗 [App] handleRelationshipsUpdate called with:', newRelationships.length, 'relationships');
    setBoardRelationships(newRelationships);
    setTaskRelationships({}); // Clear Kanban hover cache to force fresh data
  }, []);

  // Load relationships initially when board is selected (regardless of auto-refresh status)
  useEffect(() => {
    if (selectedBoard && currentPage === 'kanban') {
      // console.log('🔗 [App] Loading initial relationships for board:', selectedBoard);
      getBoardTaskRelationships(selectedBoard)
        .then(relationships => {
          // console.log('🔗 [App] Initial relationships loaded:', relationships.length);
          handleRelationshipsUpdate(relationships);
        })
        .catch(error => {
          // console.error('🔗 [App] Failed to load initial relationships:', error);
        });
    }
  }, [selectedBoard, currentPage]);

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
    currentActivities: activities,
    currentSharedFilters: sharedFilterViews,
    currentRelationships: boardRelationships,
    includeSystem,
    onBoardsUpdate: setBoards,
    onMembersUpdate: handleMembersUpdate,
    onColumnsUpdate: setColumns,
    onSiteSettingsUpdate: setSiteSettings,
    onPrioritiesUpdate: setAvailablePriorities,
    onActivitiesUpdate: handleActivitiesUpdate,
    onSharedFiltersUpdate: setSharedFilterViews,
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
          setInstanceStatus({
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
  
  // Memoize WebSocket event handlers to prevent duplicate registrations
  const handleWebSocketReady = useCallback(() => {
    // Listen for WebSocket ready event (simplified since we now use joinBoardWhenReady)
  }, []);

  const handleReconnect = useCallback(() => {
    const timestamp = new Date().toISOString();
    console.log(`✅ [${timestamp}] Socket connected, hasConnectedOnce:`, hasConnectedOnceRef.current, 'wasOffline:', wasOfflineRef.current);
    
    // CRITICAL: Always re-join the board room after reconnection
    // The useEffect for selectedBoard only fires when the board CHANGES, not on reconnection
    if (selectedBoardRef.current) {
      console.log(`📋 [${timestamp}] Re-joining board room after reconnection:`, selectedBoardRef.current);
      websocketClient.joinBoardWhenReady(selectedBoardRef.current);
    }
    
    // Only refresh if this is a RECONNECTION (not the first connection)
    if (hasConnectedOnceRef.current && wasOfflineRef.current) {
      // Wait longer for network to stabilize (both WebSocket AND HTTP)
      // Also add retry logic in case first attempt fails
      const attemptRefresh = async (retryCount = 0) => {
        try {
          const refreshTimestamp = new Date().toISOString();
          console.log(`🔄 [${refreshTimestamp}] WebSocket reconnected after being offline - refreshing data to sync changes (attempt`, retryCount + 1, ')');
          console.log(`📊 [${refreshTimestamp}] Current selectedBoard:`, selectedBoardRef.current);
          if (refreshBoardDataRef.current) {
            await refreshBoardDataRef.current();
            
            // ALSO refresh activities to ensure activity feed is up-to-date
            // This catches any activity events that were missed during disconnection
            const loadedActivities = await getActivityFeed(100);
            setActivities(loadedActivities || []);
            
            const successTimestamp = new Date().toISOString();
            console.log(`✅ [${successTimestamp}] Data refresh successful!`);
          } else {
            throw new Error('refreshBoardData not yet initialized');
          }
          
          // IMPORTANT: Don't reset wasOfflineRef immediately!
          // Keep it true for 3 seconds to ensure connection is stable
          // This prevents missing WebSocket events during reconnection flapping
          setTimeout(() => {
            wasOfflineRef.current = false;
            const stabilizedTimestamp = new Date().toISOString();
            console.log(`🔌 [${stabilizedTimestamp}] Connection stabilized, ready for real-time updates`);
          }, 3000);
        } catch (err) {
          console.error('❌ Failed to refresh on reconnect (attempt', retryCount + 1, '):', err);
          // Retry up to 3 times with exponential backoff
          if (retryCount < 3) {
            const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
            console.log('⏳ Retrying in', delay / 1000, 'seconds...');
            setTimeout(() => attemptRefresh(retryCount + 1), delay);
          } else {
            console.error('❌ All refresh attempts failed. Please refresh the page manually.');
            wasOfflineRef.current = false; // Reset flag to avoid infinite retries
          }
        }
      };
      
      // Wait 1.5 seconds for both WebSocket and HTTP to stabilize
      setTimeout(() => attemptRefresh(), 1500);
    } else if (hasConnectedOnceRef.current) {
      const reconnectTimestamp = new Date().toISOString();
      console.log(`🔌 [${reconnectTimestamp}] Socket reconnected (but no offline period detected)`);
    } else {
      // Mark that we've connected for the first time
      const firstConnectTimestamp = new Date().toISOString();
      console.log(`🎉 [${firstConnectTimestamp}] First WebSocket connection established`);
      hasConnectedOnceRef.current = true;
    }
  }, [setActivities]); // setActivities is stable from useState

  const handleDisconnect = useCallback(() => {
    const disconnectTimestamp = new Date().toISOString();
    console.log(`🔴 [${disconnectTimestamp}] WebSocket disconnected - will refresh data on reconnect`);
    wasOfflineRef.current = true;
  }, []);

  const handleBrowserOnline = useCallback(() => {
    console.log('🌐 Browser detected network is back online - forcing reconnect');
    setIsOnline(true);
    wasOfflineRef.current = true; // Mark as offline so we refresh on reconnect
    websocketClient.connect(); // Force reconnection attempt
  }, [setIsOnline]);

  const handleBrowserOffline = useCallback(() => {
    console.log('🌐 Browser detected network went offline');
    setIsOnline(false);
    wasOfflineRef.current = true;
  }, [setIsOnline]);

  // ============================================================================
  // WEBSOCKET EVENT HANDLERS - Memoized to prevent duplicate registrations
  // ============================================================================
  // All handlers use functional setState or refs, so they have minimal dependencies
  
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
      if (pendingTaskRefreshesRef.current.has(data.task.id)) {
        console.log(`📨 [${timestamp}] [WebSocket] Cancelling fallback for task creator`);
        pendingTaskRefreshesRef.current.delete(data.task.id);
      }
      
      // Always update boards state for task count updates (for all boards)
      setBoards(prevBoards => {
        return prevBoards.map(board => {
          if (board.id === data.boardId) {
            const updatedBoard = { ...board };
            const updatedColumns = { ...updatedBoard.columns };
            const targetColumnId = data.task.columnId;
            
            if (updatedColumns[targetColumnId]) {
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
            }
            
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
              const updatedTasks = existingTasks.map(t => 
                t.id === data.task.id ? data.task : t
              );
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
  }, [setBoards, setColumns]); // setState functions are stable

  const handleTaskUpdated = useCallback((data: any) => {
      // Get current selectedBoard value from ref to avoid stale closure
      const currentSelectedBoard = selectedBoardRef.current;
      // Check if we should process this update
      const shouldProcess = currentSelectedBoard && data.boardId === currentSelectedBoard && data.task;
      
      // ALWAYS update boards state for system task counter (even if not currently selected board)
      if (data.task && data.boardId) {
        setBoards(prevBoards => {
          return prevBoards.map(board => {
            if (board.id === data.boardId && board.columns) {
              // Update the task in the appropriate column
              const updatedColumns = { ...board.columns };
              const taskId = data.task.id;
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
                    updatedColumns[columnId] = {
                      ...column,
                      tasks: [
                        ...column.tasks.slice(0, taskIndex),
                        data.task,
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
              if (found && updatedColumns[newColumnId] && !updatedColumns[newColumnId].tasks?.some((t: any) => t.id === taskId)) {
                const targetColumn = updatedColumns[newColumnId];
                const targetPosition = data.task.position ?? (targetColumn.tasks?.length || 0);
                const newTasks = [...(targetColumn.tasks || [])];
                
                // Insert at the specified position
                newTasks.splice(targetPosition, 0, data.task);
                
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
        if (viewModeRef.current === 'gantt') {
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
            const column = updatedColumns[newColumnId];
            const taskIndex = column.tasks.findIndex(t => t.id === taskId);
            if (taskIndex !== -1) {
              updatedColumns[newColumnId] = {
                ...column,
                tasks: [
                  ...column.tasks.slice(0, taskIndex),
                  data.task,
                  ...column.tasks.slice(taskIndex + 1)
                ]
              };
            }
          } else {
            // Different column - remove from old column and add to new column
            
            // Remove from current column
            if (currentColumnId) {
              const currentColumn = updatedColumns[currentColumnId];
              const taskIndex = currentColumn.tasks.findIndex(t => t.id === taskId);
              if (taskIndex !== -1) {
                updatedColumns[currentColumnId] = {
                  ...currentColumn,
                  tasks: [
                    ...currentColumn.tasks.slice(0, taskIndex),
                    ...currentColumn.tasks.slice(taskIndex + 1)
                  ]
                };
              }
            }
            
            // Add to new column at the correct position
            if (updatedColumns[newColumnId]) {
              const targetColumn = updatedColumns[newColumnId];
              const targetPosition = data.task.position ?? targetColumn.tasks.length;
              const newTasks = [...targetColumn.tasks];
              
              // Insert at the specified position
              newTasks.splice(targetPosition, 0, data.task);
              
              updatedColumns[newColumnId] = {
                ...targetColumn,
                tasks: newTasks
              };
            } else {
            }
          }
          
          
          return updatedColumns;
        });
        
        // Also update filteredColumns to maintain consistency, but respect filters
        setFilteredColumns(prevFilteredColumns => {
          const updatedFilteredColumns = { ...prevFilteredColumns };
          const taskId = data.task.id;
          const newColumnId = data.task.columnId;
          
          // Check if updated task should be visible based on filters (use ref to avoid stale closure)
          const taskShouldBeVisible = shouldIncludeTaskRef.current(data.task);
          
          // Find which column currently contains this task in filteredColumns
          let currentColumnId = null;
          Object.keys(updatedFilteredColumns).forEach(columnId => {
            const column = updatedFilteredColumns[columnId];
            const taskIndex = column.tasks.findIndex(t => t.id === taskId);
            if (taskIndex !== -1) {
              currentColumnId = columnId;
            }
          });
          
          // Remove from current column in filteredColumns if it exists
          if (currentColumnId) {
            const currentColumn = updatedFilteredColumns[currentColumnId];
            const taskIndex = currentColumn.tasks.findIndex(t => t.id === taskId);
            if (taskIndex !== -1) {
              updatedFilteredColumns[currentColumnId] = {
                ...currentColumn,
                tasks: [
                  ...currentColumn.tasks.slice(0, taskIndex),
                  ...currentColumn.tasks.slice(taskIndex + 1)
                ]
              };
            }
          }
          
          // Only add task if it should be visible based on filters
          if (taskShouldBeVisible) {
            if (currentColumnId === newColumnId && currentColumnId !== null) {
              // Same column - insert at the same position or at end
              const column = updatedFilteredColumns[newColumnId];
              const taskIndex = column.tasks.findIndex(t => t.id === taskId);
              if (taskIndex !== -1) {
                // Task was already removed above, add it back at the same position
                updatedFilteredColumns[newColumnId] = {
                  ...column,
                  tasks: [
                    ...column.tasks.slice(0, taskIndex),
                    data.task,
                    ...column.tasks.slice(taskIndex)
                  ]
                };
              } else {
                // Task not found, insert at correct position
                const targetPosition = data.task.position ?? column.tasks.length;
                const newTasks = [...column.tasks];
                newTasks.splice(targetPosition, 0, data.task);
                
                updatedFilteredColumns[newColumnId] = {
                  ...column,
                  tasks: newTasks
                };
              }
            } else {
              // Different column or new task - add to new column at correct position
              if (updatedFilteredColumns[newColumnId]) {
                const targetColumn = updatedFilteredColumns[newColumnId];
                const targetPosition = data.task.position ?? targetColumn.tasks.length;
                const newTasks = [...targetColumn.tasks];
                newTasks.splice(targetPosition, 0, data.task);
                
                updatedFilteredColumns[newColumnId] = {
                  ...targetColumn,
                  tasks: newTasks
                };
              }
            }
          }
          // If task shouldn't be visible, it's already been removed above, so nothing more to do
          
          return updatedFilteredColumns;
        });
        
        // Also update the boards state to keep tab counters in sync
        setBoards(prevBoards => {
          const updatedBoards = [...prevBoards];
          const boardIndex = updatedBoards.findIndex(b => b.id === data.boardId);
          
          if (boardIndex !== -1) {
            const updatedBoard = { ...updatedBoards[boardIndex] };
            const taskId = data.task.id;
            const newColumnId = data.task.columnId;
            
            // Find which column currently contains this task
            let currentColumnId = null;
            Object.keys(updatedBoard.columns || {}).forEach(columnId => {
              const column = updatedBoard.columns[columnId];
              const taskIndex = column.tasks.findIndex(t => t.id === taskId);
              if (taskIndex !== -1) {
                currentColumnId = columnId;
              }
            });
            
            if (currentColumnId === newColumnId) {
              // Same column - update task in place (for reordering)
              const column = updatedBoard.columns[newColumnId];
              const taskIndex = column.tasks.findIndex(t => t.id === taskId);
              if (taskIndex !== -1) {
                updatedBoard.columns[newColumnId] = {
                  ...column,
                  tasks: [
                    ...column.tasks.slice(0, taskIndex),
                    data.task,
                    ...column.tasks.slice(taskIndex + 1)
                  ]
                };
              }
            } else {
              // Different column - remove from old column and add to new column
              
              // Remove from current column
              if (currentColumnId) {
                const currentColumn = updatedBoard.columns[currentColumnId];
                const taskIndex = currentColumn.tasks.findIndex(t => t.id === taskId);
                if (taskIndex !== -1) {
                  updatedBoard.columns[currentColumnId] = {
                    ...currentColumn,
                    tasks: [
                      ...currentColumn.tasks.slice(0, taskIndex),
                      ...currentColumn.tasks.slice(taskIndex + 1)
                    ]
                  };
                }
              }
              
              // Add to new column
              if (updatedBoard.columns[newColumnId]) {
                updatedBoard.columns[newColumnId] = {
                  ...updatedBoard.columns[newColumnId],
                  tasks: [...updatedBoard.columns[newColumnId].tasks, data.task]
                };
              }
            }
            
            updatedBoards[boardIndex] = updatedBoard;
          }
          
          return updatedBoards;
        });
      } else {
      }
  }, [setBoards, setColumns]); // setState functions are stable

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
        setFilteredColumns(prevFilteredColumns => {
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
  }, [setBoards, setColumns]); // setState functions are stable

  const handleTaskRelationshipCreated = useCallback((data: any) => {
      // Only refresh if the relationship is for the current board
      if (data.boardId === selectedBoardRef.current) {
        // Load just the relationships instead of full refresh
        getBoardTaskRelationships(selectedBoardRef.current)
          .then(relationships => {
            setBoardRelationships(relationships);
          })
          .catch(error => {
            console.warn('Failed to load relationships:', error);
            // Fallback to full refresh on error
            if (refreshBoardDataRef.current) {
              refreshBoardDataRef.current();
            }
          });
      }
  }, [setBoardRelationships]);

  const handleTaskRelationshipDeleted = useCallback((data: any) => {
      // Only refresh if the relationship is for the current board
      if (data.boardId === selectedBoardRef.current) {
        // Load just the relationships instead of full refresh
        getBoardTaskRelationships(selectedBoardRef.current)
          .then(relationships => {
            setBoardRelationships(relationships);
          })
          .catch(error => {
            console.warn('Failed to load relationships:', error);
            // Fallback to full refresh on error
            if (refreshBoardDataRef.current) {
              refreshBoardDataRef.current();
            }
          });
      }
  }, [setBoardRelationships]);

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
  }, [setBoards, setColumns]);

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
  }, [setBoards, setColumns]);

  const handleColumnReordered = useCallback((data: any) => {
      if (!data.boardId || !data.columns) return;
      
      // Skip if this update came from the current user's GanttViewV2 (it handles its own updates via onRefreshData)
      // But allow updates from other users
      if (window.justUpdatedFromWebSocket && data.updatedBy === currentUser?.id) {
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
  }, [setBoards, setColumns, currentUser?.id]);

  const handleBoardCreated = useCallback((data: any) => {
      // Refresh boards list to show new board
      if (refreshBoardDataRef.current) {
        refreshBoardDataRef.current();
      }
  }, []);

  const handleBoardUpdated = useCallback((data: any) => {
      console.log('🔄 Refreshing board data due to board update...');
      // Refresh boards list
      if (refreshBoardDataRef.current) {
        refreshBoardDataRef.current();
      }
  }, []);

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
  }, [setSelectedBoard, setColumns]);

  const handleBoardReordered = useCallback((data: any) => {
      // Refresh boards list to show new order
      if (refreshBoardDataRef.current) {
        refreshBoardDataRef.current();
      }
  }, []);

  const handleTaskWatcherAdded = useCallback((data: any) => {
      // Only refresh if the task is for the current board
      if (data.boardId === selectedBoardRef.current) {
        // For watchers/collaborators, we need to refresh the specific task
        // This is more efficient than refreshing the entire board
        if (refreshBoardDataRef.current) {
          refreshBoardDataRef.current();
        }
      }
  }, []);

  const handleTaskWatcherRemoved = useCallback((data: any) => {
      // Only refresh if the task is for the current board
      if (data.boardId === selectedBoardRef.current) {
        // For watchers/collaborators, we need to refresh the specific task
        // This is more efficient than refreshing the entire board
        if (refreshBoardDataRef.current) {
          refreshBoardDataRef.current();
        }
      }
  }, []);

  const handleTaskCollaboratorAdded = useCallback((data: any) => {
      // Only refresh if the task is for the current board
      if (data.boardId === selectedBoardRef.current) {
        // For watchers/collaborators, we need to refresh the specific task
        // This is more efficient than refreshing the entire board
        if (refreshBoardDataRef.current) {
          refreshBoardDataRef.current();
        }
      }
  }, []);

  const handleTaskCollaboratorRemoved = useCallback((data: any) => {
      // Only refresh if the task is for the current board
      if (data.boardId === selectedBoardRef.current) {
        // For watchers/collaborators, we need to refresh the specific task
        // This is more efficient than refreshing the entire board
        if (refreshBoardDataRef.current) {
          refreshBoardDataRef.current();
        }
      }
  }, []);

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
  }, [setBoards, setColumns]);

  const handleMemberUpdated = useCallback(async (data: any) => {
      // Update the specific member in the members list
      if (data.member) {
        setMembers(prevMembers => {
          // Check if member exists in current list
          const memberExists = prevMembers.some(member => member.id === data.member.id);
          
          if (memberExists) {
            // Update existing member
            return prevMembers.map(member => 
              member.id === data.member.id ? { ...member, ...data.member } : member
            );
          } else {
            // Member doesn't exist, add it to the list
            console.log('📨 Adding new member to list:', data.member);
            return [...prevMembers, data.member];
          }
        });
      } else {
        // Fallback: refresh entire members list
        try {
          const loadedMembers = await getMembers(includeSystem);
          setMembers(loadedMembers);
        } catch (error) {
          console.error('Failed to refresh members after update:', error);
        }
      }
  }, [setMembers, includeSystem]);

  const handleActivityUpdated = useCallback((data: any) => {
      // Refresh activity feed
      handleActivitiesUpdate(data.activities || []);
  }, [handleActivitiesUpdate]);

  const handleMemberCreated = useCallback((data: any) => {
      // Refresh members list
      handleMembersUpdate([data.member]);
  }, [handleMembersUpdate]);

  const handleMemberDeleted = useCallback(async (data: any) => {
      // Refresh members list from server (don't pass empty array!)
      try {
        const loadedMembers = await getMembers(includeSystem);
        setMembers(loadedMembers);
      } catch (error) {
        console.error('Failed to refresh members after deletion:', error);
      }
  }, [includeSystem, setMembers]);

  const handleUserProfileUpdated = useCallback(async (data: any) => {
      // If this is the current user's profile update, refresh currentUser
      if (data.userId === currentUser?.id) {
        try {
          const response = await getCurrentUser();
          setCurrentUser(response.user);
        } catch (error) {
          console.error('Failed to refresh current user after profile update:', error);
        }
      }
      
      // Refresh members list to update display name and avatar
      try {
        const loadedMembers = await getMembers(includeSystem);
        setMembers(loadedMembers);
      } catch (error) {
        console.error('Failed to refresh members after profile update:', error);
      }
  }, [currentUser?.id, includeSystem, setCurrentUser, setMembers]);

  const handleFilterCreated = useCallback((data: any) => {
      // Refresh shared filters list
      if (data.filter && data.filter.shared) {
        handleSharedFilterViewsUpdate([data.filter]);
      }
  }, [handleSharedFilterViewsUpdate]);

  const handleFilterUpdated = useCallback((data: any) => {
      // Handle filter sharing/unsharing
      if (data.filter) {
        if (data.filter.shared) {
          // Filter was shared or updated - add/update it
          handleSharedFilterViewsUpdate([data.filter]);
        } else {
          // Filter was unshared - remove it from the list
          setSharedFilterViews(prev => prev.filter(f => f.id !== data.filter.id));
        }
      }
  }, [handleSharedFilterViewsUpdate, setSharedFilterViews]);

  const handleFilterDeleted = useCallback((data: any) => {
      console.log('📨 Filter deleted via WebSocket:', data);
      // Remove from shared filters list
      if (data.filterId) {
        const filterIdToDelete = parseInt(data.filterId, 10);
        setSharedFilterViews(prev => prev.filter(f => f.id !== filterIdToDelete));
      }
  }, [setSharedFilterViews]);

  // Tag management event handlers
  const handleTagCreated = useCallback(async (data: any) => {
      console.log('📨 Tag created via WebSocket:', data);
      try {
        const tags = await getTags();
        setAvailableTags(tags);
        console.log('📨 Tags refreshed after creation');
      } catch (error) {
        console.error('Failed to refresh tags after creation:', error);
      }
  }, [setAvailableTags]);

  const handleTagUpdated = useCallback(async (data: any) => {
      console.log('📨 Tag updated via WebSocket:', data);
      try {
        const tags = await getTags();
        setAvailableTags(tags);
        console.log('📨 Tags refreshed after update');
      } catch (error) {
        console.error('Failed to refresh tags after update:', error);
      }
  }, [setAvailableTags]);

  const handleTagDeleted = useCallback(async (data: any) => {
      console.log('📨 Tag deleted via WebSocket:', data);
      try {
        const tags = await getTags();
        setAvailableTags(tags);
        console.log('📨 Tags refreshed after deletion');
      } catch (error) {
        console.error('Failed to refresh tags after deletion:', error);
      }
  }, [setAvailableTags]);

  // Priority management event handlers
  const handlePriorityCreated = useCallback(async (data: any) => {
      console.log('📨 Priority created via WebSocket:', data);
      try {
        const priorities = await getPriorities();
        setAvailablePriorities(priorities);
        console.log('📨 Priorities refreshed after creation');
      } catch (error) {
        console.error('Failed to refresh priorities after creation:', error);
      }
  }, [setAvailablePriorities]);

  const handlePriorityUpdated = useCallback(async (data: any) => {
      console.log('📨 Priority updated via WebSocket:', data);
      try {
        const priorities = await getPriorities();
        setAvailablePriorities(priorities);
        console.log('📨 Priorities refreshed after update');
      } catch (error) {
        console.error('Failed to refresh priorities after update:', error);
      }
  }, [setAvailablePriorities]);

  const handlePriorityDeleted = useCallback(async (data: any) => {
      console.log('📨 Priority deleted via WebSocket:', data);
      try {
        const priorities = await getPriorities();
        setAvailablePriorities(priorities);
        console.log('📨 Priorities refreshed after deletion');
      } catch (error) {
        console.error('Failed to refresh priorities after deletion:', error);
      }
  }, [setAvailablePriorities]);

  const handlePriorityReordered = useCallback(async (data: any) => {
      console.log('📨 Priority reordered via WebSocket:', data);
      try {
        const priorities = await getPriorities();
        setAvailablePriorities(priorities);
        console.log('📨 Priorities refreshed after reorder');
      } catch (error) {
        console.error('Failed to refresh priorities after reorder:', error);
      }
  }, [setAvailablePriorities]);

  // Settings update event handler
  const handleSettingsUpdated = useCallback(async (data: any) => {
      try {
        // Update the specific setting directly from WebSocket data instead of fetching all settings
        if (data.key && data.value !== undefined) {
          setSiteSettings(prev => ({
            ...prev,
            [data.key]: data.value
          }));
        } else {
          // Fallback to fetching all settings if WebSocket data is incomplete
          const settings = await getSettings();
          setSiteSettings(settings);
          console.log('📨 Settings refreshed after update');
        }
      } catch (error) {
        console.error('Failed to refresh settings after update:', error);
      }
  }, [setSiteSettings]);

  // Task tag event handlers
  const handleTaskTagAdded = useCallback((data: any) => {
      console.log('📨 Task tag added via WebSocket:', data);
      // Only refresh if the task is for the current board
      if (data.boardId === selectedBoardRef.current) {
        if (refreshBoardDataRef.current) {
          refreshBoardDataRef.current();
        }
      }
  }, []);

  const handleTaskTagRemoved = useCallback((data: any) => {
      console.log('📨 Task tag removed via WebSocket:', data);
      // Only refresh if the task is for the current board
      if (data.boardId === selectedBoardRef.current) {
        if (refreshBoardDataRef.current) {
          refreshBoardDataRef.current();
        }
      }
  }, []);

  const getStatusMessage = (status: string) => {
      switch (status) {
        case 'active':
          return 'This instance is running normally.';
        case 'suspended':
          return 'This instance has been temporarily suspended. Please contact support for assistance.';
        case 'terminated':
          return 'This instance has been terminated. Please contact support for assistance.';
        case 'failed':
          return 'This instance has failed. Please contact support for assistance.';
        case 'deploying':
          return 'This instance is currently being deployed. Please try again in a few minutes.';
        default:
          return 'This instance is currently unavailable. Please contact support.';
      }
  };

  const handleInstanceStatusUpdated = useCallback((data: any) => {
      console.log('📨 Instance status updated via WebSocket:', data);
      setInstanceStatus({
        status: data.status,
        message: getStatusMessage(data.status),
        isDismissed: false
      });
  }, [setInstanceStatus]);

  // Version update handler
  const handleVersionUpdated = useCallback((data: any) => {
      console.log('📦 Version updated via WebSocket:', data);
      if (data.version) {
        versionDetection.checkVersion(data.version);
      }
  }, []);

  // Comment event handlers
  const handleCommentCreated = useCallback((data: any) => {
      if (!data.comment || !data.boardId || !data.taskId) return;
      
      // Find the task in the current board and add the comment
      setColumns(prevColumns => {
        const updatedColumns = { ...prevColumns };
        
        // Find the task across all columns
        Object.keys(updatedColumns).forEach(columnId => {
          const column = updatedColumns[columnId];
          const taskIndex = column.tasks.findIndex(t => t.id === data.taskId);
          
          if (taskIndex !== -1) {
            const updatedTasks = [...column.tasks];
            const task = { ...updatedTasks[taskIndex] };
            
            // Add the new comment if it doesn't already exist
            const comments = task.comments || [];
            if (!comments.find(c => c.id === data.comment.id)) {
              task.comments = [...comments, data.comment];
              updatedTasks[taskIndex] = task;
              updatedColumns[columnId] = {
                ...column,
                tasks: updatedTasks
              };
            }
          }
        });
        
        return updatedColumns;
      });
  }, [setColumns]);

  const handleCommentUpdated = useCallback((data: any) => {
      if (!data.comment || !data.boardId || !data.taskId) return;
      
      // Find the task and update the comment
      setColumns(prevColumns => {
        const updatedColumns = { ...prevColumns };
        
        Object.keys(updatedColumns).forEach(columnId => {
          const column = updatedColumns[columnId];
          const taskIndex = column.tasks.findIndex(t => t.id === data.taskId);
          
          if (taskIndex !== -1) {
            const updatedTasks = [...column.tasks];
            const task = { ...updatedTasks[taskIndex] };
            
            // Update the comment
            const comments = task.comments || [];
            const commentIndex = comments.findIndex(c => c.id === data.comment.id);
            
            if (commentIndex !== -1) {
              task.comments = [
                ...comments.slice(0, commentIndex),
                data.comment,
                ...comments.slice(commentIndex + 1)
              ];
              updatedTasks[taskIndex] = task;
              updatedColumns[columnId] = {
                ...column,
                tasks: updatedTasks
              };
            }
          }
        });
        
        return updatedColumns;
      });
  }, [setColumns]);

  const handleCommentDeleted = useCallback((data: any) => {
      if (!data.commentId || !data.boardId || !data.taskId) return;
      
      // Find the task and remove the comment
      setColumns(prevColumns => {
        const updatedColumns = { ...prevColumns };
        
        Object.keys(updatedColumns).forEach(columnId => {
          const column = updatedColumns[columnId];
          const taskIndex = column.tasks.findIndex(t => t.id === data.taskId);
          
          if (taskIndex !== -1) {
            const updatedTasks = [...column.tasks];
            const task = { ...updatedTasks[taskIndex] };
            
            // Remove the comment
            const comments = task.comments || [];
            task.comments = comments.filter(c => c.id !== data.commentId);
            updatedTasks[taskIndex] = task;
            updatedColumns[columnId] = {
              ...column,
              tasks: updatedTasks
            };
          }
        });
        
        return updatedColumns;
      });
  }, [setColumns]);

  // ============================================================================
  // WEBSOCKET CONNECTION EFFECT
  // ============================================================================
  // Register all memoized handlers and connect
  
  useEffect(() => {
    if (!isAuthenticated || !localStorage.getItem('authToken')) {
      return;
    }

    // Register handlers BEFORE connecting
    websocketClient.onWebSocketReady(handleWebSocketReady);
    websocketClient.onConnect(handleReconnect);
    websocketClient.onDisconnect(handleDisconnect);

    // Listen to browser online/offline events
    window.addEventListener('online', handleBrowserOnline);
    window.addEventListener('offline', handleBrowserOffline);

    // Connect to WebSocket only when we have a valid token
    websocketClient.connect();
    
    // Register all event listeners
    websocketClient.onTaskCreated(handleTaskCreated);
    websocketClient.onTaskUpdated(handleTaskUpdated);
    websocketClient.onTaskDeleted(handleTaskDeleted);
    websocketClient.onTaskRelationshipCreated(handleTaskRelationshipCreated);
    websocketClient.onTaskRelationshipDeleted(handleTaskRelationshipDeleted);
    websocketClient.onColumnUpdated(handleColumnUpdated);
    websocketClient.onColumnDeleted(handleColumnDeleted);
    websocketClient.onColumnReordered(handleColumnReordered);
    websocketClient.onBoardCreated(handleBoardCreated);
    websocketClient.onBoardUpdated(handleBoardUpdated);
    websocketClient.onBoardDeleted(handleBoardDeleted);
    websocketClient.onBoardReordered(handleBoardReordered);
    websocketClient.onColumnCreated(handleColumnCreated);
    websocketClient.onTaskWatcherAdded(handleTaskWatcherAdded);
    websocketClient.onTaskWatcherRemoved(handleTaskWatcherRemoved);
    websocketClient.onTaskCollaboratorAdded(handleTaskCollaboratorAdded);
    websocketClient.onTaskCollaboratorRemoved(handleTaskCollaboratorRemoved);
    websocketClient.onMemberUpdated(handleMemberUpdated);
    websocketClient.onMemberCreated(handleMemberCreated);
    websocketClient.onMemberDeleted(handleMemberDeleted);
    websocketClient.onUserProfileUpdated(handleUserProfileUpdated);
    websocketClient.onActivityUpdated(handleActivityUpdated);
    websocketClient.onFilterCreated(handleFilterCreated);
    websocketClient.onFilterUpdated(handleFilterUpdated);
    websocketClient.onFilterDeleted(handleFilterDeleted);
    websocketClient.onTagCreated(handleTagCreated);
    websocketClient.onTagUpdated(handleTagUpdated);
    websocketClient.onTagDeleted(handleTagDeleted);
    websocketClient.onPriorityCreated(handlePriorityCreated);
    websocketClient.onPriorityUpdated(handlePriorityUpdated);
    websocketClient.onPriorityDeleted(handlePriorityDeleted);
    websocketClient.onPriorityReordered(handlePriorityReordered);
    websocketClient.onSettingsUpdated(handleSettingsUpdated);
    websocketClient.onTaskTagAdded(handleTaskTagAdded);
    websocketClient.onTaskTagRemoved(handleTaskTagRemoved);
    websocketClient.onInstanceStatusUpdated(handleInstanceStatusUpdated);
    websocketClient.onVersionUpdated(handleVersionUpdated);
    websocketClient.onCommentCreated(handleCommentCreated);
    websocketClient.onCommentUpdated(handleCommentUpdated);
    websocketClient.onCommentDeleted(handleCommentDeleted);

    return () => {
      // Clean up event listeners
      websocketClient.offTaskCreated(handleTaskCreated);
      websocketClient.offTaskUpdated(handleTaskUpdated);
      websocketClient.offTaskDeleted(handleTaskDeleted);
      websocketClient.offTaskRelationshipCreated(handleTaskRelationshipCreated);
      websocketClient.offTaskRelationshipDeleted(handleTaskRelationshipDeleted);
      websocketClient.offColumnUpdated(handleColumnUpdated);
      websocketClient.offColumnDeleted(handleColumnDeleted);
      websocketClient.offColumnReordered(handleColumnReordered);
      websocketClient.offBoardCreated(handleBoardCreated);
      websocketClient.offBoardUpdated(handleBoardUpdated);
      websocketClient.offBoardDeleted(handleBoardDeleted);
      websocketClient.offBoardReordered(handleBoardReordered);
      websocketClient.offColumnCreated(handleColumnCreated);
      websocketClient.offTaskWatcherAdded(handleTaskWatcherAdded);
      websocketClient.offTaskWatcherRemoved(handleTaskWatcherRemoved);
      websocketClient.offTaskCollaboratorAdded(handleTaskCollaboratorAdded);
      websocketClient.offTaskCollaboratorRemoved(handleTaskCollaboratorRemoved);
      websocketClient.offMemberUpdated(handleMemberUpdated);
      websocketClient.offMemberCreated(handleMemberCreated);
      websocketClient.offMemberDeleted(handleMemberDeleted);
      websocketClient.offUserProfileUpdated(handleUserProfileUpdated);
      websocketClient.offActivityUpdated(handleActivityUpdated);
      websocketClient.offFilterCreated(handleFilterCreated);
      websocketClient.offFilterUpdated(handleFilterUpdated);
      websocketClient.offFilterDeleted(handleFilterDeleted);
      websocketClient.offTagCreated(handleTagCreated);
      websocketClient.offTagUpdated(handleTagUpdated);
      websocketClient.offTagDeleted(handleTagDeleted);
      websocketClient.offPriorityCreated(handlePriorityCreated);
      websocketClient.offPriorityUpdated(handlePriorityUpdated);
      websocketClient.offPriorityDeleted(handlePriorityDeleted);
      websocketClient.offPriorityReordered(handlePriorityReordered);
      websocketClient.offSettingsUpdated(handleSettingsUpdated);
      websocketClient.offTaskTagAdded(handleTaskTagAdded);
      websocketClient.offTaskTagRemoved(handleTaskTagRemoved);
      websocketClient.offInstanceStatusUpdated(handleInstanceStatusUpdated);
      websocketClient.offVersionUpdated(handleVersionUpdated);
      websocketClient.offCommentCreated(handleCommentCreated);
      websocketClient.offCommentUpdated(handleCommentUpdated);
      websocketClient.offCommentDeleted(handleCommentDeleted);
      websocketClient.offWebSocketReady(handleWebSocketReady);
      websocketClient.offConnect(handleReconnect);
      websocketClient.offDisconnect(handleDisconnect);
      window.removeEventListener('online', handleBrowserOnline);
      window.removeEventListener('offline', handleBrowserOffline);
    };
  }, [
    isAuthenticated,
    // Connection handlers
    handleWebSocketReady, handleReconnect, handleDisconnect, handleBrowserOnline, handleBrowserOffline,
    // Task handlers
    handleTaskCreated, handleTaskUpdated, handleTaskDeleted, 
    handleTaskRelationshipCreated, handleTaskRelationshipDeleted,
    handleTaskWatcherAdded, handleTaskWatcherRemoved,
    handleTaskCollaboratorAdded, handleTaskCollaboratorRemoved,
    handleTaskTagAdded, handleTaskTagRemoved,
    // Column handlers
    handleColumnUpdated, handleColumnDeleted, handleColumnReordered, handleColumnCreated,
    // Board handlers
    handleBoardCreated, handleBoardUpdated, handleBoardDeleted, handleBoardReordered,
    // Member handlers
    handleMemberUpdated, handleMemberCreated, handleMemberDeleted, handleUserProfileUpdated,
    // Filter handlers
    handleFilterCreated, handleFilterUpdated, handleFilterDeleted,
    // Tag handlers
    handleTagCreated, handleTagUpdated, handleTagDeleted,
    // Priority handlers
    handlePriorityCreated, handlePriorityUpdated, handlePriorityDeleted, handlePriorityReordered,
    // Settings and status handlers
    handleSettingsUpdated, handleInstanceStatusUpdated, handleVersionUpdated, handleActivityUpdated,
    // Comment handlers
    handleCommentCreated, handleCommentUpdated, handleCommentDeleted
  ]); // All memoized handlers included to prevent duplicates

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
      setFilteredColumns({}); // Clear immediately to prevent stale pill counts
    }
  }, [selectedBoard]);

  // Invite user handler
  const handleInviteUser = async (email: string) => {
    try {
      // Check email server status first
      const emailStatusResponse = await fetch('/api/admin/email-status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      
      if (emailStatusResponse.ok) {
        const emailStatus = await emailStatusResponse.json();
        if (!emailStatus.available) {
          throw new Error(`Email server is not available: ${emailStatus.error}. Please configure email settings in the admin panel before inviting users.`);
        }
      } else {
        console.warn('Could not check email status, proceeding with invitation');
      }

      // Generate names from email (before @ symbol)
      const emailPrefix = email.split('@')[0];
      const nameParts = emailPrefix.split(/[._-]/);
      
      // Capitalize first letter of each part
      let firstName = nameParts[0] ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1) : 'User';
      let lastName = nameParts[1] ? nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1) : 'User';
      
      // Special handling for common email prefixes
      if (emailPrefix.toLowerCase() === 'info') {
        firstName = 'Info';
        lastName = 'User';
      } else if (emailPrefix.toLowerCase() === 'admin') {
        firstName = 'Admin';
        lastName = 'User';
      } else if (emailPrefix.toLowerCase() === 'support') {
        firstName = 'Support';
        lastName = 'User';
      } else if (emailPrefix.toLowerCase() === 'noreply') {
        firstName = 'System';
        lastName = 'User';
      } else if (nameParts.length === 1) {
        // If only one part, use it as first name and "User" as last name
        firstName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1);
        lastName = 'User';
      }
      
      // Generate a temporary password (user will change it during activation)
      const tempPassword = crypto.randomUUID().substring(0, 12);
      
      const result = await createUser({
        email,
        password: tempPassword,
        firstName,
        lastName,
        role: 'user'
      });
      
      // Check if email was actually sent
      if (result.emailSent === false) {
        throw new Error(`User created successfully, but invitation email could not be sent: ${result.emailError || 'Email service unavailable'}. The user will need to be manually activated.`);
      }
      
      // Refresh members list to show the new user
      await handleRefreshData();
    } catch (error: any) {
      console.error('Failed to invite user:', error);
      
      // Extract more specific error message
      let errorMessage = 'Failed to send invitation';
      
      if (error.response?.data?.error) {
        const backendError = error.response.data.error;
        if (backendError.includes('already exists')) {
          errorMessage = `User with email ${email} already exists`;
        } else if (backendError.includes('required')) {
          errorMessage = 'Missing required information. Please try again.';
        } else if (backendError.includes('email')) {
          errorMessage = 'Invalid email address format';
        } else {
          errorMessage = backendError;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      throw new Error(errorMessage);
    }
  };

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
    setIsLinkingMode(true);
    setLinkingSourceTask(task);
    setLinkingLine({
      startX: startPosition.x,
      startY: startPosition.y,
      endX: startPosition.x,
      endY: startPosition.y
    });
    // console.log('✅ Linking mode activated');
  };

  const handleUpdateLinkingLine = (endPosition: {x: number, y: number}) => {
    if (linkingLine) {
      setLinkingLine({
        ...linkingLine,
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
    
    if (linkingSourceTask && targetTask && linkingSourceTask.id !== targetTask.id) {
      try {
        // console.log('🚀 Making API call to create relationship...');
        const token = localStorage.getItem('authToken');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
        
        const response = await fetch(`/api/tasks/${linkingSourceTask.id}/relationships`, {
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
        setLinkingFeedbackMessage(`${linkingSourceTask.ticket} now ${relationshipType} of ${targetTask.ticket}`);
      } catch (error) {
        // console.error('❌ Error creating task relationship:', error);
        // Set specific error feedback message
        const errorMessage = error instanceof Error ? error.message : 'Failed to create task relationship';
        setLinkingFeedbackMessage(errorMessage);
      }
    } else {
      // console.log('⚠️ Relationship creation skipped:', {
      //   hasSource: !!linkingSourceTask,
      //   hasTarget: !!targetTask,
      //   sameTask: linkingSourceTask?.id === targetTask?.id
      // });
      
      // Set cancellation feedback message
      setLinkingFeedbackMessage('Task link cancelled');
    }
    
    // Reset linking state (but keep feedback message visible)
    // console.log('🔄 Resetting linking state...');
    setIsLinkingMode(false);
    setLinkingSourceTask(null);
    setLinkingLine(null);
    
    // Clear feedback message after 3 seconds
    setTimeout(() => {
      setLinkingFeedbackMessage(null);
    }, 3000);
  };

  const handleCancelLinking = () => {
    setIsLinkingMode(false);
    setLinkingSourceTask(null);
    setLinkingLine(null);
    setLinkingFeedbackMessage('Task link cancelled');
    
    // Clear feedback message after 3 seconds
    setTimeout(() => {
      setLinkingFeedbackMessage(null);
    }, 3000);
  };

  // Hover highlighting handlers
  // When user hovers over a link tool button, highlight all related tasks with color-coded borders:
  // - Green: Parent tasks (tasks that this one depends on)
  // - Purple: Child tasks (tasks that depend on this one)  
  // - Yellow: Related tasks (loosely connected tasks)
  const handleLinkToolHover = async (task: Task) => {
    setHoveredLinkTask(task);
    
    // Load relationships for this task if not already loaded
    if (!taskRelationships[task.id]) {
      try {
        const relationships = await api.get(`/tasks/${task.id}/relationships`);
        setTaskRelationships(prev => ({
          ...prev,
          [task.id]: relationships.data || []
        }));
      } catch (error) {
        // console.error('Failed to load task relationships for hover:', error);
      }
    }
  };

  const handleLinkToolHoverEnd = () => {
    setHoveredLinkTask(null);
  };

  // Helper function to check if a task is related to the hovered task
  const getTaskRelationshipType = (taskId: string): 'parent' | 'child' | 'related' | null => {
    if (!hoveredLinkTask || !taskRelationships[hoveredLinkTask.id]) return null;
    
    const relationships = taskRelationships[hoveredLinkTask.id];
    
    // Check if the task is a parent of the hovered task
    const parentRel = relationships.find(rel => 
      rel.relationship === 'child' && 
      rel.task_id === hoveredLinkTask.id && 
      rel.to_task_id === taskId
    );
    if (parentRel) return 'parent';
    
    // Check if the task is a child of the hovered task
    const childRel = relationships.find(rel => 
      rel.relationship === 'parent' && 
      rel.task_id === hoveredLinkTask.id && 
      rel.to_task_id === taskId
    );
    if (childRel) return 'child';
    
    // Check if the task has a 'related' relationship
    const relatedRel = relationships.find(rel => 
      rel.relationship === 'related' && 
      ((rel.task_id === hoveredLinkTask.id && rel.to_task_id === taskId) ||
       (rel.task_id === taskId && rel.to_task_id === hoveredLinkTask.id))
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

  // Load user-specific preferences when authenticated
  useEffect(() => {
    if (isAuthenticated && currentUser?.id) {
      const loadPreferences = async () => {
        // Load from both cookie and database (database takes precedence for stored values)
        const userSpecificPrefs = await loadUserPreferencesAsync(currentUser.id);
        
        // Update all preference-based state with user-specific values
        setSelectedMembers(userSpecificPrefs.selectedMembers);
        setIncludeAssignees(userSpecificPrefs.includeAssignees);
        setIncludeWatchers(userSpecificPrefs.includeWatchers);
        setIncludeCollaborators(userSpecificPrefs.includeCollaborators);
        setIncludeRequesters(userSpecificPrefs.includeRequesters);
        // console.log(`🔄 Loading user preferences - includeSystem: ${userSpecificPrefs.includeSystem}`);
        setIncludeSystem(userSpecificPrefs.includeSystem);
        setTaskViewMode(userSpecificPrefs.taskViewMode);
        setViewMode(userSpecificPrefs.viewMode);
        viewModeRef.current = userSpecificPrefs.viewMode;
        setIsSearchActive(userSpecificPrefs.isSearchActive);
        setIsAdvancedSearchExpanded(userSpecificPrefs.isAdvancedSearchExpanded);
        setSearchFilters(userSpecificPrefs.searchFilters);
        setSelectedSprintId(userSpecificPrefs.selectedSprintId); // Load sprint selection from DB
        
        // Load saved filter view if one is remembered
        if (userSpecificPrefs.currentFilterViewId) {
          loadSavedFilterView(userSpecificPrefs.currentFilterViewId);
        }
        
        // Set initial selected board with preference fallback
        if (!selectedBoard) {
          const initialBoard = getInitialSelectedBoardWithPreferences(currentUser.id);
          if (initialBoard) {
            setSelectedBoard(initialBoard);
          }
        }
      };
      
      loadPreferences();
    }
  }, [isAuthenticated, currentUser?.id, selectedBoard]);

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
            getMembers(includeSystem),
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
          setActivities(loadedActivities || []);
          
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
        const loadedMembers = await getMembers(includeSystem);
        setMembers(loadedMembers);
      } catch (error) {
        console.error('Failed to reload members:', error);
      }
    };
    
    reloadMembers();
  }, [includeSystem, isAuthenticated, currentUser?.id]);

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
        
        // Still load relationships
        getBoardTaskRelationships(selectedBoard)
          .then(relationships => {
            setBoardRelationships(relationships);
          })
          .catch(error => {
            console.warn('Failed to load relationships:', error);
            setBoardRelationships([]);
          });
      } else {
        // Board data not loaded yet, fetch it
        refreshBoardData().finally(() => {
          // Clear switching state after data is loaded
          setIsSwitchingBoard(false);
        });
        
        // Load relationships when switching boards
        getBoardTaskRelationships(selectedBoard)
          .then(relationships => {
            setBoardRelationships(relationships);
          })
          .catch(error => {
            console.warn('Failed to load relationships:', error);
            setBoardRelationships([]);
          });
      }
    } else {
      // Clear columns when no board is selected
      setColumns({});
      setBoardRelationships([]);
      setIsSwitchingBoard(false);
    }
  }, [selectedBoard, boards]);

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
            
            // Also load relationships for the selected board
            try {
              const relationships = await getBoardTaskRelationships(selectedBoard);
              setBoardRelationships(relationships);
            } catch (error) {
              console.warn('Failed to load relationships:', error);
              setBoardRelationships([]);
            }
          } else {
            // Selected board no longer exists, clear selection
            setSelectedBoard(null);
            setColumns({});
            setBoardRelationships([]);
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
      } else if (await checkInstanceStatusOnError(error)) {
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
      priority: getDefaultPriorityName(), // Use frontend default priority
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
      const wouldBeFilteredBySearch = wouldTaskBeFilteredOut(newTask, searchFilters, isSearchActive);
      const wouldBeFilteredByMembers = (() => {
        // Check if task matches member filtering criteria
        if (!includeAssignees && !includeWatchers && !includeCollaborators && !includeRequesters) {
          return false; // No member filters active
        }
        
        // If no members selected, treat as "all members" (task will be shown)
        const showAllMembers = selectedMembers.length === 0;
        const memberIds = new Set(selectedMembers);
        let hasMatchingMember = false;
        
        if (includeAssignees) {
          if (showAllMembers) {
            // All tasks with assignees are shown
            if (newTask.memberId) hasMatchingMember = true;
          } else {
            // Only tasks assigned to selected members
            if (newTask.memberId && memberIds.has(newTask.memberId)) hasMatchingMember = true;
          }
        }
        
        if (!hasMatchingMember && includeRequesters) {
          if (showAllMembers) {
            // All tasks with requesters are shown
            if (newTask.requesterId) hasMatchingMember = true;
          } else {
            // Only tasks requested by selected members
            if (newTask.requesterId && memberIds.has(newTask.requesterId)) hasMatchingMember = true;
          }
        }
        
        if (!hasMatchingMember && includeWatchers && newTask.watchers && Array.isArray(newTask.watchers)) {
          if (showAllMembers) {
            // All tasks with watchers are shown
            if (newTask.watchers.length > 0) hasMatchingMember = true;
          } else {
            // Only tasks watched by selected members
            if (newTask.watchers.some(w => w && memberIds.has(w.id))) hasMatchingMember = true;
          }
        }
        
        if (!hasMatchingMember && includeCollaborators && newTask.collaborators && Array.isArray(newTask.collaborators)) {
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
      } else if (await checkInstanceStatusOnError(error)) {
        // Instance status error handled by utility function
      } else {
        await refreshBoardData();
      }
    }
  };

  const handleEditTask = useCallback(async (task: Task) => {
    
    // Optimistic update
    const previousColumns = { ...columns };
    
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
    
    try {
      await withLoading('tasks', async () => {
        await updateTask(task);
        await fetchQueryLogs();
      });
    } catch (error: any) {
      console.error('❌ [App] Failed to update task:', error);
      
      // Check if it's an instance unavailable error
      if (await checkInstanceStatusOnError(error)) {
        return; // Don't rollback if instance is suspended
      }
      
      // Rollback on error
      setColumns(previousColumns);
    }
  }, [withLoading, fetchQueryLogs]);

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
      if (await checkInstanceStatusOnError(error)) {
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
    // console.log('🎯 Mouse + square cursor set for task:', task.title);
  };
  
  // Clear custom cursor
  const clearCustomCursor = () => {
    if (dragStartedRef.current) {
      // Remove direct styles
      document.body.style.removeProperty('cursor');
      document.documentElement.style.removeProperty('cursor');
      
      dragStartedRef.current = false;
      // console.log('🎯 Custom cursor cleared');
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

    // Handle reordering within the same column - update positions and recalculate
  const handleSameColumnReorder = async (task: Task, columnId: string, newIndex: number) => {
    const columnTasks = [...(columns[columnId]?.tasks || [])]
      .sort((a, b) => (a.position || 0) - (b.position || 0));
    
    const currentIndex = columnTasks.findIndex(t => t.id === task.id);

    console.log('🔄 handleSameColumnReorder called:', {
      taskId: task.id,
      taskTitle: task.title,
      taskPosition: task.position,
      columnId,
      newIndex,
      currentIndex,
      columnTasksCount: columnTasks.length,
      columnTasks: columnTasks.map(t => ({ id: t.id, title: t.title, position: t.position }))
    });

    // Check if reorder is actually needed
    // BUT: Allow reordering when dropping on another task (even if same position)
    // This enables proper swapping of tasks at the same position
    if (currentIndex === newIndex) {
        console.log('🔄 No reorder needed - currentIndex === newIndex:', currentIndex);
        return;
    }

    // Optimistic update - reorder in UI immediately
    const oldIndex = currentIndex;
    const reorderedTasks = arrayMove(columnTasks, oldIndex, newIndex);
    
    // Recalculate positions for all tasks in the group
    const tasksWithUpdatedPositions = reorderedTasks.map((t, index) => ({
      ...t,
      position: index
    }));
    
    // Set flag to prevent WebSocket interference
    if (window.setJustUpdatedFromWebSocket) {
      window.setJustUpdatedFromWebSocket(true);
    }
    
    setColumns(prev => ({
      ...prev,
      [columnId]: {
        ...prev[columnId],
        tasks: tasksWithUpdatedPositions
      }
    }));

    // Send all updated tasks with their new positions to backend
    try {
      // Update all tasks with their new positions
      for (const updatedTask of tasksWithUpdatedPositions) {
        await updateTask(updatedTask);
      }
        
      // Add cooldown to prevent polling interference
      setDragCooldown(true);
      setTimeout(() => {
        setDragCooldown(false);
        // Reset WebSocket flag after drag operation completes
        if (window.setJustUpdatedFromWebSocket) {
          window.setJustUpdatedFromWebSocket(false);
        }
        // Note: We don't refresh immediately to preserve the optimistic update
        // The next poll will sync the state if needed
      }, DRAG_COOLDOWN_DURATION);
    } catch (error) {
      // console.error('❌ Failed to reorder tasks:', error);
      await refreshBoardData();
    }
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
      await handleSameColumnReorder(sourceTask, sourceColumnId, targetIndex);
    } else {
      // Different columns - use cross-column move logic
      console.log('🎯 Calling handleCrossColumnMove');
      await handleCrossColumnMove(sourceTask, sourceColumnId, targetColumnId, targetIndex);
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
        await updateTask(finalMovedTask);
        
      // Step 2: Update all source column tasks (sequential positions)
      for (const task of updatedSourceTasks) {
        await updateTask(task);
      }
        
      // Step 3: Update all target column tasks (except the moved one)
      for (const task of updatedTargetTasks.filter(t => t.id !== finalMovedTask.id)) {
        await updateTask(task);
      }
        
        
      // Add cooldown to prevent polling interference
      setDragCooldown(true);
      setTimeout(() => {
        setDragCooldown(false);
        // Note: We don't refresh immediately to preserve the optimistic update
        // The next poll will sync the state if needed
      }, DRAG_COOLDOWN_DURATION);
    } catch (error) {
      // console.error('Failed to update cross-column move:', error);
      // On error, we do want to refresh to get the correct state
      await refreshBoardData();
    }
  };

  // Renumber all columns in a board to ensure clean integer positions
  const renumberColumns = async (boardId: string) => {
    try {
      const { data } = await api.post('/columns/renumber', { boardId });
      return data;
    } catch (error) {
      console.error('Failed to renumber columns:', error);
    }
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
    updateCurrentUserPreference('taskViewMode', newMode);
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    viewModeRef.current = mode;
    updateCurrentUserPreference('viewMode', mode);
  };

  const handleToggleSearch = () => {
    const newValue = !isSearchActive;
    setIsSearchActive(newValue);
    updateCurrentUserPreference('isSearchActive', newValue);
  };

  const handleSearchFiltersChange = (newFilters: typeof searchFilters) => {
    setSearchFilters(newFilters);
    updateCurrentUserPreference('searchFilters', newFilters);
    // Clear current filter view when manually changing filters
    if (currentFilterView) {
      setCurrentFilterView(null);
      updateCurrentUserPreference('currentFilterViewId', null);
    }
  };

  // Handle sprint selection
  const handleSprintChange = (sprint: { id: string; name: string; start_date: string; end_date: string } | null) => {
    // Update selected sprint ID in state and preferences
    const newSprintId = sprint?.id || null;
    setSelectedSprintId(newSprintId);
    updateCurrentUserPreference('selectedSprintId', newSprintId);
    
    // Update date filters when sprint is selected
    if (sprint) {
      const newFilters = {
        ...searchFilters,
        dateFrom: sprint.start_date,
        dateTo: sprint.end_date
      };
      setSearchFilters(newFilters);
      updateCurrentUserPreference('searchFilters', newFilters);
      
      // Auto-enable search when sprint is selected
      if (!isSearchActive) {
        setIsSearchActive(true);
        updateCurrentUserPreference('isSearchActive', true);
      }
    } else {
      // When "All Sprints" is selected, clear date filters
      const newFilters = {
        ...searchFilters,
        dateFrom: '',
        dateTo: ''
      };
      setSearchFilters(newFilters);
      updateCurrentUserPreference('searchFilters', newFilters);
    }
    
    // Clear current filter view when sprint changes
    if (currentFilterView) {
      setCurrentFilterView(null);
      updateCurrentUserPreference('currentFilterViewId', null);
    }
  };

  // Load a saved filter view by ID
  const loadSavedFilterView = async (viewId: number) => {
    try {
      const view = await getSavedFilterView(viewId);
      setCurrentFilterView(view);
      
      // Convert and apply the filter
      const searchFilters = {
        text: view.textFilter || '',
        dateFrom: view.dateFromFilter || '',
        dateTo: view.dateToFilter || '',
        dueDateFrom: view.dueDateFromFilter || '',
        dueDateTo: view.dueDateToFilter || '',
        selectedMembers: view.memberFilters || [],
        selectedPriorities: view.priorityFilters || [],
        selectedTags: view.tagFilters || [],
        projectId: view.projectFilter || '',
        taskId: view.taskFilter || '',
      };
      setSearchFilters(searchFilters);
    } catch (error) {
      // console.error('Failed to load saved filter view:', error);
      // Clear the invalid preference
      updateCurrentUserPreference('currentFilterViewId', null);
    }
  };

  const handleFilterViewChange = (view: SavedFilterView | null) => {
    setCurrentFilterView(view);
    // Save the current filter view ID to user preferences
    updateCurrentUserPreference('currentFilterViewId', view?.id || null);
  };

  // Handle member toggle selection
  const handleMemberToggle = (memberId: string) => {
    const newSelectedMembers = selectedMembers.includes(memberId) 
      ? selectedMembers.filter(id => id !== memberId)
      : [...selectedMembers, memberId];
    
    setSelectedMembers(newSelectedMembers);
    updateCurrentUserPreference('selectedMembers', newSelectedMembers);
  };

  // Handle clearing all member selections (show all members)
  const handleClearMemberSelections = () => {
    // Clear to empty array = show all members
    setSelectedMembers([]);
    updateCurrentUserPreference('selectedMembers', []);
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
    if (isAllModeActive) {
      // Currently in "All Roles" mode, switch to "Assignees Only" mode
      setIncludeAssignees(true);
      setIncludeWatchers(false);
      setIncludeCollaborators(false);
      setIncludeRequesters(false);
      setIncludeSystem(false);
      
      updateCurrentUserPreference('includeAssignees', true);
      updateCurrentUserPreference('includeWatchers', false);
      updateCurrentUserPreference('includeCollaborators', false);
      updateCurrentUserPreference('includeRequesters', false);
      updateCurrentUserPreference('includeSystem', false);
    } else {
      // Not in "All Roles" mode, switch to "All Roles" mode
      setIncludeAssignees(true);
      setIncludeWatchers(true);
      setIncludeCollaborators(true);
      setIncludeRequesters(true);
      // Note: System checkbox is left unchanged (admin-only)
      
      updateCurrentUserPreference('includeAssignees', true);
      updateCurrentUserPreference('includeWatchers', true);
      updateCurrentUserPreference('includeCollaborators', true);
      updateCurrentUserPreference('includeRequesters', true);
    }
  };

  // Handle toggling filter options
  const handleToggleAssignees = (include: boolean) => {
    setIncludeAssignees(include);
    updateCurrentUserPreference('includeAssignees', include);
  };

  const handleToggleWatchers = (include: boolean) => {
    setIncludeWatchers(include);
    updateCurrentUserPreference('includeWatchers', include);
  };

  const handleToggleCollaborators = (include: boolean) => {
    setIncludeCollaborators(include);
    updateCurrentUserPreference('includeCollaborators', include);
  };

  const handleToggleRequesters = (include: boolean) => {
    setIncludeRequesters(include);
    updateCurrentUserPreference('includeRequesters', include);
  };

  const handleToggleSystem = async (include: boolean) => {
    // console.log(`🔄 Toggling system user: ${include}`);
    setIncludeSystem(include);
    updateCurrentUserPreference('includeSystem', include);
    
    // Handle SYSTEM user selection logic without reloading members
    if (include) {
      // Checkbox ON: Auto-select SYSTEM user if not already selected
      setSelectedMembers(prev => {
        if (!prev.includes(SYSTEM_MEMBER_ID)) {
          const newSelection = [...prev, SYSTEM_MEMBER_ID];
          // console.log(`✅ Auto-selecting SYSTEM user`);
          updateCurrentUserPreference('selectedMembers', newSelection);
          return newSelection;
        }
        return prev;
      });
    } else {
      // Checkbox OFF: Auto-deselect SYSTEM user
      setSelectedMembers(prev => {
        const newSelection = prev.filter(id => id !== SYSTEM_MEMBER_ID);
        // console.log(`❌ Auto-deselecting SYSTEM user`);
        updateCurrentUserPreference('selectedMembers', newSelection);
        return newSelection;
      });
    }
    
    // Let the data polling system handle the members refresh naturally
    // This prevents the jarring immediate reload and flash
  };

  // Helper function to quickly check if a task should be included (synchronous checks only for WebSocket updates)
  const shouldIncludeTask = useCallback((task: Task): boolean => {
    // If no filters active, include all tasks
    const isFiltering = isSearchActive || selectedMembers.length > 0 || includeAssignees || includeWatchers || includeCollaborators || includeRequesters;
    if (!isFiltering) return true;

    // Apply search filters (text, dates, priorities, tags, etc.)
    if (isSearchActive) {
      const effectiveFilters = {
        ...searchFilters,
        selectedMembers: selectedMembers.length > 0 ? selectedMembers : searchFilters.selectedMembers
      };
      
      // Create filters without member filtering if we have checkboxes enabled
      const searchOnlyFilters = (includeAssignees || includeWatchers || includeCollaborators || includeRequesters) ? {
        ...effectiveFilters,
        selectedMembers: [] // Skip member filtering in search, we'll handle it separately
      } : effectiveFilters;
      
      // Use the filterTasks utility with a single task
      const filtered = filterTasks([task], searchOnlyFilters, isSearchActive, members, boards);
      if (filtered.length === 0) return false; // Task didn't pass search filters
    }

    // Apply member filtering (synchronous checks only: assignees and requesters)
    // Note: Watchers/collaborators are async and will be handled by the useEffect
    if (selectedMembers.length > 0) {
      let includeTask = false;
      
      // Check assignees
      if (includeAssignees && selectedMembers.includes(task.memberId || '')) {
        includeTask = true;
      }
      
      // Check requesters
      if (!includeTask && includeRequesters && task.requesterId && selectedMembers.includes(task.requesterId)) {
        includeTask = true;
      }
      
      // Check watchers (synchronous using cached data)
      if (!includeTask && includeWatchers) {
        const watchers = task.watchers || [];
        if (watchers.some((watcher: any) => selectedMembers.includes(watcher.id))) {
          includeTask = true;
        }
      }
      
      // Check collaborators (synchronous using cached data)
      if (!includeTask && includeCollaborators) {
        const collaborators = task.collaborators || [];
        if (collaborators.some((collaborator: any) => selectedMembers.includes(collaborator.id))) {
          includeTask = true;
        }
      }
      
      return includeTask;
    }

    return true;
  }, [isSearchActive, searchFilters, selectedMembers, includeAssignees, includeWatchers, includeCollaborators, includeRequesters, members, boards]);

  // Store shouldIncludeTask in a ref to avoid stale closures in WebSocket handlers
  const shouldIncludeTaskRef = useRef(shouldIncludeTask);
  useEffect(() => {
    shouldIncludeTaskRef.current = shouldIncludeTask;
  }, [shouldIncludeTask]);

  // Enhanced filtering effect with watchers/collaborators/requesters support
  // NOTE: Now uses cached data (task.watchers/task.collaborators) instead of API calls for performance
  useEffect(() => {
    const performFiltering = () => {
      // Always filter by selectedMembers if any are selected, or if any checkboxes are checked
      const isFiltering = isSearchActive || selectedMembers.length > 0 || includeAssignees || includeWatchers || includeCollaborators || includeRequesters;
      

      
      if (!isFiltering) {
        setFilteredColumns(columns);
        return;
      }

      // Create custom filtering function that includes watchers/collaborators/requesters (synchronous)
      const customFilterTasks = (tasks: any[]) => {
        // If no checkboxes enabled, return all tasks (no filtering)
        if (!includeAssignees && !includeWatchers && !includeCollaborators && !includeRequesters) {
          return tasks;
        }
        
        // If no members selected, treat as "all members" (empty array = show all)
        const showAllMembers = selectedMembers.length === 0;
        
        const filteredTasks = [];
        
        for (const task of tasks) {
          let includeTask = false;
          
          // Check if task is assigned to selected members (or any member if showAllMembers)
          if (includeAssignees) {
            if (showAllMembers) {
              // Show all tasks with assignees (any member)
              if (task.memberId) {
                includeTask = true;
              }
            } else {
              // Show only tasks assigned to selected members
              if (task.memberId && selectedMembers.includes(task.memberId)) {
                includeTask = true;
              }
            }
          }
          
          // Check watchers if checkbox is enabled (use cached data)
          if (!includeTask && includeWatchers) {
            const watchers = task.watchers || [];
            if (watchers.length > 0) {
              if (showAllMembers) {
                // Show all tasks with watchers
                includeTask = true;
              } else {
                // Show only tasks watched by selected members
                if (watchers.some((watcher: any) => selectedMembers.includes(watcher.id))) {
                  includeTask = true;
                }
              }
            }
          }
          
          // Check collaborators if checkbox is enabled (use cached data)
          if (!includeTask && includeCollaborators) {
            const collaborators = task.collaborators || [];
            if (collaborators.length > 0) {
              if (showAllMembers) {
                // Show all tasks with collaborators
                includeTask = true;
              } else {
                // Show only tasks with selected members as collaborators
                if (collaborators.some((collaborator: any) => selectedMembers.includes(collaborator.id))) {
                  includeTask = true;
                }
              }
            }
          }
          
          // Check requesters if checkbox is enabled
          if (!includeTask && includeRequesters) {
            if (showAllMembers) {
              // Show all tasks with requesters
              if (task.requesterId) {
                includeTask = true;
              }
            } else {
              // Show only tasks requested by selected members
              if (task.requesterId && selectedMembers.includes(task.requesterId)) {
                includeTask = true;
              }
            }
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
          
          columnTasks = filterTasks(columnTasks, searchOnlyFilters, isSearchActive, members, boards);
        }
        
        // Then apply our custom member filtering with assignees/watchers/collaborators/requesters
        // Run member filtering if at least one filter type is enabled (works with 0 or more members selected)
        if (includeAssignees || includeWatchers || includeCollaborators || includeRequesters) {
          columnTasks = customFilterTasks(columnTasks);
        }
        
        filteredColumns[columnId] = {
          ...column,
          tasks: columnTasks
        };
      }
      
      setFilteredColumns(filteredColumns);
      
    };

    performFiltering();
  }, [columns, searchFilters.text, searchFilters.dateFrom, searchFilters.dateTo, searchFilters.dueDateFrom, searchFilters.dueDateTo, searchFilters.selectedPriorities, searchFilters.selectedTags, searchFilters.projectId, searchFilters.taskId, isSearchActive, selectedMembers, includeAssignees, includeWatchers, includeCollaborators, includeRequesters]);

  // Use filtered columns state
  const hasColumnFilters = selectedBoard ? (boardColumnVisibility[selectedBoard] && boardColumnVisibility[selectedBoard].length < Object.keys(columns).length) : false;
  const activeFilters = hasActiveFilters(searchFilters, isSearchActive) || selectedMembers.length > 0 || includeAssignees || includeWatchers || includeCollaborators || includeRequesters || hasColumnFilters;
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
      if (filteredColumns && Object.keys(filteredColumns).length > 0) {
        // Additional validation: check if filteredColumns contain columns that belong to this board
        const currentBoardData = boards.find(b => b.id === selectedBoard);
        const currentBoardColumnIds = currentBoardData ? Object.keys(currentBoardData.columns || {}) : [];
        const filteredColumnIds = Object.keys(filteredColumns);
        
        // Only use filteredColumns if they match the current board's column structure
        const isValidForCurrentBoard = currentBoardColumnIds.length > 0 && 
          filteredColumnIds.every(id => currentBoardColumnIds.includes(id)) &&
          currentBoardColumnIds.every(id => filteredColumnIds.includes(id));
        
        if (isValidForCurrentBoard) {
          // Apply search filtering to visible columns only (excluding archived)
          let totalCount = 0;
          Object.values(filteredColumns).forEach(column => {
            if (visibleColumnIds.includes(column.id) && !column.is_archived) {
              totalCount += column.tasks.length;
            }
          });
          taskCount = totalCount;
        }
      }
      
      // If no search filtering, just count visible columns
      let totalCount = 0;
      Object.values(columnFilteredColumns).forEach(column => {
        totalCount += column.tasks.length;
      });
      taskCount = totalCount;
    }
    
    // For other boards, apply the same filtering logic used in performFiltering
    const isFiltering = isSearchActive || selectedMembers.length > 0 || includeAssignees || includeWatchers || includeCollaborators || includeRequesters;
    
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
    let searchFilteredCount = getFilteredTaskCountForBoard(board, searchFilters, isSearchActive, members, boards);
    
    // If no member filtering is needed (no members selected AND no member-specific checkboxes enabled)
    // OR if we're only doing search filtering (text, dates, tags, project/task identifiers)
    const hasMemberFiltering = selectedMembers.length > 0 || 
      (includeAssignees && selectedMembers.length > 0) || 
      (includeWatchers && selectedMembers.length > 0) || 
      (includeCollaborators && selectedMembers.length > 0) || 
      (includeRequesters && selectedMembers.length > 0);
    
    if (!hasMemberFiltering) {
      taskCount = searchFilteredCount;
    }
    
    // Apply member filtering on top of search filtering
    let totalCount = 0;
    Object.values(board.columns || {}).forEach(column => {
      if (!column.tasks || !Array.isArray(column.tasks)) return;
      
      // Skip archived columns
      const isArchived = Boolean(column.is_archived);
      if (isArchived) return;
      
      const filteredTasks = column.tasks.filter(task => {
        if (!task) return false;
        
        // First apply search filters using the same logic as performFiltering
        if (isSearchActive) {
          const searchFiltered = filterTasks([task], searchFilters, isSearchActive, members, boards);
          if (searchFiltered.length === 0) return false;
        }
        
        // Then apply member filtering
        if (selectedMembers.length === 0 && !includeAssignees && !includeWatchers && !includeCollaborators && !includeRequesters) {
          return true;
        }
        
        // If no members selected, treat as "all members" (empty array = show all)
        const showAllMembers = selectedMembers.length === 0;
        const memberIds = new Set(selectedMembers);
        let hasMatchingMember = false;
        
        if (includeAssignees) {
          if (showAllMembers) {
            // Show all tasks with assignees (any member)
            if (task.memberId) hasMatchingMember = true;
          } else {
            // Show only tasks assigned to selected members
            if (task.memberId && memberIds.has(task.memberId)) hasMatchingMember = true;
          }
        }
        
        if (!hasMatchingMember && includeRequesters) {
          if (showAllMembers) {
            // Show all tasks with requesters
            if (task.requesterId) hasMatchingMember = true;
          } else {
            // Show only tasks requested by selected members
            if (task.requesterId && memberIds.has(task.requesterId)) hasMatchingMember = true;
          }
        }
        
        if (!hasMatchingMember && includeWatchers && task.watchers && Array.isArray(task.watchers)) {
          if (showAllMembers) {
            // Show all tasks with watchers
            if (task.watchers.length > 0) hasMatchingMember = true;
          } else {
            // Show only tasks watched by selected members
            if (task.watchers.some(w => w && memberIds.has(w.id))) hasMatchingMember = true;
          }
        }
        
        if (!hasMatchingMember && includeCollaborators && task.collaborators && Array.isArray(task.collaborators)) {
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
        onAutoLogin={(user, token) => {
          // Automatically log the user in
          handleLogin(user, token);
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
        onAutoLogin={(user, token) => {
          // Automatically log the user in
          handleLogin(user, token);
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
          hasDemoUser={hasDemoUser ?? undefined}
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
        <TourProvider currentUser={currentUser}>
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
        hasDemoUser={hasDemoUser ?? undefined}
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
    <TourProvider currentUser={currentUser}>
      <ThemeProvider>
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
      {process.env.DEMO_ENABLED === 'true' && <ResetCountdown />}
      
      
      {/* New Enhanced Drag & Drop System */}
      <SimpleDragDropManager
        currentBoardId={selectedBoard || ''}
        columns={filteredColumns}
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
        onProfileClick={() => setShowProfileModal(true)}
        onLogout={handleLogout}
        onPageChange={handlePageChange}
          onRefresh={handleRefreshData}
          // isAutoRefreshEnabled={isAutoRefreshEnabled} // Disabled - using real-time updates
          // onToggleAutoRefresh={handleToggleAutoRefresh} // Disabled - using real-time updates
        onHelpClick={() => setShowHelpModal(true)}
        onInviteUser={handleInviteUser}
        selectedSprintId={selectedSprintId}
        onSprintChange={handleSprintChange}
      />

      {/* Network Status Indicator */}
      <NetworkStatusIndicator isOnline={isOnline} />

      <div className={instanceStatus.status !== 'active' && !instanceStatus.isDismissed ? 'pt-20' : ''}>
        <MainLayout
        currentPage={currentPage}
        currentUser={currentUser} 
        selectedTask={selectedTask}
        adminRefreshKey={adminRefreshKey}
        siteSettings={siteSettings}
        isOnline={isOnline}
              onUsersChanged={async () => {
                try {
                  const loadedMembers = await getMembers(includeSystem);
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
        boardColumnVisibility={boardColumnVisibility}
        onBoardColumnVisibilityChange={handleBoardColumnVisibilityChange}

        onSelectMember={handleMemberToggle}
        onClearMemberSelections={handleClearMemberSelections}
        onSelectAllMembers={handleSelectAllMembers}
        isAllModeActive={isAllModeActive}
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
        currentFilterView={currentFilterView}
        sharedFilterViews={sharedFilterViews}
        onFilterViewChange={handleFilterViewChange}
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
                                    isLinkingMode={isLinkingMode}
                                    linkingSourceTask={linkingSourceTask}
                                    linkingLine={linkingLine}
                                    onStartLinking={handleStartLinking}
                                    onUpdateLinkingLine={handleUpdateLinkingLine}
                                    onFinishLinking={handleFinishLinking}
                                    onCancelLinking={handleCancelLinking}
                                    
                                    // Hover highlighting props
                                    hoveredLinkTask={hoveredLinkTask}
                                    onLinkToolHover={handleLinkToolHover}
                                    onLinkToolHoverEnd={handleLinkToolHoverEnd}
                                    getTaskRelationshipType={getTaskRelationshipType}
                                    
                                    // Auto-synced relationships
                                    boardRelationships={boardRelationships}
        />
      </div>

      <InstanceStatusBanner />
      
      {/* Version Update Banner */}
      {showVersionBanner && (
        <VersionUpdateBanner
          currentVersion={versionInfo.currentVersion}
          newVersion={versionInfo.newVersion}
          onRefresh={handleRefreshVersion}
          onDismiss={handleDismissVersionBanner}
        />
      )}

      <ModalManager
        selectedTask={selectedTask}
        taskDetailsOptions={taskDetailsOptions}
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
        onActivityFeedToggle={handleActivityFeedToggle}
        onAccountDeleted={() => {
          // Account deleted successfully - handle logout and redirect
          handleLogout();
        }}
        siteSettings={siteSettings}
        boards={boards}
      />

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
        isVisible={showActivityFeed}
        onClose={() => setShowActivityFeed(false)}
        isMinimized={activityFeedMinimized}
        onMinimizedChange={handleActivityFeedMinimizedChange}
        activities={activities}
        lastSeenActivityId={lastSeenActivityId}
        clearActivityId={clearActivityId}
        onMarkAsRead={handleActivityFeedMarkAsRead}
        onClearAll={handleActivityFeedClearAll}
        position={activityFeedPosition}
        onPositionChange={setActivityFeedPosition}
        dimensions={activityFeedDimensions}
        onDimensionsChange={setActivityFeedDimensions}
        userId={currentUser?.id || null}
      />

      {/* Task Linking Overlay */}
      <TaskLinkingOverlay
        isLinkingMode={isLinkingMode}
        linkingSourceTask={linkingSourceTask}
        linkingLine={linkingLine}
        feedbackMessage={linkingFeedbackMessage}
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
