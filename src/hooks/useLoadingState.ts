import { useState, useCallback } from 'react';

export interface LoadingState {
  boards: boolean;
  tasks: boolean;
  members: boolean;
  columns: boolean;
  general: boolean;
}

export function useLoadingState() {
  const [loading, setLoading] = useState<LoadingState>({
    boards: false,
    tasks: false,
    members: false,
    columns: false,
    general: false,
  });

  const setLoadingFor = useCallback((key: keyof LoadingState, value: boolean) => {
    setLoading(prev => ({ ...prev, [key]: value }));
  }, []);

  const withLoading = useCallback(async <T,>(
    key: keyof LoadingState,
    fn: () => Promise<T>
  ): Promise<T> => {
    setLoadingFor(key, true);
    try {
      return await fn();
    } finally {
      setLoadingFor(key, false);
    }
  }, [setLoadingFor]);

  return {
    loading,
    setLoadingFor,
    withLoading,
  };
}