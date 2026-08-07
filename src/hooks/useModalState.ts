/**
 * Hook for managing modal state
 */

import { useCallback, useState } from 'react';

export type ProfileInitialFocus = 'displayName' | 'bio';

export interface UseModalStateReturn {
  showHelpModal: boolean;
  setShowHelpModal: (show: boolean) => void;
  showProfileModal: boolean;
  setShowProfileModal: (show: boolean) => void;
  /** Where to focus when Profile opens (reset to displayName on close). */
  profileInitialFocus: ProfileInitialFocus;
  openProfileModal: (focus?: ProfileInitialFocus) => void;
  closeProfileModal: () => void;
  isProfileBeingEdited: boolean;
  setIsProfileBeingEdited: (editing: boolean) => void;
}

export const useModalState = (): UseModalStateReturn => {
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileInitialFocus, setProfileInitialFocus] =
    useState<ProfileInitialFocus>('displayName');
  const [isProfileBeingEdited, setIsProfileBeingEdited] = useState(false);

  const openProfileModal = useCallback((focus: ProfileInitialFocus = 'displayName') => {
    setProfileInitialFocus(focus);
    setShowProfileModal(true);
  }, []);

  const closeProfileModal = useCallback(() => {
    setShowProfileModal(false);
    setProfileInitialFocus('displayName');
  }, []);

  return {
    showHelpModal,
    setShowHelpModal,
    showProfileModal,
    setShowProfileModal,
    profileInitialFocus,
    openProfileModal,
    closeProfileModal,
    isProfileBeingEdited,
    setIsProfileBeingEdited,
  };
};
