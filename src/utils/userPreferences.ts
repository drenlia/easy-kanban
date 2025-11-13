import { Priority } from '../types';
import { updateUserSetting, getUserSettings } from '../api';
import api from '../api';

// Global state to track preference saving operations
let globalSavingCallbacks: Set<() => void> = new Set();
let isSavingGlobally = false;

// Register a callback to be notified when saving state changes
export const registerSavingStateCallback = (callback: () => void) => {
  globalSavingCallbacks.add(callback);
  return () => globalSavingCallbacks.delete(callback);
};

// Set global saving state and notify all callbacks
const setGlobalSavingState = (saving: boolean) => {
  if (isSavingGlobally !== saving) {
    isSavingGlobally = saving;
    globalSavingCallbacks.forEach(callback => callback());
  }
};

// Get current global saving state
export const isGloballySavingPreferences = () => isSavingGlobally;

export type TaskViewMode = 'compact' | 'shrink' | 'expand';
export type ViewMode = 'kanban' | 'list' | 'gantt';

export interface ColumnVisibility {
  [columnKey: string]: boolean;
}

export interface UserPreferences {
  taskViewMode: TaskViewMode;
  viewMode: ViewMode;
  isSearchActive: boolean;
  isAdvancedSearchExpanded: boolean;
  selectedTaskId: string | null;
  lastSelectedBoard: string | null;
  selectedMembers: string[];
  currentFilterViewId: number | null;
  showSharedFilters: boolean;
  includeAssignees: boolean;
  includeWatchers: boolean;
  includeCollaborators: boolean;
  includeRequesters: boolean;
  includeSystem: boolean;
  taskDetailsWidth: number;
  ganttTaskColumnWidth: number;
  kanbanColumnWidth: number; // User-adjustable width for Kanban columns (default: 300px)
  ganttScrollPositions: { [boardId: string]: { date: string; sessionId: string } }; // Per-board scroll positions
  listViewColumnVisibility: ColumnVisibility;
  selectedSprintId: string | null; // Selected sprint for filtering
  lastReportTab: string | null; // Last accessed report tab (persists across sessions)
  language: 'en' | 'fr'; // User's preferred language

  searchFilters: {
    text: string;
    dateFrom: string;
    dateTo: string;
    dueDateFrom: string;
    dueDateTo: string;
    selectedMembers: string[];
    selectedPriorities: Priority[];
    selectedTags: string[];
    projectId: string;
    taskId: string;
  };
  appSettings: {
    taskDeleteConfirm?: boolean; // User override for system TASK_DELETE_CONFIRM setting
    showActivityFeed?: boolean; // User override for system SHOW_ACTIVITY_FEED setting
    autoRefreshEnabled?: boolean; // User preference for auto-refresh toggle
    showSystemPanel?: boolean; // User preference for system metrics panel visibility (default: true for admins)
  };
  notifications: {
    newTaskAssigned: boolean; // Notify when a new task is assigned to me
    myTaskUpdated: boolean; // Notify when my task is updated
    watchedTaskUpdated: boolean; // Notify when a task I'm watching is updated
    addedAsCollaborator: boolean; // Notify when I'm added as a collaborator on a task
    collaboratingTaskUpdated: boolean; // Notify when a task I'm collaborating in is updated
    commentAdded: boolean; // Notify when a comment is added to a task I'm involved in
    requesterTaskCreated: boolean; // Notify when a task is created and I'm the requester
    requesterTaskUpdated: boolean; // Notify when a task is updated where I'm the requester
  };
  taskPageCollapsed: {
    assignment: boolean;
    schedule: boolean;
    tags: boolean;
    associations: boolean;
    taskFlow: boolean;
    taskInfo: boolean;
  };
  activityFeed: {
    isMinimized: boolean;
    position: { x: number; y: number };
    width: number;
    height: number;
    lastSeenActivityId: number;
    clearActivityId: number;
    filterText: string;
  };
}

const COOKIE_NAME_PREFIX = 'easy-kanban-user-prefs';
const COOKIE_EXPIRY_DAYS = 365;

