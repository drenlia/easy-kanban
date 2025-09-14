import React, { memo, useMemo } from 'react';
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

export const OptimizedTaskBar = memo<OptimizedTaskBarProps>(({
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
      
      if (activeDragItem.type === DRAG_TYPES.MOVE) {
        // For moving, shift both start and end
        const dragOffset = parseInt(currentHoverDate.split('-')[2]) - (task.startDate?.getDate() || 0);
        startIdx += dragOffset;
        endIdx = startIdx + taskDuration;
      } else if (activeDragItem.type === DRAG_TYPES.RESIZE_START) {
        // For start resize, only change start
        const newStart = parseInt(currentHoverDate.split('-')[2]);
        startIdx = Math.min(newStart - 1, endIdx); // Don't go past end
      } else if (activeDragItem.type === DRAG_TYPES.RESIZE_END) {
        // For end resize, only change end
        const newEnd = parseInt(currentHoverDate.split('-')[2]);
        endIdx = Math.max(newEnd - 1, startIdx); // Don't go before start
      }
    }

    return {
      startIndex: startIdx,
      endIndex: endIdx,
      offsetLeft: `${startIdx * 20}px`,
      offsetWidth: `${Math.max(1, (endIdx - startIdx + 1) * 20)}px` // Allow 1-day tasks (minimum 1px width)
    };
  }, [gridPosition, isDragging, currentHoverDate, activeDragItem, task.startDate]);

  // Memoize priority color
  const priorityColor = useMemo(() => 
    getPriorityColor(task.priority), 
    [getPriorityColor, task.priority]
  );

  // Memoize drag data
  const dragData = useMemo(() => ({
    taskId: task.id,
    type: DRAG_TYPES.MOVE,
    originalStartDate: task.startDate,
    originalEndDate: task.endDate
  }), [task.id, task.startDate, task.endDate]);

  const startResizeDragData = useMemo(() => ({
    taskId: task.id,
    type: DRAG_TYPES.RESIZE_START,
    originalStartDate: task.startDate,
    originalEndDate: task.endDate
  }), [task.id, task.startDate, task.endDate]);

  const endResizeDragData = useMemo(() => ({
    taskId: task.id,
    type: DRAG_TYPES.RESIZE_END,
    originalStartDate: task.startDate,
    originalEndDate: task.endDate
  }), [task.id, task.startDate, task.endDate]);

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
          taskViewMode === 'shrink' ? 'h-10' : 
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
            side="start"
            dragData={startResizeDragData}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
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
            side="end"
            dragData={endResizeDragData}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          />
        </div>
        
        {/* Move handle (invisible overlay for dragging) */}
        <MoveHandle
          dragData={dragData}
          className="absolute inset-0 rounded-md opacity-0"
        />
        
        {/* Progress indicator (if in expanded view) */}
        {taskViewMode === 'expand' && (
          <div className="absolute bottom-0 left-0 h-1 bg-white opacity-30 rounded-b-md" style={{ width: '60%' }} />
        )}
      </div>
    </div>
  );
});

OptimizedTaskBar.displayName = 'OptimizedTaskBar';
