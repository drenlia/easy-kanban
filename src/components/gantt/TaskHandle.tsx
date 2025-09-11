import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { TaskHandleProps, DRAG_TYPES, GanttDragItem } from './types';

export const TaskHandle: React.FC<TaskHandleProps> = ({ 
  taskId, 
  task, 
  handleType, 
  onDateChange,
  taskColor 
}) => {
  const dragType = handleType === 'start' ? DRAG_TYPES.TASK_START_HANDLE : DRAG_TYPES.TASK_END_HANDLE;
  
  const dragData: GanttDragItem = {
    id: `${taskId}-${handleType}`,
    taskId,
    taskTitle: task.title,
    originalStartDate: task.startDate?.toISOString().split('T')[0] || '',
    originalEndDate: task.endDate?.toISOString().split('T')[0] || '',
    dragType
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging
  } = useDraggable({
    id: dragData.id,
    data: dragData
  });

  // Don't apply transform during drag to avoid visual displacement
  // The task bar itself will show the visual feedback
  const style = {
    opacity: isDragging ? 0.3 : 1,
    backgroundColor: taskColor?.backgroundColor || '#6B7280'
  };

  const isStartHandle = handleType === 'start';
  const cursor = isStartHandle ? 'cursor-w-resize' : 'cursor-e-resize';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`
        absolute top-0 w-3 h-full opacity-60 hover:opacity-80 
        transition-all rounded-${isStartHandle ? 'l' : 'r'} flex items-center justify-center
        ${cursor} z-20
        ${isStartHandle ? 'left-0' : 'right-0'}
        ${isDragging ? 'shadow-lg' : ''}
      `}
      title={`Drag to change ${handleType} date`}
    >
      <div className="w-0.5 h-3 bg-white rounded opacity-80"></div>
    </div>
  );
};
