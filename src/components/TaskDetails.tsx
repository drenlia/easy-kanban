import { useState, useEffect, useRef } from 'react';
import { Task, TeamMember } from '../types';
import { X, Paperclip } from 'lucide-react';
import CommentEditor from './CommentEditor';

interface TaskDetailsProps {
  task: Task;
  members: TeamMember[];
  onClose: () => void;
  onUpdate: (updatedTask: Task) => void;
}

export default function TaskDetails({ task, members, onClose, onUpdate }: TaskDetailsProps) {
  const [width, setWidth] = useState(480);
  const [isResizing, setIsResizing] = useState(false);
  const [editedTask, setEditedTask] = useState(task);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

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

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditedTask(prev => ({ ...prev, title: e.target.value }));
    onUpdate({ ...editedTask, title: e.target.value });
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedTask(prev => ({ ...prev, description: e.target.value }));
    onUpdate({ ...editedTask, description: e.target.value });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Store the date directly without timezone conversion
    const newDate = e.target.value;
    setEditedTask(prev => ({ ...prev, startDate: newDate }));
    onUpdate({ ...editedTask, startDate: newDate });
  };

  const handleEffortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const effort = parseInt(e.target.value) || 0;
    setEditedTask(prev => ({ ...prev, effort }));
    onUpdate({ ...editedTask, effort });
  };

  const handlePriorityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setEditedTask(prev => ({ ...prev, priority: e.target.value as Task['priority'] }));
    onUpdate({ ...editedTask, priority: e.target.value as Task['priority'] });
  };

  const handleRequesterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setEditedTask(prev => ({ ...prev, requesterId: e.target.value }));
    onUpdate({ ...editedTask, requesterId: e.target.value });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newAttachments = Array.from(files).map(file => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type,
        url: URL.createObjectURL(file)
      }));
      
      setEditedTask(prev => ({
        ...prev,
        attachments: [...(prev.attachments || []), ...newAttachments]
      }));
      
      onUpdate({
        ...editedTask,
        attachments: [...(editedTask.attachments || []), ...newAttachments]
      });
    }
  };

  const handleAddComment = (content: string, attachments: File[]) => {
    const newAttachments = attachments.map(file => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: file.type,
      url: URL.createObjectURL(file)
    }));

    const newComment = {
      id: crypto.randomUUID(),
      text: content,
      authorId: editedTask.memberId,
      createdAt: new Date().toISOString(),
      attachments: newAttachments
    };

    const updatedTask = {
      ...editedTask,
      comments: [...(editedTask.comments || []), newComment]
    };

    setEditedTask(updatedTask);
    onUpdate(updatedTask);
  };

  const sortedComments = [...(editedTask.comments || [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div 
      className="fixed top-0 right-0 h-full bg-white border-l border-gray-200 flex" 
      style={{ width: `${width}px` }}
    >
      <div
        ref={resizeRef}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500/20 group"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute inset-y-0 left-0 w-4 -translate-x-2" />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="text-sm text-gray-500 mb-1">Task #{task.id}</div>
            <input
              type="text"
              value={editedTask.title}
              onChange={handleTitleChange}
              className="text-xl font-semibold w-full border-none focus:outline-none focus:ring-0"
            />
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              value={editedTask.description}
              onChange={handleDescriptionChange}
              rows={4}
              className="w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={editedTask.startDate}
                  onChange={handleDateChange}
                  className="w-full border rounded-md p-1.5 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={editedTask.priority}
                  onChange={handlePriorityChange}
                  className="w-full border rounded-md p-1.5 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Effort (hours)</label>
                <input
                  type="number"
                  value={editedTask.effort}
                  onChange={handleEffortChange}
                  min="0"
                  className="w-full border rounded-md p-1.5 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Requester</label>
                <select
                  value={editedTask.requesterId}
                  onChange={handleRequesterChange}
                  className="w-full border rounded-md p-1.5 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  {members.map(member => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Attachments</label>
            <div className="space-y-2">
              {editedTask.attachments?.map((attachment) => (
                <div key={attachment.id} className="flex items-center space-x-2 text-sm">
                  <Paperclip size={16} className="text-gray-500" />
                  <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                    {attachment.name}
                  </a>
                </div>
              ))}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                multiple
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-800"
              >
                <Paperclip size={16} />
                <span>Add attachment</span>
              </button>
            </div>
          </div>

          <CommentEditor onSubmit={handleAddComment} />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Comments</label>
            <div className="space-y-4">
              {sortedComments.map((comment) => (
                <div key={comment.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-medium">
                        {members.find(m => m.id === comment.authorId)?.name}
                      </span>
                      <span className="text-sm text-gray-500 ml-2">
                        {new Date(comment.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="prose prose-sm" dangerouslySetInnerHTML={{ __html: comment.text }} />
                  {comment.attachments?.length > 0 && (
                    <div className="mt-2 pt-2 border-t">
                      <div className="text-sm text-gray-500 mb-1">Attachments:</div>
                      <div className="space-y-1">
                        {comment.attachments.map((attachment) => (
                          <div key={attachment.id} className="flex items-center space-x-2 text-sm">
                            <Paperclip size={14} className="text-gray-500" />
                            <a
                              href={attachment.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-700"
                            >
                              {attachment.name}
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}