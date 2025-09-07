import React, { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, MoreVertical, X, GripVertical } from 'lucide-react';
import { Column, Task, TeamMember, PriorityOption, CurrentUser } from '../types';
import { TaskViewMode } from '../utils/userPreferences';
import TaskCard from './TaskCard';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';

interface KanbanColumnProps {
  column: Column;
  filteredTasks: Task[];
  members: TeamMember[];
  currentUser?: CurrentUser | null;
  selectedMembers: string[];
  selectedTask: Task | null;
  draggedTask: Task | null;
  draggedColumn: Column | null;
  dragPreview?: {
    targetColumnId: string;
    insertIndex: number;
    isCrossColumn?: boolean;
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
  currentUser,
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
    // Only accept drops if it's a cross-column move OR if this column would be empty after drag
    // This fixes the issue where single-task columns become undraggable
    disabled: draggedTask?.columnId === column.id && filteredTasks.length > 1
  });

  // Simplified: Only one main droppable area per column
  // The precise positioning will be handled by task-to-task collision detection

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
    const taskElements: React.ReactNode[] = [];
    
    // Simple approach: render tasks in order with minimal changes
    const tasksToRender = [...filteredTasks].sort((a, b) => (a.position || 0) - (b.position || 0));
    
    // Check if we should show insertion preview for cross-column moves
    const shouldShowInsertionPreview = 
      draggedTask && 
      dragPreview && 
      dragPreview.targetColumnId === column.id && 
      draggedTask.columnId !== column.id; // Only for cross-column moves
    
    tasksToRender.forEach((task, index) => {
      const member = members.find(m => m.id === task.memberId);
      if (!member) return;

      const isBeingDragged = draggedTask?.id === task.id;
      
      // Show insertion gap BEFORE this task if needed
      if (shouldShowInsertionPreview && dragPreview.insertIndex === index) {
        taskElements.push(
          <div
            key={`insertion-preview-${index}`}
            className="transition-all duration-200 ease-out mb-3"
          >
            <div className="h-16 bg-blue-100 border-2 border-dashed border-blue-300 rounded-lg flex items-center justify-center">
              <div className="text-blue-600 text-sm font-medium flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                Drop here
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              </div>
            </div>
          </div>
        );
      }
      
      taskElements.push(
        <div
          key={task.id}
          className={`transition-all duration-200 ease-out mb-3 ${
            isBeingDragged 
              ? 'opacity-50' // Simple fade when dragging - keep layout stable
              : 'opacity-100'
          }`}
        >
          <TaskCard
            task={task}
            member={member}
            members={members}
            currentUser={currentUser}
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
    
    // Show insertion gap at the END if needed
    if (shouldShowInsertionPreview && dragPreview.insertIndex >= tasksToRender.length) {
      taskElements.push(
        <div
          key={`insertion-preview-end`}
          className="transition-all duration-200 ease-out mb-3"
        >
          <div className="h-16 bg-blue-100 border-2 border-dashed border-blue-300 rounded-lg flex items-center justify-center">
            <div className="text-blue-600 text-sm font-medium flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              Drop here
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
      );
    }
    
    return taskElements;
  }, [filteredTasks, members, onRemoveTask, onEditTask, onCopyTask, onTaskDragStart, onTaskDragEnd, onSelectTask, draggedTask, dragPreview, column.id]);

  const isBeingDraggedOver = draggedColumn && draggedColumn.id !== column.id;
  
  // Use only sortable ref for the main column container

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={`sortable-item bg-gray-50 rounded-lg p-4 flex flex-col min-h-[200px] transition-all duration-200 ease-in-out ${
        isDragging ? 'opacity-50 scale-95 shadow-2xl transform rotate-2' : ''
      } ${
        isOver && draggedTask && draggedTask.columnId !== column.id ? 'ring-2 ring-blue-400 bg-blue-50 border-2 border-blue-400' : 'hover:bg-gray-100 border border-transparent'
      }`}
      {...attributes}
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
          {/* Tiny drag handle for admins only */}
          {isAdmin && (
            <div
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-200 transition-colors opacity-50 hover:opacity-100"
              title="Drag to reorder column"
            >
              <GripVertical size={12} className="text-gray-400" />
            </div>
          )}
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

      <div className="flex-1 min-h-[150px]">
        {/* Calculate if this column is truly empty (excluding dragged task) */}
        {(() => {
          const originalTaskCount = draggedTask 
            ? filteredTasks.filter(task => task.id !== draggedTask.id).length
            : filteredTasks.length;
          // CRITICAL FIX: Don't switch to empty mode if the dragged task is from THIS column
          // This prevents losing the SortableContext and activeData.type
          const isDraggingFromThisColumn = draggedTask?.columnId === column.id;
          return originalTaskCount === 0 && !isDraggingFromThisColumn;
        })() ? (
          /* Empty column - no SortableContext to avoid interference */
          <div className="min-h-[100px] pb-4">
            <div 
              ref={setDroppableRef}
              className={`h-full w-full min-h-[200px] flex flex-col items-center justify-center transition-all duration-200 ${
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
            {/* Simplified main task area - single droppable zone */}
            <div 
              ref={setDroppableRef}
              className={`min-h-[200px] pb-4 flex-1 transition-colors duration-200 ${
                isOver ? 'bg-blue-50 rounded-lg' : ''
              }`}
            >
              <div>
                {renderTaskList()}
              </div>
            </div>
            
            {/* Dedicated bottom drop zone for reliable bottom drops */}
            <BottomDropZone columnId={column.id} />
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

// Dedicated bottom drop zone component for reliable collision detection (invisible to user)
const BottomDropZone: React.FC<{ columnId: string }> = ({ columnId }) => {
  const { setNodeRef } = useDroppable({
    id: `${columnId}-bottom`,
    data: {
      type: 'column-bottom',
      columnId: columnId
    }
  });

  // Invisible drop zone - only for collision detection, no visual feedback
  return (
    <div
      ref={setNodeRef}
      className="h-16 w-full"
    />
  );
};

