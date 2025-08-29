import React, { useState, useCallback } from 'react';
import { Plus, MoreVertical } from 'lucide-react';
import { Column, Task, TeamMember } from '../types';
import TaskCard from './TaskCard';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface KanbanColumnProps {
  column: Column;
  members: TeamMember[];
  selectedMember: string | null;
  draggedTask: Task | null;
  draggedColumn: Column | null;
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
  } = useSortable({ id: column.id, disabled: !isAdmin });

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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const taskHeight = 120;
    
    let index = Math.floor(y / taskHeight);
    index = Math.max(0, Math.min(index, columnTasks.length));
    
    setDropIndex(index);
    onTaskDragOver(e, column.id, index);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!e.currentTarget.contains(relatedTarget)) {
      setDropIndex(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dropIndex !== null) {
      onTaskDrop(column.id, dropIndex);
    }
    setDropIndex(null);
  };

  // Column drag and drop is now handled by @dnd-kit in App.tsx

  const handleAddTask = async () => {
    if (!selectedMember || isSubmitting) return;
    setIsSubmitting(true);
    await onAddTask(column.id);
    setIsSubmitting(false);
  };

  const renderTaskList = React.useCallback(() => {
    const items: JSX.Element[] = [];

    columnTasks.forEach((task, index) => {
      const member = members.find(m => m.id === task.memberId);
      if (!member) return;

      // Skip rendering if this is the dragged task and it's not in its original column
      const isDraggedTask = draggedTask?.id === task.id;
      const isInOriginalColumn = task.columnId === column.id;
      
      // Add drop indicator with unique key combining multiple identifiers
      if (dropIndex === index) {
        items.push(
          <div 
            key={`drop-${column.id}-${index}-${Date.now()}`}
            className="h-1 bg-blue-500 rounded my-1" 
            data-position={index}
          />
        );
      }

      // Only render if:
      // 1. It's not the dragged task, OR
      // 2. It is the dragged task but we're in its original column
      if (!isDraggedTask || isInOriginalColumn) {
        items.push(
          <TaskCard
            key={`task-${task.id}-${column.id}-${task.position}`}
            task={task}
            member={member}
            members={members}
            onRemove={onRemoveTask}
            onEdit={onEditTask}
            onCopy={onCopyTask}
            onDragStart={onTaskDragStart}
            onDragEnd={onTaskDragEnd}
            onSelect={onSelectTask}
          />
        );
      }
    });

    // Add final drop indicator with unique key
    if (dropIndex === columnTasks.length) {
      items.push(
        <div 
          key={`drop-final-${column.id}-${Date.now()}`}
          className="h-1 bg-blue-500 rounded my-1" 
          data-position={columnTasks.length}
        />
      );
    }

    return items;
  }, [
    columnTasks,
    members,
    dropIndex,
    draggedTask,
    column.id,
    onRemoveTask,
    onEditTask,
    onCopyTask,
    onTaskDragStart,
    onTaskDragEnd,
    onSelectTask
  ]);

  const isBeingDraggedOver = draggedColumn && draggedColumn.id !== column.id;
  
  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={`bg-gray-50 rounded-lg p-4 flex flex-col min-h-[200px] transition-all duration-200 ${
        isDragging ? 'opacity-50 scale-95 shadow-2xl transform rotate-2' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 flex-1">
          {isEditing ? (
            <form onSubmit={handleTitleSubmit} className="flex-1">
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-2 py-1 border rounded"
                autoFocus
                onBlur={handleTitleSubmit}
                disabled={isSubmitting}
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
                {...(isAdmin ? attributes : {})}
                {...(isAdmin ? listeners : {})}
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

      <div className="flex-1 min-h-[100px] space-y-3">
        {renderTaskList()}
      </div>
    </div>
  );
}
