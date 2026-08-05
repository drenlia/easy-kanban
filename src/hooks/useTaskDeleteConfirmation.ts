import { useState, useCallback } from 'react';
import { Task, CurrentUser } from '../types';
import { loadUserPreferences, getTaskDeleteConfirmSetting } from '../utils/userPreferences';

interface UseTaskDeleteConfirmationProps {
  currentUser: CurrentUser | null;
  systemSettings: { TASK_DELETE_CONFIRM?: string };
  onDelete: (taskId: string) => Promise<void>;
  /** Admin-only hard delete (Shift+click). */
  onPurge?: (taskId: string) => Promise<void>;
}

export const useTaskDeleteConfirmation = ({
  currentUser,
  systemSettings,
  onDelete,
  onPurge
}: UseTaskDeleteConfirmationProps) => {
  const [confirmationTask, setConfirmationTask] = useState<Task | null>(null);
  const [confirmationPosition, setConfirmationPosition] = useState<{ top: number; left: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPermanent, setIsPermanent] = useState(false);

  const isAdmin = !!currentUser?.roles?.includes('admin');

  const shouldShowConfirmation = useCallback(() => {
    const userPrefs = loadUserPreferences(currentUser?.id);
    return getTaskDeleteConfirmSetting(userPrefs, systemSettings);
  }, [currentUser?.id, systemSettings]);

  const positionFromEvent = (clickEvent?: React.MouseEvent) => {
    let position = { top: 100, left: 100 };
    if (clickEvent) {
      const rect = (clickEvent.target as HTMLElement).getBoundingClientRect();
      position = {
        top: rect.bottom + window.scrollY + 5,
        left: rect.left + window.scrollX
      };
    }
    return position;
  };

  const runDelete = useCallback(async (taskId: string, permanent: boolean) => {
    setIsDeleting(true);
    try {
      if (permanent) {
        if (!onPurge) return;
        await onPurge(taskId);
      } else {
        await onDelete(taskId);
      }
    } catch (error) {
      console.error(permanent ? 'Failed to permanently delete task:' : 'Failed to delete task:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [onDelete, onPurge]);

  const deleteTask = useCallback(async (task: Task | string, clickEvent?: React.MouseEvent) => {
    const taskObj = typeof task === 'string' ? { id: task } as Task : task;
    const wantPermanent = !!(clickEvent?.shiftKey && isAdmin && onPurge);

    // Permanent delete always confirms (destructive, irreversible)
    if (wantPermanent || shouldShowConfirmation()) {
      setIsPermanent(wantPermanent);
      setConfirmationPosition(positionFromEvent(clickEvent));
      setConfirmationTask(taskObj);
      return;
    }

    await runDelete(taskObj.id, false);
  }, [isAdmin, onPurge, shouldShowConfirmation, runDelete]);

  const confirmDelete = useCallback(async () => {
    if (!confirmationTask) return;
    const permanent = isPermanent;
    try {
      await runDelete(confirmationTask.id, permanent);
      setConfirmationTask(null);
      setConfirmationPosition(null);
      setIsPermanent(false);
    } catch {
      // runDelete already logged
    }
  }, [confirmationTask, isPermanent, runDelete]);

  const cancelDelete = useCallback(() => {
    setConfirmationTask(null);
    setConfirmationPosition(null);
    setIsPermanent(false);
  }, []);

  return {
    confirmationTask,
    confirmationPosition,
    isDeleting,
    isPermanent,
    deleteTask,
    confirmDelete,
    cancelDelete,
    shouldShowConfirmation: shouldShowConfirmation()
  };
};

export default useTaskDeleteConfirmation;
