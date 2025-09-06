import React from 'react';
import { DragOverlay as DndKitDragOverlay } from '@dnd-kit/core';
import { Task, TeamMember } from '../../types';

interface SimpleDragOverlayProps {
  draggedTask: Task | null;
  members: TeamMember[];
  isHoveringBoardTab?: boolean;
}

export const SimpleDragOverlay: React.FC<SimpleDragOverlayProps> = ({ 
  draggedTask, 
  members, 
  isHoveringBoardTab = false 
}) => {
  return (
    <DndKitDragOverlay 
      dropAnimation={null}
    >
      {draggedTask ? (
        isHoveringBoardTab ? (
          // Mini task icon when hovering over board tabs
          <MiniTaskIcon 
            task={draggedTask} 
            member={members.find(m => m.id === draggedTask.assignedTo)} 
          />
        ) : (
          // Full task preview when dragging normally
          <TaskDragPreview task={draggedTask} member={members.find(m => m.id === draggedTask.assignedTo)} />
        )
      ) : null}
    </DndKitDragOverlay>
  );
};

// Mini task icon component for board tab drops
const MiniTaskIcon: React.FC<{ task: Task; member?: TeamMember }> = ({ task, member }) => {
  return (
    <div className="w-8 h-8 rounded-lg bg-white shadow-lg border-2 border-blue-500 flex items-center justify-center relative">
      {/* Task background with assignee color */}
      <div 
        className="absolute inset-0 rounded-lg opacity-20"
        style={{ backgroundColor: member?.color || '#3B82F6' }}
      ></div>
      
      {/* Assignee avatar or initial */}
      <div className="relative z-10">
        {member?.avatarUrl || member?.googleAvatarUrl ? (
          <img
            src={member.avatarUrl || member.googleAvatarUrl}
            alt={member.name}
            className="w-5 h-5 rounded-full object-cover border border-white"
          />
        ) : (
          <div 
            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white border border-white"
            style={{ backgroundColor: member?.color || '#3B82F6' }}
          >
            {member?.name?.charAt(0)?.toUpperCase() || task.title.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      
      {/* Subtle task indicator */}
      <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border border-white text-[8px] text-white flex items-center justify-center font-bold">
        T
      </div>
    </div>
  );
};

// Full task preview for normal dragging
const TaskDragPreview: React.FC<{ task: Task; member?: TeamMember }> = ({ task, member }) => {
  return (
    <div className="bg-white rounded-lg shadow-2xl border border-gray-200 p-4 w-80 transform rotate-3 scale-105 opacity-90 ring-2 ring-blue-400">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-gray-900 truncate">{task.title}</h4>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-blue-500 rounded-full opacity-75"></div>
          <div className="w-3 h-3 bg-blue-400 rounded-full opacity-50"></div>
          <div className="w-3 h-3 bg-blue-300 rounded-full opacity-25"></div>
        </div>
      </div>
      {task.description && (
        <p className="text-sm text-gray-600 line-clamp-2 mb-2">
          {task.description.length > 50 
            ? task.description.substring(0, 50) + '...' 
            : task.description}
        </p>
      )}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Moving...</span>
        {member && <span>@{member.name}</span>}
      </div>
    </div>
  );
};

export default SimpleDragOverlay;