// Get user-specific cookie name
const getUserCookieName = (userId: string | null): string => {
  if (!userId) {
    return `${COOKIE_NAME_PREFIX}-anonymous`;
  }
  return `${COOKIE_NAME_PREFIX}-${userId}`;
};

// Clear all user preference cookies (useful for preventing cookie bloat)
export const clearAllUserPreferenceCookies = (): void => {
  const cookies = document.cookie.split(';');
  cookies.forEach(cookie => {
    const cookieName = cookie.trim().split('=')[0];
    if (cookieName.startsWith(COOKIE_NAME_PREFIX)) {
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Strict`;
    }
  });
};

// Clear user preference cookies except for the current user
export const clearOtherUserPreferenceCookies = (currentUserId: string | null): void => {
  const cookies = document.cookie.split(';');
  const currentUserCookieName = getUserCookieName(currentUserId);
  
  cookies.forEach(cookie => {
    const cookieName = cookie.trim().split('=')[0];
    if (cookieName.startsWith(COOKIE_NAME_PREFIX) && cookieName !== currentUserCookieName) {
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Strict`;
    }
  });
};

// Base default preferences (fallback when no admin defaults are set)
const BASE_DEFAULT_PREFERENCES: UserPreferences = {
  taskViewMode: 'expand', // Default to expand
  viewMode: 'kanban', // Default to kanban view
  isSearchActive: false, // Default to no search active
  isAdvancedSearchExpanded: false, // Default to collapsed (basic search)
  selectedTaskId: null, // Default to no task selected
  lastSelectedBoard: null, // Default to no board remembered
  selectedMembers: [], // Default to no members selected
  currentFilterViewId: null, // Default to no saved filter selected
  showSharedFilters: true, // Default to show shared filters from other users
  includeAssignees: true, // Default to include assignees (maintains current behavior)
  includeWatchers: false, // Default to not include watchers
  includeCollaborators: false, // Default to not include collaborators
  includeRequesters: false, // Default to not include requesters
  includeSystem: false, // Default to not include system user
  taskDetailsWidth: 480, // Default width in pixels (30rem equivalent)
  ganttTaskColumnWidth: 320, // Default Gantt task column width in pixels
  kanbanColumnWidth: 300, // Default Kanban column width in pixels
  ganttScrollPositions: {}, // Per-board Gantt scroll positions (empty by default)
  selectedSprintId: null, // Default to "All Sprints" (no filter)
  lastReportTab: null, // Default to no last report (will use burndown)
  language: 'en', // Default to English
  listViewColumnVisibility: {
    // Default column visibility - all columns visible except some less important ones
    ticket: true,
    title: true,
    priority: true,
    assignee: true,
    startDate: true,
    dueDate: true,
    tags: true,
    comments: true,
    createdAt: false // Hide created date by default
  },
  searchFilters: {
    text: '',
    dateFrom: '',
    dateTo: '',
    dueDateFrom: '',
    dueDateTo: '',
    selectedMembers: [],
    selectedPriorities: [],
    selectedTags: [],
    projectId: '',
    taskId: ''
  },
  appSettings: {
    // taskDeleteConfirm: undefined - let it inherit from system setting by default
    // showActivityFeed: undefined - let it inherit from system setting by default
    autoRefreshEnabled: true, // Default to auto-refresh enabled
  },
  notifications: {
    newTaskAssigned: true,
    myTaskUpdated: true,
    watchedTaskUpdated: true,
    addedAsCollaborator: true,
    collaboratingTaskUpdated: true,
    commentAdded: true,
    requesterTaskCreated: true,
    requesterTaskUpdated: true
  },
  taskPageCollapsed: {
    assignment: false,
    schedule: false,
    tags: false,
    associations: false,
    taskFlow: false,
    taskInfo: false
  },
  activityFeed: {
    isMinimized: false,
    position: { x: 10, y: 220 }, // Position on left side with 10px margin
    width: 160, // Default width (now supports 120-600px range)
    height: typeof window !== 'undefined' ? window.innerHeight - 200 : 400, // Dynamic default height
    lastSeenActivityId: 0,
    clearActivityId: 0,
    filterText: ''
  }
};

