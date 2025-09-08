import { useState, useEffect, useRef, useCallback } from 'react';
import { Task, TeamMember, Comment, Attachment, Tag, PriorityOption, CurrentUser } from '../types';
import { createComment, uploadFile, updateTask, deleteComment, updateComment, fetchCommentAttachments, getAllTags, getTaskTags, addTagToTask, removeTagFromTask, getAllPriorities, addWatcherToTask, removeWatcherFromTask, addCollaboratorToTask, removeCollaboratorFromTask, fetchTaskAttachments, addTaskAttachments, deleteAttachment } from '../api';
import { getLocalISOString, formatToYYYYMMDDHHmmss } from '../utils/dateUtils';
import { generateUUID } from '../utils/uuid';

interface UseTaskDetailsProps {
  task: Task;
  members: TeamMember[];
  currentUser: CurrentUser | null;
  onUpdate: (updatedTask: Task) => void;
  siteSettings?: { [key: string]: string };
  boards?: any[];
}

export const useTaskDetails = ({ task, members, currentUser, onUpdate, siteSettings, boards }: UseTaskDetailsProps) => {
  // Get project identifier from the board this task belongs to
  const getProjectIdentifier = () => {
    if (!boards || !task.boardId) return null;
    const board = boards.find(b => b.id === task.boardId);
    return board?.project || null;
  };

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
          ? comment.attachments.map(att => ({
              id: att.id,
              name: att.name,
              url: att.url,
              commentId: comment.id,
              size: att.size || 0,
              uploadedAt: att.uploadedAt || new Date().toISOString()
            }))
          : []
      }))
  }));

  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [newComment, setNewComment] = useState('');
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editedCommentText, setEditedCommentText] = useState('');
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [taskTags, setTaskTags] = useState<Tag[]>([]);
  const [availablePriorities, setAvailablePriorities] = useState<PriorityOption[]>([]);
  const [taskAttachments, setTaskAttachments] = useState<Attachment[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<{ file: File; tempId: string }[]>([]);
  const [commentAttachments, setCommentAttachments] = useState<{ [commentId: string]: Attachment[] }>({});
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load task data
  const loadTaskData = useCallback(async () => {
    try {
      // Load tags
      const [allTags, taskTagsResponse] = await Promise.all([
        getAllTags(),
        getTaskTags(task.id)
      ]);
      setAvailableTags(allTags);
      setTaskTags(taskTagsResponse);

      // Load priorities
      const priorities = await getAllPriorities();
      setAvailablePriorities(priorities);

      // Load task attachments
      const attachments = await fetchTaskAttachments(task.id);
      const filteredAttachments = attachments.filter((att: Attachment) => att && att.id && att.name && att.url);
      setTaskAttachments(filteredAttachments);

      // Fix any remaining blob URLs in the description
      const currentDescription = editedTask.description;
      if (currentDescription && currentDescription.includes('blob:') && filteredAttachments.length > 0) {
        let fixedDescription = currentDescription;
        filteredAttachments.forEach(attachment => {
          if (attachment.name.startsWith('img-')) {
            const blobPattern = new RegExp(`blob:[^"]*#${attachment.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
            fixedDescription = fixedDescription.replace(blobPattern, attachment.url);
          }
        });
        
        if (fixedDescription !== currentDescription) {
          setEditedTask(prev => ({ ...prev, description: fixedDescription }));
          // Save the fixed description
          const updatedTask = { ...editedTask, description: fixedDescription };
          saveImmediately(updatedTask);
        }
      }

      // Load comment attachments
      const commentAttachmentsMap: { [commentId: string]: Attachment[] } = {};
      for (const comment of editedTask.comments || []) {
        if (comment.id) {
          try {
            const attachments = await fetchCommentAttachments(comment.id);
            commentAttachmentsMap[comment.id] = attachments;
          } catch (error) {
            console.warn(`Failed to load attachments for comment ${comment.id}:`, error);
            commentAttachmentsMap[comment.id] = [];
          }
        }
      }
      setCommentAttachments(commentAttachmentsMap);
    } catch (error) {
      console.error('Error loading task data:', error);
    }
  }, [task.id, editedTask.description]);

  // Debounced save function
  const debouncedSave = useCallback((taskToSave: Task) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (isSaving) return;
      
      try {
        setIsSaving(true);
        await updateTask(taskToSave);
        setLastSaved(new Date());
        onUpdate(taskToSave);
        setHasChanges(false);
      } catch (error) {
        console.error('Error saving task:', error);
      } finally {
        setIsSaving(false);
      }
    }, 1000);
  }, [isSaving, onUpdate]);

  // Immediate save function
  const saveImmediately = useCallback(async (taskToSave: Task) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    try {
      setIsSaving(true);
      await updateTask(taskToSave);
      setLastSaved(new Date());
      onUpdate(taskToSave);
      setHasChanges(false);
    } catch (error) {
      console.error('Error saving task:', error);
    } finally {
      setIsSaving(false);
    }
  }, [onUpdate]);

  // Handle task field updates
  const handleTaskUpdate = useCallback((updates: Partial<Task>) => {
    const updatedTask = { ...editedTask, ...updates };
    setEditedTask(updatedTask);
    setHasChanges(true);
    debouncedSave(updatedTask);
  }, [editedTask, debouncedSave]);

  // Handle attachment changes
  const handleAttachmentChange = useCallback((files: { file: File; tempId: string }[]) => {
    setPendingAttachments(files);
    
    if (files.length > 0) {
      // Save immediately when attachments are pending
      saveImmediately(editedTask);
    }
  }, [editedTask, saveImmediately]);

  // Handle image removal
  const handleImageRemoval = useCallback((filename: string) => {
    setPendingAttachments(prev => prev.filter(att => att.file.name !== filename));
    setTaskAttachments(prev => prev.filter(att => att.name !== filename));
  }, []);

  // Handle attachment deletion
  const handleAttachmentDelete = useCallback(async (attachment: Attachment) => {
    try {
      await deleteAttachment(attachment.id);
      
      // Remove from both arrays
      setPendingAttachments(prev => prev.filter(att => att.file.name !== attachment.name));
      setTaskAttachments(prev => prev.filter(att => att.id !== attachment.id));
    } catch (error) {
      console.error('Error deleting attachment:', error);
    }
  }, []);

  // Upload attachments
  useEffect(() => {
    const uploadAttachments = async () => {
      if (pendingAttachments.length === 0 || isUploadingAttachments) return;

      try {
        setIsUploadingAttachments(true);
        
        const uploadPromises = pendingAttachments.map(({ file }) => uploadFile(file));
        const uploadedFiles = await Promise.all(uploadPromises);
        
        // Update description with server URLs
        let updatedDescription = editedTask.description;
        uploadedFiles.forEach((uploadedFile, index) => {
          const originalFile = pendingAttachments[index].file;
          if (originalFile.name.startsWith('img-') && updatedDescription) {
            const blobPattern = new RegExp(`blob:[^"]*#${originalFile.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
            updatedDescription = updatedDescription.replace(blobPattern, uploadedFile.url);
          }
        });
        
        if (updatedDescription !== editedTask.description) {
          setEditedTask(prev => ({ ...prev, description: updatedDescription }));
        }

        // Add uploaded attachments to task
        for (let i = 0; i < uploadedFiles.length; i++) {
          const uploadedFile = uploadedFiles[i];
          await addTaskAttachments(task.id, [uploadedFile.id]);
          setTaskAttachments(prev => [...prev, uploadedFile]);
        }

        // Clear pending attachments
        setPendingAttachments([]);
        
        // Save the updated task
        const finalTask = { ...editedTask, description: updatedDescription };
        await saveImmediately(finalTask);
        
      } catch (error) {
        console.error('Error uploading attachments:', error);
      } finally {
        setIsUploadingAttachments(false);
      }
    };

    uploadAttachments();
  }, [pendingAttachments, isUploadingAttachments, editedTask, task.id, saveImmediately]);

  // Load initial data
  useEffect(() => {
    loadTaskData();
  }, [loadTaskData]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    editedTask,
    setEditedTask,
    hasChanges,
    isSaving,
    lastSaved,
    newComment,
    setNewComment,
    isAddingComment,
    setIsAddingComment,
    editingCommentId,
    setEditingCommentId,
    editedCommentText,
    setEditedCommentText,
    availableTags,
    taskTags,
    setTaskTags,
    availablePriorities,
    taskAttachments,
    pendingAttachments,
    commentAttachments,
    isUploadingAttachments,
    getProjectIdentifier,
    handleTaskUpdate,
    handleAttachmentChange,
    handleImageRemoval,
    handleAttachmentDelete,
    saveImmediately,
    loadTaskData
  };
};
