import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Edit2, FileText, Eye, UserPlus, GripVertical, MessageSquarePlus, TagIcon, Plus, Trash2, Link } from 'lucide-react';
import { Task, TeamMember, Tag } from '../types';
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
  onSelect: (task: Task, options?: { scrollToComments?: boolean }) => void;
  onRemove: (taskId: string, event?: React.MouseEvent) => void;
  onShowQuickEdit: () => void;
  onAddComment?: () => void;
  onMemberChange: (memberId: string) => void;
  onToggleMemberSelect: () => void;
  setDropdownPosition: (position: 'above' | 'below') => void;
  dropdownPosition: 'above' | 'below';
  listeners?: any; // DnD kit listeners
  attributes?: any; // DnD kit attributes
  availableTags?: Tag[];
  onTagAdd?: (tagId: string) => void;
  
  // Task linking props
  isLinkingMode?: boolean;
  linkingSourceTask?: Task | null;
  onStartLinking?: (task: Task, startPosition: {x: number, y: number}) => void;
  
  // Hover highlighting props
  hoveredLinkTask?: Task | null;
  onLinkToolHover?: (task: Task) => void;
  onLinkToolHoverEnd?: () => void;
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
  attributes,
  availableTags = [],
  onTagAdd,
  
  // Task linking props
  isLinkingMode,
  linkingSourceTask,
  onStartLinking,
  
  // Hover highlighting props
  hoveredLinkTask,
  onLinkToolHover,
  onLinkToolHoverEnd
}: TaskCardToolbarProps) {
  const priorityButtonRef = useRef<HTMLButtonElement>(null);
  const [showQuickTagDropdown, setShowQuickTagDropdown] = useState(false);
  const [tagDropdownPosition, setTagDropdownPosition] = useState<{left: number, top: number}>({left: 0, top: 0});
  const quickTagButtonRef = useRef<HTMLDivElement>(null);
  const memberButtonRef = useRef<HTMLButtonElement>(null);

  const handleCopy = () => {
    onCopy(task);
  };

  // State for drag-to-link logic
  const [isDragPrepared, setIsDragPrepared] = useState(false);
  const [dragStartPosition, setDragStartPosition] = useState<{x: number, y: number} | null>(null);
  const dragThreshold = 5; // Minimum pixels to consider it a drag

  const handleLinkMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startPos = { x: centerX, y: centerY };
    
    // Prepare for potential drag, but don't start linking yet
    setIsDragPrepared(true);
    setDragStartPosition(startPos);
    
    console.log('🔗 Link button pressed - preparing for potential drag');
  };

  // Handle global mouse move to detect drag
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragPrepared && dragStartPosition && onStartLinking) {
        const currentX = e.clientX;
        const currentY = e.clientY;
        const deltaX = Math.abs(currentX - dragStartPosition.x);
        const deltaY = Math.abs(currentY - dragStartPosition.y);
        
        // If moved beyond threshold, start linking mode
        if (deltaX > dragThreshold || deltaY > dragThreshold) {
          console.log('🔗 Drag detected - starting linking mode');
          setIsDragPrepared(false);
          onStartLinking(task, dragStartPosition);
          setDragStartPosition(null);
        }
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (isDragPrepared) {
        // Released without dragging - cancel linking
        console.log('🔗 Released without dragging - canceling linking');
        setIsDragPrepared(false);
        setDragStartPosition(null);
      }
    };

    if (isDragPrepared) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragPrepared, dragStartPosition, onStartLinking, task]);

  // Filter out tags that are already assigned to the task
  const availableTagsForAssignment = availableTags.filter(tag => 
    !task.tags?.some(taskTag => taskTag.id === tag.id)
  );

  // Debug logging removed for clarity

  const handleQuickTagClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!showQuickTagDropdown && quickTagButtonRef.current) {
      // Calculate position for portal dropdown
      const rect = quickTagButtonRef.current.getBoundingClientRect();
      const dropdownWidth = 200;
      const dropdownHeight = 200;
      
      // Position below the button, centered
      let left = rect.left + (rect.width / 2) - (dropdownWidth / 2);
      let top = rect.bottom + 5;
      
      // Keep within viewport
      if (left + dropdownWidth > window.innerWidth - 20) {
        left = window.innerWidth - dropdownWidth - 20;
      }
      if (left < 20) {
        left = 20;
      }
      if (top + dropdownHeight > window.innerHeight - 20) {
        top = rect.top - dropdownHeight - 5; // Position above instead
      }
      
      setTagDropdownPosition({ left, top });
    }
    
    setShowQuickTagDropdown(!showQuickTagDropdown);
  };

  const handleQuickTagSelect = (tagId: string) => {
    if (onTagAdd) {
      onTagAdd(tagId);
    }
    setShowQuickTagDropdown(false); // Close immediately after selection
  };

  // Calculate member dropdown position for portal rendering
  const getMemberDropdownPosition = () => {
    if (memberButtonRef.current) {
      const rect = memberButtonRef.current.getBoundingClientRect();
      const dropdownWidth = 200;
      
      // Calculate optimal height for member dropdown based on number of members and viewport space
      const memberItemHeight = 40; // Height per member item
      const maxMembers = members.length;
      const availableSpaceBelow = window.innerHeight - rect.bottom - 20; // 20px margin
      const availableSpaceAbove = rect.top - 20; // 20px margin
      const maxAvailableSpace = Math.max(availableSpaceBelow, availableSpaceAbove);
      
      // Calculate how many members we can fit
      const maxVisibleMembers = Math.floor(maxAvailableSpace / memberItemHeight);
      const membersToShow = Math.min(maxMembers, maxVisibleMembers);
      
      // Set height based on actual members to show, with a minimum of 2 members and maximum of 8
      const visibleMembers = Math.max(2, Math.min(8, membersToShow));
      const dropdownHeight = visibleMembers * memberItemHeight + 16; // +16 for padding
      
      // Position below the button, aligned to right edge
      let left = rect.right - dropdownWidth;
      let top = rect.bottom + 5;
      
      // Keep within viewport horizontally
      if (left < 20) {
        left = 20;
      }
      if (left + dropdownWidth > window.innerWidth - 20) {
        left = window.innerWidth - dropdownWidth - 20;
      }
      
      // Keep within viewport vertically
      if (top + dropdownHeight > window.innerHeight - 20) {
        top = rect.top - dropdownHeight - 5; // Position above instead
      }
      
      return { left, top, height: dropdownHeight };
    }
    return { left: 0, top: 0, height: 192 };
  };

  const handleQuickEdit = () => {
    onShowQuickEdit();
    setDndGloballyDisabled(true);
  };

  // Close quick tag dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (quickTagButtonRef.current && !quickTagButtonRef.current.contains(event.target as Node)) {
        setShowQuickTagDropdown(false);
      }
    };

    if (showQuickTagDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showQuickTagDropdown]);


  const handleMemberToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
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
          <MessageSquarePlus size={12} className="text-gray-400" />
        </div>
      )}

      {/* Quick Tag Button - Right next to comment button */}
      {onTagAdd && availableTagsForAssignment.length > 0 && (
        <div
          ref={quickTagButtonRef}
          className="absolute top-1 left-12 p-1 z-[6] rounded hover:bg-gray-200 opacity-60 hover:opacity-100 cursor-pointer transition-all duration-200"
          title="Add tag"
          onClick={handleQuickTagClick}
        >
          <div className="relative">
            <TagIcon size={12} className="text-gray-400" />
            <Plus size={6} className="text-gray-400 absolute -top-1 -right-1" />
          </div>
        </div>
      )}


      {/* Overlay Toolbar - Positioned at top edge */}
      <div className="absolute top-0 left-0 right-0 px-2 py-1 transition-opacity duration-200 z-[5]">
        {/* Centered Action Buttons - Absolutely centered */}
        <div className="flex justify-center">
          <div className="flex gap-0.5">
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
            {/* Link Button */}
            {onStartLinking && (
              <button
                onMouseDown={handleLinkMouseDown}
                onMouseEnter={() => onLinkToolHover?.(task)}
                onMouseLeave={() => onLinkToolHoverEnd?.()}
                className={`p-1 rounded-full transition-colors ${
                  isLinkingMode && linkingSourceTask?.id === task.id
                    ? 'bg-blue-100 text-blue-600'
                    : 'hover:bg-blue-100 text-gray-400 hover:text-blue-600'
                }`}
                title={isLinkingMode && linkingSourceTask?.id === task.id ? "Source task for linking" : "Hold and drag to link tasks"}
              >
                <Link size={14} />
              </button>
            )}
            {/* Delete Button - Right side of link icon */}
            <button
              onClick={(e) => onRemove(task.id, e)}
              className="p-1 hover:bg-red-100 rounded-full transition-colors"
              title="Delete Task"
            >
              <Trash2 size={14} className="text-red-500" />
            </button>
          </div>
        </div>

        {/* Watchers & Collaborators Icons - Right side between buttons and avatar */}
        <div className="absolute right-12 flex gap-1 z-30" style={{ top: '7px' }}>
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
            ref={memberButtonRef}
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

          {/* Member Selection Dropdown - Now handled by portal below */}
        </div>
      </div>

      {/* Portal-rendered quick tag dropdown */}
      {showQuickTagDropdown && createPortal(
        <div 
          className="fixed w-[200px] bg-white border border-gray-200 rounded-md shadow-lg z-[9999] max-h-[200px] overflow-y-auto"
          style={{
            left: `${tagDropdownPosition.left}px`,
            top: `${tagDropdownPosition.top}px`
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {availableTagsForAssignment.length === 0 ? (
            <div className="p-3 text-sm text-gray-500">
              No more tags available
            </div>
          ) : (
            availableTagsForAssignment.map(tag => (
              <div
                key={tag.id}
                className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleQuickTagSelect(tag.id.toString());
                }}
                onMouseUp={(e) => {
                  e.stopPropagation();
                  // Use onMouseUp as primary trigger since onClick sometimes fails
                  handleQuickTagSelect(tag.id.toString());
                }}
                onMouseDown={(e) => {
                  // Critical: This stopPropagation is essential for proper event handling
                  e.stopPropagation();
                }}
              >
                <div 
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="text-sm text-gray-700 truncate">{tag.tag}</span>
              </div>
            ))
          )}
        </div>,
        document.body
      )}

      {/* Portal-rendered member selection dropdown */}
      {showMemberSelect && (() => {
        const position = getMemberDropdownPosition();
        return createPortal(
          <div 
            className="fixed bg-white border border-gray-200 rounded-lg shadow-lg z-[99999] min-w-[200px] overflow-y-auto"
            style={{
              left: `${position.left}px`,
              top: `${position.top}px`,
              maxHeight: `${position.height}px`,
              minHeight: '200px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
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
          </div>,
          document.body
        );
      })()}
    </>
  );
}