// Admin-configurable default preferences (loaded from system settings)
let ADMIN_DEFAULT_PREFERENCES: Partial<UserPreferences> | null = null;

// Function to load admin defaults from system settings
export const loadAdminDefaults = async (): Promise<void> => {
  try {
    // Use the api instance to get admin-configured defaults with proper authentication
    const response = await api.get('/admin/settings');
    const settings = response.data;
    
    // Parse admin defaults from settings (if they exist)
    ADMIN_DEFAULT_PREFERENCES = {};
    
    // Example: Admin can set default view mode
    if (settings.DEFAULT_VIEW_MODE) {
      ADMIN_DEFAULT_PREFERENCES.viewMode = settings.DEFAULT_VIEW_MODE;
    }
    
    // Example: Admin can set default task view mode
    if (settings.DEFAULT_TASK_VIEW_MODE) {
      ADMIN_DEFAULT_PREFERENCES.taskViewMode = settings.DEFAULT_TASK_VIEW_MODE;
    }
    
    // Example: Admin can set default activity feed position
    if (settings.DEFAULT_ACTIVITY_FEED_POSITION) {
      try {
        ADMIN_DEFAULT_PREFERENCES.activityFeed = {
          ...BASE_DEFAULT_PREFERENCES.activityFeed,
          position: JSON.parse(settings.DEFAULT_ACTIVITY_FEED_POSITION)
        };
      } catch (e) {
        console.warn('Failed to parse DEFAULT_ACTIVITY_FEED_POSITION:', e);
      }
    }
    
    // Example: Admin can set default activity feed dimensions
    if (settings.DEFAULT_ACTIVITY_FEED_WIDTH || settings.DEFAULT_ACTIVITY_FEED_HEIGHT) {
      ADMIN_DEFAULT_PREFERENCES.activityFeed = {
        ...ADMIN_DEFAULT_PREFERENCES.activityFeed || BASE_DEFAULT_PREFERENCES.activityFeed,
        width: settings.DEFAULT_ACTIVITY_FEED_WIDTH || BASE_DEFAULT_PREFERENCES.activityFeed.width,
        height: settings.DEFAULT_ACTIVITY_FEED_HEIGHT || BASE_DEFAULT_PREFERENCES.activityFeed.height
      };
    }
    
  } catch (error) {
    console.warn('Failed to load admin defaults, using base defaults:', error);
    ADMIN_DEFAULT_PREFERENCES = {};
  }
};

// Get effective default preferences (base + admin overrides)
export const getDefaultPreferences = (): UserPreferences => {
  if (!ADMIN_DEFAULT_PREFERENCES) {
    return BASE_DEFAULT_PREFERENCES;
  }
  
  return {
    ...BASE_DEFAULT_PREFERENCES,
    ...ADMIN_DEFAULT_PREFERENCES,
    // Deep merge nested objects
    listViewColumnVisibility: {
      ...BASE_DEFAULT_PREFERENCES.listViewColumnVisibility,
      ...ADMIN_DEFAULT_PREFERENCES.listViewColumnVisibility
    },
    searchFilters: {
      ...BASE_DEFAULT_PREFERENCES.searchFilters,
      ...ADMIN_DEFAULT_PREFERENCES.searchFilters
    },
    appSettings: {
      ...BASE_DEFAULT_PREFERENCES.appSettings,
      ...ADMIN_DEFAULT_PREFERENCES.appSettings
    },
    notifications: {
      ...BASE_DEFAULT_PREFERENCES.notifications,
      ...ADMIN_DEFAULT_PREFERENCES.notifications
    },
    taskPageCollapsed: {
      ...BASE_DEFAULT_PREFERENCES.taskPageCollapsed,
      ...ADMIN_DEFAULT_PREFERENCES.taskPageCollapsed
    },
    activityFeed: {
      ...BASE_DEFAULT_PREFERENCES.activityFeed,
      ...ADMIN_DEFAULT_PREFERENCES.activityFeed
    }
  };
};

// Export for backward compatibility - will use admin defaults if loaded
export const DEFAULT_PREFERENCES = getDefaultPreferences();

