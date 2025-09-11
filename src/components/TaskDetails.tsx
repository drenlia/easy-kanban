import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Task, TeamMember, Comment, Attachment, Tag, PriorityOption, CurrentUser } from '../types';
import { X, Paperclip, ChevronDown, Check, Edit2 } from 'lucide-react';
import DOMPurify from 'dompurify';
import TextEditor from './TextEditor';
import { createComment, uploadFile, updateTask, deleteComment, updateComment, fetchCommentAttachments, getAllTags, getTaskTags, addTagToTask, removeTagFromTask, getAllPriorities, addWatcherToTask, removeWatcherFromTask, addCollaboratorToTask, removeCollaboratorFromTask, fetchTaskAttachments, addTaskAttachments, deleteAttachment, getTaskRelationships, getAvailableTasksForRelationship, addTaskRelationship, removeTaskRelationship } from '../api';
import { getLocalISOString, formatToYYYYMMDDHHmmss } from '../utils/dateUtils';
import { generateUUID } from '../utils/uuid';
import { loadUserPreferences, updateUserPreference } from '../utils/userPreferences';
import { generateTaskUrl, generateProjectUrl } from '../utils/routingUtils';

interface TaskDetailsProps {
  task: Task;
  members: TeamMember[];
  currentUser: CurrentUser | null;
  onClose: () => void;
  onUpdate: (updatedTask: Task) => void;
  siteSettings?: { [key: string]: string };
  boards?: any[]; // To get project identifier from board
  scrollToComments?: boolean;
}

