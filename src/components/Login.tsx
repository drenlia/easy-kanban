import React, { useState, useEffect } from 'react';
import { login } from '../api';
import { Copy, Check } from 'lucide-react';

interface LoginProps {
  onLogin: (userData: any, token: string) => void;
  siteSettings?: any;
  hasDefaultAdmin?: boolean;
  hasDemoUser?: boolean;
  intendedDestination?: string | null;
  onForgotPassword?: () => void;
}

export default function Login({ onLogin, siteSettings, hasDefaultAdmin = true, hasDemoUser = true, intendedDestination, onForgotPassword }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(false);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [demoCredentials, setDemoCredentials] = useState<{
    admin: { email: string; password: string };
    demo: { email: string; password: string };
  } | null>(null);
  
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

  // Fetch demo credentials only if demo mode is enabled
  useEffect(() => {
    if (!isDemoMode) {
      setDemoCredentials(null);
      return;
    }

    const fetchDemoCredentials = async () => {
      try {
        const response = await fetch('/api/auth/demo-credentials');
        if (response.ok) {
          const credentials = await response.json();
          setDemoCredentials(credentials);
        }
      } catch (error) {
        console.error('Failed to fetch demo credentials:', error);
        // Fallback to default credentials
        setDemoCredentials({
          admin: { email: 'admin@kanban.local', password: 'admin' },
          demo: { email: 'demo@kanban.local', password: 'demo' }
        });
      }
    };

    fetchDemoCredentials();
  }, [isDemoMode]);

  // Check for token expiration redirect
  useEffect(() => {
    const tokenExpired = sessionStorage.getItem('tokenExpiredRedirect');
    if (tokenExpired === 'true') {
      setError('Your session has expired. Please log in again.');
      sessionStorage.removeItem('tokenExpiredRedirect');
    }
  }, []);

  // Check for OAuth errors in URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');
    
    if (errorParam) {
      let errorMessage = 'Login failed. Please try again.';
      
      switch (errorParam) {
        case 'account_deactivated':
          errorMessage = 'Your account has been deactivated. Please contact an administrator.';
          break;
        case 'user_not_invited':
          errorMessage = 'Access denied. You must be invited to use this system.';
          break;
        case 'oauth_failed':
          errorMessage = 'Authentication failed. Please try again.';
          break;
        case 'oauth_not_configured':
          errorMessage = 'Google sign-in is not properly configured. Please contact an administrator.';
          break;
        case 'oauth_userinfo_failed':
          errorMessage = 'Failed to retrieve user information from Google. Please try again.';
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
      onLogin(response.user, response.token);
    } catch (error: any) {
      setError(error.response?.data?.error || 'Login failed. Please try again.');
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
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto h-12 w-12 bg-blue-600 rounded-full flex items-center justify-center">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Welcome to Easy Kanban
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px bg-white dark:bg-gray-800 p-6 rounded-lg">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
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
              Clear Session & Reload
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
              {isLoading ? 'Signing in...' : 'Sign in'}
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
                Sign in with Google
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
                Forgot your password?
              </button>
            </div>
          )}

          {isDemoMode && (hasDefaultAdmin || hasDemoUser) && demoCredentials && (
            <div className="text-center text-sm text-gray-600">
              <p className="font-semibold mb-2">Demo Credentials:</p>
              <div className="space-y-2">
                {hasDefaultAdmin && (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <p className="text-xs font-medium text-blue-800 mb-2">Admin Account</p>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-blue-700">{demoCredentials.admin.email}</span>
                        <button
                          onClick={() => copyToClipboard(demoCredentials.admin.email, 'admin-email')}
                          className="ml-2 p-1 hover:bg-blue-100 rounded transition-colors"
                          title="Copy email"
                        >
                          {copiedItem === 'admin-email' ? (
                            <Check className="w-3 h-3 text-green-600" />
                          ) : (
                            <Copy className="w-3 h-3 text-blue-600" />
                          )}
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-blue-700">{demoCredentials.admin.password}</span>
                        <button
                          onClick={() => copyToClipboard(demoCredentials.admin.password, 'admin-password')}
                          className="ml-2 p-1 hover:bg-blue-100 rounded transition-colors"
                          title="Copy password"
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
                )}
                {hasDemoUser && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3">
                    <p className="text-xs font-medium text-green-800 mb-2">Demo Account</p>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-green-700">{demoCredentials.demo.email}</span>
                        <button
                          onClick={() => copyToClipboard(demoCredentials.demo.email, 'demo-email')}
                          className="ml-2 p-1 hover:bg-green-100 rounded transition-colors"
                          title="Copy email"
                        >
                          {copiedItem === 'demo-email' ? (
                            <Check className="w-3 h-3 text-green-600" />
                          ) : (
                            <Copy className="w-3 h-3 text-green-600" />
                          )}
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-green-700">{demoCredentials.demo.password}</span>
                        <button
                          onClick={() => copyToClipboard(demoCredentials.demo.password, 'demo-password')}
                          className="ml-2 p-1 hover:bg-green-100 rounded transition-colors"
                          title="Copy password"
                        >
                          {copiedItem === 'demo-password' ? (
                            <Check className="w-3 h-3 text-green-600" />
                          ) : (
                            <Copy className="w-3 h-3 text-green-600" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