// Initialize new user with admin defaults (call this when a new user first logs in)
export const initializeNewUserPreferences = async (userId: string): Promise<void> => {
  try {
    // Ensure admin defaults are loaded
    await loadAdminDefaults();
    
    // Get the effective defaults (base + admin overrides)
    const defaults = getDefaultPreferences();
    
    // Save the defaults as the user's initial preferences
    await saveUserPreferences(defaults, userId);
    
  } catch (error) {
    console.error('Failed to initialize new user preferences:', error);
    // Fallback to base defaults
    await saveUserPreferences(BASE_DEFAULT_PREFERENCES, userId);
  }
};

// Save preferences to cookie and database
export const saveUserPreferences = async (preferences: UserPreferences, userId: string | null = null): Promise<void> => {
  // Set global saving state to block user status polling
  setGlobalSavingState(true);
  
  try {
    // Save to cookie (existing behavior)
    const cookieName = getUserCookieName(userId);
    const prefsJson = JSON.stringify(preferences);
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + COOKIE_EXPIRY_DAYS);
    
    document.cookie = `${cookieName}=${encodeURIComponent(prefsJson)}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Strict`;
    
    // Also save ALL preferences to database if user is authenticated
    if (userId) {
      try {
        // Helper function to only save non-undefined values
        // Special case: allow null for selectedSprintId (represents "All Sprints")
        const saveIfDefined = (key: string, value: any) => {
          if (value !== undefined) {
            // Allow null for selectedSprintId to save "All Sprints" selection
            if (value === null && key === 'selectedSprintId') {
              return updateUserSetting(key, value);
            }
            if (value !== null) {
              return updateUserSetting(key, value);
            }
          }
          return Promise.resolve(); // Skip undefined values
        };
        
        await Promise.all([
          // Core UI Preferences
          saveIfDefined('taskViewMode', preferences.taskViewMode),
          saveIfDefined('viewMode', preferences.viewMode),
          saveIfDefined('taskDetailsWidth', preferences.taskDetailsWidth),
          saveIfDefined('ganttTaskColumnWidth', preferences.ganttTaskColumnWidth),
          saveIfDefined('kanbanColumnWidth', preferences.kanbanColumnWidth),
          
          // App Settings (only save if explicitly set)
          saveIfDefined('taskDeleteConfirm', preferences.appSettings.taskDeleteConfirm),
          saveIfDefined('showActivityFeed', preferences.appSettings.showActivityFeed),
          saveIfDefined('autoRefreshEnabled', preferences.appSettings.autoRefreshEnabled),
          saveIfDefined('showSystemPanel', preferences.appSettings.showSystemPanel),
          
          // Activity Feed Settings
          saveIfDefined('activityFeedMinimized', preferences.activityFeed.isMinimized),
          saveIfDefined('activityFeedPosition', JSON.stringify(preferences.activityFeed.position)),
          saveIfDefined('activityFeedWidth', preferences.activityFeed.width),
          saveIfDefined('activityFeedHeight', preferences.activityFeed.height),
          saveIfDefined('lastSeenActivityId', preferences.activityFeed.lastSeenActivityId),
          saveIfDefined('clearActivityId', preferences.activityFeed.clearActivityId),
          saveIfDefined('activityFilterText', preferences.activityFeed.filterText),
          
          // List View Column Visibility
          saveIfDefined('listViewColumnVisibility', JSON.stringify(preferences.listViewColumnVisibility)),
          
          // Member Filter Preferences
          saveIfDefined('includeAssignees', preferences.includeAssignees),
          saveIfDefined('includeWatchers', preferences.includeWatchers),
          saveIfDefined('includeCollaborators', preferences.includeCollaborators),
          saveIfDefined('includeRequesters', preferences.includeRequesters),
          saveIfDefined('includeSystem', preferences.includeSystem),
          
          // Search State (for cross-device consistency)
          saveIfDefined('isAdvancedSearchExpanded', preferences.isAdvancedSearchExpanded),
          saveIfDefined('lastSelectedBoard', preferences.lastSelectedBoard),
          
          // Selected Members (persistent filter)
          saveIfDefined('selectedMembers', JSON.stringify(preferences.selectedMembers)),
          
          // Sprint Selection
          saveIfDefined('selectedSprintId', preferences.selectedSprintId),
          
          // Last Report Tab
          saveIfDefined('lastReportTab', preferences.lastReportTab),
          
          // Gantt Scroll Positions
          saveIfDefined('ganttScrollPositions', JSON.stringify(preferences.ganttScrollPositions)),
          
          // Language Preference
          saveIfDefined('language', preferences.language)
        ]);
      } catch (dbError) {
        console.warn('Failed to save preferences to database:', dbError);
        // Don't fail the whole operation if database save fails
      }
    }
  } catch (error) {
    console.error('Failed to save user preferences:', error);
  } finally {
    // Clear global saving state after save completes (success or failure)
    setGlobalSavingState(false);
  }
};

