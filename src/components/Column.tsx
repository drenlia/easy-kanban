import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, MoreVertical, X, GripVertical, Archive } from 'lucide-react';
import { Column, Task, TeamMember, PriorityOption, CurrentUser, Tag } from '../types';
import { TaskViewMode } from '../utils/userPreferences';
import TaskCard from './TaskCard';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import { parseFinishedColumnNames } from '../utils/columnUtils';

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
  onEditColumn: (columnId: string, title: string, is_finished?: boolean, is_archived?: boolean) => void;
  siteSettings?: { [key: string]: string };
  onRemoveColumn: (columnId: string) => Promise<void>;
  onAddColumn: (afterColumnId: string) => void;
  showColumnDeleteConfirm?: string | null;
  onConfirmColumnDelete?: (columnId: string) => Promise<void>;
  onCancelColumnDelete?: () => void;
  getColumnTaskCount?: (columnId: string) => number;
  onTaskDragStart: (task: Task) => void;
  onTaskDragEnd: () => void;
  onTaskDragOver: (e: React.DragEvent, columnId: string, index: number) => void;
  onSelectTask: (task: Task | null, options?: { scrollToComments?: boolean }) => void;
  onTaskDrop: (columnId: string, index: number) => void;
  isAdmin?: boolean;
  taskViewMode?: TaskViewMode;
  availablePriorities?: PriorityOption[];
  availableTags?: Tag[];
  onTagAdd?: (taskId: string) => (tagId: string) => Promise<void>;
  onTagRemove?: (taskId: string) => (tagId: string) => Promise<void>;
  onTaskEnterMiniMode?: () => void;
  onTaskExitMiniMode?: () => void;
  boards?: any[]; // To get project identifier from board
  columns?: { [key: string]: { id: string; title: string; is_archived?: boolean; is_finished?: boolean } };
  
  // Task linking props
  isLinkingMode?: boolean;
  linkingSourceTask?: Task | null;
  onStartLinking?: (task: Task, startPosition: {x: number, y: number}) => void;
  onFinishLinking?: (targetTask: Task | null, relationshipType?: 'parent' | 'child' | 'related') => Promise<void>;
  
  // Hover highlighting props
  hoveredLinkTask?: Task | null;
  onLinkToolHover?: (task: Task) => void;
  onLinkToolHoverEnd?: () => void;
  getTaskRelationshipType?: (taskId: string) => 'parent' | 'child' | 'related' | null;
  
  // Network status
  isOnline?: boolean;
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
  siteSettings,
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
  availableTags = [],
  onTagAdd,
  onTagRemove,
  onTaskEnterMiniMode,
  onTaskExitMiniMode,
  boards,
  columns,
  
  // Task linking props
  isLinkingMode,
  linkingSourceTask,
  onStartLinking,
  onFinishLinking,
  
  // Hover highlighting props
  hoveredLinkTask,
  onLinkToolHover,
  onLinkToolHoverEnd,
  getTaskRelationshipType,
  
  // Network status
  isOnline = true // Default to true if not provided
}: KanbanColumnProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(column.title);
  const [isFinished, setIsFinished] = useState(column.is_finished || false);
  const [isArchived, setIsArchived] = useState(column.is_archived || false);
  const [showMenu, setShowMenu] = useState(false);

  // Reset state when editing starts
  useEffect(() => {
    if (isEditing) {
      setTitle(column.title);
      setIsFinished(column.is_finished || false);
      setIsArchived(column.is_archived || false);
    }
  }, [isEditing, column.title, column.is_finished, column.is_archived]);

  // Auto-detect finished column names when title changes
  useEffect(() => {
    if (isEditing && siteSettings?.DEFAULT_FINISHED_COLUMN_NAMES) {
      const finishedColumnNames = parseFinishedColumnNames(siteSettings.DEFAULT_FINISHED_COLUMN_NAMES);
      const shouldBeFinished = finishedColumnNames.some(finishedName => 
        finishedName.toLowerCase() === title.toLowerCase()
      );
      if (shouldBeFinished) {
        setIsFinished(true);
        setIsArchived(false); // Cannot be both finished and archived
      }
    }
  }, [title, isEditing, siteSettings?.DEFAULT_FINISHED_COLUMN_NAMES]);

  // Auto-detect archived column when title changes
  useEffect(() => {
    if (isEditing && title.toLowerCase() === 'archive') {
      setIsArchived(true);
      setIsFinished(false); // Cannot be both finished and archived
    }
  }, [title, isEditing]);

  // Handle mutual exclusivity between finished and archived
  useEffect(() => {
    if (isFinished && isArchived) {
      setIsArchived(false);
    }
  }, [isFinished]);

  useEffect(() => {
    if (isArchived && isFinished) {
      setIsFinished(false);
    }
  }, [isArchived]);
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

  // Auto-save and close when clicking outside the edit form
  React.useEffect(() => {
    const handleClickOutside = async (event: MouseEvent) => {
      if (isEditing && columnHeaderRef.current) {
        const target = event.target as HTMLElement;
        // Check if click is outside the column header (edit form)
        if (!columnHeaderRef.current.contains(target)) {
          // Save the changes
          if (title.trim() && !isSubmitting) {
            setIsSubmitting(true);
            await onEditColumn(column.id, title.trim(), isFinished, isArchived);
            setIsEditing(false);
            setIsSubmitting(false);
          }
        }
      }
    };

    // Add event listener when editing
    if (isEditing) {
      // Small delay to prevent immediate trigger from the click that started editing
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
    }

    // Cleanup event listener
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditing, title, isFinished, isArchived, isSubmitting, column.id, onEditColumn]);

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
    await onEditColumn(column.id, title.trim(), isFinished, isArchived);
    setIsEditing(false);
    setIsSubmitting(false);
  };

  // Old HTML5 drag handlers removed - using @dnd-kit instead

  // Task drag handling moved to App level for cross-column support

  const handleAddTask = async () => {
    if (isSubmitting) return;
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
            siteSettings={siteSettings}
            columnIsFinished={column.is_finished || false}
            columnIsArchived={column.is_archived || false}
            isDragDisabled={false}
            taskViewMode={taskViewMode}
            availablePriorities={availablePriorities}
            selectedTask={selectedTask}
            availableTags={availableTags}
            onTagAdd={onTagAdd ? onTagAdd(task.id) : undefined}
            onTagRemove={onTagRemove ? onTagRemove(task.id) : undefined}
            boards={boards}
            columns={columns}
            
            // Task linking props
            isLinkingMode={isLinkingMode}
            linkingSourceTask={linkingSourceTask}
            onStartLinking={onStartLinking}
            onFinishLinking={onFinishLinking}
            
            // Hover highlighting props
            hoveredLinkTask={hoveredLinkTask}
            onLinkToolHover={onLinkToolHover}
            onLinkToolHoverEnd={onLinkToolHoverEnd}
            getTaskRelationshipType={getTaskRelationshipType}
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
      className={`sortable-item bg-gray-50 dark:bg-gray-800 rounded-lg p-4 flex flex-col min-h-[200px] transition-all duration-200 ease-in-out ${
        isDragging ? 'opacity-50 scale-95 shadow-2xl transform rotate-2' : ''
      } ${
        isOver && draggedTask && draggedTask.columnId !== column.id ? 'ring-2 ring-blue-400 bg-blue-50 dark:bg-blue-900 border-2 border-blue-400' : 'hover:bg-gray-100 dark:hover:bg-gray-700 border border-transparent'
      }`}
      {...attributes}
    >
      {/* Column Warning Message */}
      {columnWarnings && columnWarnings[column.id] && (
        <div className="mb-3 bg-yellow-100 dark:bg-yellow-900 border border-yellow-400 dark:border-yellow-600 text-yellow-800 dark:text-yellow-200 px-3 py-2 rounded-md text-sm font-medium flex items-start justify-between">
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
            <form onSubmit={handleTitleSubmit} className="flex-1 space-y-3" onClick={(e) => e.stopPropagation()}>
              <input
                ref={editInputRef}
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                autoFocus
                disabled={isSubmitting}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setTitle(column.title);
                    setIsFinished(column.is_finished || false);
                    setIsArchived(column.is_archived || false);
                    setIsEditing(false);
                  }
                }}
              />
              
              {/* Finished Column Toggle */}
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-sm font-medium text-gray-700">Mark as Finished Column</span>
                  {isFinished && siteSettings?.DEFAULT_FINISHED_COLUMN_NAMES && (() => {
                    const finishedColumnNames = parseFinishedColumnNames(siteSettings.DEFAULT_FINISHED_COLUMN_NAMES);
                    const isAutoDetected = finishedColumnNames.some(finishedName => 
                      finishedName.toLowerCase() === title.toLowerCase()
                    );
                    return isAutoDetected ? (
                      <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
                        Auto-detected
                      </span>
                    ) : null;
                  })()}
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFinished}
                    onChange={(e) => setIsFinished(e.target.checked)}
                    className="sr-only peer"
                    disabled={isSubmitting}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                </label>
              </div>
              
              {/* Archived Column Toggle */}
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  <span className="text-sm font-medium text-gray-700">Mark as Archived Column</span>
                  {isArchived && title.toLowerCase() === 'archive' && (
                    <span className="text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded-full">
                      Auto-detected
                    </span>
                  )}
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isArchived}
                    onChange={(e) => setIsArchived(e.target.checked)}
                    className="sr-only peer"
                    disabled={isSubmitting}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                </label>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setTitle(column.title);
                    setIsFinished(column.is_finished || false);
                    setIsArchived(column.is_archived || false);
                    setIsEditing(false);
                  }}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !title.trim()}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-md transition-colors"
                >
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <h3
                data-column-title
                className={`text-lg font-semibold text-gray-700 select-none ${
                  isAdmin && showColumnDeleteConfirm === null
                    ? 'cursor-pointer hover:text-gray-900' 
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
                disabled={isSubmitting || !isOnline}
                title={!isOnline ? "Network Offline - Changes Disabled" : "Add Task"}
                className={`p-1 rounded-full transition-colors ${
                  !isSubmitting && isOnline
                    ? 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                    : 'text-gray-400 cursor-not-allowed'
                }`}
                data-tour-id="add-task-button"
              >
                <Plus size={18} />
              </button>
            </>
          )}
        </div>
        
        {/* Archive Icon - visible to all users */}
        {!!column.is_archived && (
          <div title="Archived Column" className="mr-1">
            <Archive 
              size={16} 
              className="text-orange-500 dark:text-orange-400" 
            />
          </div>
        )}
        
        {/* Column Management Menu - Admin Only */}
        {isAdmin && (
          <div className="relative column-menu-container flex items-center gap-1">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
              disabled={isSubmitting}
              title="Column management options"
            >
              <MoreVertical size={18} className="text-gray-500 dark:text-gray-400" />
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
          return originalTaskCount === 0 && !isDraggingFromThisColumn ? true : false;
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
                : 'border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600'
            }`}>
                              {draggedTask && draggedTask.columnId !== column.id ? (
                  <div className={`text-center transition-all duration-200 ${
                    isOver ? 'text-blue-800 dark:text-blue-200 scale-110' : 'text-blue-600 dark:text-blue-400'
                  }`}>
                    <div className={`text-4xl mb-2 ${isOver ? 'animate-bounce' : ''}`}>📋</div>
                    <div className="font-semibold text-lg">
                      {isOver ? 'Drop task here!' : 'Drop zone'}
                    </div>
                    {isOver && <div className="text-sm opacity-75 mt-1">Release to place task</div>}
                  </div>
                ) : (
                  <div className="text-gray-500 dark:text-gray-400 text-center">
                  </div>
                )}
            </div>
          </div>
        ) : (
          /* Column with tasks - use SortableContext */
          <SortableContext
            items={[...filteredTasks]
              .filter(task => task && task.id) // Filter out null/undefined tasks
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

