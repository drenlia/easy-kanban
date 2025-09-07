import React, { useState, useRef } from 'react';
import { Copy, Edit2, FileText, X, Eye, UserPlus, GripVertical, MessageCircle } from 'lucide-react';
import { Task, TeamMember } from '../types';
import { formatMembersTooltip } from '../utils/taskUtils';
import { setDndGloballyDisabled } from '../utils/globalDndState';

// System user member ID constant
const SYSTEM_MEMBER_ID = '00000000-0000-0000-0000-000000000001';

interface TaskCardToolbarProps {
  task: Task;
  member: TeamMember;
  members: TeamMember[];
  isDragDisabled?: boolean;
  showMemberSelect: boolean;
  onCopy: (task: Task) => void;
  onEdit: (task: Task) => void;
  onSelect: (task: Task) => void;
  onRemove: (taskId: string, event?: React.MouseEvent) => void;
  onShowQuickEdit: () => void;
  onAddComment?: () => void;
  onMemberChange: (memberId: string) => void;
  onToggleMemberSelect: () => void;
  setDropdownPosition: (position: 'above' | 'below') => void;
  dropdownPosition: 'above' | 'below';
  listeners?: any; // DnD kit listeners
  attributes?: any; // DnD kit attributes
}

export default function TaskCardToolbar({
  task,
  member,
  members,
  isDragDisabled = false,
  showMemberSelect,
  onCopy,
  onEdit,
  onSelect,
  onRemove,
  onShowQuickEdit,
  onAddComment,
  onMemberChange,
  onToggleMemberSelect,
  setDropdownPosition,
  dropdownPosition,
  listeners,
  attributes
}: TaskCardToolbarProps) {
  const priorityButtonRef = useRef<HTMLButtonElement>(null);

  const handleCopy = () => {
    onCopy(task);
  };

  const handleQuickEdit = () => {
    onShowQuickEdit();
    setDndGloballyDisabled(true);
  };

  const handleMemberToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Calculate dropdown position
    if (priorityButtonRef.current) {
      const rect = priorityButtonRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      // If there's not enough space below (less than 200px) and more space above, show above
      if (spaceBelow < 200 && spaceAbove > spaceBelow) {
        setDropdownPosition('above');
      } else {
        setDropdownPosition('below');
      }
    }
    
    onToggleMemberSelect();
  };

  return (
    <>
      {/* Drag Handle - Top Left */}
      <div
        {...listeners}
        {...attributes}
        className={`absolute top-1 left-1 p-1 z-[6] rounded ${
          !isDragDisabled 
            ? 'cursor-grab active:cursor-grabbing hover:bg-gray-200 opacity-60 hover:opacity-100' 
            : 'cursor-not-allowed opacity-0'
        } transition-all duration-200`}
        title="Drag to move task"
      >
        <GripVertical size={12} className="text-gray-400" />
      </div>

      {/* Add Comment Button - 10px spacing after drag handle */}
      {onAddComment && (
        <div
          className="absolute top-1 left-8 p-1 z-[6] rounded hover:bg-gray-200 opacity-60 hover:opacity-100 cursor-pointer transition-all duration-200"
          title="Add comment"
          onClick={(e) => {
            e.stopPropagation();
            onAddComment();
          }}
        >
          <MessageCircle size={12} className="text-gray-400" />
        </div>
      )}

      {/* Overlay Toolbar - Positioned at top edge */}
      <div className="absolute top-0 left-0 right-0 px-2 py-1 transition-opacity duration-200 z-[5]">
        {/* Centered Action Buttons - Absolutely centered */}
        <div className="flex justify-center">
          <div className="flex gap-1">
            <button
              onClick={handleCopy}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              title="Copy Task"
            >
              <Copy size={14} className="text-gray-400 hover:text-gray-600 transition-colors" />
            </button>
            <button
              onClick={handleQuickEdit}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              title="Quick Edit"
            >
              <Edit2 size={14} className="text-gray-400 hover:text-gray-600 transition-colors" />
            </button>
            <button
              onClick={() => onSelect(task)}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              title="View Details"
            >
              <FileText size={14} className="text-gray-400 hover:text-gray-600 transition-colors" />
            </button>
            {/* Delete Button - Right side of details icon */}
            <button
              onClick={(e) => onRemove(task.id, e)}
              className="p-1 hover:bg-red-100 rounded-full transition-colors"
              title="Delete Task"
            >
              <X size={14} className="text-red-500" />
            </button>
          </div>
        </div>

        {/* Watchers & Collaborators Icons - Right side between buttons and avatar */}
        <div className="absolute top-1 right-12 flex gap-1">
          {task.watchers && task.watchers.length > 0 && (
            <div className="flex items-center" title={formatMembersTooltip(task.watchers, 'watcher')}>
              <Eye size={12} className="text-blue-500" />
              <span className="text-[10px] text-blue-600 ml-0.5 font-medium">{task.watchers.length}</span>
            </div>
          )}
          {task.collaborators && task.collaborators.length > 0 && (
            <div className="flex items-center" title={formatMembersTooltip(task.collaborators, 'collaborator')}>
              <UserPlus size={12} className="text-blue-500" />
              <span className="text-[10px] text-blue-600 ml-0.5 font-medium">{task.collaborators.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Avatar Overlay - Top Right */}
      <div className={`absolute top-1 right-2 ${showMemberSelect ? 'z-[110]' : 'z-20'}`}>
        <div className="relative">
          <button
            ref={priorityButtonRef}
            onClick={handleMemberToggle}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors shadow-sm cursor-pointer"
            title="Change Assignee"
          >
            {member.avatarUrl || member.googleAvatarUrl ? (
              <img
                src={member.avatarUrl || member.googleAvatarUrl}
                alt={member.name}
                className="w-8 h-8 rounded-full object-cover border-2 border-white"
              />
            ) : (
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white border-2 border-white"
                style={{ backgroundColor: member.color }}
              >
                {member.id === SYSTEM_MEMBER_ID ? '🤖' : member.name.charAt(0).toUpperCase()}
              </div>
            )}
          </button>

          {/* Member Selection Dropdown */}
          {showMemberSelect && (
            <div className={`absolute ${dropdownPosition === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'} right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px] max-h-48 overflow-y-auto`}>
              <div className="p-2">
                <div className="text-xs font-medium text-gray-500 mb-2">Assign to:</div>
                {members.map(m => (
                  <button
                    key={m.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMemberChange(m.id);
                    }}
                    className={`w-full flex items-center gap-2 p-2 rounded hover:bg-gray-50 transition-colors ${
                      member.id === SYSTEM_MEMBER_ID ? 'bg-yellow-50' : 
                      m.id === member.id ? 'bg-blue-50 border border-blue-200' : ''
                    }`}
                  >
                    {m.avatarUrl || m.googleAvatarUrl ? (
                      <img
                        src={m.avatarUrl || m.googleAvatarUrl}
                        alt={m.name}
                        className="w-6 h-6 rounded-full object-cover"
                      />
                    ) : (
                      <div 
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white"
                        style={{ backgroundColor: m.color }}
                      >
                        {m.id === SYSTEM_MEMBER_ID ? '🤖' : m.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm">{m.name}</span>
                    {m.id === member.id && (
                      <span className="ml-auto text-blue-600 text-xs">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
