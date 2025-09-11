import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { DateColumnProps, GanttDragItem, DRAG_TYPES } from './types';

export const DateColumn: React.FC<DateColumnProps> = ({ 
  date, 
  dateIndex, 
  children, 
  onTaskDrop 
}) => {
  const dateString = date.toISOString().split('T')[0];
  
  const { isOver, setNodeRef } = useDroppable({
    id: `date-${dateIndex}`,
    data: {
      date: dateString,
      dateIndex
    }
  });

  const handleDrop = (dragData: GanttDragItem) => {
    onTaskDrop(dragData, dateString);
  };

  return (
    <div
      ref={setNodeRef}
      className={`
        relative transition-colors duration-150
        ${isOver ? 'bg-blue-100 border-blue-300' : ''}
      `}
    >
      {children}
      
      {/* Visual drop indicator */}
      {isOver && (
        <div className="absolute inset-0 border-2 border-blue-400 border-dashed rounded-sm pointer-events-none opacity-50" />
      )}
    </div>
  );
};
