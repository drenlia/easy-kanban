import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ChevronDown, Check, Plus } from 'lucide-react';
import { Task, Priority, TeamMember, Tag, PriorityOption } from '../types';
import { getAllTags, getTaskTags, addTagToTask, removeTagFromTask, getAllPriorities, getTaskWatchers, addWatcherToTask, removeWatcherFromTask, getTaskCollaborators, addCollaboratorToTask, removeCollaboratorFromTask, fetchTaskAttachments, deleteAttachment } from '../api';
import { formatToYYYYMMDD, formatToYYYYMMDDHHmm } from '../utils/dateUtils';
import TextEditor from './TextEditor';
import websocketClient from '../services/websocketClient';
import { mergeTaskTagsWithLiveData, getTagDisplayStyle } from '../utils/tagUtils';
import { useFileUpload } from '../hooks/useFileUpload';
import AddTagModal from './AddTagModal';

interface QuickEditModalProps {
  task: Task;
  members: TeamMember[];
  onClose: () => void;
  onSave: (task: Task) => void;
  siteSettings?: { [key: string]: string };
}

export default function QuickEditModal({ task, members, onClose, onSave, siteSettings }: QuickEditModalProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const [editedTask, setEditedTask] = useState(task);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [taskTags, setTaskTags] = useState<Tag[]>([]);
  const [showTagsDropdown, setShowTagsDropdown] = useState(false);
  const [showAddTagModal, setShowAddTagModal] = useState(false);
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
  const watchersButtonRef = useRef<HTMLButtonElement>(null);
  const collaboratorsButtonRef = useRef<HTMLButtonElement>(null);
  const tagsButtonRef = useRef<HTMLButtonElement>(null);
  
  // State for dropdown positioning
  const [watchersDropdownPosition, setWatchersDropdownPosition] = useState<'above' | 'below'>('below');
  const [collaboratorsDropdownPosition, setCollaboratorsDropdownPosition] = useState<'above' | 'below'>('below');
  const [tagsDropdownPosition, setTagsDropdownPosition] = useState<'above' | 'below'>('below');
  
  // Task attachments state
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
    
    
    // Prefer going up if there's enough space (more aggressive preference for upward)
    if (spaceAbove >= dropdownHeight) {
      return 'above';
    }
    
    return 'below';
  };

  // Load available tags, task tags, watchers, and collaborators on mount
  useEffect(() => {
    const loadTaskData = async () => {
      try {
        setIsLoadingTags(true);
        const [allTags, currentTaskTags, allPriorities, currentWatchers, currentCollaborators, currentAttachments] = await Promise.all([
          getAllTags(),
          getTaskTags(task.id),
          getAllPriorities(),
          getTaskWatchers(task.id),
          getTaskCollaborators(task.id),
          fetchTaskAttachments(task.id)
        ]);
        setAvailableTags(allTags || []);
        setTaskTags(currentTaskTags || []);
        setAvailablePriorities(allPriorities || []);
        setTaskWatchers(currentWatchers || []);
        setTaskCollaborators(currentCollaborators || []);
        setTaskAttachments(currentAttachments || []);
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

  // WebSocket event listeners for real-time updates
  useEffect(() => {
    // Tag management event handlers
    const handleTagCreated = async (data: any) => {
      console.log('📨 QuickEditModal: Tag created via WebSocket:', data);
      try {
        const tags = await getAllTags();
        setAvailableTags(tags);
        console.log('📨 QuickEditModal: Tags refreshed after creation');
      } catch (error) {
        console.error('Failed to refresh tags after creation:', error);
      }
    };

    const handleTagUpdated = async (data: any) => {
      console.log('📨 QuickEditModal: Tag updated via WebSocket:', data);
      try {
        const tags = await getAllTags();
        setAvailableTags(tags);
        console.log('📨 QuickEditModal: Tags refreshed after update');
      } catch (error) {
        console.error('Failed to refresh tags after update:', error);
      }
    };

    const handleTagDeleted = async (data: any) => {
      console.log('📨 QuickEditModal: Tag deleted via WebSocket:', data);
      try {
        const tags = await getAllTags();
        setAvailableTags(tags);
        console.log('📨 QuickEditModal: Tags refreshed after deletion');
      } catch (error) {
        console.error('Failed to refresh tags after deletion:', error);
      }
    };

    // Priority management event handlers
    const handlePriorityCreated = async (data: any) => {
      console.log('📨 QuickEditModal: Priority created via WebSocket:', data);
      try {
        const priorities = await getAllPriorities();
        setAvailablePriorities(priorities);
        console.log('📨 QuickEditModal: Priorities refreshed after creation');
      } catch (error) {
        console.error('Failed to refresh priorities after creation:', error);
      }
    };

    const handlePriorityUpdated = async (data: any) => {
      console.log('📨 QuickEditModal: Priority updated via WebSocket:', data);
      try {
        const priorities = await getAllPriorities();
        setAvailablePriorities(priorities);
        console.log('📨 QuickEditModal: Priorities refreshed after update');
      } catch (error) {
        console.error('Failed to refresh priorities after update:', error);
      }
    };

    const handlePriorityDeleted = async (data: any) => {
      console.log('📨 QuickEditModal: Priority deleted via WebSocket:', data);
      try {
        const priorities = await getAllPriorities();
        setAvailablePriorities(priorities);
        console.log('📨 QuickEditModal: Priorities refreshed after deletion');
      } catch (error) {
        console.error('Failed to refresh priorities after deletion:', error);
      }
    };

    const handlePriorityReordered = async (data: any) => {
      console.log('📨 QuickEditModal: Priority reordered via WebSocket:', data);
      try {
        const priorities = await getAllPriorities();
        setAvailablePriorities(priorities);
        console.log('📨 QuickEditModal: Priorities refreshed after reorder');
      } catch (error) {
        console.error('Failed to refresh priorities after reorder:', error);
      }
    };

    // Register WebSocket event listeners
    websocketClient.onTagCreated(handleTagCreated);
    websocketClient.onTagUpdated(handleTagUpdated);
    websocketClient.onTagDeleted(handleTagDeleted);
    websocketClient.onPriorityCreated(handlePriorityCreated);
    websocketClient.onPriorityUpdated(handlePriorityUpdated);
    websocketClient.onPriorityDeleted(handlePriorityDeleted);
    websocketClient.onPriorityReordered(handlePriorityReordered);

    // Cleanup function
    return () => {
      websocketClient.offTagCreated(handleTagCreated);
      websocketClient.offTagUpdated(handleTagUpdated);
      websocketClient.offTagDeleted(handleTagDeleted);
      websocketClient.offPriorityCreated(handlePriorityCreated);
      websocketClient.offPriorityUpdated(handlePriorityUpdated);
      websocketClient.offPriorityDeleted(handlePriorityDeleted);
      websocketClient.offPriorityReordered(handlePriorityReordered);
    };
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

  const handleTagCreated = async (newTag: Tag) => {
    // Add the new tag to available tags list
    setAvailableTags(prev => [...prev, newTag].sort((a, b) => a.tag.localeCompare(b.tag)));
    // Automatically add it to the current task
    try {
      await addTagToTask(task.id, newTag.id);
      setTaskTags(prev => [...prev, newTag]);
    } catch (error) {
      console.error('Failed to add new tag to task:', error);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Process pending attachments if any
      if (pendingAttachments.length > 0) {
        console.log('📎 Uploading', pendingAttachments.length, 'attachments...');
        
        // Use the new upload utility
        const uploadedAttachments = await uploadTaskFiles(task.id, {
          currentTaskAttachments: taskAttachments,
          onTaskAttachmentsUpdate: (updatedAttachments) => {
            console.log('🔄 Updating taskAttachments with:', updatedAttachments.length, 'attachments');
            setTaskAttachments(updatedAttachments);
          },
          onSuccess: (attachments) => {
            console.log('✅ Attachments saved successfully:', attachments.length, 'files');
          },
          onError: (error) => {
            console.error('❌ Failed to upload attachments:', error);
          }
        });
        
        console.log('📎 Upload completed, got:', uploadedAttachments.length, 'attachments');
      }
      
      // Include current tags and updated attachment count in the saved task
      onSave({ 
        ...editedTask, 
        tags: taskTags,
        attachmentCount: taskAttachments.length
      });
      onClose();
    } catch (error) {
      console.error('❌ Failed to save task with attachments:', error);
      // Still save the task even if attachments fail
      onSave({ 
        ...editedTask, 
        tags: taskTags,
        attachmentCount: taskAttachments.length
      });
      onClose();
    }
  };

  const handleDueDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const localDate = e.target.value;
    setEditedTask(prev => ({ ...prev, dueDate: localDate }));
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Ensure the date is stored in YYYY-MM-DD format without timezone conversion
    const localDate = e.target.value;
    setEditedTask(prev => ({ ...prev, startDate: localDate }));
  };

  const formatDateTime = (dateString: string) => formatToYYYYMMDDHHmm(dateString);
  const formatDateForInput = (dateString: string) => {
    if (!dateString) return '';
    return dateString.split(' ')[0]; // This will take only the date part
  };

  // Handle attachment changes from TextEditor
  const handleAttachmentsChange = (attachments: File[]) => {
    // Clear existing files and add new ones
    clearFiles();
    addFiles(attachments);
  };

  // Handle immediate attachment deletion
  const handleAttachmentDelete = async (attachmentId: string) => {
    try {
      await deleteAttachment(attachmentId);
      // Remove from local state
      setTaskAttachments(prev => prev.filter(att => att.id !== attachmentId));
      console.log('✅ Attachment deleted successfully');
    } catch (error) {
      console.error('❌ Failed to delete attachment:', error);
      throw error; // Re-throw to let TextEditor handle the error
    }
  };

  // Combine existing and pending attachments for display (memoized to prevent excessive re-renders)
  const displayAttachments = useMemo(() => [
    ...taskAttachments,
    ...pendingAttachments.map(file => ({
      id: `pending-${file.name}-${file.size}`,
      name: file.name,
      url: '',
      type: file.type,
      size: file.size
    }))
  ], [taskAttachments, pendingAttachments]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-[691px] max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('quickEditModal.title')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div 
          className="flex-1 overflow-y-auto space-y-4 pr-2"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#CBD5E1 #F1F5F9'
          }}
        >
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('labels.title', { ns: 'common' })}
            </label>
            <input
              type="text"
              value={editedTask.title}
              onChange={e => setEditedTask(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
              required
            />
          </div>

          {/* Description - using TextEditor for rich text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('labels.description')}
            </label>
            <TextEditor
              onSubmit={async () => {
                // No-op since we're using onChange and onAttachmentsChange instead
              }}
              onChange={(content) => {
                setEditedTask(prev => ({ ...prev, description: content }));
              }}
              onAttachmentsChange={handleAttachmentsChange}
              onAttachmentDelete={handleAttachmentDelete}
              initialContent={editedTask.description}
              placeholder={t('placeholders.enterDescription')}
              minHeight="150px"
              showSubmitButtons={false}
              showAttachments={true}
              attachmentContext="task"
              attachmentParentId={task.id}
              existingAttachments={displayAttachments}
              toolbarOptions={{
                bold: true,
                italic: true,
                underline: true,
                link: true,
                lists: true,
                alignment: false,
                attachments: true
              }}
              allowImagePaste={true}
              allowImageDelete={true}
              allowImageResize={true}
              className="w-full"
            />
          </div>

          {/* Watchers Section */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('labels.watchers')}
            </label>
            <div className="relative" ref={watchersDropdownRef}>
              <button
                ref={watchersButtonRef}
                type="button"
                onClick={handleWatchersDropdownToggle}
                className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-left flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                <span className="text-gray-700 dark:text-gray-200">
                  {taskWatchers.length === 0 
                    ? t('labels.selectWatchers')
                    : `${taskWatchers.length} ${taskWatchers.length !== 1 ? t('watcher.plural') : t('watcher.singular')} ${t('tag.selected')}`
                  }
                </span>
                <ChevronDown className="w-4 h-4" />
              </button>
              
              {showWatchersDropdown && (
                <div 
                  className={`absolute z-50 w-full bg-white dark:bg-gray-800 border rounded-md shadow-lg overflow-y-auto ${
                    watchersDropdownPosition === 'above' 
                      ? 'bottom-full mb-1' 
                      : 'top-full mt-1'
                  }`}
                  style={{
                    maxHeight: `${Math.min(192, Math.max(64, members.length * 40 + 8))}px` // 40px per member + 8px padding, min 64px, max 192px
                  }}
                >
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
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:opacity-80 transition-opacity"
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
                      title={t('remove.watcher')}
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
              {t('labels.collaborators')}
            </label>
            <div className="relative" ref={collaboratorsDropdownRef}>
              <button
                ref={collaboratorsButtonRef}
                type="button"
                onClick={handleCollaboratorsDropdownToggle}
                className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-left flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                <span className="text-gray-700 dark:text-gray-200">
                  {taskCollaborators.length === 0 
                    ? t('labels.selectCollaborators')
                    : `${taskCollaborators.length} ${taskCollaborators.length !== 1 ? t('collaborator.plural') : t('collaborator.singular')} ${t('tag.selected')}`
                  }
                </span>
                <ChevronDown className="w-4 h-4" />
              </button>
              
              {showCollaboratorsDropdown && (
                <div 
                  className={`absolute z-50 w-full bg-white dark:bg-gray-800 border rounded-md shadow-lg overflow-y-auto ${
                    collaboratorsDropdownPosition === 'above' 
                      ? 'bottom-full mb-1' 
                      : 'top-full mt-1'
                  }`}
                  style={{
                    maxHeight: `${Math.min(192, Math.max(64, members.length * 40 + 8))}px` // 40px per member + 8px padding, min 64px, max 192px
                  }}
                >
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
                      title={t('remove.collaborator')}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>


          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('labels.startDate')}
              </label>
              <input
                type="date"
                value={formatDateForInput(editedTask.startDate)}
                onChange={handleDateChange}
                className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('labels.dueDate')}
              </label>
              <input
                type="date"
                value={formatDateForInput(editedTask.dueDate || '')}
                onChange={handleDueDateChange}
                className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          {/* Bottom row: Assigned to (left) and Effort (right) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('labels.assignedTo')}
              </label>
              <select
                value={editedTask.memberId}
                onChange={e => setEditedTask(prev => ({ ...prev, memberId: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
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
                {t('labels.effort')}
              </label>
              <input
                type="number"
                min="0"
                value={editedTask.effort}
                onChange={e => setEditedTask(prev => ({ ...prev, effort: Number(e.target.value) }))}
                className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          {/* Tags Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('labels.tags')}</label>
            <div className="relative" ref={tagsDropdownRef}>
              <button
                ref={tagsButtonRef}
                type="button"
                onClick={handleTagsDropdownToggle}
                className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent flex items-center justify-between text-gray-900 dark:text-gray-100"
              >
                <span className="text-gray-700 dark:text-gray-200">
                  {taskTags.length === 0 
                    ? t('labels.selectTags')
                    : `${taskTags.length} ${taskTags.length !== 1 ? t('tag.plural') : t('tag.singular')} ${t('tag.selected')}`
                  }
                </span>
                <ChevronDown size={14} className="text-gray-400" />
              </button>
              
              {showTagsDropdown && (
                <div className={`absolute left-0 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-lg z-10 w-full max-h-[400px] overflow-y-auto ${
                  tagsDropdownPosition === 'above' 
                    ? 'bottom-full mb-1' 
                    : 'top-full mt-1'
                }`}>
                  {/* Add Tag Button */}
                  <div 
                    onClick={() => {
                      setShowAddTagModal(true);
                      setShowTagsDropdown(false);
                    }}
                    className="px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer flex items-center gap-2 text-sm border-b border-gray-200 dark:border-gray-700 text-blue-600 dark:text-blue-400 font-medium sticky top-0 bg-white dark:bg-gray-800"
                  >
                    <Plus size={14} />
                    <span>{t('labels.addNewTag')}</span>
                  </div>
                  
                  {isLoadingTags ? (
                    <div className="px-3 py-2 text-sm text-gray-500">{t('labels.loadingTags')}</div>
                  ) : availableTags.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">{t('labels.noTagsAvailable')}</div>
                  ) : (
                    availableTags.map(tag => (
                      <div
                        key={tag.id}
                        onClick={() => toggleTag(tag)}
                        className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2 text-sm"
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
                        <span className="text-gray-700 dark:text-gray-200">{tag.tag}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            
            {/* Selected Tags Display */}
            {taskTags.length > 0 && (() => {
              // Merge task tags with live tag data to get updated colors
              const liveTags = mergeTaskTagsWithLiveData(taskTags, availableTags);
              
              return (
                <div className="mt-2 flex flex-wrap gap-1">
                  {liveTags.map(tag => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full font-medium hover:opacity-80 transition-opacity"
                      style={getTagDisplayStyle(tag)}
                  >
                    {tag.tag}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        toggleTag(tag);
                      }}
                      className="ml-1 hover:bg-red-500 hover:text-white rounded-full w-3 h-3 flex items-center justify-center text-xs font-bold transition-colors"
                      title={t('remove.tag')}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              );
            })()}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('labels.priority')}
            </label>
            <select
              value={editedTask.priorityId || ''}
              onChange={e => {
                const priorityId = e.target.value ? parseInt(e.target.value) : null;
                const priority = priorityId ? availablePriorities.find(p => p.id === priorityId) : null;
                setEditedTask(prev => ({ 
                  ...prev, 
                  priorityId: priorityId,
                  priority: priority?.priority || null 
                }));
              }}
              className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
            >
              <option value="">{t('taskPage.noPriority')}</option>
              {availablePriorities.map(priority => (
                <option key={priority.id} value={priority.id}>
                  {priority.priority}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Upload error display */}
        {uploadError && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <div className="text-sm text-red-600 dark:text-red-400">
              {t('errors.uploadError')}: {uploadError}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6 flex-shrink-0 border-t pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
          >
            {t('buttons.cancel', { ns: 'common' })}
          </button>
          <button
            type="submit"
            disabled={isUploadingAttachments}
            className={`px-4 py-2 rounded-md ${
              isUploadingAttachments
                ? 'bg-gray-400 cursor-not-allowed text-white'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {isUploadingAttachments ? t('column.saving') : t('comments.saveChanges')}
          </button>
        </div>
      </form>
      
      {/* Add Tag Modal */}
      {showAddTagModal && (
        <AddTagModal
          onClose={() => setShowAddTagModal(false)}
          onTagCreated={handleTagCreated}
        />
      )}
    </div>
  );
}