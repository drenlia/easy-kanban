import { Priority } from '../types';

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
  includeAssignees: boolean;
  includeWatchers: boolean;
  includeCollaborators: boolean;
  includeRequesters: boolean;
  includeSystem: boolean;
  taskDetailsWidth: number;
  listViewColumnVisibility: ColumnVisibility;
  searchFilters: {
    text: string;
    dateFrom: string;
    dateTo: string;
    dueDateFrom: string;
    dueDateTo: string;
    selectedMembers: string[];
    selectedPriorities: Priority[];
    selectedTags: string[];
  };
  appSettings: {
    taskDeleteConfirm?: boolean; // User override for system TASK_DELETE_CONFIRM setting
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

// Default preferences
export const DEFAULT_PREFERENCES: UserPreferences = {
  taskViewMode: 'expand', // Default to expand
  viewMode: 'kanban', // Default to kanban view
  isSearchActive: false, // Default to no search active
  isAdvancedSearchExpanded: false, // Default to collapsed (basic search)
  selectedTaskId: null, // Default to no task selected
  lastSelectedBoard: null, // Default to no board remembered
  selectedMembers: [], // Default to no members selected
  includeAssignees: true, // Default to include assignees (maintains current behavior)
  includeWatchers: false, // Default to not include watchers
  includeCollaborators: false, // Default to not include collaborators
  includeRequesters: false, // Default to not include requesters
  includeSystem: false, // Default to not include system user
  taskDetailsWidth: 480, // Default width in pixels (30rem equivalent)
  listViewColumnVisibility: {
    // Default column visibility - all columns visible except some less important ones
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
    selectedTags: []
  },
  appSettings: {
    // taskDeleteConfirm: undefined - let it inherit from system setting by default
  }
};

// Save preferences to cookie
export const saveUserPreferences = (preferences: UserPreferences, userId: string | null = null): void => {
  try {
    const cookieName = getUserCookieName(userId);
    const prefsJson = JSON.stringify(preferences);
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + COOKIE_EXPIRY_DAYS);
    
    document.cookie = `${cookieName}=${encodeURIComponent(prefsJson)}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Strict`;
  } catch (error) {
    console.error('Failed to save user preferences:', error);
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
      return {
        ...DEFAULT_PREFERENCES,
        ...loadedPrefs,
        listViewColumnVisibility: {
          ...DEFAULT_PREFERENCES.listViewColumnVisibility,
          ...loadedPrefs.listViewColumnVisibility
        },
        searchFilters: {
          ...DEFAULT_PREFERENCES.searchFilters,
          ...loadedPrefs.searchFilters,
          // Ensure text is never null
          text: loadedPrefs.searchFilters?.text || ''
        },
        appSettings: {
          ...DEFAULT_PREFERENCES.appSettings,
          ...loadedPrefs.appSettings
        }
      };
    }
  } catch (error) {
    console.error('Failed to load user preferences:', error);
  }
  
  return DEFAULT_PREFERENCES;
};

// Update specific preference
export const updateUserPreference = <K extends keyof UserPreferences>(
  key: K,
  value: UserPreferences[K],
  userId: string | null = null
): void => {
  const currentPrefs = loadUserPreferences(userId);
  const updatedPrefs = { ...currentPrefs, [key]: value };
  saveUserPreferences(updatedPrefs, userId);
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
