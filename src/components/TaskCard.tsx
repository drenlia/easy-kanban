import React, { useState, useEffect, useRef } from 'react';
import { Clock, X, Edit2, Info, MessageCircle, Copy, UserCircle2, Calendar } from 'lucide-react';
import { Task, TeamMember, Priority, PriorityOption } from '../types';
import QuickEditModal from './QuickEditModal';
import { formatToYYYYMMDD, formatToYYYYMMDDHHmmss } from '../utils/dateUtils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
  onRemove: (taskId: string) => void;
  onEdit: (task: Task) => void;
  onCopy: (task: Task) => void;
  onDragStart: (task: Task) => void;
  onDragEnd: () => void;
  onSelect: (task: Task) => void;
  isDragDisabled?: boolean;
  onCommentTooltipChange?: (isOpen: boolean) => void;
  isTasksShrunk?: boolean;
  availablePriorities?: PriorityOption[];
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
  onCommentTooltipChange,
  isTasksShrunk = false,
  availablePriorities = []
}: TaskCardProps) {
  const [showQuickEdit, setShowQuickEdit] = useState(false);
  const [showMemberSelect, setShowMemberSelect] = useState(false);
  const [showCommentTooltip, setShowCommentTooltip] = useState(false);
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
  const priorityButtonRef = useRef<HTMLButtonElement>(null);
  const commentTooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wasDraggingRef = useRef(false);

  // Check if any editing is active to disable drag
  const isAnyEditingActive = isEditingTitle || isEditingDate || isEditingDueDate || isEditingEffort || isEditingDescription || showQuickEdit || showMemberSelect || showPrioritySelect || showCommentTooltip;

  // @dnd-kit sortable hook for vertical reordering
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: task.id,
    disabled: isDragDisabled || isAnyEditingActive,
    data: {
      type: 'task',
      task: task,
      columnId: task.columnId,
      position: task.position
    }
  });

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
    const handleClickOutside = (event: MouseEvent) => {
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

  // Notify parent when comment tooltip state changes
  useEffect(() => {
    if (onCommentTooltipChange) {
      onCommentTooltipChange(showCommentTooltip);
    }
  }, [showCommentTooltip, onCommentTooltipChange]);

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
    if (commentTooltipTimeoutRef.current) {
      clearTimeout(commentTooltipTimeoutRef.current);
    }
    setShowCommentTooltip(true);
  };

  const handleCommentTooltipHide = () => {
    commentTooltipTimeoutRef.current = setTimeout(() => {
      setShowCommentTooltip(false);
    }, 100);
  };

  const calculateDropdownPosition = () => {
    if (priorityButtonRef.current) {
      const rect = priorityButtonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      return spaceBelow < 150 ? 'above' : 'below';
    }
    return 'below';
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
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
        className={`task-card bg-white p-4 rounded-lg shadow-sm cursor-move relative transition-all duration-200 ${
          isDragging ? 'opacity-90 scale-105 shadow-2xl rotate-2 ring-2 ring-blue-400' : 'hover:shadow-md'
        }`}
        {...attributes}
        {...listeners}
      >
        {/* Title, Tags, and Action Buttons Row */}
        <div className="flex justify-between items-start mb-2">
          <div className="flex-1 mr-2">
            {isEditingTitle ? (
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                className="font-medium text-gray-800 bg-white border border-blue-400 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-full text-sm"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <h3 
                className="font-medium text-gray-800 cursor-text hover:bg-gray-50 px-1 py-0.5 rounded text-sm"
                onDoubleClick={handleTitleDoubleClick}
                title="Double-click to edit"
              >
                {task.title}
              </h3>
            )}
          </div>
          
          <div className="flex flex-col items-end">
            {/* Action Buttons */}
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMemberSelect(!showMemberSelect);
                }}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                title="Change Assignee"
              >
                <UserCircle2 size={16} className="text-gray-500" />
              </button>
              <button
                onClick={handleCopy}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                title="Copy Task"
              >
                <Copy size={16} className="text-gray-500" />
              </button>
              <button
                onClick={() => setShowQuickEdit(true)}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                title="Quick Edit"
              >
                <Edit2 size={16} className="text-gray-500" />
              </button>
              <button
                onClick={() => onSelect(task)}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                title="View Details"
              >
                <Info size={16} className="text-gray-500" />
              </button>
              <button
                onClick={() => onRemove(task.id)}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                title="Delete Task"
              >
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            
            {/* Tags Section - Right underneath action buttons */}
            {task.tags && task.tags.length > 0 && (
              <div 
                className="flex justify-end mt-0.5 relative"
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
          </div>
        </div>

        {/* Description Section */}
        {isEditingDescription ? (
          <div className="mb-3">
            <textarea
              value={editedDescription}
              onChange={(e) => setEditedDescription(e.target.value)}
              onBlur={handleDescriptionSave}
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
            className="text-sm text-gray-600 mb-3 cursor-text hover:bg-gray-50 px-2 py-1 rounded transition-colors whitespace-pre-wrap"
            onDoubleClick={() => setIsEditingDescription(true)}
            title={isTasksShrunk && task.description.length > 60 ? task.description : "Double-click to edit description"}
          >
            {isTasksShrunk && task.description.length > 60 
              ? `${task.description.substring(0, 60)}...` 
              : task.description
            }
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
                    className="text-xs bg-white border border-blue-400 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-24 font-mono"
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
                        className="text-xs bg-white border border-blue-400 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-24 block font-mono"
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
                className="flex items-center gap-0.5 relative"
                onMouseEnter={handleCommentTooltipShow}
                onMouseLeave={handleCommentTooltipHide}
                onMouseDown={(e) => {
                  if (showCommentTooltip) {
                    e.stopPropagation();
                  }
                }}
              >
                <button
                  onClick={() => onSelect(task)}
                  className="flex items-center gap-0.5 hover:bg-gray-100 rounded px-0.5 py-0.5 transition-colors"
                  title="Click to view comments and details"
                >
                  <MessageCircle 
                    size={12} 
                    className="text-blue-600" 
                  />
                  <span className="text-blue-600 font-medium text-xs">
                    {validComments.length}
                  </span>
                </button>
              
                {/* Comment Tooltip */}
                {showCommentTooltip && (
                  <div 
                    className="absolute bottom-full left-0 mb-2 w-80 bg-gray-800 text-white text-xs rounded-md p-3 shadow-lg z-50 max-h-64 overflow-y-auto"
                    onMouseEnter={handleCommentTooltipShow}
                    onMouseLeave={handleCommentTooltipHide}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    style={{ pointerEvents: 'auto' }}
                  >
                    <div className="flex items-center justify-between mb-2 border-b border-gray-600 pb-1">
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
                    {validComments
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((comment, index) => {
                        const author = members.find(m => m.id === comment.authorId);
                        
                        // Function to convert URLs to clickable links
                        const renderTextWithLinks = (text: string) => {
                          const urlRegex = /(https?:\/\/[^\s]+)/g;
                          const parts = text.split(urlRegex);
                          
                          return (
                            <>
                              {parts.map((part, idx) => {
                                if (urlRegex.test(part)) {
                                  return (
                                    <a
                                      key={idx}
                                      href={part}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-400 hover:text-blue-300 underline break-all cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(part, '_blank', 'noopener,noreferrer');
                                      }}
                                      onMouseDown={(e) => e.stopPropagation()}
                                    >
                                      {part}
                                    </a>
                                  );
                                }
                                return part;
                              })}
                            </>
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
                              {renderTextWithLinks(comment.text.replace(/<[^>]*>/g, ''))}
                            </div>
                          </div>
                        );
                      })}
                    <div className="absolute -bottom-1 left-2 w-2 h-2 bg-gray-800 transform rotate-45" />
                  </div>
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
                className={`absolute left-0 w-24 bg-white rounded-md shadow-lg z-50 border border-gray-200 ${
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

      {showMemberSelect && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10">
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

      {showQuickEdit && (
        <QuickEditModal
          task={task}
          members={members}
          onClose={() => setShowQuickEdit(false)}
          onSave={onEdit}
        />
      )}
    </>
  );
}
