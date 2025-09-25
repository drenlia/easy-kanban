import React, { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task, Columns } from '../../types';
import { Copy, Trash2 } from 'lucide-react';
import { SortableTaskRowItem } from './types';


interface GanttTaskListProps {
  columns: Columns;
  groupedTasks: { [columnId: string]: any[] };
  visibleTasks: any[];
  selectedTasks: string[];
  isMultiSelectMode: boolean;
  isRelationshipMode: boolean;
  selectedParentTask: string | null;
  activeDragItem: any;
  priorities: any[];
  taskColumnWidth: number;
  taskViewMode: string;
  onSelectTask: (task: Task) => void;
  onTaskSelect: (taskId: string) => void;
  onRelationshipClick: (taskId: string) => void;
  onCopyTask?: (task: Task) => Promise<void>;
  onRemoveTask?: (taskId: string, event?: React.MouseEvent) => Promise<void>;
  highlightedTaskId?: string | null;
}

// Drop zone component
const DropZone = memo(({ columnId, columnName, isVisible }: { 
  columnId: string; 
  columnName?: string;
  isVisible: boolean;
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-zone-${columnId}`,
    data: {
      type: 'column-drop-zone',
      columnId: columnId
    }
  });
  
  if (!isVisible) return null;
  
  return (
    <div 
      ref={setNodeRef}
      className={`px-4 py-2 border-2 border-dashed rounded-lg mx-2 my-1 text-center transition-colors ${
        isOver 
          ? 'bg-green-50 dark:bg-green-900 border-green-400 dark:border-green-500' 
          : 'bg-blue-50 dark:bg-blue-900 border-blue-300 dark:border-blue-600'
      }`}
    >
      <div className="text-blue-600 dark:text-blue-200 text-xs font-medium">
        📋 Drop here to move task to {columnName || 'this group'}
      </div>
    </div>
  );
});

DropZone.displayName = 'DropZone';

// Droppable group wrapper
const DroppableGroup = memo(({ children, columnId }: { children: React.ReactNode; columnId: string }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${columnId}`,
    data: {
      type: 'column-drop',
      columnId: columnId
    }
  });

  return (
    <div
      ref={setNodeRef}
      data-column-id={columnId}
      className={`transition-colors duration-200 ${
        isOver ? 'bg-blue-50 dark:bg-blue-900' : ''
      }`}
    >
      {children}
    </div>
  );
});

DroppableGroup.displayName = 'DroppableGroup';

