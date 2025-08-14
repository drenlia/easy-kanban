import React, { useState } from 'react';
import { Calendar, Clock, X, Edit2, Info, MessageCircle, Copy, UserCircle2, MessageSquare } from 'lucide-react';
import { Task, TeamMember, Priority } from '../types';
import QuickEditModal from './QuickEditModal';
import { formatToYYYYMMDD, formatToYYYYMMDDHHmmss } from '../utils/dateUtils';

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
  onSelect
}: TaskCardProps) {
  const [showQuickEdit, setShowQuickEdit] = useState(false);
  const [showMemberSelect, setShowMemberSelect] = useState(false);
  const [showCommentTooltip, setShowCommentTooltip] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task.title);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    onDragStart(task);
  };

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

  const latestComment = getLatestComment(task.comments);
  const commentAuthor = latestComment ? members.find(m => m.id === latestComment.authorId) : null;

  const commentCount = task.comments?.length || 0;

  const validComments = (task.comments || [])
    .filter(comment => comment && comment.text && comment.text.trim() !== '');

  return (
    <>
      <div
        className="task-card bg-white p-4 rounded-lg shadow-sm cursor-move relative"
        style={{ borderLeft: `4px solid ${member.color}` }}
        draggable="true"
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
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
        
        <p className="text-sm text-gray-600 mb-3">{task.description}</p>
        
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-1">
            <Calendar size={14} />
            <span>{formatDate(task.startDate)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock size={14} />
            <span>{task.effort}h</span>
          </div>
          <div 
            className="flex items-center gap-1 relative"
            onMouseEnter={() => setShowCommentTooltip(true)}
            onMouseLeave={() => setShowCommentTooltip(false)}
          >
            <MessageCircle size={14} />
            <span>
              {validComments.length}
            </span>
            
            {/* Comment Tooltip - Only show if there are comments */}
            {showCommentTooltip && 
             task.comments && 
             task.comments.length > 0 && 
             latestComment && 
             commentAuthor && (
              <div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-800 text-white text-xs rounded-md p-3 shadow-lg z-20">
                <div className="flex items-center gap-2 mb-1">
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: commentAuthor.color }} 
                  />
                  <span className="font-medium">{commentAuthor.name}</span>
                  <span className="text-gray-400 text-xs">
                    {formatDateTime(latestComment.createdAt)}
                  </span>
                </div>
                <p className="text-gray-200 line-clamp-3">
                  {latestComment.text.replace(/<[^>]*>/g, '')}
                </p>
                <div className="absolute -bottom-1 left-2 w-2 h-2 bg-gray-800 transform rotate-45" />
              </div>
            )}
          </div>
          <div
            className={`px-2 py-1 rounded-full text-xs ${PRIORITY_COLORS[task.priority]}`}
          >
            {task.priority}
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
