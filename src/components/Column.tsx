import React, { useState, useCallback } from 'react';
import { Plus, MoreVertical } from 'lucide-react';
import { Column, Task, TeamMember } from '../types';
import TaskCard from './TaskCard';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';

interface KanbanColumnProps {
  column: Column;
  members: TeamMember[];
  selectedMember: string | null;
  draggedTask: Task | null;
  draggedColumn: Column | null;
  dragPreview?: {
    targetColumnId: string;
    insertIndex: number;
  } | null;
  onAddTask: (columnId: string) => void;
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
}

export default function KanbanColumn({
  column,
  members,
  selectedMember,
  draggedTask,
  draggedColumn,
  dragPreview,
  onAddTask,
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
  isAdmin = false
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

  // Filter and sort tasks by column
  const columnTasks = React.useMemo(() => {
    return [...column.tasks]
      .filter(task => task.columnId === column.id)
      .sort((a, b) => (a.position || 0) - (b.position || 0));
  }, [column.tasks, column.id]);

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
    if (!selectedMember || isSubmitting) return;
    setIsSubmitting(true);
    await onAddTask(column.id);
    setIsSubmitting(false);
  };

  const renderTaskList = React.useCallback(() => {
    const isTargetColumn = dragPreview?.targetColumnId === column.id;
    const insertIndex = dragPreview?.insertIndex ?? -1;
    
    const taskElements: React.ReactNode[] = [];
    
    columnTasks.forEach((task, index) => {
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

      // Add the actual task (hide if it's being dragged)
      const isBeingDragged = draggedTask?.id === task.id;
      taskElements.push(
        <div
          key={task.id}
          className={`transition-all duration-200 ${
            isBeingDragged ? 'opacity-50 scale-95' : ''
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
          />
        </div>
      );
    });
    
    // Add placeholder at the end only when specifically dropping at end
    if (isTargetColumn && insertIndex === columnTasks.length) {
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
  }, [columnTasks, members, onRemoveTask, onEditTask, onCopyTask, onTaskDragStart, onTaskDragEnd, onSelectTask, dragPreview, draggedTask, column.id]);

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
      className={`bg-gray-50 rounded-lg p-4 flex flex-col min-h-[200px] transition-all duration-200 ease-in-out ${
        isDragging ? 'opacity-50 scale-95 shadow-2xl transform rotate-2' : ''
      } ${
        isOver && draggedTask && draggedTask.columnId !== column.id ? 'ring-2 ring-blue-400 bg-blue-50 border-2 border-blue-400' : 'hover:bg-gray-100 border border-transparent'
      }`}
      {...(isAdmin ? { ...attributes, ...listeners } : {})}
    >
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
                disabled={!selectedMember || isSubmitting}
                title={selectedMember ? 'Add Task' : 'Select a team member first'}
                className={`p-1 rounded-full transition-colors ${
                  selectedMember && !isSubmitting
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
        {columnTasks.length === 0 ? (
          /* Empty column - no SortableContext to avoid interference */
          <div className="space-y-2 min-h-[100px] pb-4">
            <div className={`h-full w-full min-h-[100px] flex items-center justify-center transition-all duration-200 ${
              draggedTask && draggedTask.columnId !== column.id 
                ? `border-2 border-dashed rounded-lg ${
                    isOver ? 'bg-blue-100 border-blue-400' : 'bg-blue-50 border-blue-300'
                  }` 
                : ''
            }`}>
                              {draggedTask && draggedTask.columnId !== column.id ? (
                  <div className={`font-medium transition-colors ${
                    isOver ? 'text-blue-700' : 'text-blue-600'
                  }`}>
                    {isOver ? 'Drop task here' : 'Drop zone'}
                  </div>
                ) : null}
            </div>
          </div>
        ) : (
          /* Column with tasks - use SortableContext */
          <SortableContext
            items={columnTasks.map(task => task.id)}
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