// Load preferences from cookie
export const loadUserPreferences = (userId: string | null = null): UserPreferences => {
  try {
    const cookieName = getUserCookieName(userId);
    const cookies = document.cookie.split(';');
    const prefsCookie = cookies.find(cookie => 
      cookie.trim().startsWith(`${cookieName}=`)
    );
    
    if (prefsCookie) {
      const prefsJson = decodeURIComponent(prefsCookie.split('=')[1]);
      const loadedPrefs = JSON.parse(prefsJson);
      
      // Merge with defaults to handle missing properties in old cookies
      const defaults = getDefaultPreferences();
      return {
        ...defaults,
        ...loadedPrefs,
        listViewColumnVisibility: {
          ...defaults.listViewColumnVisibility,
          ...loadedPrefs.listViewColumnVisibility
        },
        searchFilters: {
          ...defaults.searchFilters,
          ...loadedPrefs.searchFilters,
          // Ensure text is never null
          text: loadedPrefs.searchFilters?.text || '',
          // Ensure identifiers are never null
          projectId: loadedPrefs.searchFilters?.projectId || '',
          taskId: loadedPrefs.searchFilters?.taskId || ''
        },
        appSettings: {
          ...defaults.appSettings,
          ...loadedPrefs.appSettings
        },
        notifications: {
          ...defaults.notifications,
          ...loadedPrefs.notifications
        },
        taskPageCollapsed: {
          ...defaults.taskPageCollapsed,
          ...loadedPrefs.taskPageCollapsed
        },
        activityFeed: {
          ...defaults.activityFeed,
          ...loadedPrefs.activityFeed
        }
      };
    }
  } catch (error) {
    console.error('Failed to load user preferences:', error);
  }
  
  return getDefaultPreferences();
};

// Helper function to check if a cookie preference is "default" (not customized by user)
const isDefaultValue = (cookieValue: any, defaultValue: any): boolean => {
  // For objects, do deep comparison
  if (typeof cookieValue === 'object' && typeof defaultValue === 'object') {
    return JSON.stringify(cookieValue) === JSON.stringify(defaultValue);
  }
  // For primitives, direct comparison
  return cookieValue === defaultValue;
};

