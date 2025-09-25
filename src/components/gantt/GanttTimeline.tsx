import React, { useRef, useCallback, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Task } from '../../types';
import { TaskHandle } from './TaskHandle';
import { MoveHandle } from './MoveHandle';
import { DRAG_TYPES, GanttDragItem } from './types';
import TaskDependencyArrows from './TaskDependencyArrows';

// Format date helper for local dates
const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
  taskPosition: number;
}

interface GanttTimelineProps {
  groupedTasks: { [columnId: string]: any[] };
  dateRange: any[];
  activeDragItem: any;
  currentHoverDate: string | null;
  selectedTasks: string[];
  isMultiSelectMode: boolean;
  isRelationshipMode: boolean;
  taskViewMode: string;
  isCreatingTask: boolean;
  taskCreationStart: { date: string; taskId?: string } | null;
  taskCreationEnd: { date: string } | null;
  getPriorityColor: (priority: string) => string;
  getTaskBarGridPosition: (task: any) => { startDayIndex: number; endDayIndex: number } | null;
  onSelectTask: (task: Task) => void;
  onTaskSelect: (taskId: string) => void;
  onRelationshipClick: (taskId: string) => void;
  onTaskCreationMouseDown: (e: React.MouseEvent, dateString: string) => void;
  onTaskCreationMouseEnter: (e: React.MouseEvent, dateString: string) => void;
  onTaskCreationMouseUp: (e: React.MouseEvent) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  localDragState: any;
  ganttTasks: GanttTask[];
  taskPositions: Map<string, {x: number, y: number, width: number, height: number}>;
  relationships: any[];
  highlightedTaskId?: string | null;
  selectedParentTask?: string | null;
  onDeleteRelationship?: (relationshipId: string, fromTaskId: string) => void;
}

// Droppable cell component
const DroppableCell = ({ 
  dateString, 
  dateIndex,
  isToday,
  isWeekend,
  activeDragItem,
  disabled = false
}: {
  dateString: string;
  dateIndex: number;
  isToday?: boolean;
  isWeekend?: boolean;
  activeDragItem: any;
  disabled?: boolean;
}) => {
  const dropId = `date-${dateIndex}`;
  const isTaskBarDrag = activeDragItem && (
    activeDragItem.dragType === DRAG_TYPES.TASK_START_HANDLE ||
    activeDragItem.dragType === DRAG_TYPES.TASK_END_HANDLE ||
    activeDragItem.dragType === DRAG_TYPES.TASK_MOVE_HANDLE
  );

  const {
    isOver,
    setNodeRef,
  } = useDroppable({
    id: dropId,
    disabled: disabled || !isTaskBarDrag,
    data: {
      date: dateString,
      cellIndex: dateIndex,
      accepts: ['task-bar']
    }
  });
  

  const baseClasses = "h-full border-r border-gray-300 dark:border-gray-600 transition-colors";
  const bgClasses = isToday ? 'bg-blue-50 dark:bg-blue-900' : 
                   isWeekend ? 'bg-gray-50 dark:bg-gray-700' : 
                   '';
  const hoverClasses = isOver && !disabled ? 'bg-blue-100 dark:bg-blue-800' : '';

  return (
    <div
      ref={setNodeRef}
      className={`${baseClasses} ${bgClasses} ${hoverClasses}`}
      style={{ 
        gridColumn: dateIndex + 1,
        minWidth: '40px'
      }}
    />
  );
};

DroppableCell.displayName = 'DroppableCell';

