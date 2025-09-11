import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { DRAG_TYPES, GanttDragItem } from './types';
import { Task } from '../../types';

interface MoveHandleProps {
  taskId: string;
  task: Task;
  onTaskMove: (taskId: string, newStartDate: string, newEndDate: string) => void;
}

export const MoveHandle: React.FC<MoveHandleProps> = ({ 
  taskId, 
  task, 
  onTaskMove 
}) => {
  const dragData: GanttDragItem = {
    id: `${taskId}-move`,
    taskId,
    taskTitle: task.title,
    originalStartDate: task.startDate?.toISOString().split('T')[0] || '',
    originalEndDate: task.endDate?.toISOString().split('T')[0] || '',
    dragType: DRAG_TYPES.TASK_MOVE_HANDLE
  };

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
      className="flex-shrink-0 w-4 h-full bg-gray-400 bg-opacity-60 hover:bg-opacity-80 transition-all rounded flex items-center justify-center cursor-move mr-1"
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
};
