/**
 * Hook for managing modal state
 */

import { useState } from 'react';

export interface UseModalStateReturn {
  showHelpModal: boolean;
  setShowHelpModal: (show: boolean) => void;
  showProfileModal: boolean;
  setShowProfileModal: (show: boolean) => void;
  isProfileBeingEdited: boolean;
  setIsProfileBeingEdited: (editing: boolean) => void;
}

export const useModalState = (): UseModalStateReturn => {
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isProfileBeingEdited, setIsProfileBeingEdited] = useState(false);

  return {
    showHelpModal,
    setShowHelpModal,
    showProfileModal,
    setShowProfileModal,
    isProfileBeingEdited,
    setIsProfileBeingEdited,
  };
};

