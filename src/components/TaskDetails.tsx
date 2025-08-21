import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Task, TeamMember, Comment, Attachment } from '../types';
import { X, Paperclip } from 'lucide-react';
import DOMPurify from 'dompurify';
import CommentEditor from './CommentEditor';
import { createComment, uploadFile, updateTask, deleteComment, fetchCommentAttachments } from '../api';
import { formatToYYYYMMDD, formatToYYYYMMDDHHmm, getLocalISOString, formatToYYYYMMDDHHmmss } from '../utils/dateUtils';
import { generateUUID } from '../utils/uuid';

interface TaskDetailsProps {
  task: Task;
  members: TeamMember[];
  onClose: () => void;
  onUpdate: (updatedTask: Task) => void;
  onAddComment?: (comment: Comment & { taskId: string }) => Promise<void>;
}

export default function TaskDetails({ task, members, onClose, onUpdate, onAddComment }: TaskDetailsProps) {
  const [width, setWidth] = useState(480);
  const [isResizing, setIsResizing] = useState(false);
  const [editedTask, setEditedTask] = useState<Task>(() => ({
    ...task,
    memberId: task.memberId || members[0]?.id || '',
    requesterId: task.requesterId || members[0]?.id || '',
    comments: (task.comments || [])
      .filter(comment => 
        comment && 
        comment.id && 
        comment.text && 
        comment.authorId && 
        comment.createdAt
      )
      .map(comment => ({
        id: comment.id,
        text: comment.text,
        authorId: comment.authorId,
        createdAt: comment.createdAt,
        taskId: task.id,
        attachments: Array.isArray(comment.attachments) 
          ? comment.attachments.map(attachment => ({
              id: attachment.id,
              name: attachment.name,
              url: attachment.url,
              type: attachment.type,
              size: attachment.size
            }))
          : []
      }))
  }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingText, setIsSavingText] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const [commentAttachments, setCommentAttachments] = useState<Record<string, Attachment[]>>({});
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      setWidth(Math.max(380, Math.min(800, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleUpdate = async (updatedFields: Partial<Task>) => {
    if (isSubmitting) return;

    const updatedTask = { ...editedTask, ...updatedFields };
    setEditedTask(updatedTask);

    // Don't update server immediately for text fields to prevent focus loss
    // Only update server for non-text fields or when explicitly needed
    const isTextUpdate = 'title' in updatedFields || 'description' in updatedFields;
    
    if (!isTextUpdate) {
      try {
        setIsSubmitting(true);
        await onUpdate(updatedTask);
      } catch (error) {
        console.error('Failed to update task:', error);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // Separate function for text field updates (local only)
  const handleTextUpdate = async (field: 'title' | 'description', value: string) => {
    const updatedTask = { ...editedTask, [field]: value };
    setEditedTask(updatedTask);
    
    // Schedule auto-save in 3 seconds
    scheduleAutoSave(updatedTask);
  };

  // Function to schedule auto-save
  const scheduleAutoSave = useCallback((updatedTask: Task) => {
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    // Set new timeout for 3 seconds
    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        setIsSavingText(true);
        await onUpdate(updatedTask);
      } catch (error) {
        console.error('Auto-save failed:', error);
      } finally {
        setIsSavingText(false);
      }
    }, 3000);
  }, [onUpdate]);

  // Function to save changes immediately
  const saveChanges = async () => {
    if (editedTask.title !== task.title || editedTask.description !== task.description) {
      try {
        setIsSavingText(true);
        await onUpdate(editedTask);
      } catch (error) {
        console.error('Failed to save task:', error);
      } finally {
        setIsSavingText(false);
      }
    }
  };

  // Handle click outside to save changes
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (resizeRef.current && !resizeRef.current.contains(target)) {
        // Check if click is outside the TaskDetails panel
        const taskDetailsPanel = document.querySelector('[data-task-details]');
        if (taskDetailsPanel && !taskDetailsPanel.contains(target)) {
          saveChanges();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [editedTask.title, editedTask.description, task.title, task.description]);

  // Cleanup auto-save timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  const handleAddComment = async (content: string, attachments: File[]) => {
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);

      // Upload attachments first
      const uploadedAttachments = await Promise.all(
        attachments.map(async (file) => {
          const fileData = await uploadFile(file);
          return {
            id: fileData.id,
            name: fileData.name,
            url: fileData.url,
            type: fileData.type,
            size: fileData.size
          };
        })
      );

      // Create new comment with attachments
      const newComment = {
        id: generateUUID(),
        text: content,
        authorId: editedTask.memberId || members[0].id,
        createdAt: getLocalISOString(new Date()),
        taskId: editedTask.id,
        attachments: uploadedAttachments
      };

      // Save comment to server
      const savedComment = await createComment(newComment);

      // Update task with new comment
      const updatedTask = {
        ...editedTask,
        comments: [...(editedTask.comments || []), savedComment]
      };

      // Save updated task to server and get fresh data
      const savedTask = await updateTask(updatedTask);

      // Update local state with server data
      setEditedTask(savedTask);
      
      // Update parent component to refresh TaskCard
      if (onUpdate) {
        await onUpdate(savedTask);
      }

    } catch (error) {
      console.error('Failed to add comment:', error);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);

      // Delete comment from server
      await deleteComment(commentId);

      // Remove comment from local state
      const updatedComments = editedTask.comments?.filter(c => c.id !== commentId) || [];
      
      // Update task with filtered comments
      const updatedTask = {
        ...editedTask,
        comments: updatedComments
      };

      // Save updated task to server
      await updateTask(updatedTask);

      // Update local state
      setEditedTask(updatedTask);
      
      // Remove attachments for the deleted comment from local state
      setCommentAttachments(prevAttachments => {
        const newAttachments = { ...prevAttachments };
        delete newAttachments[commentId];
        return newAttachments;
      });

      // Update parent component to refresh TaskCard
      if (onUpdate) {
        await onUpdate(updatedTask);
      }

    } catch (error) {
      console.error('Failed to delete comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const sortedComments = (editedTask.comments || [])
    .filter(comment => 
      comment && 
      comment.id && 
      comment.text && 
      comment.text.trim() !== '' && 
      comment.authorId && 
      comment.createdAt
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Ensure we have valid member IDs
  const validMemberId = members.some(m => m.id === editedTask.memberId)
    ? editedTask.memberId
    : members[0]?.id || '';
    
  const validRequesterId = members.some(m => m.id === editedTask.requesterId)
    ? editedTask.requesterId
    : members[0]?.id || '';

  // Update the date formatting utility
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return `${new Intl.DateTimeFormat('default', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date).replace(/\//g, '-')} ${new Intl.DateTimeFormat('default', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date)}`;
  };

  // Add effect to fetch attachments when comments change
  useEffect(() => {
    const fetchAttachments = async () => {
      const attachmentsMap: Record<string, Attachment[]> = {};
      
      // Only fetch for valid comments
      const validComments = (editedTask.comments || []).filter(
        comment => comment && comment.id && comment.text
      );

      // Fetch attachments for each comment
      await Promise.all(
        validComments.map(async (comment) => {
          try {
            const attachments = await fetchCommentAttachments(comment.id);
            attachmentsMap[comment.id] = attachments;
          } catch (error) {
            console.error(`Failed to fetch attachments for comment ${comment.id}:`, error);
            attachmentsMap[comment.id] = [];
          }
        })
      );

      setCommentAttachments(attachmentsMap);
    };

    fetchAttachments();
  }, [editedTask.comments]);

  return (
    <div 
      className="fixed top-0 right-0 h-full bg-white border-l border-gray-200 flex" 
      style={{ width: `${width}px` }}
      data-task-details
    >
      <div
        ref={resizeRef}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500/20 group"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute inset-y-0 left-0 w-4 -translate-x-2" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <div className="text-sm text-gray-500 mb-1">Task #{editedTask.id}</div>
              <input
                type="text"
                value={editedTask.title}
                onChange={e => handleTextUpdate('title', e.target.value)}
                className="text-xl font-semibold w-full border-none focus:outline-none focus:ring-0"
                disabled={isSubmitting}
              />
            </div>
            <div className="flex items-center gap-2">
              {isSavingText && (
                <div className="text-xs text-gray-500 flex items-center gap-1">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  Auto-saving...
                </div>
              )}
              <button onClick={async () => { await saveChanges(); onClose(); }} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={editedTask.description}
                onChange={e => handleTextUpdate('description', e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                rows={3}
                disabled={isSubmitting}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assigned To
                </label>
                <select
                  value={validMemberId}
                  onChange={e => handleUpdate({ memberId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                  disabled={isSubmitting}
                >
                  {members.map(member => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Requester
                </label>
                <select
                  value={validRequesterId}
                  onChange={e => handleUpdate({ requesterId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                  disabled={isSubmitting}
                >
                  {members.map(member => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={editedTask.startDate}
                  onChange={e => handleUpdate({ startDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Effort (hours)
                </label>
                <input
                  type="number"
                  min="0"
                  value={editedTask.effort}
                  onChange={e => handleUpdate({ effort: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-md"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <select
                value={editedTask.priority}
                onChange={e => handleUpdate({ priority: e.target.value as Priority })}
                className="w-full px-3 py-2 border rounded-md"
                disabled={isSubmitting}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200">
          <h3 className="text-lg font-semibold mb-4">
            Comments ({sortedComments.length})
          </h3>
          <div className="mb-6">
            <CommentEditor 
              onSubmit={handleAddComment}
            />
          </div>

          <div className="space-y-6">
            {sortedComments.map(comment => {
              const author = members.find(m => m.id === comment.authorId);
              if (!author) return null;

              const attachments = commentAttachments[comment.id] || [];

              return (
                <div key={comment.id} className="border-b border-gray-200 pb-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: author.color }}
                      />
                      <span className="font-medium">{author.name}</span>
                      <span className="text-sm text-gray-500">
                        {formatToYYYYMMDDHHmmss(comment.createdAt)}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteComment(comment.id)}
                      disabled={isSubmitting}
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded-full transition-colors"
                      title="Delete comment"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.text) }}
                  />
                  {attachments.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {attachments.map(attachment => (
                        <div
                          key={attachment.id}
                          className="flex items-center gap-2 text-sm text-gray-600"
                        >
                          <Paperclip size={14} />
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-500"
                          >
                            {attachment.name}
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
