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
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Only treat as version mismatch if it's a 404 (missing chunk file), not server errors (500, etc.)
      // Server errors indicate deployment issues, not version mismatches
      const isServerError = errorMessage.includes('500') || 
                           errorMessage.includes('/src/') ||
                           errorMessage.includes('Internal Server Error');
      
      // Check if this is a version mismatch error (old bundle trying to load non-existent chunk)
      const isVersionMismatch = error instanceof TypeError && 
        errorMessage.includes('Failed to fetch dynamically imported module') &&
        !isServerError;
      
      if (isVersionMismatch) {
        // If we've exhausted retries, this is likely a version mismatch
        // Force a hard reload to get the new bundles
        if (attempt >= retries) {
          console.error('❌ Version mismatch detected: Old bundle references non-existent chunk files');
          console.error('   Forcing hard reload to get new JavaScript bundles...');
          
          // Force a hard reload (bypass cache) to ensure we get the new JavaScript bundles
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
      
      // If this is a network error (but not a server error) and we have retries left, try again
      if (attempt < retries && 
          error instanceof TypeError && 
          errorMessage.includes('Failed to fetch') &&
          !isServerError) {
        console.warn(`Failed to load module (attempt ${attempt}/${retries}), retrying in ${retryDelay}ms...`, error);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return retryImport(attempt + 1);
      }
      
      // Re-throw the error if we're out of retries, it's a server error, or it's a different error
      throw error;
    }
  };

  return lazy(() => retryImport());
}

