import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaskDetails } from '../hooks/useTaskDetails';
import { Task, TeamMember, CurrentUser, Attachment } from '../types';
import { ArrowLeft, Save, Clock, User, Calendar, AlertCircle, Tag, Users, Paperclip, Edit2, X, ChevronDown, ChevronUp, GitBranch } from 'lucide-react';
import { parseTaskRoute } from '../utils/routingUtils';
import { getTaskById, getMembers, getBoards, addWatcherToTask, removeWatcherFromTask, addCollaboratorToTask, removeCollaboratorFromTask, addTagToTask, removeTagFromTask, deleteComment, updateComment, fetchTaskAttachments, deleteAttachment, fetchCommentAttachments, getTaskRelationships, getAvailableTasksForRelationship, addTaskRelationship, removeTaskRelationship } from '../api';
import { useFileUpload } from '../hooks/useFileUpload';
import { generateTaskUrl } from '../utils/routingUtils';
import { loadUserPreferences, updateUserPreference } from '../utils/userPreferences';
import { truncateMemberName } from '../utils/memberUtils';
import TextEditor from './TextEditor';
import ModalManager from './layout/ModalManager';
import Header from './layout/Header';
import TaskFlowChart from './TaskFlowChart';
import DOMPurify from 'dompurify';
import { getAuthenticatedAttachmentUrl } from '../utils/authImageUrl';

interface TaskPageProps {
  currentUser: CurrentUser | null;
  siteSettings?: { [key: string]: string };
  members: TeamMember[];
  isPolling: boolean;
  lastPollTime: Date | null;
  onLogout: () => void;
  onPageChange: (page: 'kanban' | 'admin') => void;
  onRefresh: () => Promise<void>;
  onInviteUser?: (email: string) => Promise<void>;
  // Auto-refresh toggle
  // isAutoRefreshEnabled: boolean; // Disabled - using real-time updates
  // onToggleAutoRefresh: () => void; // Disabled - using real-time updates
}

