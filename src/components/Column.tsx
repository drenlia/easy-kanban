import React, { useState, useCallback } from 'react';
import { Plus, MoreVertical, X } from 'lucide-react';
import { Column, Task, TeamMember, PriorityOption } from '../types';
import { TaskViewMode } from '../utils/userPreferences';
import TaskCard from './TaskCard';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';

interface KanbanColumnProps {
  column: Column;
  filteredTasks: Task[];
  members: TeamMember[];
  selectedMembers: string[];
  selectedTask: Task | null;
  draggedTask: Task | null;
  draggedColumn: Column | null;
  dragPreview?: {
    targetColumnId: string;
    insertIndex: number;
  } | null;
  onAddTask: (columnId: string) => void;
  columnWarnings?: {[columnId: string]: string};
  onDismissColumnWarning?: (columnId: string) => void;
  onRemoveTask: (taskId: string) => void;
  onEditTask: (task: Task) => void;
  onCopyTask: (task: Task) => void;
  onEditColumn: (columnId: string, title: string) => void;
  onRemoveColumn: (columnId: string) => void;
  onAddColumn: () => void;
  onTaskDragStart: (task: Task) => void;
  onTaskDragEnd: () => void;
  onTaskDragOver: (e: React.DragEvent, columnId: string, index: number) => void;
  onSelectTask: (task: Task | null) => void;
  onTaskDrop: (columnId: string, index: number) => void;
  isAdmin?: boolean;
  taskViewMode?: TaskViewMode;
  availablePriorities?: PriorityOption[];
}