export default function TaskDetails({ task, members, currentUser, onClose, onUpdate, siteSettings, boards, scrollToComments }: TaskDetailsProps) {
  const userPrefs = loadUserPreferences();
  const [width, setWidth] = useState(userPrefs.taskDetailsWidth);
  
  // Get project identifier from the board this task belongs to
  const getProjectIdentifier = () => {
    if (!boards || !task.boardId) return null;
    const board = boards.find(b => b.id === task.boardId);
    return board?.project || null;
  };
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
  const resizeRef = useRef<HTMLDivElement>(null);
  const [commentAttachments, setCommentAttachments] = useState<Record<string, Attachment[]>>({});
  const textSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const commentsRef = useRef<HTMLDivElement>(null);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [taskTags, setTaskTags] = useState<Tag[]>([]);
  const [showTagsDropdown, setShowTagsDropdown] = useState(false);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const tagsDropdownRef = useRef<HTMLDivElement>(null);
  const [availablePriorities, setAvailablePriorities] = useState<PriorityOption[]>([]);
  
  // Task relationships state
  const [relationships, setRelationships] = useState<any[]>([]);
  const [parentTask, setParentTask] = useState<{id: string, ticket: string, title: string, projectId?: string} | null>(null);
  const [childTasks, setChildTasks] = useState<{id: string, ticket: string, title: string, projectId?: string}[]>([]);
  const [availableTasksForChildren, setAvailableTasksForChildren] = useState<{id: string, ticket: string, title: string, status: string, projectId?: string}[]>([]);
  const [showChildrenDropdown, setShowChildrenDropdown] = useState(false);
  const [childrenSearchTerm, setChildrenSearchTerm] = useState('');
  const [isLoadingRelationships, setIsLoadingRelationships] = useState(false);
  const childrenDropdownRef = useRef<HTMLDivElement>(null);
  
  // Task attachments state with logging
  const [taskAttachments, setTaskAttachmentsInternal] = useState<Array<{
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
  }>>([]);
  
  // Clean wrapper for taskAttachments setter
  const setTaskAttachments = setTaskAttachmentsInternal;
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [isDeletingAttachment, setIsDeletingAttachment] = useState(false);
  const recentlyDeletedAttachmentsRef = useRef<Set<string>>(new Set());
  const [lastSavedDescription, setLastSavedDescription] = useState(task.description || '');
  
  // Watchers and Collaborators state
  const [taskWatchers, setTaskWatchers] = useState<TeamMember[]>(task.watchers || []);
  const [taskCollaborators, setTaskCollaborators] = useState<TeamMember[]>(task.collaborators || []);
  const [showWatchersDropdown, setShowWatchersDropdown] = useState(false);
  const [showCollaboratorsDropdown, setShowCollaboratorsDropdown] = useState(false);
  const [watchersDropdownPosition, setWatchersDropdownPosition] = useState<'above' | 'below'>('below');
  const [collaboratorsDropdownPosition, setCollaboratorsDropdownPosition] = useState<'above' | 'below'>('below');
  const [tagsDropdownPosition, setTagsDropdownPosition] = useState<'above' | 'below'>('below');
  const watchersDropdownRef = useRef<HTMLDivElement>(null);
  const collaboratorsDropdownRef = useRef<HTMLDivElement>(null);
  const watchersButtonRef = useRef<HTMLButtonElement>(null);
  const collaboratorsButtonRef = useRef<HTMLButtonElement>(null);
  const tagsButtonRef = useRef<HTMLButtonElement>(null);
  const previousTaskIdRef = useRef<string | null>(null);
  const previousTaskRef = useRef<Task | null>(null);

  // Comment editing state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState<string>('');
  const [showRefreshIndicator, setShowRefreshIndicator] = useState(false);
  const [isInitialTaskLoad, setIsInitialTaskLoad] = useState(true);

  // Reset component state when switching to a different task
  useEffect(() => {
    
    // Reset attachment-related state
    setTaskAttachments([]);
    setPendingAttachments([]);
    setIsUploadingAttachments(false);
    setIsDeletingAttachment(false);
    recentlyDeletedAttachmentsRef.current.clear();
    
    // Reset watchers and collaborators
    setTaskWatchers(task.watchers || []);
    setTaskCollaborators(task.collaborators || []);
    
    // Reset dropdown states
    setShowWatchersDropdown(false);
    setShowCollaboratorsDropdown(false);
    setShowTagsDropdown(false);
    setShowChildrenDropdown(false);
    
    // Reset relationship state
    setRelationships([]);
    setParentTask(null);
    setChildTasks([]);
    setAvailableTasksForChildren([]);
    setChildrenSearchTerm('');
    setIsLoadingRelationships(false);
    
    // Reset comment editing state
    setEditingCommentId(null);
    setEditingCommentText('');
    
    // Reset other UI states
    setIsSubmitting(false);
    setIsSavingText(false);
    setIsInitialTaskLoad(true);
    setShowRefreshIndicator(false);
    
    // Clear comment attachments for new task
    setCommentAttachments({});
  }, [task.id]); // Only depend on task.id to trigger when switching tasks

  // Auto-refresh comments when task prop updates (from polling)
  useEffect(() => {
    // Don't process updates if we're currently editing a comment
    if (editingCommentId) return;

    const processedComments = (task.comments || [])
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
      }));

    // Update local state when task prop changes, but preserve any unsaved local changes
    setEditedTask(prev => {
      // Check if comments have changed (new comments added by other users)
      const prevCommentIds = (prev.comments || []).map(c => c.id).sort();
      const newCommentIds = processedComments.map(c => c.id).sort();
      const commentsChanged = JSON.stringify(prevCommentIds) !== JSON.stringify(newCommentIds);

      // Show refresh indicator if comments were added/removed (but not on initial task load)
      if (commentsChanged && prev.comments && prev.comments.length > 0 && !isInitialTaskLoad) {
        console.log('💬 Comments updated! Showing refresh indicator', {
          prevCount: prev.comments.length,
          newCount: processedComments.length,
          taskId: task.id
        });
        setShowRefreshIndicator(true);
        setTimeout(() => setShowRefreshIndicator(false), 3000); // Hide after 3 seconds
      }

      // Mark that we've completed the initial load for this task
      if (isInitialTaskLoad) {
        setIsInitialTaskLoad(false);
      }

      return {
        ...task,
        // Preserve unsaved text changes to avoid losing user input
        title: prev.title !== task.title && isSavingText ? prev.title : task.title,
        description: prev.description !== task.description && (isSavingText || isUploadingAttachments) ? prev.description : task.description,
        // Update comments with processed data
        comments: processedComments
      };
    });
  }, [task, isSavingText, editingCommentId, isUploadingAttachments]);

  // Load task relationships
  useEffect(() => {
    const loadRelationships = async () => {
      if (!task.id) return;
      
      setIsLoadingRelationships(true);
      try {
        // Load task relationships
        const relationshipsData = await getTaskRelationships(task.id);
        setRelationships(relationshipsData);
        
        // Parse parent and children from relationships
        const parent = relationshipsData.find((rel: any) => rel.relationship === 'child' && rel.task_id === task.id);
        if (parent) {
          setParentTask({
            id: parent.to_task_id,
            ticket: parent.related_task_ticket,
            title: parent.related_task_title,
            projectId: parent.related_task_project_id
          });
        } else {
          setParentTask(null);
        }
        
        const children = relationshipsData
          .filter((rel: any) => rel.relationship === 'parent' && rel.task_id === task.id)
          .map((rel: any) => ({
            id: rel.to_task_id,
            ticket: rel.related_task_ticket,
            title: rel.related_task_title,
            projectId: rel.related_task_project_id
          }));
        setChildTasks(children);
        
        // Load available tasks for adding as children
        const availableTasksData = await getAvailableTasksForRelationship(task.id);
        setAvailableTasksForChildren(availableTasksData);
        
      } catch (error) {
        console.error('Error loading task relationships:', error);
      } finally {
        setIsLoadingRelationships(false);
      }
    };
    
    loadRelationships();
  }, [task.id]);

  // Helper function to calculate optimal dropdown position
  const calculateDropdownPosition = (buttonRef: React.RefObject<HTMLButtonElement>): 'above' | 'below' => {
    if (!buttonRef.current) return 'below';
    
    const buttonRect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    
    // Space available above and below the button
    const spaceAbove = buttonRect.top;
    const spaceBelow = viewportHeight - buttonRect.bottom;
    
    // Dropdown height estimate (max-h-48 = 192px + padding)
    const dropdownHeight = 200;
    
    // Debug logging
    console.log('TaskDetails dropdown position calc:', {
      spaceAbove,
      spaceBelow,
      dropdownHeight,
      buttonTop: buttonRect.top,
      buttonBottom: buttonRect.bottom,
      viewportHeight
    });
    
    // Prefer going up if there's enough space (more aggressive preference for upward)
    if (spaceAbove >= dropdownHeight) {
      console.log('TaskDetails: Going above - enough space');
      return 'above';
    }
    
    console.log('TaskDetails: Going below - not enough space above');
    return 'below';
  };

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

  // Separate function for text field updates with immediate save
  const handleTextUpdate = (field: 'title' | 'description', value: string) => {
    const updatedTask = { ...editedTask, [field]: value };
    setEditedTask(updatedTask);
    
    // Debounce text saves to prevent spam (but keep attachments immediate)
    if (textSaveTimeoutRef.current) {
      clearTimeout(textSaveTimeoutRef.current);
    }
    
    textSaveTimeoutRef.current = setTimeout(async () => {
      await saveImmediately(updatedTask);
    }, 1500); // 1.5 second debounce for text
  };

  // Function to save immediately
  const saveImmediately = useCallback(async (updatedTask: Task) => {
    try {
      setIsSavingText(true);
      await onUpdate(updatedTask);
      // Update last saved description after successful save
      if (updatedTask.description) {
        setLastSavedDescription(updatedTask.description);
      }
    } catch (error) {
      console.error('❌ Immediate save failed:', error);
    } finally {
      setIsSavingText(false);
    }
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

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (textSaveTimeoutRef.current) {
        clearTimeout(textSaveTimeoutRef.current);
      }
    };
  }, []);

  // Handle clicking outside children dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (childrenDropdownRef.current && !childrenDropdownRef.current.contains(event.target as Node)) {
        setShowChildrenDropdown(false);
        setChildrenSearchTerm('');
      }
    };

    if (showChildrenDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showChildrenDropdown]);

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
      
      // Reset initial load flag for new task
      setIsInitialTaskLoad(true);
      
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

  // Load available tags, task tags, and priorities (watchers/collaborators come from task prop)
  useEffect(() => {
    const loadTaskData = async () => {
      try {
        setIsLoadingTags(true);
        const [allTags, currentTaskTags, allPriorities, currentAttachments] = await Promise.all([
          getAllTags(),
          getTaskTags(task.id),
          getAllPriorities(),
          fetchTaskAttachments(task.id)
        ]);
        setAvailableTags(allTags || []);
        setTaskTags(currentTaskTags || []);
        setAvailablePriorities(allPriorities || []);
        
        // Filter out recently deleted attachments and only update if not uploading
        if (!isUploadingAttachments) {
          const filteredAttachments = (currentAttachments || []).filter((att: any) => 
            !recentlyDeletedAttachmentsRef.current.has(att.name)
          );
          setTaskAttachments(filteredAttachments);
        }
        // Update watchers and collaborators from task prop
        setTaskWatchers(task.watchers || []);
        setTaskCollaborators(task.collaborators || []);
      } catch (error) {
        console.error('Failed to load task data:', error);
      } finally {
        setIsLoadingTags(false);
      }
    };
    
    loadTaskData();
  }, [task.id, task.watchers, task.collaborators]);

  // Sync taskTags with task.tags when task prop changes
  useEffect(() => {
    if (task.tags && Array.isArray(task.tags)) {
      setTaskTags(task.tags);
    }
  }, [task.tags]);

  // Sync taskWatchers with task.watchers when task prop changes
  useEffect(() => {
    if (task.watchers && Array.isArray(task.watchers)) {
      setTaskWatchers(task.watchers);
    }
  }, [task.watchers]);

  // Sync taskCollaborators with task.collaborators when task prop changes
  useEffect(() => {
    if (task.collaborators && Array.isArray(task.collaborators)) {
      setTaskCollaborators(task.collaborators);
    }
  }, [task.collaborators]);

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
        const newTaskTags = taskTags.filter(t => t.id !== tag.id);
        setTaskTags(newTaskTags);
        
        // Update parent task with new tags
        const updatedTask = { ...editedTask, tags: newTaskTags };
        setEditedTask(updatedTask);
        onUpdate(updatedTask);
      } else {
        // Add tag
        await addTagToTask(task.id, tag.id);
        const newTaskTags = [...taskTags, tag];
        setTaskTags(newTaskTags);
        
        // Update parent task with new tags
        const updatedTask = { ...editedTask, tags: newTaskTags };
        setEditedTask(updatedTask);
        onUpdate(updatedTask);
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
        const newWatchers = taskWatchers.filter(w => w.id !== member.id);
        setTaskWatchers(newWatchers);
        
        // Update parent task with new watchers
        const updatedTask = { ...editedTask, watchers: newWatchers };
        setEditedTask(updatedTask);
        onUpdate(updatedTask);
      } else {
        // Add watcher
        await addWatcherToTask(task.id, member.id);
        const newWatchers = [...taskWatchers, member];
        setTaskWatchers(newWatchers);
        
        // Update parent task with new watchers
        const updatedTask = { ...editedTask, watchers: newWatchers };
        setEditedTask(updatedTask);
        onUpdate(updatedTask);
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
        const newCollaborators = taskCollaborators.filter(c => c.id !== member.id);
        setTaskCollaborators(newCollaborators);
        
        // Update parent task with new collaborators
        const updatedTask = { ...editedTask, collaborators: newCollaborators };
        setEditedTask(updatedTask);
        onUpdate(updatedTask);
      } else {
        // Add collaborator
        await addCollaboratorToTask(task.id, member.id);
        const newCollaborators = [...taskCollaborators, member];
        setTaskCollaborators(newCollaborators);
        
        // Update parent task with new collaborators
        const updatedTask = { ...editedTask, collaborators: newCollaborators };
        setEditedTask(updatedTask);
        onUpdate(updatedTask);
      }
    } catch (error) {
      console.error('Failed to toggle collaborator:', error);
    }
  };

  // Handler for opening watchers dropdown with position calculation
  const handleWatchersDropdownToggle = () => {
    if (!showWatchersDropdown) {
      const position = calculateDropdownPosition(watchersButtonRef);
      setWatchersDropdownPosition(position);
    }
    setShowWatchersDropdown(!showWatchersDropdown);
  };

  // Handler for opening collaborators dropdown with position calculation
  const handleCollaboratorsDropdownToggle = () => {
    if (!showCollaboratorsDropdown) {
      const position = calculateDropdownPosition(collaboratorsButtonRef);
      setCollaboratorsDropdownPosition(position);
    }
    setShowCollaboratorsDropdown(!showCollaboratorsDropdown);
  };

  // Handler for opening tags dropdown with position calculation
  const handleTagsDropdownToggle = () => {
    if (!showTagsDropdown) {
      const position = calculateDropdownPosition(tagsButtonRef);
      setTagsDropdownPosition(position);
    }
    setShowTagsDropdown(!showTagsDropdown);
  };

  // Task relationship handlers
  const handleAddChildTask = async (childTaskId: string) => {
    try {
      await addTaskRelationship(task.id, 'parent', childTaskId);
      
      // Reload relationships data from server to get accurate IDs
      const relationshipsData = await getTaskRelationships(task.id);
      setRelationships(relationshipsData);
      
      // Parse children from fresh relationships data
      const children = relationshipsData
        .filter((rel: any) => rel.relationship === 'parent' && rel.task_id === task.id)
        .map((rel: any) => ({
          id: rel.to_task_id,
          ticket: rel.related_task_ticket,
          title: rel.related_task_title,
          projectId: rel.related_task_project_id
        }));
      setChildTasks(children);
      
      // Reload available tasks
      const availableTasksData = await getAvailableTasksForRelationship(task.id);
      setAvailableTasksForChildren(availableTasksData);
      
      setShowChildrenDropdown(false);
      setChildrenSearchTerm('');
    } catch (error) {
      console.error('Failed to add child task:', error);
    }
  };

  const handleRemoveChildTask = async (childTaskId: string) => {
    try {
      // Find the relationship to delete
      const relationship = relationships.find(rel => 
        rel.relationship === 'parent' && 
        rel.task_id === task.id && 
        rel.to_task_id === childTaskId
      );
      
      console.log('🗑️ Attempting to remove child task:', {
        childTaskId,
        foundRelationship: relationship,
        allRelationships: relationships
      });
      
      if (relationship) {
        await removeTaskRelationship(task.id, relationship.id);
        
        // Reload all relationship data from server after successful deletion
        const relationshipsData = await getTaskRelationships(task.id);
        setRelationships(relationshipsData);
        
        // Parse parent and children from fresh data
        const parent = relationshipsData.find((rel: any) => rel.relationship === 'child' && rel.task_id === task.id);
        if (parent) {
          setParentTask({
            id: parent.to_task_id,
            ticket: parent.related_task_ticket,
            title: parent.related_task_title,
            projectId: parent.related_task_project_id
          });
        } else {
          setParentTask(null);
        }
        
        const children = relationshipsData
          .filter((rel: any) => rel.relationship === 'parent' && rel.task_id === task.id)
          .map((rel: any) => ({
            id: rel.to_task_id,
            ticket: rel.related_task_ticket,
            title: rel.related_task_title,
            projectId: rel.related_task_project_id
          }));
        setChildTasks(children);
        
        // Reload available tasks
        const availableTasksData = await getAvailableTasksForRelationship(task.id);
        setAvailableTasksForChildren(availableTasksData);
        
        console.log('✅ Successfully removed child task and reloaded data');
      } else {
        console.error('❌ No relationship found to delete');
      }
    } catch (error) {
      console.error('Failed to remove child task:', error);
    }
  };

  // Handler for opening children dropdown
  const handleChildrenDropdownToggle = () => {
    setShowChildrenDropdown(!showChildrenDropdown);
    if (!showChildrenDropdown) {
      setChildrenSearchTerm('');
    }
  };

  // Filter available tasks based on search term
  const filteredAvailableChildren = availableTasksForChildren.filter(task => 
    task.ticket.toLowerCase().includes(childrenSearchTerm.toLowerCase()) ||
    task.title.toLowerCase().includes(childrenSearchTerm.toLowerCase())
  );

  const handleAddComment = async (content: string, attachments: File[] = []) => {
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

      console.log('Sending comment to backend:', newComment);

      // Save comment to server
      const savedComment = await createComment(newComment);

      // Update commentAttachments state with new attachments
      if (uploadedAttachments.length > 0) {
        setCommentAttachments(prev => ({
          ...prev,
          [savedComment.id]: uploadedAttachments
        }));
      }

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

  // Helper function to check if user can edit/delete a comment
  const canModifyComment = (comment: Comment): boolean => {
    if (!currentUser) return false;
    
    // Admin can modify any comment
    if (currentUser.roles?.includes('admin')) return true;
    
    // User can modify their own comments
    const currentMember = members.find(m => m.user_id === currentUser.id);
    return currentMember?.id === comment.authorId;
  };

  const handleDeleteComment = async (commentId: string) => {
    if (isSubmitting) return;

    // Find the comment to check permissions
    const comment = editedTask.comments?.find(c => c.id === commentId);
    if (!comment || !canModifyComment(comment)) {
      console.error('Unauthorized: Cannot delete this comment');
      return;
    }

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

  const handleEditComment = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.text);
  };


  const handleSaveEditCommentWithContent = async (content: string) => {
    if (!editingCommentId || !content.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);

      // Update comment on server
      await updateComment(editingCommentId, content.trim());

      // Update local state
      const updatedComments = editedTask.comments?.map(comment => 
        comment.id === editingCommentId 
          ? { ...comment, text: content.trim() }
          : comment
      ) || [];
      
      const updatedTask = { ...editedTask, comments: updatedComments };
      setEditedTask(updatedTask);

      // Update parent component
      if (onUpdate) {
        await onUpdate(updatedTask);
      }

      // Clear editing state
      setEditingCommentId(null);
      setEditingCommentText('');

    } catch (error) {
      console.error('Failed to update comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEditComment = () => {
    setEditingCommentId(null);
    setEditingCommentText('');
  };

  // Scroll to comments when requested (e.g., from TaskCard tooltip)
  useEffect(() => {
    if (scrollToComments && commentsRef.current) {
      // Small delay to ensure the component is fully rendered
      setTimeout(() => {
        commentsRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }, 100);
    }
  }, [task.id, scrollToComments]);

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

  // Save attachments immediately to prevent blob URL issues
  React.useEffect(() => {
    if (pendingAttachments.length > 0) {
      savePendingAttachments();
    }
  }, [pendingAttachments]);

  // Handle attachment changes from TextEditor
  const handleAttachmentsChange = (attachments: File[]) => {
    setPendingAttachments(attachments);
  };

  // Handle immediate attachment deletion
  const handleAttachmentDelete = async (attachmentId: string) => {
    try {
      await deleteAttachment(attachmentId);
      
      // Find the attachment to get its filename
      const attachmentToDelete = taskAttachments.find(att => att.id === attachmentId) || 
                                 displayAttachments.find(att => att.id === attachmentId);
      
      if (attachmentToDelete) {
        // Remove from ALL local state (just like image X button does)
        setTaskAttachments(prev => prev.filter(att => att.id !== attachmentId && att.name !== attachmentToDelete.name));
        setPendingAttachments(prev => prev.filter(att => att.name !== attachmentToDelete.name));
      } else {
        // Fallback: just remove by ID
        setTaskAttachments(prev => prev.filter(att => att.id !== attachmentId));
      }
    } catch (error) {
      console.error('❌ Failed to delete attachment:', error);
      throw error; // Re-throw to let TextEditor handle the error
    }
  };

  // Handle image removal from TextEditor - remove from server if saved, clean local state
  const handleImageRemoval = async (filename: string) => {
    // Track this attachment as recently deleted
    recentlyDeletedAttachmentsRef.current.add(filename);
    
    // Check if this file exists in server-saved attachments
    const serverAttachment = taskAttachments.find(att => att.name === filename);
    
    if (serverAttachment) {
      try {
        await deleteAttachment(serverAttachment.id);
      } catch (error) {
        console.error('Failed to delete server attachment:', error);
        // Continue with local cleanup even if server deletion fails
      }
    } else {
      // Also try to delete from server by making a request to get fresh attachments and delete
      try {
        const freshAttachments = await fetchTaskAttachments(task.id);
        const freshServerAttachment = freshAttachments.find(att => att.name === filename);
        
        if (freshServerAttachment) {
          await deleteAttachment(freshServerAttachment.id);
        }
      } catch (error) {
        console.error('Failed to fetch/delete fresh attachment:', error);
      }
    }
    
    // Remove from ALL local state immediately
    setPendingAttachments(prev => prev.filter(att => att.name !== filename));
    setTaskAttachments(prev => prev.filter(att => att.name !== filename));
    
    // Clear the recently deleted flag after a longer delay
    setTimeout(() => {
      recentlyDeletedAttachmentsRef.current.delete(filename);
    }, 5000); // 5 seconds should be enough for any polling cycles
  };

  // Handle saving pending attachments
  const savePendingAttachments = async () => {
    if (pendingAttachments.length > 0) {
      try {
        setIsUploadingAttachments(true);
        
        // Upload files first
        const uploadedAttachments = await Promise.all(
          pendingAttachments.map(async (file) => {
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

        // Add attachments to task
        await addTaskAttachments(task.id, uploadedAttachments);
        
        // Update local state - but only add attachments that weren't deleted during upload
        setTaskAttachments(prev => {
          const currentAttachmentNames = prev.map(att => att.name);
          const newAttachments = uploadedAttachments.filter(uploaded => 
            !currentAttachmentNames.includes(uploaded.name) // Don't re-add if already deleted
          );
          return [...prev, ...newAttachments];
        });
        setPendingAttachments([]);
        
        // Update the task description with server URLs immediately
        let updatedDescription = editedTask.description;
        uploadedAttachments.forEach(attachment => {
          if (attachment.name.startsWith('img-')) {
            // Replace blob URLs with server URLs
            const blobPattern = new RegExp(`blob:[^"]*#${attachment.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
            updatedDescription = updatedDescription.replace(blobPattern, attachment.url);
          }
        });
        
        // Always update the description to replace blob URLs
        const updatedTask = { ...editedTask, description: updatedDescription };
        setEditedTask(updatedTask);
        await saveImmediately(updatedTask);
      } catch (error) {
        console.error('❌ Failed to save attachments:', error);
      } finally {
        setIsUploadingAttachments(false);
      }
    }
  };

  // Only show saved attachments - no pending ones to avoid state sync issues
  const displayAttachments = React.useMemo(() => taskAttachments, [taskAttachments]);

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

      <div className="flex-1 flex flex-col overflow-hidden pl-2">
        {/* Sticky Header */}
        <div className="bg-white border-b border-gray-200 p-3 sticky top-0 z-10 shadow-sm">
          <div className="flex justify-between items-center mb-2">
            {/* Title - 60% width when prefixes enabled, 100% when disabled */}
            <div className={siteSettings?.USE_PREFIXES === 'true' ? "w-3/5" : "w-full"}>
              <input
                type="text"
                value={editedTask.title}
                onChange={e => handleTextUpdate('title', e.target.value)}
                className="text-xl font-semibold w-full border-none focus:outline-none focus:ring-0 bg-gray-50 p-3 rounded"
                disabled={isSubmitting}
              />
            </div>
            
            {/* Project and Task Links - Right side (only when prefixes enabled) */}
            {siteSettings?.USE_PREFIXES === 'true' ? (
              <div className="flex items-center gap-4">
                {/* Project and Task Identifiers */}
                {(getProjectIdentifier() || task.ticket) && (
                  <div className="flex items-center gap-2 font-mono text-sm">
                    {getProjectIdentifier() && (
                      <a 
                        href={generateProjectUrl(getProjectIdentifier())}
                        className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                        title={`Go to project ${getProjectIdentifier()}`}
                      >
                        {getProjectIdentifier()}
                      </a>
                    )}
                    {getProjectIdentifier() && task.ticket && (
                      <span className="text-gray-400">→</span>
                    )}
                    {task.ticket && (
                      <a 
                        href={generateTaskUrl(task.ticket, getProjectIdentifier())}
                        className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                        title={`Direct link to ${task.ticket}`}
                      >
                        {task.ticket}
                      </a>
                    )}
                  </div>
                )}
                
                {/* Save indicator and close button */}
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
            ) : (
              /* When prefixes disabled, only show save indicator and close button */
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
            )}
          </div></div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 pt-0">

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <TextEditor
                onSubmit={async () => {
                  // Save pending attachments when submit is triggered
                  await savePendingAttachments();
                }}
                onChange={(content) => {
                  handleTextUpdate('description', content);
                }}
                onAttachmentsChange={handleAttachmentsChange}
                onAttachmentDelete={handleAttachmentDelete}
                onImageRemovalNeeded={handleImageRemoval}
                initialContent={editedTask.description}
                placeholder="Enter task description..."
                minHeight="120px"
                showSubmitButtons={false}
                showAttachments={true}
                attachmentContext="task"
                attachmentParentId={task.id}
                existingAttachments={taskAttachments}
                toolbarOptions={{
                  bold: true,
                  italic: true,
                  underline: true,
                  link: true,
                  lists: true,
                  alignment: false,
                  attachments: true
                }}
                className="w-full"
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
                    ref={watchersButtonRef}
                    type="button"
                    onClick={handleWatchersDropdownToggle}
                    className="w-full px-3 py-2 border rounded-md bg-white text-left flex items-center justify-between hover:bg-gray-50"
                    disabled={isSubmitting}
                  >
                    <span className="text-gray-700 truncate">
                      {taskWatchers.length === 0 ? 'Select watchers...' : `${taskWatchers.length} watcher${taskWatchers.length !== 1 ? 's' : ''}`}
                    </span>
                    <ChevronDown className="w-4 h-4 flex-shrink-0 ml-2" />
                  </button>
                  
                  {showWatchersDropdown && (
                    <div className={`absolute z-50 w-full bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto ${
                      watchersDropdownPosition === 'above' 
                        ? 'bottom-full mb-1' 
                        : 'top-full mt-1'
                    }`}>
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
                    ref={collaboratorsButtonRef}
                    type="button"
                    onClick={handleCollaboratorsDropdownToggle}
                    className="w-full px-3 py-2 border rounded-md bg-white text-left flex items-center justify-between hover:bg-gray-50"
                    disabled={isSubmitting}
                  >
                    <span className="text-gray-700 truncate">
                      {taskCollaborators.length === 0 ? 'Select collaborators...' : `${taskCollaborators.length} collaborator${taskCollaborators.length !== 1 ? 's' : ''}`}
                    </span>
                    <ChevronDown className="w-4 h-4 flex-shrink-0 ml-2" />
                  </button>
                  
                  {showCollaboratorsDropdown && (
                    <div className={`absolute z-50 w-full bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto ${
                      collaboratorsDropdownPosition === 'above' 
                        ? 'bottom-full mb-1' 
                        : 'top-full mt-1'
                    }`}>
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
            </div>

            {/* Tags Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
              <div className="relative" ref={tagsDropdownRef}>
                <button
                  ref={tagsButtonRef}
                  type="button"
                  onClick={handleTagsDropdownToggle}
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
                  <div className={`absolute left-0 bg-white border border-gray-300 rounded-md shadow-lg z-10 w-full max-h-60 overflow-y-auto ${
                    tagsDropdownPosition === 'above' 
                      ? 'bottom-full mb-1' 
                      : 'top-full mt-1'
                  }`}>
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
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full font-medium hover:opacity-80 transition-opacity"
                      style={(() => {
                        if (!tag.color) {
                          return { backgroundColor: '#6b7280', color: 'white' };
                        }
                        
                        // Calculate luminance to determine text color
                        const hex = tag.color.replace('#', '');
                        if (hex.length === 6) {
                          const r = parseInt(hex.substring(0, 2), 16);
                          const g = parseInt(hex.substring(2, 4), 16);
                          const b = parseInt(hex.substring(4, 6), 16);
                          
                          // Calculate relative luminance
                          const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                          
                          // Use dark text for light backgrounds, white text for dark backgrounds
                          const textColor = luminance > 0.6 ? '#374151' : '#ffffff';
                          const borderStyle = textColor === '#374151' ? { border: '1px solid #d1d5db' } : {};
                          
                          return { backgroundColor: tag.color, color: textColor, ...borderStyle };
                        }
                        
                        // Fallback for invalid hex colors
                        return { backgroundColor: tag.color, color: 'white' };
                      })()}
                    >
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
            
            {/* Task Relationships Section */}
            <div className="mt-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Parent Field - Left Side */}
                {parentTask && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Parent:</label>
                    <span 
                      onClick={() => {
                        const url = generateTaskUrl(parentTask.ticket, parentTask.projectId);
                        console.log('🔗 TaskDetails Parent URL:', { 
                          ticket: parentTask.ticket, 
                          projectId: parentTask.projectId, 
                          generatedUrl: url 
                        });
                        // Extract just the hash part for navigation
                        const hashPart = url.split('#').slice(1).join('#');
                        window.location.hash = hashPart;
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline cursor-pointer transition-colors"
                      title={`Go to parent task ${parentTask.ticket}`}
                    >
                      {parentTask.ticket}
                    </span>
                  </div>
                )}
                
                {/* Children Field - Right Side */}
                <div className={parentTask ? '' : 'col-span-2'}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Child(ren):</label>
                  
                  {/* Selected Children Display */}
                  {childTasks.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {childTasks.map(child => (
                        <span
                          key={child.id}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full font-medium bg-blue-100 text-blue-800 hover:opacity-80 transition-opacity"
                        >
                            <span 
                              onClick={() => {
                                const url = generateTaskUrl(child.ticket, child.projectId);
                                console.log('🔗 TaskDetails Child URL:', { 
                                  ticket: child.ticket, 
                                  projectId: child.projectId, 
                                  generatedUrl: url 
                                });
                                // Extract just the hash part for navigation
                                const hashPart = url.split('#').slice(1).join('#');
                                window.location.hash = hashPart;
                              }}
                              className="text-blue-800 hover:text-blue-900 hover:underline cursor-pointer transition-colors"
                              title={`Go to child task ${child.ticket}`}
                            >
                              {child.ticket}
                            </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveChildTask(child.id)}
                            className="ml-1 hover:bg-red-500 hover:text-white rounded-full w-3 h-3 flex items-center justify-center text-xs font-bold transition-colors"
                            title="Remove child task"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  
                  {/* Children Dropdown */}
                  <div className="relative" ref={childrenDropdownRef}>
                    <button
                      type="button"
                      onClick={handleChildrenDropdownToggle}
                      className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent flex items-center justify-between"
                    >
                      <span className="text-gray-700">
                        Add child task...
                      </span>
                      <ChevronDown size={16} className={`transform transition-transform ${showChildrenDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {showChildrenDropdown && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                        {/* Search Input */}
                        <div className="p-2 border-b border-gray-200">
                          <input
                            type="text"
                            placeholder="Search tasks by number or title..."
                            value={childrenSearchTerm}
                            onChange={(e) => setChildrenSearchTerm(e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                          />
                        </div>
                        
                        {/* Available Tasks List */}
                        <div className="max-h-40 overflow-y-auto">
                          {filteredAvailableChildren.length > 0 ? (
                            filteredAvailableChildren.map(availableTask => (
                              <button
                                key={availableTask.id}
                                type="button"
                                onClick={() => handleAddChildTask(availableTask.id)}
                                className="w-full px-3 py-2 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none transition-colors text-sm"
                              >
                                <div className="font-medium text-blue-600">{availableTask.ticket}</div>
                                <div className="text-gray-600 truncate">{availableTask.title}</div>
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-sm text-gray-500">
                              {childrenSearchTerm ? 'No tasks found matching your search' : 'No available tasks'}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div ref={commentsRef} className="p-6 border-t border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">
              Comments ({sortedComments.length})
            </h3>
            {showRefreshIndicator && (
              <div 
                className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full transition-all duration-300 ease-in-out"
                style={{
                  animation: 'fadeIn 0.3s ease-in-out'
                }}
              >
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                Comments updated
              </div>
            )}
          </div>
          <div className="mb-4">
            <TextEditor 
              onSubmit={handleAddComment}
              onCancel={() => {
                // The TextEditor handles clearing its own content and attachments
                // No additional action needed here
              }}
              placeholder="Add a comment..."
              showAttachments={true}
              submitButtonText="Add Comment"
              cancelButtonText="Cancel"
              toolbarOptions={{
                bold: true,
                italic: true,
                underline: true,
                link: true,
                lists: true,
                alignment: false,
                attachments: true
              }}
            />
          </div>

          <div className="space-y-6">
            {sortedComments.map(comment => {
              const author = members.find(m => m.id === comment.authorId);
              if (!author) return null;

              const attachments = commentAttachments[comment.id] || [];

              // Fix blob URLs in comment text by replacing them with server URLs
              const fixImageUrls = (htmlContent: string, attachments: Attachment[]) => {
                let fixedContent = htmlContent;
                attachments.forEach(attachment => {
                  if (attachment.name.startsWith('img-')) {
                    // Replace blob URLs with server URLs
                    const blobPattern = new RegExp(`blob:[^"]*#${attachment.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
                    fixedContent = fixedContent.replace(blobPattern, attachment.url);
                  }
                });
                return fixedContent;
              };

              const displayContent = fixImageUrls(comment.text, attachments);

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
                    {canModifyComment(comment) && editingCommentId !== comment.id && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditComment(comment)}
                          disabled={isSubmitting}
                          className="p-1 text-gray-400 hover:text-blue-500 hover:bg-gray-100 rounded-full transition-colors"
                          title="Edit comment"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          disabled={isSubmitting}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded-full transition-colors"
                          title="Delete comment"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                  {editingCommentId === comment.id ? (
                    <TextEditor
                      initialContent={editingCommentText}
                      onSubmit={async (content: string) => {
                        setEditingCommentText(content);
                        await handleSaveEditCommentWithContent(content);
                      }}
                      onCancel={handleCancelEditComment}
                      placeholder="Edit comment..."
                      showAttachments={true}
                      submitButtonText="Save Changes"
                      cancelButtonText="Cancel"
                      existingAttachments={attachments}
                      onAttachmentDelete={async (attachmentId: string) => {
                        try {
                          // Find the attachment to get its name before deleting
                          const attachmentToDelete = attachments.find(att => att.id === attachmentId);
                          
                          // Delete from server
                          await deleteAttachment(attachmentId);
                          
                          // Remove from local commentAttachments state
                          setCommentAttachments(prev => ({
                            ...prev,
                            [comment.id]: prev[comment.id]?.filter(att => att.id !== attachmentId) || []
                          }));

                          // Also remove the image from the editor if it's an image attachment
                          if (attachmentToDelete && attachmentToDelete.name.startsWith('img-') && window.textEditorRemoveImage) {
                            window.textEditorRemoveImage(attachmentToDelete.name);
                          }
                        } catch (error) {
                          console.error('Failed to delete comment attachment:', error);
                          throw error;
                        }
                      }}
                      onImageRemovalNeeded={(attachmentName: string) => {
                        // Remove from local commentAttachments state by name
                        setCommentAttachments(prev => ({
                          ...prev,
                          [comment.id]: prev[comment.id]?.filter(att => att.name !== attachmentName) || []
                        }));
                      }}
                      attachmentContext="comment"
                      attachmentParentId={comment.id}
                      toolbarOptions={{
                        bold: true,
                        italic: true,
                        underline: true,
                        link: true,
                        lists: true,
                        alignment: false,
                        attachments: true
                      }}
                    />
                  ) : (
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(displayContent) }}
                    />
                  )}
                  {attachments.filter(att => !att.name.startsWith('img-')).length > 0 && (
                    <div className="mt-3 space-y-1">
                      {attachments.filter(att => !att.name.startsWith('img-')).map(attachment => (
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
    </div>
  );
}
