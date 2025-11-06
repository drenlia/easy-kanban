import React, { Suspense } from 'react';
import { Task, TeamMember, CurrentUser } from '../../types';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

// Lazy load modal components to reduce initial bundle size with retry logic
const TaskDetails = lazyWithRetry(() => import('../TaskDetails'));
const HelpModal = lazyWithRetry(() => import('../HelpModal'));
const Profile = lazyWithRetry(() => import('../Profile'));

interface ModalManagerProps {
  // Task Details Modal
  selectedTask: Task | null;
  taskDetailsOptions?: { scrollToComments?: boolean };
  members: TeamMember[];
  onTaskClose: () => void;
  onTaskUpdate: (task: Task) => Promise<void>;
  
  // Help Modal
  showHelpModal: boolean;
  onHelpClose: () => void;
  
  // Profile Modal
  showProfileModal: boolean;
  currentUser: CurrentUser | null;
  onProfileClose: () => void;
  onProfileUpdated: () => Promise<void>;
  isProfileBeingEdited: boolean;
  onProfileEditingChange: (isEditing: boolean) => void;
  onActivityFeedToggle?: (enabled: boolean) => void;
  onAccountDeleted?: () => void;
  siteSettings?: { [key: string]: string };
  boards?: any[];
}

const ModalManager: React.FC<ModalManagerProps> = ({
  selectedTask,
  taskDetailsOptions,
  members,
  onTaskClose,
  onTaskUpdate,
  showHelpModal,
  onHelpClose,
  showProfileModal,
  currentUser,
  onProfileClose,
  onProfileUpdated,
  isProfileBeingEdited,
  onProfileEditingChange,
  onActivityFeedToggle,
  onAccountDeleted,
  siteSettings,
  boards,
}) => {
  return (
    <>
      {/* Task Details Modal */}
      {selectedTask && (
        <Suspense fallback={null}>
          <TaskDetails
            task={selectedTask}
            members={members}
            currentUser={currentUser}
            onClose={onTaskClose}
            onUpdate={onTaskUpdate}
            siteSettings={siteSettings}
            boards={boards}
            scrollToComments={taskDetailsOptions?.scrollToComments}
          />
        </Suspense>
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <Suspense fallback={null}>
          <HelpModal
            isOpen={showHelpModal}
            onClose={onHelpClose}
          />
        </Suspense>
      )}

      {/* Profile Modal */}
      {showProfileModal && (
        <Suspense fallback={null}>
          <Profile 
            isOpen={showProfileModal} 
            onClose={onProfileClose} 
            currentUser={currentUser ? {
              ...currentUser,
              // Only update displayName from members if not currently being edited
              displayName: isProfileBeingEdited 
                ? currentUser.displayName // Keep current displayName while editing
                : members.find(m => m.user_id === currentUser?.id)?.name || `${currentUser?.firstName} ${currentUser?.lastName}`,
              // Ensure authProvider is explicitly set
              authProvider: currentUser?.authProvider || 'local'
            } : null}
            onProfileUpdated={onProfileUpdated}
            isProfileBeingEdited={isProfileBeingEdited}
            onProfileEditingChange={onProfileEditingChange}
            onActivityFeedToggle={onActivityFeedToggle}
            onAccountDeleted={onAccountDeleted}
          />
        </Suspense>
      )}
    </>
  );
};

export default ModalManager;
