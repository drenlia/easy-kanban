/**
 * Utility function to create a lazy-loaded component with retry logic
 * This helps handle transient network failures when loading code-split modules
 */

import { lazy, ComponentType } from 'react';
import { tryHardRefreshForChunkMismatch } from './chunkMismatchReload';

interface RetryOptions {
  retries?: number;
  retryDelay?: number;
}

/**
 * Creates a lazy-loaded component with automatic retry on failure
 * @param importFn - Function that returns a promise for the module
 * @param options - Retry options (default: 2 soft retries, then hard refresh)
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  options: RetryOptions = {}
): React.LazyExoticComponent<T> {
  // Soft retries are for transient network blips; version mismatches hard-refresh
  // (capped globally) instead of looping every few seconds.
  const { retries = 2, retryDelay = 500 } = options;

  const retryImport = async (attempt = 1): Promise<{ default: T }> => {
    try {
      return await importFn();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const isServerError =
        errorMessage.includes('500') ||
        errorMessage.includes('/src/') ||
        errorMessage.includes('Internal Server Error');

      const isVersionMismatch =
        error instanceof TypeError &&
        errorMessage.includes('Failed to fetch dynamically imported module') &&
        !isServerError;

      if (isVersionMismatch) {
        if (attempt < retries) {
          console.warn(
            `⚠️ Failed to load module (attempt ${attempt}/${retries}), likely version mismatch. Retrying in ${retryDelay}ms...`,
            error
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          return retryImport(attempt + 1);
        }

        if (
          tryHardRefreshForChunkMismatch(
            'Version mismatch: old bundle references missing chunk files'
          )
        ) {
          return new Promise(() => {});
        }

        throw error;
      }

      if (
        attempt < retries &&
        error instanceof TypeError &&
        errorMessage.includes('Failed to fetch') &&
        !isServerError
      ) {
        console.warn(
          `Failed to load module (attempt ${attempt}/${retries}), retrying in ${retryDelay}ms...`,
          error
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return retryImport(attempt + 1);
      }

      throw error;
    }
  };

  return lazy(() => retryImport());
}
