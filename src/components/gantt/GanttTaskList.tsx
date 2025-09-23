import React, { memo } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task, Columns } from '../../types';
import { RowHandle } from './RowHandle';
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
  sensors: any;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  highlightedTaskId?: string | null;
}

// Drop zone component
const DropZone = memo(({ columnId, isVisible }: { 
  columnId: string; 
  isVisible: boolean;
}) => {
  if (!isVisible) return null;
  
  return (
    <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900 border-2 border-dashed border-blue-300 dark:border-blue-600 rounded-lg mx-2 my-1 text-center">
      <div className="text-blue-600 dark:text-blue-200 text-xs font-medium">
        📋 Drop here to move task
      </div>
    </div>
  );
});

DropZone.displayName = 'DropZone';

// Droppable group wrapper
const DroppableGroup = memo(({ children, columnId }: { children: React.ReactNode; columnId: string }) => {
  return <div data-column-id={columnId}>{children}</div>;
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

  const getPriorityColor = (priority: string) => {
    if (!priorities || priorities.length === 0) return '#808080';
    const priorityOption = priorities.find((p: any) => p.name === priority);
    return priorityOption?.color || '#808080';
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
        taskViewMode === 'shrink' ? 'h-20' : 
        'h-20'
      } ${taskIndex % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'} 
      hover:bg-blue-50 dark:hover:bg-blue-900 transition-all duration-200 ease-out ${
        (isDragging || isThisTaskDragging) ? '!border-2 !border-blue-500 !shadow-lg !rounded-lg bg-blue-50 dark:bg-blue-900' : ''
      } ${isSelected ? 'bg-blue-100 dark:bg-blue-800 ring-2 ring-blue-400' : ''} ${
        highlightedTaskId === task.id ? 'bg-yellow-200 dark:bg-yellow-800 ring-2 ring-yellow-400 dark:ring-yellow-600 ring-inset' : ''
      }`}
      onClick={handleClick}
    >
      {/* Drag handle */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity">
        <RowHandle
          taskId={task.id}
          taskTitle={task.title}
          taskIndex={taskIndex}
          onRowReorder={() => {}}
        />
      </div>

      {/* Task content */}
      <div className={`flex items-center gap-2 ${taskViewMode === 'compact' ? '' : 'h-full'} ml-6 pr-2`}>


        {/* Priority dot */}
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: getPriorityColor(task.priority) }}
          title={task.priority}
        />

        {/* Task info */}
        <div className="flex-1 min-w-0">
          <div className={`font-medium text-gray-900 dark:text-gray-100 truncate ${
            taskViewMode === 'compact' ? 'text-sm' : ''
          }`}>
            {task.title}
          </div>
          {taskViewMode !== 'compact' && (
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {task.ticket}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onCopyTask && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopyTask(task);
              }}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
              title="Copy task"
            >
              <Copy className="w-4 h-4" />
            </button>
          )}
          {onRemoveTask && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemoveTask(task.id, e);
              }}
              className="p-1 hover:bg-red-100 dark:hover:bg-red-900 rounded text-red-600 dark:text-red-400"
              title="Delete task"
            >
              <Trash2 className="w-4 h-4" />
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
  sensors,
  onDragStart,
  onDragEnd,
  onDragOver,
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
      
      {/* Task List with DnD */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
      >
        <SortableContext 
          items={visibleTasks.map(task => task.id)} 
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
                  isVisible={((activeDragItem as SortableTaskRowItem)?.type === 'task-row-reorder') && 
                    activeDragItem && 
                    (activeDragItem as SortableTaskRowItem).task.columnId !== columnId}
                />
                
                {/* Tasks */}
                {tasks.map((task, taskIndex) => (
                  <TaskRow
                    key={task.id}
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
      </DndContext>
    </div>
  );
});

GanttTaskList.displayName = 'GanttTaskList';

export default GanttTaskList;