export default function TaskPage({ 
  currentUser, 
  siteSettings, 
  members: propMembers, 
  isPolling, 
  lastPollTime, 
  onLogout, 
  onPageChange, 
  onRefresh, 
  onInviteUser,
  // isAutoRefreshEnabled, // Disabled - using real-time updates
  // onToggleAutoRefresh // Disabled - using real-time updates
}: TaskPageProps) {
  const { t } = useTranslation('tasks');
  const [task, setTask] = useState<Task | null>(null);
  const [boards, setBoards] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Use members from props
  const members = propMembers;
  
  // Modal states
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isProfileBeingEdited, setIsProfileBeingEdited] = useState(false);

  // Task relationships state
  const [relationships, setRelationships] = useState<any[]>([]);
  const [parentTask, setParentTask] = useState<{id: string, ticket: string, title: string, projectId?: string} | null>(null);
  const [childTasks, setChildTasks] = useState<{id: string, ticket: string, title: string, projectId?: string}[]>([]);
  const [availableTasksForChildren, setAvailableTasksForChildren] = useState<{id: string, ticket: string, title: string, status: string, projectId?: string}[]>([]);
  const [showChildrenDropdown, setShowChildrenDropdown] = useState(false);
  const [childrenSearchTerm, setChildrenSearchTerm] = useState('');
  const [isLoadingRelationships, setIsLoadingRelationships] = useState(false);
  const childrenDropdownRef = useRef<HTMLDivElement>(null);

  // Collapsible sections state - always load from preferences if available
  const [collapsedSections, setCollapsedSections] = useState<{
    assignment: boolean;
    schedule: boolean;
    tags: boolean;
    associations: boolean;
    taskFlow: boolean;
    taskInfo: boolean;
  }>(() => {
    if (currentUser?.id) {
      const prefs = loadUserPreferences(currentUser.id);
      console.log('📁 TaskPage: Initial preferences loaded:', prefs.taskPageCollapsed);
      if (prefs.taskPageCollapsed) {
        console.log('📁 TaskPage: Using saved preferences for initial state');
        return {
          ...prefs.taskPageCollapsed,
          taskFlow: prefs.taskPageCollapsed.taskFlow ?? false, // Default to expanded for new section
        };
      }
    }
    console.log('📁 TaskPage: Using default state (all expanded)');
    return {
      assignment: false,
      schedule: false,
      tags: false,
      associations: false,
      taskFlow: false,
      taskInfo: false,
    };
  });

  // Track current hash to detect changes and re-parse task route
  const [currentHash, setCurrentHash] = useState(window.location.hash);
  
  // Parse the task route to get task ID (will re-calculate when currentHash changes)
  const taskRoute = useMemo(() => {
    return parseTaskRoute(window.location.href);
  }, [currentHash]);
  const taskId = taskRoute.taskId;
  
  // Listen for hash changes and update current hash state
  useEffect(() => {
    const handleHashChange = () => {
      console.log('🔄 [TaskPage] Hash changed:', window.location.hash);
      setCurrentHash(window.location.hash);
    };
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  
  // Reset all state when task ID changes
  useEffect(() => {
    console.log('🔄 [TaskPage] Task ID changed to:', taskId);
    setTask(null);
    setError(null);
    setIsLoading(true);
    setRelationships([]);
    setParentTask(null);
    setChildTasks([]);
    setAvailableTasksForChildren([]);
    setShowChildrenDropdown(false);
    setChildrenSearchTerm('');
  }, [taskId]);
  

  // Load task data
  useEffect(() => {
    const loadPageData = async () => {
      if (!taskId) {
        setError(t('taskPage.invalidTaskId'));
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        
        console.log('🚀 [TaskPage] Starting data load for taskId:', taskId);
        
        // Load task and boards in parallel (members come from props)
        console.log('📡 [TaskPage] Making API calls...');
        const [taskData, boardsData] = await Promise.all([
          getTaskById(taskId),
          getBoards()
        ]);

        console.log('📥 [TaskPage] API responses received:');
        console.log('  📄 Task data:', {
          id: taskData?.id,
          title: taskData?.title,
          priority: taskData?.priority,
          priorityId: taskData?.priorityId,
          status: taskData?.status,
          watchers: taskData?.watchers?.length || 0,
          collaborators: taskData?.collaborators?.length || 0,
          tags: taskData?.tags?.length || 0,
          comments: taskData?.comments?.length || 0
        });
        console.log('  👥 Members data:', { count: members?.length, first: members?.[0] });
        console.log('  📋 Boards data:', { count: boardsData?.length });

        if (!taskData) {
          console.log('❌ [TaskPage] No task data received');
          setError(t('taskPage.taskNotFound'));
          return;
        }

        console.log('✅ [TaskPage] Setting state with loaded data');
        setTask(taskData);
        setBoards(boardsData);
      } catch (error) {
        console.error('❌ [TaskPage] Error loading task page data:', error);
        console.error('❌ [TaskPage] Error details:', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: error.config?.url,
          data: error.response?.data
        });
        setError(t('taskPage.failedToLoad', { status: error.response?.status || error.message }));
      } finally {
        setIsLoading(false);
      }
    };

    loadPageData();
  }, [taskId]);

  // Load task relationships
  useEffect(() => {
    const loadRelationships = async () => {
      if (!task?.id) return;
      
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
  }, [task?.id]);

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

  // Create a default task to avoid hook issues during loading
  const defaultTask = {
    id: '',
    title: '',
    description: '',
    memberId: '',
    requesterId: '',
    startDate: null,
    dueDate: null,
    effort: null,
    priority: null,
    priorityId: null,
    columnId: '',
    boardId: '',
    position: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    comments: []
  };

  // Task relationship handlers
  const handleAddChildTask = async (childTaskId: string) => {
    try {
      if (!task?.id) return;
      
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
      if (!task?.id) return;
      
      // Find the relationship to delete
      const relationship = relationships.find(rel => 
        rel.relationship === 'parent' && 
        rel.task_id === task.id && 
        rel.to_task_id === childTaskId
      );
      
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

  const taskDetailsHook = useTaskDetails({
    task: task || defaultTask,
    members,
    currentUser,
    onUpdate: setTask,
    siteSettings,
    boards
  });

  const {
    editedTask,
    hasChanges,
    isSaving,
    lastSaved,
    availableTags,
    taskTags,
    taskWatchers,
    taskCollaborators,
    availablePriorities,
    getProjectIdentifier,
    handleTaskUpdate,
    handleAddWatcher,
    handleRemoveWatcher,
    handleAddCollaborator,
    handleRemoveCollaborator,
    handleAddTag,
    handleRemoveTag,
    handleAddComment,
    handleDeleteComment,
    handleUpdateComment,
    saveImmediately
  } = taskDetailsHook;

  // Direct attachment management (matching TaskDetails exactly)
  const [taskAttachments, setTaskAttachments] = useState<Array<{
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
  }>>([]);
  
  // Use the new file upload hook
  const {
    pendingFiles: pendingAttachments,
    isUploading: isUploadingAttachments,
    uploadError: uploadError,
    uploadTaskFiles,
    clearFiles,
    addFiles
  } = useFileUpload([], siteSettings);
  
  const [isDeletingAttachment, setIsDeletingAttachment] = useState(false);
  const recentlyDeletedAttachmentsRef = useRef<Set<string>>(new Set());
  const [commentAttachments, setCommentAttachments] = useState<Record<string, Attachment[]>>({});

  // Comment editing state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState<string>('');

  // Helper function to check if user can edit/delete a comment
  const canModifyComment = (comment: any): boolean => {
    if (!currentUser) return false;
    
    // Admin can modify any comment
    if (currentUser.roles?.includes('admin')) return true;
    
    // User can modify their own comments
    const currentMember = members.find(m => m.user_id === currentUser.id);
    return currentMember?.id === comment.authorId;
  };

  const handleEditComment = (comment: any) => {
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.text);
  };

  const handleSaveEditComment = async (content: string, attachments: File[] = []) => {
    if (!editingCommentId || !content.trim()) return;
    
    try {
      // If there are attachments, handle them like adding a comment
      if (attachments.length > 0) {
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

        // Replace blob URLs with server URLs in comment content
        let finalContent = content;
        uploadedAttachments.forEach(attachment => {
          if (attachment.name.startsWith('img-')) {
            // Replace blob URLs with authenticated server URLs
            const blobPattern = new RegExp(`blob:[^"]*#${attachment.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
            const authenticatedUrl = getAuthenticatedAttachmentUrl(attachment.url);
            finalContent = finalContent.replace(blobPattern, authenticatedUrl || attachment.url);
          }
        });

        await handleUpdateComment(editingCommentId, finalContent.trim());
      } else {
        await handleUpdateComment(editingCommentId, content.trim());
      }
      
      setEditingCommentId(null);
      setEditingCommentText('');
    } catch (error) {
      console.error('Error saving comment edit:', error);
    }
  };

  const handleCancelEditComment = () => {
    setEditingCommentId(null);
    setEditingCommentText('');
  };

  // Toggle section collapse state
  const toggleSection = useCallback((section: keyof typeof collapsedSections) => {
    setCollapsedSections(prev => {
      const newState = {
        ...prev,
        [section]: !prev[section]
      };
      
      // Save to user preferences
      if (currentUser?.id) {
        console.log(`📁 TaskPage: Toggling section ${section} to ${newState[section] ? 'collapsed' : 'expanded'}`);
        updateUserPreference(currentUser.id, 'taskPageCollapsed', newState);
      }
      
      return newState;
    });
  }, [currentUser?.id]);

  const handleDeleteCommentClick = async (commentId: string) => {
    if (!currentUser) return;
    
    try {
      // Use hook's delete function which handles both server and state
      await handleDeleteComment(commentId);
    } catch (error) {
      console.error('Error deleting comment:', error);
    }
  };

  // Direct attachment management functions (matching TaskDetails exactly)
  const handleAttachmentsChange = useCallback((attachments: File[]) => {
    // Use the hook's addFiles function instead of direct state management
    addFiles(attachments);
  }, [addFiles]);

  const handleAttachmentDelete = useCallback(async (attachmentId: string) => {
    try {
      await deleteAttachment(attachmentId);
      
      // Find the attachment to get its filename
      const attachmentToDelete = taskAttachments.find(att => att.id === attachmentId) || 
                                 displayAttachments.find(att => att.id === attachmentId);
      
      if (attachmentToDelete) {
        // Remove from ALL local state (just like image X button does)
        setTaskAttachments(prev => {
          const updated = prev.filter(att => att.id !== attachmentId && att.name !== attachmentToDelete.name);
          // Update the task with the new attachment count
          handleTaskUpdate({ attachmentCount: updated.length });
          return updated;
        });
        setPendingAttachments(prev => prev.filter(att => att.name !== attachmentToDelete.name));
      } else {
        // Fallback: just remove by ID
        setTaskAttachments(prev => {
          const updated = prev.filter(att => att.id !== attachmentId);
          // Update the task with the new attachment count
          handleTaskUpdate({ attachmentCount: updated.length });
          return updated;
        });
      }
    } catch (error) {
      console.error('Error deleting attachment:', error);
      throw error; // Re-throw to let TextEditor handle the error
    }
  }, [taskAttachments, handleTaskUpdate]);

  const handleImageRemoval = useCallback(async (filename: string) => {
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
        const freshAttachments = await fetchTaskAttachments(task?.id || '');
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
    setTaskAttachments(prev => {
      const updated = prev.filter(att => att.name !== filename);
      // Update the task with the new attachment count
      handleTaskUpdate({ attachmentCount: updated.length });
      return updated;
    });
    
    // Clear the recently deleted flag after a longer delay
    setTimeout(() => {
      recentlyDeletedAttachmentsRef.current.delete(filename);
    }, 5000); // 5 seconds should be enough for any polling cycles
  }, [taskAttachments, task?.id, handleTaskUpdate]);

  const savePendingAttachments = useCallback(async () => {
    if (pendingAttachments.length === 0 || isUploadingRef.current) return;
    
    isUploadingRef.current = true;
    try {
      console.log('📎 Uploading', pendingAttachments.length, 'task attachments...');
      
      // Use the new upload utility
      const uploadedAttachments = await uploadTaskFiles(task?.id || '', {
        currentTaskAttachments: taskAttachments,
        currentDescription: editedTask.description,
        onTaskAttachmentsUpdate: (updatedAttachments) => {
          console.log('🔄 Updating taskAttachments with:', updatedAttachments.length, 'attachments');
          setTaskAttachments(updatedAttachments);
          // Update the task with the new attachment count
          handleTaskUpdate({ attachmentCount: updatedAttachments.length });
        },
        onDescriptionUpdate: (updatedDescription) => {
          console.log('🔄 Updating task description with server URLs');
          handleTaskUpdate({ description: updatedDescription });
        },
        onSuccess: (attachments) => {
          console.log('✅ Task attachments saved successfully:', attachments.length, 'files');
          // Clear pending attachments on success
          clearFiles();
        },
        onError: (error) => {
          console.error('❌ Failed to upload task attachments:', error);
          // Clear pending attachments on error to prevent retry loop
          const errorMessage = error.response?.status === 413 
            ? 'File(s) too large. Please reduce file size or upload fewer files at once.'
            : error.message || 'Failed to upload files. Please try again.';
          console.error('Upload error details:', errorMessage);
          clearFiles(); // Clear to prevent infinite retry loop
        }
      });
      
      console.log('📎 Task attachment upload completed, got:', uploadedAttachments.length, 'attachments');
    } catch (error: any) {
      console.error('❌ Failed to save task attachments:', error);
      // Clear pending attachments on error to prevent retry loop
      clearFiles();
      
      // Show user-friendly error message
      const errorMessage = error.response?.status === 413 
        ? 'File(s) too large. Please reduce file size or upload fewer files at once.'
        : error.message || 'Failed to upload files. Please try again.';
      console.error('Upload error details:', errorMessage);
    } finally {
      isUploadingRef.current = false;
    }
  }, [pendingAttachments.length, task?.id, uploadTaskFiles, handleTaskUpdate, clearFiles]);

  // Only show saved attachments - no pending ones to avoid state sync issues
  const displayAttachments = React.useMemo(() => taskAttachments, [taskAttachments]);

  // Text save timeout ref for debouncing
  const textSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Separate function for text field updates with immediate save (matching TaskDetails)
  const handleTextUpdate = useCallback((field: 'title' | 'description', value: string) => {
    // Update hook state immediately
    handleTaskUpdate({ [field]: value });
    
    // Debounce text saves to prevent spam (but keep attachments immediate)
    if (textSaveTimeoutRef.current) {
      clearTimeout(textSaveTimeoutRef.current);
    }
    
    textSaveTimeoutRef.current = setTimeout(() => {
      // The hook's debounced save will handle this
      console.log(`💾 Debounced save triggered for ${field}:`, value.substring(0, 50) + '...');
    }, 1000);
  }, [handleTaskUpdate]);

  // Auto-upload pending attachments (matching TaskDetails)
  // Use a ref to track if we're currently uploading to prevent retry loops
  const isUploadingRef = React.useRef(false);
  useEffect(() => {
    if (pendingAttachments.length > 0) {
      savePendingAttachments();
    }
  }, [pendingAttachments.length, savePendingAttachments]); // Only depend on length, not the array itself

  // Load task attachments when task changes
  useEffect(() => {
    const loadAttachments = async () => {
      if (task?.id) {
        try {
          const attachments = await fetchTaskAttachments(task.id);
          // Filter out recently deleted attachments and only update if not uploading
          if (!isUploadingAttachments) {
            const filteredAttachments = (attachments || []).filter((att: any) => 
              !recentlyDeletedAttachmentsRef.current.has(att.name)
            );
            setTaskAttachments(filteredAttachments);
          }
        } catch (error) {
          console.error('Error loading task attachments:', error);
        }
      }
    };

    loadAttachments();
  }, [task?.id, isUploadingAttachments]);

  // Load comment attachments (matching TaskDetails)
  useEffect(() => {
    const fetchAttachments = async () => {
      if (!editedTask?.comments) return;
      
      const attachmentsMap: Record<string, Attachment[]> = {};
      
      // Only fetch for valid comments
      const validComments = editedTask.comments.filter(
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
  }, [editedTask?.comments]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (textSaveTimeoutRef.current) {
        clearTimeout(textSaveTimeoutRef.current);
      }
    };
  }, []);

  const handleBack = () => {
    // Navigate back to the kanban board
    if (task?.boardId) {
      // Try to get project identifier if available
      const projectId = getProjectIdentifier ? getProjectIdentifier() : null;
      if (projectId) {
        window.location.hash = `#kanban#${task.boardId}`;
      } else {
        window.location.hash = `#kanban#${task.boardId}`;
      }
    } else {
      // Fallback to just kanban if no board info
      window.location.hash = '#kanban';
    }
  };


  // Sync with preferences when user changes (backup for edge cases)
  useEffect(() => {
    console.log('📁 TaskPage: useEffect triggered - syncing preferences');
    if (currentUser?.id) {
      const prefs = loadUserPreferences(currentUser.id);
      console.log('📁 TaskPage: Syncing preferences for user', currentUser.id);
      console.log('📁 TaskPage: Current prefs:', prefs.taskPageCollapsed);
      if (prefs.taskPageCollapsed) {
        console.log('📁 TaskPage: Syncing to saved preferences');
        setCollapsedSections(prefs.taskPageCollapsed);
      }
    }
  }, [currentUser?.id]);

  // Modal handlers
  const handleProfileUpdated = async () => {
    // Profile updates are handled by the main app, so we don't need to do anything special here
    // The currentUser prop will be updated by the parent
  };

  const handleActivityFeedToggle = (enabled: boolean) => {
    // Activity feed is not used on TaskPage, but we need the handler for ModalManager
    console.log('Activity feed toggle not applicable on TaskPage:', enabled);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('taskPage.loading')}</p>
        </div>
      </div>
    );
  }

  if (error || (!task && !isLoading)) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('taskPage.taskNotFoundTitle')}</h1>
          <p className="text-gray-600 mb-4">{error || t('taskPage.taskNotFoundMessage')}</p>
          <button
            onClick={handleBack}
            className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors"
          >
            {t('taskPage.backToBoard')}
          </button>
        </div>
      </div>
    );
  }

  // Don't render the full page until we have actual task data
  if (!task) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('taskPage.loading')}</p>
        </div>
      </div>
    );
  }

  const assignedMember = members.find(m => m.id === editedTask.memberId);
  const requesterMember = members.find(m => m.id === editedTask.requesterId);
  const priority = availablePriorities.find(p => p.id === editedTask.priorityId);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* App Header */}
      <Header
        currentUser={currentUser}
        siteSettings={siteSettings || {}}
        currentPage={'kanban'} // Task page is part of kanban flow
        // isPolling={isPolling} // Removed - using real-time WebSocket updates
        // lastPollTime={lastPollTime} // Removed - using real-time WebSocket updates
        members={members}
        onProfileClick={() => setShowProfileModal(true)}
        onLogout={onLogout}
        onPageChange={onPageChange}
        onRefresh={onRefresh}
        onHelpClick={() => setShowHelpModal(true)}
        onInviteUser={onInviteUser}
        // isAutoRefreshEnabled={isAutoRefreshEnabled} // Disabled - using real-time updates
        // onToggleAutoRefresh={onToggleAutoRefresh} // Disabled - using real-time updates
      />
      
      {/* Task Navigation Bar - Sticky */}
      <div className="sticky top-16 z-40 bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="w-4/5 max-w-none mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleBack}
                className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 mr-1" />
                {t('taskPage.backToBoard')}
              </button>
              <div className="h-6 border-l border-gray-300"></div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editedTask.title}</h1>
                <p className="text-sm text-gray-500">
                  {getProjectIdentifier() && `${getProjectIdentifier()} / `}
                  {taskId}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {hasChanges && (
                <span className="text-sm text-amber-600 flex items-center">
                  <Clock className="h-4 w-4 mr-1" />
                  {t('taskPage.unsavedChanges')}
                </span>
              )}
              {isSaving && (
                <span className="text-sm text-blue-600 flex items-center">
                  <Save className="h-4 w-4 mr-1 animate-spin" />
                  {t('taskPage.saving')}
                </span>
              )}
              {lastSaved && !hasChanges && !isSaving && (
                <span className="text-sm text-green-600">
                  {t('taskPage.saved', { time: lastSaved.toLocaleTimeString() })}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-4/5 max-w-none mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Title */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">{t('taskPage.taskTitle')}</label>
              <input
                type="text"
                value={editedTask.title}
                onChange={(e) => handleTaskUpdate({ title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg font-medium bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder={t('placeholders.enterTitle')}
              />
            </div>

            {/* Description */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-4">{t('labels.description')}</label>
              <TextEditor
                onSubmit={async () => {
                  // Save pending attachments when submit is triggered
                  await savePendingAttachments();
                }}
                onChange={(content) => handleTextUpdate('description', content)}
                onAttachmentsChange={handleAttachmentsChange}
                onAttachmentDelete={handleAttachmentDelete}
                onImageRemovalNeeded={handleImageRemoval}
                initialContent={editedTask.description || ''}
                placeholder={t('placeholders.enterDescription')}
                minHeight="120px"
                showSubmitButtons={false}
                showAttachments={true}
                attachmentContext="task"
                attachmentParentId={task?.id}
                existingAttachments={displayAttachments}
                compact={false}
                resizable={true}
                className="min-h-[300px]"
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
              
              {/* Upload error display */}
              {uploadError && (
                <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                  <div className="text-sm text-red-600 dark:text-red-400">
                    {t('taskPage.uploadError', { error: uploadError })}
                  </div>
                </div>
              )}
            </div>

            {/* Attachments */}
            {displayAttachments.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-4 flex items-center">
                  <Paperclip className="h-4 w-4 mr-2" />
                  {t('taskPage.attachments', { count: displayAttachments.length })}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {displayAttachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center p-3 border border-gray-200 rounded-md">
                      <Paperclip className="h-4 w-4 text-gray-400 mr-3 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{attachment.name}</p>
                        <p className="text-xs text-gray-500">
                          {attachment.size ? `${Math.round(attachment.size / 1024)} KB` : t('taskPage.unknownSize')}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <a
                          href={getAuthenticatedAttachmentUrl(attachment.url) || attachment.url}
                          {...(siteSettings?.SITE_OPENS_NEW_TAB === undefined || siteSettings?.SITE_OPENS_NEW_TAB === 'true' 
                            ? { target: '_blank', rel: 'noopener noreferrer' } 
                            : {})}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          {t('taskPage.view')}
                        </a>
                        <button
                          onClick={() => handleAttachmentDelete(attachment.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          {t('taskPage.delete')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comments */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <h3 className="text-sm font-medium text-gray-700 mb-4 flex items-center">
                <Users className="h-4 w-4 mr-2" />
                {t('taskPage.comments', { count: (editedTask.comments || []).filter(comment => 
                  comment && 
                  comment.id && 
                  comment.text && 
                  comment.text.trim() !== '' && 
                  comment.authorId && 
                  comment.createdAt
                ).length })}
              </h3>
              {/* Add Comment Section */}
              <div className="mb-6">
                <TextEditor 
                  onSubmit={async (content: string, attachments: File[] = []) => {
                    try {
                      await handleAddComment(content, attachments);
                    } catch (error) {
                      console.error('Error adding comment:', error);
                    }
                  }}
                  onCancel={() => {
                    // The TextEditor handles clearing its own content and attachments
                    // No additional action needed here
                  }}
                  placeholder={t('taskPage.addCommentPlaceholder')}
                  showAttachments={true}
                  submitButtonText={t('taskPage.addComment')}
                  cancelButtonText={t('buttons.cancel', { ns: 'common' })}
                  attachmentContext="comment"
                  allowImagePaste={true}
                  allowImageDelete={true}
                  allowImageResize={true}
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

              <div className="space-y-4">
                {(() => {
                  // Sort comments newest first (matching TaskDetails)
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
                  
                  return sortedComments;
                })().map((comment) => {
                  const author = members.find(m => m.id === comment.authorId);
                  
                  return (
                    <div key={comment.id} className="border border-gray-200 rounded-md p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <div 
                            className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium text-white"
                            style={{ backgroundColor: author?.color || '#6b7280' }}
                          >
                            {author?.name?.[0] || 'U'}
                          </div>
                          <span className="text-sm font-medium text-gray-900">{author?.name || 'Unknown'}</span>
                          <span className="text-xs text-gray-500">
                            {new Date(comment.createdAt).toLocaleDateString()} {new Date(comment.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        {canModifyComment(comment) && editingCommentId !== comment.id && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEditComment(comment)}
                              className="p-1 text-gray-400 hover:text-blue-500 hover:bg-gray-100 rounded-full transition-colors"
                              title={t('taskPage.editComment')}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteCommentClick(comment.id)}
                              className="p-1 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded-full transition-colors"
                              title={t('taskPage.deleteComment')}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                      {editingCommentId === comment.id ? (
                        <TextEditor
                          initialContent={editingCommentText}
                          onSubmit={handleSaveEditComment}
                          onCancel={handleCancelEditComment}
                          placeholder={t('taskPage.editCommentPlaceholder')}
                          minHeight="80px"
                          showToolbar={true}
                          showSubmitButtons={true}
                          submitButtonText={t('taskPage.saveChanges')}
                          cancelButtonText={t('buttons.cancel', { ns: 'common' })}
                          className="border rounded"
                          showAttachments={true}
                          attachmentContext="comment"
                          attachmentParentId={comment.id}
                          allowImagePaste={true}
                          allowImageDelete={true}
                          allowImageResize={true}
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
                        <>
                          <div 
                            className="text-sm text-gray-700 prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ 
                              __html: DOMPurify.sanitize(
                                (() => {
                                  // Fix blob URLs in comment text by replacing them with server URLs (matching TaskDetails)
                                  const attachments = commentAttachments[comment.id] || [];
                                  let fixedContent = comment.text;
                                  
                                  attachments.forEach(attachment => {
                                    if (attachment.name.startsWith('img-')) {
                                      // Replace blob URLs with authenticated server URLs
                                      const blobPattern = new RegExp(`blob:[^"]*#${attachment.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
                                      const authenticatedUrl = getAuthenticatedAttachmentUrl(attachment.url);
                                      fixedContent = fixedContent.replace(blobPattern, authenticatedUrl || attachment.url);
                                    }
                                  });
                                  
                                  return fixedContent;
                                })()
                              ) 
                            }}
                          />
                          {/* Display non-image attachments as clickable links (matching TaskDetails) */}
                          {(() => {
                            const attachments = commentAttachments[comment.id] || [];
                            const nonImageAttachments = attachments.filter(att => !att.name.startsWith('img-'));
                            if (nonImageAttachments.length === 0) return null;
                            
                            return (
                              <div className="mt-3 space-y-1">
                                {nonImageAttachments.map(attachment => (
                                  <div
                                    key={attachment.id}
                                    className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
                                  >
                                    <Paperclip size={14} />
                                    <a
                                      href={getAuthenticatedAttachmentUrl(attachment.url) || attachment.url}
                                      {...(siteSettings?.SITE_OPENS_NEW_TAB === undefined || siteSettings?.SITE_OPENS_NEW_TAB === 'true' 
                                        ? { target: '_blank', rel: 'noopener noreferrer' } 
                                        : {})}
                                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
                                    >
                                      {attachment.name}
                                    </a>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  );
                })}
                
                {(!editedTask.comments || editedTask.comments.length === 0) && (
                  <p className="text-sm text-gray-500 text-center py-4">{t('taskPage.noComments')}</p>
                )}
              </div>
            </div>

            {/* Task Flow Chart */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <div 
                className={`p-6 cursor-pointer flex items-center justify-between ${collapsedSections.taskFlow ? 'pb-3' : 'pb-0'}`}
                onClick={() => toggleSection('taskFlow')}
              >
                <h3 className="text-sm font-medium text-gray-700 flex items-center">
                  <GitBranch className="h-4 w-4 mr-2" />
                  {t('taskPage.taskFlowChart')}
                </h3>
                {collapsedSections.taskFlow ? (
                  <ChevronDown className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                )}
              </div>
              {!collapsedSections.taskFlow && (
                <div className="px-6 pb-6">
                  <TaskFlowChart 
                    currentTaskId={task?.id || ''} 
                    currentTaskData={task}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Metadata */}
          <div className="space-y-6">
            
            {/* Assignment */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <div 
                className={`p-6 cursor-pointer flex items-center justify-between ${collapsedSections.assignment ? 'pb-3' : 'pb-0'}`}
                onClick={() => toggleSection('assignment')}
              >
                <h3 className="text-sm font-medium text-gray-700 flex items-center">
                  <User className="h-4 w-4 mr-2" />
                  {t('taskPage.assignment')}
                </h3>
                {collapsedSections.assignment ? (
                  <ChevronDown className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                )}
              </div>
              {!collapsedSections.assignment && (
                <div className="px-6 pb-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('labels.assignedTo')}</label>
                  <select
                    value={editedTask.memberId}
                    onChange={(e) => handleTaskUpdate({ memberId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {truncateMemberName(member.name)}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('taskPage.requestedBy')}</label>
                  <select
                    value={editedTask.requesterId}
                    onChange={(e) => handleTaskUpdate({ requesterId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {truncateMemberName(member.name)}
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* Watchers */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('labels.watchers')}</label>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {taskWatchers.map((watcher) => (
                        <span
                          key={watcher.id}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
                        >
                          {watcher.name}
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await handleRemoveWatcher(watcher.id);
                              } catch (error) {
                                console.error('Error removing watcher:', error);
                              }
                            }}
                            className="ml-1 h-3 w-3 rounded-full bg-blue-200 hover:bg-blue-300 flex items-center justify-center"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <select
                      onChange={async (e) => {
                        if (e.target.value) {
                          try {
                            await handleAddWatcher(e.target.value);
                            e.target.value = '';
                          } catch (error) {
                            console.error('Error adding watcher:', error);
                          }
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">{t('taskPage.addWatcher')}</option>
                      {members
                        .filter(member => !taskWatchers.some(w => w.id === member.id))
                        .map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Collaborators */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('labels.collaborators')}</label>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {taskCollaborators.map((collaborator) => (
                        <span
                          key={collaborator.id}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800"
                        >
                          {truncateMemberName(collaborator.name)}
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await handleRemoveCollaborator(collaborator.id);
                              } catch (error) {
                                console.error('Error removing collaborator:', error);
                              }
                            }}
                            className="ml-1 h-3 w-3 rounded-full bg-green-200 hover:bg-green-300 flex items-center justify-center"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <select
                      onChange={async (e) => {
                        if (e.target.value) {
                          try {
                            await handleAddCollaborator(e.target.value);
                            e.target.value = '';
                          } catch (error) {
                            console.error('Error adding collaborator:', error);
                          }
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">{t('taskPage.addCollaborator')}</option>
                      {members
                        .filter(member => !taskCollaborators.some(c => c.id === member.id))
                        .map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>
                </div>
              )}
            </div>

            {/* Priority & Dates */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <div 
                className={`p-6 cursor-pointer flex items-center justify-between ${collapsedSections.schedule ? 'pb-3' : 'pb-0'}`}
                onClick={() => toggleSection('schedule')}
              >
                <h3 className="text-sm font-medium text-gray-700 flex items-center">
                  <Calendar className="h-4 w-4 mr-2" />
                  {t('taskPage.scheduleAndPriority')}
                </h3>
                {collapsedSections.schedule ? (
                  <ChevronDown className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                )}
              </div>
              {!collapsedSections.schedule && (
                <div className="px-6 pb-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('labels.priority')}</label>
                  <select
                    value={editedTask.priorityId || ''}
                    onChange={(e) => {
                      const priorityId = e.target.value ? parseInt(e.target.value) : null;
                      const priority = priorityId ? availablePriorities.find(p => p.id === priorityId) : null;
                      handleTaskUpdate({ 
                        priorityId: priorityId,
                        priority: priority?.priority || null 
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">{t('taskPage.noPriority')}</option>
                    {availablePriorities.map((priority) => (
                      <option key={priority.id} value={priority.id}>
                        {priority.priority}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('labels.startDate')}</label>
                  <input
                    type="date"
                    value={editedTask.startDate || ''}
                    onChange={(e) => handleTaskUpdate({ startDate: e.target.value || null })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('labels.dueDate')}</label>
                  <input
                    type="date"
                    value={editedTask.dueDate || ''}
                    onChange={(e) => handleTaskUpdate({ dueDate: e.target.value || null })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('labels.effort')}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={editedTask.effort || ''}
                    onChange={(e) => handleTaskUpdate({ effort: e.target.value ? parseFloat(e.target.value) : null })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="0.0"
                  />
                </div>
              </div>
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <div 
                className={`p-6 cursor-pointer flex items-center justify-between ${collapsedSections.tags ? 'pb-3' : 'pb-0'}`}
                onClick={() => toggleSection('tags')}
              >
                <h3 className="text-sm font-medium text-gray-700 flex items-center">
                  <Tag className="h-4 w-4 mr-2" />
                  {t('labels.tags')}
                </h3>
                {collapsedSections.tags ? (
                  <ChevronDown className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                )}
              </div>
              {!collapsedSections.tags && (
                <div className="px-6 pb-6">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {taskTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: tag.color || '#6b7280',
                        color: 'white'
                      }}
                    >
                      {tag.tag}
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await handleRemoveTag(tag.id);
                          } catch (error) {
                            console.error('Error removing tag:', error);
                          }
                        }}
                        className="ml-1 h-3 w-3 rounded-full bg-black bg-opacity-20 hover:bg-opacity-30 flex items-center justify-center"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {taskTags.length === 0 && (
                    <p className="text-sm text-gray-500">{t('taskPage.noTagsAssigned')}</p>
                  )}
                </div>
                {availableTags.length > 0 && (
                  <select
                    onChange={async (e) => {
                      if (e.target.value) {
                        try {
                          await handleAddTag(parseInt(e.target.value));
                          e.target.value = '';
                        } catch (error) {
                          console.error('Error adding tag:', error);
                        }
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="">{t('taskPage.addTag')}</option>
                    {availableTags
                      .filter(tag => !taskTags.some(t => t.id === tag.id))
                      .map((tag) => (
                        <option key={tag.id} value={tag.id}>
                          {tag.tag}
                        </option>
                      ))}
                  </select>
                )}
              </div>
                </div>
              )}
            </div>

            {/* Task Association */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <div 
                className={`p-6 cursor-pointer flex items-center justify-between ${collapsedSections.associations ? 'pb-3' : 'pb-0'}`}
                onClick={() => toggleSection('associations')}
              >
                <h3 className="text-sm font-medium text-gray-700 flex items-center">
                  <Users className="h-4 w-4 mr-2" />
                  {t('taskPage.taskAssociation')}
                </h3>
                {collapsedSections.associations ? (
                  <ChevronDown className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                )}
              </div>
              {!collapsedSections.associations && (
                <div className="px-6 pb-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Parent Field - Left Side */}
                  {parentTask && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t('taskPage.parent')}:</label>
                      <span 
                        onClick={() => {
                          const url = generateTaskUrl(parentTask.ticket, parentTask.projectId);
                          console.log('🔗 TaskPage Parent URL:', { 
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
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('taskPage.children')}:</label>
                    
                    {/* Selected Children Display */}
                    {childTasks.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1">
                        {childTasks.map(child => (
                          <span
                            key={child.id}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 hover:opacity-80 transition-opacity"
                          >
                            <span 
                              onClick={() => {
                                const url = generateTaskUrl(child.ticket, child.projectId);
                                console.log('🔗 TaskPage Child URL:', { 
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
                              title={t('taskPage.removeChildTask')}
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
                        className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent flex items-center justify-between text-gray-900 dark:text-gray-100"
                      >
                        <span className="text-gray-700 dark:text-gray-200">
                          {t('taskPage.addChildTask')}
                        </span>
                        <ChevronDown size={16} className={`transform transition-transform ${showChildrenDropdown ? 'rotate-180' : ''}`} />
                      </button>
                      
                      {showChildrenDropdown && (
                        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-auto">
                          {/* Search Input */}
                          <div className="p-2 border-b border-gray-200">
                            <input
                              type="text"
                              placeholder={t('taskPage.searchTasks')}
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
                                {childrenSearchTerm ? t('taskPage.noTasksFound') : t('taskPage.noAvailableTasks')}
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
              )}
            </div>


            {/* Task Info */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <div 
                className={`p-6 cursor-pointer flex items-center justify-between ${collapsedSections.taskInfo ? 'pb-3' : 'pb-0'}`}
                onClick={() => toggleSection('taskInfo')}
              >
                <h3 className="text-sm font-medium text-gray-700">{t('taskPage.taskInformation')}</h3>
                {collapsedSections.taskInfo ? (
                  <ChevronDown className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                )}
              </div>
              {!collapsedSections.taskInfo && (
                <div className="px-6 pb-6">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('taskPage.taskId')}:</span>
                  <span className="font-mono text-gray-900">{taskId}</span>
                </div>
                {getProjectIdentifier() && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t('taskPage.project')}:</span>
                    <span className="font-mono text-gray-900">{getProjectIdentifier()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('taskPage.status')}:</span>
                  <span className="capitalize text-gray-900">{editedTask.status || t('taskPage.unknown')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('labels.created')}:</span>
                  <span className="text-gray-900">
                    {editedTask.created_at ? new Date(editedTask.created_at).toLocaleDateString() : 
                     editedTask.createdAt ? new Date(editedTask.createdAt).toLocaleDateString() : t('taskPage.unknown')}
                  </span>
                </div>
                {(editedTask.updated_at || editedTask.updatedAt) && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t('labels.updated')}:</span>
                    <span className="text-gray-900">
                      {editedTask.updated_at ? new Date(editedTask.updated_at).toLocaleDateString() :
                       editedTask.updatedAt ? new Date(editedTask.updatedAt).toLocaleDateString() : t('taskPage.unknown')}
                    </span>
                  </div>
                )}
              </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Manager */}
      <ModalManager
        selectedTask={null} // TaskPage doesn't use task details modal
        members={members}
        onTaskClose={() => {}} // Not applicable for TaskPage
        onTaskUpdate={async () => {}} // Not applicable for TaskPage
        showHelpModal={showHelpModal}
        onHelpClose={() => setShowHelpModal(false)}
        showProfileModal={showProfileModal}
        currentUser={currentUser}
        onProfileClose={() => {
          setShowProfileModal(false);
          setIsProfileBeingEdited(false);
        }}
        onProfileUpdated={handleProfileUpdated}
        isProfileBeingEdited={isProfileBeingEdited}
        onProfileEditingChange={setIsProfileBeingEdited}
        onActivityFeedToggle={handleActivityFeedToggle}
        siteSettings={siteSettings}
        boards={boards}
      />
    </div>
  );
}
