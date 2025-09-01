import { useEffect } from 'react';

/**
 * Hook to handle keyboard shortcuts
 */
export const useKeyboardShortcuts = (onHelpModalOpen: () => void) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F1') {
        event.preventDefault();
        onHelpModalOpen();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onHelpModalOpen]);
};
