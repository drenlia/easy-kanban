import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronDown, Check } from 'lucide-react';
import { Task, Priority, TeamMember, Tag, PriorityOption } from '../types';
import { getAllTags, getTaskTags, addTagToTask, removeTagFromTask, getAllPriorities } from '../api';
import { formatToYYYYMMDD, formatToYYYYMMDDHHmm } from '../utils/dateUtils';

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

  // Load available tags and task tags on mount
  useEffect(() => {
    const loadTagData = async () => {
      try {
        setIsLoadingTags(true);
        const [allTags, currentTaskTags, allPriorities] = await Promise.all([
          getAllTags(),
          getTaskTags(task.id),
          getAllPriorities()
        ]);
        setAvailableTags(allTags || []);
        setTaskTags(currentTaskTags || []);
        setAvailablePriorities(allPriorities || []);
      } catch (error) {
        console.error('Failed to load tag data:', error);
      } finally {
        setIsLoadingTags(false);
      }
    };
    
    loadTagData();
  }, [task.id]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tagsDropdownRef.current && !tagsDropdownRef.current.contains(event.target as Node)) {
        setShowTagsDropdown(false);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Include current tags in the saved task
    onSave({ ...editedTask, tags: taskTags });
    onClose();
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-xl w-96">
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

        <div className="space-y-4">
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
              Description
            </label>
            <textarea
              value={editedTask.description}
              onChange={e => setEditedTask(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border rounded-md"
              rows={3}
            />
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
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border"
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
                  </span>
                ))}
              </div>
            )}
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

        <div className="flex justify-end gap-3 mt-6">
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