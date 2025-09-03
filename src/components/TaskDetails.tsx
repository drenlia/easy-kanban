import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Task, TeamMember, Comment, Attachment, Tag, PriorityOption, CurrentUser } from '../types';
import { X, Paperclip, ChevronDown, Check } from 'lucide-react';
import DOMPurify from 'dompurify';
import CommentEditor from './CommentEditor';
import { createComment, uploadFile, updateTask, deleteComment, fetchCommentAttachments, getAllTags, getTaskTags, addTagToTask, removeTagFromTask, getAllPriorities, getTaskWatchers, addWatcherToTask, removeWatcherFromTask, getTaskCollaborators, addCollaboratorToTask, removeCollaboratorFromTask } from '../api';
import { formatToYYYYMMDD, formatToYYYYMMDDHHmm, getLocalISOString, formatToYYYYMMDDHHmmss } from '../utils/dateUtils';
import { generateUUID } from '../utils/uuid';
import { loadUserPreferences, updateUserPreference } from '../utils/userPreferences';

interface TaskDetailsProps {
  task: Task;
  members: TeamMember[];
  currentUser: CurrentUser | null;
  onClose: () => void;
  onUpdate: (updatedTask: Task) => void;
  onAddComment?: (comment: Comment & { taskId: string }) => Promise<void>;
}

