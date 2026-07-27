import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { Copy, Eye, UserPlus, GripVertical, MessageSquarePlus, TagIcon, Plus, Trash2, Link, Archive } from 'lucide-react';
import { Task, TeamMember, Tag } from '../types';
import { formatMembersTooltip } from '../utils/taskUtils';
import { getAuthenticatedAvatarUrl } from '../utils/authImageUrl';
import { truncateMemberName } from '../utils/memberUtils';
import AddTagModal from './AddTagModal';
import { KanbanChromeTooltip } from './KanbanChromeTooltip';
import AgentStatusButton from './AgentStatusButton';
import {
  AGENT_MEMBER_ID,
  SYSTEM_MEMBER_ID,
  AGENT_DRAG_BLOCKING_STATUSES,
} from '../constants/appConstants';
import {
  getAgentAvatarSrc,
  isAgentMemberId,
  sortMembersAgentLast,
} from '../utils/agentMemberUi';

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
  onAddComment?: () => void;
  onMemberChange: (memberId: string) => void;
  onToggleMemberSelect: () => void;
  setDropdownPosition: (position: 'above' | 'below') => void;
  dropdownPosition: 'above' | 'below';
  listeners?: any; // DnD kit listeners
  attributes?: any; // DnD kit attributes
  availableTags?: Tag[];
  onTagAdd?: (tagId: string) => void;
  columnIsFinished?: boolean;
  columns?: { [key: string]: { id: string; title: string; is_archived?: boolean; is_finished?: boolean } };
  /** Agent task_work.status when assigned to Agent */
  agentWorkStatus?: string | null;
  onOpenAgentActivity?: () => void;
  
  // Task linking props
  isLinkingMode?: boolean;
  linkingSourceTask?: Task | null;
  onStartLinking?: (task: Task, startPosition: {x: number, y: number}) => void;
  
  // Hover highlighting props
  hoveredLinkTask?: Task | null;
  onLinkToolHover?: (task: Task) => void;
  onLinkToolHoverEnd?: () => void;
  
  // Toolbar pinned open when editing or selected; hover uses parent `group` + group-hover
  isEditingTitle?: boolean;
  isEditingDescription?: boolean;
  isSelected?: boolean;
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
  onAddComment,
  onMemberChange,
  onToggleMemberSelect,
  setDropdownPosition: _setDropdownPosition,
  dropdownPosition: _dropdownPosition,
  listeners,
  attributes,
  availableTags = [],
  onTagAdd,
  columnIsFinished = false,
  columns,
  agentWorkStatus = null,
  onOpenAgentActivity,
  
  // Task linking props
  isLinkingMode,
  linkingSourceTask,
  onStartLinking,
  
  // Hover highlighting props
  hoveredLinkTask: _hoveredLinkTask,
  onLinkToolHover,
  onLinkToolHoverEnd,
  
  isEditingTitle = false,
  isEditingDescription = false,
  isSelected = false
}: TaskCardToolbarProps) {
  const { t } = useTranslation('tasks');
  const _priorityButtonRef = useRef<HTMLButtonElement>(null);
  const [showQuickTagDropdown, setShowQuickTagDropdown] = useState(false);
  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [tagDropdownPosition, setTagDropdownPosition] = useState<{left: number, top: number}>({left: 0, top: 0});
  const quickTagButtonRef = useRef<HTMLButtonElement>(null);
  const quickTagDropdownRef = useRef<HTMLDivElement>(null);
  const memberButtonRef = useRef<HTMLButtonElement>(null);
  
  const toolbarPinnedOpen =
    isEditingTitle || isEditingDescription || isSelected;

  const handleCopy = () => {
    onCopy(task);
  };

  // State for drag-to-link logic
  const [isDragPrepared, setIsDragPrepared] = useState(false);
  const [dragStartPosition, setDragStartPosition] = useState<{x: number, y: number} | null>(null);
  const dragThreshold = 5; // Minimum pixels to consider it a drag

  const handleLinkPointerDown = (e: React.PointerEvent) => {
    // CRITICAL: Prevent the task card's drag listeners from interfering
    e.preventDefault();
    e.stopPropagation();
    
    // Use the actual mouse position when clicking, not the button center
    // This prevents false drag detection when clicking the button
    const startPos = { x: e.clientX, y: e.clientY };
    
    // Prepare for potential drag, but don't start linking yet
    setIsDragPrepared(true);
    setDragStartPosition(startPos);
  };
  
  const handleLinkMouseDown = (e: React.MouseEvent) => {
    // Also handle mousedown as fallback
    e.preventDefault();
    e.stopPropagation();
    
    const startPos = { x: e.clientX, y: e.clientY };
    setIsDragPrepared(true);
    setDragStartPosition(startPos);
  };
  
  // Handle global mouse/pointer move to detect drag while holding down
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragPrepared && dragStartPosition && onStartLinking) {
        const currentX = e.clientX;
        const currentY = e.clientY;
        const deltaX = Math.abs(currentX - dragStartPosition.x);
        const deltaY = Math.abs(currentY - dragStartPosition.y);
        
        // If moved beyond threshold, start linking mode
        if (deltaX > dragThreshold || deltaY > dragThreshold) {
          setIsDragPrepared(false);
          onStartLinking(task, dragStartPosition);
          setDragStartPosition(null);
        }
      }
    };

    const handleGlobalPointerMove = (e: PointerEvent) => {
      // Also handle pointer events for better cross-device support
      if (isDragPrepared && dragStartPosition && onStartLinking) {
        const currentX = e.clientX;
        const currentY = e.clientY;
        const deltaX = Math.abs(currentX - dragStartPosition.x);
        const deltaY = Math.abs(currentY - dragStartPosition.y);
        
        // If moved beyond threshold, start linking mode
        if (deltaX > dragThreshold || deltaY > dragThreshold) {
          setIsDragPrepared(false);
          onStartLinking(task, dragStartPosition);
          setDragStartPosition(null);
        }
      }
    };

    const handleGlobalMouseUp = (_e: MouseEvent) => {
      if (isDragPrepared) {
        // Released without dragging - cancel linking
        setIsDragPrepared(false);
        setDragStartPosition(null);
      }
    };

    const handleGlobalPointerUp = (_e: PointerEvent) => {
      if (isDragPrepared) {
        // Released without dragging - cancel linking
        setIsDragPrepared(false);
        setDragStartPosition(null);
      }
    };

    if (isDragPrepared) {
      // Listen to both mouse and pointer events for better cross-device support
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('pointermove', handleGlobalPointerMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      document.addEventListener('pointerup', handleGlobalPointerUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('pointermove', handleGlobalPointerMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('pointerup', handleGlobalPointerUp);
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

  const handleTagCreated = (newTag: Tag) => {
    // Automatically add the newly created tag to the current task
    if (onTagAdd) {
      onTagAdd(newTag.id.toString());
    }
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
      
      // Set height based on actual members to show, with a minimum of 2 members and maximum of 12
      const visibleMembers = Math.max(2, Math.min(12, membersToShow));
      const dropdownHeight = visibleMembers * memberItemHeight + 40; // +40 for "Assign to:" header
      
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

  // Close quick tag dropdown when clicking outside
  useEffect(() => {
    if (!showQuickTagDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      
      // Check if click is inside the portal dropdown (using both data attribute and ref)
      const tagDropdown = target.closest('[data-tag-dropdown]');
      if (tagDropdown || (quickTagDropdownRef.current && quickTagDropdownRef.current.contains(target))) {
        return; // Click is inside dropdown, don't close
      }
      
      // Check if click is on the button itself - if so, let the toggle handle it
      if (quickTagButtonRef.current && quickTagButtonRef.current.contains(target)) {
        // The button's onClick will toggle, so we don't need to close here
        return;
      }
      
      // Click is outside both button and dropdown, close it
      setShowQuickTagDropdown(false);
    };

    // Use mousedown (not click) to catch events before stopPropagation can interfere
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showQuickTagDropdown]);

  // Close member dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      // Check if click is outside both the member button and the portal dropdown
      if (
        memberButtonRef.current && 
        !memberButtonRef.current.contains(target) &&
        !target.closest('[data-member-dropdown]') // Check if click is inside the portal dropdown
      ) {
        onToggleMemberSelect();
      }
    };

    if (showMemberSelect) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMemberSelect, onToggleMemberSelect]);

  const handleMemberToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleMemberSelect();
  };

  const isAgentAssigned = member.id === AGENT_MEMBER_ID;
  const agentBlocking =
    isAgentAssigned &&
    !!agentWorkStatus &&
    (AGENT_DRAG_BLOCKING_STATUSES as readonly string[]).includes(agentWorkStatus);

  const agentLockedLabel = t('toolbar.disabledWhileAgent');

  return (
    <>
      {/* Agent status icon opens Agent activity (config/controls live there). */}
      {isAgentAssigned ? (
        <div className="absolute top-1 left-1 z-[6] flex items-center gap-0.5">
          <AgentStatusButton
            status={agentWorkStatus}
            onClick={(e) => {
              e.stopPropagation();
              onOpenAgentActivity?.();
            }}
          />
          {!agentBlocking && !isDragDisabled && (
            <KanbanChromeTooltip label={t('toolbar.dragToMove')} wrapperClassName="">
              <div
                {...listeners}
                {...attributes}
                className="p-1 rounded cursor-grab active:cursor-grabbing hover:bg-gray-200 opacity-50 hover:opacity-100 transition-opacity"
              >
                <GripVertical size={12} className="text-gray-400" />
              </div>
            </KanbanChromeTooltip>
          )}
        </div>
      ) : (
        <KanbanChromeTooltip label={t('toolbar.dragToMove')} wrapperClassName="absolute top-1 left-1 z-[6]">
          <div
            {...listeners}
            {...attributes}
            className={`p-1 rounded ${
              !isDragDisabled
                ? 'cursor-grab active:cursor-grabbing hover:bg-gray-200 opacity-60 hover:opacity-100'
                : 'cursor-not-allowed opacity-0'
            } transition-all duration-200`}
          >
            <GripVertical size={12} className="text-gray-400" />
          </div>
        </KanbanChromeTooltip>
      )}

      {/* Unified Toolbar - visibility via parent `group` hover so reorder under cursor still shows toolbar */}
      <div
        className={`absolute top-0 z-[5] px-2 py-1 transition-opacity duration-200 ${
          isAgentAssigned
            ? !agentBlocking && !isDragDisabled
              ? 'left-11'
              : 'left-8'
            : 'left-4'
        } ${
          toolbarPinnedOpen
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'
        }`}
        data-tour-id="task-card-toolbar"
      >
          <div className="flex gap-0">
              {/* Add Comment Button */}
            {onAddComment && (
              <KanbanChromeTooltip label={t('toolbar.addComment')}>
                <button
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddComment();
                  }}
                >
                  <MessageSquarePlus size={14} className="text-gray-400 hover:text-gray-600 transition-colors" />
                </button>
              </KanbanChromeTooltip>
            )}
            
            {/* Add Tag Button - Always show when onTagAdd is provided, regardless of available tags */}
            {onTagAdd && (
              <KanbanChromeTooltip label={agentBlocking ? agentLockedLabel : t('toolbar.addTag')}>
                <button
                  ref={quickTagButtonRef}
                  disabled={agentBlocking}
                  className={`p-1 rounded-full transition-colors ${
                    agentBlocking
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-gray-100'
                  }`}
                  onClick={agentBlocking ? undefined : handleQuickTagClick}
                >
                  <div className="relative">
                    <TagIcon size={14} className="text-gray-400 hover:text-gray-600 transition-colors" />
                    <Plus size={7} className="text-gray-400 absolute -top-1 -right-1" />
                  </div>
                </button>
              </KanbanChromeTooltip>
            )}
            
            {/* Copy Task Button — safe while agent runs (clone only) */}
            <KanbanChromeTooltip label={t('toolbar.copyTask')}>
              <button
                onClick={handleCopy}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <Copy size={14} className="text-gray-400 hover:text-gray-600 transition-colors" />
              </button>
            </KanbanChromeTooltip>
            
            {/* View Details Button - REMOVED: Click anywhere on card to open details */}
            
            {/* Link Task Button */}
            {onStartLinking && (
              <KanbanChromeTooltip
                label={
                  agentBlocking
                    ? agentLockedLabel
                    : isLinkingMode && linkingSourceTask?.id === task.id
                      ? t('toolbar.sourceTaskForLinking')
                      : t('toolbar.holdAndDragToLink')
                }
              >
                <button
                  data-no-dnd="true"
                  disabled={agentBlocking}
                  onPointerDown={(e) => {
                    if (agentBlocking) return;
                    handleLinkPointerDown(e);
                  }}
                  onMouseDown={(e) => {
                    if (agentBlocking) return;
                    handleLinkMouseDown(e);
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onMouseEnter={(e) => {
                    if (agentBlocking) return;
                    e.stopPropagation();
                    onLinkToolHover?.(task);
                  }}
                  onMouseLeave={(e) => {
                    e.stopPropagation();
                    onLinkToolHoverEnd?.();
                  }}
                  onPointerEnter={(e) => {
                    if (agentBlocking) return;
                    e.stopPropagation();
                    onLinkToolHover?.(task);
                  }}
                  onPointerLeave={(e) => {
                    e.stopPropagation();
                    onLinkToolHoverEnd?.();
                  }}
                  className={`p-1 rounded-full transition-colors ${
                    agentBlocking
                      ? 'opacity-40 cursor-not-allowed text-gray-400'
                      : isLinkingMode && linkingSourceTask?.id === task.id
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                        : 'hover:bg-blue-100 dark:hover:bg-blue-900 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                  style={{ pointerEvents: 'auto', zIndex: 100, touchAction: 'none', userSelect: 'none' }}
                >
                  <Link size={14} />
                </button>
              </KanbanChromeTooltip>
            )}
            
            {/* Archive Task Button - Show on all tasks when archive column exists, but not if task is already archived */}
            {(() => {
              // Check if an archive column exists in the board
              const archiveColumn = columns && Object.values(columns).find(col => 
                col.is_archived === true || (col.is_archived as any) === 1
              );
              
              // Check if current column is archived
              const currentColumn = columns && columns[task.columnId];
              const isCurrentColumnArchived = currentColumn && (
                currentColumn.is_archived === true || (currentColumn.is_archived as any) === 1
              );
              
              // Show button if archive column exists AND task is not already in an archived column
              return archiveColumn && !isCurrentColumnArchived ? (
                <KanbanChromeTooltip label={agentBlocking ? agentLockedLabel : t('toolbar.archiveTask')}>
                  <button
                    disabled={agentBlocking}
                    onClick={(e) => {
                      if (agentBlocking) return;
                      e.stopPropagation();
                      onEdit({ ...task, columnId: archiveColumn.id });
                    }}
                    className={`p-1 rounded-full transition-colors ${
                      agentBlocking
                        ? 'opacity-40 cursor-not-allowed'
                        : 'hover:bg-yellow-100'
                    }`}
                  >
                    <Archive size={14} className="text-yellow-600" />
                  </button>
                </KanbanChromeTooltip>
              ) : null;
            })()}
            
            {/* Delete Task Button */}
            <KanbanChromeTooltip label={agentBlocking ? agentLockedLabel : t('toolbar.deleteTask')}>
              <button
                disabled={agentBlocking}
                onClick={(e) => {
                  if (agentBlocking) return;
                  onRemove(task.id, e);
                }}
                className={`p-1 rounded-full transition-colors ${
                  agentBlocking
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-red-100'
                }`}
              >
                <Trash2 size={14} className="text-red-500" />
              </button>
            </KanbanChromeTooltip>
        </div>
      </div>

      {/* Watchers & Collaborators Icons - Right side between buttons and avatar */}
      <div className="absolute top-0 right-[40px] flex gap-1 z-30 px-2 py-1" style={{ top: '7px' }}>
          {task.watchers && task.watchers.length > 0 && (
            <KanbanChromeTooltip label={formatMembersTooltip(task.watchers, 'watcher')} delayMs={0} wrapperClassName="flex items-center">
              <span className="flex items-center">
                <Eye size={12} className="text-blue-500" />
                <span className="text-[10px] text-blue-600 ml-0.5 font-medium">{task.watchers.length}</span>
              </span>
            </KanbanChromeTooltip>
          )}
          {task.collaborators && task.collaborators.length > 0 && (
            <KanbanChromeTooltip label={formatMembersTooltip(task.collaborators, 'collaborator')} delayMs={0} wrapperClassName="flex items-center">
              <span className="flex items-center">
                <UserPlus size={12} className="text-blue-500" />
                <span className="text-[10px] text-blue-600 ml-0.5 font-medium">{task.collaborators.length}</span>
              </span>
            </KanbanChromeTooltip>
          )}
      </div>

      {/* Avatar Overlay - Top Right */}
      <div className={`absolute top-1 right-2 ${showMemberSelect ? 'z-[110]' : 'z-20'}`}>
        <div className="relative">
          <KanbanChromeTooltip
            label={agentBlocking ? agentLockedLabel : t('toolbar.changeAssignee')}
          >
            <button
              ref={memberButtonRef}
              disabled={agentBlocking}
              onClick={(e) => {
                if (agentBlocking) return;
                handleMemberToggle(e);
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              className={`p-1 rounded-full shadow-sm transition-colors ${
                agentBlocking
                  ? 'opacity-60 cursor-not-allowed'
                  : 'hover:bg-gray-100 cursor-pointer'
              }`}
              data-member-button="true"
            >
            {isAgentMemberId(member.id) ? (
              <img
                src={getAgentAvatarSrc(member)}
                alt={member.name}
                className="w-8 h-8 rounded-full object-cover border-2 border-white bg-white"
              />
            ) : member.googleAvatarUrl || member.avatarUrl ? (
              <img
                src={getAuthenticatedAvatarUrl(member.googleAvatarUrl || member.avatarUrl)}
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
          </KanbanChromeTooltip>

          {/* Member Selection Dropdown - Now handled by portal below */}
        </div>
      </div>

      {/* Portal-rendered quick tag dropdown */}
      {showQuickTagDropdown && createPortal(
        <div 
          ref={quickTagDropdownRef}
          data-tag-dropdown
          className="fixed w-[200px] bg-white border border-gray-200 rounded-md shadow-lg z-[9999] max-h-[400px] overflow-y-auto"
          style={{
            left: `${tagDropdownPosition.left}px`,
            top: `${tagDropdownPosition.top}px`
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Add Tag Button */}
          <div 
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setShowAddTagModal(true);
              setShowQuickTagDropdown(false);
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            className="flex items-center gap-2 p-2 hover:bg-blue-50 cursor-pointer border-b border-gray-200 text-blue-600 font-medium sticky top-0 bg-white"
          >
            <Plus size={14} />
            <span className="text-sm">{t('toolbar.addTag')}</span>
          </div>
          
          {availableTagsForAssignment.length === 0 ? (
            <div className="p-3 text-sm text-gray-500">
              {t('toolbar.noMoreTagsAvailable')}
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
            data-member-dropdown="true"
            className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-[99999] min-w-[200px] overflow-y-auto"
            style={{
              left: `${position.left}px`,
              top: `${position.top}px`,
              maxHeight: `${position.height}px`
            }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
          >
          <div className="p-2">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('toolbar.assignTo')}</div>
            {(() => {
              const ordered = sortMembersAgentLast(members);
              const people = ordered.filter((m) => !isAgentMemberId(m.id));
              const agent = ordered.find((m) => isAgentMemberId(m.id));
              const renderRow = (m: TeamMember) => (
                <button
                  key={m.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMemberChange(m.id);
                  }}
                  className={`w-full flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    m.id === SYSTEM_MEMBER_ID ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''
                  } ${
                    m.id === member.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700'
                      : ''
                  }`}
                >
                  {isAgentMemberId(m.id) ? (
                    <img
                      src={getAgentAvatarSrc(m)}
                      alt={m.name}
                      className="w-6 h-6 rounded-full object-cover bg-white"
                    />
                  ) : m.googleAvatarUrl || m.avatarUrl ? (
                    <img
                      src={getAuthenticatedAvatarUrl(m.googleAvatarUrl || m.avatarUrl)}
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
                  <span className="text-sm text-gray-900 dark:text-gray-100">
                    {truncateMemberName(m.name)}
                  </span>
                  {m.id === member.id && (
                    <span className="ml-auto text-blue-600 dark:text-blue-400 text-xs">✓</span>
                  )}
                </button>
              );
              return (
                <>
                  {people.map(renderRow)}
                  {agent && (
                    <>
                      <div className="my-1.5 border-t border-gray-200 dark:border-gray-600" />
                      <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 px-2 mb-1">
                        {t('toolbar.assignToAgentSection')}
                      </div>
                      {renderRow(agent)}
                    </>
                  )}
                </>
              );
            })()}
          </div>
          </div>,
          document.body
        );
      })()}
      
      {/* Add Tag Modal */}
      {showAddTagModal && createPortal(
        <AddTagModal
          onClose={() => setShowAddTagModal(false)}
          onTagCreated={handleTagCreated}
        />,
        document.body
      )}
    </>
  );
}
