import React from 'react';
import { DragOverlay as DndKitDragOverlay } from '@dnd-kit/core';
import { FileText } from 'lucide-react';
import { Task, TeamMember } from '../../types';
import DOMPurify from 'dompurify';
import { getAuthenticatedAttachmentUrl } from '../../utils/authImageUrl';

import { Column } from '../../types';

interface SimpleDragOverlayProps {
  draggedTask: Task | null;
  draggedColumn: Column | null;
  members: TeamMember[];
  isHoveringBoardTab?: boolean;
}

export const SimpleDragOverlay: React.FC<SimpleDragOverlayProps> = ({ 
  draggedTask,
  draggedColumn,
  members, 
  isHoveringBoardTab = false 
}) => {
  return (
    <DndKitDragOverlay 
      dropAnimation={null}
    >
      {draggedColumn ? (
        // Column drag preview
        <ColumnDragPreview column={draggedColumn} />
      ) : draggedTask ? (
        isHoveringBoardTab ? (
          // Small corner indicator when hovering over board tabs
          <SmallTaskIndicator 
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

// Small task indicator for when hovering over board tabs
const SmallTaskIndicator: React.FC<{ task: Task; member?: TeamMember }> = ({ task, member }) => {
  return (
    // Container matches the original task card size to maintain mouse offset
    <div className="w-80 h-24 relative pointer-events-none">
      {/* Small indicator positioned at top-left corner */}
      <div className="absolute top-2 left-2 w-8 h-8 rounded-lg bg-white shadow-lg border-2 border-blue-500 flex items-center justify-center">
        {/* Task background with assignee color */}
        <div 
          className="absolute inset-0 rounded-lg opacity-20"
          style={{ backgroundColor: member?.color || '#3B82F6' }}
        />
        
        {/* FileText icon (same as task details button) */}
        <FileText size={16} className="text-blue-600 relative z-10" />
        
        {/* Small task count indicator */}
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border border-white text-[8px] text-white flex items-center justify-center font-bold">
          1
        </div>
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
        <div 
          className="text-sm text-gray-600 line-clamp-2 mb-2 prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(
              (() => {
                // Fix blob URLs in task description
                let fixedDescription = task.description.length > 50 
                  ? task.description.substring(0, 50) + '...' 
                  : task.description;
                const blobPattern = /blob:[^"]*#(img-[^"]*)/g;
                fixedDescription = fixedDescription.replace(blobPattern, (_match, filename) => {
                  // Convert blob URL to authenticated server URL
                  const authenticatedUrl = getAuthenticatedAttachmentUrl(`/attachments/${filename}`);
                  return authenticatedUrl || `/uploads/${filename}`;
                });
                return fixedDescription;
              })()
            )
          }}
        />
      )}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Moving...</span>
        {member && <span>@{member.name}</span>}
      </div>
    </div>
  );
};

// Column drag preview
const ColumnDragPreview: React.FC<{ column: Column }> = ({ column }) => {
  const taskCount = column.tasks?.length || 0;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border-2 border-blue-400 p-4 w-64 transform rotate-2 scale-105 opacity-95 ring-2 ring-blue-300">
      <div className="flex flex-col items-center justify-center py-4">
        <div className="text-3xl mb-2">📋</div>
        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 text-center mb-1">
          {column.title}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
        </div>
      </div>
    </div>
  );
};

export default SimpleDragOverlay;