// Task bar component
const TaskBar = ({ 
  task,
  gridPosition,
  isDragging,
  isSelected,
  isMultiSelectMode,
  isRelationshipMode,
  taskViewMode,
  activeDragItem,
  currentHoverDate,
  dateRange,
  getPriorityColor,
  onSelectTask,
  onTaskSelect,
  onRelationshipClick,
  localDragState,
  highlightedTaskId,
  selectedParentTask
}: any) => {
  const { startDayIndex, endDayIndex } = gridPosition;
  
  
  
  // Calculate display position based on drag state and local data
  let displayStartIndex = startDayIndex;
  let displayEndIndex = endDayIndex;
  
  // Update visual position based on local drag state for ALL drag types
  if (isDragging && activeDragItem && localDragState?.localTaskData[task.id]) {
    const dragType = (activeDragItem as GanttDragItem).dragType;
    const localDates = localDragState.localTaskData[task.id];
    
    // Find the indices for the local dates - use a more efficient approach
    // Create a temporary map for this lookup to avoid O(n) findIndex
    const tempDateMap = new Map();
    dateRange.forEach((d: any, index: number) => {
      // Format date as local date to avoid timezone issues
      const year = d.date.getFullYear();
      const month = String(d.date.getMonth() + 1).padStart(2, '0');
      const day = String(d.date.getDate()).padStart(2, '0');
      const localDateStr = `${year}-${month}-${day}`;
      tempDateMap.set(localDateStr, index);
    });
    
    const localStartIndex = tempDateMap.get(localDates.startDate) ?? -1;
    const localEndIndex = tempDateMap.get(localDates.dueDate) ?? -1;
    
    if (localStartIndex >= 0) displayStartIndex = localStartIndex;
    if (localEndIndex >= 0) displayEndIndex = localEndIndex;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRelationshipMode) {
      onRelationshipClick(task.id);
    } else if (isMultiSelectMode) {
      onTaskSelect(task.id);
    }
    // Removed TaskDetails opening - taskbars no longer open TaskDetails on click
  };


  return (
    <div
      className={`absolute h-6 rounded ${
        isDragging ? 'opacity-50' : 
        isSelected ? 'opacity-100 ring-2 ring-green-400 shadow-lg' :
        'opacity-80 hover:opacity-100'
      } ${
        highlightedTaskId === task.id ? 'ring-2 ring-yellow-400 dark:ring-yellow-600 shadow-lg' : ''
      } transition-all flex items-center group cursor-pointer`}
      style={{
        left: `${displayStartIndex * 40}px`,
        width: `${(displayEndIndex - displayStartIndex + 1) * 40}px`,
        top: '50%',
        transform: 'translateY(-50%)',
        backgroundColor: getPriorityColor(task.priority),
        zIndex: isDragging ? 40 : (isSelected ? 20 : 10),
        pointerEvents: isDragging ? 'none' : 'auto'
      }}
      onClick={handleClick}
      title={task.title}
    >
      {/* Resize handles */}
      {taskViewMode !== 'shrink' && (
        <>
          <TaskHandle
            taskId={task.id}
            task={{
              ...task,
              dueDate: task.endDate ? formatLocalDate(task.endDate) : ''
            } as any}
            handleType="start"
            onDateChange={() => {}}
            taskColor={{ backgroundColor: getPriorityColor(task.priority), color: '#FFFFFF' }}
          />
          <TaskHandle
            taskId={task.id}
            task={{
              ...task,
              dueDate: task.endDate ? formatLocalDate(task.endDate) : ''
            } as any}
            handleType="end"
            onDateChange={() => {}}
            taskColor={{ backgroundColor: getPriorityColor(task.priority), color: '#FFFFFF' }}
          />
        </>
      )}

      {/* Move handle - only in the first cell */}
      <div className="absolute left-0 w-10 h-full">
        <MoveHandle
          taskId={task.id}
          task={{
            ...task,
            dueDate: task.endDate ? formatLocalDate(task.endDate) : ''
          } as any}
          onTaskMove={() => {}}
        />
      </div>

      {/* Task content */}
      <div className="flex-1 min-w-0 px-2">
        <span className="text-white text-xs truncate select-none">
          {task.title}
        </span>
      </div>

      {/* Multi-select checkbox */}
      {isMultiSelectMode && (
        <div className="flex items-center mr-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onTaskSelect(task.id)}
            className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Relationship indicators */}
      {isRelationshipMode && (
        <>
          {/* Start link icon for relationship mode - positioned on left */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              
              if (!selectedParentTask) {
                // First click - select as parent
                onRelationshipClick(task.id);
              } else if (selectedParentTask === task.id) {
                // Clicking same task - deselect
                onRelationshipClick(task.id);
              } else {
                // Second click - create relationship
                onRelationshipClick(task.id);
              }
            }}
            className={`p-1 ml-1 mr-2 rounded transition-colors ${
              selectedParentTask === task.id 
                ? 'bg-yellow-400 bg-opacity-80 text-gray-900' 
                : 'hover:bg-white hover:bg-opacity-20'
            }`}
            title={selectedParentTask === task.id ? 'Selected as parent - click another task to link' : 'Click to select as parent task'}
          >
            <svg className={`w-3 h-3 ${selectedParentTask === task.id ? 'text-gray-900' : 'text-white'}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
};

TaskBar.displayName = 'TaskBar';

const GanttTimeline = ({
  groupedTasks,
  dateRange,
  activeDragItem,
  currentHoverDate,
  selectedTasks,
  isMultiSelectMode,
  isRelationshipMode,
  taskViewMode,
  isCreatingTask,
  taskCreationStart,
  taskCreationEnd,
  getPriorityColor,
  getTaskBarGridPosition,
  onSelectTask,
  onTaskSelect,
  onRelationshipClick,
  onTaskCreationMouseDown,
  onTaskCreationMouseEnter,
  onTaskCreationMouseUp,
  scrollContainerRef,
  localDragState,
  ganttTasks,
  taskPositions,
  relationships,
  highlightedTaskId,
  selectedParentTask,
  onDeleteRelationship
}: GanttTimelineProps) => {
  // Allow vertical scrolling to pass through to parent
  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Only handle horizontal scrolling
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        return; // Let browser handle horizontal scroll
      }
      
      // For vertical scrolling, check if we can scroll horizontally instead
      const canScrollLeft = container.scrollLeft > 0;
      const canScrollRight = container.scrollLeft < container.scrollWidth - container.clientWidth;
      
      // If shift is held or horizontal scroll is possible, convert to horizontal
      if (e.shiftKey && (canScrollLeft || canScrollRight)) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
        return;
      }
      
      // Otherwise, don't handle it - let it bubble up for page scroll
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [scrollContainerRef]);

  return (
    <div 
      ref={scrollContainerRef}
      className="flex-1 overflow-x-auto relative"
      style={{ overscrollBehavior: 'contain auto' }}
    >
      <div style={{ 
        width: `${dateRange.length * 40}px`,
        minWidth: '100%',
        willChange: 'transform' 
      }}>
        {/* Task Creation Row */}
        <div 
          className="grid bg-blue-50 dark:bg-blue-900 hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors relative h-12 border-b-4 border-blue-400 cursor-crosshair"
          style={{ 
            gridTemplateColumns: `repeat(${dateRange.length}, 40px)`,
          }}
          onMouseUp={onTaskCreationMouseUp}
        >
          {dateRange.map((dateCol, index) => (
            <div
              key={`create-${index}`}
              className={`border-r border-blue-300 dark:border-blue-600 ${
                taskCreationStart?.date === formatLocalDate(dateCol.date) ? 'bg-blue-200 dark:bg-blue-700' : ''
              }`}
              style={{ minWidth: '40px' }}
              onMouseDown={(e) => onTaskCreationMouseDown(e, formatLocalDate(dateCol.date))}
              onMouseEnter={(e) => onTaskCreationMouseEnter(e, formatLocalDate(dateCol.date))}
            />
          ))}
          
          {/* Task creation preview */}
          {isCreatingTask && taskCreationStart && taskCreationEnd && (() => {
            const startIdx = dateRange.findIndex(d => 
              formatLocalDate(d.date) === taskCreationStart.date
            );
            const endIdx = dateRange.findIndex(d => 
              formatLocalDate(d.date) === taskCreationEnd.date
            );
            
            if (startIdx >= 0 && endIdx >= 0) {
              const minIdx = Math.min(startIdx, endIdx);
              const maxIdx = Math.max(startIdx, endIdx);
              
              return (
                <div
                  className="absolute h-8 bg-blue-500 rounded opacity-50 pointer-events-none flex items-center justify-center"
                  style={{
                    left: `${minIdx * 40}px`,
                    width: `${(maxIdx - minIdx + 1) * 40}px`,
                    top: '50%',
                    transform: 'translateY(-50%)'
                  }}
                >
                  <span className="text-white text-xs font-medium">New Task</span>
                </div>
              );
            }
            return null;
          })()}
        </div>

        {/* Task Timeline Rows */}
        {Object.entries(groupedTasks).map(([columnId, tasks], groupIndex) => {
          // Always render column separator, even for empty columns
          if (tasks.length === 0) {
            return (
              <React.Fragment key={`empty-timeline-${columnId}`}>
                {groupIndex > 0 && (
                  <div className="bg-pink-300 dark:bg-pink-600 h-0.5 w-full"></div>
                )}
              </React.Fragment>
            );
          }
          
          return (
            <React.Fragment key={`timeline-${columnId}`}>
              {/* Column separator */}
              {groupIndex > 0 && (
                <div className="bg-pink-300 dark:bg-pink-600 h-0.5 w-full"></div>
              )}
              
              {/* Tasks */}
              {tasks.map((task, taskIndex) => {
                const gridPosition = getTaskBarGridPosition(task);
                const isDragging = (activeDragItem as GanttDragItem)?.taskId === task.id;
                const isSelected = selectedTasks.includes(task.id);
                
                
                
                return (
                  <div 
                    key={`timeline-task-${task.id}-${columnId}-${taskIndex}`} 
                    data-task-id={task.id}
                    className={`relative border-b border-gray-200 dark:border-gray-600 ${
                      taskIndex % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'
                    } hover:bg-blue-50 dark:hover:bg-blue-900 transition-colors ${
                      taskViewMode === 'compact' ? 'h-12' : 
                      taskViewMode === 'shrink' ? 'h-14' : 'h-20'
                    }`}
                  >
                    {/* Background grid - Always visible */}
                    <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${dateRange.length}, 40px)` }}>
                      {dateRange.map((dateCol, dateIndex) => (
                        <div
                          key={`grid-${task.id}-${dateIndex}`}
                          className={`border-r border-gray-200 dark:border-gray-600 ${
                            dateCol.isToday ? 'bg-blue-50 dark:bg-blue-900' : 
                            dateCol.isWeekend ? 'bg-gray-100 dark:bg-gray-700' : ''
                          }`}
                        />
                      ))}
                    </div>
                    
                    {/* Droppable cells - Only render for the dragged task */}
                    {activeDragItem && 
                     activeDragItem.taskId === task.id &&
                     (activeDragItem.dragType === DRAG_TYPES.TASK_START_HANDLE || 
                      activeDragItem.dragType === DRAG_TYPES.TASK_END_HANDLE || 
                      activeDragItem.dragType === DRAG_TYPES.TASK_MOVE_HANDLE) && (
                      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${dateRange.length}, 40px)` }}>
                        {dateRange.map((dateCol, dateIndex) => {
                          // Format date as local date to avoid timezone issues
                          const formatLocalDate = (date: Date) => {
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            return `${year}-${month}-${day}`;
                          };
                          
                          return (
                            <DroppableCell
                              key={`cell-${task.id}-${dateIndex}`}
                              dateString={formatLocalDate(dateCol.date)}
                              dateIndex={dateIndex}
                              isToday={dateCol.isToday}
                              isWeekend={dateCol.isWeekend}
                              activeDragItem={activeDragItem}
                              disabled={false}
                            />
                          );
                        })}
                      </div>
                    )}
                    
                    {/* Task bar - Only render if task has valid grid position */}
                    {gridPosition && gridPosition.startDayIndex >= 0 && gridPosition.endDayIndex >= 0 && (
                      <TaskBar
                        task={task}
                        gridPosition={gridPosition}
                        isDragging={isDragging}
                        isSelected={isSelected}
                        isMultiSelectMode={isMultiSelectMode}
                        isRelationshipMode={isRelationshipMode}
                        taskViewMode={taskViewMode}
                        activeDragItem={activeDragItem}
                        currentHoverDate={currentHoverDate}
                        dateRange={dateRange}
                        getPriorityColor={getPriorityColor}
                        onSelectTask={onSelectTask}
                        onTaskSelect={onTaskSelect}
                        onRelationshipClick={onRelationshipClick}
                        localDragState={localDragState}
                        highlightedTaskId={highlightedTaskId}
                        selectedParentTask={selectedParentTask}
                      />
                    )}
                    
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
        
        {/* Empty state */}
        {Object.keys(groupedTasks).length === 0 && (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            <p>No tasks to display</p>
          </div>
        )}
        
        {/* Task Dependency Arrows - Inside scroll container */}
        <TaskDependencyArrows
          ganttTasks={ganttTasks}
          taskPositions={taskPositions}
          relationships={relationships}
          dateRange={dateRange}
          taskViewMode={taskViewMode}
          isRelationshipMode={isRelationshipMode}
          onDeleteRelationship={onDeleteRelationship}
        />
      </div>
    </div>
  );
};

GanttTimeline.displayName = 'GanttTimeline';

export default GanttTimeline;
