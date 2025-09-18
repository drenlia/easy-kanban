import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, ChevronDown, Check } from 'lucide-react';
import { Task, Priority, TeamMember, Tag, PriorityOption } from '../types';
import { getAllTags, getTaskTags, addTagToTask, removeTagFromTask, getAllPriorities, getTaskWatchers, addWatcherToTask, removeWatcherFromTask, getTaskCollaborators, addCollaboratorToTask, removeCollaboratorFromTask, fetchTaskAttachments, addTaskAttachments, uploadFile, deleteAttachment } from '../api';
import { formatToYYYYMMDD, formatToYYYYMMDDHHmm } from '../utils/dateUtils';
import TextEditor from './TextEditor';
import websocketClient from '../services/websocketClient';
import { mergeTaskTagsWithLiveData, getTagDisplayStyle } from '../utils/tagUtils';

interface QuickEditModalProps {
  task: Task;
  members: TeamMember[];
  onClose: () => void;
  onSave: (task: Task) => void;
}

export default function QuickEditModal({ task, members, onClose, onSave }: QuickEditModalProps) {
  const [editedTask, setEditedTask] = useState(task);
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
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);

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
    console.log('Dropdown position calc:', {
      spaceAbove,
      spaceBelow,
      dropdownHeight,
      buttonTop: buttonRect.top,
      buttonBottom: buttonRect.bottom,
      viewportHeight
    });
    
    // Prefer going up if there's enough space (more aggressive preference for upward)
    if (spaceAbove >= dropdownHeight) {
      console.log('Going above - enough space');
      return 'above';
    }
    
    console.log('Going below - not enough space above');
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
        console.log('✅ Loaded', currentAttachments?.length || 0, 'attachments for task', task.id);
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
        console.log('✅ Attachments saved successfully');
      }
      
      // Include current tags in the saved task
      onSave({ ...editedTask, tags: taskTags });
      onClose();
    } catch (error) {
      console.error('❌ Failed to save task with attachments:', error);
      // Still save the task even if attachments fail
      onSave({ ...editedTask, tags: taskTags });
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
    setPendingAttachments(attachments);
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
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-xl w-[691px] max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Quick Edit Task</h3>
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
              Title
            </label>
            <input
              type="text"
              value={editedTask.title}
              onChange={e => setEditedTask(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border rounded-md"
              required
            />
          </div>

          {/* Description - using TextEditor for rich text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
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
              placeholder="Enter task description..."
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
              Watchers
            </label>
            <div className="relative" ref={watchersDropdownRef}>
              <button
                ref={watchersButtonRef}
                type="button"
                onClick={handleWatchersDropdownToggle}
                className="w-full px-3 py-2 border rounded-md bg-white text-left flex items-center justify-between hover:bg-gray-50"
              >
                <span className="text-gray-700">
                  {taskWatchers.length === 0 ? 'Select watchers...' : `${taskWatchers.length} watcher${taskWatchers.length !== 1 ? 's' : ''} selected`}
                </span>
                <ChevronDown className="w-4 h-4" />
              </button>
              
              {showWatchersDropdown && (
                <div 
                  className={`absolute z-50 w-full bg-white border rounded-md shadow-lg overflow-y-auto ${
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
              >
                <span className="text-gray-700">
                  {taskCollaborators.length === 0 ? 'Select collaborators...' : `${taskCollaborators.length} collaborator${taskCollaborators.length !== 1 ? 's' : ''} selected`}
                </span>
                <ChevronDown className="w-4 h-4" />
              </button>
              
              {showCollaboratorsDropdown && (
                <div 
                  className={`absolute z-50 w-full bg-white border rounded-md shadow-lg overflow-y-auto ${
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
                      title="Remove collaborator"
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
                Start Date
              </label>
              <input
                type="date"
                value={formatDateForInput(editedTask.startDate)}
                onChange={handleDateChange}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={formatDateForInput(editedTask.dueDate || '')}
                onChange={handleDueDateChange}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
          </div>

          {/* Bottom row: Assigned to (left) and Effort (right) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assigned To
              </label>
              <select
                value={editedTask.memberId}
                onChange={e => setEditedTask(prev => ({ ...prev, memberId: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md"
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
                Effort (hours)
              </label>
              <input
                type="number"
                min="0"
                value={editedTask.effort}
                onChange={e => setEditedTask(prev => ({ ...prev, effort: Number(e.target.value) }))}
                className="w-full px-3 py-2 border rounded-md"
              />
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
                      title="Remove tag"
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
              Priority
            </label>
            <select
              value={editedTask.priority}
              onChange={e => setEditedTask(prev => ({ ...prev, priority: e.target.value as Priority }))}
              className="w-full px-3 py-2 border rounded-md"
            >
              {availablePriorities.map(priority => (
                <option key={priority.id} value={priority.priority}>
                  {priority.priority}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 flex-shrink-0 border-t pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}