// Load preferences from cookie and database (for authenticated users)
export const loadUserPreferencesAsync = async (userId: string | null = null): Promise<UserPreferences> => {
  // Start with cookie-based preferences
  let preferences = loadUserPreferences(userId);
  let needsCookieUpdate = false;
  
  // If user is authenticated, also load database settings and merge them intelligently
  if (userId) {
    try {
      const dbSettings = await getUserSettings();
      
      // Smart merge: Only use database value if cookie is at default value AND database has a non-default value
      const smartMerge = (cookieValue: any, dbValue: any, defaultValue: any, allowNull: boolean = false) => {
        // If cookie is customized (not default), keep cookie value
        if (!isDefaultValue(cookieValue, defaultValue)) {
          return cookieValue;
        }
        // If cookie is default but database has a value, use database value
        // Special case: allow null for sprint selection (represents "All Sprints")
        if (dbValue !== undefined && ((allowNull && dbValue === null) || (dbValue !== null && !isDefaultValue(dbValue, defaultValue)))) {
          needsCookieUpdate = true;
          return dbValue;
        }
        // Otherwise keep cookie value
        return cookieValue;
      };
      
      // Apply smart merging to all preferences
      const defaults = getDefaultPreferences();
      preferences = {
        ...preferences,
        
        // Core UI Preferences
        taskViewMode: smartMerge(preferences.taskViewMode, dbSettings.taskViewMode, defaults.taskViewMode),
        viewMode: smartMerge(preferences.viewMode, dbSettings.viewMode, defaults.viewMode),
        taskDetailsWidth: smartMerge(preferences.taskDetailsWidth, dbSettings.taskDetailsWidth, defaults.taskDetailsWidth),
        ganttTaskColumnWidth: smartMerge(preferences.ganttTaskColumnWidth, dbSettings.ganttTaskColumnWidth, defaults.ganttTaskColumnWidth),
        kanbanColumnWidth: smartMerge(preferences.kanbanColumnWidth, dbSettings.kanbanColumnWidth, defaults.kanbanColumnWidth),
        
        // Member Filter Preferences  
        includeAssignees: smartMerge(preferences.includeAssignees, dbSettings.includeAssignees, defaults.includeAssignees),
        includeWatchers: smartMerge(preferences.includeWatchers, dbSettings.includeWatchers, defaults.includeWatchers),
        includeCollaborators: smartMerge(preferences.includeCollaborators, dbSettings.includeCollaborators, defaults.includeCollaborators),
        includeRequesters: smartMerge(preferences.includeRequesters, dbSettings.includeRequesters, defaults.includeRequesters),
        includeSystem: smartMerge(preferences.includeSystem, dbSettings.includeSystem, defaults.includeSystem),
        
        // Search State
        isAdvancedSearchExpanded: smartMerge(preferences.isAdvancedSearchExpanded, dbSettings.isAdvancedSearchExpanded, defaults.isAdvancedSearchExpanded),
        lastSelectedBoard: smartMerge(preferences.lastSelectedBoard, dbSettings.lastSelectedBoard, defaults.lastSelectedBoard),
        selectedMembers: smartMerge(preferences.selectedMembers, dbSettings.selectedMembers ? JSON.parse(dbSettings.selectedMembers) : undefined, defaults.selectedMembers),
        
        // Sprint Selection (allow null to represent "All Sprints")
        selectedSprintId: smartMerge(preferences.selectedSprintId, dbSettings.selectedSprintId, defaults.selectedSprintId, true),
        
        // Last Report Tab
        lastReportTab: smartMerge(preferences.lastReportTab, dbSettings.lastReportTab, defaults.lastReportTab),
        
        // Language Preference
        language: smartMerge(preferences.language, dbSettings.language, defaults.language),
        
        // List View Column Visibility (special handling for object)
        listViewColumnVisibility: (() => {
          const cookieColumns = preferences.listViewColumnVisibility;
          const dbColumns = dbSettings.listViewColumnVisibility ? JSON.parse(dbSettings.listViewColumnVisibility) : undefined;
          
          if (!isDefaultValue(cookieColumns, defaults.listViewColumnVisibility)) {
            return cookieColumns; // Cookie is customized, keep it
          }
          if (dbColumns && !isDefaultValue(dbColumns, defaults.listViewColumnVisibility)) {
            needsCookieUpdate = true;
            return { ...defaults.listViewColumnVisibility, ...dbColumns }; // Use database
          }
          return cookieColumns; // Keep cookie
        })(),
        
        // App Settings
        appSettings: {
          ...preferences.appSettings,
          taskDeleteConfirm: smartMerge(preferences.appSettings.taskDeleteConfirm, dbSettings.taskDeleteConfirm, defaults.appSettings.taskDeleteConfirm),
          showActivityFeed: smartMerge(preferences.appSettings.showActivityFeed, dbSettings.showActivityFeed, defaults.appSettings.showActivityFeed),
          autoRefreshEnabled: smartMerge(preferences.appSettings.autoRefreshEnabled, dbSettings.autoRefreshEnabled, defaults.appSettings.autoRefreshEnabled),
          showSystemPanel: smartMerge(preferences.appSettings.showSystemPanel, dbSettings.showSystemPanel, defaults.appSettings.showSystemPanel)
        },
        
        // Activity Feed Settings
        activityFeed: {
          ...preferences.activityFeed,
          isMinimized: smartMerge(preferences.activityFeed.isMinimized, dbSettings.activityFeedMinimized, defaults.activityFeed.isMinimized),
          position: smartMerge(preferences.activityFeed.position, dbSettings.activityFeedPosition ? JSON.parse(dbSettings.activityFeedPosition) : undefined, defaults.activityFeed.position),
          width: smartMerge(preferences.activityFeed.width, dbSettings.activityFeedWidth, defaults.activityFeed.width),
          height: smartMerge(preferences.activityFeed.height, dbSettings.activityFeedHeight, defaults.activityFeed.height),
          lastSeenActivityId: smartMerge(preferences.activityFeed.lastSeenActivityId, dbSettings.lastSeenActivityId, defaults.activityFeed.lastSeenActivityId),
          clearActivityId: smartMerge(preferences.activityFeed.clearActivityId, dbSettings.clearActivityId, defaults.activityFeed.clearActivityId),
          filterText: smartMerge(preferences.activityFeed.filterText, dbSettings.activityFilterText, defaults.activityFeed.filterText),
        },
        
        // Gantt Scroll Positions (special handling for object)
        ganttScrollPositions: (() => {
          const cookieScrollPositions = preferences.ganttScrollPositions;
          const dbScrollPositions = dbSettings.ganttScrollPositions ? JSON.parse(dbSettings.ganttScrollPositions) : undefined;
          
          if (!isDefaultValue(cookieScrollPositions, defaults.ganttScrollPositions)) {
            return cookieScrollPositions; // Cookie is customized, keep it
          }
          if (dbScrollPositions && !isDefaultValue(dbScrollPositions, defaults.ganttScrollPositions)) {
            needsCookieUpdate = true;
            return { ...defaults.ganttScrollPositions, ...dbScrollPositions }; // Use database
          }
          return cookieScrollPositions; // Keep cookie
        })()
      };
      
      // If we updated any preferences from database, save the merged result back to cookies
      if (needsCookieUpdate) {
        // Save synchronously to cookies only (don't trigger another database save)
        const cookieName = getUserCookieName(userId);
        const prefsJson = JSON.stringify(preferences);
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + COOKIE_EXPIRY_DAYS);
        
        document.cookie = `${cookieName}=${encodeURIComponent(prefsJson)}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Strict`;
      }
      
    } catch (error) {
      console.warn('Failed to load database settings, using cookie preferences only:', error);
    }
  }
  
  return preferences;
};