export default function KanbanColumn({
  column,
  filteredTasks,
  members,
  selectedMembers,
  selectedTask,
  draggedTask,
  draggedColumn,
  dragPreview,
  onAddTask,
  columnWarnings,
  onDismissColumnWarning,
  onRemoveTask,
  onEditTask,
  onCopyTask,
  onEditColumn,
  onRemoveColumn,
  onAddColumn,
  onTaskDragStart,
  onTaskDragEnd,
  onTaskDragOver,
  onSelectTask,
  onTaskDrop,
  isAdmin = false,
  taskViewMode = 'expand',
  availablePriorities = []
}: KanbanColumnProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(column.title);
  const [showMenu, setShowMenu] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // Auto-close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showMenu) {
        const target = event.target as HTMLElement;
        // Check if click is outside the menu button and menu content
        if (!target.closest('.column-menu-container')) {
          setShowMenu(false);
        }
      }
    };

    // Add event listener when menu is open
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    // Cleanup event listener
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  // Use @dnd-kit sortable hook for columns (Admin only)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: column.id, 
    disabled: !isAdmin || isEditing  // Disable drag when editing THIS column
  });

  // Use droppable hook for task drops - only for cross-column moves
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: column.id,
    data: {
      type: 'column',
      columnId: column.id
    },
    // Only accept drops if it's a cross-column move
    disabled: draggedTask?.columnId === column.id
  });

  // Separate droppable for bottom area (drop at end) - only for cross-column moves
  const { setNodeRef: setBottomDropRef, isOver: isBottomOver } = useDroppable({
    id: `${column.id}-bottom`,
    data: {
      type: 'column-bottom',
      columnId: column.id
    },
    // Only accept drops if it's a cross-column move
    disabled: draggedTask?.columnId === column.id
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Note: Now using filteredTasks prop instead of calculating here

  const handleTitleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    await onEditColumn(column.id, title.trim());
    setIsEditing(false);
    setIsSubmitting(false);
  };

  // Old HTML5 drag handlers removed - using @dnd-kit instead

  // Task drag handling moved to App level for cross-column support

  const handleAddTask = async () => {
    if (selectedMembers.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    await onAddTask(column.id);
    setIsSubmitting(false);
  };



  const renderTaskList = React.useCallback(() => {
    const isTargetColumn = dragPreview?.targetColumnId === column.id;
    const insertIndex = dragPreview?.insertIndex ?? -1;
    
    const taskElements: React.ReactNode[] = [];
    
    // Always render all tasks in correct order for proper drop zone positioning
    const tasksToRender = [...column.tasks].sort((a, b) => (a.position || 0) - (b.position || 0));
    
    tasksToRender.forEach((task, index) => {
      const member = members.find(m => m.id === task.memberId);
      if (!member) return;

      // Add drag placeholder before this task if needed
      if (isTargetColumn && insertIndex === index) {
        taskElements.push(
          <div
            key={`placeholder-${index}`}
            className="h-20 bg-blue-100 border-2 border-dashed border-blue-300 rounded-lg flex items-center justify-center transition-all duration-200"
          >
            <div className="text-blue-600 text-sm font-medium">Drop here</div>
          </div>
        );
      }

      // Add the actual task (hide if being dragged or filtered out)
      const isBeingDragged = draggedTask?.id === task.id;
      const isFilteredOut = !filteredTasks.some(t => t.id === task.id);
      
      taskElements.push(
        <div
          key={task.id}
          className={`transition-all duration-200 ${
            isBeingDragged ? 'opacity-50 scale-95' : ''
          } ${
            isFilteredOut ? 'h-0 overflow-hidden opacity-0 pointer-events-none !my-0' : '' // Hide filtered tasks with zero height and spacing
          }`}
        >
          <TaskCard
            task={task}
            member={member}
            members={members}
            onRemove={onRemoveTask}
            onEdit={onEditTask}
            onCopy={onCopyTask}
            onDragStart={onTaskDragStart}
            onDragEnd={onTaskDragEnd}
            onSelect={onSelectTask}
            isDragDisabled={false}
            taskViewMode={taskViewMode}
            availablePriorities={availablePriorities}
            selectedTask={selectedTask}
          />
        </div>
      );
    });
    
    // Add placeholder at the end only when specifically dropping at end
    if (isTargetColumn && insertIndex === tasksToRender.length) {
      taskElements.push(
        <div
          key="placeholder-end"
          className="h-20 bg-blue-100 border-2 border-dashed border-blue-300 rounded-lg flex items-center justify-center transition-all duration-200"
        >
          <div className="text-blue-600 text-sm font-medium">Drop here</div>
        </div>
      );
    }
    
    return taskElements;
  }, [filteredTasks, column.tasks, members, onRemoveTask, onEditTask, onCopyTask, onTaskDragStart, onTaskDragEnd, onSelectTask, dragPreview, draggedTask, column.id]);

  const isBeingDraggedOver = draggedColumn && draggedColumn.id !== column.id;
  
  // Combine refs for both sortable and droppable
  const combinedRef = useCallback((node: HTMLElement | null) => {
    setNodeRef(node);
    setDroppableRef(node);
  }, [setNodeRef, setDroppableRef]);

  return (
    <div 
      ref={combinedRef}
      style={style}
      className={`sortable-item bg-gray-50 rounded-lg p-4 flex flex-col min-h-[200px] transition-all duration-200 ease-in-out ${
        isDragging ? 'opacity-50 scale-95 shadow-2xl transform rotate-2' : ''
      } ${
        isOver && draggedTask && draggedTask.columnId !== column.id ? 'ring-2 ring-blue-400 bg-blue-50 border-2 border-blue-400' : 'hover:bg-gray-100 border border-transparent'
      }`}
      {...(isAdmin ? { ...attributes, ...listeners } : {})}
    >
      {/* Column Warning Message */}
      {columnWarnings && columnWarnings[column.id] && (
        <div className="mb-3 bg-yellow-100 border border-yellow-400 text-yellow-800 px-3 py-2 rounded-md text-sm font-medium flex items-start justify-between">
          <div className="flex items-start gap-2">
            <span className="text-yellow-600">⚠️</span>
            <span>{columnWarnings[column.id]}</span>
          </div>
          {onDismissColumnWarning && (
            <button
              onClick={() => onDismissColumnWarning(column.id)}
              className="ml-2 text-yellow-600 hover:text-yellow-800 transition-colors flex-shrink-0"
              title="Dismiss warning"
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}
      
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 flex-1">
          {isEditing ? (
            <form onSubmit={handleTitleSubmit} className="flex-1" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
                autoFocus
                onBlur={handleTitleSubmit}
                disabled={isSubmitting}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setTitle(column.title);
                    setIsEditing(false);
                  }
                }}
              />
            </form>
          ) : (
            <>
              <h3
                className={`text-lg font-semibold text-gray-700 ${
                  isAdmin 
                    ? 'cursor-move hover:text-gray-900' 
                    : 'cursor-default'
                }`}
                onClick={() => isAdmin && setIsEditing(true)}
                title={isAdmin ? 'Click to edit, drag to reorder' : 'Column title'}
              >
                {column.title}
              </h3>
              <button
                onClick={handleAddTask}
                disabled={selectedMembers.length === 0 || isSubmitting}
                title={selectedMembers.length > 0 ? 'Add Task' : 'Select a team member first'}
                className={`p-1 rounded-full transition-colors ${
                  selectedMembers.length > 0 && !isSubmitting
                    ? 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                    : 'text-gray-400 cursor-not-allowed'
                }`}
              >
                <Plus size={18} />
              </button>
            </>
          )}
        </div>
        
        {/* Column Management Menu - Admin Only */}
        {isAdmin && (
          <div className="relative column-menu-container">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 hover:bg-gray-200 rounded-full transition-colors"
              disabled={isSubmitting}
              title="Column management options"
            >
              <MoreVertical size={18} className="text-gray-500" />
            </button>
            
            {showMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10">
                <button
                  onClick={() => {
                    onAddColumn();
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
                  disabled={isSubmitting}
                >
                  Add Column
                </button>
                <button
                  onClick={() => {
                    onRemoveColumn(column.id);
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                  disabled={isSubmitting}
                >
                  Delete Column
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-[100px]">
        {filteredTasks.length === 0 ? (
          /* Empty column - no SortableContext to avoid interference */
          <div className="space-y-2 min-h-[100px] pb-4">
            <div className={`h-full w-full min-h-[100px] flex items-center justify-center transition-all duration-200 ${
              draggedTask && draggedTask.columnId !== column.id 
                ? `border-2 border-dashed rounded-lg ${
                    isOver ? 'bg-blue-100 border-blue-400' : 'bg-blue-50 border-blue-300'
                  }` 
                : 'border border-dashed border-gray-200 rounded-lg bg-gray-25'
            }`}>
                              {draggedTask && draggedTask.columnId !== column.id ? (
                  <div className={`font-medium transition-colors ${
                    isOver ? 'text-blue-700' : 'text-blue-600'
                  }`}>
                    {isOver ? 'Drop task here' : 'Drop zone'}
                  </div>
                ) : (
                  <div className="text-gray-400 text-sm font-medium">
                    Drop tasks here
                  </div>
                )}
            </div>
          </div>
        ) : (
          /* Column with tasks - use SortableContext */
          <SortableContext
            items={[...column.tasks]
              .sort((a, b) => (a.position || 0) - (b.position || 0))
              .map(task => task.id) // Always use ALL tasks for complete drop zone coverage
            }
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2 min-h-[100px] pb-4">
              {renderTaskList()}
              {/* Invisible bottom drop zone for end detection */}
              <div 
                ref={setBottomDropRef}
                className="h-4 w-full"
                style={{ pointerEvents: 'none' }}
              />
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}
