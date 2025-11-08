import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { login } from '../api';
import { Copy, Check } from 'lucide-react';

interface LoginProps {
  onLogin: (userData: any, token: string) => Promise<void>;
  siteSettings?: any;
  hasDefaultAdmin?: boolean;
  intendedDestination?: string | null;
  onForgotPassword?: () => void;
}

export default function Login({ onLogin, siteSettings, hasDefaultAdmin = true, intendedDestination, onForgotPassword }: LoginProps) {
  const { t, i18n } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Get current language for toggle
  // Note: i18next LanguageDetector automatically detects browser language on initial load
  // and saves it to localStorage. The language is already set when this component mounts.
  const currentLanguage = i18n.language || 'en';
  
  // Handle language toggle on login page
  // For non-authenticated users: Changes language and saves to localStorage only
  // This has no effect until user logs in - then App.tsx will read localStorage and save to DB
  const handleLanguageToggle = async () => {
    const newLanguage = currentLanguage === 'en' ? 'fr' : 'en';
    await i18n.changeLanguage(newLanguage);
    // i18next automatically saves to localStorage, which will be used when user logs in
  };
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(false);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [adminCredentials, setAdminCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [backendAvailable, setBackendAvailable] = useState<boolean>(true);
  const [checkingBackend, setCheckingBackend] = useState<boolean>(true);
  
  // Copy to clipboard function
  const copyToClipboard = async (text: string, itemId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItem(itemId);
      setTimeout(() => setCopiedItem(null), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  // Check if demo mode is enabled
  const isDemoMode = process.env.DEMO_ENABLED === 'true';

  // Check backend availability on mount and periodically
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 3;
    let retryTimeout: NodeJS.Timeout;

    const checkBackendHealth = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const response = await fetch('/api/settings', { 
          signal: controller.signal,
          cache: 'no-store'
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          setBackendAvailable(true);
          setCheckingBackend(false);
          retryCount = 0; // Reset retry count on success
        } else {
          throw new Error('Backend responded with error');
        }
      } catch (error) {
        console.error('Backend health check failed:', error);
        retryCount++;
        
        if (retryCount >= maxRetries) {
          setBackendAvailable(false);
          setCheckingBackend(false);
        } else {
          // Retry after delay (exponential backoff: 2s, 4s, 8s)
          const delay = Math.min(2000 * Math.pow(2, retryCount - 1), 8000);
          retryTimeout = setTimeout(checkBackendHealth, delay);
        }
      }
    };

    checkBackendHealth();

    // Cleanup timeout on unmount
    return () => {
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, []);

  // Fetch admin credentials only if demo mode is enabled
  useEffect(() => {
    if (!isDemoMode || !backendAvailable) {
      setAdminCredentials(null);
      return;
    }

    const fetchAdminCredentials = async () => {
      try {
        const response = await fetch('/api/auth/demo-credentials');
        if (response.ok) {
          const credentials = await response.json();
          setAdminCredentials(credentials.admin);
        }
      } catch (error) {
        console.error('Failed to fetch admin credentials:', error);
        // Fallback to default credentials
        setAdminCredentials({
          email: 'admin@kanban.local',
          password: 'admin'
        });
      }
    };

    fetchAdminCredentials();
  }, [isDemoMode, backendAvailable]);

  // Check for token expiration redirect
  useEffect(() => {
    const tokenExpired = sessionStorage.getItem('tokenExpiredRedirect');
    if (tokenExpired === 'true') {
      setError(t('login.sessionExpired'));
      sessionStorage.removeItem('tokenExpiredRedirect');
    }
  }, [t]);

  // Check for OAuth errors in URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');
    
    if (errorParam) {
      let errorMessage = t('login.loginFailed');
      
      switch (errorParam) {
        case 'account_deactivated':
          errorMessage = t('login.accountDeactivated');
          break;
        case 'user_not_invited':
          errorMessage = t('login.accessDenied');
          break;
        case 'oauth_failed':
          errorMessage = t('login.oauthFailed');
          break;
        case 'oauth_not_configured':
          errorMessage = t('login.oauthNotConfigured');
          break;
        case 'oauth_userinfo_failed':
          errorMessage = t('login.oauthUserinfoFailed');
          break;
      }
      
      setError(errorMessage);
      
      // Clean up the URL by removing the error parameter
      const newUrl = new URL(window.location);
      newUrl.searchParams.delete('error');
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  // Check if Google OAuth is configured
  useEffect(() => {
    const checkGoogleOAuth = async () => {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const settings = await response.json();
          // Only check for GOOGLE_CLIENT_ID (which is safe to be public)
          // The server will validate the complete OAuth config when actually used
          setGoogleOAuthEnabled(!!settings.GOOGLE_CLIENT_ID);
        }
      } catch (error) {
        console.warn('Could not check Google OAuth status:', error);
      }
    };
    
    checkGoogleOAuth();
  }, []);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await login(email, password);
      await onLogin(response.user, response.token);
    } catch (error: any) {
      setError(error.response?.data?.error || t('login.loginFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!googleOAuthEnabled) {
      setError('Google OAuth is not configured. Please contact an administrator.');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      // Store intended destination before OAuth redirect
      if (intendedDestination) {
        localStorage.setItem('oauthIntendedDestination', intendedDestination);
      } else {
        // Clear any stale intended destination for normal login
        localStorage.removeItem('oauthIntendedDestination');
      }

      // Redirect to Google OAuth
      const response = await fetch('/api/auth/google/url');
      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url;
      } else {
        throw new Error('Failed to get Google OAuth URL');
      }
    } catch (error: any) {
      setError('Google sign-in failed. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative">
      {/* Language Toggle - Top Right */}
      <div className="absolute top-4 right-4">
        <button
          onClick={handleLanguageToggle}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md transition-colors border border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500"
          title={currentLanguage === 'en' ? 'Switch to French' : 'Passer en anglais'}
        >
          {currentLanguage === 'en' ? 'FR' : 'EN'}
        </button>
      </div>
      
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto h-12 w-12 bg-blue-600 rounded-full flex items-center justify-center">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            {t('login.signInToAccount')}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            {t('login.welcome')}
          </p>
        </div>
        
        {/* Backend Unavailable Message */}
        {!backendAvailable && !checkingBackend && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-600 p-6 rounded-lg">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-yellow-400 dark:text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  {t('login.systemUnavailable')}
                </h3>
                <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                  <p>
                    {t('login.systemUnavailableMessage')}
                  </p>
                  <p className="mt-2">
                    {t('login.systemUnavailableContact')}
                  </p>
                </div>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-yellow-800 dark:text-yellow-200 bg-yellow-100 dark:bg-yellow-900/40 hover:bg-yellow-200 dark:hover:bg-yellow-900/60 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                  >
                    <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {t('login.retryConnection')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading Spinner while checking backend */}
        {checkingBackend && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 dark:border-blue-600 p-6 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="animate-spin h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  {t('login.connectingToServer')}
                </p>
              </div>
            </div>
          </div>
        )}
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit} style={{ display: backendAvailable ? 'block' : 'none' }}>
          <div className="rounded-md shadow-sm -space-y-px bg-white dark:bg-gray-800 p-6 rounded-lg">
            <div>
              <label htmlFor="email" className="sr-only">
                {t('login.emailAddress')}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder={t('login.emailAddress')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                {t('login.password')}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder={t('login.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              {t('login.clearSession')}
            </button>
          </div>

          <div className="space-y-3">
            <button
              type="submit"
              disabled={isLoading}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white ${
                isLoading 
                  ? 'bg-blue-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
              }`}
            >
              {isLoading ? (
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : null}
              {isLoading ? t('login.loading') : t('login.submit')}
            </button>
            
            {/* Google Sign-In Button - Only show if OAuth is configured */}
            {googleOAuthEnabled && (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {t('login.signInWithGoogle')}
              </button>
            )}
          </div>

          {/* Forgot Password Link */}
          {onForgotPassword && (
            <div className="text-center">
              <button
                type="button"
                onClick={onForgotPassword}
                className="text-sm text-blue-600 hover:text-blue-500 underline"
              >
                {t('login.forgotYourPassword')}
              </button>
            </div>
          )}

          {isDemoMode && hasDefaultAdmin && adminCredentials && (
            <div className="text-center text-sm text-gray-600">
              <p className="font-semibold mb-2">{t('login.demoCredentials')}</p>
              <div className="space-y-2">
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <p className="text-xs font-medium text-blue-800 mb-2">Admin Account</p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-blue-700">{adminCredentials.email}</span>
                      <button
                        onClick={() => copyToClipboard(adminCredentials.email, 'admin-email')}
                        className="ml-2 p-1 hover:bg-blue-100 rounded transition-colors"
                        title={t('login.copyEmail')}
                      >
                        {copiedItem === 'admin-email' ? (
                          <Check className="w-3 h-3 text-green-600" />
                        ) : (
                          <Copy className="w-3 h-3 text-blue-600" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-blue-700">{adminCredentials.password}</span>
                      <button
                        onClick={() => copyToClipboard(adminCredentials.password, 'admin-password')}
                        className="ml-2 p-1 hover:bg-blue-100 rounded transition-colors"
                        title={t('login.copyPassword')}
                      >
                        {copiedItem === 'admin-password' ? (
                          <Check className="w-3 h-3 text-green-600" />
                        ) : (
                          <Copy className="w-3 h-3 text-blue-600" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
