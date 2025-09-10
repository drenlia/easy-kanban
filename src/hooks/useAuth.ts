import { useState, useEffect, useRef } from 'react';
import { CurrentUser, SiteSettings } from '../types';
import { DEFAULT_SITE_SETTINGS } from '../constants';
import * as api from '../api';

// Get intended destination from HTML capture
const getInitialIntendedDestination = (): string | null => {
  const captured = localStorage.getItem('capturedIntendedDestination');
  if (captured) {
    localStorage.removeItem('capturedIntendedDestination'); // Clean up
    return captured;
  }
  return null;
};

const INITIAL_INTENDED_DESTINATION = getInitialIntendedDestination();

interface UseAuthReturn {
  // State
  isAuthenticated: boolean;
  currentUser: CurrentUser | null;
  siteSettings: SiteSettings;
  hasDefaultAdmin: boolean | null;
  intendedDestination: string | null;
  justRedirected: boolean;
  
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
  const [authChecked, setAuthChecked] = useState(false); // Track if auth has been checked
  const isProcessingOAuthRef = useRef(false);
  const [justRedirected, setJustRedirected] = useState(false); // Prevent auto-board-selection after redirect
  
  // Intended destination for redirecting after login
  const [intendedDestination, setIntendedDestination] = useState<string | null>(INITIAL_INTENDED_DESTINATION);

  // Redirect to login if user is unauthenticated and has intended destination
  useEffect(() => {
    // Only redirect after auth has been checked
    if (!authChecked) {
      return;
    }
    
    if (!isAuthenticated && intendedDestination) {
      console.log('🎯 Unauthenticated user with intended destination - redirecting to login:', intendedDestination);
      // Store intended destination in localStorage for OAuth callback
      localStorage.setItem('oauthIntendedDestination', intendedDestination);
      // Redirect to root login page to avoid keeping pathname
      window.location.href = window.location.origin + '/#login';
    }
  }, [isAuthenticated, authChecked, intendedDestination]);

