import React from 'react';
import { createPortal } from 'react-dom';
import { Task } from '../types';

interface TaskDeleteConfirmationProps {
  isOpen: boolean;
  task: Task | null;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting?: boolean;
  position: { top: number; left: number } | null;
}

const TaskDeleteConfirmation: React.FC<TaskDeleteConfirmationProps> = ({
  isOpen,
  task,
  onConfirm,
  onCancel,
  isDeleting = false,
  position
}) => {
  if (!isOpen || !task || !position) return null;

  return createPortal(
    <div 
      className="delete-confirmation fixed bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-[9999] min-w-[200px]"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <div className="text-sm text-gray-700 mb-3">
        Are you sure?
      </div>
      <div className="flex space-x-2 justify-end">
        <button
          onClick={onCancel}
          disabled={isDeleting}
          className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors disabled:opacity-50"
        >
          No
        </button>
        <button
          onClick={onConfirm}
          disabled={isDeleting}
          className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {isDeleting ? 'Deleting...' : 'Yes'}
        </button>
      </div>
    </div>,
    document.body
  );
};

export default TaskDeleteConfirmation;