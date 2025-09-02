import React from 'react';
import { Task, TeamMember, CurrentUser } from '../../types';
import TaskDetails from '../TaskDetails';
import HelpModal from '../HelpModal';
import Profile from '../Profile';

interface ModalManagerProps {
  // Task Details Modal
  selectedTask: Task | null;
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
}

const ModalManager: React.FC<ModalManagerProps> = ({
  selectedTask,
  members,
  onTaskClose,
  onTaskUpdate,
  showHelpModal,
  onHelpClose,
  showProfileModal,
  currentUser,
  onProfileClose,
  onProfileUpdated,
}) => {
  return (
    <>
      {/* Task Details Modal */}
      {selectedTask && (
        <div className="fixed top-0 right-0 h-full">
          <TaskDetails
            task={selectedTask}
            members={members}
            currentUser={currentUser}
            onClose={onTaskClose}
            onUpdate={onTaskUpdate}
          />
        </div>
      )}

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelpModal}
        onClose={onHelpClose}
      />

      {/* Profile Modal */}
      <Profile 
        isOpen={showProfileModal} 
        onClose={onProfileClose} 
        currentUser={currentUser ? {
          ...currentUser,
          displayName: members.find(m => m.user_id === currentUser?.id)?.name || `${currentUser?.firstName} ${currentUser?.lastName}`,
          // Ensure authProvider is explicitly set
          authProvider: currentUser?.authProvider || 'local'
        } : null}
        onProfileUpdated={onProfileUpdated}
      />
    </>
  );
};

export default ModalManager;