// Update specific preference
export const updateUserPreference = async <K extends keyof UserPreferences>(
  key: K,
  value: UserPreferences[K],
  userId: string | null = null
): Promise<void> => {
  const currentPrefs = loadUserPreferences(userId);
  const updatedPrefs = { ...currentPrefs, [key]: value };
  
  // Update cookie immediately (synchronous, fast)
  const cookieName = getUserCookieName(userId);
  const prefsJson = JSON.stringify(updatedPrefs);
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + COOKIE_EXPIRY_DAYS);
  document.cookie = `${cookieName}=${encodeURIComponent(prefsJson)}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Strict`;
  
  // Save ONLY this specific preference to database (single API call instead of 30+)
  if (userId) {
    try {
      // Map preference keys to database setting keys
      // For nested keys like appSettings, we need to handle them specially
      let dbKey: string | undefined;
      let dbValue: any = value;
      
      // Handle top-level keys
      const topLevelKeyMap: Record<string, string> = {
        'taskViewMode': 'taskViewMode',
        'viewMode': 'viewMode',
        'taskDetailsWidth': 'taskDetailsWidth',
        'ganttTaskColumnWidth': 'ganttTaskColumnWidth',
        'kanbanColumnWidth': 'kanbanColumnWidth',
        'isSearchActive': 'isSearchActive',
        'isAdvancedSearchExpanded': 'isAdvancedSearchExpanded',
        'lastSelectedBoard': 'lastSelectedBoard',
        'selectedMembers': 'selectedMembers',
        'selectedSprintId': 'selectedSprintId',
        'currentFilterViewId': 'currentFilterViewId',
        'lastReportTab': 'lastReportTab',
        'includeAssignees': 'includeAssignees',
        'includeWatchers': 'includeWatchers',
        'includeCollaborators': 'includeCollaborators',
        'includeRequesters': 'includeRequesters',
        'includeSystem': 'includeSystem',
        'searchFilters': 'searchFilters',
        'listViewColumnVisibility': 'listViewColumnVisibility',
        'ganttScrollPositions': 'ganttScrollPositions',
        'language': 'language',
      };
      
      dbKey = topLevelKeyMap[key as string];
      
      // Note: appSettings keys are handled separately via updateActivityFeedPreference pattern
      // If we need to support appSettings here, we'd need to check the key structure differently
      
      if (!dbKey) {
        // If no mapping found, fall back to saving all preferences (for backwards compatibility)
        await saveUserPreferences(updatedPrefs, userId);
        return;
      }
      
      // Special handling for JSON-serialized values
      if (dbKey === 'selectedMembers' || dbKey === 'listViewColumnVisibility' || dbKey === 'ganttScrollPositions' || dbKey === 'searchFilters') {
        dbValue = JSON.stringify(value);
      }
      
      // Special case: allow null for selectedSprintId (represents "All Sprints")
      if (dbKey === 'selectedSprintId' && value === null) {
        await updateUserSetting(dbKey, null);
      } else if (value !== null && value !== undefined) {
        await updateUserSetting(dbKey, dbValue);
      }
    } catch (error) {
      console.warn('Failed to save single preference to database, falling back to full save:', error);
      // Fallback to saving all preferences if single save fails
      await saveUserPreferences(updatedPrefs, userId);
    }
  }
};

