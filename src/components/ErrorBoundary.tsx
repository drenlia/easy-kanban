import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

function isDemoMode(): boolean {
  try {
    // Vite envPrefix exposes DEMO_ENABLED; define may also rewrite process.env
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (import.meta as any)?.env?.DEMO_ENABLED;
    return meta === 'true' || process.env.DEMO_ENABLED === 'true';
  } catch {
    return process.env.DEMO_ENABLED === 'true';
  }
}

function shouldAutoRecover(error: Error | undefined): boolean {
  const msg = error?.message || '';
  // Corrupt session / wiped demo DB
  if (msg.includes('members.find is not a function')) return true;
  // React dispatcher gone (common when Vite/app container restarts under an open SPA tab)
  if (/Cannot read properties of null \(reading 'use(?:Memo|State|Effect|Callback|Ref|Context)'\)/.test(msg)) {
    return true;
  }
  // On the public demo, any hard crash during/after hourly reset should bounce to login
  if (isDemoMode()) return true;
  return false;
}

function recoverToLogin(): void {
  if (sessionStorage.getItem('ebRecovering') === '1') return;
  sessionStorage.setItem('ebRecovering', '1');
  try {
    localStorage.removeItem('authToken');
    sessionStorage.setItem('tokenExpiredRedirect', 'true');
  } catch {
    /* ignore */
  }
  // Full navigation clears broken module/React state better than reload alone
  setTimeout(() => {
    try {
      sessionStorage.removeItem('ebRecovering');
    } catch {
      /* ignore */
    }
    window.location.replace(`${window.location.origin}${window.location.pathname}#kanban`);
  }, 0);
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    if (shouldAutoRecover(error)) {
      recoverToLogin();
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Oops! Something went wrong</h2>
            <p className="text-gray-600 mb-4">
              We're sorry, but something unexpected happened. Please try refreshing the page.
            </p>
            <details className="mb-4">
              <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                Error details
              </summary>
              <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
                {this.state.error?.toString()}
              </pre>
            </details>
            <button
              onClick={() => recoverToLogin()}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
