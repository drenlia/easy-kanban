import { useDraggable } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RowHandleProps, DRAG_TYPES, GanttRowDragItem } from './types';

export const RowHandle: React.FC<RowHandleProps> = ({ 
  taskId, 
  taskTitle, 
  taskIndex,
  onRowReorder 
}) => {
  const { t } = useTranslation('common');
  const dragData: GanttRowDragItem = {
    id: `row-handle-${taskId}`,
    taskId,
    taskTitle,
    originalIndex: taskIndex,
    dragType: DRAG_TYPES.TASK_ROW_HANDLE
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `row-handle-${taskId}`,
    data: dragData,
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0) scale(1.05)` : undefined,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 1000 : 'auto',
    boxShadow: isDragging ? '0 8px 25px rgba(0, 0, 0, 0.15)' : 'none',
    transition: isDragging ? 'none' : 'all 0.2s ease',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex items-center justify-center w-6 h-6 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 transition-colors"
      title={t('gantt.dragToReorderTask', { taskTitle })}
      onClick={(e) => {
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
      }}
    >
      <GripVertical size={16} />
    </div>
  );
};