export default function TaskDetails({ task, members, currentUser, onClose, onUpdate, onAddComment }: TaskDetailsProps) {
  const userPrefs = loadUserPreferences();
  const [width, setWidth] = useState(userPrefs.taskDetailsWidth);
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
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [taskTags, setTaskTags] = useState<Tag[]>([]);
  const [showTagsDropdown, setShowTagsDropdown] = useState(false);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const tagsDropdownRef = useRef<HTMLDivElement>(null);
  const [availablePriorities, setAvailablePriorities] = useState<PriorityOption[]>([]);
  
  // Watchers and Collaborators state
  const [taskWatchers, setTaskWatchers] = useState<TeamMember[]>([]);
  const [taskCollaborators, setTaskCollaborators] = useState<TeamMember[]>([]);
  const [showWatchersDropdown, setShowWatchersDropdown] = useState(false);
  const [showCollaboratorsDropdown, setShowCollaboratorsDropdown] = useState(false);
  const watchersDropdownRef = useRef<HTMLDivElement>(null);
  const collaboratorsDropdownRef = useRef<HTMLDivElement>(null);
  const previousTaskIdRef = useRef<string | null>(null);
  const previousTaskRef = useRef<Task | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      const clampedWidth = Math.max(380, Math.min(800, newWidth));
      setWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // Save the final width to user preferences
      updateUserPreference('taskDetailsWidth', width);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, width]);

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

  // Handle task switching - save current task before switching to new one
  useEffect(() => {
    const handleTaskSwitch = async () => {
      const previousTaskId = previousTaskIdRef.current;
      const currentTaskId = task.id;
      
      // Check if this is a task switch (not initial load)
      if (previousTaskId && previousTaskId !== currentTaskId) {
        const previousTask = previousTaskRef.current;
        
        if (previousTask) {
          // Save any pending changes before switching
          const hasUnsavedChanges = 
            editedTask.title !== previousTask.title || 
            editedTask.description !== previousTask.description;
            
          if (hasUnsavedChanges) {
            try {
              // Force save any unsaved changes to the previous task
              await updateTask(previousTaskId, {
                title: editedTask.title,
                description: editedTask.description
              });
              console.log('Auto-saved changes before switching tasks');
            } catch (error) {
              console.error('Error saving changes before task switch:', error);
            }
          }
        }
      }
      
      // Update the refs for next comparison
      previousTaskIdRef.current = currentTaskId;
      previousTaskRef.current = task;
      
      // Reset edited task to match the new task
      setEditedTask({
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
      });
    };

    handleTaskSwitch();
  }, [task]);

  // Load available tags, task tags, priorities, watchers, and collaborators
  useEffect(() => {
    const loadTaskData = async () => {
      try {
        setIsLoadingTags(true);
        const [allTags, currentTaskTags, allPriorities, currentWatchers, currentCollaborators] = await Promise.all([
          getAllTags(),
          getTaskTags(task.id),
          getAllPriorities(),
          getTaskWatchers(task.id),
          getTaskCollaborators(task.id)
        ]);
        setAvailableTags(allTags || []);
        setTaskTags(currentTaskTags || []);
        setAvailablePriorities(allPriorities || []);
        setTaskWatchers(currentWatchers || []);
        setTaskCollaborators(currentCollaborators || []);
      } catch (error) {
        console.error('Failed to load task data:', error);
      } finally {
        setIsLoadingTags(false);
      }
    };
    
    loadTaskData();
  }, [task.id]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tagsDropdownRef.current && !tagsDropdownRef.current.contains(event.target as Node)) {
        setShowTagsDropdown(false);
      }
      if (watchersDropdownRef.current && !watchersDropdownRef.current.contains(event.target as Node)) {
        setShowWatchersDropdown(false);
      }
      if (collaboratorsDropdownRef.current && !collaboratorsDropdownRef.current.contains(event.target as Node)) {
        setShowCollaboratorsDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleTag = async (tag: Tag) => {
    try {
      const isSelected = taskTags.some(t => t.id === tag.id);
      
      if (isSelected) {
        // Remove tag
        await removeTagFromTask(task.id, tag.id);
        setTaskTags(prev => prev.filter(t => t.id !== tag.id));
      } else {
        // Add tag
        await addTagToTask(task.id, tag.id);
        setTaskTags(prev => [...prev, tag]);
      }
    } catch (error) {
      console.error('Failed to toggle tag:', error);
    }
  };

  const toggleWatcher = async (member: TeamMember) => {
    try {
      const isWatching = taskWatchers.some(w => w.id === member.id);
      
      if (isWatching) {
        // Remove watcher
        await removeWatcherFromTask(task.id, member.id);
        setTaskWatchers(prev => prev.filter(w => w.id !== member.id));
      } else {
        // Add watcher
        await addWatcherToTask(task.id, member.id);
        setTaskWatchers(prev => [...prev, member]);
      }
    } catch (error) {
      console.error('Failed to toggle watcher:', error);
    }
  };

  const toggleCollaborator = async (member: TeamMember) => {
    try {
      const isCollaborating = taskCollaborators.some(c => c.id === member.id);
      
      if (isCollaborating) {
        // Remove collaborator
        await removeCollaboratorFromTask(task.id, member.id);
        setTaskCollaborators(prev => prev.filter(c => c.id !== member.id));
      } else {
        // Add collaborator
        await addCollaboratorToTask(task.id, member.id);
        setTaskCollaborators(prev => [...prev, member]);
      }
    } catch (error) {
      console.error('Failed to toggle collaborator:', error);
    }
  };

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

      // Find the member corresponding to the current user
      const currentUserMember = members.find(m => m.user_id === currentUser?.id);
      
      // Create new comment with attachments
      const newComment = {
        id: generateUUID(),
        text: content,
        authorId: currentUserMember?.id || editedTask.memberId || members[0].id,
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
      className="fixed right-0 bg-white border-l border-gray-200 flex z-30" 
      style={{ 
        width: `${width}px`,
        top: '65px', // Position below header (adjusted for proper clearance)
        height: 'calc(100vh - 65px)' // Full height minus header
      }}
      data-task-details
    >
      {/* Professional Resize Handle */}
      <div
        ref={resizeRef}
        className={`absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize group transition-all duration-200 z-50 ${
          isResizing 
            ? 'bg-blue-500 shadow-md' 
            : 'bg-gray-50 hover:bg-blue-400'
        }`}
        onMouseDown={handleMouseDown}
        title="Drag to resize panel"
      >
        {/* Extended hit area for easier grabbing */}
        <div className="absolute inset-y-0 left-0 w-4 -translate-x-2" />
        
        {/* Visual grip dots */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="flex flex-col items-center space-y-1">
            <div className={`w-1 h-1 rounded-full transition-all duration-200 ${
              isResizing 
                ? 'bg-white' 
                : 'bg-gray-400 group-hover:bg-white'
            }`} />
            <div className={`w-1 h-1 rounded-full transition-all duration-200 ${
              isResizing 
                ? 'bg-white' 
                : 'bg-gray-400 group-hover:bg-white'
            }`} />
            <div className={`w-1 h-1 rounded-full transition-all duration-200 ${
              isResizing 
                ? 'bg-white' 
                : 'bg-gray-400 group-hover:bg-white'
            }`} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pl-2">
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

            {/* Watchers and Collaborators Section - Side by Side */}
            <div className="grid grid-cols-2 gap-4">
              {/* Watchers Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Watchers
                </label>
                <div className="relative" ref={watchersDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowWatchersDropdown(!showWatchersDropdown)}
                    className="w-full px-3 py-2 border rounded-md bg-white text-left flex items-center justify-between hover:bg-gray-50"
                    disabled={isSubmitting}
                  >
                    <span className="text-gray-700 truncate">
                      {taskWatchers.length === 0 ? 'Select watchers...' : `${taskWatchers.length} watcher${taskWatchers.length !== 1 ? 's' : ''}`}
                    </span>
                    <ChevronDown className="w-4 h-4 flex-shrink-0 ml-2" />
                  </button>
                  
                  {showWatchersDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {members.map(member => {
                        const isWatching = taskWatchers.some(w => w.id === member.id);
                        return (
                          <div
                            key={member.id}
                            onClick={() => toggleWatcher(member)}
                            className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center justify-between"
                          >
                            <span>{member.name}</span>
                            {isWatching && <Check className="w-4 h-4 text-green-500" />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                
                {/* Selected Watchers Display */}
                {taskWatchers.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {taskWatchers.map(member => (
                      <span
                        key={member.id}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-blue-100 border border-blue-300 text-blue-700 hover:opacity-80 transition-opacity"
                      >
                        <div 
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: member.color }}
                        />
                        {member.name}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            toggleWatcher(member);
                          }}
                          className="ml-1 hover:bg-red-500 hover:text-white rounded-full w-3 h-3 flex items-center justify-center text-xs font-bold transition-colors"
                          title="Remove watcher"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Collaborators Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Collaborators
                </label>
                <div className="relative" ref={collaboratorsDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowCollaboratorsDropdown(!showCollaboratorsDropdown)}
                    className="w-full px-3 py-2 border rounded-md bg-white text-left flex items-center justify-between hover:bg-gray-50"
                    disabled={isSubmitting}
                  >
                    <span className="text-gray-700 truncate">
                      {taskCollaborators.length === 0 ? 'Select collaborators...' : `${taskCollaborators.length} collaborator${taskCollaborators.length !== 1 ? 's' : ''}`}
                    </span>
                    <ChevronDown className="w-4 h-4 flex-shrink-0 ml-2" />
                  </button>
                  
                  {showCollaboratorsDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {members.map(member => {
                        const isCollaborating = taskCollaborators.some(c => c.id === member.id);
                        return (
                          <div
                            key={member.id}
                            onClick={() => toggleCollaborator(member)}
                            className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center justify-between"
                          >
                            <span>{member.name}</span>
                            {isCollaborating && <Check className="w-4 h-4 text-green-500" />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                
                {/* Selected Collaborators Display */}
                {taskCollaborators.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {taskCollaborators.map(member => (
                      <span
                        key={member.id}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-green-100 border border-green-300 text-green-700 hover:opacity-80 transition-opacity"
                      >
                        <div 
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: member.color }}
                        />
                        {member.name}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            toggleCollaborator(member);
                          }}
                          className="ml-1 hover:bg-red-500 hover:text-white rounded-full w-3 h-3 flex items-center justify-center text-xs font-bold transition-colors"
                          title="Remove collaborator"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
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
                  Due Date
                </label>
                <input
                  type="date"
                  value={editedTask.dueDate || ''}
                  onChange={e => handleUpdate({ dueDate: e.target.value })}
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
                {availablePriorities.map(priority => (
                  <option key={priority.id} value={priority.priority}>
                    {priority.priority}
                  </option>
                ))}
              </select>
            </div>

            {/* Tags Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
              <div className="relative" ref={tagsDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowTagsDropdown(!showTagsDropdown)}
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent flex items-center justify-between"
                >
                  <span className="text-gray-700">
                    {taskTags.length === 0 
                      ? 'Select tags...' 
                      : `${taskTags.length} tag${taskTags.length !== 1 ? 's' : ''} selected`
                    }
                  </span>
                  <ChevronDown size={14} className="text-gray-400" />
                </button>
                
                {showTagsDropdown && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10 w-full max-h-60 overflow-y-auto">
                    {isLoadingTags ? (
                      <div className="px-3 py-2 text-sm text-gray-500">Loading tags...</div>
                    ) : availableTags.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">No tags available</div>
                    ) : (
                      availableTags.map(tag => (
                        <div
                          key={tag.id}
                          onClick={() => toggleTag(tag)}
                          className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-sm"
                        >
                          <div className="w-4 h-4 flex items-center justify-center">
                            {taskTags.some(t => t.id === tag.id) && (
                              <Check size={12} className="text-blue-600" />
                            )}
                          </div>
                          <div 
                            className="w-4 h-4 rounded-full flex-shrink-0 border border-gray-300"
                            style={{ backgroundColor: tag.color || '#4ECDC4' }}
                          />
                          <span className="text-gray-700">{tag.tag}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              
              {/* Selected Tags Display */}
              {taskTags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {taskTags.map(tag => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border hover:opacity-80 transition-opacity"
                      style={{ 
                        backgroundColor: `${tag.color || '#4ECDC4'}20`,
                        borderColor: tag.color || '#4ECDC4',
                        color: tag.color || '#4ECDC4'
                      }}
                    >
                      <div 
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: tag.color || '#4ECDC4' }}
                      />
                      {tag.tag}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          toggleTag(tag);
                        }}
                        className="ml-1 hover:bg-red-500 hover:text-white rounded-full w-3 h-3 flex items-center justify-center text-xs font-bold transition-colors"
                        title="Remove tag"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
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
