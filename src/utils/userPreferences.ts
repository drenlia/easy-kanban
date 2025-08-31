import { Priority } from '../types';

export interface UserPreferences {
  isTasksShrunk: boolean;
  isSearchActive: boolean;
  searchFilters: {
    text: string;
    dateFrom: string;
    dateTo: string;
    selectedMembers: string[];
    selectedPriorities: Priority[];
  };
}

const COOKIE_NAME = 'easy-kanban-user-prefs';
const COOKIE_EXPIRY_DAYS = 365;

// Default preferences
export const DEFAULT_PREFERENCES: UserPreferences = {
  isTasksShrunk: false, // Default to expand
  isSearchActive: false, // Default to no search active
  searchFilters: {
    text: '',
    dateFrom: '',
    dateTo: '',
    selectedMembers: [],
    selectedPriorities: []
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
          ...loadedPrefs.searchFilters
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
