import React, { useState, useEffect, useRef } from 'react';
import { Clock, X, Edit2, FileText, MessageCircle, Copy, Calendar, Eye, UserPlus } from 'lucide-react';
import { Task, TeamMember, Priority, PriorityOption } from '../types';
import { TaskViewMode } from '../utils/userPreferences';
import QuickEditModal from './QuickEditModal';
import { formatToYYYYMMDD, formatToYYYYMMDDHHmmss } from '../utils/dateUtils';
import { useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { setDndGloballyDisabled, isDndGloballyDisabled } from '../utils/globalDndState';

// System user member ID constant
const SYSTEM_MEMBER_ID = '00000000-0000-0000-0000-000000000001';

// Helper function to get priority colors from hex
const getPriorityColors = (hexColor: string) => {
  // Convert hex to RGB
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Create light background and use original color for text
  const bgColor = `rgb(${r}, ${g}, ${b}, 0.1)`; // 10% opacity background
  const textColor = hexColor; // Original color for text
  
  return {
    backgroundColor: bgColor,
    color: textColor
  };
};

interface TaskCardProps {
  task: Task;
  member: TeamMember;
  members: TeamMember[];
  onRemove: (taskId: string, event?: React.MouseEvent) => void;
  onEdit: (task: Task) => void;
  onCopy: (task: Task) => void;
  onDragStart: (task: Task) => void;
  onDragEnd: () => void;
  onSelect: (task: Task) => void;
  isDragDisabled?: boolean;
  taskViewMode?: TaskViewMode;
  availablePriorities?: PriorityOption[];
  selectedTask?: Task | null;
}



export default function TaskCard({
  task,
  member,
  members,
  onRemove,
  onEdit,
  onCopy,
  onDragStart,
  onDragEnd,
  onSelect,
  isDragDisabled = false,
  taskViewMode = 'expand',
  availablePriorities = [],
  selectedTask = null
}: TaskCardProps) {
  const [showQuickEdit, setShowQuickEdit] = useState(false);
  const [showMemberSelect, setShowMemberSelect] = useState(false);
  const [showCommentTooltip, setShowCommentTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<'above' | 'below'>('above');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task.title);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [isEditingDueDate, setIsEditingDueDate] = useState(false);
  const [isEditingEffort, setIsEditingEffort] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [showPrioritySelect, setShowPrioritySelect] = useState(false);
  const [editedDate, setEditedDate] = useState(task.startDate);
  const [editedDueDate, setEditedDueDate] = useState(task.dueDate || '');
  const [editedEffort, setEditedEffort] = useState(task.effort);
  const [editedDescription, setEditedDescription] = useState(task.description);
  const [showAllTags, setShowAllTags] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<'above' | 'below'>('below');
  const [watchersCount, setWatchersCount] = useState(0);
  const [collaboratorsCount, setCollaboratorsCount] = useState(0);
  const priorityButtonRef = useRef<HTMLButtonElement>(null);
  const commentTooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const commentTooltipShowTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const commentContainerRef = useRef<HTMLDivElement>(null);
  const wasDraggingRef = useRef(false);

  // Check if any editing is active to disable drag
  const isAnyEditingActive = isEditingTitle || isEditingDate || isEditingDueDate || isEditingEffort || isEditingDescription || showQuickEdit || showMemberSelect || showPrioritySelect || showCommentTooltip;

  // @dnd-kit sortable hook for vertical reordering
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: task.id,
    disabled: isDragDisabled || isAnyEditingActive || isDndGloballyDisabled(),
    data: {
      type: 'task',
      task: task,
      columnId: task.columnId,
      position: task.position
    }
  });

  // @dnd-kit droppable hook for cross-column insertion
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `${task.id}-drop`,
    data: {
      type: 'task',
      task: task,
      columnId: task.columnId,
      position: task.position
    }
  });

  // Combine both refs
  const setNodeRef = (node: HTMLElement | null) => {
    setSortableRef(node);
    setDroppableRef(node);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms ease',
    zIndex: isDragging ? 1000 : 'auto',
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return formatToYYYYMMDD(dateStr);
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '';
    return formatToYYYYMMDDHHmmss(dateStr);
  };

  // Check if task is overdue (due date is before today)
  const isOverdue = () => {
    if (!task.dueDate) return false;
    const today = new Date();
    const dueDate = new Date(task.dueDate);
    // Set time to beginning of day for fair comparison
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  };

  // Check if this task is currently selected (TaskDetails panel is open for this task)
  const isSelected = selectedTask?.id === task.id;

  // Track drag state for parent notifications
  useEffect(() => {
    if (isDragging && !wasDraggingRef.current) {
      onDragStart(task);
      wasDraggingRef.current = true;
    } else if (!isDragging && wasDraggingRef.current) {
      onDragEnd();
      wasDraggingRef.current = false;
    }
  }, [isDragging, task, onDragStart, onDragEnd]);

  useEffect(() => {
    const handleClickOutside = (_event: MouseEvent) => {
      if (showMemberSelect) {
        setShowMemberSelect(false);
      }
      if (showPrioritySelect) {
        setShowPrioritySelect(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showMemberSelect, showPrioritySelect]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (commentTooltipTimeoutRef.current) {
        clearTimeout(commentTooltipTimeoutRef.current);
      }
      if (commentTooltipShowTimeoutRef.current) {
        clearTimeout(commentTooltipShowTimeoutRef.current);
      }
    };
  }, []);

  // Update watchers and collaborators count from task data
  useEffect(() => {
    setWatchersCount(task.watchers?.length || 0);
    setCollaboratorsCount(task.collaborators?.length || 0);
  }, [task.watchers, task.collaborators]);

  const handleCopy = () => {
    onCopy(task);
  };

  const handleMemberChange = (memberId: string) => {
    onEdit({ ...task, memberId });
    setShowMemberSelect(false);
  };

  const handleTitleDoubleClick = () => {
    setIsEditingTitle(true);
    setEditedTitle(task.title);
  };

  const handleTitleSave = () => {
    if (editedTitle.trim() && editedTitle !== task.title) {
      onEdit({ ...task, title: editedTitle.trim() });
    }
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setEditedTitle(task.title);
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleTitleCancel();
    }
  };

  const handleDateSave = () => {
    if (editedDate !== task.startDate) {
      onEdit({ ...task, startDate: editedDate });
    }
    setIsEditingDate(false);
  };

  const handleDateCancel = () => {
    setEditedDate(task.startDate);
    setIsEditingDate(false);
  };

  const handleDateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleDateSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleDateCancel();
    }
  };

  const handleDueDateSave = () => {
    if (editedDueDate !== (task.dueDate || '')) {
      onEdit({ ...task, dueDate: editedDueDate || undefined });
    }
    setIsEditingDueDate(false);
  };

  const handleDueDateCancel = () => {
    setEditedDueDate(task.dueDate || '');
    setIsEditingDueDate(false);
  };

  const handleDueDateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleDueDateSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleDueDateCancel();
    }
  };

  const handleEffortSave = () => {
    if (editedEffort !== task.effort) {
      onEdit({ ...task, effort: editedEffort });
    }
    setIsEditingEffort(false);
  };

  const handleEffortCancel = () => {
    setEditedEffort(task.effort);
    setIsEditingEffort(false);
  };

  const handleEffortKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEffortSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleEffortCancel();
    }
  };

  const handleDescriptionSave = () => {
    if (editedDescription !== task.description) {
      onEdit({ ...task, description: editedDescription });
    }
    setIsEditingDescription(false);
  };

  const handleDescriptionCancel = () => {
    setEditedDescription(task.description);
    setIsEditingDescription(false);
  };

  const handleDescriptionKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleDescriptionSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleDescriptionCancel();
    }
  };

  const handlePriorityChange = (priority: Priority) => {
    onEdit({ ...task, priority });
    setShowPrioritySelect(false);
  };

  const handleCommentTooltipShow = () => {
    // Clear any pending hide timeout
    if (commentTooltipTimeoutRef.current) {
      clearTimeout(commentTooltipTimeoutRef.current);
      commentTooltipTimeoutRef.current = null;
    }
    
    // Clear any existing show timeout
    if (commentTooltipShowTimeoutRef.current) {
      clearTimeout(commentTooltipShowTimeoutRef.current);
    }
    
    // Wait 1 second before showing tooltip
    commentTooltipShowTimeoutRef.current = setTimeout(() => {
      // Calculate best position for tooltip
      const position = calculateTooltipPosition();
      setTooltipPosition(position);
      setShowCommentTooltip(true);
      commentTooltipShowTimeoutRef.current = null;
    }, 1000);
  };

  const handleCommentTooltipHide = () => {
    // Cancel any pending show timeout when leaving
    if (commentTooltipShowTimeoutRef.current) {
      clearTimeout(commentTooltipShowTimeoutRef.current);
      commentTooltipShowTimeoutRef.current = null;
    }
    
    // Only hide after a delay to allow mouse movement into tooltip
    commentTooltipTimeoutRef.current = setTimeout(() => {
      setShowCommentTooltip(false);
    }, 500); // Generous delay
  };

  const calculateDropdownPosition = () => {
    if (priorityButtonRef.current) {
      const rect = priorityButtonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      return spaceBelow < 150 ? 'above' : 'below';
    }
    return 'below';
  };

  const calculateTooltipPosition = () => {
    if (commentContainerRef.current) {
      const rect = commentContainerRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      const tooltipHeight = 256; // max-h-64 = 256px
      
      // Prefer above, but use below if not enough space above
      return spaceAbove >= tooltipHeight ? 'above' : spaceBelow >= tooltipHeight ? 'below' : 'above';
    }
    return 'above';
  };

  useEffect(() => {
    const handleClickOutside = (_event: MouseEvent) => {
      if (showMemberSelect) {
        setShowMemberSelect(false);
      }
      if (showPrioritySelect) {
        setShowPrioritySelect(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showMemberSelect, showPrioritySelect]);

  useEffect(() => {
    if (isDragging) {
      onDragStart(task);
    } else {
      onDragEnd();
    }
  }, [isDragging, task, onDragStart, onDragEnd]);

  const validComments = (task.comments || [])
    .filter(comment => 
      comment && 
      comment.id && 
      comment.text && 
      comment.text.trim() !== '' && 
      comment.authorId && 
      comment.createdAt
    );

  return (
    <>
      <div
        ref={setNodeRef}
        style={{ ...style, borderLeft: `4px solid ${member.color}` }}
        className={`task-card sortable-item ${
          isSelected ? 'bg-gray-100' : 
          member.id === SYSTEM_MEMBER_ID ? 'bg-yellow-50' : 
          isOverdue() ? 'bg-red-50' : 'bg-white'
        } p-4 rounded-lg shadow-sm cursor-default relative transition-all duration-200 ${
          isDragging ? 'opacity-90 scale-105 shadow-2xl rotate-2 ring-2 ring-blue-400' : 'hover:shadow-md'
        }`}
        {...attributes}
      >
        {/* Left Border Drag Handle - Much wider for easier grabbing */}
        <div
          {...listeners}
          className={`absolute left-0 top-0 bottom-0 w-8 z-[6] ${
            !isDragDisabled && !isAnyEditingActive && !isDndGloballyDisabled()
              ? 'cursor-grab active:cursor-grabbing hover:bg-black hover:bg-opacity-5' 
              : 'cursor-not-allowed'
          } transition-colors`}
          title="Drag to move task"
        />

        {/* Overlay Toolbar - Positioned at top edge */}
        <div className="absolute top-0 left-0 right-0 px-2 py-1 transition-opacity duration-200 z-[5]">
          {/* Delete Button - Left Corner */}
          <button
            onClick={(e) => onRemove(task.id, e)}
            className="absolute top-1 left-2 p-1 hover:bg-red-100 rounded-full transition-colors"
            title="Delete Task"
          >
            <X size={14} className="text-red-500" />
          </button>

          
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
                onClick={() => {
                  setShowQuickEdit(true);
                  setDndGloballyDisabled(true);
                }}
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
            </div>
          </div>

          {/* Watchers & Collaborators Icons - Right side between buttons and avatar */}
          <div className="absolute top-1 right-12 flex gap-1">
            {watchersCount > 0 && (
              <div className="flex items-center" title={`${watchersCount} watcher${watchersCount > 1 ? 's' : ''}`}>
                <Eye size={12} className="text-blue-500" />
                <span className="text-[10px] text-blue-600 ml-0.5 font-medium">{watchersCount}</span>
              </div>
            )}
            {collaboratorsCount > 0 && (
              <div className="flex items-center" title={`${collaboratorsCount} collaborator${collaboratorsCount > 1 ? 's' : ''}`}>
                <UserPlus size={12} className="text-blue-500" />
                <span className="text-[10px] text-blue-600 ml-0.5 font-medium">{collaboratorsCount}</span>
              </div>
            )}
          </div>
        </div>

        {/* Avatar Overlay - Top Right */}
        <div className={`absolute top-1 right-2 ${showMemberSelect ? 'z-[110]' : 'z-20'}`}>
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMemberSelect(!showMemberSelect);
              }}
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
              <div className="absolute top-full right-0 mt-1 w-48 bg-white rounded-md shadow-lg z-[100] border border-gray-200">
                {members.map(m => (
                  <button
                    key={m.id}
                    onClick={() => handleMemberChange(m.id)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <div 
                      className="w-4 h-4 rounded-full" 
                      style={{ backgroundColor: m.color }}
                    />
                    <span>{m.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Title Row - Full Width */}
        <div className="mb-2 mt-1">
          {isEditingTitle ? (
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleCancel}
              onKeyDown={handleTitleKeyDown}
              className="font-medium text-gray-800 bg-white border border-blue-400 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-full text-sm"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <h3 
              className="font-medium text-gray-800 cursor-text hover:bg-gray-50 px-1 py-0.5 rounded text-sm pr-12"
              onDoubleClick={handleTitleDoubleClick}
              title="Double-click to edit"
            >
              {task.title}
            </h3>
          )}
        </div>

        {/* Description Section */}
        {taskViewMode !== 'compact' && (
          <>
            {isEditingDescription ? (
              <div className="-mt-2 mb-3">
                <textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  onBlur={handleDescriptionCancel}
                  onKeyDown={handleDescriptionKeyDown}
                  className="w-full text-sm text-gray-600 bg-white border border-blue-400 rounded px-2 py-1 outline-none focus:border-blue-500 resize-y"
                  rows={3}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Enter task description..."
                />
                <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                  <span>Press Enter to save, Shift+Enter for new line, Escape to cancel</span>
                </div>
              </div>
            ) : (
              <div
                className="text-sm text-gray-600 -mt-2 mb-3 cursor-text hover:bg-gray-50 px-2 py-1 rounded transition-colors whitespace-pre-wrap"
                onDoubleClick={() => setIsEditingDescription(true)}
                title={taskViewMode === 'shrink' && task.description && task.description.length > 60 ? task.description : "Double-click to edit description"}
              >
                {taskViewMode === 'shrink' && task.description && task.description.length > 60 
                  ? `${task.description.substring(0, 60)}...` 
                  : task.description || ''
                }
              </div>
            )}
          </>
        )}

        {/* Tags Section - Right Aligned */}
        {task.tags && task.tags.length > 0 && (
          <div 
            className="flex justify-end mb-2 relative"
            onMouseEnter={() => setShowAllTags(true)}
            onMouseLeave={() => setShowAllTags(false)}
          >
            <div className={`flex flex-wrap gap-1 justify-end transition-all duration-200 ${
              showAllTags ? 'max-w-none' : 'max-w-full overflow-hidden'
            }`}>
              {(showAllTags ? task.tags : task.tags.slice(0, 3)).map((tag) => (
                <span
                  key={tag.id}
                  className="px-1.5 py-0.5 rounded-full text-xs font-medium"
                  style={(() => {
                    if (!tag.color) {
                      return { backgroundColor: '#6b7280', color: 'white' };
                    }
                    // Check if color is white or very light
                    const hex = tag.color.replace('#', '');
                    if (hex.toLowerCase() === 'ffffff' || hex.toLowerCase() === 'fff') {
                      return { backgroundColor: tag.color, color: '#374151', border: '1px solid #d1d5db' };
                    }
                    // Use solid color background with white text
                    return { backgroundColor: tag.color, color: 'white' };
                  })()}
                  title={tag.description || tag.tag}
                >
                  {tag.tag}
                </span>
              ))}
              {!showAllTags && task.tags.length > 3 && (
                <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-400 text-white">
                  +{task.tags.length - 3}
                </span>
              )}
            </div>
          </div>
        )}
        
        {/* Bottom metadata row */}
        <div className="flex items-center justify-between text-sm text-gray-500">
          {/* Left side - dates and effort and comments */}
          <div className="flex items-center gap-2">
            {/* Dates - ultra compact */}
            <div className="flex items-center gap-0.5">
              <Calendar size={12} />
              <div className="text-xs leading-none font-mono">
                {/* Start Date */}
                {isEditingDate ? (
                  <input
                    type="date"
                    value={editedDate}
                    onChange={(e) => setEditedDate(e.target.value)}
                    onBlur={handleDateSave}
                    onKeyDown={handleDateKeyDown}
                    className="text-[10px] bg-white border border-blue-400 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-[100px] font-mono"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditingDate(true);
                    }}
                    className="hover:bg-gray-100 rounded px-0.5 py-0.5 transition-colors cursor-pointer"
                    title="Click to change start date"
                  >
                    {formatDate(task.startDate)}
                  </div>
                )}
                
                {/* Due Date - directly underneath with zero spacing */}
                {(task.dueDate || isEditingDueDate) && (
                  <>
                    {isEditingDueDate ? (
                      <input
                        type="date"
                        value={editedDueDate}
                        onChange={(e) => setEditedDueDate(e.target.value)}
                        onBlur={handleDueDateSave}
                        onKeyDown={handleDueDateKeyDown}
                        className="text-[10px] bg-white border border-blue-400 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-[100px] block font-mono"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsEditingDueDate(true);
                        }}
                        className="hover:bg-gray-100 rounded px-0.5 py-0.5 transition-colors cursor-pointer font-bold"
                        title="Click to change due date"
                      >
                        {formatDate(task.dueDate || '')}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            
            {/* Effort - squeezed close */}
            <div className="flex items-center gap-0.5">
              <Clock size={12} />
              {isEditingEffort ? (
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editedEffort}
                  onChange={(e) => setEditedEffort(parseInt(e.target.value) || 0)}
                  onBlur={handleEffortSave}
                  onKeyDown={handleEffortKeyDown}
                  className="text-xs bg-white border border-blue-400 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-10"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingEffort(true);
                  }}
                  className="hover:bg-gray-100 rounded px-0.5 py-0.5 transition-colors cursor-pointer text-xs"
                  title="Click to change effort"
                >
                  {task.effort}h
                </button>
              )}
            </div>

            {/* Comments - squeezed close to effort */}
            {validComments.length > 0 && (
              <div 
                ref={commentContainerRef}
                className="relative"
                onMouseEnter={handleCommentTooltipShow}
                onMouseLeave={handleCommentTooltipHide}
              >
                <div
                  className="flex items-center gap-0.5 rounded px-1 py-1"
                  title="Hover to view comments"
                >
                  <MessageCircle 
                    size={12} 
                    className="text-blue-600" 
                  />
                  <span className="text-blue-600 font-medium text-xs">
                    {validComments.length}
                  </span>
                </div>
              
                {/* JavaScript-controlled Comment Tooltip */}
                {showCommentTooltip && (
                  <>
                    {/* Invisible bridge to fill gap */}
                    <div 
                      className={`absolute left-0 w-full h-2 z-40 ${
                        tooltipPosition === 'above' ? 'bottom-0' : 'top-0'
                      }`}
                      onMouseEnter={handleCommentTooltipShow}
                      onMouseLeave={handleCommentTooltipHide}
                    />
                    <div 
                      className={`comment-tooltip absolute left-0 w-80 bg-gray-800 text-white text-xs rounded-md shadow-lg z-[100] max-h-64 flex flex-col ${
                        tooltipPosition === 'above' 
                          ? 'bottom-full mb-1' 
                          : 'top-full mt-1'
                      }`}
                      onMouseEnter={handleCommentTooltipShow}
                      onMouseLeave={handleCommentTooltipHide}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Scrollable comments area */}
                      <div className="p-3 overflow-y-auto flex-1">
                    {validComments
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((comment, index) => {
                        const author = members.find(m => m.id === comment.authorId);
                        
                        // Function to render HTML content with safe link handling
                        const renderCommentHTML = (htmlText: string) => {
                          // Create a temporary div to parse the HTML
                          const tempDiv = document.createElement('div');
                          tempDiv.innerHTML = htmlText;
                          
                          // Find all links and update their attributes for safety
                          const links = tempDiv.querySelectorAll('a');
                          links.forEach(link => {
                            link.setAttribute('target', '_blank');
                            link.setAttribute('rel', 'noopener noreferrer');
                            link.style.color = '#60a5fa'; // text-blue-400
                            link.style.textDecoration = 'underline';
                            link.style.wordBreak = 'break-all';
                            link.style.cursor = 'pointer';
                            
                            // Add click handler
                            link.addEventListener('click', (e) => {
                              e.stopPropagation();
                              window.open(link.href, '_blank', 'noopener,noreferrer');
                            });
                            
                            link.addEventListener('mousedown', (e) => {
                              e.stopPropagation();
                            });
                          });
                          
                          return (
                            <span 
                              dangerouslySetInnerHTML={{ __html: tempDiv.innerHTML }}
                              className="select-text"
                            />
                          );
                        };

                        return (
                          <div key={comment.id} className={`mb-3 ${index > 0 ? 'pt-2 border-t border-gray-600' : ''}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <div 
                                className="w-2 h-2 rounded-full flex-shrink-0" 
                                style={{ backgroundColor: author?.color || '#6B7280' }} 
                              />
                              <span className="font-medium text-gray-200">{author?.name || 'Unknown'}</span>
                              <span className="text-gray-400 text-xs">
                                {formatDateTime(comment.createdAt)}
                              </span>
                            </div>
                            <div className="text-gray-300 text-xs leading-relaxed select-text">
                              {renderCommentHTML(comment.text)}
                            </div>
                          </div>
                        );
                        })}
                      </div>
                      
                      {/* Sticky footer */}
                      <div className="border-t border-gray-600 p-3 bg-gray-800 rounded-b-md flex items-center justify-between">
                        <span className="text-gray-300 font-medium">
                          Comments ({validComments.length})
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect(task);
                          }}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                        >
                          Open
                        </button>
                      </div>
                      
                      {/* Tooltip arrow */}
                      <div className={`absolute left-2 w-2 h-2 bg-gray-800 transform rotate-45 ${
                        tooltipPosition === 'above' 
                          ? '-bottom-1' 
                          : '-top-1'
                      }`} />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right side - priority */}
          <div className="relative priority-container">
            <button
              ref={priorityButtonRef}
              onClick={(e) => {
                e.stopPropagation();
                setShowPrioritySelect(!showPrioritySelect);
                if (!showPrioritySelect) {
                  setDropdownPosition(calculateDropdownPosition());
                }
              }}
              className={`px-2 py-1 rounded-full text-xs cursor-pointer hover:opacity-80 transition-all ${showPrioritySelect ? 'ring-2 ring-blue-400' : ''}`}
              style={(() => {
                const priorityOption = availablePriorities.find(p => p.priority === task.priority);
                return priorityOption ? getPriorityColors(priorityOption.color) : { backgroundColor: '#f3f4f6', color: '#6b7280' };
              })()}
              title="Click to change priority"
            >
              {task.priority}
            </button>

            {showPrioritySelect && (
              <div 
                className={`absolute left-0 w-24 bg-white rounded-md shadow-lg z-[100] border border-gray-200 ${
                  dropdownPosition === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
                }`}
              >
                {availablePriorities
                  .filter(priorityOption => priorityOption.priority !== task.priority)
                  .map(priorityOption => (
                    <button
                      key={priorityOption.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePriorityChange(priorityOption.priority);
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 border-b border-gray-100 last:border-b-0 flex items-center gap-2"
                    >
                      <div 
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: priorityOption.color }}
                      />
                      {priorityOption.priority}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>



      {showQuickEdit && (
        <QuickEditModal
          task={task}
          members={members}
          onClose={() => {
            setShowQuickEdit(false);
            setDndGloballyDisabled(false);
          }}
          onSave={onEdit}
        />
      )}
    </>
  );
}
