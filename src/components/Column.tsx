import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  
  // Sprint filtering
  selectedSprintId?: string | null;
  availableSprints?: any[]; // Optional: sprints passed from parent (avoids duplicate API calls)
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
  isOnline = true, // Default to true if not provided
  
  // Sprint filtering
  selectedSprintId = null,
  availableSprints
}: KanbanColumnProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(column.title);
  const [isFinished, setIsFinished] = useState(column.is_finished || false);
  const [isArchived, setIsArchived] = useState(column.is_archived || false);
  const [showMenu, setShowMenu] = useState(false);

  // Initialize state when editing starts (but only once per edit session)
  useEffect(() => {
    if (isEditing && !editingStartedRef.current) {
      // Mark that we've started editing
      editingStartedRef.current = true;
      
      setTitle(column.title);
      setIsFinished(column.is_finished || false);
      setIsArchived(column.is_archived || false);
      
      // Run auto-detection immediately when editing starts
      if (siteSettings?.DEFAULT_FINISHED_COLUMN_NAMES) {
        const finishedColumnNames = parseFinishedColumnNames(siteSettings.DEFAULT_FINISHED_COLUMN_NAMES);
        const shouldBeFinished = finishedColumnNames.some(finishedName => 
          finishedName.toLowerCase() === column.title.toLowerCase()
        );
        if (shouldBeFinished) {
          setIsFinished(true);
          setIsArchived(false);
        }
      }
    } else if (!isEditing) {
      // Reset the flag when we exit editing mode
      editingStartedRef.current = false;
    }
  }, [isEditing, column.title, column.is_finished, column.is_archived, siteSettings]);
  
  // Sync state with props when NOT editing
  useEffect(() => {
    if (!isEditing) {
      setTitle(column.title);
      setIsFinished(column.is_finished || false);
      setIsArchived(column.is_archived || false);
    }
  }, [column.title, column.is_finished, column.is_archived, isEditing]);

  // Auto-detect finished column names when title changes during editing
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
  const lastSaveTimestampRef = useRef<number>(0);
  const editingStartedRef = useRef<boolean>(false);
  
  // Refs to track latest state values for click-outside handler
  const titleRef = useRef(title);
  const isFinishedRef = useRef(isFinished);
  const isArchivedRef = useRef(isArchived);
  
  // Keep refs in sync with state
  useEffect(() => {
    titleRef.current = title;
    isFinishedRef.current = isFinished;
    isArchivedRef.current = isArchived;
  }, [title, isFinished, isArchived]);

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
          // Skip save if we just did an immediate save (within last 500ms)
          const now = Date.now();
          if (now - lastSaveTimestampRef.current < 500) {
            setIsEditing(false);
            return;
          }
          
          // Save the changes using latest values from refs
          const currentTitle = titleRef.current;
          const currentIsFinished = isFinishedRef.current;
          const currentIsArchived = isArchivedRef.current;
          
          if (currentTitle.trim() && !isSubmitting) {
            setIsSubmitting(true);
            await onEditColumn(column.id, currentTitle.trim(), currentIsFinished, currentIsArchived);
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
  }, [isEditing, isSubmitting, column.id, onEditColumn]);

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

  // Use droppable hook for the column container itself - for column-to-column drops
  const { setNodeRef: setColumnDroppableRef, isOver: isColumnOver } = useDroppable({
    id: column.id, // Use column ID directly for column-to-column drops
    data: {
      type: 'column',
      column: column,
      columnId: column.id
    },
    // Only disable when dragging a task (not when dragging a column - we need column drops to work!)
    disabled: !!draggedTask && !draggedColumn
  });

  // Use droppable hook for the top drop zone - shows "Drop here" above column header
  const { setNodeRef: setTopDropZoneRef, isOver: isTopDropZoneOver } = useDroppable({
    id: `${column.id}-top-drop`,
    data: {
      type: 'column-top',
      column: column,
      columnId: column.id
    },
    // Only active when dragging a column (not the same column)
    disabled: !draggedColumn || draggedColumn.id === column.id
  });

  // Use droppable hook for middle task area - only for cross-column task moves
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `${column.id}-middle`,
    data: {
      type: 'column-middle',
      columnId: column.id
    },
    // Only accept drops if it's a cross-column move OR if this column would be empty after drag
    // This fixes the issue where single-task columns become undraggable
    // Disable when dragging a task from this column OR when dragging a column (use column droppable instead)
    disabled: (draggedTask?.columnId === column.id && filteredTasks.length > 1) || !!draggedColumn
  });

  // Simplified: Only one main droppable area per column
  // The precise positioning will be handled by task-to-task collision detection

  const style = {
    // CRITICAL: Prevent ALL columns from shifting during drag
    // Only the dragged column should move (via DragOverlay), all others stay in place
    // When dragging a column, rectSortingStrategy tries to shift other columns - we prevent this
    transform: (draggedColumn && draggedColumn.id !== column.id) 
      ? 'none'  // Other columns: no transform (stay in place)
      : (isDragging 
        ? 'none'  // Dragged column: no transform (shown in DragOverlay instead)
        : CSS.Transform.toString(transform)),  // Normal state: apply transform
    // CRITICAL: Disable transition during drag for smooth mouse following
    transition: (draggedColumn && draggedColumn.id !== column.id) || isDragging 
      ? 'none' 
      : transition,
    // Ensure smooth rendering during drag
    backfaceVisibility: 'hidden' as const,
    WebkitBackfaceVisibility: 'hidden' as const,
  };

  // Note: Now using filteredTasks prop instead of calculating here

  const handleTitleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Use refs to get latest values (in case auto-detection just ran)
    const currentTitle = titleRef.current;
    const currentIsFinished = isFinishedRef.current;
    const currentIsArchived = isArchivedRef.current;
    
    if (!currentTitle.trim() || isSubmitting) return;

    setIsSubmitting(true);
    await onEditColumn(column.id, currentTitle.trim(), currentIsFinished, currentIsArchived);
    setIsEditing(false);
    setIsSubmitting(false);
  };

  // Handle immediate save when toggling checkboxes
  const handleFinishedToggle = async (checked: boolean) => {
    if (isSubmitting) return;
    
    setIsFinished(checked);
    if (checked) {
      setIsArchived(false); // Cannot be both
    }
    
    setIsSubmitting(true);
    lastSaveTimestampRef.current = Date.now(); // Mark that we just saved
    await onEditColumn(column.id, title.trim(), checked, checked ? false : isArchived);
    setIsSubmitting(false);
  };

  const handleArchivedToggle = async (checked: boolean) => {
    if (isSubmitting) return;
    
    setIsArchived(checked);
    if (checked) {
      setIsFinished(false); // Cannot be both
    }
    
    setIsSubmitting(true);
    lastSaveTimestampRef.current = Date.now(); // Mark that we just saved
    await onEditColumn(column.id, title.trim(), checked ? false : isFinished, checked);
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
    
    // PERFORMANCE OPTIMIZATION: When dragging a column, render a simplified placeholder
    // instead of all tasks to prevent rendering 100+ task cards during drag
    // NOTE: The column container itself will follow the mouse via transform,
    // this placeholder just reduces rendering cost
    // CRITICAL: Only show placeholder for the column being dragged, not others
    // Other columns need to render normally so rectSortingStrategy can transform them
    if (isDragging && draggedColumn && draggedColumn.id === column.id) {
      const taskCount = filteredTasks.length;
      return [
        <div
          key="column-drag-placeholder"
          className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400 pointer-events-none"
          style={{
            // Prevent blur/distortion
            imageRendering: 'crisp-edges',
            WebkitFontSmoothing: 'antialiased',
          }}
        >
          <div className="text-2xl mb-2">📋</div>
          <div className="text-sm font-medium">{column.title}</div>
          <div className="text-xs mt-1">{taskCount} {taskCount === 1 ? t('column.task') : t('column.tasks')}</div>
        </div>
      ];
    }
    
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
                {t('column.dropHere')}
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
            isDragDisabled={!!draggedColumn}
            isColumnBeingDragged={!!draggedColumn}
            taskViewMode={taskViewMode}
            availablePriorities={availablePriorities}
            selectedTask={selectedTask}
            availableTags={availableTags}
            onTagAdd={onTagAdd ? onTagAdd(task.id) : undefined}
            onTagRemove={onTagRemove ? onTagRemove(task.id) : undefined}
            boards={boards}
            columns={columns}
            selectedSprintId={selectedSprintId}
            availableSprints={availableSprints}
            
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
              {t('column.dropHere')}
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
      );
    }
    
    return taskElements;
  }, [filteredTasks, members, onRemoveTask, onEditTask, onCopyTask, onTaskDragStart, onTaskDragEnd, onSelectTask, draggedTask, dragPreview, column.id, column.title, isDragging, t]);

  // Combine sortable and column droppable refs for the column container
  const setColumnRef = (node: HTMLElement | null) => {
    setNodeRef(node);
    setColumnDroppableRef(node);
  };

  return (
    <div 
      ref={setColumnRef}
      style={{
        ...style,
        // CRITICAL: Ensure column container can receive pointer events even when tasks cover it
        // This is essential for column-to-column drops when there are many tasks
        position: 'relative',
        zIndex: isDragging ? 1000 : 'auto',
        // CRITICAL: When dragging, hide the original column (it's shown in DragOverlay)
        // Other columns stay visible and in place - no shifting
        opacity: isDragging ? 0.3 : 1,
        // Ensure the column can be transformed (not fixed position)
        willChange: isDragging ? 'transform' : 'auto',
        // Prevent blur/distortion during drag
        imageRendering: isDragging ? 'crisp-edges' : 'auto',
        WebkitFontSmoothing: isDragging ? 'antialiased' : 'auto',
      }}
      className={`sortable-item column-container rounded-lg p-4 flex flex-col min-h-[200px] ${
        isDragging ? 'cursor-grabbing' : 'transition-all duration-200 ease-in-out'
      } ${
        (isOver && draggedTask && draggedTask.columnId !== column.id) || 
        (isColumnOver && draggedColumn && draggedColumn.id !== column.id)
          ? 'ring-2 ring-blue-400 bg-blue-50 dark:bg-blue-900 border-2 border-blue-400' 
          : 'border border-transparent'
      }`}
      {...attributes}
    >
      {/* Top Drop Zone - Shows "Drop here" when dragging a column over this column */}
      {draggedColumn && draggedColumn.id !== column.id && (
        <div
          ref={setTopDropZoneRef}
          className={`mb-2 transition-all duration-200 min-h-[48px] ${
            isTopDropZoneOver 
              ? 'opacity-100' 
              : 'opacity-40'
          }`}
        >
          <div className={`bg-blue-100 dark:bg-blue-900 border-2 border-dashed rounded-lg flex items-center justify-center py-2 px-4 transition-all duration-200 ${
            isTopDropZoneOver
              ? 'border-blue-500 dark:border-blue-400 shadow-lg scale-105'
              : 'border-blue-300 dark:border-blue-700'
          }`}>
            <div className={`text-sm font-medium flex items-center gap-2 transition-colors ${
              isTopDropZoneOver
                ? 'text-blue-700 dark:text-blue-300'
                : 'text-blue-600 dark:text-blue-400'
            }`}>
              <div className={`w-2 h-2 bg-blue-500 rounded-full ${isTopDropZoneOver ? 'animate-pulse' : ''}`}></div>
              {t('column.dropColumnHere', { ns: 'tasks' })}
              <div className={`w-2 h-2 bg-blue-500 rounded-full ${isTopDropZoneOver ? 'animate-pulse' : ''}`}></div>
            </div>
          </div>
        </div>
      )}

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
              title={t('column.dismissWarning')}
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
              title={t('column.clickToEditDragToReorder')}
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
                  <span className="text-sm font-medium text-gray-700">{t('column.markAsFinishedColumn')}</span>
                  {isFinished && siteSettings?.DEFAULT_FINISHED_COLUMN_NAMES && (() => {
                    const finishedColumnNames = parseFinishedColumnNames(siteSettings.DEFAULT_FINISHED_COLUMN_NAMES);
                    const isAutoDetected = finishedColumnNames.some(finishedName => 
                      finishedName.toLowerCase() === title.toLowerCase()
                    );
                    return isAutoDetected ? (
                      <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
                        {t('column.autoDetected')}
                      </span>
                    ) : null;
                  })()}
                  {isSubmitting && (
                    <span className="text-xs text-gray-500">{t('column.saving')}</span>
                  )}
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFinished}
                    onChange={(e) => handleFinishedToggle(e.target.checked)}
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
                  <span className="text-sm font-medium text-gray-700">{t('column.markAsArchivedColumn')}</span>
                  {isArchived && title.toLowerCase() === 'archive' && (
                    <span className="text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded-full">
                      {t('column.autoDetected')}
                    </span>
                  )}
                  {isSubmitting && (
                    <span className="text-xs text-gray-500">{t('column.saving')}</span>
                  )}
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isArchived}
                    onChange={(e) => handleArchivedToggle(e.target.checked)}
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
                  {t('buttons.cancel', { ns: 'common' })}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !title.trim()}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-md transition-colors"
                >
                  {isSubmitting ? t('column.saving') : t('buttons.save', { ns: 'common' })}
                </button>
              </div>
            </form>
          ) : (
            <>
              <h3
                data-column-title
                className={`text-lg font-semibold text-gray-700 dark:text-gray-100 select-none ${
                  isAdmin && showColumnDeleteConfirm === null
                    ? 'cursor-pointer hover:text-gray-900 dark:hover:text-white' 
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
                    ? t('column.clickToEditDragToReorder')
                    : isAdmin && showColumnDeleteConfirm !== null
                    ? t('column.draggingDisabledDuringConfirmation')
                    : draggedTask
                    ? t('column.hoverToEnterCrossBoard')
                    : t('column.columnTitle')
                }
              >
                {column.title}
              </h3>
              <button
                data-column-header
                onClick={handleAddTask}
                disabled={isSubmitting || !isOnline}
                title={!isOnline ? t('column.networkOffline') : t('column.addTask')}
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
          <div title={t('column.archivedColumn')} className="mr-1">
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
              title={t('column.columnManagementOptions')}
              data-tour-id="column-management-menu"
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
                  {t('column.addColumn')}
                </button>
                <button
                  ref={setDeleteButtonRef}
                  onClick={(e) => {
                    // Capture column header position for dialog alignment
                    // Defer DOM read to avoid forced reflow during event handler
                    if (columnHeaderRef.current) {
                      requestAnimationFrame(() => {
                        if (columnHeaderRef.current) {
                          const headerRect = columnHeaderRef.current.getBoundingClientRect();
                          setDeleteButtonPosition({
                            top: headerRect.bottom + 8,
                            left: headerRect.left
                          });
                        }
                      });
                    }
                    onRemoveColumn(column.id);
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                  disabled={isSubmitting}
                >
                  {t('column.deleteColumn')}
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
                      {isOver ? t('column.dropTaskHere') : t('column.dropZone')}
                    </div>
                    {isOver && <div className="text-sm opacity-75 mt-1">{t('column.releaseToPlace')}</div>}
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
              style={{
                // CRITICAL: Ensure column droppable can receive pointer events even when tasks cover it
                // This allows column-to-column drops to work when there are many tasks
                pointerEvents: draggedColumn ? 'auto' : 'auto',
                position: 'relative',
                zIndex: draggedColumn ? 1 : 'auto',
              }}
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
                const taskWord = taskCount !== 1 ? t('column.tasks') : t('column.task');
                return `${t('column.deleteColumnAndTasks')} ${taskCount} ${taskWord}?`;
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
                {t('buttons.no', { ns: 'common' })}
              </button>
              <button
                onClick={() => {
                  onConfirmColumnDelete(column.id);
                  setDeleteButtonPosition(null);
                }}
                className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >
                {t('buttons.yes', { ns: 'common' })}
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

