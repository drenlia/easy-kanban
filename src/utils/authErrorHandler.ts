/**
 * Centralized authentication error handler
 * Handles token expiration, invalid tokens, and missing tokens
 * Can be called from anywhere in the application
 */

let logoutCallback: (() => void) | null = null;

/**
 * Register a logout callback function (typically from useAuth hook)
 */
export const registerLogoutCallback = (callback: () => void) => {
  logoutCallback = callback;
};

/**
 * Unregister the logout callback
 */
export const unregisterLogoutCallback = () => {
  logoutCallback = null;
};

/**
 * Check if user was previously authenticated (had a token)
 */
const wasAuthenticated = (): boolean => {
  // Check if there's any indication the user was logged in
  // We check sessionStorage for a flag that indicates we had a token
  return sessionStorage.getItem('hadAuthToken') === 'true' || 
         localStorage.getItem('authToken') !== null;
};

/**
 * Mark that user had a token (call this after successful login)
 */
export const markAsAuthenticated = () => {
  sessionStorage.setItem('hadAuthToken', 'true');
};

/**
 * Clear authentication markers
 */
const clearAuthMarkers = () => {
  sessionStorage.removeItem('hadAuthToken');
  localStorage.removeItem('authToken');
};

/**
 * Handle authentication errors - redirects to login if user was previously authenticated
 * @param reason - Reason for the auth error (for logging)
 * @param forceRedirect - Force redirect even if user wasn't authenticated (default: false)
 */
export const handleAuthError = (reason: string = 'Authentication error', forceRedirect: boolean = false) => {
  const hadToken = wasAuthenticated();
  
  if (!hadToken && !forceRedirect) {
    // User was never authenticated, don't redirect
    console.log(`🔑 ${reason} - user not authenticated, skipping redirect`);
    return;
  }

  console.log(`🔑 ${reason} - redirecting to login`);
  
  // Clear authentication state
  clearAuthMarkers();
  
  // If we have a logout callback, use it (properly clears all state)
  if (logoutCallback) {
    try {
      logoutCallback();
    } catch (error) {
      console.error('Error calling logout callback:', error);
      // Fallback to manual redirect
      window.location.replace(window.location.origin + '/#login');
    }
  } else {
    // Fallback: manual redirect
    // Set a flag to prevent reload loops
    sessionStorage.setItem('tokenExpiredRedirect', 'true');
    
    // Redirect to login
    window.location.replace(window.location.origin + '/#login');
  }
};

