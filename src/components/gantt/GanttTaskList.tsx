import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Task, Columns } from '../../types';
import { Copy, Trash2 } from 'lucide-react';


interface GanttTaskListProps {
  columns: Columns;
  groupedTasks: { [columnId: string]: any[] };
  selectedTask?: Task | null;
  selectedTasks: string[];
  isMultiSelectMode: boolean;
  isRelationshipMode: boolean;
  selectedParentTask: string | null;
  priorities: any[];
  taskColumnWidth: number;
  taskViewMode: string;
  onSelectTask: (task: Task | null) => void;
  onTaskSelect: (taskId: string) => void;
  onRelationshipClick: (taskId: string) => void;
  onCopyTask?: (task: Task) => Promise<void>;
  onRemoveTask?: (taskId: string, event?: React.MouseEvent) => Promise<void>;
  highlightedTaskId?: string | null;
  siteSettings?: any;
  isAdmin?: boolean;
}

// Individual task row component
const TaskRow = memo(({ 
  task, 
  taskIndex,
  isSelected,
  isMultiSelectMode,
  isRelationshipMode,
  taskViewMode,
  selectedTask,
  onSelectTask,
  onTaskSelect,
  onRelationshipClick,
  onCopyTask,
  onRemoveTask,
  highlightedTaskId,
  isAdmin = false,
}: any) => {
  const { t } = useTranslation('common');
  const isTaskDetailsOpen = selectedTask?.id === task.id;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (isRelationshipMode) {
      onRelationshipClick(task.id);
    } else if (isMultiSelectMode) {
      onTaskSelect(task.id);
    } else {
      // Toggle: if clicking the same task that's already selected, close TaskDetails
      if (selectedTask && selectedTask.id === task.id) {
        onSelectTask(null);
      } else {
        // Convert GanttTask back to Task format with string dates
        const taskForSelection = {
          ...task,
          startDate: task.startDate ? `${task.startDate.getFullYear()}-${String(task.startDate.getMonth() + 1).padStart(2, '0')}-${String(task.startDate.getDate()).padStart(2, '0')}` : '',
          dueDate: task.endDate ? `${task.endDate.getFullYear()}-${String(task.endDate.getMonth() + 1).padStart(2, '0')}-${String(task.endDate.getDate()).padStart(2, '0')}` : task.dueDate || ''
        };
        onSelectTask(taskForSelection);
      }
    }
  };

  return (
    <div 
      key={`task-info-${task.id}`}
      data-task-id={task.id}
      className={`relative p-2 border-b border-gray-100 ${
        taskViewMode === 'compact' ? 'h-12' : 
        taskViewMode === 'shrink' ? 'h-14' : 
        'h-20'
      } ${taskIndex % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'} 
      hover:bg-blue-50 dark:hover:bg-blue-900 transition-all duration-200 ease-out ${
        isSelected && highlightedTaskId !== task.id
          ? 'bg-blue-100 dark:bg-blue-800 ring-2 ring-blue-400'
          : ''
      }`}
      onClick={handleClick}
    >
      {/* Main content area with proper flex layout */}
      <div className="flex items-center gap-2 pr-2">
        <button
          className={`text-left flex-1 min-w-0 rounded px-1 py-1 transition-all duration-300 ${
            highlightedTaskId === task.id
              ? 'bg-yellow-200 dark:bg-yellow-800 ring-2 ring-yellow-400 dark:ring-yellow-600 ring-inset'
              : isTaskDetailsOpen
                ? 'bg-gray-100 dark:bg-gray-700 ring-1 ring-amber-400 dark:ring-amber-500 ring-inset'
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
              title={t('gantt.copyTask')}
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
              title={isAdmin ? t('gantt.deleteTaskAdminHint') : t('gantt.deleteTask')}
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
  groupedTasks,
  selectedTask,
  selectedTasks,
  isMultiSelectMode,
  isRelationshipMode,
  taskColumnWidth,
  taskViewMode,
  onSelectTask,
  onTaskSelect,
  onRelationshipClick,
  onCopyTask,
  onRemoveTask,
  highlightedTaskId,
  isAdmin = false,
}: GanttTaskListProps) => {
  const { t } = useTranslation('common');
  return (
    <div 
      className="sticky left-0 z-10 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700"
      style={{ width: `${taskColumnWidth}px` }}
    >
      {/* Task Creation Header */}
      <div className="h-12 bg-blue-50 dark:bg-blue-900 border-b-4 border-blue-400 dark:border-blue-500 flex items-center justify-end px-3">
        <span className="text-sm text-blue-700 dark:text-blue-200 font-medium">{t('gantt.addTasksHere')}</span>
      </div>
      
      {/* Task List */}
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
          <div key={columnId} data-column-id={columnId}>
            {/* Column separator */}
            {groupIndex > 0 && (
              <div className="bg-pink-300 dark:bg-pink-600 h-0.5 w-full flex-shrink-0"></div>
            )}
            
            {/* Tasks */}
            {tasks.map((task, taskIndex) => (
              <TaskRow
                key={`tasklist-task-${task.id}-${columnId}-${taskIndex}`}
                task={task}
                taskIndex={taskIndex}
                isSelected={selectedTasks.includes(task.id)}
                isMultiSelectMode={isMultiSelectMode}
                isRelationshipMode={isRelationshipMode}
                taskViewMode={taskViewMode}
                selectedTask={selectedTask}
                onSelectTask={onSelectTask}
                onTaskSelect={onTaskSelect}
                onRelationshipClick={onRelationshipClick}
                onCopyTask={onCopyTask}
                onRemoveTask={onRemoveTask}
                highlightedTaskId={highlightedTaskId}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
});

GanttTaskList.displayName = 'GanttTaskList';

export default GanttTaskList;