// Individual task row component
const TaskRow = memo(({ 
  task, 
  taskIndex,
  isSelected,
  isMultiSelectMode,
  isRelationshipMode,
  selectedParentTask,
  activeDragItem,
  priorities,
  taskViewMode,
  onSelectTask,
  onTaskSelect,
  onRelationshipClick,
  onCopyTask,
  onRemoveTask,
  highlightedTaskId
}: any) => {
  const isThisTaskDragging = activeDragItem && 
    (activeDragItem as SortableTaskRowItem).type === 'task-row-reorder' && 
    (activeDragItem as SortableTaskRowItem).task.id === task.id;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: 'task-row-reorder',
      task: task,
      taskIndex: taskIndex,
      columnId: task.columnId,
    },
    disabled: false
  });

  const style = {
    transform: isThisTaskDragging ? 'none' : (transform ? CSS.Transform.toString(transform) : undefined),
    transition: isDragging ? 'none' : transition,
    zIndex: (isDragging || isThisTaskDragging) ? 1000 : 'auto',
    opacity: isThisTaskDragging ? 0 : (isDragging ? 0.3 : 1),
  };


  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (isRelationshipMode) {
      onRelationshipClick(task.id);
    } else if (isMultiSelectMode) {
      onTaskSelect(task.id);
    } else {
      // Convert GanttTask back to Task format with string dates
      const taskForSelection = {
        ...task,
        startDate: task.startDate ? `${task.startDate.getFullYear()}-${String(task.startDate.getMonth() + 1).padStart(2, '0')}-${String(task.startDate.getDate()).padStart(2, '0')}` : '',
        dueDate: task.endDate ? `${task.endDate.getFullYear()}-${String(task.endDate.getMonth() + 1).padStart(2, '0')}-${String(task.endDate.getDate()).padStart(2, '0')}` : task.dueDate || ''
      };
      onSelectTask(taskForSelection);
    }
  };

  return (
    <div 
      ref={setNodeRef}
      key={`task-info-${task.id}`}
      data-task-id={task.id}
      style={style}
      className={`relative p-2 border-b border-gray-100 ${
        taskViewMode === 'compact' ? 'h-12' : 
        taskViewMode === 'shrink' ? 'h-14' : 
        'h-20'
      } ${taskIndex % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'} 
      hover:bg-blue-50 dark:hover:bg-blue-900 transition-all duration-200 ease-out ${
        (isDragging || isThisTaskDragging) ? '!border-2 !border-blue-500 !shadow-lg !rounded-lg bg-blue-50 dark:bg-blue-900' : ''
      } ${isSelected ? 'bg-blue-100 dark:bg-blue-800 ring-2 ring-blue-400' : ''} ${
        highlightedTaskId === task.id ? 'bg-yellow-200 dark:bg-yellow-800 ring-2 ring-yellow-400 dark:ring-yellow-600 ring-inset' : ''
      }`}
      onClick={handleClick}
    >
      {/* Drag handle - connected to useSortable */}
      <div 
        className="absolute left-0 top-1/2 -translate-y-1/2 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        title={`Drag to reorder ${task.title}`}
      >
        <div className="flex items-center justify-center w-6 h-6 text-gray-400 hover:text-gray-600 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 6h2v2H8V6zm6 0h2v2h-2V6zM8 10h2v2H8v-2zm6 0h2v2h-2v-2zM8 14h2v2H8v-2zm6 0h2v2h-2v-2z"/>
          </svg>
        </div>
      </div>

      {/* Main content area with proper flex layout */}
      <div className="flex items-center gap-2 ml-6 pr-2">
        {/* ROW REORDERING ZONE - Only for vertical dragging */}
        <button
          className={`text-left flex-1 min-w-0 rounded px-1 py-1 transition-all duration-300 ${
            highlightedTaskId === task.id 
              ? 'bg-yellow-200 dark:bg-yellow-800 ring-2 ring-yellow-400 dark:ring-yellow-600 ring-inset' 
              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{task.ticket}</div>
            {(task.startDate || task.endDate) && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {task.startDate && task.endDate && task.startDate.getTime() === task.endDate.getTime() 
                  ? `📅 ${task.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  : task.startDate && task.endDate
                  ? `📅 ${task.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${task.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  : task.endDate
                    ? `📅 ${task.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : task.startDate
                    ? `📅 ${task.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : ''
                  }
              </span>
            )}
          </div>
          {/* Compact: Only TASK-XXXXX with dates */}
          {taskViewMode === 'compact' ? null : (
            <>
              {taskViewMode !== 'shrink' && taskViewMode !== 'compact' && (
                <div className="text-sm text-gray-600 dark:text-gray-300 truncate">{task.title}</div>
              )}
              {taskViewMode !== 'compact' && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  📋 {task.status}
                </div>
              )}
            </>
          )}
        </button>
        
        {/* Action buttons - Now positioned on the right */}
        <div 
          className="flex items-center gap-1 relative z-50"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {onCopyTask && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopyTask(task);
              }}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
              title="Copy Task"
            >
              <Copy size={14} className="text-gray-500 hover:text-gray-700" />
            </button>
          )}
          {onRemoveTask && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemoveTask(task.id, e);
              }}
              className="p-1 hover:bg-red-100 dark:hover:bg-red-900 rounded transition-colors"
              title="Delete Task"
            >
              <Trash2 size={14} className="text-gray-500 hover:text-red-600" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

TaskRow.displayName = 'TaskRow';

const GanttTaskList = memo(({
  columns,
  groupedTasks,
  visibleTasks,
  selectedTasks,
  isMultiSelectMode,
  isRelationshipMode,
  selectedParentTask,
  activeDragItem,
  priorities,
  taskColumnWidth,
  taskViewMode,
  onSelectTask,
  onTaskSelect,
  onRelationshipClick,
  onCopyTask,
  onRemoveTask,
  highlightedTaskId
}: GanttTaskListProps) => {
  return (
    <div 
      className="sticky left-0 z-10 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700"
      style={{ width: `${taskColumnWidth}px` }}
    >
      {/* Task Creation Header */}
      <div className="h-12 bg-blue-50 dark:bg-blue-900 border-b-4 border-blue-400 dark:border-blue-500 flex items-center justify-end px-3">
        <span className="text-sm text-blue-700 dark:text-blue-200 font-medium">Add tasks here →</span>
      </div>
      
      {/* Task List with Sortable */}
      <SortableContext 
        items={visibleTasks.filter(task => task && task.id).map(task => task.id)} 
        strategy={verticalListSortingStrategy}
      >
          {Object.entries(groupedTasks).map(([columnId, tasks], groupIndex) => {
            // Always render column separator, even for empty columns
            if (tasks.length === 0) {
              return (
                <React.Fragment key={`empty-${columnId}`}>
                  {groupIndex > 0 && (
                    <div className="bg-pink-300 dark:bg-pink-600 h-0.5 w-full"></div>
                  )}
                </React.Fragment>
              );
            }
            
            
            return (
              <DroppableGroup key={columnId} columnId={columnId}>
                {/* Column separator */}
                {groupIndex > 0 && (
                  <div className="bg-pink-300 dark:bg-pink-600 h-0.5 w-full flex-shrink-0"></div>
                )}
                
                {/* Drop zone */}
                <DropZone 
                  columnId={columnId}
                  columnName={columns[columnId]?.title || `Column ${columnId}`}
                  isVisible={((activeDragItem as SortableTaskRowItem)?.type === 'task-row-reorder') && 
                    activeDragItem && 
                    (activeDragItem as SortableTaskRowItem).task.columnId !== columnId}
                />
                
                {/* Tasks */}
                {tasks.map((task, taskIndex) => (
                  <TaskRow
                    key={`tasklist-task-${task.id}-${columnId}-${taskIndex}`}
                    task={task}
                    taskIndex={taskIndex}
                    isSelected={selectedTasks.includes(task.id)}
                    isMultiSelectMode={isMultiSelectMode}
                    isRelationshipMode={isRelationshipMode}
                    selectedParentTask={selectedParentTask}
                    activeDragItem={activeDragItem}
                    priorities={priorities}
                    taskViewMode={taskViewMode}
                    onSelectTask={onSelectTask}
                    onTaskSelect={onTaskSelect}
                    onRelationshipClick={onRelationshipClick}
                    onCopyTask={onCopyTask}
                    onRemoveTask={onRemoveTask}
                    highlightedTaskId={highlightedTaskId}
                  />
                ))}
              </DroppableGroup>
            );
          })}
        </SortableContext>
    </div>
  );
});

GanttTaskList.displayName = 'GanttTaskList';

export default GanttTaskList;
