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
    if (date instanceof Date) return date.toISOString().split('T')[0]; // Convert Date to string
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

  // Simple test to see if component is rendered (disabled to prevent spam)
  // if (taskId === 'c83e8171-0e77-4a24-bd20-ffbcd7b7920d') {
  //   console.log('🔧 [MoveHandle] Test task rendered:', {
  //     taskId,
  //     isDragging,
  //     hasListeners: !!listeners,
  //     hasAttributes: !!attributes
  //   });
  // }

  const style = {
    opacity: isDragging ? 0.3 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`w-full h-full rounded-md opacity-0 cursor-move ${className}`}
      title="Drag to move entire task"
    >
      {/* Grip dots icon */}
      <div className="flex flex-col gap-0.5">
        <div className="flex gap-0.5">
          <div className="w-0.5 h-0.5 bg-white rounded-full opacity-80"></div>
          <div className="w-0.5 h-0.5 bg-white rounded-full opacity-80"></div>
        </div>
        <div className="flex gap-0.5">
          <div className="w-0.5 h-0.5 bg-white rounded-full opacity-80"></div>
          <div className="w-0.5 h-0.5 bg-white rounded-full opacity-80"></div>
        </div>
        <div className="flex gap-0.5">
          <div className="w-0.5 h-0.5 bg-white rounded-full opacity-80"></div>
          <div className="w-0.5 h-0.5 bg-white rounded-full opacity-80"></div>
        </div>
      </div>
    </div>
  );
});
