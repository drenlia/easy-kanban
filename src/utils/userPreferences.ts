import { Priority } from '../types';

export type TaskViewMode = 'compact' | 'shrink' | 'expand';

export interface UserPreferences {
  taskViewMode: TaskViewMode;
  isSearchActive: boolean;
  isAdvancedSearchExpanded: boolean;
  selectedTaskId: string | null;
  selectedMembers: string[];
  includeAssignees: boolean;
  includeWatchers: boolean;
  includeCollaborators: boolean;
  includeRequesters: boolean;
  taskDetailsWidth: number;
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
}

const COOKIE_NAME = 'easy-kanban-user-prefs';
const COOKIE_EXPIRY_DAYS = 365;

// Default preferences
export const DEFAULT_PREFERENCES: UserPreferences = {
  taskViewMode: 'expand', // Default to expand
  isSearchActive: false, // Default to no search active
  isAdvancedSearchExpanded: false, // Default to collapsed (basic search)
  selectedTaskId: null, // Default to no task selected
  selectedMembers: [], // Default to no members selected
  includeAssignees: true, // Default to include assignees (maintains current behavior)
  includeWatchers: false, // Default to not include watchers
  includeCollaborators: false, // Default to not include collaborators
  includeRequesters: false, // Default to not include requesters
  taskDetailsWidth: 480, // Default width in pixels (30rem equivalent)
  searchFilters: {
    text: '',
    dateFrom: '',
    dateTo: '',
    dueDateFrom: '',
    dueDateTo: '',
    selectedMembers: [],
    selectedPriorities: [],
    selectedTags: []
  }
};

// Save preferences to cookie
export const saveUserPreferences = (preferences: UserPreferences): void => {
  try {
    const prefsJson = JSON.stringify(preferences);
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + COOKIE_EXPIRY_DAYS);
    
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(prefsJson)}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Strict`;
  } catch (error) {
    console.error('Failed to save user preferences:', error);
  }
};

// Load preferences from cookie
export const loadUserPreferences = (): UserPreferences => {
  try {
    const cookies = document.cookie.split(';');
    const prefsCookie = cookies.find(cookie => 
      cookie.trim().startsWith(`${COOKIE_NAME}=`)
    );
    
    if (prefsCookie) {
      const prefsJson = decodeURIComponent(prefsCookie.split('=')[1]);
      const loadedPrefs = JSON.parse(prefsJson);
      
      // Merge with defaults to handle missing properties in old cookies
      return {
        ...DEFAULT_PREFERENCES,
        ...loadedPrefs,
        searchFilters: {
          ...DEFAULT_PREFERENCES.searchFilters,
          ...loadedPrefs.searchFilters,
          // Ensure text is never null
          text: loadedPrefs.searchFilters?.text || ''
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
  value: UserPreferences[K]
): void => {
  const currentPrefs = loadUserPreferences();
  const updatedPrefs = { ...currentPrefs, [key]: value };
  saveUserPreferences(updatedPrefs);
};
