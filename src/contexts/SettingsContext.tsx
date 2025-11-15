import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { getSettings, getPublicSettings } from '../api';
import websocketClient from '../services/websocketClient';

interface SiteSettings {
  [key: string]: string | undefined;
}

interface SettingsContextType {
  siteSettings: SiteSettings;
  systemSettings: SiteSettings;
  isLoading: boolean;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

interface SettingsProviderProps {
  children: ReactNode;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({});
  const [systemSettings, setSystemSettings] = useState<SiteSettings>({});
  const [isLoading, setIsLoading] = useState(true);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Check authentication status by checking for token
  const checkIsAuthenticated = useCallback(() => {
    return !!localStorage.getItem('authToken');
  }, []);

  // Track if a fetch is in progress to prevent concurrent fetches
  const isFetchingRef = useRef(false);
  
  // Check if user is admin by checking token payload
  const checkIsAdmin = useCallback(() => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.log('🔍 [SettingsContext] checkIsAdmin: No token found');
        return false;
      }
      
      // Decode JWT token to check roles (simple base64 decode, no verification needed for client-side check)
      const payload = JSON.parse(atob(token.split('.')[1]));
      const isAdmin = payload.roles && Array.isArray(payload.roles) && payload.roles.includes('admin');
      console.log('🔍 [SettingsContext] checkIsAdmin:', {
        hasToken: !!token,
        roles: payload.roles,
        isAdmin
      });
      return isAdmin;
    } catch (error) {
      console.error('🔍 [SettingsContext] checkIsAdmin error:', error);
      return false;
    }
  }, []);
  
  // Fetch settings (public or authenticated based on auth status and role)
  const fetchSettings = useCallback(async () => {
    // Prevent concurrent fetches
    if (isFetchingRef.current) {
      console.log('⏸️ [SettingsContext] Fetch already in progress, skipping...');
      return {};
    }
    
    isFetchingRef.current = true;
    try {
      const isAuthenticated = checkIsAuthenticated();
      let settings: SiteSettings;
      if (isAuthenticated) {
        // Check if user is admin - only admins should call /api/admin/settings
        const isAdmin = checkIsAdmin();
        console.log('📥 [SettingsContext] fetchSettings:', {
          isAuthenticated,
          isAdmin,
          endpoint: isAdmin ? '/api/admin/settings' : '/api/settings (public)'
        });
        if (isAdmin) {
          // Use admin endpoint (includes all settings)
          settings = await getSettings();
        } else {
          // Non-admin authenticated users use public endpoint (same as logged-out users)
          // The public endpoint returns limited settings but doesn't require admin role
          settings = await getPublicSettings();
        }
      } else {
        // Use public endpoint (no auth required)
        console.log('📥 [SettingsContext] fetchSettings: Not authenticated, using public endpoint');
        settings = await getPublicSettings();
      }
      
      setSiteSettings(settings);
      setSystemSettings(settings); // Keep both for backwards compatibility
      setIsLoading(false);
      return settings;
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      setIsLoading(false);
      return {};
    } finally {
      isFetchingRef.current = false;
    }
  }, [checkIsAuthenticated, checkIsAdmin]);

  // Initial fetch - only once when component mounts
  // Use a ref to ensure we only fetch once, even in React StrictMode
  const hasFetchedRef = useRef(false);
  useEffect(() => {
    if (!hasFetchedRef.current && !hasInitialized) {
      hasFetchedRef.current = true;
      fetchSettings().then(() => {
        setHasInitialized(true);
      });
    }
  }, [hasInitialized]); // Only depend on hasInitialized, not fetchSettings

  // Listen for auth token changes to refetch with correct endpoint
  // Note: storage event only fires for cross-tab changes, so we also listen for custom events
  useEffect(() => {
    if (!hasInitialized) return;

    // Debounce timer to prevent rapid successive refetches
    let debounceTimer: NodeJS.Timeout | null = null;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'authToken') {
        // Auth status changed (from another tab/window), refetch settings with correct endpoint
        console.log('📨 [SettingsContext] Auth token changed (storage event), refetching settings...');
        // Clear any pending debounce
        if (debounceTimer) clearTimeout(debounceTimer);
        // Debounce to prevent rapid successive calls
        debounceTimer = setTimeout(() => {
          fetchSettings();
        }, 100);
      }
    };

    const handleAuthTokenChanged = (e: CustomEvent) => {
      // Auth status changed (same tab - logout/login), refetch settings with correct endpoint
      const hasToken = e.detail?.hasToken !== false; // Default to true if not specified
      console.log('📨 [SettingsContext] Auth token changed (custom event), refetching settings...', {
        hasToken,
        willCheckAdmin: hasToken
      });
      // Clear any pending debounce
      if (debounceTimer) clearTimeout(debounceTimer);
      // Debounce to prevent rapid successive calls, but ensure token is available
      debounceTimer = setTimeout(() => {
        // Double-check token is available before fetching (important for OAuth flow)
        if (hasToken && !localStorage.getItem('authToken')) {
          console.warn('📨 [SettingsContext] Token not yet available, retrying in 50ms...');
          setTimeout(() => fetchSettings(), 50);
        } else {
          fetchSettings();
        }
      }, 100);
    };

    // Listen for cross-tab changes (storage event)
    window.addEventListener('storage', handleStorageChange);
    // Listen for same-tab changes (custom event from logout/login)
    window.addEventListener('auth-token-changed', handleAuthTokenChanged as EventListener);
    
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('auth-token-changed', handleAuthTokenChanged as EventListener);
    };
  }, [hasInitialized, fetchSettings]);

  // Refresh settings manually (for manual refresh button, etc.)
  const refreshSettings = useCallback(async () => {
    await fetchSettings();
  }, [fetchSettings]);

  // Listen for WebSocket settings updates (only when authenticated)
  useEffect(() => {
    if (!hasInitialized) return;
    
    // Only listen to WebSocket events when authenticated (WebSocket only connects when logged in)
    const isAuthenticated = checkIsAuthenticated();
    if (!isAuthenticated) {
      // When logged out, just use the fetched public settings - no WebSocket needed
      return;
    }

    const handleSettingsUpdate = (data: any) => {
      console.log('📨 [SettingsContext] Settings updated via WebSocket:', data);
      
      // Update the specific setting directly from WebSocket data
      if (data.key && data.value !== undefined) {
        setSiteSettings(prev => ({
          ...prev,
          [data.key]: data.value
        }));
        setSystemSettings(prev => ({
          ...prev,
          [data.key]: data.value
        }));
      } else {
        // Fallback: refresh all settings if WebSocket data is incomplete
        console.warn('📨 [SettingsContext] WebSocket data incomplete, refreshing all settings');
        fetchSettings();
      }
    };

    websocketClient.onSettingsUpdated(handleSettingsUpdate);

    return () => {
      websocketClient.offSettingsUpdated(handleSettingsUpdate);
    };
  }, [hasInitialized, fetchSettings, checkIsAuthenticated]);

  const value: SettingsContextType = {
    siteSettings,
    systemSettings,
    isLoading,
    refreshSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

// Hook to use settings context
export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