// Helper function to update activity feed specific settings
export const updateActivityFeedPreference = async <K extends keyof UserPreferences['activityFeed']>(
  key: K,
  value: UserPreferences['activityFeed'][K],
  userId: string | null = null
): Promise<void> => {
  const currentPrefs = loadUserPreferences(userId);
  const updatedPrefs = {
    ...currentPrefs,
    activityFeed: {
      ...currentPrefs.activityFeed,
      [key]: value
    }
  };
  
  // Update cookie immediately (synchronous, fast)
  const cookieName = getUserCookieName(userId);
  const prefsJson = JSON.stringify(updatedPrefs);
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + COOKIE_EXPIRY_DAYS);
  document.cookie = `${cookieName}=${encodeURIComponent(prefsJson)}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Strict`;
  
  // Map activity feed keys to database setting keys
  const dbKeyMap: Record<string, string> = {
    'isMinimized': 'activityFeedMinimized',
    'position': 'activityFeedPosition',
    'width': 'activityFeedWidth',
    'height': 'activityFeedHeight',
    'lastSeenActivityId': 'lastSeenActivityId',
    'clearActivityId': 'clearActivityId',
    'filterText': 'activityFilterText'
  };
  
  const dbKey = dbKeyMap[key];
  if (!dbKey) {
    console.error(`Unknown activity feed preference key: ${String(key)}`);
    return;
  }
  
  // Save ONLY this specific setting to database (single API call instead of 30+)
  let dbValue: any = value;
  if (key === 'position') {
    dbValue = JSON.stringify(value);
  }
  
  await updateUserSetting(dbKey, dbValue);
};

// Get effective task delete confirmation setting (user preference with system fallback)
export const getTaskDeleteConfirmSetting = (
  userPreferences: UserPreferences,
  systemSettings: { TASK_DELETE_CONFIRM?: string }
): boolean => {
  // If user has explicitly set a preference, use that
  if (userPreferences.appSettings.taskDeleteConfirm !== undefined) {
    return userPreferences.appSettings.taskDeleteConfirm;
  }
  
  // Otherwise, use system default (true if not set or if set to 'true')
  return systemSettings.TASK_DELETE_CONFIRM !== 'false';
};
