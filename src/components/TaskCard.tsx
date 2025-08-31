import React, { useState, useEffect, useRef } from 'react';
import { Clock, X, Edit2, Info, MessageCircle, Copy, UserCircle2 } from 'lucide-react';
import { Task, TeamMember, Priority } from '../types';
import QuickEditModal from './QuickEditModal';
import { formatToYYYYMMDD, formatToYYYYMMDDHHmmss } from '../utils/dateUtils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const PRIORITY_COLORS = {
  low: 'bg-blue-50 text-blue-700',
  medium: 'bg-yellow-50 text-yellow-700',
  high: 'bg-red-50 text-red-700'
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
}

const getLatestComment = (comments?: Comment[]) => {
  if (!comments || comments.length === 0) return null;
  return comments.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
};

const formatDate = (dateString: string) => formatToYYYYMMDD(dateString);
const formatDateTime = (dateString: string) => formatToYYYYMMDDHHmmss(dateString);

const getValidCommentCount = (comments: Comment[] | undefined | null) => {
  if (!comments) return 0;
  
  return comments
    .filter(comment => 
      comment && 
      typeof comment.text === 'string' && 
      comment.text.trim() !== ''
    )
    .length;
};

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
  isDragDisabled = false
}: TaskCardProps) {
  const [showQuickEdit, setShowQuickEdit] = useState(false);
  const [showMemberSelect, setShowMemberSelect] = useState(false);
  const [showCommentTooltip, setShowCommentTooltip] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task.title);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [isEditingEffort, setIsEditingEffort] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [showPrioritySelect, setShowPrioritySelect] = useState(false);
  const [editedDate, setEditedDate] = useState(task.startDate);
  const [editedEffort, setEditedEffort] = useState(task.effort);
  const [editedDescription, setEditedDescription] = useState(task.description);
  const [dropdownPosition, setDropdownPosition] = useState<'above' | 'below'>('below');
  const priorityButtonRef = useRef<HTMLButtonElement>(null);
  const commentTooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    disabled: isDragDisabled,
    data: {
      type: 'task',
      task: task
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms ease', // Smooth transitions
    zIndex: isDragging ? 1000 : 'auto', // Bring dragged item to front
  };

  // Track drag state for parent notifications
  const wasDraggingRef = useRef(false);
  
  React.useEffect(() => {
    if (isDragging && !wasDraggingRef.current) {
      onDragStart(task);
      wasDraggingRef.current = true;
    } else if (!isDragging && wasDraggingRef.current) {
      onDragEnd();
      wasDraggingRef.current = false;
    }
  }, [isDragging, task, onDragStart, onDragEnd]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
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
    console.log('Priority change requested:', { from: task.priority, to: priority, taskId: task.id });
    console.log('onEdit function:', onEdit);
    console.log('Updated task object:', { ...task, priority });
    
    try {
      onEdit({ ...task, priority });
      console.log('onEdit called successfully');
    } catch (error) {
      console.error('Error calling onEdit:', error);
    }
    
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
    }, 150); // Small delay to allow moving mouse to tooltip
  };

  const calculateDropdownPosition = () => {
    if (!priorityButtonRef.current) return 'below';
    
    const rect = priorityButtonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    
    // If there's more space above than below, position above
    return spaceAbove > spaceBelow ? 'above' : 'below';
  };

  // Close expanded priority view when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showPrioritySelect) {
        // Check if the click is on the priority container
        const target = event.target as HTMLElement;
        const priorityContainer = target.closest('.priority-container');
        
        if (!priorityContainer) {
          console.log('Click outside detected, closing expanded priority view');
          setShowPrioritySelect(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPrioritySelect]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (commentTooltipTimeoutRef.current) {
        clearTimeout(commentTooltipTimeoutRef.current);
      }
    };
  }, []);

  const latestComment = getLatestComment(task.comments);
  const commentAuthor = latestComment ? members.find(m => m.id === latestComment.authorId) : null;

  const commentCount = task.comments?.length || 0;

  const validComments = (task.comments || [])
    .filter(comment => comment && comment.text && comment.text.trim() !== '');

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
        <div className="flex justify-between items-start mb-2">
          {isEditingTitle ? (
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              className="font-medium text-gray-800 bg-white border border-blue-400 rounded px-1 py-0.5 outline-none focus:border-blue-500 flex-1 mr-2"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <h3 
              className="font-medium text-gray-800 cursor-text hover:bg-gray-50 px-1 py-0.5 rounded flex-1 mr-2"
              onDoubleClick={handleTitleDoubleClick}
              title="Double-click to edit"
            >
              {task.title}
            </h3>
          )}
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
        </div>
        
        {showMemberSelect && (
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10">
            {members.map(m => (
              <button
                key={m.id}
                onClick={() => handleMemberChange(m.id)}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center gap-2 ${
                  m.id === task.memberId ? 'bg-gray-50' : ''
                }`}
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: m.color }}
                />
                {m.name}
              </button>
            ))}
          </div>
        )}
        
        {isEditingDescription ? (
          <div className="mb-3">
            <textarea
              value={editedDescription}
              onChange={(e) => setEditedDescription(e.target.value)}
              onBlur={handleDescriptionSave}
              onKeyDown={handleDescriptionKeyDown}
              className="text-sm text-gray-600 bg-white border border-blue-400 rounded px-2 py-1 outline-none focus:border-blue-500 w-full resize-y"
              autoFocus
              rows={3}
              onClick={(e) => e.stopPropagation()}
              placeholder="Enter task description..."
            />
            <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
              <span>💡 Press Enter to save, Shift+Enter for new line</span>
            </div>
          </div>
        ) : (
          <div 
            className="text-sm text-gray-600 mb-3 cursor-text hover:bg-gray-50 px-2 py-1 rounded transition-colors whitespace-pre-wrap"
            onDoubleClick={() => setIsEditingDescription(true)}
            title="Double-click to edit description"
          >
            {task.description}
          </div>
        )}
        
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-1">
            {isEditingDate ? (
              <input
                type="date"
                value={editedDate}
                onChange={(e) => setEditedDate(e.target.value)}
                onBlur={handleDateSave}
                onKeyDown={handleDateKeyDown}
                className="text-xs bg-white border border-blue-400 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-28"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingDate(true);
                }}
                className="hover:bg-gray-100 rounded px-1 py-0.5 transition-colors cursor-pointer w-20 text-xs"
                title="Click to change date"
              >
                {formatDate(task.startDate)}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Clock size={14} />
            {isEditingEffort ? (
              <input
                type="number"
                min="0"
                max="100"
                value={editedEffort}
                onChange={(e) => setEditedEffort(parseInt(e.target.value) || 0)}
                onBlur={handleEffortSave}
                onKeyDown={handleEffortKeyDown}
                className="text-sm bg-white border border-blue-400 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-12"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingEffort(true);
                }}
                className="hover:bg-gray-100 rounded px-1 py-0.5 transition-colors cursor-pointer"
                title="Click to change effort"
              >
                {task.effort}h
              </button>
            )}
          </div>
          <div 
            className="flex items-center gap-1 relative"
            onMouseEnter={handleCommentTooltipShow}
            onMouseLeave={handleCommentTooltipHide}
          >
            <button
              onClick={() => onSelect(task)}
              className="flex items-center gap-1 hover:bg-gray-100 rounded px-1 py-0.5 transition-colors"
              title="Click to add comment or view details"
            >
              <MessageCircle 
                size={14} 
                className={validComments.length > 0 ? "text-blue-600" : "text-gray-500"} 
              />
              <span className={validComments.length > 0 ? "text-blue-600 font-medium" : "text-gray-500"}>
                {validComments.length}
              </span>
            </button>
            
            {/* Comment Tooltip - Show all comments in chronological order */}
            {showCommentTooltip && 
             validComments && 
             validComments.length > 0 && (
              <div 
                className="absolute bottom-full left-0 mb-2 w-80 bg-gray-800 text-white text-xs rounded-md p-3 shadow-lg z-20 max-h-64 overflow-y-auto"
                onMouseEnter={handleCommentTooltipShow}
                onMouseLeave={handleCommentTooltipHide}
              >
                <div className="text-gray-300 font-medium mb-2 border-b border-gray-600 pb-1">
                  Comments ({validComments.length})
                </div>
                {validComments
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map((comment, index) => {
                    const author = members.find(m => m.id === comment.authorId);
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
                        <p className="text-gray-300 text-xs leading-relaxed">
                          {comment.text.replace(/<[^>]*>/g, '')}
                        </p>
                      </div>
                    );
                  })}
                <div className="absolute -bottom-1 left-2 w-2 h-2 bg-gray-800 transform rotate-45" />
              </div>
            )}
          </div>
          <div className="relative priority-container">
            <button
              ref={priorityButtonRef}
              onClick={(e) => {
                e.stopPropagation();
                console.log('Priority button clicked, showing floating menu');
                setShowPrioritySelect(!showPrioritySelect);
                if (!showPrioritySelect) {
                  setDropdownPosition(calculateDropdownPosition());
                }
              }}
              className={`px-2 py-1 rounded-full text-xs cursor-pointer hover:opacity-80 transition-all ${PRIORITY_COLORS[task.priority]} ${showPrioritySelect ? 'ring-2 ring-blue-400' : ''}`}
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
                {(['low', 'medium', 'high'] as Priority[])
                  .filter(priority => priority !== task.priority)
                  .map(priority => (
                    <button
                      key={priority}
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('Priority option clicked:', priority);
                        handlePriorityChange(priority);
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 border-b border-gray-100 last:border-b-0 flex items-center gap-2"
                    >
                      <div 
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: priority === 'low' ? '#3B82F6' : priority === 'medium' ? '#F59E0B' : '#EF4444' }}
                      />
                      {priority}
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
          onClose={() => setShowQuickEdit(false)}
          onSave={onEdit}
        />
      )}
    </>
  );
}