  // Authentication handlers
  const handleLogin = (userData: any, token: string) => {
    localStorage.setItem('authToken', token);
    setCurrentUser(userData);
    setIsAuthenticated(true);
    
    
    // Redirect to intended destination if available
    if (intendedDestination) {
      console.log('🎯 Local login redirect - intended destination:', intendedDestination);
      
      // Handle full path vs hash-only destinations
      if (intendedDestination.startsWith('/')) {
        // Full path with pathname + hash (e.g., "/project/#PROJ-00004#TASK-00001")
        // For local auth, check if we're already on the correct pathname
        if (window.location.pathname === intendedDestination.split('#')[0]) {
          // Same pathname, just update hash to avoid page reload
          const hashIndex = intendedDestination.indexOf('#');
          if (hashIndex !== -1) {
            const hashPart = intendedDestination.substring(hashIndex);
            window.location.hash = hashPart;
            // Clear intended destination after navigation completes
            setJustRedirected(true);
            setTimeout(() => {
              setIntendedDestination(null);
              // Clear the redirect flag after auto-board-selection would have run
              setTimeout(() => {
                setJustRedirected(false);
              }, 100);
            }, 200);
          } else {
            window.location.hash = '#kanban';
          }
        } else {
          // Different pathname, but still try to avoid page reload if possible
          // For local auth, try using history API first to avoid page reload
          try {
            window.history.pushState(null, '', intendedDestination);
            // Then trigger a hash change to make the app respond
            setTimeout(() => {
              const hashPart = intendedDestination.split('#')[1];
              if (hashPart) {
                window.location.hash = '#' + hashPart;
              }
              // Clear intended destination after navigation completes
              setJustRedirected(true);
              setTimeout(() => {
                setIntendedDestination(null);
                // Clear the redirect flag after auto-board-selection would have run
                setTimeout(() => {
                  setJustRedirected(false);
                }, 100);
              }, 200);
            }, 100);
          } catch (e) {
            // Fallback to full URL redirect if history API fails
            window.location.href = window.location.origin + intendedDestination;
          }
        }
      } else {
        // Hash-only destination (e.g., "#PROJ-00004#TASK-00001") 
        window.location.hash = intendedDestination;
        // Clear intended destination after navigation completes
        setJustRedirected(true);
        setTimeout(() => {
          setIntendedDestination(null);
          // Clear the redirect flag after auto-board-selection would have run
          setTimeout(() => {
            setJustRedirected(false);
          }, 100);
        }, 200);
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setCurrentUser(null);
    setIsAuthenticated(false);
    
    // Clear ALL intended destination storage to prevent stale redirects
    localStorage.removeItem('oauthIntendedDestination');
    localStorage.removeItem('capturedIntendedDestination');
    sessionStorage.removeItem('originalIntendedUrl');
    setIntendedDestination(null);
    setJustRedirected(false);
    
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
          setAuthChecked(true);
        })
        .catch(() => {
          // Clear all authentication data on error
          localStorage.removeItem('authToken');
          setIsAuthenticated(false);
          setCurrentUser(null);
          setAuthChecked(true);
          // Reset to kanban page to avoid admin page issues
          callbacks.onPageChange('kanban');
        });
    } else {
      // No token, user is not authenticated
      setAuthChecked(true);
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
        
        // Check for stored intended destination from before OAuth redirect
        const storedIntendedDestination = localStorage.getItem('oauthIntendedDestination');
        
        
        // Clear any activation context (no longer needed with simplified flow)
        localStorage.removeItem('activationContext');
        
        // Store the OAuth token
        localStorage.setItem('authToken', token);
        
        // Set OAuth processing flag to prevent interference BEFORE hash changes
        isProcessingOAuthRef.current = true;
        
        // Handle intended destination like regular login
        const destinationToUse = intendedDestination || storedIntendedDestination;
        
        
        if (destinationToUse) {
          
          // Handle full path vs hash-only destinations
          if (destinationToUse.startsWith('/')) {
            // Full path with pathname + hash (e.g., "/project/#PROJ-00004#TASK-00001")
            // Use full URL to preserve pathname
            window.location.href = window.location.origin + destinationToUse;
          } else {
            // Hash-only destination (e.g., "#PROJ-00004#TASK-00001") 
            window.location.hash = destinationToUse;
          }
          
          // Clear intended destination after redirect
          setJustRedirected(true);
          setIntendedDestination(null);
          localStorage.removeItem('oauthIntendedDestination'); // Clean up
          
          // Clear the redirect flag after auto-board-selection would have run
          setTimeout(() => {
            setJustRedirected(false);
          }, 300);
        } else {
          // No intended destination, go to default kanban
          window.location.hash = '#kanban';
          // Also clear any stale intended destination storage for normal login
          localStorage.removeItem('oauthIntendedDestination');
          localStorage.removeItem('capturedIntendedDestination');
          sessionStorage.removeItem('originalIntendedUrl');
        }
        
        // Force authentication check by triggering a state change
        setIsAuthenticated(false);
        
        // Fetch current user data immediately after OAuth
        api.getCurrentUser()
          .then(response => {
            setCurrentUser(response.user);
            setIsAuthenticated(true);
            isProcessingOAuthRef.current = false; // Clear OAuth processing flag
            console.log('✅ Google OAuth complete for:', response.user.email, 'auth_provider:', response.user.authProvider || 'google');
          })
          .catch(() => {
            // Fallback: just set authenticated and let the auth effect handle it
            setIsAuthenticated(true);
            isProcessingOAuthRef.current = false; // Clear OAuth processing flag
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


  return {
    // State
    isAuthenticated,
    currentUser,
    siteSettings,
    hasDefaultAdmin,
    intendedDestination,
    justRedirected,
    
    // Actions
    handleLogin,
    handleLogout,
    handleProfileUpdated,
    refreshSiteSettings,
    setSiteSettings,
  };
};
