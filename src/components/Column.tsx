import React, { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  onRemoveColumn: (columnId: string) => Promise<void>;
  onAddColumn: (afterColumnId: string) => void;
  showColumnDeleteConfirm?: string | null;
  onConfirmColumnDelete?: (columnId: string) => Promise<void>;
  onCancelColumnDelete?: () => void;
  getColumnTaskCount?: (columnId: string) => number;
  onTaskDragStart: (task: Task) => void;
  onTaskDragEnd: () => void;
  onTaskDragOver: (e: React.DragEvent, columnId: string, index: number) => void;
  onSelectTask: (task: Task | null) => void;
  onTaskDrop: (columnId: string, index: number) => void;
  isAdmin?: boolean;
  taskViewMode?: TaskViewMode;
  availablePriorities?: PriorityOption[];
  onTaskEnterMiniMode?: () => void;
  onTaskExitMiniMode?: () => void;
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
  showColumnDeleteConfirm,
  onConfirmColumnDelete,
  onCancelColumnDelete,
  getColumnTaskCount,
  onTaskDragStart,
  onTaskDragEnd,
  onTaskDragOver,
  onSelectTask,
  onTaskDrop,
  isAdmin = false,
  taskViewMode = 'expand',
  availablePriorities = [],
  onTaskEnterMiniMode,
  onTaskExitMiniMode
}: KanbanColumnProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(column.title);
  const [showMenu, setShowMenu] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [deleteButtonRef, setDeleteButtonRef] = useState<HTMLButtonElement | null>(null);
  const [deleteButtonPosition, setDeleteButtonPosition] = useState<{top: number, left: number} | null>(null);
  const [shouldSelectAll, setShouldSelectAll] = useState(false);
  const columnHeaderRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

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

  // Handle text selection when editing starts via click
  React.useEffect(() => {
    if (isEditing && shouldSelectAll) {
      // Multiple attempts to ensure input is ready and focused
      const selectText = () => {
        if (editInputRef.current) {
          editInputRef.current.focus();
          editInputRef.current.select();
          setShouldSelectAll(false); // Reset flag
          return true;
        }
        return false;
      };

      // Try immediately
      if (!selectText()) {
        // If failed, try with small delay
        setTimeout(() => {
          if (!selectText()) {
            // If still failed, try one more time with longer delay
            setTimeout(selectText, 50);
          }
        }, 10);
      }
    }
  }, [isEditing, shouldSelectAll]);

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
    disabled: !isAdmin || isEditing,  // Disable drag when editing THIS column
    data: {
      type: 'column',
      column: column
    }
  });

  // Use droppable hook for middle task area - only for cross-column moves
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `${column.id}-middle`,
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

  // Separate droppable for top area (drop at position 0) - enabled for all moves
  const { setNodeRef: setTopDropRef, isOver: isTopOver } = useDroppable({
    id: `${column.id}-top`,
    data: {
      type: 'column-top',
      columnId: column.id
    },
    // Now enabled for both same-column and cross-column moves
    disabled: false
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
    const tasksToRender = [...filteredTasks].sort((a, b) => (a.position || 0) - (b.position || 0));
    
    tasksToRender.forEach((task, index) => {
      const member = members.find(m => m.id === task.memberId);
      if (!member) return;

      // Add enhanced drag placeholder before this task if needed
      if (isTargetColumn && insertIndex === index) {
        taskElements.push(
          <div
            key={`placeholder-${index}`}
            className="h-16 bg-gradient-to-r from-blue-100 to-indigo-100 border-2 border-dashed border-blue-500 rounded-lg flex items-center justify-center transition-all duration-300 my-3 animate-pulse shadow-sm"
          >
            <div className="flex items-center gap-2 text-blue-700 text-sm font-semibold">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
              <span>Drop task here</span>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            </div>
          </div>
        );
      }

      // Add the actual task (hide if being dragged)
      const isBeingDragged = draggedTask?.id === task.id;
      
      taskElements.push(
        <div
          key={task.id}
          className={`transition-all duration-300 ease-in-out ${
            isBeingDragged 
              ? 'opacity-0 pointer-events-none h-0 overflow-hidden !my-0' 
              : isTargetColumn && insertIndex <= index
                ? 'mb-2.5 transform translate-y-2' // Shift down if insertion point is above
                : 'mb-2.5'
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
    
    // Add enhanced placeholder at the end when specifically dropping at end
    if (isTargetColumn && insertIndex === tasksToRender.length) {
      taskElements.push(
        <div
          key="placeholder-end"
          className="h-16 bg-gradient-to-r from-blue-100 to-indigo-100 border-2 border-dashed border-blue-500 rounded-lg flex items-center justify-center transition-all duration-300 my-3 animate-pulse shadow-sm"
        >
          <div className="flex items-center gap-2 text-blue-700 text-sm font-semibold">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
            <span>Drop task here</span>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
          </div>
        </div>
      );
    }
    
    return taskElements;
  }, [filteredTasks, members, onRemoveTask, onEditTask, onCopyTask, onTaskDragStart, onTaskDragEnd, onSelectTask, dragPreview, draggedTask, column.id]);

  const isBeingDraggedOver = draggedColumn && draggedColumn.id !== column.id;
  
  // Use only sortable ref for the main column container

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={`sortable-item bg-gray-50 rounded-lg p-4 flex flex-col min-h-[200px] transition-all duration-200 ease-in-out ${
        isDragging ? 'opacity-50 scale-95 shadow-2xl transform rotate-2' : ''
      } ${
        (isOver || isTopOver || isBottomOver) && draggedTask && draggedTask.columnId !== column.id ? 'ring-2 ring-blue-400 bg-blue-50 border-2 border-blue-400' : 'hover:bg-gray-100 border border-transparent'
      }`}
      {...(isAdmin ? { ...attributes, ...listeners } : {})}
    >
      {/* Column Warning Message */}
      {columnWarnings && columnWarnings[column.id] && (
        <div className="mb-3 bg-yellow-100 border border-yellow-400 text-yellow-800 px-3 py-2 rounded-md text-sm font-medium flex items-start justify-between">
          <div className="flex items-start gap-2">
            <span className="text-yellow-600">⚠️</span>
            <div className="whitespace-pre-line">
              {columnWarnings[column.id].split('\n').map((line, index) => (
                <div key={index}>
                  {line.includes('**Tip:**') ? (
                    <>
                      {line.split('**Tip:**')[0]}
                      <span className="font-bold">Tip:</span>
                      {line.split('**Tip:**')[1]}
                    </>
                  ) : (
                    line
                  )}
                </div>
              ))}
            </div>
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
      
      <div ref={columnHeaderRef} className="flex items-center justify-between mb-4" data-column-header>
        <div className="flex items-center gap-2 flex-1">
          {isEditing ? (
            <form onSubmit={handleTitleSubmit} className="flex-1" onClick={(e) => e.stopPropagation()}>
              <input
                ref={editInputRef}
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
                data-column-title
                className={`text-lg font-semibold text-gray-700 select-none ${
                  isAdmin && showColumnDeleteConfirm === null
                    ? 'cursor-move hover:text-gray-900' 
                    : 'cursor-default'
                }`}
                onClick={() => {
                  if (isAdmin) {
                    setShouldSelectAll(true);
                    setIsEditing(true);
                  }
                }}
                title={
                  isAdmin && showColumnDeleteConfirm === null 
                    ? 'Click to edit, drag to reorder' 
                    : isAdmin && showColumnDeleteConfirm !== null
                    ? 'Dragging disabled during confirmation'
                    : draggedTask
                    ? 'Hover here to enter cross-board mode'
                    : 'Column title'
                }
              >
                {column.title}
              </h3>
              <button
                data-column-header
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
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-[200]">
                <button
                  onClick={() => {
                    onAddColumn(column.id);
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
                  disabled={isSubmitting}
                >
                  Add Column
                </button>
                <button
                  ref={setDeleteButtonRef}
                  onClick={(e) => {
                    // Capture column header position for dialog alignment
                    if (columnHeaderRef.current) {
                      const headerRect = columnHeaderRef.current.getBoundingClientRect();
                      setDeleteButtonPosition({
                        top: headerRect.bottom + 8,
                        left: headerRect.left
                      });
                    }
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
          <div className="min-h-[100px] pb-4">
            <div className={`h-full w-full min-h-[200px] flex flex-col items-center justify-center transition-all duration-200 ${
              draggedTask && draggedTask.columnId !== column.id 
                ? `border-4 border-dashed rounded-lg ${
                    isOver ? 'bg-blue-100 border-blue-500 scale-105 shadow-lg' : 'bg-blue-50 border-blue-400'
                  }` 
                : 'border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:border-gray-400 hover:bg-gray-100'
            }`}>
                              {draggedTask && draggedTask.columnId !== column.id ? (
                  <div className={`text-center transition-all duration-200 ${
                    isOver ? 'text-blue-800 scale-110' : 'text-blue-600'
                  }`}>
                    <div className={`text-4xl mb-2 ${isOver ? 'animate-bounce' : ''}`}>📋</div>
                    <div className="font-semibold text-lg">
                      {isOver ? 'Drop task here!' : 'Drop zone'}
                    </div>
                    {isOver && <div className="text-sm opacity-75 mt-1">Release to place task</div>}
                  </div>
                ) : (
                  <div className="text-gray-500 text-center">
                    <div className="text-3xl mb-2 opacity-50">📋</div>
                    <div className="text-sm font-medium">No tasks yet</div>
                    <div className="text-xs opacity-75 mt-1">Drag tasks here</div>
                  </div>
                )}
            </div>
          </div>
        ) : (
          /* Column with tasks - use SortableContext */
          <SortableContext
            items={[...filteredTasks]
              .sort((a, b) => (a.position || 0) - (b.position || 0))
              .map(task => task.id) // Use filtered tasks to match what's actually rendered
            }
            strategy={verticalListSortingStrategy}
          >
            <div className="min-h-[100px] pb-4">
              {/* Enhanced top drop zone for position 0 */}
              <div 
                ref={setTopDropRef}
                className={`transition-all duration-200 ${
                  isTopOver 
                    ? 'h-8 bg-blue-100 border-2 border-dashed border-blue-500 rounded-lg mb-2 flex items-center justify-center' 
                    : 'h-2 bg-transparent'
                }`}
              >
                {isTopOver && (
                  <div className="text-blue-600 text-sm font-medium animate-pulse">
                    📌 Drop at top
                  </div>
                )}
              </div>
              
              {/* Main task area with separate droppable */}
              <div 
                ref={setDroppableRef}
                className={`transition-colors ${
                  isOver ? 'bg-blue-50 rounded-lg' : ''
                }`}
              >
                {renderTaskList()}
              </div>
              
              {/* Bottom drop zone for end detection */}
              <div 
                ref={setBottomDropRef}
                className={`h-4 w-full transition-colors ${
                  isBottomOver ? 'bg-blue-100 border-2 border-dashed border-blue-400 rounded-lg' : 'bg-transparent'
                }`}
              />
            </div>
          </SortableContext>
        )}
      </div>

      {/* Column Delete Confirmation Dialog - Small popup like BoardTabs */}
      {showColumnDeleteConfirm === column.id && deleteButtonPosition && onConfirmColumnDelete && onCancelColumnDelete && getColumnTaskCount && createPortal(
        <div 
          className="delete-confirmation fixed bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-[9999] min-w-[220px]"
          style={{
            top: `${deleteButtonPosition.top}px`,
            left: `${deleteButtonPosition.left}px`,
          }}
        >
          <div className="text-sm text-gray-700 mb-3">
            {(() => {
              const taskCount = getColumnTaskCount(column.id);
              return `Delete column and ${taskCount} task${taskCount !== 1 ? 's' : ''}?`;
            })()}
          </div>
          <div className="flex space-x-2 justify-end">
            <button
              onClick={() => {
                onCancelColumnDelete();
                setDeleteButtonPosition(null);
              }}
              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
            >
              No
            </button>
            <button
              onClick={() => {
                onConfirmColumnDelete(column.id);
                setDeleteButtonPosition(null);
              }}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Yes
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
