import React from 'react';
import { Plus, MoreVertical } from 'lucide-react';
import { Column, Task, TeamMember } from '../types';
import TaskCard from './TaskCard';

interface KanbanColumnProps {
  column: Column;
  members: TeamMember[];
  selectedMember: string | null;
  onAddTask: (columnId: string) => void;
  onRemoveTask: (taskId: string) => void;
  onEditTask: (task: Task) => void;
  onCopyTask: (task: Task) => void;
  onEditColumn: (columnId: string, title: string) => void;
  onRemoveColumn: (columnId: string) => void;
  onAddColumn: () => void;
  onDragStart: (columnId: string) => void;
  onDragOver: (e: React.DragEvent, columnId: string) => void;
  onTaskDragStart: (taskId: string, columnId: string, currentIndex: number) => void;
  onTaskDragEnd: () => void;
  onTaskDragOver: (e: React.DragEvent, columnId: string, index: number) => void;
  onSelectTask: (task: Task | null) => void;
}

export default function KanbanColumn({
  column,
  members,
  selectedMember,
  onAddTask,
  onRemoveTask,
  onEditTask,
  onCopyTask,
  onEditColumn,
  onRemoveColumn,
  onAddColumn,
  onDragStart,
  onDragOver,
  onTaskDragStart,
  onTaskDragEnd,
  onTaskDragOver,
  onSelectTask
}: KanbanColumnProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [title, setTitle] = React.useState(column.title);
  const [showMenu, setShowMenu] = React.useState(false);
  const columnRef = React.useRef<HTMLDivElement>(null);

  const handleTitleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onEditColumn(column.id, title.trim());
      setIsEditing(false);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.task-card')) {
      e.preventDefault();
      return;
    }
    onDragStart(column.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.target as HTMLElement;
    if (!target.closest('.task-card')) {
      onDragOver(e, column.id);
    }
  };

  const handleTaskDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    onTaskDragOver(e, column.id, index);
  };

  return (
    <div
      ref={columnRef}
      className="bg-gray-50 rounded-lg p-4 flex flex-col min-h-[200px]"
      draggable="true"
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
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
              />
            </form>
          ) : (
            <>
              <h3
                className="text-lg font-semibold text-gray-700 cursor-pointer hover:text-gray-900"
                onClick={() => setIsEditing(true)}
              >
                {column.title}
              </h3>
              <button
                onClick={() => onAddTask(column.id)}
                disabled={!selectedMember}
                title="Add Task"
                className={`p-1 rounded-full transition-colors ${
                  selectedMember
                    ? 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                    : 'text-gray-400 cursor-not-allowed'
                }`}
              >
                <Plus size={18} />
              </button>
            </>
          )}
        </div>
        
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 hover:bg-gray-200 rounded-full transition-colors"
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
              >
                Add Column
              </button>
              <button
                onClick={() => {
                  onRemoveColumn(column.id);
                  setShowMenu(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
              >
                Delete Column
              </button>
            </div>
          )}
        </div>
      </div>

      <div 
        className="flex-1"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (column.tasks.length === 0) {
            onTaskDragOver(e, column.id, 0);
          }
        }}
      >
        <div className="space-y-3">
          {column.tasks.map((task, index) => {
            const member = members.find(m => m.id === task.memberId);
            if (!member) return null;
            
            return (
              <TaskCard
                key={task.id}
                task={task}
                member={member}
                members={members}
                onRemove={onRemoveTask}
                onEdit={onEditTask}
                onCopy={onCopyTask}
                onDragStart={onTaskDragStart}
                onDragEnd={onTaskDragEnd}
                onDragOver={handleTaskDragOver}
                onSelect={onSelectTask}
                index={index}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}