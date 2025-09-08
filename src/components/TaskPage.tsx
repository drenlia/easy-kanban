import React, { useState, useEffect } from 'react';
import { useTaskDetails } from '../hooks/useTaskDetails';
import { Task, TeamMember, CurrentUser } from '../types';
import { ArrowLeft, Save, Clock, User, Calendar, AlertCircle, Tag, Users, Paperclip } from 'lucide-react';
import { parseTaskRoute } from '../utils/routingUtils';
import { getTaskById, getMembers, getBoards } from '../api';
import TextEditor from './TextEditor';
import DOMPurify from 'dompurify';

interface TaskPageProps {
  currentUser: CurrentUser | null;
  siteSettings?: { [key: string]: string };
}

export default function TaskPage({ currentUser, siteSettings }: TaskPageProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [boards, setBoards] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Parse the task route to get task ID
  const taskRoute = parseTaskRoute();
  const taskId = taskRoute.taskId;

  // Load task data
  useEffect(() => {
    const loadPageData = async () => {
      if (!taskId) {
        setError('Invalid task ID');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        
        // Load task, members, and boards in parallel
        const [taskData, membersData, boardsData] = await Promise.all([
          getTaskById(taskId),
          getMembers(),
          getBoards()
        ]);

        if (!taskData) {
          setError('Task not found');
          return;
        }

        setTask(taskData);
        setMembers(membersData);
        setBoards(boardsData);
      } catch (error) {
        console.error('Error loading task page data:', error);
        setError(`Failed to load task data: ${error.response?.status || error.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    loadPageData();
  }, [taskId]);

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
    availablePriorities,
    taskAttachments,
    getProjectIdentifier,
    handleTaskUpdate,
    handleAttachmentChange,
    handleImageRemoval,
    handleAttachmentDelete,
    saveImmediately
  } = taskDetailsHook;

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading task...</p>
        </div>
      </div>
    );
  }

  if (error || (!task && !isLoading)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Task Not Found</h1>
          <p className="text-gray-600 mb-4">{error || 'The requested task could not be found.'}</p>
          <button
            onClick={handleBack}
            className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors"
          >
            Back to Board
          </button>
        </div>
      </div>
    );
  }

  // Don't render the full page until we have actual task data
  if (!task) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading task...</p>
        </div>
      </div>
    );
  }

  const assignedMember = members.find(m => m.id === editedTask.memberId);
  const requesterMember = members.find(m => m.id === editedTask.requesterId);
  const priority = availablePriorities.find(p => p.id === editedTask.priorityId);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleBack}
                className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 mr-1" />
                Back to Board
              </button>
              <div className="h-6 border-l border-gray-300"></div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">{editedTask.title}</h1>
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
                  Unsaved changes
                </span>
              )}
              {isSaving && (
                <span className="text-sm text-blue-600 flex items-center">
                  <Save className="h-4 w-4 mr-1 animate-spin" />
                  Saving...
                </span>
              )}
              {lastSaved && !hasChanges && !isSaving && (
                <span className="text-sm text-green-600">
                  Saved {lastSaved.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Title */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Task Title</label>
              <input
                type="text"
                value={editedTask.title}
                onChange={(e) => handleTaskUpdate({ title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg font-medium"
                placeholder="Enter task title..."
              />
            </div>

            {/* Description */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <label className="block text-sm font-medium text-gray-700 mb-4">Description</label>
              <TextEditor
                initialContent={editedTask.description || ''}
                onChange={(content) => handleTaskUpdate({ description: content })}
                onAttachmentChange={handleAttachmentChange}
                onImageRemovalNeeded={handleImageRemoval}
                existingAttachments={taskAttachments}
                placeholder="Enter task description..."
                compact={false}
                resizable={true}
                className="min-h-[300px]"
                allowImagePaste={true}
                allowImageDelete={true}
                allowImageResize={true}
                toolbarOptions={{
                  bold: true,
                  italic: true,
                  underline: true,
                  link: true,
                  lists: true,
                  alignment: true,
                  attachments: true
                }}
              />
            </div>

            {/* Attachments */}
            {taskAttachments.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-sm font-medium text-gray-700 mb-4 flex items-center">
                  <Paperclip className="h-4 w-4 mr-2" />
                  Attachments ({taskAttachments.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {taskAttachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center p-3 border border-gray-200 rounded-md">
                      <Paperclip className="h-4 w-4 text-gray-400 mr-3 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{attachment.name}</p>
                        <p className="text-xs text-gray-500">
                          {attachment.size ? `${Math.round(attachment.size / 1024)} KB` : 'Unknown size'}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          View
                        </a>
                        <button
                          onClick={() => handleAttachmentDelete(attachment)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Metadata */}
          <div className="space-y-6">
            
            {/* Assignment */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-sm font-medium text-gray-700 mb-4 flex items-center">
                <User className="h-4 w-4 mr-2" />
                Assignment
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Assigned To</label>
                  <select
                    value={editedTask.memberId}
                    onChange={(e) => handleTaskUpdate({ memberId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Requested By</label>
                  <select
                    value={editedTask.requesterId}
                    onChange={(e) => handleTaskUpdate({ requesterId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Priority & Dates */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-sm font-medium text-gray-700 mb-4 flex items-center">
                <Calendar className="h-4 w-4 mr-2" />
                Schedule & Priority
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                  <select
                    value={editedTask.priorityId || ''}
                    onChange={(e) => handleTaskUpdate({ priorityId: e.target.value || null })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">No Priority</option>
                    {availablePriorities.map((priority) => (
                      <option key={priority.id} value={priority.id}>
                        {priority.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={editedTask.startDate || ''}
                    onChange={(e) => handleTaskUpdate({ startDate: e.target.value || null })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={editedTask.dueDate || ''}
                    onChange={(e) => handleTaskUpdate({ dueDate: e.target.value || null })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Effort (hours)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={editedTask.effort || ''}
                    onChange={(e) => handleTaskUpdate({ effort: e.target.value ? parseFloat(e.target.value) : null })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.0"
                  />
                </div>
              </div>
            </div>

            {/* Tags */}
            {availableTags.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-sm font-medium text-gray-700 mb-4 flex items-center">
                  <Tag className="h-4 w-4 mr-2" />
                  Tags
                </h3>
                <div className="space-y-2">
                  {taskTags.map((tag) => (
                    <div
                      key={tag.id}
                      className="inline-block px-2 py-1 rounded-full text-xs font-medium mr-2 mb-2"
                      style={{
                        backgroundColor: tag.color || '#6b7280',
                        color: 'white'
                      }}
                    >
                      {tag.name}
                    </div>
                  ))}
                  {taskTags.length === 0 && (
                    <p className="text-sm text-gray-500">No tags assigned</p>
                  )}
                </div>
              </div>
            )}

            {/* Task Info */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-sm font-medium text-gray-700 mb-4">Task Information</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Task ID:</span>
                  <span className="font-mono text-gray-900">{taskId}</span>
                </div>
                {getProjectIdentifier() && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Project:</span>
                    <span className="font-mono text-gray-900">{getProjectIdentifier()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className="capitalize text-gray-900">{editedTask.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Created:</span>
                  <span className="text-gray-900">
                    {new Date(editedTask.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {editedTask.updatedAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Updated:</span>
                    <span className="text-gray-900">
                      {new Date(editedTask.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
