import { useState, useEffect } from 'react';
import { CurrentUser, SiteSettings } from '../types';
import { DEFAULT_SITE_SETTINGS } from '../constants';
import * as api from '../api';

interface UseAuthReturn {
  // State
  isAuthenticated: boolean;
  currentUser: CurrentUser | null;
  siteSettings: SiteSettings;
  hasDefaultAdmin: boolean | null;
  intendedDestination: string | null;
  
  // Actions
  handleLogin: (userData: any, token: string) => void;
  handleLogout: () => void;
  handleProfileUpdated: () => Promise<void>;
  refreshSiteSettings: () => Promise<void>;
  setSiteSettings: (settings: SiteSettings) => void;
}

interface UseAuthCallbacks {
  onDataClear: () => void;
  onAdminRefresh: () => void;
  onPageChange: (page: 'kanban' | 'admin') => void;
  onMembersRefresh: () => Promise<void>;
}

export const useAuth = (callbacks: UseAuthCallbacks): UseAuthReturn => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [hasDefaultAdmin, setHasDefaultAdmin] = useState<boolean | null>(null);
  const [intendedDestination, setIntendedDestination] = useState<string | null>(null);

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
    callbacks.onPageChange('kanban'); // Reset to kanban page
    callbacks.onDataClear(); // Clear all app data
    window.location.hash = ''; // Clear URL hash
  };

  const handleProfileUpdated = async () => {
    try {
      // Refresh current user data to get updated avatar
      const response = await api.getCurrentUser();
      setCurrentUser(response.user);
      
      // Also refresh members to get updated display names
      await callbacks.onMembersRefresh();
      
      // If current user is admin, also refresh admin data to show updated display names
      if (response.user.roles?.includes('admin')) {
        callbacks.onAdminRefresh();
      }
    } catch (error) {
      console.error('Failed to refresh profile data:', error);
    }
  };

  const refreshSiteSettings = async () => {
    try {
      const settings = await api.getSettings();
      setSiteSettings(settings);
    } catch (error) {
      console.error('Failed to refresh site settings:', error);
    }
  };

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
          callbacks.onPageChange('kanban');
        });
    }
  }, []); // Only run once on mount

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

  // Handle Google OAuth callback with token - MUST run before routing
  useEffect(() => {
    // Check for token in URL hash (for OAuth callback)
    const hash = window.location.hash;
      
    // Skip password reset and account activation tokens - only handle OAuth tokens
    if (hash.includes('token=') && !hash.includes('reset-password') && !hash.includes('activate-account')) {
      const tokenMatch = hash.match(/token=([^&]+)/);
      const errorMatch = hash.match(/error=([^&]+)/);
      
      if (tokenMatch) {
        const token = tokenMatch[1];
        
        // Clear any activation context (no longer needed with simplified flow)
        localStorage.removeItem('activationContext');
        
        // Store the OAuth token
        localStorage.setItem('authToken', token);
        
        // Clear the URL hash and redirect to kanban
        window.location.hash = '#kanban';
        
        // Force authentication check by triggering a state change
        setIsAuthenticated(false);
        
        // Fetch current user data immediately after OAuth
        api.getCurrentUser()
          .then(response => {
            setCurrentUser(response.user);
            setIsAuthenticated(true);
            console.log('✅ Google OAuth complete for:', response.user.email, 'auth_provider:', response.user.authProvider || 'google');
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

  // Handle authentication state changes for intended destination
  useEffect(() => {
    const handleHashChange = () => {
      const fullHash = window.location.hash;
      
      // Store intended destination if user is not authenticated
      if (!isAuthenticated && fullHash && fullHash !== '#login') {
        setIntendedDestination(fullHash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [isAuthenticated]);

  return {
    // State
    isAuthenticated,
    currentUser,
    siteSettings,
    hasDefaultAdmin,
    intendedDestination,
    
    // Actions
    handleLogin,
    handleLogout,
    handleProfileUpdated,
    refreshSiteSettings,
    setSiteSettings,
  };
};
