import { useState, useCallback } from 'react';
import { Task, CurrentUser } from '../types';
import { loadUserPreferences, getTaskDeleteConfirmSetting } from '../utils/userPreferences';

interface UseTaskDeleteConfirmationProps {
  currentUser: CurrentUser | null;
  systemSettings: { TASK_DELETE_CONFIRM?: string };
  onDelete: (taskId: string) => Promise<void>;
}

export const useTaskDeleteConfirmation = ({
  currentUser,
  systemSettings,
  onDelete
}: UseTaskDeleteConfirmationProps) => {
  const [confirmationTask, setConfirmationTask] = useState<Task | null>(null);
  const [confirmationPosition, setConfirmationPosition] = useState<{ top: number; left: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const shouldShowConfirmation = useCallback(() => {
    const userPrefs = loadUserPreferences(currentUser?.id);
    return getTaskDeleteConfirmSetting(userPrefs, systemSettings);
  }, [currentUser?.id, systemSettings]);

  const deleteTask = useCallback(async (task: Task | string, clickEvent?: React.MouseEvent) => {
    // Handle both task object and taskId string
    const taskObj = typeof task === 'string' ? { id: task } as Task : task;
    if (shouldShowConfirmation()) {
      // Calculate position from click event
      let position = { top: 100, left: 100 }; // Default position
      if (clickEvent) {
        const rect = (clickEvent.target as HTMLElement).getBoundingClientRect();
        position = {
          top: rect.bottom + window.scrollY + 5,
          left: rect.left + window.scrollX
        };
      }
      
      // Show confirmation dialog
      setConfirmationTask(taskObj);
      setConfirmationPosition(position);
    } else {
      // Delete immediately
      try {
        setIsDeleting(true);
        await onDelete(taskObj.id);
      } catch (error) {
        console.error('Failed to delete task:', error);
      } finally {
        setIsDeleting(false);
      }
    }
  }, [shouldShowConfirmation, onDelete]);

  const confirmDelete = useCallback(async () => {
    if (!confirmationTask) return;

    try {
      setIsDeleting(true);
      await onDelete(confirmationTask.id);
      setConfirmationTask(null);
      setConfirmationPosition(null);
    } catch (error) {
      console.error('Failed to delete task:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [confirmationTask, onDelete]);

  const cancelDelete = useCallback(() => {
    setConfirmationTask(null);
    setConfirmationPosition(null);
  }, []);

  return {
    // State
    confirmationTask,
    confirmationPosition,
    isDeleting,
    
    // Actions
    deleteTask,
    confirmDelete,
    cancelDelete,
    
    // Utility
    shouldShowConfirmation: shouldShowConfirmation()
  };
};

export default useTaskDeleteConfirmation;
