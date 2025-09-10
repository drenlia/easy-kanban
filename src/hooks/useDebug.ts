import { useMemo } from 'react';

/**
 * Hook to check if debug mode is enabled via URL parameter
 */
export const useDebug = (): boolean => {
  return useMemo(() => {
    return new URLSearchParams(window.location.search).get('debug') === 'true';
  }, []);
};
