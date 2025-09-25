import React, { useMemo } from 'react';
import { TaskHandle } from './TaskHandle';
import { MoveHandle } from './MoveHandle';
import { GanttDragItem, DRAG_TYPES } from './types';

interface GanttTask {
  id: string;
  ticket: string;
  title: string;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  priority: string;
  columnId: string;
  columnPosition: number;
}

interface TaskBarPosition {
  startDayIndex: number;
  endDayIndex: number;
  gridColumnStart: number;
  gridColumnEnd: number;
}

interface OptimizedTaskBarProps {
  task: GanttTask;
  gridPosition: TaskBarPosition;
  taskIndex: number;
  currentHoverDate: string | null;
  activeDragItem: GanttDragItem | null;
  getPriorityColor: (priority: string) => string;
  formatDate: (date: Date) => string;
  taskViewMode: 'compact' | 'shrink' | 'expand';
  onTaskClick: (task: GanttTask) => void;
}

export const OptimizedTaskBar = ({
  task,
  gridPosition,
  taskIndex,
  currentHoverDate,
  activeDragItem,
  getPriorityColor,
  formatDate,
  taskViewMode,
  onTaskClick
}) => {
  // Memoize drag state calculation
  const isDragging = useMemo(() => 
    activeDragItem?.taskId === task.id, 
    [activeDragItem?.taskId, task.id]
  );

  // Memoize position calculations
  const { startIndex, endIndex, offsetLeft, offsetWidth } = useMemo(() => {
    let startIdx = gridPosition.startDayIndex;
    let endIdx = gridPosition.endDayIndex;

    // Adjust position if dragging
    if (isDragging && currentHoverDate && activeDragItem) {
      const taskDuration = Math.max(0, endIdx - startIdx);
      
      if (activeDragItem.dragType === DRAG_TYPES.TASK_MOVE_HANDLE) {
        // For moving, shift both start and end
        const hoverDate = new Date(currentHoverDate);
        const taskStartDate = new Date(task.startDate);
        const dragOffset = hoverDate.getDate() - taskStartDate.getDate();
        startIdx += dragOffset;
        endIdx = startIdx + taskDuration;
      } else if (activeDragItem.dragType === DRAG_TYPES.TASK_START_HANDLE) {
        // For start resize, only change start
        const hoverDate = new Date(currentHoverDate);
        const newStart = hoverDate.getDate();
        startIdx = Math.min(newStart - 1, endIdx); // Don't go past end
      } else if (activeDragItem.dragType === DRAG_TYPES.TASK_END_HANDLE) {
        // For end resize, only change end
        const hoverDate = new Date(currentHoverDate);
        const newEnd = hoverDate.getDate();
        endIdx = Math.max(newEnd - 1, startIdx); // Don't go before start
      }
    }

    return {
      startIndex: startIdx,
      endIndex: endIdx,
      offsetLeft: `${startIdx * 40}px`,
      offsetWidth: `${Math.max(1, (endIdx - startIdx + 1) * 40)}px` // Allow 1-day tasks (minimum 1px width)
    };
  }, [gridPosition, isDragging, currentHoverDate, activeDragItem, task.startDate]);

  // Memoize priority color
  const priorityColor = useMemo(() => {
    const color = getPriorityColor(task.priority);
    return color;
  }, [getPriorityColor, task.priority]);

  // Helper function to format local date (avoid timezone issues)
  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Memoize drag data
  const dragData = useMemo(() => ({
    id: `${task.id}-move`,
    taskId: task.id,
    taskTitle: task.title,
    originalStartDate: task.startDate ? formatLocalDate(task.startDate) : '',
    originalEndDate: task.endDate ? formatLocalDate(task.endDate) : '',
    dragType: DRAG_TYPES.TASK_MOVE_HANDLE
  }), [task.id, task.title, task.startDate, task.endDate]);

  const startResizeDragData = useMemo(() => ({
    id: `${task.id}-start`,
    taskId: task.id,
    taskTitle: task.title,
    originalStartDate: task.startDate ? formatLocalDate(task.startDate) : '',
    originalEndDate: task.endDate ? formatLocalDate(task.endDate) : '',
    dragType: DRAG_TYPES.TASK_START_HANDLE
  }), [task.id, task.title, task.startDate, task.endDate, formatLocalDate]);

  const endResizeDragData = useMemo(() => ({
    id: `${task.id}-end`,
    taskId: task.id,
    taskTitle: task.title,
    originalStartDate: task.startDate ? formatLocalDate(task.startDate) : '',
    originalEndDate: task.endDate ? formatLocalDate(task.endDate) : '',
    dragType: DRAG_TYPES.TASK_END_HANDLE
  }), [task.id, task.title, task.startDate, task.endDate, formatLocalDate]);

  // Memoize click handler
  const handleClick = useMemo(() => 
    () => onTaskClick(task), 
    [onTaskClick, task]
  );

  // Don't render if no position
  if (!gridPosition) return null;

  return (
    <div
      className={`absolute ${isDragging ? 'opacity-50 z-30' : 'z-20'} 
        ${taskViewMode === 'compact' ? 'h-8' : 
          taskViewMode === 'shrink' ? 'h-8' : 
          'h-12'} 
        top-1 transition-opacity duration-200`}
      style={{
        left: offsetLeft,
        width: offsetWidth,
        backgroundColor: priorityColor,
      }}
    >
      {/* Task bar with gradient and hover effects */}
      <div className="relative h-full w-full rounded-md shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group">
        {/* Background with gradient */}
        <div 
          className="absolute inset-0 rounded-md opacity-90 group-hover:opacity-100"
          style={{
            background: `linear-gradient(135deg, ${priorityColor} 0%, ${priorityColor}CC 100%)`
          }}
        />
        
        {/* Content overlay */}
        <div className="relative h-full flex items-center justify-between px-2 text-white text-xs font-medium">
          {/* Start resize handle */}
          <TaskHandle
            taskId={task.id}
            task={task}
            handleType="start"
            onDateChange={() => {}} // Will be handled by drag end
            taskColor={{ backgroundColor: priorityColor, color: 'white' }}
          />
          
          {/* Task content */}
          <div 
            className="flex-1 text-center truncate mx-1 min-w-0"
            onClick={handleClick}
            title={`${task.ticket}: ${task.title} (${formatDate(task.startDate!)} - ${formatDate(task.endDate!)})`}
          >
            {/* Always show full title on task bars, regardless of left column view mode */}
            {`${task.ticket}: ${task.title}`}
          </div>
          
          {/* End resize handle */}
          <TaskHandle
            taskId={task.id}
            task={task}
            handleType="end"
            onDateChange={() => {}} // Will be handled by drag end
            taskColor={{ backgroundColor: priorityColor, color: 'white' }}
          />
        </div>
        
        {/* Move handle (only on start date cell for multi-day tasks) */}
        {(() => {
          // Only show MoveHandle for multi-day tasks
          const isMultiDay = task.startDate && task.endDate && 
            formatLocalDate(task.startDate) !== formatLocalDate(task.endDate);
          
          
          if (!isMultiDay) return null;
          
          return (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '20px', // Only cover the start date cell
                height: '100%',
                zIndex: 5, // Lower than TaskHandles (z-20)
                backgroundColor: 'rgba(0, 255, 0, 0.2)' // Debug: green tint to see the area
              }}
            >
              <MoveHandle
                taskId={task.id}
                task={task}
                onTaskMove={() => {}} // Will be handled by drag end
                className="opacity-0 group-hover:opacity-20 transition-opacity duration-200"
              />
            </div>
          );
        })()}
        
        {/* Non-draggable overlay for the rest of multi-day task bars */}
        {(() => {
          // Only show non-draggable overlay for multi-day tasks
          const isMultiDay = task.startDate && task.endDate && 
            formatLocalDate(task.startDate) !== formatLocalDate(task.endDate);
          
          if (!isMultiDay) return null;
          
          return (
            <div
              style={{
                position: 'absolute',
                left: '20px', // Start after the drag handle
                top: 0,
                right: 0,
                height: '100%',
                zIndex: 5,
                pointerEvents: 'auto'
              }}
              className="cursor-default"
              onClick={(e) => e.stopPropagation()}
            />
          );
        })()}
        
        {/* Progress indicator (if in expanded view) */}
        {taskViewMode === 'expand' && (
          <div className="absolute bottom-0 left-0 h-1 bg-white opacity-30 rounded-b-md" style={{ width: '60%' }} />
        )}
      </div>
    </div>
  );
};

OptimizedTaskBar.displayName = 'OptimizedTaskBar';
