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
      // Check if this is a version mismatch error (old bundle trying to load non-existent chunk)
      const isVersionMismatch = error instanceof TypeError && 
        (error.message.includes('Failed to fetch dynamically imported module') ||
         error.message.includes('Failed to fetch'));
      
      if (isVersionMismatch) {
        // If we've exhausted retries, this is likely a version mismatch
        // Force a hard reload to get the new bundles
        if (attempt >= retries) {
          console.error('❌ Version mismatch detected: Old bundle references non-existent chunk files');
          console.error('   Forcing hard reload to get new JavaScript bundles...');
          
          // Force a hard reload (bypass cache) to ensure we get the new JavaScript bundles
          // Remove any existing query parameters first to avoid interfering with asset loading
          const baseUrl = window.location.origin + window.location.pathname;
          window.location.href = baseUrl;
          
          // Return a promise that never resolves (page will reload before this completes)
          return new Promise(() => {});
        }
        
        // Retry with a longer delay for version mismatch errors
        console.warn(`⚠️ Failed to load module (attempt ${attempt}/${retries}), likely version mismatch. Retrying in ${retryDelay * 2}ms...`, error);
        await new Promise(resolve => setTimeout(resolve, retryDelay * 2));
        return retryImport(attempt + 1);
      }
      
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

