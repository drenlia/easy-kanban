/**
 * Utility function to create a lazy-loaded component with retry logic
 * This helps handle transient network failures when loading code-split modules
 */

import { lazy, ComponentType } from 'react';

interface RetryOptions {
  retries?: number;
  retryDelay?: number;
}

/**
 * Creates a lazy-loaded component with automatic retry on failure
 * @param importFn - Function that returns a promise for the module
 * @param options - Retry options (default: 3 retries, 1000ms delay)
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  options: RetryOptions = {}
): React.LazyExoticComponent<T> {
  const { retries = 3, retryDelay = 1000 } = options;

  const retryImport = async (attempt = 1): Promise<{ default: T }> => {
    try {
      return await importFn();
    } catch (error) {
      // If this is a network error and we have retries left, try again
      if (attempt < retries && error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.warn(`Failed to load module (attempt ${attempt}/${retries}), retrying in ${retryDelay}ms...`, error);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return retryImport(attempt + 1);
      }
      // Re-throw the error if we're out of retries or it's a different error
      throw error;
    }
  };

  return lazy(() => retryImport());
}

