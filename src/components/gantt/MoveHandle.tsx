import React, { useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { DRAG_TYPES, GanttDragItem } from './types';
import { Task } from '../../types';

interface MoveHandleProps {
  taskId: string;
  task: Task;
  onTaskMove: (taskId: string, newStartDate: string, newEndDate: string) => void;
  className?: string;
}

export const MoveHandle: React.FC<MoveHandleProps> = React.memo(({ 
  taskId, 
  task, 
  onTaskMove,
  className = ""
}) => {
  // Helper function to safely convert date to string
  const dateToString = (date: string | Date | undefined | null): string => {
    if (!date) return '';
    if (typeof date === 'string') return date.split('T')[0]; // Already a string, just get date part
    if (date instanceof Date) {
      // Format as local date to avoid timezone issues
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return '';
  };

  const startStr = dateToString(task.startDate);
  const endStr = dateToString(task.dueDate);
  
  // Memoize drag data to prevent constant re-renders
  const dragData: GanttDragItem = useMemo(() => ({
    id: `${taskId}-move`,
    taskId,
    taskTitle: task.title,
    originalStartDate: startStr,
    originalEndDate: endStr, // Note: Task uses dueDate, not endDate
    dragType: DRAG_TYPES.TASK_MOVE_HANDLE
  }), [taskId, task.title, startStr, endStr]);

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging
  } = useDraggable({
    id: dragData.id,
    data: dragData
  });


  const style = {
    opacity: isDragging ? 0.3 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`w-full h-full flex items-center justify-center cursor-move hover:bg-white/20 rounded ${className}`}
    >
      {/* Grip dots icon */}
      <div className="flex flex-col gap-0.5 opacity-60 group-hover:opacity-100">
        <div className="flex gap-0.5">
          <div className="w-1 h-1 bg-white rounded-full"></div>
          <div className="w-1 h-1 bg-white rounded-full"></div>
        </div>
        <div className="flex gap-0.5">
          <div className="w-1 h-1 bg-white rounded-full"></div>
          <div className="w-1 h-1 bg-white rounded-full"></div>
        </div>
        <div className="flex gap-0.5">
          <div className="w-1 h-1 bg-white rounded-full"></div>
          <div className="w-1 h-1 bg-white rounded-full"></div>
        </div>
      </div>
    </div>
  );
});
